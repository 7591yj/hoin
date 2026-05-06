use std::path::Path;

use anyhow::{Result, bail};

use super::{
    fs_ops::{move_file, read_json_file},
    types::{JsonOutput, OperationOutput},
};

pub(crate) fn apply_plan(plan_path: &Path) -> Result<()> {
    let plan: JsonOutput = read_json_file(plan_path, "plan")?;
    let mut applied = Vec::new();
    for move_entry in plan.moves {
        if !move_entry.from.exists() {
            bail!("source does not exist: {}", move_entry.from.display());
        }
        if move_entry.to.exists() {
            bail!("destination already exists: {}", move_entry.to.display());
        }
        move_file(&move_entry.from, &move_entry.to)?;
        applied.push(move_entry);
    }

    let operation = OperationOutput { moves: applied };
    println!("{}", serde_json::to_string(&operation)?);
    Ok(())
}

pub(crate) fn revert_operation(operation_path: &Path) -> Result<()> {
    let operation: OperationOutput = read_json_file(operation_path, "operation")?;
    let mut reverted = 0usize;
    for move_entry in operation.moves.iter().rev() {
        if move_entry.from.exists() {
            bail!(
                "original path already exists: {}",
                move_entry.from.display()
            );
        }
        move_file(&move_entry.to, &move_entry.from)?;
        reverted += 1;
    }

    println!("{}", serde_json::json!({ "reverted": reverted }));
    Ok(())
}
