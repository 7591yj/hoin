use super::*;

#[test]
fn loads_directory_contract_model() {
    let temp = tempfile::tempdir().unwrap();
    let model_dir = temp.path().join("example");
    fs::create_dir_all(&model_dir).unwrap();
    fs::write(model_dir.join("example.onnx"), b"onnx").unwrap();

    let package = ModelPackage::load(Some(&model_dir)).unwrap();
    let model_dir = model_dir.canonicalize().unwrap();

    assert_eq!(package.name, "example");
    assert_eq!(package.onnx_path, model_dir.join("example.onnx"));
    assert_eq!(package.onnx_data_path, None);
}

#[test]
fn loads_manifest_model() {
    let temp = tempfile::tempdir().unwrap();
    let model_dir = temp.path().join("renamed");
    fs::create_dir_all(&model_dir).unwrap();
    fs::write(
            model_dir.join(MODEL_MANIFEST),
            r#"{"name":"example","onnx":"artifacts/model.onnx","onnx_data":"artifacts/model.onnx.data"}"#,
        )
        .unwrap();
    fs::create_dir_all(model_dir.join("artifacts")).unwrap();
    fs::write(model_dir.join("artifacts/model.onnx"), b"onnx").unwrap();
    fs::write(model_dir.join("artifacts/model.onnx.data"), b"data").unwrap();

    let package = ModelPackage::load(Some(&model_dir)).unwrap();
    let model_dir = model_dir.canonicalize().unwrap();

    assert_eq!(package.name, "example");
    assert_eq!(package.onnx_path, model_dir.join("artifacts/model.onnx"));
    assert_eq!(
        package.onnx_data_path,
        Some(model_dir.join("artifacts/model.onnx.data"))
    );
}
