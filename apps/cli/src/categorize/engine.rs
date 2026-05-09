use std::{
    cell::Cell,
    path::{Path, PathBuf},
};

use super::{
    fs_ops::move_file,
    progress::ProgressOnDrop,
    report::CategorizeReport,
    types::{AlreadyCategorizedEntry, MoveEntry, SkippedEntry},
};
use crate::{cli::CategorizeArgs, model::ModelRuntime};
use metadata_schema::routing::{RoutingPreferences, route_relative_destination};

pub(super) fn run_categorize_plan(
    files: Vec<PathBuf>,
    root: &Path,
    runtime: &mut ModelRuntime,
    routing_preferences: RoutingPreferences,
    args: &CategorizeArgs,
) -> CategorizeReport {
    let completed = Cell::new(0);
    let total = files.len();
    let mut report = CategorizeReport::for_scanned_files(total);

    for source in files {
        let _progress = ProgressOnDrop {
            enabled: args.progress_json,
            completed: &completed,
            total,
            file: source.clone(),
        };
        process_file(
            source,
            root,
            runtime,
            routing_preferences,
            args,
            &mut report,
        );
    }

    report
}

fn process_file(
    source: PathBuf,
    root: &Path,
    runtime: &mut ModelRuntime,
    routing_preferences: RoutingPreferences,
    args: &CategorizeArgs,
    report: &mut CategorizeReport,
) {
    let classification = match runtime.classify_path(&source) {
        Ok(classification) => classification,
        Err(error) => {
            report.record_failed(args.json, source, format!("{error:#}"));
            return;
        }
    };

    if classification.confidence < args.min_confidence {
        report.summary.low_confidence_skipped += 1;
        if args.json {
            report.skipped.push(SkippedEntry {
                file: source,
                reason: "low_confidence".to_string(),
                confidence: Some(classification.confidence),
            });
        } else {
            println!(
                "warn: skipped {} due to low confidence {:.3} (< {:.3})",
                source.display(),
                classification.confidence,
                args.min_confidence
            );
        }
        return;
    }

    let Some(file_name) = source.file_name() else {
        report.record_failed(args.json, source, "missing file name".to_string());
        return;
    };

    let relative_destination = match route_relative_destination(
        runtime.model_name(),
        &classification.class_key,
        file_name,
        routing_preferences,
    ) {
        Ok(path) => path,
        Err(error) => {
            report.record_failed(args.json, source, error.to_string());
            return;
        }
    };

    let destination = root.join(&relative_destination);
    if source == destination {
        report.summary.already_categorized += 1;
        if args.json {
            report
                .already_categorized
                .push(AlreadyCategorizedEntry { file: source });
        } else {
            println!("ok: already categorized {}", source.display());
        }
        return;
    }

    let final_destination = resolve_collision(&destination);
    let routed_to_others = relative_destination
        .components()
        .any(|component| component.as_os_str() == "Others");

    if !args.dry_run
        && let Err(error) = move_file(&source, &final_destination)
    {
        report.record_failed(
            args.json,
            source,
            format!(
                "failed to move to {}: {error:#}",
                final_destination.display()
            ),
        );
        return;
    }

    report.record_move(
        args.json,
        args.dry_run,
        MoveEntry {
            from: source,
            to: final_destination,
            class_key: classification.class_key,
            confidence: classification.confidence,
            routed_to_others,
        },
    );
}

pub(super) fn resolve_collision(destination: &Path) -> PathBuf {
    // move_file() uses exclusive destination creation; concurrent races are considered move failures.
    if !destination.exists() {
        return destination.to_path_buf();
    }

    let parent = destination.parent().unwrap_or_else(|| Path::new("."));
    let stem = destination
        .file_stem()
        .and_then(|stem| stem.to_str())
        .unwrap_or("file");
    let extension = destination
        .extension()
        .and_then(|extension| extension.to_str());

    for suffix in 1.. {
        let candidate_name = match extension {
            Some(extension) => format!("{stem}-{suffix}.{extension}"),
            None => format!("{stem}-{suffix}"),
        };
        let candidate = parent.join(candidate_name);
        if !candidate.exists() {
            return candidate;
        }
    }

    unreachable!("collision resolver should always find a free path");
}
