use serde::{Deserialize, Serialize};

/// Placeholder root document for future metadata schema work
#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq, Eq)]
pub struct MetadataDocument {}

#[cfg(test)]
mod tests {
    use super::MetadataDocument;

    #[test]
    fn default_document_serializes_to_empty_object() {
        let document = MetadataDocument::default();
        let json = serde_json::to_string(&document).expect("document should serialize");
        assert_eq!(json, "{}");
    }
}
