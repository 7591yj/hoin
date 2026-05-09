use crate::{cli::CategorizeArgs, model::ModelRuntime};
use anyhow::{Context, Result, bail};
use metadata_schema::routing::{NameLocale, RoutingPreferences};
mod discovery;
mod engine;
mod fs_ops;
mod operations;
mod progress;
mod report;
mod types;

pub(crate) use operations::{apply_plan, revert_operation};

use discovery::{discover_explicit_files, discover_files};
use engine::run_categorize_plan;
use types::{JsonOutput, Summary};

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
            let output = JsonOutput::from_summary(
                args.dry_run,
                &Summary::default(),
                vec![],
                vec![],
                vec![],
                vec![],
            );
            println!("{}", serde_json::to_string(&output)?);
        } else {
            println!("No files found under {}", root.display());
        }
        if args.fail_on_empty {
            bail!("no image files found under {}", root.display());
        }
        return Ok(());
    }

    let report = run_categorize_plan(files, &root, &mut runtime, routing_preferences, &args);

    let automation_failure = automation_failure_message(&report.summary, &args);

    if args.json {
        println!(
            "{}",
            serde_json::to_string(&report.into_json(args.dry_run))?
        );
    } else {
        print_summary(&report.summary, args.dry_run);
    }

    if let Some(message) = automation_failure {
        bail!("{message}");
    }

    Ok(())
}

fn automation_failure_message(summary: &Summary, args: &CategorizeArgs) -> Option<String> {
    if (args.fail_on_failed || !args.dry_run) && summary.failed > 0 {
        return Some(format!("{} file(s) failed to process", summary.failed));
    }
    if args.fail_on_skipped && summary.low_confidence_skipped > 0 {
        return Some(format!(
            "{} file(s) skipped due to low confidence",
            summary.low_confidence_skipped
        ));
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

#[cfg(test)]
mod tests;
