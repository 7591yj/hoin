use std::cmp::Ordering;

use anyhow::{Context, Result};

pub(super) fn top_probability(logits: &[f32]) -> Result<(usize, f32)> {
    let probabilities = softmax(logits);
    probabilities
        .iter()
        .copied()
        .enumerate()
        .max_by(|(_, left), (_, right)| left.partial_cmp(right).unwrap_or(Ordering::Equal))
        .context("model produced no class probabilities")
}

pub(super) fn extract_logits(outputs: &ort::session::SessionOutputs<'_>) -> Result<Vec<f32>> {
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
    fn softmax_returns_probabilities() {
        let probabilities = softmax(&[1.0, 2.0, 3.0]);
        let total: f32 = probabilities.iter().sum();

        assert!((total - 1.0).abs() < 1e-6);
        assert!(probabilities[2] > probabilities[1]);
        assert!(probabilities[1] > probabilities[0]);
    }
}
