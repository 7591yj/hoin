use std::{
    path::{Path, PathBuf},
    process::Command,
};

use anyhow::{Context, Result, bail};
use serde::Deserialize;

use crate::embedded_model::EMBEDDED_MODEL;

#[derive(Debug, Clone)]
pub(crate) struct Classification {
    pub(crate) class_key: String,
    pub(crate) confidence: f32,
}

pub(crate) struct ModelRuntime {
    model_name: String,
    python: PathBuf,
    model_dir: PathBuf,
}

#[derive(Debug, Deserialize)]
struct PythonPrediction {
    class_key: String,
    confidence: f32,
}

impl ModelRuntime {
    pub(crate) fn load() -> Result<Self> {
        let Some(model) = EMBEDDED_MODEL.as_ref() else {
            bail!("no embedded model was compiled into this executable");
        };

        let model_dir = model_dir_path(model.name)
            .canonicalize()
            .context("resolve embedded model directory")?;
        let python = model_dir.join(".venv/bin/python");

        if !python.is_file() {
            bail!("expected model Python runtime at {}", python.display());
        }

        Ok(Self {
            model_name: model.name.to_owned(),
            python,
            model_dir,
        })
    }

    pub(crate) fn model_name(&self) -> &str {
        &self.model_name
    }

    pub(crate) fn classify_path(&mut self, path: &Path) -> Result<Classification> {
        let output = Command::new(&self.python)
            .arg("-c")
            .arg(PYTHON_CLASSIFIER)
            .arg(path)
            .current_dir(&self.model_dir)
            .output()
            .with_context(|| format!("run classifier for {}", path.display()))?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            bail!(
                "classifier failed for {}: {}",
                path.display(),
                stderr.trim()
            );
        }

        let stdout =
            String::from_utf8(output.stdout).context("decode classifier stdout as UTF-8")?;
        let payload = stdout
            .lines()
            .rev()
            .find(|line| !line.trim().is_empty())
            .context("classifier stdout did not contain a JSON payload")?;
        let prediction: PythonPrediction =
            serde_json::from_str(payload).context("parse classifier JSON output")?;

        Ok(Classification {
            class_key: prediction.class_key,
            confidence: prediction.confidence,
        })
    }
}

fn model_dir_path(model_name: &str) -> PathBuf {
    PathBuf::from("models").join(model_name)
}

const PYTHON_CLASSIFIER: &str = r#"
import json
import sys
import main

path = sys.argv[1]
prediction = main.predict_for_cli(path)
print(json.dumps(prediction))
"#;

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn classifier_script_uses_generic_model_hook() {
        assert!(PYTHON_CLASSIFIER.contains("predict_for_cli"));
    }

    #[test]
    fn embedded_model_paths_are_model_agnostic() {
        let model_dir = model_dir_path("some-other-model");
        let python = model_dir.join(".venv/bin/python");

        assert_eq!(model_dir, PathBuf::from("models/some-other-model"));
        assert_eq!(
            python,
            PathBuf::from("models/some-other-model/.venv/bin/python")
        );
    }

    #[test]
    fn parses_generic_prediction_payload() {
        let prediction: PythonPrediction = serde_json::from_str(
            r#"{
                "class_key": "example",
                "confidence": 0.75
            }"#,
        )
        .unwrap();

        assert_eq!(prediction.class_key, "example");
        assert_eq!(prediction.confidence, 0.75);
    }
}
