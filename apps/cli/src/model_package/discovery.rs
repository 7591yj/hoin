use std::{
    env, fs,
    path::{Path, PathBuf},
};

use anyhow::{Context, Result, bail};

use super::{MODEL_ENV, MODEL_MANIFEST};

pub(super) fn resolve_model_dir(requested_dir: Option<&Path>) -> Result<PathBuf> {
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
