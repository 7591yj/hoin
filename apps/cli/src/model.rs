mod inference;
mod preprocess;

use anyhow::{Context, Result};
use metadata_schema::routing::class_key_for_output_index;
use ort::{session::Session, value::TensorRef};

use crate::model::inference::{extract_logits, top_probability};
use crate::model::preprocess::{IMAGE_SIZE, preprocess_image};
use crate::model_package::ModelPackage;

#[derive(Debug, Clone)]
pub(crate) struct Classification {
    pub(crate) class_key: String,
    pub(crate) confidence: f32,
}

pub(crate) struct ModelRuntime {
    model_name: String,
    session: Session,
}

impl ModelRuntime {
    pub(crate) fn load(model_dir: Option<&std::path::Path>) -> Result<Self> {
        let model = ModelPackage::load(model_dir)?;

        let session = Session::builder()
            .context("create ONNX runtime session builder")?
            .commit_from_file(&model.onnx_path)
            .with_context(|| format!("load ONNX model {}", model.onnx_path.display()))?;

        Ok(Self {
            model_name: model.name,
            session,
        })
    }

    pub(crate) fn model_name(&self) -> &str {
        &self.model_name
    }

    pub(crate) fn classify_path(&mut self, path: &std::path::Path) -> Result<Classification> {
        let image = image::load_from_memory(
            &std::fs::read(path).with_context(|| format!("read image {}", path.display()))?,
        )
        .with_context(|| format!("decode image {}", path.display()))?;
        let input = preprocess_image(&image);

        let outputs = self
            .session
            .run(ort::inputs![TensorRef::from_array_view((
                [1usize, 3, IMAGE_SIZE as usize, IMAGE_SIZE as usize],
                &*input
            ))?])
            .with_context(|| format!("run ONNX inference for {}", path.display()))?;

        let logits = extract_logits(&outputs)?;
        let (top_index, confidence) = top_probability(&logits)?;
        let class_key = class_key_for_output_index(&self.model_name, top_index)
            .map(str::to_owned)
            .with_context(|| {
                format!(
                    "predicted class index {top_index} is not registered for model '{}'",
                    self.model_name
                )
            })?;

        Ok(Classification {
            class_key,
            confidence,
        })
    }
}
