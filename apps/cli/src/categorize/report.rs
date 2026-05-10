use std::path::PathBuf;

use super::types::{
    AlreadyCategorizedEntry, FailedEntry, JsonOutput, MoveEntry, SkippedEntry, Summary,
};

#[derive(Default)]
pub(super) struct CategorizeReport {
    pub(super) summary: Summary,
    moves: Vec<MoveEntry>,
    pub(super) skipped: Vec<SkippedEntry>,
    pub(super) already_categorized: Vec<AlreadyCategorizedEntry>,
    failed: Vec<FailedEntry>,
}

impl CategorizeReport {
    pub(super) fn for_scanned_files(scanned: usize) -> Self {
        Self {
            summary: Summary {
                scanned,
                image_candidates: scanned,
                ..Summary::default()
            },
            ..Self::default()
        }
    }

    pub(super) fn into_json(self, dry_run: bool) -> JsonOutput {
        JsonOutput::from_summary(
            dry_run,
            &self.summary,
            self.moves,
            self.skipped,
            self.already_categorized,
            self.failed,
        )
    }

    pub(super) fn record_move(&mut self, json: bool, dry_run: bool, entry: MoveEntry) {
        if entry.routed_to_others {
            self.summary.routed_to_others += 1;
        }
        self.summary.moved += 1;

        if json {
            self.moves.push(entry);
        } else {
            println!(
                "{}: {} -> {} ({}, confidence {:.3})",
                if dry_run { "plan" } else { "moved" },
                entry.from.display(),
                entry.to.display(),
                entry.class_key,
                entry.confidence
            );
        }
    }

    pub(super) fn record_failed(&mut self, json: bool, file: PathBuf, reason: String) {
        self.summary.failed += 1;
        if json {
            self.failed.push(FailedEntry { file, reason });
        } else {
            println!("warn: failed to process {}: {}", file.display(), reason);
        }
    }
}
