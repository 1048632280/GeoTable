use crate::error::GeoTableError;
use geo::{Coord, LineString, Polygon};
use geojson::{GeoJson, GeometryValue, Position};
use rstar::{RTree, RTreeObject, AABB};

#[derive(Debug, Clone)]
pub struct AdminPolygon {
    pub name: String,
    pub country: Option<String>,
    pub country_code: Option<String>,
    pub code: Option<String>,
    pub bbox: [f64; 4],
    pub polygon: Polygon<f64>,
}

impl RTreeObject for AdminPolygon {
    type Envelope = AABB<[f64; 2]>;

    fn envelope(&self) -> Self::Envelope {
        AABB::from_corners([self.bbox[0], self.bbox[1]], [self.bbox[2], self.bbox[3]])
    }
}

#[derive(Debug, Clone)]
pub struct AdminIndex {
    pub countries: RTree<AdminPolygon>,
    pub level1: RTree<AdminPolygon>,
}

impl AdminIndex {
    pub fn from_geojson_str(admin0: &str, admin1: &str) -> Result<Self, GeoTableError> {
        let countries = parse_polygons(admin0, "name", None)?;
        let level1 = parse_polygons(admin1, "name", Some("country"))?;
        Ok(Self {
            countries: RTree::bulk_load(countries),
            level1: RTree::bulk_load(level1),
        })
    }
}

fn parse_polygons(
    source: &str,
    name_key: &str,
    country_key: Option<&str>,
) -> Result<Vec<AdminPolygon>, GeoTableError> {
    let geojson = source
        .parse::<GeoJson>()
        .map_err(|error| GeoTableError::AdminLookup(error.to_string()))?;

    let collection = match geojson {
        GeoJson::FeatureCollection(collection) => collection,
        _ => {
            return Err(GeoTableError::AdminLookup(
                "行政区边界必须是 FeatureCollection。".to_string(),
            ))
        }
    };

    let mut polygons = Vec::new();
    for feature in collection.features {
        let properties = feature.properties.unwrap_or_default();
        let name = properties
            .get(name_key)
            .and_then(|value| value.as_str())
            .unwrap_or("Unknown")
            .to_string();
        let country = country_key.and_then(|key| {
            properties
                .get(key)
                .and_then(|value| value.as_str())
                .map(ToString::to_string)
        });
        let country_code = properties
            .get("country_code")
            .and_then(|value| value.as_str())
            .map(ToString::to_string);
        let code = properties
            .get("code")
            .and_then(|value| value.as_str())
            .map(ToString::to_string);

        if let Some(geometry) = feature.geometry {
            match geometry.value {
                GeometryValue::Polygon { coordinates: rings } => {
                    if let Some(polygon) = polygon_from_rings(rings) {
                        let bbox = bbox_for_polygon(&polygon);
                        polygons.push(AdminPolygon {
                            name,
                            country,
                            country_code,
                            code,
                            bbox,
                            polygon,
                        });
                    }
                }
                GeometryValue::MultiPolygon {
                    coordinates: groups,
                } => {
                    for rings in groups {
                        if let Some(polygon) = polygon_from_rings(rings) {
                            let bbox = bbox_for_polygon(&polygon);
                            polygons.push(AdminPolygon {
                                name: name.clone(),
                                country: country.clone(),
                                country_code: country_code.clone(),
                                code: code.clone(),
                                bbox,
                                polygon,
                            });
                        }
                    }
                }
                _ => {}
            }
        }
    }

    Ok(polygons)
}

fn polygon_from_rings(rings: Vec<Vec<Position>>) -> Option<Polygon<f64>> {
    let mut iter = rings.into_iter();
    let exterior = line_string(iter.next()?)?;
    let interiors = iter.filter_map(line_string).collect();
    Some(Polygon::new(exterior, interiors))
}

fn line_string(coords: Vec<Position>) -> Option<LineString<f64>> {
    if coords.len() < 4 {
        return None;
    }

    let points = coords
        .into_iter()
        .map(|coord| {
            let values = coord.as_slice();
            let x = *values.first()?;
            let y = *values.get(1)?;
            (x.is_finite() && y.is_finite()).then_some(Coord { x, y })
        })
        .collect::<Option<Vec<_>>>()?;

    if points.first()? != points.last()? {
        return None;
    }

    Some(LineString::from(points))
}

fn bbox_for_polygon(polygon: &Polygon<f64>) -> [f64; 4] {
    let mut min_x = f64::INFINITY;
    let mut min_y = f64::INFINITY;
    let mut max_x = f64::NEG_INFINITY;
    let mut max_y = f64::NEG_INFINITY;

    for coord in polygon.exterior().coords() {
        min_x = min_x.min(coord.x);
        min_y = min_y.min(coord.y);
        max_x = max_x.max(coord.x);
        max_y = max_y.max(coord.y);
    }

    [min_x, min_y, max_x, max_y]
}
