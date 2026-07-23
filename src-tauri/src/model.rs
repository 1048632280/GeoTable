use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

pub const DERIVED_FIELD_NAMES: [&str; 2] = ["admin_country", "admin_level1"];

pub fn unique_source_field_name(
    source_name: &str,
    used_names: &std::collections::BTreeSet<String>,
) -> String {
    let base = if DERIVED_FIELD_NAMES.contains(&source_name) {
        format!("source_{source_name}")
    } else {
        source_name.to_string()
    };
    if !used_names.contains(&base) && !DERIVED_FIELD_NAMES.contains(&base.as_str()) {
        return base;
    }

    for suffix in 2.. {
        let candidate = format!("{base}_{suffix}");
        if !used_names.contains(&candidate) {
            return candidate;
        }
    }
    unreachable!()
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(untagged)]
pub enum FieldValue {
    String(String),
    Number(f64),
    Bool(bool),
    Null,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub enum FieldSource {
    Original,
    Derived,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct FieldDefinition {
    pub name: String,
    pub source: FieldSource,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(tag = "type")]
pub enum Geometry {
    Point { lon: f64, lat: f64 },
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Default)]
pub struct DerivedFields {
    pub admin_country: Option<String>,
    pub admin_level1: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct FeatureRecord {
    pub id: usize,
    pub geometry: Option<Geometry>,
    pub properties: BTreeMap<String, FieldValue>,
    pub derived: DerivedFields,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum WarningCode {
    NonPointGeometry,
    MissingGeometry,
    NonWgs84,
    AdminLookupFailed,
    EncodingFallback,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ImportWarning {
    pub code: WarningCode,
    pub message: String,
    pub record_id: Option<usize>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Dataset {
    pub file_name: String,
    pub total_records: usize,
    pub fields: Vec<FieldDefinition>,
    pub records: Vec<FeatureRecord>,
    pub warnings: Vec<ImportWarning>,
}

impl FeatureRecord {
    pub fn field_as_string(&self, field: &str) -> Option<String> {
        if field == "admin_country" {
            return self.derived.admin_country.clone();
        }
        if field == "admin_level1" {
            return self.derived.admin_level1.clone();
        }
        self.properties.get(field).and_then(FieldValue::as_string)
    }
}

impl FieldValue {
    pub fn as_string(&self) -> Option<String> {
        match self {
            FieldValue::String(value) => Some(value.clone()),
            FieldValue::Number(value) => Some(value.to_string()),
            FieldValue::Bool(value) => Some(value.to_string()),
            FieldValue::Null => None,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn serializes_dataset_with_derived_admin_fields() {
        let record = FeatureRecord {
            id: 1,
            geometry: Some(Geometry::Point {
                lon: 102.7,
                lat: 25.0,
            }),
            properties: BTreeMap::from([(
                "name".to_string(),
                FieldValue::String("茶树".to_string()),
            )]),
            derived: DerivedFields {
                admin_country: Some("中国".to_string()),
                admin_level1: Some("云南".to_string()),
            },
        };

        let dataset = Dataset {
            file_name: "tea.kml".to_string(),
            total_records: 1,
            fields: vec![FieldDefinition {
                name: "name".to_string(),
                source: FieldSource::Original,
            }],
            records: vec![record],
            warnings: vec![],
        };

        let json = serde_json::to_string(&dataset).expect("dataset serializes");
        assert!(json.contains("admin_country"));
        assert!(json.contains("茶树"));
    }
}
