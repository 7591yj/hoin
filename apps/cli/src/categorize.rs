use std::{
    cell::Cell,
    path::{Path, PathBuf},
};

use crate::{cli::CategorizeArgs, model::ModelRuntime};
use anyhow::{Context, Result, bail};
use metadata_schema::routing::{NameLocale, RoutingPreferences, route_relative_destination};
use serde::Serialize;

mod discovery;
mod fs_ops;
mod operations;
mod types;

pub(crate) use operations::{apply_plan, revert_operation};

use discovery::{discover_explicit_files, discover_files};
use fs_ops::move_file;
use types::{
    AlreadyCategorizedEntry, FailedEntry, JsonOutput, JsonSummary, MoveEntry, SkippedEntry, Summary,
};

#[derive(Debug, Serialize)]
struct ProgressEvent {
    event: &'static str,
    completed: usize,
    total: usize,
    file: PathBuf,
}

struct ProgressOnDrop<'a> {
    enabled: bool,
    completed: &'a Cell<usize>,
    total: usize,
    file: PathBuf,
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

pub(crate) fn categorize(args: CategorizeArgs) -> Result<()> {
    if !(0.0..=1.0).contains(&args.min_confidence) {
        bail!(
            "min confidence must be between 0.0 and 1.0, got {}",
            args.min_confidence
        );
    }

    let root = args
        .path
        .canonicalize()
        .with_context(|| format!("resolve root path {}", args.path.display()))?;
    let mut runtime = ModelRuntime::load(args.model_dir.as_deref())?;
    let files = if args.file.is_empty() {
        discover_files(&root)?
    } else {
        discover_explicit_files(&root, &args.file)?
    };
    let routing_preferences = RoutingPreferences {
        name_locale: if args.ja {
            NameLocale::Ja
        } else {
            NameLocale::En
        },
    };

    if files.is_empty() {
        if args.json {
            let output = JsonOutput {
                dry_run: args.dry_run,
                moves: vec![],
                skipped: vec![],
                already_categorized: vec![],
                failed: vec![],
                summary: JsonSummary {
                    scanned: 0,
                    image_candidates: 0,
                    moves: 0,
                    routed_to_others: 0,
                    low_confidence_skipped: 0,
                    already_categorized: 0,
                    failed: 0,
                },
            };
            println!("{}", serde_json::to_string(&output)?);
        } else {
            println!("No files found under {}", root.display());
        }
        if args.fail_on_empty {
            bail!("no image files found under {}", root.display());
        }
        return Ok(());
    }

    let mut summary = Summary {
        scanned: files.len(),
        image_candidates: files.len(),
        ..Summary::default()
    };

    let mut json_moves: Vec<MoveEntry> = vec![];
    let mut json_skipped: Vec<SkippedEntry> = vec![];
    let mut json_already_categorized: Vec<AlreadyCategorizedEntry> = vec![];
    let mut json_failed: Vec<FailedEntry> = vec![];

    let completed = Cell::new(0);
    let total = files.len();

    for source in files {
        let _progress = ProgressOnDrop {
            enabled: args.progress_json,
            completed: &completed,
            total,
            file: source.clone(),
        };

        match runtime.classify_path(&source) {
            Ok(classification) => {
                if classification.confidence < args.min_confidence {
                    summary.low_confidence_skipped += 1;
                    if args.json {
                        json_skipped.push(SkippedEntry {
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
                    continue;
                }

                let Some(file_name) = source.file_name() else {
                    summary.failed += 1;
                    if args.json {
                        json_failed.push(FailedEntry {
                            file: source,
                            reason: "missing file name".to_string(),
                        });
                    } else {
                        println!(
                            "warn: failed to process {}: missing file name",
                            source.display()
                        );
                    }
                    continue;
                };
                let relative_destination = match route_relative_destination(
                    runtime.model_name(),
                    &classification.class_key,
                    file_name,
                    routing_preferences,
                ) {
                    Ok(path) => path,
                    Err(error) => {
                        summary.failed += 1;
                        if args.json {
                            json_failed.push(FailedEntry {
                                file: source,
                                reason: error.to_string(),
                            });
                        } else {
                            println!("warn: failed to process {}: {}", source.display(), error);
                        }
                        continue;
                    }
                };
                let destination = root.join(&relative_destination);

                if source == destination {
                    summary.already_categorized += 1;
                    if args.json {
                        json_already_categorized.push(AlreadyCategorizedEntry { file: source });
                    } else {
                        println!("ok: already categorized {}", source.display());
                    }
                    continue;
                }

                let final_destination = resolve_collision(&destination);

                if relative_destination
                    .components()
                    .any(|component| component.as_os_str() == "Others")
                {
                    summary.routed_to_others += 1;
                }

                if args.dry_run {
                    if args.json {
                        json_moves.push(MoveEntry {
                            from: source,
                            to: final_destination,
                            class_key: classification.class_key,
                            confidence: classification.confidence,
                        });
                    } else {
                        println!(
                            "plan: {} -> {} ({}, confidence {:.3})",
                            source.display(),
                            final_destination.display(),
                            classification.class_key,
                            classification.confidence
                        );
                    }
                } else {
                    move_file(&source, &final_destination)?;
                    if args.json {
                        json_moves.push(MoveEntry {
                            from: source,
                            to: final_destination,
                            class_key: classification.class_key,
                            confidence: classification.confidence,
                        });
                    } else {
                        println!(
                            "moved: {} -> {} ({}, confidence {:.3})",
                            source.display(),
                            final_destination.display(),
                            classification.class_key,
                            classification.confidence
                        );
                    }
                }

                summary.moved += 1;
            }
            Err(error) => {
                summary.failed += 1;
                if args.json {
                    json_failed.push(FailedEntry {
                        file: source,
                        reason: format!("{error:#}"),
                    });
                } else {
                    println!("warn: failed to process {}: {error:#}", source.display());
                }
            }
        }
    }

    if args.json {
        let output = JsonOutput {
            dry_run: args.dry_run,
            moves: json_moves,
            skipped: json_skipped,
            already_categorized: json_already_categorized,
            failed: json_failed,
            summary: JsonSummary {
                scanned: summary.scanned,
                image_candidates: summary.image_candidates,
                moves: summary.moved,
                routed_to_others: summary.routed_to_others,
                low_confidence_skipped: summary.low_confidence_skipped,
                already_categorized: summary.already_categorized,
                failed: summary.failed,
            },
        };
        println!("{}", serde_json::to_string(&output)?);
    } else {
        print_summary(&summary, args.dry_run);
    }

    if let Some(message) = automation_failure_message(&summary, &args) {
        bail!("{message}");
    }

    Ok(())
}

fn automation_failure_message(summary: &Summary, args: &CategorizeArgs) -> Option<String> {
    if args.fail_on_failed && summary.failed > 0 {
        return Some(format!("{} file(s) failed to process", summary.failed));
    }
    if args.fail_on_skipped && summary.low_confidence_skipped > 0 {
        return Some(format!(
            "{} file(s) skipped due to low confidence",
            summary.low_confidence_skipped
        ));
    }
    if args.fail_on_empty && summary.image_candidates == 0 {
        return Some("no image files found".to_string());
    }
    None
}

fn print_summary(summary: &Summary, dry_run: bool) {
    println!(
        "summary: scanned={} image_candidates={} {}={} routed_to_others={} low_confidence_skipped={} already_categorized={} failed={}",
        summary.scanned,
        summary.image_candidates,
        if dry_run { "planned_moves" } else { "moved" },
        summary.moved,
        summary.routed_to_others,
        summary.low_confidence_skipped,
        summary.already_categorized,
        summary.failed
    );
}

fn resolve_collision(destination: &Path) -> PathBuf {
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

#[cfg(test)]
mod tests {
    use std::fs;

    use super::fs_ops::copy_then_unlink;
    use super::types::OperationOutput;
    use super::*;

    #[test]
    fn discover_explicit_files_uses_only_explicit_images() {
        let temp = tempfile::tempdir().unwrap();
        let root = temp.path();
        let listed = root.join("listed.png");
        let unlisted = root.join("unlisted.png");
        let text = root.join("notes.txt");
        fs::write(&listed, b"").unwrap();
        fs::write(&unlisted, b"").unwrap();
        fs::write(&text, b"not an image").unwrap();

        let files = discover_explicit_files(
            root,
            &[listed.clone(), PathBuf::from("notes.txt"), listed.clone()],
        )
        .unwrap();

        assert_eq!(files, vec![listed.canonicalize().unwrap()]);
    }

    #[test]
    fn discover_explicit_files_rejects_files_outside_root() {
        let temp = tempfile::tempdir().unwrap();
        let outside = tempfile::NamedTempFile::new().unwrap();

        let error =
            discover_explicit_files(temp.path(), &[outside.path().to_path_buf()]).unwrap_err();

        assert!(error.to_string().contains("outside root"));
    }

    fn automation_args() -> CategorizeArgs {
        CategorizeArgs {
            model_dir: None,
            path: PathBuf::from("."),
            dry_run: true,
            ja: false,
            min_confidence: 0.3,
            json: true,
            file: vec![],
            progress_json: false,
            fail_on_failed: false,
            fail_on_skipped: false,
            fail_on_empty: false,
        }
    }

    #[test]
    fn automation_failure_message_honors_failed_flag() {
        let mut args = automation_args();
        args.fail_on_failed = true;
        let summary = Summary {
            failed: 2,
            ..Summary::default()
        };

        assert_eq!(
            automation_failure_message(&summary, &args).as_deref(),
            Some("2 file(s) failed to process")
        );
    }

    #[test]
    fn automation_failure_message_honors_skipped_flag() {
        let mut args = automation_args();
        args.fail_on_skipped = true;
        let summary = Summary {
            low_confidence_skipped: 1,
            ..Summary::default()
        };

        assert_eq!(
            automation_failure_message(&summary, &args).as_deref(),
            Some("1 file(s) skipped due to low confidence")
        );
    }

    #[test]
    fn automation_failure_message_honors_empty_flag() {
        let mut args = automation_args();
        args.fail_on_empty = true;
        let summary = Summary::default();

        assert_eq!(
            automation_failure_message(&summary, &args).as_deref(),
            Some("no image files found")
        );
    }

    #[test]
    fn resolve_collision_adds_numeric_suffix() {
        let temp = tempfile::tempdir().unwrap();
        let original = temp.path().join("JP/04/Amane Kanata/input.png");
        fs::create_dir_all(original.parent().unwrap()).unwrap();
        fs::write(&original, b"first").unwrap();

        let collision = resolve_collision(&original);

        assert_eq!(
            collision,
            temp.path().join("JP/04/Amane Kanata/input-1.png")
        );
    }

    #[test]
    fn copy_then_unlink_places_image_in_destination() {
        let temp = tempfile::tempdir().unwrap();
        let source = temp.path().join("input.png");
        fs::write(&source, b"image").unwrap();
        let destination = temp.path().join("JP/04/Amane Kanata/input.png");
        fs::create_dir_all(destination.parent().unwrap()).unwrap();

        copy_then_unlink(&source, &destination).unwrap();

        assert!(!source.exists());
        assert_eq!(fs::read(&destination).unwrap(), b"image");
    }

    #[test]
    fn move_file_places_image_in_destination() {
        let temp = tempfile::tempdir().unwrap();
        let source = temp.path().join("input.png");
        fs::write(&source, b"image").unwrap();
        let destination = temp.path().join("JP/04/Amane Kanata/input.png");

        move_file(&source, &destination).unwrap();

        assert!(!source.exists());
        assert_eq!(fs::read(&destination).unwrap(), b"image");
    }

    fn move_entry(from: &Path, to: &Path) -> MoveEntry {
        MoveEntry {
            from: from.to_path_buf(),
            to: to.to_path_buf(),
            class_key: "class".to_string(),
            confidence: 0.9,
        }
    }

    fn plan_with(moves: Vec<MoveEntry>) -> JsonOutput {
        JsonOutput {
            dry_run: true,
            summary: JsonSummary {
                scanned: moves.len(),
                image_candidates: moves.len(),
                moves: moves.len(),
                routed_to_others: 0,
                low_confidence_skipped: 0,
                already_categorized: 0,
                failed: 0,
            },
            moves,
            skipped: vec![],
            already_categorized: vec![],
            failed: vec![],
        }
    }

    fn write_json(path: &Path, value: &impl serde::Serialize) {
        fs::write(path, serde_json::to_string(value).unwrap()).unwrap();
    }

    #[test]
    fn apply_plan_and_revert_operation_move_files() {
        let temp = tempfile::tempdir().unwrap();
        let source = temp.path().join("input.png");
        let destination = temp.path().join("JP/04/Amane Kanata/input.png");
        let plan_path = temp.path().join("plan.json");
        let operation_path = temp.path().join("operation.json");
        fs::write(&source, b"image").unwrap();

        let plan = plan_with(vec![move_entry(&source, &destination)]);
        write_json(&plan_path, &plan);

        apply_plan(&plan_path).unwrap();
        assert!(!source.exists());
        assert_eq!(fs::read(&destination).unwrap(), b"image");

        write_json(&operation_path, &OperationOutput { moves: plan.moves });
        revert_operation(&operation_path).unwrap();
        assert_eq!(fs::read(&source).unwrap(), b"image");
        assert!(!destination.exists());
    }

    #[test]
    fn apply_plan_preflights_before_moving_any_file() {
        let temp = tempfile::tempdir().unwrap();
        let source1 = temp.path().join("one.png");
        let source2 = temp.path().join("two.png");
        let destination1 = temp.path().join("categorized/one.png");
        let destination2 = temp.path().join("categorized/two.png");
        let plan_path = temp.path().join("plan.json");
        fs::create_dir_all(destination1.parent().unwrap()).unwrap();
        fs::write(&source1, b"one").unwrap();
        fs::write(&source2, b"two").unwrap();
        fs::write(&destination2, b"blocks apply").unwrap();
        write_json(
            &plan_path,
            &plan_with(vec![
                move_entry(&source1, &destination1),
                move_entry(&source2, &destination2),
            ]),
        );

        let error = apply_plan(&plan_path).unwrap_err();

        assert!(error.to_string().contains("destination already exists"));
        assert_eq!(fs::read(&source1).unwrap(), b"one");
        assert!(!destination1.exists());
    }

    #[test]
    fn revert_operation_preflights_before_moving_any_file() {
        let temp = tempfile::tempdir().unwrap();
        let source1 = temp.path().join("one.png");
        let source2 = temp.path().join("two.png");
        let destination1 = temp.path().join("categorized/one.png");
        let destination2 = temp.path().join("categorized/two.png");
        let operation_path = temp.path().join("operation.json");
        fs::create_dir_all(destination1.parent().unwrap()).unwrap();
        fs::write(&source1, b"blocks revert").unwrap();
        fs::write(&destination1, b"one").unwrap();
        fs::write(&destination2, b"two").unwrap();
        write_json(
            &operation_path,
            &OperationOutput {
                moves: vec![
                    move_entry(&source1, &destination1),
                    move_entry(&source2, &destination2),
                ],
            },
        );

        let error = revert_operation(&operation_path).unwrap_err();

        assert!(error.to_string().contains("original path already exists"));
        assert_eq!(fs::read(&destination2).unwrap(), b"two");
        assert!(!source2.exists());
    }
}
