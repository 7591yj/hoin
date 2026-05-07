//! molu-hoin model types for mapping API responses to organized metadata
//! This module is intended to be consumed by the molu-hoin model only

// Character names, school names, club names, and related intellectual property
// used in this file are owned by NEXON / Yostar / NAT GAMES; they are referenced
// here as fan material for the purpose of image classification only.

use serde::{Deserialize, Serialize};
use std::{collections::HashMap, ffi::OsStr, path::PathBuf, sync::OnceLock};

use crate::routing::NameLocale;

const MOLU_HOIN_CLASS_MAP_JSON: &str = include_str!("molu_hoin_class_map_en.json");
const MOLU_HOIN_CLASS_MAP_JA_JSON: &str = include_str!("molu_hoin_class_map_ja.json");
// TODO: add auto guard for future edits or get info straight from the model
const MOLU_HOIN_OUTPUT_CLASS_KEYS: &[&str] = &[
    "airi_(blue_archive)",
    "akane_(blue_archive)",
    "akira_(blue_archive)",
    "ako_(blue_archive)",
    "aris_(blue_archive)",
    "arona_(blue_archive)",
    "aru_(blue_archive)",
    "asuna_(blue_archive)",
    "atsuko_(blue_archive)",
    "ayane_(blue_archive)",
    "azusa_(blue_archive)",
    "eimi_(blue_archive)",
    "eri_(blue_archive)",
    "fubuki_(blue_archive)",
    "fuuka_(blue_archive)",
    "hanako_(blue_archive)",
    "hare_(blue_archive)",
    "haruka_(blue_archive)",
    "haruna_(blue_archive)",
    "hasumi_(blue_archive)",
    "hibiki_(blue_archive)",
    "hifumi_(blue_archive)",
    "hikari_(blue_archive)",
    "himari_(blue_archive)",
    "hina_(blue_archive)",
    "hinata_(blue_archive)",
    "hiyori_(blue_archive)",
    "hoshino_(blue_archive)",
    "ibuki_(blue_archive)",
    "ichika_(blue_archive)",
    "iori_(blue_archive)",
    "iroha_(blue_archive)",
    "izuna_(blue_archive)",
    "justice_task_force_member_(blue_archive)",
    "kanna_(blue_archive)",
    "kanoe_(blue_archive)",
    "karin_(blue_archive)",
    "kasumi_(blue_archive)",
    "kayoko_(blue_archive)",
    "kazusa_(blue_archive)",
    "kei_(blue_archive)",
    "kikyou_(blue_archive)",
    "kirara_(blue_archive)",
    "kisaki_(blue_archive)",
    "koharu_(blue_archive)",
    "kokona_(blue_archive)",
    "koyuki_(blue_archive)",
    "maki_(blue_archive)",
    "mari_(blue_archive)",
    "midori_(blue_archive)",
    "mika_(blue_archive)",
    "misaki_(blue_archive)",
    "miyako_(blue_archive)",
    "miyo_(blue_archive)",
    "miyu_(blue_archive)",
    "moe_(blue_archive)",
    "momoi_(blue_archive)",
    "mutsuki_(blue_archive)",
    "nagisa_(blue_archive)",
    "natsu_(blue_archive)",
    "neru_(blue_archive)",
    "noa_(blue_archive)",
    "nonomi_(blue_archive)",
    "nozomi_(blue_archive)",
    "others",
    "plana_(blue_archive)",
    "professor_niyaniya_(blue_archive)",
    "reisa_(blue_archive)",
    "rio_(blue_archive)",
    "saki_(blue_archive)",
    "sakurako_(blue_archive)",
    "saori_(blue_archive)",
    "satsuki_(blue_archive)",
    "seia_(blue_archive)",
    "serika_(blue_archive)",
    "serina_(blue_archive)",
    "shigure_(blue_archive)",
    "shiroko_(blue_archive)",
    "shiroko_terror_(blue_archive)",
    "shun_(blue_archive)",
    "toki_(blue_archive)",
    "tsubaki_(blue_archive)",
    "tsurugi_(blue_archive)",
    "ui_(blue_archive)",
    "wakamo_(blue_archive)",
    "yoshimi_(blue_archive)",
    "yuuka_(blue_archive)",
    "yuzu_(blue_archive)",
];
static MOLU_HOIN_CLASS_MAP: OnceLock<HashMap<String, MoluHoinMeta>> = OnceLock::new();
static MOLU_HOIN_CLASS_MAP_JA: OnceLock<HashMap<String, MoluHoinMeta>> = OnceLock::new();

/// Raw response shape returned by the molu-hoin inference API
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub(crate) struct MoluHoinApiResponse {
    pub file_name: String,
    pub confidence: f32,
    pub meta: MoluHoinMeta,
}

/// Resolved metadata stored in the result document
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct MoluHoinMeta {
    pub char_name: String,
    pub school: Option<String>,
    pub club: Option<String>,
}

impl MoluHoinMeta {
    pub fn from_class_key(class_key: &str) -> Self {
        Self::from_class_key_with_locale(class_key, NameLocale::En)
    }

    pub fn from_class_key_with_locale(class_key: &str, locale: NameLocale) -> Self {
        let localized = match locale {
            NameLocale::En => None,
            NameLocale::Ja => molu_hoin_class_map_ja().get(class_key).cloned(),
        };

        localized
            .or_else(|| molu_hoin_class_map().get(class_key).cloned())
            .unwrap_or_else(|| meta(class_key, None, None))
    }

    pub fn relative_destination_for_class_key(
        class_key: &str,
        locale: NameLocale,
        file_name: &OsStr,
    ) -> PathBuf {
        Self::from_class_key_with_locale(class_key, locale).relative_destination(file_name)
    }

