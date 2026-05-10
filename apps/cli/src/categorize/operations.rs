use std::{
    collections::HashSet,
    path::{Path, PathBuf},
};

use anyhow::{Context, Result, bail};

use super::{
    fs_ops::{move_file, read_json_file},
    types::{JsonOutput, OperationOutput},
};

pub(crate) fn apply_plan(plan_path: &Path, progress_json: bool) -> Result<()> {
    let plan: JsonOutput = read_json_file(plan_path, "plan")?;
    preflight_moves(
        plan.moves
            .iter()
            .map(|move_entry| (&move_entry.from, &move_entry.to)),
        "source",
        "destination",
    )?;

    let total = plan.moves.len();
    for (index, move_entry) in plan.moves.iter().enumerate() {
        move_file(&move_entry.from, &move_entry.to).with_context(|| {
            format!(
                "apply may be partial after failed move {} -> {}",
                move_entry.from.display(),
                move_entry.to.display()
            )
        })?;
        emit_progress(progress_json, "move_done", index + 1, total, &move_entry.to)?;
    }

    println!(
        "{}",
        serde_json::to_string(&OperationOutput { moves: plan.moves })?
    );
    Ok(())
}

pub(crate) fn revert_operation(operation_path: &Path, progress_json: bool) -> Result<()> {
    let operation: OperationOutput = read_json_file(operation_path, "operation")?;
    preflight_moves(
        operation
            .moves
            .iter()
            .map(|move_entry| (&move_entry.to, &move_entry.from)),
        "current path",
        "original path",
    )?;

    let total = operation.moves.len();
    let mut reverted = 0usize;
    for move_entry in operation.moves.iter().rev() {
        move_file(&move_entry.to, &move_entry.from).with_context(|| {
            format!(
                "revert may be partial after failed move {} -> {}",
                move_entry.to.display(),
                move_entry.from.display()
            )
        })?;
        reverted += 1;
        emit_progress(
            progress_json,
            "move_done",
            reverted,
            total,
            &move_entry.from,
        )?;
    }

    println!("{}", serde_json::json!({ "reverted": reverted }));
    Ok(())
}

fn emit_progress(
    enabled: bool,
    event: &str,
    completed: usize,
    total: usize,
    file: &Path,
) -> Result<()> {
    if enabled {
        eprintln!(
            "{}",
            serde_json::json!({
                "event": event,
                "completed": completed,
                "total": total,
                "file": file.display().to_string(),
            })
        );
    }
    Ok(())
}

fn preflight_moves<'a>(
    moves: impl IntoIterator<Item = (&'a PathBuf, &'a PathBuf)>,
    source_label: &str,
    destination_label: &str,
) -> Result<()> {
    let mut sources = HashSet::new();
    let mut destinations = HashSet::new();

    for (source, destination) in moves {
        if !sources.insert(source) {
            bail!("duplicate {source_label}: {}", source.display());
        }
        if !destinations.insert(destination) {
            bail!("duplicate {destination_label}: {}", destination.display());
        }
        if !source.exists() {
            bail!("{source_label} does not exist: {}", source.display());
        }
        if destination.exists() {
            bail!(
                "{destination_label} already exists: {}",
                destination.display()
            );
        }
    }

    Ok(())
}
