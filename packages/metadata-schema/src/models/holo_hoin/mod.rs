//! holo-hoin model types for mapping API responses to organized metadata
//! This module is intended to be consumed by the holo-hoin model only

// Character names, group names, and related intellectual property used in this file
// are owned by COVER Corp. and used here under the hololive production Derivative Works
// Guidelines.
// COVER Corp. does not relinquish its copyright or related rights.
// See: https://hololivepro.com/terms/

use serde::{Deserialize, Serialize};
use std::{collections::HashMap, ffi::OsStr, path::PathBuf, sync::OnceLock};

use crate::routing::NameLocale;

const HOLO_HOIN_CLASS_MAP_JSON: &str = include_str!("holo_hoin_class_map_en.json");
const HOLO_HOIN_CLASS_MAP_JA_JSON: &str = include_str!("holo_hoin_class_map_ja.json");
// TODO: add auto guard for future edits or get info straight from the model
const HOLO_HOIN_OUTPUT_CLASS_KEYS: &[&str] = &[
    "airani_iofifteen",
    "akai_haato",
    "aki_rosenthal",
    "amane_kanata",
    "ayunda_risu",
    "azki",
    "cecilia_immergreen",
    "ceres_fauna",
    "elizabeth_rose_bloodflame",
    "fuwamoco",
    "gawr_gura",
    "gigi_murin",
    "hakos_baelz",
    "hakui_koyori",
    "himemori_luna",
    "hiodoshi_ao",
    "hoshimachi_suisei",
    "houshou_marine",
    "ichijou_ririka",
    "juufuutei_raden",
    "kaela_kovalskia",
    "kazama_iroha",
    "kobo_kanaeru",
    "koseki_bijou",
    "kureiji_ollie",
    "laplus_darknesss",
    "minato_aqua",
    "momosuzu_nene",
    "moona_hoshinova",
    "mori_calliope",
    "murasaki_shion",
    "nakiri_ayame",
    "nanashi_mumei",
    "natsuiro_matsuri",
    "nerissa_ravencroft",
    "ninomae_inanis",
    "omaru_polka",
    "oozora_subaru",
    "others",
    "otonose_kanade",
    "ouro_kronii",
    "pavolia_reine",
    "raora_panthera",
    "roboco",
    "sakamata_chloe",
    "sakura_miko",
    "shiori_novella",
    "shirakami_fubuki",
    "shiranui_flare",
    "shirogane_noel",
    "shishiro_botan",
    "takanashi_kiara",
    "takane_lui",
    "todoroki_hajime",
    "tokoyami_towa",
    "tsunomaki_watame",
    "usada_pekora",
    "vestia_zeta",
    "watson_amelia",
    "yozora_mel",
    "yukihana_lamy",
    "yuzuki_choco",
];
static HOLO_HOIN_CLASS_MAP: OnceLock<HashMap<String, HoloHoinMeta>> = OnceLock::new();
static HOLO_HOIN_CLASS_MAP_JA: OnceLock<HashMap<String, HoloHoinMeta>> = OnceLock::new();

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

impl HoloHoinMeta {
    pub fn from_class_key(class_key: &str) -> Self {
        Self::from_class_key_with_locale(class_key, NameLocale::En)
    }

    pub fn from_class_key_with_locale(class_key: &str, locale: NameLocale) -> Self {
        let localized = match locale {
            NameLocale::En => None,
            NameLocale::Ja => holo_hoin_class_map_ja().get(class_key).cloned(),
        };

        localized
            .or_else(|| holo_hoin_class_map().get(class_key).cloned())
            .unwrap_or_else(|| meta(class_key, None, None, None))
    }

    pub fn relative_destination_for_class_key(
        class_key: &str,
        locale: NameLocale,
        file_name: &OsStr,
    ) -> PathBuf {
        Self::from_class_key_with_locale(class_key, locale).relative_destination(file_name)
    }

    pub fn relative_destination(&self, file_name: &OsStr) -> PathBuf {
        let Some(affiliation) = self
            .affiliation
            .as_deref()
            .map(str::trim)
            .filter(|value| !value.is_empty())
        else {
            return PathBuf::from("Others").join(file_name);
        };

        let second_level = match (self.generation, normalized_group(self.group.as_deref())) {
            (Some(generation), Some(group)) => format!("{generation:02} - {group}"),
            (Some(generation), None) => format!("{generation:02}"),
            (None, _) => "Others".to_string(),
        };

        let character = normalized_character_name(self.char_name.as_str()).unwrap_or("Others");

        PathBuf::from(affiliation)
            .join(second_level)
            .join(character)
            .join(file_name)
    }
}

