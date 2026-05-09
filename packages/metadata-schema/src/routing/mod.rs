use std::{error::Error, ffi::OsStr, fmt, path::PathBuf};

use crate::models::holo_hoin::{HoloHoinMeta, output_class_keys as holo_hoin_output_class_keys};

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
        _ => Err(RoutingError::unsupported_model(model_name)),
    }
}

pub fn class_key_for_output_index(model_name: &str, output_index: usize) -> Option<&'static str> {
    match model_name {
        "holo-hoin" => holo_hoin_output_class_keys().get(output_index).copied(),
        _ => None,
    }
}

#[cfg(test)]
mod tests;
