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

#[test]
fn escapes_formula_leading_text_but_preserves_negative_numbers() {
    let dir = tempfile::tempdir().expect("temp dir");
    let path = dir.path().join("safe.csv");
    let dataset = Dataset {
        file_name: "safe.kml".to_string(),
        total_records: 1,
        fields: vec![
            FieldDefinition {
                name: "formula".to_string(),
                source: FieldSource::Original,
            },
            FieldDefinition {
                name: "number".to_string(),
                source: FieldSource::Original,
            },
        ],
        records: vec![FeatureRecord {
            id: 1,
            geometry: None,
            properties: BTreeMap::from([
                (
                    "formula".to_string(),
                    FieldValue::String("=1+1".to_string()),
                ),
                ("number".to_string(), FieldValue::Number(-12.5)),
            ]),
            derived: DerivedFields::default(),
        }],
        warnings: vec![],
    };

    write_csv(&path, &dataset, &[1]).expect("write safe csv");

    let content = fs::read_to_string(path).expect("read csv");
    assert!(content.contains("'=1+1,-12.5"));
}

#[test]
fn escapes_control_character_formula_prefixes() {
    let dir = tempfile::tempdir().expect("temp dir");
    let path = dir.path().join("control-safe.csv");
    let dataset = Dataset {
        file_name: "safe.kml".to_string(),
        total_records: 1,
        fields: vec![
            FieldDefinition {
                name: "tab_formula".to_string(),
                source: FieldSource::Original,
            },
            FieldDefinition {
                name: "spaced_formula".to_string(),
                source: FieldSource::Original,
            },
        ],
        records: vec![FeatureRecord {
            id: 1,
            geometry: None,
            properties: BTreeMap::from([
                (
                    "tab_formula".to_string(),
                    FieldValue::String("\t=1+1".to_string()),
                ),
                (
                    "spaced_formula".to_string(),
                    FieldValue::String("   @SUM(1,1)".to_string()),
                ),
            ]),
            derived: DerivedFields::default(),
        }],
        warnings: vec![],
    };

    write_csv(&path, &dataset, &[1]).expect("write safe csv");

    let content = fs::read_to_string(path).expect("read csv");
    assert!(content.contains("'\t=1+1"));
    assert!(content.contains("'   @SUM(1,1)"));
}

#[test]
fn replaces_existing_file_after_success_without_temp_residue() {
    let dir = tempfile::tempdir().expect("temp dir");
    let path = dir.path().join("replace.csv");
    fs::write(&path, "old content").expect("write old file");
    let dataset = Dataset {
        file_name: "replace.kml".to_string(),
        total_records: 0,
        fields: vec![FieldDefinition {
            name: "name".to_string(),
            source: FieldSource::Original,
        }],
        records: vec![],
        warnings: vec![],
    };

    write_csv(&path, &dataset, &[]).expect("replace csv");

    assert_eq!(
        fs::read_to_string(&path).expect("read replacement"),
        "name\n"
    );
    assert_eq!(fs::read_dir(dir.path()).expect("read dir").count(), 1);
}

#[test]
fn exports_unique_source_and_derived_admin_headers() {
    let dir = tempfile::tempdir().expect("temp dir");
    let path = dir.path().join("admin-fields.csv");
    let dataset = Dataset {
        file_name: "reserved.kml".to_string(),
        total_records: 1,
        fields: vec![
            FieldDefinition {
                name: "source_admin_country".to_string(),
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
        records: vec![FeatureRecord {
            id: 1,
            geometry: None,
            properties: BTreeMap::from([(
                "source_admin_country".to_string(),
                FieldValue::String("源国家".to_string()),
            )]),
            derived: DerivedFields {
                admin_country: Some("中华人民共和国".to_string()),
                admin_level1: Some("云南省".to_string()),
            },
        }],
        warnings: vec![],
    };

    write_csv(&path, &dataset, &[1]).expect("write admin fields csv");

    let content = fs::read_to_string(path).expect("read csv");
    assert_eq!(
        content,
        "source_admin_country,admin_country,admin_level1\n源国家,中华人民共和国,云南省\n"
    );
}
