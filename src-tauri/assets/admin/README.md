# Administrative Boundary Assets

GeoTable bundles these WGS84 GeoJSON assets for offline administrative enrichment:

- `admin0.geojson`: Natural Earth Admin 0 Countries at 1:10m, using the China POV source.
- `admin1.geojson`: global Natural Earth Admin 1 States/Provinces at 1:10m.

The checked-in assets were generated from official `nvkelso/natural-earth-vector` tag `v5.1.2` with `prepare-natural-earth.mjs`:

- `ne_10m_admin_0_countries_chn.geojson`
- `ne_10m_admin_1_states_provinces.geojson`

Run `node src-tauri/assets/admin/prepare-natural-earth.mjs` from the repository root to download the two source files into a temporary directory and regenerate the bundled assets. The script retains only lookup names and codes plus geometry. It prefers Natural Earth's Chinese names where available. Taiwan Admin 1 features are normalized to `台湾省` with China (`CHN`) as their parent so they agree with the China POV Admin 0 geometry.

Natural Earth data is in the public domain: <https://www.naturalearthdata.com/about/terms-of-use/>. These boundaries are approximate cartographic data for grouping, not legal or authoritative boundaries. GeoTable does not transform coordinates; lookup requires WGS84 longitude/latitude points.
