use std::{
    fs,
    path::{Path, PathBuf},
};

use anyhow::{Context, Result, bail};
use serde::Deserialize;

mod discovery;
mod validation;

use discovery::resolve_model_dir;
use validation::assert_not_git_lfs_pointer;

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

fn print_artifact_line(path: &Path) -> Result<()> {
    let size = fs::metadata(path)
        .with_context(|| format!("read model artifact metadata {}", path.display()))?
        .len();

    println!("artifact: {} ({} bytes)", path.display(), size);
    Ok(())
}

#[cfg(test)]
mod tests;