pub fn output_class_keys() -> &'static [&'static str] {
    HOLO_HOIN_OUTPUT_CLASS_KEYS
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

fn normalized_group(group: Option<&str>) -> Option<&str> {
    group.and_then(|value| {
        let trimmed = value.trim();
        if trimmed.is_empty() {
            None
        } else {
            Some(trimmed)
        }
    })
}

fn normalized_character_name(name: &str) -> Option<&str> {
    let trimmed = name.trim();
    if trimmed.is_empty() || trimmed.eq_ignore_ascii_case("others") {
        None
    } else {
        Some(trimmed)
    }
}

fn meta(
    char_name: &str,
    generation: Option<u32>,
    group: Option<&str>,
    affiliation: Option<&str>,
) -> HoloHoinMeta {
    HoloHoinMeta {
        char_name: char_name.to_owned(),
        generation,
        group: group.map(str::to_owned),
        affiliation: affiliation.map(str::to_owned),
    }
}

fn holo_hoin_class_map() -> &'static HashMap<String, HoloHoinMeta> {
    HOLO_HOIN_CLASS_MAP.get_or_init(|| {
        serde_json::from_str(HOLO_HOIN_CLASS_MAP_JSON)
            .expect("holo_hoin_class_map_en.json must contain a valid class-key map")
    })
}

fn holo_hoin_class_map_ja() -> &'static HashMap<String, HoloHoinMeta> {
    HOLO_HOIN_CLASS_MAP_JA.get_or_init(|| {
        serde_json::from_str(HOLO_HOIN_CLASS_MAP_JA_JSON)
            .expect("holo_hoin_class_map_ja.json must contain a valid class-key map")
    })
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

    #[test]
    fn from_class_key_maps_known_character() {
        let meta = HoloHoinMeta::from_class_key("amane_kanata");

        assert_eq!(meta.char_name, "Amane Kanata");
        assert_eq!(meta.generation, Some(4));
        assert_eq!(meta.group.as_deref(), Some("holoForce"));
        assert_eq!(meta.affiliation.as_deref(), Some("JP"));
    }

    #[test]
    fn bundled_class_map_json_contains_known_character() {
        let class_map = holo_hoin_class_map();

        assert!(class_map.contains_key("amane_kanata"));
    }

    #[test]
    fn output_class_keys_match_known_index() {
        assert_eq!(output_class_keys().get(3).copied(), Some("amane_kanata"));
    }

    #[test]
    fn bundled_japanese_class_map_json_contains_known_character() {
        let class_map = holo_hoin_class_map_ja();

        assert!(class_map.contains_key("amane_kanata"));
    }

    #[test]
    fn from_class_key_with_locale_prefers_japanese_name() {
        let meta = HoloHoinMeta::from_class_key_with_locale("amane_kanata", NameLocale::Ja);

        assert_eq!(meta.char_name, "天音かなた");
        assert_eq!(meta.generation, Some(4));
        assert_eq!(meta.group.as_deref(), Some("holoForce"));
        assert_eq!(meta.affiliation.as_deref(), Some("JP"));
    }

    #[test]
    fn from_class_key_with_locale_falls_back_for_unknown_class_key() {
        let meta = HoloHoinMeta::from_class_key_with_locale("unknown_class_key", NameLocale::Ja);

        assert_eq!(meta.char_name, "unknown_class_key");
        assert_eq!(meta.affiliation, None);
    }

    #[test]
    fn relative_destination_uses_full_hierarchy_when_present() {
        let path = meta("Amane Kanata", Some(4), Some("holoForce"), Some("JP"))
            .relative_destination(OsStr::new("input.png"));

        assert_eq!(
            path,
            PathBuf::from("JP/04 - holoForce/Amane Kanata/input.png")
        );
    }

    #[test]
    fn relative_destination_keeps_generation_without_group() {
        let path = meta("Amane Kanata", Some(4), None, Some("JP"))
            .relative_destination(OsStr::new("input.png"));

        assert_eq!(path, PathBuf::from("JP/04/Amane Kanata/input.png"));
    }

    #[test]
    fn relative_destination_uses_others_when_character_missing() {
        let path = meta("Others", Some(4), Some("holoForce"), Some("JP"))
            .relative_destination(OsStr::new("input.png"));

        assert_eq!(path, PathBuf::from("JP/04 - holoForce/Others/input.png"));
    }

    #[test]
    fn relative_destination_uses_affiliation_others_when_generation_missing() {
        let path = meta("Hiodoshi Ao", None, Some("ReGLOSS"), Some("JP"))
            .relative_destination(OsStr::new("input.png"));

        assert_eq!(path, PathBuf::from("JP/Others/Hiodoshi Ao/input.png"));
    }

    #[test]
    fn relative_destination_uses_root_others_when_affiliation_missing() {
        let path = meta("Others", None, None, None).relative_destination(OsStr::new("input.png"));

        assert_eq!(path, PathBuf::from("Others/input.png"));
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
