use super::boundary::{AdminIndex, AdminPolygon};
use crate::model::{Dataset, Geometry, WarningCode};
use geo::{Contains, Point};

pub fn enrich_dataset(mut dataset: Dataset, index: &AdminIndex) -> Dataset {
    if dataset
        .warnings
        .iter()
        .any(|warning| warning.code == WarningCode::NonWgs84 && warning.record_id.is_none())
    {
        return dataset;
    }

    for record in &mut dataset.records {
        let Some(Geometry::Point { lon, lat }) = record.geometry else {
            continue;
        };
        if !is_wgs84_like(lon, lat) {
            continue;
        }

        let point = Point::new(lon, lat);
        record.derived.admin_country =
            find_polygon(&index.countries, &point).map(|item| item.name.clone());
        record.derived.admin_level1 =
            find_polygon(&index.level1, &point).map(|item| item.name.clone());
    }

    dataset
}

fn find_polygon<'a>(polygons: &'a [AdminPolygon], point: &Point<f64>) -> Option<&'a AdminPolygon> {
    polygons
        .iter()
        .filter(|polygon| bbox_contains(polygon.bbox, point.x(), point.y()))
        .find(|polygon| polygon.polygon.contains(point))
}

fn bbox_contains(bbox: [f64; 4], lon: f64, lat: f64) -> bool {
    lon >= bbox[0] && lat >= bbox[1] && lon <= bbox[2] && lat <= bbox[3]
}

fn is_wgs84_like(lon: f64, lat: f64) -> bool {
    lon.is_finite()
        && lat.is_finite()
        && (-180.0..=180.0).contains(&lon)
        && (-90.0..=90.0).contains(&lat)
}
