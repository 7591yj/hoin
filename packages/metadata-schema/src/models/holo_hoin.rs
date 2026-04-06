//! holo-hoin model types for mapping API responses to organized metadata
//! This module is intended to be consumed by the holo-hoin model only

// Character names, group names, and related intellectual property used in this file
// are owned by COVER Corp. and used here under the hololive production Derivative Works
// Guidelines.
// COVER Corp. does not relinquish its copyright or related rights.
// See: https://hololivepro.com/terms/

use serde::{Deserialize, Serialize};
use std::{ffi::OsStr, path::PathBuf};

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
        match class_key {
            "airani_iofifteen" => meta("Airani Iofifteen", Some(1), None, Some("IND")),
            "akai_haato" => meta("Akai Haato", Some(1), None, Some("JP")),
            "aki_rosenthal" => meta("Aki Rosenthal", Some(1), None, Some("JP")),
            "amane_kanata" => meta("Amane Kanata", Some(4), Some("holoForce"), Some("JP")),
            "ayunda_risu" => meta("Ayunda Risu", Some(1), None, Some("IND")),
            "azki" => meta("AZKi", Some(0), None, Some("JP")),
            "cecilia_immergreen" => {
                meta("Cecilia Immergreen", Some(4), Some("Justice"), Some("EN"))
            }
            "ceres_fauna" => meta("Ceres Fauna", Some(2), Some("Council"), Some("EN")),
            "elizabeth_rose_bloodflame" => meta(
                "Elizabeth Rose Bloodflame",
                Some(4),
                Some("Justice"),
                Some("EN"),
            ),
            "fuwamoco" => meta("FUWAMOCO", Some(3), Some("Advent"), Some("EN")),
            "gawr_gura" => meta("Gawr Gura", Some(1), Some("Myth"), Some("EN")),
            "gigi_murin" => meta("Gigi Murin", Some(4), Some("Justice"), Some("EN")),
            "hakos_baelz" => meta("Hakos Baelz", Some(2), Some("Council"), Some("EN")),
            "hakui_koyori" => meta("Hakui Koyori", Some(6), Some("holoX"), Some("JP")),
            "himemori_luna" => meta("Himemori Luna", Some(4), Some("holoForce"), Some("JP")),
            "hiodoshi_ao" => meta("Hiodoshi Ao", None, Some("ReGLOSS"), Some("JP")),
            "hoshimachi_suisei" => meta("Hoshimachi Suisei", Some(0), None, Some("JP")),
            "houshou_marine" => meta("Houshou Marine", Some(3), Some("Fantasy"), Some("JP")),
            "ichijou_ririka" => meta("Ichijou Ririka", None, Some("ReGLOSS"), Some("JP")),
            "juufuutei_raden" => meta("Juufuutei Raden", None, Some("ReGLOSS"), Some("JP")),
            "kaela_kovalskia" => meta("Kaela Kovalskia", Some(3), None, Some("IND")),
            "kazama_iroha" => meta("Kazama Iroha", Some(6), Some("holoX"), Some("JP")),
            "kobo_kanaeru" => meta("Kobo Kanaeru", Some(3), None, Some("IND")),
            "koseki_bijou" => meta("Koseki Bijou", Some(3), Some("Advent"), Some("EN")),
            "kureiji_ollie" => meta("Kureiji Ollie", Some(2), None, Some("IND")),
            "laplus_darknesss" => meta("La+ Darknesss", Some(6), Some("holoX"), Some("JP")),
            "minato_aqua" => meta("Minato Aqua", Some(2), None, Some("JP")),
            "momosuzu_nene" => meta("Momosuzu Nene", Some(5), Some("NePoLaBo"), Some("JP")),
            "moona_hoshinova" => meta("Moona Hoshinova", Some(1), None, Some("IND")),
            "mori_calliope" => meta("Mori Calliope", Some(1), Some("Myth"), Some("EN")),
            "murasaki_shion" => meta("Murasaki Shion", Some(2), None, Some("JP")),
            "nakiri_ayame" => meta("Nakiri Ayame", Some(2), None, Some("JP")),
            "nanashi_mumei" => meta("Nanashi Mumei", Some(2), Some("Council"), Some("EN")),
            "natsuiro_matsuri" => meta("Natsuiro Matsuri", Some(1), None, Some("JP")),
            "nerissa_ravencroft" => meta("Nerissa Ravencroft", Some(3), Some("Advent"), Some("EN")),
            "ninomae_inanis" => meta("Ninomae Ina'nis", Some(1), Some("Myth"), Some("EN")),
            "omaru_polka" => meta("Omaru Polka", Some(5), Some("NePoLaBo"), Some("JP")),
            "oozora_subaru" => meta("Oozora Subaru", Some(2), None, Some("JP")),
            "otonose_kanade" => meta("Otonose Kanade", None, Some("ReGLOSS"), Some("JP")),
            "ouro_kronii" => meta("Ouro Kronii", Some(2), Some("Council"), Some("EN")),
            "others" => meta("Others", None, None, None),
            "pavolia_reine" => meta("Pavolia Reine", Some(2), None, Some("IND")),
            "raora_panthera" => meta("Raora Panthera", Some(4), Some("Justice"), Some("EN")),
            "roboco" => meta("Roboco-san", Some(0), None, Some("JP")),
            "sakamata_chloe" => meta("Sakamata Chloe", Some(6), Some("holoX"), Some("JP")),
            "sakura_miko" => meta("Sakura Miko", Some(0), None, Some("JP")),
            "shiori_novella" => meta("Shiori Novella", Some(3), Some("Advent"), Some("EN")),
            "shirakami_fubuki" => meta("Shirakami Fubuki", Some(1), None, Some("JP")),
            "shiranui_flare" => meta("Shiranui Flare", Some(3), Some("Fantasy"), Some("JP")),
            "shirogane_noel" => meta("Shirogane Noel", Some(3), Some("Fantasy"), Some("JP")),
            "shishiro_botan" => meta("Shishiro Botan", Some(5), Some("NePoLaBo"), Some("JP")),
            "takanashi_kiara" => meta("Takanashi Kiara", Some(1), Some("Myth"), Some("EN")),
            "takane_lui" => meta("Takane Lui", Some(6), Some("holoX"), Some("JP")),
            "todoroki_hajime" => meta("Todoroki Hajime", None, Some("ReGLOSS"), Some("JP")),
            "tokoyami_towa" => meta("Tokoyami Towa", Some(4), Some("holoForce"), Some("JP")),
            "tsunomaki_watame" => meta("Tsunomaki Watame", Some(4), Some("holoForce"), Some("JP")),
            "usada_pekora" => meta("Usada Pekora", Some(3), Some("Fantasy"), Some("JP")),
            "vestia_zeta" => meta("Vestia Zeta", Some(3), None, Some("IND")),
            "watson_amelia" => meta("Watson Amelia", Some(1), Some("Myth"), Some("EN")),
            "yozora_mel" => meta("Yozora Mel", Some(1), None, Some("JP")),
            "yukihana_lamy" => meta("Yukihana Lamy", Some(5), Some("NePoLaBo"), Some("JP")),
            "yuzuki_choco" => meta("Yuzuki Choco", Some(2), None, Some("JP")),
            unknown => meta(unknown, None, None, None),
        }
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
