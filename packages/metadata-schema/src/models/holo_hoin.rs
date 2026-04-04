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
    pub char_name: String,
    pub generation: u32,
    pub affiliation: u32,
}

/// Resolved metadata stored in the result document
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct HoloHoinMeta {
    pub char_name: String,
    pub generation: u32,
    /// Derived from generation via [map_generation_group]; None if unmapped
    pub group: Option<String>,
    /// Derived from affiliation int via [map_affiliation]; None if unmapped
    pub affiliation: Option<String>,
}

/// Final result document
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct HoloHoinResult {
    pub file_name: String,
    pub confidence: f32,
    pub meta: HoloHoinMeta,
}

/// Maps an affiliation integer from the API to its label
pub(crate) fn map_affiliation(id: u32) -> Option<&'static str> {
    match id {
        0 => Some("JP"),
        1 => Some("EN"),
        2 => Some("ID"),
        3 => Some("DEV_IS"),
        _ => None,
    }
}

/// Maps (affiliation, generation) integers from the API to a group label.
pub(crate) fn map_generation_group(affiliation: u32, generation: u32) -> Option<&'static str> {
    match (affiliation, generation) {
        // JP (0)
        (0, 3) => Some("Hololive Fantasy"),
        (0, 4) => Some("holoForce"),
        (0, 5) => Some("holoFive"),
        (0, 6) => Some("holoX"),
        (0, 99) => Some("GAMERS"),
        // EN (1)
        (1, 1) => Some("Myth"),
        (1, 2) => Some("Promise"),
        (1, 3) => Some("Advent"),
        (1, 4) => Some("Justice"),
        // ID (2)
        (2, 1) => Some("AREA15"),
        (2, 2) => Some("HOLORO"),
        (2, 3) => Some("HOLOH3RO"),
        // DEV_IS (3)
        (3, 1) => Some("ReGLOSS"),
        (3, 2) => Some("FLOW GLOW"),
        // default
        _ => None,
    }
}

impl From<HoloHoinApiResponse> for HoloHoinResult {
    fn from(response: HoloHoinApiResponse) -> Self {
        Self {
            file_name: response.file_name,
            confidence: response.confidence,
            meta: HoloHoinMeta {
                char_name: response.char_name,
                generation: response.generation,
                group: map_generation_group(response.affiliation, response.generation)
                    .map(str::to_owned),
                affiliation: map_affiliation(response.affiliation).map(str::to_owned),
            },
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
            char_name: "Kanata".to_owned(),
            generation: 4,
            affiliation: 0,
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
            char_name: "Unknown".to_owned(),
            generation: 99,
            affiliation: 99,
        };
        let result = HoloHoinResult::from(response);
        assert_eq!(result.meta.group, None);
        assert_eq!(result.meta.affiliation, None);
    }

    #[test]
    fn result_serializes_to_expected_shape() {
        let result = HoloHoinResult {
            file_name: "test.png".to_owned(),
            confidence: 0.99,
            meta: HoloHoinMeta {
                char_name: "Amane Kanata".to_owned(),
                generation: 4,
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
        char_name: "Kanata".to_owned(),
        generation: 4,
        affiliation: 0,
    };

    let result: HoloHoinResult = api.into();

    assert_eq!(result.file_name, "test.png");
    assert_eq!(result.meta.char_name, "Kanata");
    assert_eq!(result.meta.generation, 4);
    assert_eq!(result.meta.group.as_deref(), Some("holoForce"));
    assert_eq!(result.meta.affiliation.as_deref(), Some("JP"));
}
