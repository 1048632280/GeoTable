use super::boundary::{AdminIndex, AdminPolygon};
use crate::model::{Dataset, Geometry, WarningCode};
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

    for record in &mut dataset.records {
        let Some(Geometry::Point { lon, lat }) = record.geometry else {
            continue;
        };
        if !is_wgs84_like(lon, lat) {
            continue;
        }

        let point = Point::new(lon, lat);
        let country = find_polygon(&index.countries, &point);
        record.derived.admin_country = country.map(|item| item.name.clone());
        record.derived.admin_level1 = find_polygon_for_country(
            &index.level1,
            &point,
            country.and_then(|item| item.code.as_deref()),
        )
        .map(|item| item.name.clone());
    }

    dataset
}

fn find_polygon_for_country<'a>(
    polygons: &'a RTree<AdminPolygon>,
    point: &Point<f64>,
    country_code: Option<&str>,
) -> Option<&'a AdminPolygon> {
    let envelope = AABB::from_point([point.x(), point.y()]);
    polygons
        .locate_in_envelope_intersecting(envelope)
        .find(|polygon| {
            polygon.polygon.contains(point)
                && country_code.is_none_or(|code| polygon.country_code.as_deref() == Some(code))
        })
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
