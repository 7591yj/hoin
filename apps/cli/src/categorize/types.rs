use std::path::PathBuf;

use serde::{Deserialize, Serialize};

#[derive(Debug, Default)]
pub(super) struct Summary {
    pub(super) scanned: usize,
    pub(super) image_candidates: usize,
    pub(super) moved: usize,
    pub(super) routed_to_others: usize,
    pub(super) low_confidence_skipped: usize,
    pub(super) already_categorized: usize,
    pub(super) failed: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub(crate) struct MoveEntry {
    pub(crate) from: PathBuf,
    pub(crate) to: PathBuf,
    pub(crate) class_key: String,
    pub(crate) confidence: f32,
}

#[derive(Debug, Serialize, Deserialize)]
pub(super) struct SkippedEntry {
    pub(super) file: PathBuf,
    pub(super) reason: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(super) confidence: Option<f32>,
}

#[derive(Debug, Serialize, Deserialize)]
pub(super) struct AlreadyCategorizedEntry {
    pub(super) file: PathBuf,
}

#[derive(Debug, Serialize, Deserialize)]
pub(super) struct FailedEntry {
    pub(super) file: PathBuf,
    pub(super) reason: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub(super) struct JsonSummary {
    pub(super) scanned: usize,
    pub(super) image_candidates: usize,
    pub(super) moves: usize,
    pub(super) routed_to_others: usize,
    pub(super) low_confidence_skipped: usize,
    pub(super) already_categorized: usize,
    pub(super) failed: usize,
}

#[derive(Debug, Serialize, Deserialize)]
pub(super) struct JsonOutput {
    pub(super) dry_run: bool,
    pub(super) moves: Vec<MoveEntry>,
    pub(super) skipped: Vec<SkippedEntry>,
    pub(super) already_categorized: Vec<AlreadyCategorizedEntry>,
    pub(super) failed: Vec<FailedEntry>,
    pub(super) summary: JsonSummary,
}

#[derive(Debug, Serialize, Deserialize)]
pub(super) struct OperationOutput {
    pub(super) moves: Vec<MoveEntry>,
}
