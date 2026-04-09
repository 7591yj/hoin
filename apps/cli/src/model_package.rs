use std::{
    env, fs,
    io::Read,
    path::{Path, PathBuf},
};

use anyhow::{Context, Result, bail};
use serde::Deserialize;

const MODEL_ENV: &str = "HOIN_MODEL_DIR";
const MODEL_MANIFEST: &str = "hoin-model.json";

#[derive(Debug, Clone)]
pub(crate) struct ModelPackage {
    pub(crate) name: String,
    pub(crate) root: PathBuf,
    pub(crate) onnx_path: PathBuf,
    pub(crate) onnx_data_path: Option<PathBuf>,
}

#[derive(Debug, Deserialize)]
struct ModelManifest {
    name: String,
    onnx: Option<PathBuf>,
    onnx_data: Option<PathBuf>,
}

impl ModelPackage {
    pub(crate) fn load(requested_dir: Option<&Path>) -> Result<Self> {
        let root = resolve_model_dir(requested_dir)?;
        let package = if root.join(MODEL_MANIFEST).is_file() {
            Self::from_manifest(&root)?
        } else {
            Self::from_directory_contract(&root)?
        };

        if !package.onnx_path.is_file() {
            bail!(
                "model '{}' is missing ONNX artifact at {}",
                package.name,
                package.onnx_path.display()
            );
        }

        assert_not_git_lfs_pointer(&package.onnx_path, &package.name)?;

        if let Some(path) = package.onnx_data_path.as_ref() {
            if !path.is_file() {
                bail!(
                    "model '{}' declares ONNX external data at {}, but the file is missing",
                    package.name,
                    path.display()
                );
            }
            assert_not_git_lfs_pointer(path, &package.name)?;
        }

        Ok(package)
    }

    fn from_manifest(root: &Path) -> Result<Self> {
        let manifest_path = root.join(MODEL_MANIFEST);
        let manifest: ModelManifest = serde_json::from_slice(
            &fs::read(&manifest_path)
                .with_context(|| format!("read model manifest {}", manifest_path.display()))?,
        )
        .with_context(|| format!("parse model manifest {}", manifest_path.display()))?;

        let onnx = manifest
            .onnx
            .unwrap_or_else(|| PathBuf::from(format!("{}.onnx", manifest.name)));
        let onnx_data = manifest.onnx_data;

        Ok(Self {
            onnx_path: root.join(onnx),
            onnx_data_path: onnx_data.map(|path| root.join(path)),
            name: manifest.name,
            root: root.to_path_buf(),
        })
    }

    fn from_directory_contract(root: &Path) -> Result<Self> {
        let name = root
            .file_name()
            .and_then(|name| name.to_str())
            .context("model directory name must be valid UTF-8")?
            .to_owned();

        let onnx_path = root.join(format!("{name}.onnx"));
        let onnx_data_path = root.join(format!("{name}.onnx.data"));

        Ok(Self {
            name,
            root: root.to_path_buf(),
            onnx_path,
            onnx_data_path: onnx_data_path.is_file().then_some(onnx_data_path),
        })
    }
}

pub(crate) fn print_model_info(requested_dir: Option<&Path>) -> Result<()> {
    let package = ModelPackage::load(requested_dir)?;

    println!("model: {}", package.name);
    println!("root: {}", package.root.display());
    print_artifact_line(&package.onnx_path)?;

    if let Some(path) = package.onnx_data_path.as_ref() {
        print_artifact_line(path)?;
    }

    Ok(())
}

fn resolve_model_dir(requested_dir: Option<&Path>) -> Result<PathBuf> {
    if let Some(path) = requested_dir {
        return canonicalize_model_dir(path);
    }

    if let Some(path) = env::var_os(MODEL_ENV).filter(|value| !value.is_empty()) {
        return canonicalize_model_dir(Path::new(&path));
    }

    discover_single_local_model()
}

fn canonicalize_model_dir(path: &Path) -> Result<PathBuf> {
    path.canonicalize()
        .with_context(|| format!("resolve model directory {}", path.display()))
}

