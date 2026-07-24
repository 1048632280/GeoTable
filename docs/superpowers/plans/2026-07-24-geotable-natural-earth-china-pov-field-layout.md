# GeoTable Natural Earth China POV, Field Visibility, Layout, and Drag Import Plan

## Global Constraints

- Work directly on `main`; the user explicitly approved using `main`.
- Keep `.codex/` and `.superpowers/` local and uncommitted.
- Use UTF-8 for all file reads/writes. In PowerShell, run `chcp 65001` and set `[Console]::OutputEncoding = [System.Text.Encoding]::UTF8`; read Chinese text with `Get-Content -Encoding UTF8`.
- Do not use `sed` or `awk` on files containing Chinese text.
- Code comments, when needed, should be Chinese.
- Use `apply_patch` for manual code edits.
- Natural Earth source must be the latest official `nvkelso/natural-earth-vector` release/tag checked during implementation, using China POV for Admin 0.
- Admin 0 must use Natural Earth China POV so Taiwan points resolve to China/CHN rather than a separate `TWN` country.
- Admin 1 must cover global first-level administrative divisions from Natural Earth. Taiwan points should resolve to `台湾省` for `admin_level1` when using China POV country matching.
- Keep the admin boundary asset bundled in the installer; do not switch to first-run download.
- Field hiding must not delete original fields or record properties; it only controls visibility in table/statistics and default search scope.
- Hidden fields are excluded from table and statistics. Hidden fields are searched only when the user enables the "搜索隐藏字段" option.
- Search defaults to fuzzy substring search. Exact search must be available as a user option.
- For field-heavy files, if total fields are `<= 40`, show all fields by default. If total fields are `> 40`, show derived fields plus the first 30 original fields by default and keep the rest hidden.
- Three-column layout widths must be draggable and persisted locally so restarting the app restores the user's layout.
- File drag-and-drop must support `.shp`, `.kml`, and `.kmz` with the existing backend import behavior.
- Existing workflows, tests, and release setup must remain intact.

## Task 1: Replace Admin Boundaries With Natural Earth China POV

Update the admin boundary source and backend lookup assets.

Requirements:

- Add or update a reproducible boundary preparation script under the repo, preferably in `src-tauri/assets/admin/`.
- Download/read Natural Earth GeoJSON from the latest official `nvkelso/natural-earth-vector` tag discovered at implementation time.
- Generate bundled assets from:
  - `ne_10m_admin_0_countries_chn.geojson`
  - `ne_10m_admin_1_states_provinces.geojson`
- Keep only properties needed for lookup:
  - Admin 0: display name, stable code, optional source code.
  - Admin 1: display name, parent country display name/code, stable admin code.
- Ensure Admin 0 China POV classifies a Taiwan coordinate such as `121.0, 23.7` as `admin_country = 中国` or an equivalent existing Chinese display value for China.
- Ensure Admin 1 classifies a Taiwan coordinate such as `121.0, 23.7` as `admin_level1 = 台湾省`.
- Remove the old "only China and India" warning behavior; global Admin 1 coverage is now expected.
- Update admin asset README to document Natural Earth China POV, global Admin 1, source files, tag/version, and caveat that boundaries are approximate cartographic data.
- Update Rust tests or add tests for:
  - China point resolves to country and province.
  - India point resolves to country and state.
  - Taiwan point resolves to China and `台湾省`.
  - A non-China/India global point resolves to a level-1 region where Natural Earth has coverage.

Acceptance:

- Backend admin enrichment still compiles.
- Rust tests covering admin lookup pass, or any blocked test command is reported with the exact blocker.
- Generated admin assets are committed, but temporary raw downloads are not.

## Task 2: Add Search Options and Field Visibility State

Extend frontend data/filter state so visibility and search behavior are explicit and testable.

Requirements:

- Extend frontend types and filter/search logic with:
  - visible field names or hidden field names.
  - `includeHiddenFieldsInSearch`.
  - `exactSearch`.
- Preserve all original fields and properties from imported files.
- Apply default field visibility:
  - If field count `<= 40`, all fields visible.
  - If field count `> 40`, visible fields are derived fields plus first 30 original fields; all other fields hidden.
- Data search must:
  - Search visible fields by default.
  - Include hidden fields only when `includeHiddenFieldsInSearch` is true.
  - Use substring/fuzzy matching by default.
  - Use exact string equality when `exactSearch` is true.
  - Continue to support selected search fields when that existing mode is used.
- Sorting and field filters must keep working when fields are hidden; hiding a field should remove or ignore UI access to its statistics/table display, but must not corrupt data.
- Add focused unit tests for:
  - Hidden fields excluded from search by default.
  - Hidden fields included when enabled.
  - Exact search behavior.
  - Default visibility threshold at 40 and above 40.

Acceptance:

- Frontend filtering tests pass.
- Types remain strict and no TypeScript errors are introduced.

## Task 3: Build Field Visibility UI and Wire Table/Statistics

Make field-heavy datasets manageable in the UI.

Requirements:

- Field panel must show every original/derived field in a searchable field list.
- Each field row must include an eye icon button:
  - visible state shows the field in table/statistics.
  - hidden state hides it from table/statistics.
- Use virtualized rendering for the field list so hundreds or thousands of fields remain responsive.
- Field rows should show field name plus source (`原始`/`派生`) and a compact sample/type hint when practical without expensive full scans.
- Add batch controls:
  - 全部显示
  - 全部隐藏
  - 只显示搜索结果
  - 隐藏空字段
- Table must receive only visible fields.
- Statistics field selector must list visible fields by default.
- If the selected statistics field is hidden, switch to `admin_country` if visible, otherwise the first visible field, otherwise empty.
- Search controls near the global search input must expose:
  - 搜索隐藏字段 checkbox.
  - 精确搜索 checkbox.
- Hidden field state must reset sensibly when a new dataset is imported using the default visibility rule from Task 2.

Acceptance:

- Field visibility changes immediately affect table columns and statistics field choices.
- Existing filtering by selected field values still works.
- Focused component/unit tests pass where practical.

## Task 4: Add Persistent Resizable Layout and Drag-and-Drop Import

Improve app ergonomics around the three-column workspace and file loading.

Requirements:

- Replace fixed `workbench-grid` column sizes with user-adjustable left, center, and right widths.
- Add draggable splitters between left/middle and middle/right columns.
- Enforce minimum practical widths for each pane so controls do not collapse into unusable layouts.
- Persist layout widths in local storage and restore them on app restart.
- Provide a reasonable fallback/default layout if saved values are invalid or viewport size changes.
- Support dragging `.shp`, `.kml`, or `.kmz` files onto the app window to import them.
- Reuse the same import path, status handling, warnings, field visibility initialization, and stats initialization as the open-file dialog.
- Show a clear error for unsupported dragged file types.

Acceptance:

- Width changes survive app reload.
- Dragging a supported file calls the existing backend import command.
- Unsupported drops do not crash and show a useful error.
- Frontend tests and TypeScript checks pass.
