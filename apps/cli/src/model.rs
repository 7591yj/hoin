use std::{cmp::Ordering, io::Cursor};

use anyhow::{Context, Result, bail};
use image::{DynamicImage, imageops::FilterType};
use ort::{session::Session, value::TensorRef};

use crate::embedded_model::EMBEDDED_MODEL;

const IMAGE_SIZE: u32 = 224;
const IMAGE_NET_MEAN: [f32; 3] = [0.485, 0.456, 0.406];
const IMAGE_NET_STD: [f32; 3] = [0.229, 0.224, 0.225];

#[derive(Debug, Clone)]
pub(crate) struct Classification {
    pub(crate) class_key: String,
    pub(crate) confidence: f32,
}

pub(crate) struct ModelRuntime {
    model_name: String,
    class_map: Vec<String>,
    session: Session,
}

impl ModelRuntime {
    pub(crate) fn load() -> Result<Self> {
        let Some(model) = EMBEDDED_MODEL.as_ref() else {
            bail!("no embedded model was compiled into this executable");
        };

        let class_map_file = model
            .class_map
            .as_ref()
            .context("embedded model is missing class_map.json")?;
        let class_map = parse_class_map(class_map_file.bytes)?;
        let session = Session::builder()
            .context("create ONNX runtime session builder")?
            .commit_from_memory(model.onnx.bytes)
            .context("load embedded ONNX model into ONNX runtime")?;

        Ok(Self {
            model_name: model.name.to_owned(),
            class_map,
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
            .run(ort::inputs![TensorRef::from_array_view(([1usize, 3, 224, 224], &*input))?])
            .with_context(|| format!("run ONNX inference for {}", path.display()))?;

        let logits = extract_logits(&outputs)?;
        let probabilities = softmax(&logits);
        let (top_index, confidence) = probabilities
            .iter()
            .copied()
            .enumerate()
            .max_by(|(_, left), (_, right)| {
                left.partial_cmp(right).unwrap_or(Ordering::Equal)
            })
            .context("model produced no class probabilities")?;
        let class_key = self
            .class_map
            .get(top_index)
            .cloned()
            .with_context(|| format!("predicted class index {top_index} missing from class map"))?;

        Ok(Classification {
            class_key,
            confidence,
        })
    }
}

fn parse_class_map(bytes: &[u8]) -> Result<Vec<String>> {
    let unordered: std::collections::HashMap<String, String> =
        serde_json::from_reader(Cursor::new(bytes)).context("parse embedded class_map.json")?;
    let mut indexed = Vec::with_capacity(unordered.len());

    for (key, value) in unordered {
        let index = key
            .parse::<usize>()
            .with_context(|| format!("class map key '{key}' is not a valid usize"))?;
        indexed.push((index, value));
    }

    indexed.sort_by_key(|(index, _)| *index);

    let mut class_map = Vec::with_capacity(indexed.len());

    for (index, value) in indexed {

        if index != class_map.len() {
            bail!(
                "class map must contain consecutive zero-based indexes, expected {}, got {}",
                class_map.len(),
                index
            );
        }

        class_map.push(value);
    }

    Ok(class_map)
}

fn preprocess_image(image: &DynamicImage) -> Vec<f32> {
    let resized = image
        .resize_exact(IMAGE_SIZE, IMAGE_SIZE, FilterType::Triangle)
        .to_rgb8();
    let mut input = vec![0.0_f32; (1 * 3 * IMAGE_SIZE * IMAGE_SIZE) as usize];

    for (x, y, pixel) in resized.enumerate_pixels() {
        let [r, g, b] = pixel.0;
        let offset = (y * IMAGE_SIZE + x) as usize;

        input[offset] = normalize_channel(r, 0);
        input[(IMAGE_SIZE * IMAGE_SIZE) as usize + offset] = normalize_channel(g, 1);
        input[(2 * IMAGE_SIZE * IMAGE_SIZE) as usize + offset] = normalize_channel(b, 2);
    }

    input
}

fn normalize_channel(value: u8, channel: usize) -> f32 {
    let scaled = f32::from(value) / 255.0;
    (scaled - IMAGE_NET_MEAN[channel]) / IMAGE_NET_STD[channel]
}

fn extract_logits(outputs: &ort::session::SessionOutputs<'_>) -> Result<Vec<f32>> {
    let (_, logits) = outputs[0]
        .try_extract_tensor::<f32>()
        .context("extract logits tensor from ONNX output")?;
    Ok(logits.to_vec())
}

fn softmax(logits: &[f32]) -> Vec<f32> {
    let max_logit = logits.iter().copied().fold(f32::NEG_INFINITY, f32::max);
    let mut exps = Vec::with_capacity(logits.len());
    let mut sum = 0.0_f32;

    for logit in logits {
        let value = (logit - max_logit).exp();
        exps.push(value);
        sum += value;
    }

    if sum == 0.0 {
        return vec![0.0; logits.len()];
    }

    exps.into_iter().map(|value| value / sum).collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_consecutive_class_map() {
        let class_map = parse_class_map(br#"{"0":"a","1":"b"}"#).unwrap();
        assert_eq!(class_map, vec!["a".to_string(), "b".to_string()]);
    }

    #[test]
    fn rejects_non_consecutive_class_map() {
        let error = parse_class_map(br#"{"1":"b"}"#).unwrap_err();
        assert!(error
            .to_string()
            .contains("class map must contain consecutive zero-based indexes"));
    }

    #[test]
    fn softmax_returns_probabilities() {
        let probabilities = softmax(&[1.0, 2.0, 3.0]);
        let total: f32 = probabilities.iter().sum();

        assert!((total - 1.0).abs() < 1e-6);
        assert!(probabilities[2] > probabilities[1]);
        assert!(probabilities[1] > probabilities[0]);
    }
}
