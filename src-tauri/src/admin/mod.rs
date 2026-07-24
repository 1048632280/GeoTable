mod boundary;
mod lookup;

use crate::error::GeoTableError;
pub use boundary::AdminIndex;
pub use lookup::enrich_dataset;
use std::sync::OnceLock;

static PRODUCTION_ADMIN_INDEX: OnceLock<Result<AdminIndex, String>> = OnceLock::new();

pub fn production_admin_index() -> Result<&'static AdminIndex, GeoTableError> {
    PRODUCTION_ADMIN_INDEX
        .get_or_init(|| {
            AdminIndex::from_geojson_str(
                include_str!("../../assets/admin/admin0.geojson"),
                include_str!("../../assets/admin/admin1.geojson"),
            )
            .map_err(|error| error.to_string())
        })
        .as_ref()
        .map_err(|message| GeoTableError::AdminLookup(message.clone()))
}
