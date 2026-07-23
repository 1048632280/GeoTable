use geotable_lib::admin::{enrich_dataset, AdminIndex};
use geotable_lib::model::{
    Dataset, DerivedFields, FeatureRecord, FieldDefinition, FieldSource, FieldValue, Geometry,
    ImportWarning, WarningCode,
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

const EMPTY_ADMIN: &str = r#"{
  "type": "FeatureCollection",
  "features": []
}"#;

const MULTIPOLYGON_ADMIN: &str = r#"{
  "type": "FeatureCollection",
  "features": [
    {
      "type": "Feature",
      "properties": { "name": "群岛" },
      "geometry": {
        "type": "MultiPolygon",
        "coordinates": [
          [[[100,20],[105,20],[105,25],[100,25],[100,20]]],
          [[[110,20],[115,20],[115,25],[110,25],[110,20]]]
        ]
      }
    }
  ]
}"#;

const HOLE_ADMIN: &str = r#"{
  "type": "FeatureCollection",
  "features": [
    {
      "type": "Feature",
      "properties": { "name": "带孔区域" },
      "geometry": {
        "type": "Polygon",
        "coordinates": [
          [[100,20],[110,20],[110,30],[100,30],[100,20]],
          [[104,24],[106,24],[106,26],[104,26],[104,24]]
        ]
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

#[test]
fn skips_dataset_with_non_wgs84_warning() {
    let index = AdminIndex::from_geojson_str(ADMIN0, ADMIN1).expect("index");
    let warning = ImportWarning {
        code: WarningCode::NonWgs84,
        message: "坐标系未知".to_string(),
        record_id: None,
    };
    let dataset = dataset_with_points(&[(102.7, 25.0)], vec![warning.clone()]);

    let enriched = enrich_dataset(dataset, &index);

    assert_eq!(enriched.warnings, vec![warning]);
    assert_eq!(enriched.records[0].derived, DerivedFields::default());
}

#[test]
fn skips_invalid_and_out_of_range_coordinates() {
    let index = AdminIndex::from_geojson_str(ADMIN0, ADMIN1).expect("index");
    let dataset = dataset_with_points(
        &[
            (f64::NAN, 25.0),
            (102.7, f64::INFINITY),
            (180.1, 25.0),
            (102.7, -90.1),
        ],
        vec![],
    );

    let enriched = enrich_dataset(dataset, &index);

    assert!(enriched
        .records
        .iter()
        .all(|record| record.derived == DerivedFields::default()));
}

#[test]
fn enriches_points_inside_multipolygon_parts() {
    let index = AdminIndex::from_geojson_str(MULTIPOLYGON_ADMIN, EMPTY_ADMIN).expect("index");
    let dataset = dataset_with_points(&[(112.0, 22.0)], vec![]);

    let enriched = enrich_dataset(dataset, &index);

    assert_eq!(
        enriched.records[0].derived.admin_country.as_deref(),
        Some("群岛")
    );
}

#[test]
fn excludes_points_inside_polygon_holes() {
    let index = AdminIndex::from_geojson_str(HOLE_ADMIN, EMPTY_ADMIN).expect("index");
    let dataset = dataset_with_points(&[(105.0, 25.0), (102.0, 25.0)], vec![]);

    let enriched = enrich_dataset(dataset, &index);

    assert_eq!(enriched.records[0].derived.admin_country, None);
    assert_eq!(
        enriched.records[1].derived.admin_country.as_deref(),
        Some("带孔区域")
    );
}

#[test]
fn skips_invalid_boundary_rings() {
    let source = r#"{
      "type": "FeatureCollection",
      "features": [
        {
          "type": "Feature",
          "properties": { "name": "有效区域" },
          "geometry": {
            "type": "Polygon",
            "coordinates": [[[100,20],[110,20],[110,30],[100,30],[100,20]], [[], [101,21],[102,22]]]
          }
        },
        {
          "type": "Feature",
          "properties": { "name": "无效区域" },
          "geometry": {
            "type": "Polygon",
            "coordinates": [[[100,20],[101,21],[102,22]], [[100,20],[101,21],[102,22],[100,20]]]
          }
        }
      ]
    }"#;
    let index = AdminIndex::from_geojson_str(source, EMPTY_ADMIN).expect("index");
    let dataset = dataset_with_points(&[(105.0, 25.0)], vec![]);

    let enriched = enrich_dataset(dataset, &index);

    assert_eq!(
        enriched.records[0].derived.admin_country.as_deref(),
        Some("有效区域")
    );
}

fn dataset_with_points(points: &[(f64, f64)], warnings: Vec<ImportWarning>) -> Dataset {
    Dataset {
        file_name: "points.shp".to_string(),
        total_records: points.len(),
        fields: vec![],
        records: points
            .iter()
            .enumerate()
            .map(|(index, &(lon, lat))| FeatureRecord {
                id: index + 1,
                geometry: Some(Geometry::Point { lon, lat }),
                properties: BTreeMap::new(),
                derived: DerivedFields::default(),
            })
            .collect(),
        warnings,
    }
}
