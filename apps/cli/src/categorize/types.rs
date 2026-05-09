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
    #[serde(default)]
    pub(crate) routed_to_others: bool,
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

impl JsonSummary {
    pub(super) fn from_summary(summary: &Summary) -> Self {
        Self {
            scanned: summary.scanned,
            image_candidates: summary.image_candidates,
            moves: summary.moved,
            routed_to_others: summary.routed_to_others,
            low_confidence_skipped: summary.low_confidence_skipped,
            already_categorized: summary.already_categorized,
            failed: summary.failed,
        }
    }
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

impl JsonOutput {
    pub(super) fn from_summary(
        dry_run: bool,
        summary: &Summary,
        moves: Vec<MoveEntry>,
        skipped: Vec<SkippedEntry>,
        already_categorized: Vec<AlreadyCategorizedEntry>,
        failed: Vec<FailedEntry>,
    ) -> Self {
        Self {
            dry_run,
            moves,
            skipped,
            already_categorized,
            failed,
            summary: JsonSummary::from_summary(summary),
        }
    }
}

#[derive(Debug, Serialize, Deserialize)]
pub(super) struct OperationOutput {
    pub(super) moves: Vec<MoveEntry>,
}
