# Manual Test Data Notes

Use one small WGS84 point SHP with `.shp`, `.shx`, `.dbf`, and `.prj` sidecars for manual import verification. The expected result is that GeoTable shows all DBF fields, record count equals the DBF row count, and point geometries have longitude/latitude values.

## KML Smoke Test

Prepare a small UTF-8 KML containing four point placemarks: two records whose searchable attribute text contains `茶树`, and two records whose searchable attribute text contains `水稻`. Give the placemarks at least one additional attribute field that is visible in the table. Use WGS84 longitude/latitude point coordinates so the derived administrative fields can be populated.

Expected checks:

1. Open the KML from the toolbar and confirm the total sample count is 4, matching the four placemarks.
2. Search for `茶` and confirm that only the two tea-related records remain visible.
3. Select `admin_country` in the statistics panel and confirm the category counts sum to the two currently visible records. If the two test points are in different countries, confirm the two category counts individually instead.
4. Export the current results as CSV and open the file with UTF-8 encoding. Confirm that the exported rows contain the Chinese text `茶树` and that the Chinese headers and values are not garbled.

Repeat the same import check with the equivalent KMZ when a packaged KML fixture is available. Clear the search or reopen the dataset before checking the full four-record count again.
