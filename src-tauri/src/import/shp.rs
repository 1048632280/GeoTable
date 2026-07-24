use crate::error::GeoTableError;
use crate::model::{
    unique_source_field_name, Dataset, DerivedFields, FeatureRecord, FieldDefinition, FieldSource,
    FieldValue, Geometry, ImportWarning, WarningCode,
};
use shapefile::{dbase, Reader, Shape, ShapeReader};
use std::collections::{BTreeMap, BTreeSet};
use std::fs::{self, File};
use std::io::{BufReader, Read};
use std::path::{Path, PathBuf};

pub fn import_shp(path: &Path) -> Result<Dataset, GeoTableError> {
    ensure_sidecar(path, "dbf")?;
    ensure_sidecar(path, "shx")?;

    let (mut reader, field_mapping) = open_shapefile_reader(path)?;
    let mut records = Vec::new();
    let mut warnings = Vec::new();

    if !has_wgs84_geographic_prj(path) {
        warnings.push(ImportWarning {
            code: WarningCode::NonWgs84,
            message: "SHP 缺少 .prj 文件或其坐标系不像 WGS84 经纬度坐标；行政区识别可能被跳过或结果无效。"
                .to_string(),
            record_id: None,
        });
    }

    for result in reader.iter_shapes_and_records() {
        let (shape, dbf_record) =
            result.map_err(|error| GeoTableError::FileRead(error.to_string()))?;
        let id = records.len() + 1;
        let geometry = match shape {
            Shape::Point(point) => point_geometry(point.x, point.y),
            Shape::PointM(point) => point_geometry(point.x, point.y),
            Shape::PointZ(point) => point_geometry(point.x, point.y),
            _ => {
                warnings.push(ImportWarning {
                    code: WarningCode::NonPointGeometry,
                    message: "非点几何已保留属性表，但不参与行政区识别。".to_string(),
                    record_id: Some(id),
                });
                None
            }
        };

        let properties = convert_dbf_record(&dbf_record, &field_mapping);
        records.push(FeatureRecord {
            id,
            geometry,
            properties,
            derived: DerivedFields::default(),
        });
    }

    let mut fields: Vec<FieldDefinition> = field_mapping
        .values()
        .map(|name| FieldDefinition {
            name: name.clone(),
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
            .unwrap_or("dataset.shp")
            .to_string(),
        total_records: records.len(),
        fields,
        records,
        warnings,
    })
}

fn point_geometry(lon: f64, lat: f64) -> Option<Geometry> {
    Some(Geometry::Point { lon, lat })
}

fn has_wgs84_geographic_prj(path: &Path) -> bool {
    let prj_path = path.with_extension("prj");
    let Ok(contents) = fs::read_to_string(prj_path) else {
        return false;
    };

    let prj = contents.trim_start().to_ascii_uppercase();
    let is_wgs84 = prj.contains("WGS 84")
        || prj.contains("WGS84")
        || prj.contains("WGS_1984")
        || prj.contains("WGS 1984");
    let is_geographic = matches!(
        prj.split_once('[').map(|(root, _)| root.trim()),
        Some("GEOGCS" | "GEOGCRS" | "GEODCRS")
    );

    is_wgs84 && is_geographic
}

fn ensure_sidecar(path: &Path, extension: &str) -> Result<(), GeoTableError> {
    let sidecar = path.with_extension(extension);
    if sidecar.exists() {
        Ok(())
    } else {
        Err(GeoTableError::MissingShpSidecar(display_path(sidecar)))
    }
}

type ShapefileReader = Reader<BufReader<File>, BufReader<File>>;

fn open_shapefile_reader(
    path: &Path,
) -> Result<(ShapefileReader, BTreeMap<String, String>), GeoTableError> {
    let shape_reader =
        ShapeReader::from_path(path).map_err(|error| GeoTableError::FileRead(error.to_string()))?;
    let dbf_path = path.with_extension("dbf");
    let dbf_reader = match read_cpg_encoding(path) {
        Some(encoding) => dbase::ReaderBuilder::new()
            .with_encoding(encoding)
            .open(&dbf_path),
        None => dbase::Reader::from_path(&dbf_path),
    }
    .map_err(|error| GeoTableError::FileRead(error.to_string()))?;

    let mut used_names = BTreeSet::new();
    let mut field_mapping = BTreeMap::new();
    for field in dbf_reader.fields() {
        let source_name = field.name().to_string();
        let output_name = unique_source_field_name(&source_name, &used_names);
        used_names.insert(output_name.clone());
        field_mapping.insert(source_name, output_name);
    }
    Ok((Reader::new(shape_reader, dbf_reader), field_mapping))
}

