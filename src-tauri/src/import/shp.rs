use crate::error::GeoTableError;
use crate::model::{
    Dataset, DerivedFields, FeatureRecord, FieldDefinition, FieldSource, FieldValue, Geometry,
    ImportWarning, WarningCode,
};
use shapefile::{dbase, Reader, Shape};
use std::collections::{BTreeMap, BTreeSet};
use std::path::{Path, PathBuf};

pub fn import_shp(path: &Path) -> Result<Dataset, GeoTableError> {
    ensure_sidecar(path, "dbf")?;
    ensure_sidecar(path, "shx")?;

    let mut reader =
        Reader::from_path(path).map_err(|error| GeoTableError::FileRead(error.to_string()))?;
    let mut field_names = BTreeSet::new();
    let mut records = Vec::new();
    let mut warnings = Vec::new();

    for result in reader.iter_shapes_and_records() {
        let (shape, dbf_record) =
            result.map_err(|error| GeoTableError::FileRead(error.to_string()))?;
        let id = records.len() + 1;
        let geometry = match shape {
            Shape::Point(point) => Some(Geometry::Point {
                lon: point.x,
                lat: point.y,
            }),
            _ => {
                warnings.push(ImportWarning {
                    code: WarningCode::NonPointGeometry,
                    message: "非点几何已保留属性表，但不参与行政区识别。".to_string(),
                    record_id: Some(id),
                });
                None
            }
        };

        let properties = convert_dbf_record(&dbf_record, &mut field_names);
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

fn ensure_sidecar(path: &Path, extension: &str) -> Result<(), GeoTableError> {
    let sidecar = path.with_extension(extension);
    if sidecar.exists() {
        Ok(())
    } else {
        Err(GeoTableError::MissingShpSidecar(display_path(sidecar)))
    }
}

fn convert_dbf_record(
    record: &dbase::Record,
    field_names: &mut BTreeSet<String>,
) -> BTreeMap<String, FieldValue> {
    let mut properties = BTreeMap::new();
    for (name, value) in record.as_ref() {
        field_names.insert(name.to_string());
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
