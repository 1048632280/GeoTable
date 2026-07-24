use crate::error::GeoTableError;
use crate::model::{
    unique_source_field_name, Dataset, DerivedFields, FeatureRecord, FieldDefinition, FieldSource,
    FieldValue, Geometry, ImportWarning, WarningCode,
};
use kml::types::{Element, Geometry as KmlGeometry, Placemark};
use kml::{Kml, KmlReader};
use std::collections::{BTreeMap, BTreeSet};
use std::fs::File;
use std::io::{BufReader, Cursor, Read};
use std::path::Path;
use zip::ZipArchive;

const MAX_KMZ_KML_BYTES: u64 = 128 * 1024 * 1024;

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
        let entry = archive.by_index(entry_index).map_err(|error| {
            GeoTableError::FileRead(format!("无法读取 KMZ 中的 KML 文档：{error}"))
        })?;
        let size = entry.size();
        let contents = read_limited_kml_entry(entry, size)?;
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
    let mut field_mapping = BTreeMap::new();
    let mut records = Vec::new();
    let mut warnings = Vec::new();
    let mut placemark_id = 1;
    collect_placemarks(
        &root,
        &mut records,
        &mut field_names,
        &mut field_mapping,
        &mut warnings,
        &mut placemark_id,
    );

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

fn read_limited_kml_entry<R: Read>(
    reader: R,
    uncompressed_size: u64,
) -> Result<Vec<u8>, GeoTableError> {
    if uncompressed_size > MAX_KMZ_KML_BYTES {
        return Err(GeoTableError::FileRead(format!(
            "KMZ 中的 KML 文档超过 {} MB 限制",
            MAX_KMZ_KML_BYTES / 1024 / 1024
        )));
    }

    let mut limited = reader.take(MAX_KMZ_KML_BYTES + 1);
    let mut contents = Vec::new();
    limited.read_to_end(&mut contents).map_err(|error| {
        GeoTableError::FileRead(format!("无法读取 KMZ 中的 KML 文档：{error}"))
    })?;
    if contents.len() as u64 > MAX_KMZ_KML_BYTES {
        return Err(GeoTableError::FileRead(format!(
            "KMZ 中的 KML 文档超过 {} MB 限制",
            MAX_KMZ_KML_BYTES / 1024 / 1024
        )));
    }
    Ok(contents)
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
    field_mapping: &mut BTreeMap<String, String>,
    warnings: &mut Vec<ImportWarning>,
    placemark_id: &mut usize,
) {
    match kml {
        Kml::Placemark(placemark) => {
            let id = *placemark_id;
            *placemark_id += 1;
            match placemark_to_record(id, placemark, field_names, field_mapping) {
                Ok(record) => records.push(record),
                Err((code, message)) => warnings.push(ImportWarning {
                    code,
                    message,
                    record_id: Some(id),
                }),
            }
        }
        Kml::KmlDocument(document) => {
            for element in &document.elements {
                collect_placemarks(
                    element,
                    records,
                    field_names,
                    field_mapping,
                    warnings,
                    placemark_id,
                );
            }
        }
        Kml::Document { elements, .. } => {
            for element in elements {
                collect_placemarks(
                    element,
                    records,
                    field_names,
                    field_mapping,
                    warnings,
                    placemark_id,
                );
            }
        }
        Kml::Folder(folder) => {
            for element in &folder.elements {
                collect_placemarks(
                    element,
                    records,
                    field_names,
                    field_mapping,
                    warnings,
                    placemark_id,
                );
            }
        }
        _ => {}
    }
}

fn placemark_to_record(
    id: usize,
    placemark: &Placemark,
    field_names: &mut BTreeSet<String>,
    field_mapping: &mut BTreeMap<String, String>,
) -> Result<FeatureRecord, (WarningCode, String)> {
    let (lon, lat) = point_from_placemark(placemark)?;
    let mut properties = BTreeMap::new();

    if let Some(name) = placemark.name.clone() {
        let field_name = resolve_source_field_name("name", field_names, field_mapping);
        properties.insert(field_name, FieldValue::String(name));
    }

    for element in &placemark.children {
        if element.name == "ExtendedData" {
            collect_extended_data(element, &mut properties, field_names, field_mapping);
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
    field_mapping: &mut BTreeMap<String, String>,
) {
    if element.name == "Data" || element.name == "SimpleData" {
        if let (Some(name), Some(value)) = (
            element.attrs.get("name"),
            if element.name == "SimpleData" {
                element.content.as_ref()
            } else {
                element
                    .children
                    .iter()
                    .find(|child| child.name == "value")
                    .and_then(|child| child.content.as_ref())
            },
        ) {
            let field_name = resolve_source_field_name(name, field_names, field_mapping);
            properties.insert(field_name, FieldValue::String(value.clone()));
        }
    }

    for child in &element.children {
        collect_extended_data(child, properties, field_names, field_mapping);
    }
}

fn resolve_source_field_name(
    source_name: &str,
    field_names: &mut BTreeSet<String>,
    field_mapping: &mut BTreeMap<String, String>,
) -> String {
    if let Some(output_name) = field_mapping.get(source_name) {
        return output_name.clone();
    }

    let output_name = unique_source_field_name(source_name, field_names);
    field_names.insert(output_name.clone());
    field_mapping.insert(source_name.to_string(), output_name.clone());
    output_name
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Cursor;

    #[test]
    fn rejects_oversized_kmz_kml_entry_before_reading() {
        let error = read_limited_kml_entry(Cursor::new(Vec::<u8>::new()), MAX_KMZ_KML_BYTES + 1)
            .expect_err("oversized entry fails");

        assert!(error.user_message().contains("超过 128 MB 限制"));
    }
}
