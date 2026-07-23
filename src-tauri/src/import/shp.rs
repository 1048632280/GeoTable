use crate::error::GeoTableError;
use crate::model::{
    Dataset, DerivedFields, FeatureRecord, FieldDefinition, FieldSource, FieldValue, Geometry,
    ImportWarning, WarningCode,
};
use shapefile::{dbase, Reader, Shape};
use std::collections::{BTreeMap, BTreeSet};
use std::fs;
use std::path::{Path, PathBuf};

pub fn import_shp(path: &Path) -> Result<Dataset, GeoTableError> {
    ensure_sidecar(path, "dbf")?;
    ensure_sidecar(path, "shx")?;

    let mut reader =
        Reader::from_path(path).map_err(|error| GeoTableError::FileRead(error.to_string()))?;
    let field_names = read_dbf_field_names(path)?;
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

        let properties = convert_dbf_record(&dbf_record);
        records.push(FeatureRecord {
            id,
            geometry,
            properties,
            derived: DerivedFields::default(),
        });
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

fn read_dbf_field_names(path: &Path) -> Result<BTreeSet<String>, GeoTableError> {
    let reader = dbase::Reader::from_path(path.with_extension("dbf"))
        .map_err(|error| GeoTableError::FileRead(error.to_string()))?;

    Ok(reader
        .fields()
        .iter()
        .map(|field| field.name().to_string())
        .collect())
}

fn convert_dbf_record(record: &dbase::Record) -> BTreeMap<String, FieldValue> {
    let mut properties = BTreeMap::new();
    for (name, value) in record.as_ref() {
        properties.insert(name.to_string(), convert_dbf_value(value));
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
        _ => FieldValue::Null,
    }
}

fn display_path(path: PathBuf) -> String {
    path.to_string_lossy().to_string()
}
