use std::{cell::Cell, path::PathBuf};

use serde::Serialize;

#[derive(Debug, Serialize)]
struct ProgressEvent {
    event: &'static str,
    completed: usize,
    total: usize,
    file: PathBuf,
}

pub(super) struct ProgressOnDrop<'a> {
    pub(super) enabled: bool,
    pub(super) completed: &'a Cell<usize>,
    pub(super) total: usize,
    pub(super) file: PathBuf,
}

impl Drop for ProgressOnDrop<'_> {
    fn drop(&mut self) {
        if !self.enabled {
            return;
        }

        let completed = self.completed.get() + 1;
        self.completed.set(completed);
        let event = ProgressEvent {
            event: "file_done",
            completed,
            total: self.total,
            file: self.file.clone(),
        };
        if let Ok(line) = serde_json::to_string(&event) {
            eprintln!("{line}");
        }
    }
}
