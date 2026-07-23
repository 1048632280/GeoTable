use crate::error::GeoTableError;
use crate::model::{
    Dataset, DerivedFields, FeatureRecord, FieldDefinition, FieldSource, FieldValue, Geometry,
};
use kml::types::{Element, Geometry as KmlGeometry, Placemark};
use kml::{Kml, KmlReader};
use std::collections::{BTreeMap, BTreeSet};
use std::fs::File;
use std::io::BufReader;
use std::path::Path;

pub fn import_kml_or_kmz(path: &Path) -> Result<Dataset, GeoTableError> {
    let root = if path
        .extension()
        .and_then(|value| value.to_str())
        .is_some_and(|extension| extension.eq_ignore_ascii_case("kmz"))
    {
        let mut reader = KmlReader::<_, f64>::from_kmz_path(path)
            .map_err(|error| GeoTableError::FileRead(error.to_string()))?;
        reader
            .read()
            .map_err(|error| GeoTableError::FileRead(error.to_string()))?
    } else {
        let file = File::open(path).map_err(|error| GeoTableError::FileRead(error.to_string()))?;
        let reader = BufReader::new(file);
        let mut kml_reader = KmlReader::<_, f64>::from_reader(reader);
        kml_reader
            .read()
            .map_err(|error| GeoTableError::FileRead(error.to_string()))?
    };

    let mut field_names = BTreeSet::new();
    let mut records = Vec::new();
    collect_placemarks(&root, &mut records, &mut field_names);

    if records.is_empty() {
        return Err(GeoTableError::EmptyKml);
    }

    let mut fields: Vec<FieldDefinition> = field_names
        .into_iter()
        .map(|name| FieldDefinition {
            name,
            source: FieldSource::Original,
        })
        .collect();
    fields.push(FieldDefinition {
        name: "admin_country".to_string(),
        source: FieldSource::Derived,
    });
    fields.push(FieldDefinition {
        name: "admin_level1".to_string(),
        source: FieldSource::Derived,
    });

    Ok(Dataset {
        file_name: path
            .file_name()
            .and_then(|value| value.to_str())
            .unwrap_or("dataset.kml")
            .to_string(),
        total_records: records.len(),
        fields,
        records,
        warnings: vec![],
    })
}

fn collect_placemarks(
    kml: &Kml,
    records: &mut Vec<FeatureRecord>,
    field_names: &mut BTreeSet<String>,
) {
    match kml {
        Kml::Placemark(placemark) => {
            if let Some(record) = placemark_to_record(records.len() + 1, placemark, field_names) {
                records.push(record);
            }
        }
        Kml::KmlDocument(document) => {
            for element in &document.elements {
                collect_placemarks(element, records, field_names);
            }
        }
        Kml::Document { elements, .. } => {
            for element in elements {
                collect_placemarks(element, records, field_names);
            }
        }
        Kml::Folder(folder) => {
            for element in &folder.elements {
                collect_placemarks(element, records, field_names);
            }
        }
        _ => {}
    }
}

fn placemark_to_record(
    id: usize,
    placemark: &Placemark,
    field_names: &mut BTreeSet<String>,
) -> Option<FeatureRecord> {
    let (lon, lat) = point_from_geometry(placemark.geometry.as_ref()?)?;
    let mut properties = BTreeMap::new();

    if let Some(name) = placemark.name.clone() {
        field_names.insert("name".to_string());
        properties.insert("name".to_string(), FieldValue::String(name));
    }

    for element in &placemark.children {
        if element.name == "ExtendedData" {
            collect_extended_data(element, &mut properties, field_names);
        }
    }

    Some(FeatureRecord {
        id,
        geometry: Some(Geometry::Point { lon, lat }),
        properties,
        derived: DerivedFields::default(),
    })
}

fn collect_extended_data(
    element: &Element,
    properties: &mut BTreeMap<String, FieldValue>,
    field_names: &mut BTreeSet<String>,
) {
    if element.name == "Data" {
        if let (Some(name), Some(value)) = (
            element.attrs.get("name"),
            element
                .children
                .iter()
                .find(|child| child.name == "value")
                .and_then(|child| child.content.as_ref()),
        ) {
            field_names.insert(name.clone());
            properties.insert(name.clone(), FieldValue::String(value.clone()));
        }
    }

    for child in &element.children {
        collect_extended_data(child, properties, field_names);
    }
}

fn point_from_geometry(geometry: &KmlGeometry) -> Option<(f64, f64)> {
    match geometry {
        KmlGeometry::Point(point) => Some((point.coord.x, point.coord.y)),
        _ => None,
    }
}
