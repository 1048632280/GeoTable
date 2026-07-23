use crate::error::GeoTableError;
use crate::model::Dataset;
use std::path::Path;

pub mod kml;
pub mod shp;

pub fn import_file(path: &Path) -> Result<Dataset, GeoTableError> {
    let extension = path
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or_default()
        .to_ascii_lowercase();

    match extension.as_str() {
        "kml" | "kmz" => kml::import_kml_or_kmz(path),
        "shp" => shp::import_shp(path),
        other => Err(GeoTableError::UnsupportedFormat(other.to_string())),
    }
}
