use std::{error::Error, ffi::OsStr, fmt, path::PathBuf};

use crate::models::holo_hoin::{HoloHoinMeta, output_class_keys as holo_hoin_output_class_keys};
use crate::models::molu_hoin::{MoluHoinMeta, output_class_keys as molu_hoin_output_class_keys};

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub enum NameLocale {
    #[default]
    En,
    Ja,
}

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub struct RoutingPreferences {
    pub name_locale: NameLocale,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RoutingError {
    model_name: String,
}

impl RoutingError {
    fn unsupported_model(model_name: &str) -> Self {
        Self {
            model_name: model_name.to_owned(),
        }
    }
}

impl fmt::Display for RoutingError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(
            f,
            "no routing strategy is registered for model '{}'",
            self.model_name
        )
    }
}

impl Error for RoutingError {}

pub fn route_relative_destination(
    model_name: &str,
    class_key: &str,
    file_name: &OsStr,
    preferences: RoutingPreferences,
) -> Result<PathBuf, RoutingError> {
    match model_name {
        "holo-hoin" => Ok(HoloHoinMeta::relative_destination_for_class_key(
            class_key,
            preferences.name_locale,
            file_name,
        )),
        "molu-hoin" => Ok(MoluHoinMeta::relative_destination_for_class_key(
            class_key,
            preferences.name_locale,
            file_name,
        )),
        _ => Err(RoutingError::unsupported_model(model_name)),
    }
}

pub fn class_key_for_output_index(model_name: &str, output_index: usize) -> Option<&'static str> {
    match model_name {
        "holo-hoin" => holo_hoin_output_class_keys().get(output_index).copied(),
        "molu-hoin" => molu_hoin_output_class_keys().get(output_index).copied(),
        _ => None,
    }
}

#[cfg(test)]
mod tests {
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

    #[test]
    fn routes_molu_hoin_predictions() {
        let path = route_relative_destination(
            "molu-hoin",
            "hina_(blue_archive)",
            OsStr::new("input.png"),
            RoutingPreferences::default(),
        )
        .unwrap();

        assert_eq!(
            path,
            PathBuf::from("Gehenna/Prefect Team/Hina Sorasaki/input.png")
        );
    }

    #[test]
    fn routes_molu_hoin_predictions_in_japanese_when_requested() {
        let path = route_relative_destination(
            "molu-hoin",
            "hina_(blue_archive)",
            OsStr::new("input.png"),
            RoutingPreferences {
                name_locale: NameLocale::Ja,
            },
        )
        .unwrap();

        assert_eq!(
            path,
            PathBuf::from("Gehenna/Prefect Team/空崎ヒナ/input.png")
        );
    }

    #[test]
    fn resolves_molu_hoin_output_indexes() {
        assert_eq!(
            class_key_for_output_index("molu-hoin", 24),
            Some("hina_(blue_archive)"),
        );
        assert_eq!(class_key_for_output_index("molu-hoin", 9999), None);
    }
}
