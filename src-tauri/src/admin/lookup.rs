use super::boundary::{AdminIndex, AdminPolygon};
use crate::model::{Dataset, Geometry, ImportWarning, WarningCode};
use geo::{Contains, Point};
use rstar::{RTree, AABB};

pub fn enrich_dataset(mut dataset: Dataset, index: &AdminIndex) -> Dataset {
    if dataset
        .warnings
        .iter()
        .any(|warning| warning.code == WarningCode::NonWgs84 && warning.record_id.is_none())
    {
        return dataset;
    }

    let mut has_uncovered_level1 = false;
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
        if let Some(country) = record.derived.admin_country.as_deref() {
            has_uncovered_level1 |= !index.has_level1_coverage(country);
        }
    }

    if has_uncovered_level1 {
        dataset.warnings.push(ImportWarning {
            code: WarningCode::AdminLookupFailed,
            message: "内置一级行政区边界仅覆盖中国和印度；其他国家的 admin_level1 保持为空。"
                .to_string(),
            record_id: None,
        });
    }

    dataset
}

fn find_polygon<'a>(
    polygons: &'a RTree<AdminPolygon>,
    point: &Point<f64>,
) -> Option<&'a AdminPolygon> {
    let envelope = AABB::from_point([point.x(), point.y()]);
    polygons
        .locate_in_envelope_intersecting(envelope)
        .find(|polygon| polygon.polygon.contains(point))
}

fn is_wgs84_like(lon: f64, lat: f64) -> bool {
    lon.is_finite()
        && lat.is_finite()
        && (-180.0..=180.0).contains(&lon)
        && (-90.0..=90.0).contains(&lat)
}