fn read_cpg_encoding(path: &Path) -> Option<dbase::encoding::DynEncoding> {
    let mut label = String::new();
    File::open(path.with_extension("cpg"))
        .ok()?
        .take(1026)
        .read_to_string(&mut label)
        .ok()?;
    (label.len() <= 1025).then_some(())?;
    dbase::encoding::DynEncoding::from_name(label.trim().trim_start_matches('\u{feff}'))
}

fn convert_dbf_record(
    record: &dbase::Record,
    field_mapping: &BTreeMap<String, String>,
) -> BTreeMap<String, FieldValue> {
    let mut properties = BTreeMap::new();
    for (name, value) in record.as_ref() {
        let output_name = field_mapping.get(name).unwrap_or(name);
        properties.insert(output_name.to_string(), convert_dbf_value(value));
    }
    properties
}

fn convert_dbf_value(value: &dbase::FieldValue) -> FieldValue {
    match value {
        dbase::FieldValue::Character(Some(value)) => FieldValue::String(value.trim().to_string()),
        dbase::FieldValue::Numeric(Some(value)) => FieldValue::Number(*value),
        dbase::FieldValue::Float(Some(value)) => FieldValue::Number((*value).into()),
        dbase::FieldValue::Logical(Some(value)) => FieldValue::Bool(*value),
        dbase::FieldValue::Date(Some(value)) => FieldValue::String(value.to_string()),
        dbase::FieldValue::Integer(value) => FieldValue::Number((*value).into()),
        dbase::FieldValue::Currency(value) | dbase::FieldValue::Double(value) => {
            FieldValue::Number(*value)
        }
        dbase::FieldValue::DateTime(value) => FieldValue::String(format!(
            "{} {:02}:{:02}:{:02}",
            value.date(),
            value.time().hours(),
            value.time().minutes(),
            value.time().seconds()
        )),
        dbase::FieldValue::Memo(value) => FieldValue::String(value.clone()),
        dbase::FieldValue::Character(None)
        | dbase::FieldValue::Numeric(None)
        | dbase::FieldValue::Float(None)
        | dbase::FieldValue::Logical(None)
        | dbase::FieldValue::Date(None) => FieldValue::Null,
    }
}

fn display_path(path: PathBuf) -> String {
    path.to_string_lossy().to_string()
}

#[cfg(test)]
mod tests {
    use super::*;
    use dbase::{Date, DateTime, Time};

    #[test]
    fn converts_all_supported_dbf_value_variants() {
        let date = Date::new(24, 7, 2026).expect("date");
        let datetime = DateTime::new(date, Time::new(13, 5, 9).expect("time"));
        let cases = [
            (
                dbase::FieldValue::Character(Some(" 文本 ".to_string())),
                FieldValue::String("文本".to_string()),
            ),
            (
                dbase::FieldValue::Numeric(Some(7.5)),
                FieldValue::Number(7.5),
            ),
            (dbase::FieldValue::Float(Some(2.5)), FieldValue::Number(2.5)),
            (
                dbase::FieldValue::Logical(Some(true)),
                FieldValue::Bool(true),
            ),
            (
                dbase::FieldValue::Date(Some(date)),
                FieldValue::String("20260724".to_string()),
            ),
            (dbase::FieldValue::Integer(42), FieldValue::Number(42.0)),
            (dbase::FieldValue::Currency(12.5), FieldValue::Number(12.5)),
            (dbase::FieldValue::Double(3.25), FieldValue::Number(3.25)),
            (
                dbase::FieldValue::DateTime(datetime),
                FieldValue::String("20260724 13:05:09".to_string()),
            ),
            (
                dbase::FieldValue::Memo("长文本".to_string()),
                FieldValue::String("长文本".to_string()),
            ),
            (dbase::FieldValue::Character(None), FieldValue::Null),
            (dbase::FieldValue::Numeric(None), FieldValue::Null),
            (dbase::FieldValue::Float(None), FieldValue::Null),
            (dbase::FieldValue::Logical(None), FieldValue::Null),
            (dbase::FieldValue::Date(None), FieldValue::Null),
        ];

        for (input, expected) in cases {
            assert_eq!(convert_dbf_value(&input), expected);
        }
    }
}