    pub fn relative_destination(&self, file_name: &OsStr) -> PathBuf {
        let Some(school) = self
            .school
            .as_deref()
            .map(str::trim)
            .filter(|value| !value.is_empty())
        else {
            return PathBuf::from("Others").join(file_name);
        };

        let club = self
            .club
            .as_deref()
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .unwrap_or("Others");

        let character = normalized_character_name(self.char_name.as_str()).unwrap_or("Others");

        PathBuf::from(school)
            .join(club)
            .join(character)
            .join(file_name)
    }
}

pub fn output_class_keys() -> &'static [&'static str] {
    MOLU_HOIN_OUTPUT_CLASS_KEYS
}

/// Final result document
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct MoluHoinResult {
    pub file_name: String,
    pub confidence: f32,
    pub meta: MoluHoinMeta,
}

impl From<MoluHoinApiResponse> for MoluHoinResult {
    fn from(response: MoluHoinApiResponse) -> Self {
        Self {
            file_name: response.file_name,
            confidence: response.confidence,
            meta: response.meta,
        }
    }
}

fn normalized_character_name(name: &str) -> Option<&str> {
    let trimmed = name.trim();
    if trimmed.is_empty() || trimmed.eq_ignore_ascii_case("others") {
        None
    } else {
        Some(trimmed)
    }
}

fn meta(char_name: &str, school: Option<&str>, club: Option<&str>) -> MoluHoinMeta {
    MoluHoinMeta {
        char_name: char_name.to_owned(),
        school: school.map(str::to_owned),
        club: club.map(str::to_owned),
    }
}

fn molu_hoin_class_map() -> &'static HashMap<String, MoluHoinMeta> {
    MOLU_HOIN_CLASS_MAP.get_or_init(|| {
        serde_json::from_str(MOLU_HOIN_CLASS_MAP_JSON)
            .expect("molu_hoin_class_map_en.json must contain a valid class-key map")
    })
}

fn molu_hoin_class_map_ja() -> &'static HashMap<String, MoluHoinMeta> {
    MOLU_HOIN_CLASS_MAP_JA.get_or_init(|| {
        serde_json::from_str(MOLU_HOIN_CLASS_MAP_JA_JSON)
            .expect("molu_hoin_class_map_ja.json must contain a valid class-key map")
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn from_class_key_maps_known_character() {
        let meta = MoluHoinMeta::from_class_key("hina_(blue_archive)");

        assert_eq!(meta.char_name, "Hina Sorasaki");
        assert_eq!(meta.school.as_deref(), Some("Gehenna"));
        assert_eq!(meta.club.as_deref(), Some("Prefect Team"));
    }

    #[test]
    fn from_class_key_with_locale_prefers_japanese_name() {
        let meta = MoluHoinMeta::from_class_key_with_locale(
            "hina_(blue_archive)",
            NameLocale::Ja,
        );

        assert_eq!(meta.char_name, "空崎ヒナ");
        assert_eq!(meta.school.as_deref(), Some("Gehenna"));
        assert_eq!(meta.club.as_deref(), Some("Prefect Team"));
    }

    #[test]
    fn from_class_key_falls_back_for_unknown_class_key() {
        let meta = MoluHoinMeta::from_class_key("unknown_class_key");

        assert_eq!(meta.char_name, "unknown_class_key");
        assert_eq!(meta.school, None);
        assert_eq!(meta.club, None);
    }

    #[test]
    fn relative_destination_uses_school_and_club() {
        let path = meta("Hina Sorasaki", Some("Gehenna"), Some("Prefect Team"))
            .relative_destination(OsStr::new("input.png"));

        assert_eq!(
            path,
            PathBuf::from("Gehenna/Prefect Team/Hina Sorasaki/input.png")
        );
    }

    #[test]
    fn relative_destination_uses_others_when_club_missing() {
        let path = meta("Plana", Some("Schale"), None)
            .relative_destination(OsStr::new("input.png"));

        assert_eq!(path, PathBuf::from("Schale/Others/Plana/input.png"));
    }

    #[test]
    fn relative_destination_uses_root_others_when_school_missing() {
        let path = meta("Others", None, None).relative_destination(OsStr::new("input.png"));

        assert_eq!(path, PathBuf::from("Others/input.png"));
    }

    #[test]
    fn output_class_keys_match_known_index() {
        assert_eq!(
            output_class_keys().get(24).copied(),
            Some("hina_(blue_archive)"),
        );
    }

    #[test]
    fn bundled_class_map_json_contains_known_character() {
        assert!(molu_hoin_class_map().contains_key("hina_(blue_archive)"));
    }

    #[test]
    fn bundled_japanese_class_map_json_contains_known_character() {
        assert!(molu_hoin_class_map_ja().contains_key("hina_(blue_archive)"));
    }

    #[test]
    fn from_api_response_into_works() {
        let api = MoluHoinApiResponse {
            file_name: "test.png".to_owned(),
            confidence: 0.92,
            meta: MoluHoinMeta {
                char_name: "Hina Sorasaki".to_owned(),
                school: Some("Gehenna".to_owned()),
                club: Some("Prefect Team".to_owned()),
            },
        };

        let result: MoluHoinResult = api.into();

        assert_eq!(result.file_name, "test.png");
        assert_eq!(result.meta.char_name, "Hina Sorasaki");
        assert_eq!(result.meta.school.as_deref(), Some("Gehenna"));
        assert_eq!(result.meta.club.as_deref(), Some("Prefect Team"));
    }
}
