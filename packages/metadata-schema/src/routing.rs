use std::{error::Error, ffi::OsStr, fmt, path::PathBuf};

use crate::models::holo_hoin::HoloHoinMeta;

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
            "no routing strategy is registered for embedded model '{}'",
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
        _ => Err(RoutingError::unsupported_model(model_name)),
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
            "no routing strategy is registered for embedded model 'unknown-model'"
        );
    }
}
