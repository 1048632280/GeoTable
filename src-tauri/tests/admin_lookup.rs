use geotable_lib::admin::{enrich_dataset, AdminIndex};
use geotable_lib::model::{
    Dataset, DerivedFields, FeatureRecord, FieldDefinition, FieldSource, FieldValue, Geometry,
};
use pretty_assertions::assert_eq;
use std::collections::BTreeMap;

const ADMIN0: &str = r#"{
  "type": "FeatureCollection",
  "features": [
    {
      "type": "Feature",
      "properties": { "name": "中国" },
      "geometry": {
        "type": "Polygon",
        "coordinates": [[[100,20],[125,20],[125,40],[100,40],[100,20]]]
      }
    },
    {
      "type": "Feature",
      "properties": { "name": "印度" },
      "geometry": {
        "type": "Polygon",
        "coordinates": [[[70,5],[90,5],[90,35],[70,35],[70,5]]]
      }
    }
  ]
}"#;

const ADMIN1: &str = r#"{
  "type": "FeatureCollection",
  "features": [
    {
      "type": "Feature",
      "properties": { "name": "云南", "country": "中国" },
      "geometry": {
        "type": "Polygon",
        "coordinates": [[[100,20],[110,20],[110,30],[100,30],[100,20]]]
      }
    },
    {
      "type": "Feature",
      "properties": { "name": "浙江", "country": "中国" },
      "geometry": {
        "type": "Polygon",
        "coordinates": [[[118,27],[123,27],[123,32],[118,32],[118,27]]]
      }
    }
  ]
}"#;

#[test]
fn enriches_points_with_country_and_level1() {
    let index = AdminIndex::from_geojson_str(ADMIN0, ADMIN1).expect("index");
    let dataset = Dataset {
        file_name: "tea.kml".to_string(),
        total_records: 2,
        fields: vec![FieldDefinition {
            name: "name".to_string(),
            source: FieldSource::Original,
        }],
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
                derived: DerivedFields::default(),
            },
            FeatureRecord {
                id: 2,
                geometry: Some(Geometry::Point {
                    lon: 77.2,
                    lat: 28.6,
                }),
                properties: BTreeMap::new(),
                derived: DerivedFields::default(),
            },
        ],
        warnings: vec![],
    };

    let enriched = enrich_dataset(dataset, &index);

    assert_eq!(
        enriched.records[0].derived.admin_country.as_deref(),
        Some("中国")
    );
    assert_eq!(
        enriched.records[0].derived.admin_level1.as_deref(),
        Some("云南")
    );
    assert_eq!(
        enriched.records[1].derived.admin_country.as_deref(),
        Some("印度")
    );
    assert_eq!(enriched.records[1].derived.admin_level1, None);
}
