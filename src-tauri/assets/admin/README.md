# Administrative Boundary Assets

GeoTable packages the following WGS84 GeoJSON assets for offline statistical grouping:

- `admin0.geojson`: all 177 features from Natural Earth 5.1.2, Admin 0 Countries, 1:110m.
- `admin1.cn-in.geojson`: 68 features for China (32) and India (36), extracted from Natural Earth 5.1.2, Admin 1 States/Provinces, 1:10m.

Source:

- <https://github.com/nvkelso/natural-earth-vector/tree/v5.1.2/geojson>
- `ne_110m_admin_0_countries.geojson`
- `ne_10m_admin_1_states_provinces.geojson`

Natural Earth data is in the public domain: <https://www.naturalearthdata.com/about/terms-of-use/>.

The checked-in files retain only the geometry and the naming/code properties needed by GeoTable. Admin 0 names and China/India Admin 1 names prefer Natural Earth's `NAME_ZH` / `name_zh` value, with the source name as fallback. No geometry simplification beyond the source scale was applied.

These boundaries are approximate cartographic data for grouping and are not legal or authoritative boundaries. Admin 1 coverage is intentionally limited to China and India; records in other recognized countries keep `admin_level1` empty and produce an explicit import warning. GeoTable does not transform coordinates: lookup requires WGS84 longitude/latitude points.
