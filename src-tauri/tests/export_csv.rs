use geotable_lib::export::write_csv;
use geotable_lib::model::{
    Dataset, DerivedFields, FeatureRecord, FieldDefinition, FieldSource, FieldValue, Geometry,
};
use std::collections::BTreeMap;
use std::fs;

#[test]
fn exports_filtered_records_with_derived_fields_as_utf8_csv() {
    let dir = tempfile::tempdir().expect("temp dir");
    let path = dir.path().join("filtered.csv");
    let dataset = Dataset {
        file_name: "tea.kml".to_string(),
        total_records: 2,
        fields: vec![
            FieldDefinition {
                name: "name".to_string(),
                source: FieldSource::Original,
            },
            FieldDefinition {
                name: "admin_country".to_string(),
                source: FieldSource::Derived,
            },
            FieldDefinition {
                name: "admin_level1".to_string(),
                source: FieldSource::Derived,
            },
        ],
        records: vec![
            FeatureRecord {
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
            },
            FeatureRecord {
                id: 2,
                geometry: Some(Geometry::Point {
                    lon: 77.2,
                    lat: 28.6,
                }),
                properties: BTreeMap::from([(
                    "name".to_string(),
                    FieldValue::String("茶树（印度）".to_string()),
                )]),
                derived: DerivedFields {
                    admin_country: Some("印度".to_string()),
                    admin_level1: None,
                },
            },
        ],
        warnings: vec![],
    };

    write_csv(&path, &dataset, &[1]).expect("write csv");

    let content = fs::read_to_string(path).expect("read csv");
    assert!(content.contains("name,admin_country,admin_level1"));
    assert!(content.contains("茶树,中国,云南"));
    assert!(!content.contains("茶树（印度）"));
}
