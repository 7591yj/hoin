//! holo-hoin model types for mapping API responses to organized metadata.
//! This module is intended to be consumed by the holo-hoin model only.
//!
//! holo-hoin inference API reference: <https://github.com/faransansj/anihoin>
//!
//! POST /predict response shape:
//! ```json
//! {
//!   "file_name": "gura.jpg",
//!   "confidence": 0.9821,
//!   "meta": {
//!     "char_name": "Gawr Gura",
//!     "generation": 1,
//!     "group": "Myth",
//!     "affiliation": "EN"
//!   }
//! }
//! ```

// Character names, group names, and related intellectual property used in this file
// are owned by COVER Corp. and used here under the hololive production Derivative Works
// Guidelines.
// COVER Corp. does not relinquish its copyright or related rights.
// See: https://hololivepro.com/terms/

use serde::{Deserialize, Serialize};

/// Branch affiliation as returned by the holo-hoin API.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum Affiliation {
    JP,
    EN,
    IND,
}

/// Nested `meta` object within the holo-hoin API response.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub(crate) struct HoloHoinCharMeta {
    pub char_name: String,
    /// Generation number within the branch (0-indexed for JP 0期生).
    /// `None` for units not tied to a numbered generation (e.g. DEV_IS ReGLOSS).
    pub generation: Option<u32>,
    /// Unit/group name (e.g. `"Myth"`, `"holoX"`, `"ReGLOSS"`).
    /// `None` for members without a named sub-unit.
    pub group: Option<String>,
    pub affiliation: Option<Affiliation>,
}

/// Raw response shape returned by `POST /predict` on the holo-hoin inference API.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub(crate) struct HoloHoinApiResponse {
    pub file_name: String,
    pub confidence: f32,
    pub meta: HoloHoinCharMeta,
}

/// Resolved metadata stored in the result document.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct HoloHoinMeta {
    pub char_name: String,
    pub generation: Option<u32>,
    pub group: Option<String>,
    pub affiliation: Option<Affiliation>,
}

/// Final result document produced from a holo-hoin API response.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct HoloHoinResult {
    pub file_name: String,
    pub confidence: f32,
    pub meta: HoloHoinMeta,
}

impl From<HoloHoinApiResponse> for HoloHoinResult {
    fn from(response: HoloHoinApiResponse) -> Self {
        Self {
            file_name: response.file_name,
            confidence: response.confidence,
            meta: HoloHoinMeta {
                char_name: response.meta.char_name,
                generation: response.meta.generation,
                group: response.meta.group,
                affiliation: response.meta.affiliation,
            },
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn make_response(
        char_name: &str,
        generation: Option<u32>,
        group: Option<&str>,
        affiliation: Option<Affiliation>,
    ) -> HoloHoinApiResponse {
        HoloHoinApiResponse {
            file_name: "test.png".to_owned(),
            confidence: 0.99,
            meta: HoloHoinCharMeta {
                char_name: char_name.to_owned(),
                generation,
                group: group.map(str::to_owned),
                affiliation,
            },
        }
    }

    #[test]
    fn from_api_jp_numbered_generation() {
        // JP 4기 holoForce member
        let api = make_response("Amane Kanata", Some(4), Some("holoForce"), Some(Affiliation::JP));
        let result = HoloHoinResult::from(api);
        assert_eq!(result.meta.char_name, "Amane Kanata");
        assert_eq!(result.meta.generation, Some(4));
        assert_eq!(result.meta.group.as_deref(), Some("holoForce"));
        assert_eq!(result.meta.affiliation, Some(Affiliation::JP));
    }

    #[test]
    fn from_api_dev_is_no_generation() {
        // DEV_IS ReGLOSS — generation is None
        let api = make_response("Hiodoshi Ao", None, Some("ReGLOSS"), Some(Affiliation::JP));
        let result = HoloHoinResult::from(api);
        assert_eq!(result.meta.generation, None);
        assert_eq!(result.meta.group.as_deref(), Some("ReGLOSS"));
        assert_eq!(result.meta.affiliation, Some(Affiliation::JP));
    }

    #[test]
    fn from_api_en_myth() {
        // EN Myth (1기)
        let api = make_response("Gawr Gura", Some(1), Some("Myth"), Some(Affiliation::EN));
        let result = HoloHoinResult::from(api);
        assert_eq!(result.meta.generation, Some(1));
        assert_eq!(result.meta.group.as_deref(), Some("Myth"));
        assert_eq!(result.meta.affiliation, Some(Affiliation::EN));
    }

    #[test]
    fn from_api_id_no_group() {
        // ID branch members have no sub-unit group
        let api = make_response("Moona Hoshinova", Some(1), None, Some(Affiliation::IND));
        let result = HoloHoinResult::from(api);
        assert_eq!(result.meta.group, None);
        assert_eq!(result.meta.affiliation, Some(Affiliation::IND));
    }

    #[test]
    fn from_api_unknown_character() {
        // Unrecognised character falls back to None fields
        let api = make_response("Others", None, None, None);
        let result = HoloHoinResult::from(api);
        assert_eq!(result.meta.generation, None);
        assert_eq!(result.meta.group, None);
        assert_eq!(result.meta.affiliation, None);
    }

    #[test]
    fn result_serializes_to_expected_shape() {
        let result = HoloHoinResult {
            file_name: "gura.jpg".to_owned(),
            confidence: 0.9821,
            meta: HoloHoinMeta {
                char_name: "Gawr Gura".to_owned(),
                generation: Some(1),
                group: Some("Myth".to_owned()),
                affiliation: Some(Affiliation::EN),
            },
        };
        let json = serde_json::to_value(&result).unwrap();
        assert_eq!(json["file_name"], "gura.jpg");
        assert_eq!(json["meta"]["char_name"], "Gawr Gura");
        assert_eq!(json["meta"]["generation"], 1);
        assert_eq!(json["meta"]["group"], "Myth");
        assert_eq!(json["meta"]["affiliation"], "EN");
    }

    #[test]
    fn into_trait_works() {
        let api = make_response("Tokoyami Towa", Some(4), Some("holoForce"), Some(Affiliation::JP));
        let result: HoloHoinResult = api.into();
        assert_eq!(result.meta.char_name, "Tokoyami Towa");
        assert_eq!(result.meta.group.as_deref(), Some("holoForce"));
    }
}