fn discover_single_local_model() -> Result<PathBuf> {
    let models_dir = PathBuf::from("models");

    if !models_dir.is_dir() {
        bail!("no model directory selected; pass --model-dir <DIR> or set {MODEL_ENV}");
    }

    let mut candidates = Vec::new();
    for entry in fs::read_dir(&models_dir)
        .with_context(|| format!("read local models directory {}", models_dir.display()))?
    {
        let entry = entry.with_context(|| format!("read entry in {}", models_dir.display()))?;
        let path = entry.path();
        if !path.is_dir() {
            continue;
        }

        let Some(name) = path.file_name().and_then(|name| name.to_str()) else {
            continue;
        };

        if path.join(MODEL_MANIFEST).is_file() || path.join(format!("{name}.onnx")).is_file() {
            candidates.push(path);
        }
    }

    match candidates.len() {
        0 => bail!(
            "no model packages found under {}; pass --model-dir <DIR> or set {MODEL_ENV}",
            models_dir.display()
        ),
        1 => candidates
            .pop()
            .expect("single local model candidate should be present")
            .canonicalize()
            .context("resolve discovered model directory"),
        _ => bail!(
            "multiple model packages found under {}; pass --model-dir <DIR> or set {MODEL_ENV}",
            models_dir.display()
        ),
    }
}

fn assert_not_git_lfs_pointer(path: &Path, model_name: &str) -> Result<()> {
    let mut file = fs::File::open(path)
        .with_context(|| format!("read model '{model_name}' artifact {}", path.display()))?;
    let mut bytes = [0_u8; 42];
    let bytes_read = file
        .read(&mut bytes)
        .with_context(|| format!("read model '{model_name}' artifact {}", path.display()))?;

    if bytes[..bytes_read].starts_with(b"version https://git-lfs.github.com/spec/") {
        bail!(
            "model '{model_name}' artifact at {} is a Git LFS pointer; fetch the real model artifact before running hoin",
            path.display()
        );
    }

    Ok(())
}

fn print_artifact_line(path: &Path) -> Result<()> {
    let size = fs::metadata(path)
        .with_context(|| format!("read model artifact metadata {}", path.display()))?
        .len();

    println!("artifact: {} ({} bytes)", path.display(), size);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn loads_directory_contract_model() {
        let temp = tempfile::tempdir().unwrap();
        let model_dir = temp.path().join("example");
        fs::create_dir_all(&model_dir).unwrap();
        fs::write(model_dir.join("example.onnx"), b"onnx").unwrap();

        let package = ModelPackage::load(Some(&model_dir)).unwrap();
        let model_dir = model_dir.canonicalize().unwrap();

        assert_eq!(package.name, "example");
        assert_eq!(package.onnx_path, model_dir.join("example.onnx"));
        assert_eq!(package.onnx_data_path, None);
    }

    #[test]
    fn loads_manifest_model() {
        let temp = tempfile::tempdir().unwrap();
        let model_dir = temp.path().join("renamed");
        fs::create_dir_all(&model_dir).unwrap();
        fs::write(
            model_dir.join(MODEL_MANIFEST),
            r#"{"name":"example","onnx":"artifacts/model.onnx","onnx_data":"artifacts/model.onnx.data"}"#,
        )
        .unwrap();
        fs::create_dir_all(model_dir.join("artifacts")).unwrap();
        fs::write(model_dir.join("artifacts/model.onnx"), b"onnx").unwrap();
        fs::write(model_dir.join("artifacts/model.onnx.data"), b"data").unwrap();

        let package = ModelPackage::load(Some(&model_dir)).unwrap();
        let model_dir = model_dir.canonicalize().unwrap();

        assert_eq!(package.name, "example");
        assert_eq!(package.onnx_path, model_dir.join("artifacts/model.onnx"));
        assert_eq!(
            package.onnx_data_path,
            Some(model_dir.join("artifacts/model.onnx.data"))
        );
    }
}
