use crate::error::GeoTableError;
use crate::model::{
    Dataset, DerivedFields, FeatureRecord, FieldDefinition, FieldSource, FieldValue, Geometry,
    ImportWarning, WarningCode,
};
use kml::types::{Element, Geometry as KmlGeometry, Placemark};
use kml::{Kml, KmlReader};
use std::collections::{BTreeMap, BTreeSet};
use std::fs::File;
use std::io::{BufReader, Cursor, Read};
use std::path::Path;
use zip::ZipArchive;

pub fn import_kml_or_kmz(path: &Path) -> Result<Dataset, GeoTableError> {
    let root = if path
        .extension()
        .and_then(|value| value.to_str())
        .is_some_and(|extension| extension.eq_ignore_ascii_case("kmz"))
    {
        let kmz = File::open(path).map_err(|error| GeoTableError::FileRead(error.to_string()))?;
        let mut archive = ZipArchive::new(kmz)
            .map_err(|error| GeoTableError::FileRead(format!("无法读取 KMZ 压缩包：{error}")))?;
        let entry_index = select_kml_entry(&mut archive)?;
        let mut entry = archive.by_index(entry_index).map_err(|error| {
            GeoTableError::FileRead(format!("无法读取 KMZ 中的 KML 文档：{error}"))
        })?;
        let mut contents = Vec::new();
        entry.read_to_end(&mut contents).map_err(|error| {
            GeoTableError::FileRead(format!("无法读取 KMZ 中的 KML 文档：{error}"))
        })?;
        let mut reader = KmlReader::<_, f64>::from_reader(Cursor::new(contents));
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
    let mut warnings = Vec::new();
    collect_placemarks(&root, &mut records, &mut field_names, &mut warnings);

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
        warnings,
    })
}

fn select_kml_entry(archive: &mut ZipArchive<File>) -> Result<usize, GeoTableError> {
    let mut fallback = None;

    for index in 0..archive.len() {
        let entry = archive
            .by_index(index)
            .map_err(|error| GeoTableError::FileRead(format!("无法读取 KMZ 目录：{error}")))?;
        if entry.is_dir() {
            continue;
        }

        if entry.name() == "doc.kml" {
            return Ok(index);
        }

        if fallback.is_none()
            && Path::new(entry.name())
                .extension()
                .and_then(|extension| extension.to_str())
                .is_some_and(|extension| extension.eq_ignore_ascii_case("kml"))
        {
            fallback = Some(index);
        }
    }

    fallback.ok_or_else(|| GeoTableError::FileRead("KMZ 内未找到 KML 文档".to_string()))
}

fn collect_placemarks(
    kml: &Kml,
    records: &mut Vec<FeatureRecord>,
    field_names: &mut BTreeSet<String>,
    warnings: &mut Vec<ImportWarning>,
) {
    match kml {
        Kml::Placemark(placemark) => {
            match placemark_to_record(records.len() + 1, placemark, field_names) {
                Ok(record) => records.push(record),
                Err((code, message)) => warnings.push(ImportWarning {
                    code,
                    message,
                    record_id: None,
                }),
            }
        }
        Kml::KmlDocument(document) => {
            for element in &document.elements {
                collect_placemarks(element, records, field_names, warnings);
            }
        }
        Kml::Document { elements, .. } => {
            for element in elements {
                collect_placemarks(element, records, field_names, warnings);
            }
        }
        Kml::Folder(folder) => {
            for element in &folder.elements {
                collect_placemarks(element, records, field_names, warnings);
            }
        }
        _ => {}
    }
}

fn placemark_to_record(
    id: usize,
    placemark: &Placemark,
    field_names: &mut BTreeSet<String>,
) -> Result<FeatureRecord, (WarningCode, String)> {
    let (lon, lat) = point_from_placemark(placemark)?;
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

    Ok(FeatureRecord {
        id,
        geometry: Some(Geometry::Point { lon, lat }),
        properties,
        derived: DerivedFields::default(),
    })
}

fn point_from_placemark(placemark: &Placemark) -> Result<(f64, f64), (WarningCode, String)> {
    let geometry = placemark.geometry.as_ref().ok_or_else(|| {
        (
            WarningCode::MissingGeometry,
            "已跳过缺少几何信息的要素".to_string(),
        )
    })?;

    let KmlGeometry::Point(point) = geometry else {
        return Err((
            WarningCode::NonPointGeometry,
            "已跳过非点几何要素".to_string(),
        ));
    };

    let lon = point.coord.x;
    let lat = point.coord.y;
    if lon.is_finite()
        && lat.is_finite()
        && (-180.0..=180.0).contains(&lon)
        && (-90.0..=90.0).contains(&lat)
    {
        Ok((lon, lat))
    } else {
        Err((
            WarningCode::NonWgs84,
            "已跳过坐标无效或超出 WGS84 范围的点要素".to_string(),
        ))
    }
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
