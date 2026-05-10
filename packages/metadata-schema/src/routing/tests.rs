use super::*;

#[test]
fn routes_holo_hoin_predictions() {
    let path = route_relative_destination(
        "holo-hoin",
        "amane_kanata",
        OsStr::new("input.png"),
        RoutingPreferences::default(),
    )
    .unwrap();

    assert_eq!(
        path,
        PathBuf::from("JP/04 - holoForce/Amane Kanata/input.png")
    );
}

#[test]
fn routes_holo_hoin_predictions_in_japanese_when_requested() {
    let path = route_relative_destination(
        "holo-hoin",
        "amane_kanata",
        OsStr::new("input.png"),
        RoutingPreferences {
            name_locale: NameLocale::Ja,
        },
    )
    .unwrap();

    assert_eq!(
        path,
        PathBuf::from("JP/04 - holoForce/天音かなた/input.png")
    );
}

#[test]
fn rejects_unknown_models() {
    let error = route_relative_destination(
        "unknown-model",
        "example",
        OsStr::new("input.png"),
        RoutingPreferences::default(),
    )
    .unwrap_err();

    assert_eq!(
        error.to_string(),
        "no routing strategy is registered for model 'unknown-model'"
    );
}

#[test]
fn resolves_holo_hoin_output_indexes() {
    assert_eq!(
        class_key_for_output_index("holo-hoin", 3),
        Some("amane_kanata")
    );
    assert_eq!(class_key_for_output_index("holo-hoin", 999), None);
}
