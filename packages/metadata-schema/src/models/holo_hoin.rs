//! holo-hoin model types for mapping API responses to organized metadata
//! This module is intended to be consumed by the holo-hoin model only

// Character names, group names, and related intellectual property used in this file
// are owned by COVER Corp. and used here under the hololive production Derivative Works
// Guidelines.
// COVER Corp. does not relinquish its copyright or related rights.
// See: https://hololivepro.com/terms/

use serde::{Deserialize, Serialize};

/// Raw response shape returned by the holo-hoin inference API
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub(crate) struct HoloHoinApiResponse {
    pub file_name: String,
    pub confidence: f32,
    pub meta: HoloHoinMeta,
}

/// Resolved metadata stored in the result document
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct HoloHoinMeta {
    pub char_name: String,
    pub generation: Option<u32>,
    pub group: Option<String>,
    pub affiliation: Option<String>,
}

/// Final result document
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
            meta: response.meta,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn from_api_resolves_known_mappings() {
        let response = HoloHoinApiResponse {
            file_name: "test.png".to_owned(),
            confidence: 0.99,
            meta: HoloHoinMeta {
                char_name: "Amane Kanata".to_owned(),
                generation: Some(4),
                group: Some("holoForce".to_owned()),
                affiliation: Some("JP".to_owned()),
            },
        };
        let result = HoloHoinResult::from(response);
        assert_eq!(result.meta.group.as_deref(), Some("holoForce"));
        assert_eq!(result.meta.affiliation.as_deref(), Some("JP"));
    }

    #[test]
    fn from_api_unknown_mappings_are_null() {
        let response = HoloHoinApiResponse {
            file_name: "test.png".to_owned(),
            confidence: 0.5,
            meta: HoloHoinMeta {
                char_name: "Unknown".to_owned(),
                generation: None,
                group: None,
                affiliation: None,
            },
        };
        let result = HoloHoinResult::from(response);
        assert_eq!(result.meta.group, None);
        assert_eq!(result.meta.affiliation, None);
        assert_eq!(result.meta.generation, None);
    }

    #[test]
    fn result_serializes_to_expected_shape() {
        let result = HoloHoinResult {
            file_name: "test.png".to_owned(),
            confidence: 0.99,
            meta: HoloHoinMeta {
                char_name: "Amane Kanata".to_owned(),
                generation: Some(4),
                group: Some("holoForce".to_owned()),
                affiliation: Some("JP".to_owned()),
            },
        };
        let json = serde_json::to_value(&result).unwrap();
        assert_eq!(json["file_name"], "test.png");
        assert_eq!(json["meta"]["char_name"], "Amane Kanata");
        assert_eq!(json["meta"]["group"], "holoForce");
        assert_eq!(json["meta"]["affiliation"], "JP");
    }
}

#[test]
fn from_api_response_into_works() {
    let api = HoloHoinApiResponse {
        file_name: "test.png".to_owned(),
        confidence: 0.92,
        meta: HoloHoinMeta {
            char_name: "Amane Kanata".to_owned(),
            generation: Some(4),
            group: Some("holoForce".to_owned()),
            affiliation: Some("JP".to_owned()),
        },
    };

    let result: HoloHoinResult = api.into();

    assert_eq!(result.file_name, "test.png");
    assert_eq!(result.meta.char_name, "Amane Kanata");
    assert_eq!(result.meta.generation, Some(4));
    assert_eq!(result.meta.group.as_deref(), Some("holoForce"));
    assert_eq!(result.meta.affiliation.as_deref(), Some("JP"));
}
