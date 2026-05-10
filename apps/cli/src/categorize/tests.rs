use std::{
    fs,
    path::{Path, PathBuf},
};

use super::fs_ops::{copy_then_unlink, move_file};
use super::types::{MoveEntry, OperationOutput};
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

    let error = discover_explicit_files(temp.path(), &[outside.path().to_path_buf()]).unwrap_err();

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
fn automation_failure_message_fails_non_dry_run_by_default() {
    let mut args = automation_args();
    args.dry_run = false;
    let summary = Summary {
        failed: 1,
        ..Summary::default()
    };

    assert_eq!(
        automation_failure_message(&summary, &args).as_deref(),
        Some("1 file(s) failed to process")
    );
}

#[test]
fn automation_failure_message_allows_dry_run_failures_by_default() {
    let args = automation_args();
    let summary = Summary {
        failed: 1,
        ..Summary::default()
    };

    assert_eq!(automation_failure_message(&summary, &args), None);
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
fn resolve_collision_adds_numeric_suffix() {
    let temp = tempfile::tempdir().unwrap();
    let original = temp.path().join("JP/04/Amane Kanata/input.png");
    fs::create_dir_all(original.parent().unwrap()).unwrap();
    fs::write(&original, b"first").unwrap();

    let collision = engine::resolve_collision(&original);

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
fn copy_then_unlink_does_not_overwrite_existing_destination() {
    let temp = tempfile::tempdir().unwrap();
    let source = temp.path().join("input.png");
    fs::write(&source, b"source").unwrap();
    let destination = temp.path().join("JP/04/Amane Kanata/input.png");
    fs::create_dir_all(destination.parent().unwrap()).unwrap();
    fs::write(&destination, b"destination").unwrap();

    copy_then_unlink(&source, &destination).unwrap_err();

    assert_eq!(fs::read(&source).unwrap(), b"source");
    assert_eq!(fs::read(&destination).unwrap(), b"destination");
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

#[test]
fn move_file_does_not_overwrite_existing_destination() {
    let temp = tempfile::tempdir().unwrap();
    let source = temp.path().join("input.png");
    fs::write(&source, b"source").unwrap();
    let destination = temp.path().join("JP/04/Amane Kanata/input.png");
    fs::create_dir_all(destination.parent().unwrap()).unwrap();
    fs::write(&destination, b"destination").unwrap();

    move_file(&source, &destination).unwrap_err();

    assert_eq!(fs::read(&source).unwrap(), b"source");
    assert_eq!(fs::read(&destination).unwrap(), b"destination");
}

fn move_entry(from: &Path, to: &Path) -> MoveEntry {
    MoveEntry {
        from: from.to_path_buf(),
        to: to.to_path_buf(),
        class_key: "class".to_string(),
        confidence: 0.9,
        routed_to_others: false,
    }
}

fn plan_with(moves: Vec<MoveEntry>) -> JsonOutput {
    let summary = Summary {
        scanned: moves.len(),
        image_candidates: moves.len(),
        moved: moves.len(),
        ..Summary::default()
    };
    JsonOutput::from_summary(true, &summary, moves, vec![], vec![], vec![])
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

    apply_plan(&plan_path, false).unwrap();
    assert!(!source.exists());
    assert_eq!(fs::read(&destination).unwrap(), b"image");

    write_json(&operation_path, &OperationOutput { moves: plan.moves });
    revert_operation(&operation_path, false).unwrap();
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

    let error = apply_plan(&plan_path, false).unwrap_err();

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

    let error = revert_operation(&operation_path, false).unwrap_err();

    assert!(error.to_string().contains("original path already exists"));
    assert_eq!(fs::read(&destination2).unwrap(), b"two");
    assert!(!source2.exists());
}
