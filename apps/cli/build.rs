use std::{
    env, fs,
    path::{Path, PathBuf},
};

fn main() {
    println!("cargo:rerun-if-env-changed=HOIN_EMBED_MODEL");

    let manifest_dir = PathBuf::from(
        env::var("CARGO_MANIFEST_DIR")
            .expect("Cargo did not provide CARGO_MANIFEST_DIR to the build script"),
    );
    let workspace_dir = manifest_dir
        .parent()
        .and_then(Path::parent)
        .expect("failed to resolve the workspace root from apps/cli/Cargo.toml");
    let models_dir = workspace_dir.join("models");

    println!("cargo:rerun-if-changed={}", models_dir.display());

    let generated = match env::var("HOIN_EMBED_MODEL") {
        Ok(model_name) if !model_name.trim().is_empty() => {
            build_embedded_model_source(workspace_dir, models_dir.as_path(), model_name.trim())
        }
        _ => no_model_source(),
    };

    let out_dir = PathBuf::from(
        env::var("OUT_DIR").expect("Cargo did not provide OUT_DIR to the build script"),
    );
    fs::write(out_dir.join("embedded_model.rs"), generated)
        .expect("failed to write generated embedded model source to OUT_DIR/embedded_model.rs");
}

fn build_embedded_model_source(
    workspace_dir: &Path,
    models_dir: &Path,
    model_name: &str,
) -> String {
    let model_dir = models_dir.join(model_name);
    let onnx_path = model_dir.join(format!("{model_name}.onnx"));

    assert!(
        onnx_path.is_file(),
        "selected model '{model_name}' is missing its required ONNX artifact at {}",
        onnx_path.display()
    );

    let onnx_relative = relative_from_workspace(workspace_dir, &onnx_path);
    let onnx_absolute = onnx_path.display().to_string();

    let onnx_data = optional_file_expr(
        workspace_dir,
        &model_dir.join(format!("{model_name}.onnx.data")),
    );

    format!(
        r#"pub struct EmbeddedFile {{
    pub relative_path: &'static str,
    pub bytes: &'static [u8],
}}

pub struct EmbeddedModel {{
    pub name: &'static str,
    pub onnx: EmbeddedFile,
    pub onnx_data: Option<EmbeddedFile>,
}}

pub static EMBEDDED_MODEL: Option<EmbeddedModel> = Some(EmbeddedModel {{
    name: {model_name:?},
    onnx: EmbeddedFile {{
        relative_path: {onnx_relative:?},
        bytes: include_bytes!({onnx_absolute:?}),
    }},
    onnx_data: {onnx_data},
}});
"#,
        model_name = model_name,
        onnx_relative = onnx_relative,
        onnx_absolute = onnx_absolute,
        onnx_data = onnx_data,
    )
}

fn optional_file_expr(workspace_dir: &Path, path: &Path) -> String {
    if !path.is_file() {
        return "None".to_string();
    }

    let relative_path = relative_from_workspace(workspace_dir, path);
    let absolute_path = path.display().to_string();

    format!(
        "Some(EmbeddedFile {{ relative_path: {relative_path:?}, bytes: include_bytes!({absolute_path:?}) }})",
    )
}

fn relative_from_workspace(workspace_dir: &Path, path: &Path) -> String {
    path.strip_prefix(workspace_dir)
        .expect("failed to compute a workspace-relative path for an embedded model artifact")
        .display()
        .to_string()
}

fn no_model_source() -> String {
    r#"pub struct EmbeddedFile {
    pub relative_path: &'static str,
    pub bytes: &'static [u8],
}

pub struct EmbeddedModel {
    pub name: &'static str,
    pub onnx: EmbeddedFile,
    pub onnx_data: Option<EmbeddedFile>,
}

pub static EMBEDDED_MODEL: Option<EmbeddedModel> = None;
"#
    .to_string()
}
