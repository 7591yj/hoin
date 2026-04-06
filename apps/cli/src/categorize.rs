use std::{
    fs,
    path::{Path, PathBuf},
};

use anyhow::{Context, Result, bail};
use metadata_schema::routing::{NameLocale, RoutingPreferences, route_relative_destination};
use walkdir::WalkDir;

use crate::{cli::CategorizeArgs, model::ModelRuntime};

#[derive(Debug, Default)]
struct Summary {
    scanned: usize,
    image_candidates: usize,
    moved: usize,
    routed_to_others: usize,
    low_confidence_skipped: usize,
    already_categorized: usize,
    failed: usize,
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
    let mut runtime = ModelRuntime::load()?;
    let files = discover_files(&root)?;
    let routing_preferences = RoutingPreferences {
        name_locale: if args.ja {
            NameLocale::Ja
        } else {
            NameLocale::En
        },
    };

    if files.is_empty() {
        println!("No files found under {}", root.display());
        return Ok(());
    }

    let mut summary = Summary {
        scanned: files.len(),
        image_candidates: files.len(),
        ..Summary::default()
    };

    for source in files {
        match runtime.classify_path(&source) {
            Ok(classification) => {
                if classification.confidence < args.min_confidence {
                    summary.low_confidence_skipped += 1;
                    println!(
                        "warn: skipped {} due to low confidence {:.3} (< {:.3})",
                        source.display(),
                        classification.confidence,
                        args.min_confidence
                    );
                    continue;
                }

                let Some(file_name) = source.file_name() else {
                    summary.failed += 1;
                    println!(
                        "warn: failed to process {}: missing file name",
                        source.display()
                    );
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
                        println!("warn: failed to process {}: {}", source.display(), error);
                        continue;
                    }
                };
                let destination = root.join(&relative_destination);

                if source == destination {
                    summary.already_categorized += 1;
                    println!("ok: already categorized {}", source.display());
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
                    println!(
                        "plan: {} -> {} ({}, confidence {:.3})",
                        source.display(),
                        final_destination.display(),
                        classification.class_key,
                        classification.confidence
                    );
                } else {
                    move_file(&source, &final_destination)?;
                    println!(
                        "moved: {} -> {} ({}, confidence {:.3})",
                        source.display(),
                        final_destination.display(),
                        classification.class_key,
                        classification.confidence
                    );
                }

                summary.moved += 1;
            }
            Err(error) => {
                summary.failed += 1;
                println!("warn: failed to process {}: {error:#}", source.display());
            }
        }
    }

    print_summary(&summary, args.dry_run);
    Ok(())
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

fn discover_files(root: &Path) -> Result<Vec<PathBuf>> {
    let mut files = Vec::new();

    for entry in WalkDir::new(root).into_iter() {
        let entry = entry.with_context(|| format!("walk directory {}", root.display()))?;
        if entry.file_type().is_file() && image::ImageFormat::from_path(entry.path()).is_ok() {
            files.push(entry.into_path());
        }
    }

    files.sort();
    Ok(files)
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

fn move_file(source: &Path, destination: &Path) -> Result<()> {
    let parent = destination
        .parent()
        .context("destination has no parent directory")?;
    fs::create_dir_all(parent)
        .with_context(|| format!("create destination directory {}", parent.display()))?;
    fs::rename(source, destination).with_context(|| {
        format!(
            "move image from {} to {}",
            source.display(),
            destination.display()
        )
    })?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

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
    fn move_file_places_image_in_destination() {
        let temp = tempfile::tempdir().unwrap();
        let source = temp.path().join("input.png");
        fs::write(&source, b"image").unwrap();
        let destination = temp.path().join("JP/04/Amane Kanata/input.png");

        move_file(&source, &destination).unwrap();

        assert!(!source.exists());
        assert_eq!(fs::read(&destination).unwrap(), b"image");
    }
}
