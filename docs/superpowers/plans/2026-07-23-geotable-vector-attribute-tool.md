# GeoTable Vector Attribute Tool Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first Windows desktop version of GeoTable for opening `shp`、`kml`、`kmz` point datasets, browsing attributes, searching, filtering, counting categories, deriving country/admin-level-1 fields from WGS84 point coordinates, and exporting filtered results to CSV.

**Architecture:** Use Tauri v2 for the Windows desktop shell, React + TypeScript for the workbench UI, and Rust for file import, administrative-region lookup, and CSV export. Keep the data model shared and simple: records live in memory for the first version, the table renders with virtualization, and the file-reading boundary is isolated so a GDAL backend can be added without rewriting the UI.

**Tech Stack:** Tauri v2, React, TypeScript, pnpm, Vite, Rust 1.96.0, `shapefile = 0.9.0`, `kml = 0.14.0`, `geo = 0.33.1`, `geojson = 1.0.0`, `rstar = 0.13.0`, `csv = 1.4.0`, `thiserror = 2.0.19`, TanStack Table `8.21.3`, TanStack Virtual `3.14.8`, Vitest `4.1.10`.

## Global Constraints

- All file reads and writes must use UTF-8. In PowerShell, run `chcp 65001` and set `[Console]::OutputEncoding = [System.Text.Encoding]::UTF8`; read Chinese files with `Get-Content -Encoding UTF8`.
- Do not use `sed` or `awk` for files containing Chinese text.
- Code comments must be written in Chinese when comments are needed.
- First version targets Windows desktop.
- First version supports `shp`、`kml`、`kmz`.
- First version mainly guarantees point data.
- First version does not include a map preview.
- First version does not include `tif` / GeoTIFF.
- First version does not include full coordinate transformation.
- Administrative lookup only supports WGS84 longitude/latitude coordinates.
- KML/KMZ coordinates are treated as WGS84.
- SHP files that are not WGS84 longitude/latitude keep table/search/filter/statistics features, but administrative lookup is skipped with a Chinese warning.
- Do not introduce GDAL in the first version.
- Table browsing must handle roughly 100,000 rows using virtual rendering / 虚拟滚动.
- CSV export must use UTF-8.

---

## Source Notes Checked Before Planning

- Tauri v2 project creation and desktop architecture: `https://v2.tauri.app/start/create-project/`
- Tauri v2 dialog plugin for file open/save: `https://v2.tauri.app/plugin/dialog/`
- TanStack Table React package: `https://tanstack.com/table/latest`
- TanStack Virtual React package: `https://tanstack.com/virtual/latest`
- Natural Earth Admin 0 and Admin 1 data source: `https://www.naturalearthdata.com/`
- Rust crate versions verified with `cargo search` / `cargo info` on 2026-07-23.

## Planned File Structure

- `package.json`: pnpm scripts and frontend dependency versions.
- `vite.config.ts`: Vite + React + Vitest configuration.
- `tsconfig.json`: TypeScript configuration.
- `src/main.tsx`: React entry point.
- `src/App.tsx`: Workbench composition and app state.
- `src/styles.css`: Desktop workbench styling.
- `src/types/geo.ts`: Frontend data contracts.
- `src/lib/filtering.ts`: Pure filtering, searching, sorting, and statistics helpers.
- `src/lib/filtering.test.ts`: Unit tests for filtering/statistics behavior.
- `src/lib/exportPreview.ts`: Frontend CSV preview helpers used by tests.
- `src/components/Toolbar.tsx`: File open/export/status controls.
- `src/components/FieldPanel.tsx`: Field search and field-value filters.
- `src/components/DataTable.tsx`: Virtualized attribute table.
- `src/components/StatsPanel.tsx`: Manual field statistics and click-to-filter.
- `src-tauri/Cargo.toml`: Rust dependencies.
- `src-tauri/src/lib.rs`: Tauri command registration.
- `src-tauri/src/main.rs`: Tauri app entry point.
- `src-tauri/src/model.rs`: Rust data contracts matching TypeScript.
- `src-tauri/src/error.rs`: Rust error type and user-facing Chinese messages.
- `src-tauri/src/import/mod.rs`: Import module exports and dispatch.
- `src-tauri/src/import/shp.rs`: SHP reader.
- `src-tauri/src/import/kml.rs`: KML/KMZ reader.
- `src-tauri/src/admin/mod.rs`: Administrative lookup module exports.
- `src-tauri/src/admin/boundary.rs`: Boundary loading and indexing.
- `src-tauri/src/admin/lookup.rs`: Point-in-polygon lookup.
- `src-tauri/src/export.rs`: CSV export.
- `src-tauri/assets/admin/README.md`: Boundary dataset source, simplification, and license notes.
- `src-tauri/assets/admin/admin0.sample.geojson`: Small checked-in test country polygons.
- `src-tauri/assets/admin/admin1.sample.geojson`: Small checked-in test admin-level-1 polygons.
- `src-tauri/tests/import_kml.rs`: Rust integration tests for KML/KMZ.
- `src-tauri/tests/admin_lookup.rs`: Rust integration tests for administrative lookup.
- `src-tauri/tests/export_csv.rs`: Rust integration tests for CSV export.

---

### Task 1: Scaffold Tauri React TypeScript App

**Files:**
- Create: `package.json`
- Create: `pnpm-lock.yaml`
- Create: `index.html`
- Create: `vite.config.ts`
- Create: `tsconfig.json`
- Create: `src/main.tsx`
- Create: `src/App.tsx`
- Create: `src/App.test.tsx`
- Create: `src/styles.css`
- Create: `src-tauri/Cargo.toml`
- Create: `src-tauri/src/main.rs`
- Create: `src-tauri/src/lib.rs`
- Modify: `.gitignore`

**Interfaces:**
- Consumes: empty repository with existing `docs/superpowers/specs/2026-07-23-geotable-vector-attribute-tool-design.md`.
- Produces:
  - `pnpm dev` starts the Vite frontend.
  - `pnpm tauri dev` starts the Windows desktop shell.
  - `pnpm test` runs Vitest.
  - `cargo test --manifest-path src-tauri/Cargo.toml` runs Rust tests.

- [ ] **Step 1: Scaffold the project**

Run:

```powershell
chcp 65001
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$scaffold = Join-Path $env:TEMP "geotable-tauri-scaffold"
$resolvedTemp = [System.IO.Path]::GetFullPath($env:TEMP)
$resolvedScaffold = [System.IO.Path]::GetFullPath($scaffold)
if (-not $resolvedScaffold.StartsWith($resolvedTemp)) { throw "Scaffold path is outside temp directory" }
if (Test-Path -LiteralPath $resolvedScaffold) { Remove-Item -LiteralPath $resolvedScaffold -Recurse -Force }
pnpm create tauri-app@latest $resolvedScaffold --template react-ts --manager pnpm
Get-ChildItem -LiteralPath $resolvedScaffold -Force | ForEach-Object {
  Copy-Item -LiteralPath $_.FullName -Destination E:\GithubRepo\GeoTable -Recurse -Force
}
Remove-Item -LiteralPath $resolvedScaffold -Recurse -Force
```

Expected: the command creates a temporary scaffold, copies `package.json`, `src/`, and `src-tauri/` into `E:\GithubRepo\GeoTable`, then removes only the verified temp scaffold directory. If the CLI prompts, select:

```text
Project name: GeoTable
Identifier: com.geotable.app
Package manager: pnpm
UI template: React
UI flavor: TypeScript
```

- [ ] **Step 2: Install frontend dependencies**

Run:

```powershell
chcp 65001
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
pnpm add @tauri-apps/api@2.11.1 @tauri-apps/plugin-dialog@2.7.2 @tanstack/react-table@8.21.3 @tanstack/react-virtual@3.14.8 lucide-react@1.26.0
pnpm add -D vitest@4.1.10 jsdom@latest @testing-library/react@latest @testing-library/jest-dom@latest @testing-library/user-event@latest
```

Expected: `package.json` includes the listed dependencies and devDependencies.

- [ ] **Step 3: Install Rust dependencies**

Modify `src-tauri/Cargo.toml` so the dependency section contains these direct dependencies in addition to scaffold-generated Tauri dependencies:

```toml
[dependencies]
tauri = { version = "2", features = [] }
tauri-plugin-dialog = "2.7.2"
serde = { version = "1", features = ["derive"] }
serde_json = "1"
thiserror = "2.0.19"
shapefile = { version = "0.9.0", features = ["encoding_rs"] }
kml = "0.14.0"
geo = "0.33.1"
geojson = "1.0.0"
rstar = "0.13.0"
csv = "1.4.0"

[dev-dependencies]
tempfile = "3"
pretty_assertions = "1"
```

Keep the scaffold-generated `[build-dependencies]` and Tauri build configuration unchanged.

- [ ] **Step 4: Add baseline test script**

Modify `package.json` scripts to include:

```json
{
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "preview": "vite preview",
    "tauri": "tauri",
    "test": "vitest run",
    "test:watch": "vitest"
  }
}
```

- [ ] **Step 5: Configure Vitest**

Modify `vite.config.ts`:

```ts
import { defineConfig } from "vitest/config"
import react from "@vitejs/plugin-react"

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: [],
  },
})
```

- [ ] **Step 6: Replace starter UI with a neutral shell**

Modify `src/App.tsx`:

```tsx
import "./styles.css"

export default function App() {
  return (
    <main className="app-shell">
      <section className="empty-workbench">
        <h1>GeoTable</h1>
        <p>打开 shp、kml 或 kmz 文件后查看属性表。</p>
      </section>
    </main>
  )
}
```

Modify `src/styles.css`:

```css
* {
  box-sizing: border-box;
}

html,
body,
#root {
  width: 100%;
  height: 100%;
  margin: 0;
}

body {
  font-family:
    "Microsoft YaHei",
    "Segoe UI",
    system-ui,
    sans-serif;
  color: #172026;
  background: #f5f7f8;
}

button,
input,
select {
  font: inherit;
}

.app-shell {
  min-height: 100%;
}

.empty-workbench {
  min-height: 100vh;
  display: grid;
  place-items: center;
  align-content: center;
  gap: 8px;
}

.empty-workbench h1 {
  margin: 0;
  font-size: 32px;
  letter-spacing: 0;
}

.empty-workbench p {
  margin: 0;
  color: #5c6970;
}
```

- [ ] **Step 7: Add a frontend smoke test**

Create `src/App.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import App from "./App"

describe("App", () => {
  it("renders the GeoTable shell", () => {
    render(<App />)
    expect(screen.getByRole("heading", { name: "GeoTable" })).toBeInTheDocument()
    expect(screen.getByText("打开 shp、kml 或 kmz 文件后查看属性表。")).toBeInTheDocument()
  })
})
```

Create `src/test.setup.ts`:

```ts
import "@testing-library/jest-dom/vitest"
```

Modify `vite.config.ts`:

```ts
import { defineConfig } from "vitest/config"
import react from "@vitejs/plugin-react"

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["src/test.setup.ts"],
  },
})
```

- [ ] **Step 8: Verify scaffold**

Run:

```powershell
chcp 65001
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
pnpm test src/App.test.tsx
cargo test --manifest-path src-tauri/Cargo.toml
pnpm build
```

Expected:

```text
src/App.test.tsx passes
test result: ok
vite build succeeds
```

- [ ] **Step 9: Commit**

Run:

```powershell
git add package.json pnpm-lock.yaml index.html vite.config.ts tsconfig.json src src-tauri .gitignore
git commit -m "chore: scaffold tauri react app"
```

---

### Task 2: Define Shared Data Contracts

**Files:**
- Create: `src/types/geo.ts`
- Create: `src-tauri/src/model.rs`
- Create: `src-tauri/src/error.rs`
- Modify: `src-tauri/src/lib.rs`

**Interfaces:**
- Consumes: Task 1 scaffold.
- Produces:
  - TypeScript `FeatureRecord`, `Dataset`, `FilterState`, `StatsRow`, `ImportStatus`.
  - Rust `FeatureRecord`, `Dataset`, `Geometry`, `ImportWarning`.
  - Rust `GeoTableError` with `user_message() -> String`.

- [ ] **Step 1: Write TypeScript contract tests**

Create `src/types/geo.test.ts`:

```ts
import { describe, expect, it } from "vitest"
import type { Dataset, FeatureRecord } from "./geo"

describe("geo contracts", () => {
  it("allows records with original and derived fields", () => {
    const record: FeatureRecord = {
      id: 1,
      geometry: { type: "Point", lon: 102.7, lat: 25.0 },
      properties: { name: "茶树", count: 3, active: true, note: null },
      derived: { admin_country: "中国", admin_level1: "云南" },
    }

    const dataset: Dataset = {
      fileName: "tea.kml",
      totalRecords: 1,
      fields: [
        { name: "name", source: "original" },
        { name: "admin_country", source: "derived" },
      ],
      records: [record],
      warnings: [],
    }

    expect(dataset.records[0].derived.admin_level1).toBe("云南")
  })
})
```

- [ ] **Step 2: Run TypeScript contract test to verify it fails**

Run:

```powershell
pnpm test src/types/geo.test.ts
```

Expected: FAIL because `src/types/geo.ts` does not exist.

- [ ] **Step 3: Create TypeScript contracts**

Create `src/types/geo.ts`:

```ts
export type FieldValue = string | number | boolean | null

export type FieldSource = "original" | "derived"

export type FieldDefinition = {
  name: string
  source: FieldSource
}

export type PointGeometry = {
  type: "Point"
  lon: number
  lat: number
}

export type FeatureRecord = {
  id: number
  geometry: PointGeometry | null
  properties: Record<string, FieldValue>
  derived: {
    admin_country?: string
    admin_level1?: string
  }
}

export type ImportWarning = {
  code:
    | "non_point_geometry"
    | "missing_geometry"
    | "non_wgs84"
    | "admin_lookup_failed"
    | "encoding_fallback"
  message: string
  recordId?: number
}

export type Dataset = {
  fileName: string
  totalRecords: number
  fields: FieldDefinition[]
  records: FeatureRecord[]
  warnings: ImportWarning[]
}

export type TextSearchMode = "all" | "fields"

export type FilterState = {
  searchText: string
  searchMode: TextSearchMode
  searchFields: string[]
  fieldFilters: Record<string, string[]>
  sort: {
    field: string
    direction: "asc" | "desc"
  } | null
}

export type StatsRow = {
  value: string
  count: number
  ratio: number
}

export type ImportStatus =
  | "idle"
  | "loading"
  | "admin_lookup_running"
  | "ready"
  | "partial_failure"
  | "failed"
```

- [ ] **Step 4: Write Rust contract tests**

Create `src-tauri/src/model.rs` with this initial test module only:

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn serializes_dataset_with_derived_admin_fields() {
        let record = FeatureRecord {
            id: 1,
            geometry: Some(Geometry::Point { lon: 102.7, lat: 25.0 }),
            properties: std::collections::BTreeMap::from([(
                "name".to_string(),
                FieldValue::String("茶树".to_string()),
            )]),
            derived: DerivedFields {
                admin_country: Some("中国".to_string()),
                admin_level1: Some("云南".to_string()),
            },
        };

        let dataset = Dataset {
            file_name: "tea.kml".to_string(),
            total_records: 1,
            fields: vec![FieldDefinition {
                name: "name".to_string(),
                source: FieldSource::Original,
            }],
            records: vec![record],
            warnings: vec![],
        };

        let json = serde_json::to_string(&dataset).expect("dataset serializes");
        assert!(json.contains("admin_country"));
        assert!(json.contains("茶树"));
    }
}
```

- [ ] **Step 5: Run Rust contract test to verify it fails**

Run:

```powershell
cargo test --manifest-path src-tauri/Cargo.toml serializes_dataset_with_derived_admin_fields
```

Expected: FAIL because the referenced types do not exist.

- [ ] **Step 6: Implement Rust contracts**

Replace `src-tauri/src/model.rs`:

```rust
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(untagged)]
pub enum FieldValue {
    String(String),
    Number(f64),
    Bool(bool),
    Null,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub enum FieldSource {
    Original,
    Derived,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct FieldDefinition {
    pub name: String,
    pub source: FieldSource,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(tag = "type")]
pub enum Geometry {
    Point { lon: f64, lat: f64 },
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Default)]
#[serde(rename_all = "camelCase")]
pub struct DerivedFields {
    pub admin_country: Option<String>,
    pub admin_level1: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct FeatureRecord {
    pub id: usize,
    pub geometry: Option<Geometry>,
    pub properties: BTreeMap<String, FieldValue>,
    pub derived: DerivedFields,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum WarningCode {
    NonPointGeometry,
    MissingGeometry,
    NonWgs84,
    AdminLookupFailed,
    EncodingFallback,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ImportWarning {
    pub code: WarningCode,
    pub message: String,
    pub record_id: Option<usize>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Dataset {
    pub file_name: String,
    pub total_records: usize,
    pub fields: Vec<FieldDefinition>,
    pub records: Vec<FeatureRecord>,
    pub warnings: Vec<ImportWarning>,
}

impl FeatureRecord {
    pub fn field_as_string(&self, field: &str) -> Option<String> {
        if field == "admin_country" {
            return self.derived.admin_country.clone();
        }
        if field == "admin_level1" {
            return self.derived.admin_level1.clone();
        }
        self.properties.get(field).and_then(FieldValue::as_string)
    }
}

impl FieldValue {
    pub fn as_string(&self) -> Option<String> {
        match self {
            FieldValue::String(value) => Some(value.clone()),
            FieldValue::Number(value) => Some(value.to_string()),
            FieldValue::Bool(value) => Some(value.to_string()),
            FieldValue::Null => None,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn serializes_dataset_with_derived_admin_fields() {
        let record = FeatureRecord {
            id: 1,
            geometry: Some(Geometry::Point { lon: 102.7, lat: 25.0 }),
            properties: BTreeMap::from([(
                "name".to_string(),
                FieldValue::String("茶树".to_string()),
            )]),
            derived: DerivedFields {
                admin_country: Some("中国".to_string()),
                admin_level1: Some("云南".to_string()),
            },
        };

        let dataset = Dataset {
            file_name: "tea.kml".to_string(),
            total_records: 1,
            fields: vec![FieldDefinition {
                name: "name".to_string(),
                source: FieldSource::Original,
            }],
            records: vec![record],
            warnings: vec![],
        };

        let json = serde_json::to_string(&dataset).expect("dataset serializes");
        assert!(json.contains("admin_country"));
        assert!(json.contains("茶树"));
    }
}
```

Create `src-tauri/src/error.rs`:

```rust
use thiserror::Error;

#[derive(Debug, Error)]
pub enum GeoTableError {
    #[error("不支持的文件格式：{0}")]
    UnsupportedFormat(String),
    #[error("文件无法读取：{0}")]
    FileRead(String),
    #[error("SHP 缺少配套文件：{0}")]
    MissingShpSidecar(String),
    #[error("KML/KMZ 内没有可用点要素")]
    EmptyKml,
    #[error("点坐标缺失或无效")]
    InvalidCoordinate,
    #[error("行政区识别失败：{0}")]
    AdminLookup(String),
    #[error("CSV 导出失败：{0}")]
    CsvExport(String),
}

impl GeoTableError {
    pub fn user_message(&self) -> String {
        self.to_string()
    }
}

impl serde::Serialize for GeoTableError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        serializer.serialize_str(&self.user_message())
    }
}
```

Modify `src-tauri/src/lib.rs`:

```rust
pub mod error;
pub mod model;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

- [ ] **Step 7: Run contract tests**

Run:

```powershell
pnpm test src/types/geo.test.ts
cargo test --manifest-path src-tauri/Cargo.toml serializes_dataset_with_derived_admin_fields
```

Expected: both tests pass.

- [ ] **Step 8: Commit**

Run:

```powershell
git add src/types src-tauri/src/model.rs src-tauri/src/error.rs src-tauri/src/lib.rs src-tauri/Cargo.toml
git commit -m "feat: define geotable data contracts"
```

---

### Task 3: Implement Frontend Filtering and Statistics

**Files:**
- Create: `src/lib/filtering.ts`
- Create: `src/lib/filtering.test.ts`

**Interfaces:**
- Consumes: `FeatureRecord`, `FilterState`, `StatsRow` from `src/types/geo.ts`.
- Produces:
  - `getRecordValue(record: FeatureRecord, field: string): string | null`
  - `applyFilters(records: FeatureRecord[], filter: FilterState): FeatureRecord[]`
  - `getUniqueValues(records: FeatureRecord[], field: string): Array<{ value: string; count: number }>`
  - `buildStats(records: FeatureRecord[], field: string): StatsRow[]`
  - `sortRecords(records: FeatureRecord[], field: string, direction: "asc" | "desc"): FeatureRecord[]`

- [ ] **Step 1: Write failing filtering tests**

Create `src/lib/filtering.test.ts`:

```ts
import { describe, expect, it } from "vitest"
import type { FeatureRecord, FilterState } from "../types/geo"
import { applyFilters, buildStats, getUniqueValues, sortRecords } from "./filtering"

const records: FeatureRecord[] = [
  {
    id: 1,
    geometry: { type: "Point", lon: 102.7, lat: 25.0 },
    properties: { name: "茶树", crop: "茶", samples: 10 },
    derived: { admin_country: "中国", admin_level1: "云南" },
  },
  {
    id: 2,
    geometry: { type: "Point", lon: 120.2, lat: 30.2 },
    properties: { name: "茶园", crop: "茶", samples: 5 },
    derived: { admin_country: "中国", admin_level1: "浙江" },
  },
  {
    id: 3,
    geometry: { type: "Point", lon: 77.2, lat: 28.6 },
    properties: { name: "茶树（印度）", crop: "茶树", samples: 7 },
    derived: { admin_country: "印度", admin_level1: "Delhi" },
  },
  {
    id: 4,
    geometry: { type: "Point", lon: 100.0, lat: 15.0 },
    properties: { name: "水稻", crop: "水稻", samples: null },
    derived: { admin_country: "泰国", admin_level1: "Chiang Mai" },
  },
]

const emptyFilter: FilterState = {
  searchText: "",
  searchMode: "all",
  searchFields: [],
  fieldFilters: {},
  sort: null,
}

describe("filtering", () => {
  it("matches Chinese substring search across all fields", () => {
    const filtered = applyFilters(records, { ...emptyFilter, searchText: "茶" })
    expect(filtered.map((record) => record.id)).toEqual([1, 2, 3])
  })

  it("matches only selected search fields when searchMode is fields", () => {
    const filtered = applyFilters(records, {
      ...emptyFilter,
      searchText: "中国",
      searchMode: "fields",
      searchFields: ["admin_country"],
    })
    expect(filtered.map((record) => record.id)).toEqual([1, 2])
  })

  it("combines search and field filters", () => {
    const filtered = applyFilters(records, {
      ...emptyFilter,
      searchText: "茶",
      fieldFilters: { admin_country: ["中国"] },
    })
    expect(filtered.map((record) => record.id)).toEqual([1, 2])
  })

  it("builds category counts and ratios from current records", () => {
    const stats = buildStats(records.slice(0, 3), "admin_country")
    expect(stats).toEqual([
      { value: "中国", count: 2, ratio: 2 / 3 },
      { value: "印度", count: 1, ratio: 1 / 3 },
    ])
  })

  it("lists unique field values with counts", () => {
    expect(getUniqueValues(records, "crop")).toEqual([
      { value: "茶", count: 2 },
      { value: "茶树", count: 1 },
      { value: "水稻", count: 1 },
    ])
  })

  it("sorts numeric-looking values numerically", () => {
    const sorted = sortRecords(records, "samples", "asc")
    expect(sorted.map((record) => record.id)).toEqual([2, 3, 1, 4])
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```powershell
pnpm test src/lib/filtering.test.ts
```

Expected: FAIL because `src/lib/filtering.ts` does not exist.

- [ ] **Step 3: Implement filtering helpers**

Create `src/lib/filtering.ts`:

```ts
import type { FeatureRecord, FieldValue, FilterState, StatsRow } from "../types/geo"

export function getRecordValue(record: FeatureRecord, field: string): string | null {
  if (field === "admin_country") return record.derived.admin_country ?? null
  if (field === "admin_level1") return record.derived.admin_level1 ?? null
  return normalizeFieldValue(record.properties[field])
}

export function applyFilters(records: FeatureRecord[], filter: FilterState): FeatureRecord[] {
  const searchText = filter.searchText.trim().toLocaleLowerCase()
  const searchFields =
    filter.searchMode === "fields" && filter.searchFields.length > 0
      ? filter.searchFields
      : null

  let result = records.filter((record) => {
    if (searchText && !recordMatchesSearch(record, searchText, searchFields)) {
      return false
    }

    return Object.entries(filter.fieldFilters).every(([field, allowedValues]) => {
      if (allowedValues.length === 0) return true
      const value = getRecordValue(record, field)
      return value !== null && allowedValues.includes(value)
    })
  })

  if (filter.sort) {
    result = sortRecords(result, filter.sort.field, filter.sort.direction)
  }

  return result
}

export function getUniqueValues(
  records: FeatureRecord[],
  field: string,
): Array<{ value: string; count: number }> {
  const counts = countValues(records, field)
  return Array.from(counts.entries())
    .map(([value, count]) => ({ value, count }))
    .sort((left, right) => right.count - left.count || left.value.localeCompare(right.value, "zh-Hans-CN"))
}

export function buildStats(records: FeatureRecord[], field: string): StatsRow[] {
  const total = records.length
  if (total === 0) return []

  return getUniqueValues(records, field).map(({ value, count }) => ({
    value,
    count,
    ratio: count / total,
  }))
}

export function sortRecords(
  records: FeatureRecord[],
  field: string,
  direction: "asc" | "desc",
): FeatureRecord[] {
  const multiplier = direction === "asc" ? 1 : -1
  return [...records].sort((left, right) => {
    const leftValue = getRecordValue(left, field)
    const rightValue = getRecordValue(right, field)

    if (leftValue === null && rightValue === null) return 0
    if (leftValue === null) return 1
    if (rightValue === null) return -1

    const leftNumber = Number(leftValue)
    const rightNumber = Number(rightValue)
    if (Number.isFinite(leftNumber) && Number.isFinite(rightNumber)) {
      return (leftNumber - rightNumber) * multiplier
    }

    return leftValue.localeCompare(rightValue, "zh-Hans-CN", { numeric: true }) * multiplier
  })
}

function recordMatchesSearch(
  record: FeatureRecord,
  searchText: string,
  searchFields: string[] | null,
): boolean {
  const fields =
    searchFields ??
    Array.from(
      new Set([
        ...Object.keys(record.properties),
        "admin_country",
        "admin_level1",
      ]),
    )

  return fields.some((field) => {
    const value = getRecordValue(record, field)
    return value !== null && value.toLocaleLowerCase().includes(searchText)
  })
}

function countValues(records: FeatureRecord[], field: string): Map<string, number> {
  const counts = new Map<string, number>()
  for (const record of records) {
    const value = getRecordValue(record, field)
    if (value === null || value === "") continue
    counts.set(value, (counts.get(value) ?? 0) + 1)
  }
  return counts
}

function normalizeFieldValue(value: FieldValue | undefined): string | null {
  if (value === undefined || value === null) return null
  return String(value)
}
```

- [ ] **Step 4: Run filtering tests**

Run:

```powershell
pnpm test src/lib/filtering.test.ts
```

Expected: all 6 tests pass.

- [ ] **Step 5: Commit**

Run:

```powershell
git add src/lib/filtering.ts src/lib/filtering.test.ts
git commit -m "feat: add table filtering and statistics helpers"
```

---

### Task 4: Implement KML and KMZ Import

**Files:**
- Create: `src-tauri/src/import/mod.rs`
- Create: `src-tauri/src/import/kml.rs`
- Create: `src-tauri/tests/import_kml.rs`
- Modify: `src-tauri/src/lib.rs`

**Interfaces:**
- Consumes: Rust model and error modules from Task 2.
- Produces:
  - `pub fn import_file(path: &Path) -> Result<Dataset, GeoTableError>`
  - `pub fn import_kml_or_kmz(path: &Path) -> Result<Dataset, GeoTableError>`

- [ ] **Step 1: Write KML import integration test**

Create `src-tauri/tests/import_kml.rs`:

```rust
use geotable_lib::import::import_file;
use pretty_assertions::assert_eq;
use std::fs;

#[test]
fn imports_kml_points_with_extended_data() {
    let dir = tempfile::tempdir().expect("temp dir");
    let path = dir.path().join("tea.kml");
    fs::write(
        &path,
        r#"<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <Placemark>
      <name>茶树</name>
      <ExtendedData>
        <Data name="crop"><value>茶</value></Data>
      </ExtendedData>
      <Point><coordinates>102.7,25.0,0</coordinates></Point>
    </Placemark>
    <Placemark>
      <name>水稻</name>
      <ExtendedData>
        <Data name="crop"><value>水稻</value></Data>
      </ExtendedData>
      <Point><coordinates>100.0,15.0,0</coordinates></Point>
    </Placemark>
  </Document>
</kml>"#,
    )
    .expect("write kml");

    let dataset = import_file(&path).expect("imports kml");

    assert_eq!(dataset.file_name, "tea.kml");
    assert_eq!(dataset.total_records, 2);
    assert_eq!(dataset.records[0].field_as_string("name").as_deref(), Some("茶树"));
    assert_eq!(dataset.records[0].field_as_string("crop").as_deref(), Some("茶"));
}

#[test]
fn rejects_kml_without_points() {
    let dir = tempfile::tempdir().expect("temp dir");
    let path = dir.path().join("empty.kml");
    fs::write(
        &path,
        r#"<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2"><Document></Document></kml>"#,
    )
    .expect("write kml");

    let error = import_file(&path).expect_err("empty kml fails");
    assert!(error.user_message().contains("KML/KMZ 内没有可用点要素"));
}
```

- [ ] **Step 2: Run KML tests to verify they fail**

Run:

```powershell
cargo test --manifest-path src-tauri/Cargo.toml --test import_kml
```

Expected: FAIL because `geotable_lib::import` does not exist.

- [ ] **Step 3: Create import module dispatch**

Create `src-tauri/src/import/mod.rs`:

```rust
use crate::error::GeoTableError;
use crate::model::Dataset;
use std::path::Path;

pub mod kml;

pub fn import_file(path: &Path) -> Result<Dataset, GeoTableError> {
    let extension = path
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or_default()
        .to_ascii_lowercase();

    match extension.as_str() {
        "kml" | "kmz" => kml::import_kml_or_kmz(path),
        "shp" => Err(GeoTableError::UnsupportedFormat(
            "SHP 导入将在后续任务实现".to_string(),
        )),
        other => Err(GeoTableError::UnsupportedFormat(other.to_string())),
    }
}
```

Modify `src-tauri/src/lib.rs`:

```rust
pub mod error;
pub mod import;
pub mod model;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

- [ ] **Step 4: Implement KML parser**

Create `src-tauri/src/import/kml.rs`:

```rust
use crate::error::GeoTableError;
use crate::model::{
    Dataset, DerivedFields, FeatureRecord, FieldDefinition, FieldSource, FieldValue, Geometry,
};
use kml::types::{Element, Geometry as KmlGeometry, Kml, Placemark};
use kml::KmlReader;
use std::collections::{BTreeMap, BTreeSet};
use std::fs::File;
use std::io::BufReader;
use std::path::Path;

pub fn import_kml_or_kmz(path: &Path) -> Result<Dataset, GeoTableError> {
    let file = File::open(path).map_err(|error| GeoTableError::FileRead(error.to_string()))?;
    let reader = BufReader::new(file);
    let mut kml_reader = KmlReader::from_reader(reader);
    let root = kml_reader
        .read()
        .map_err(|error| GeoTableError::FileRead(error.to_string()))?;

    let mut field_names = BTreeSet::new();
    let mut records = Vec::new();
    collect_placemarks(&root, &mut records, &mut field_names);

    if records.is_empty() {
        return Err(GeoTableError::EmptyKml);
    }

    let mut fields: Vec<FieldDefinition> = field_names
        .into_iter()
        .map(|name| FieldDefinition {
            name,
            source: FieldSource::Original,
        })
        .collect();
    fields.push(FieldDefinition {
        name: "admin_country".to_string(),
        source: FieldSource::Derived,
    });
    fields.push(FieldDefinition {
        name: "admin_level1".to_string(),
        source: FieldSource::Derived,
    });

    Ok(Dataset {
        file_name: path
            .file_name()
            .and_then(|value| value.to_str())
            .unwrap_or("dataset.kml")
            .to_string(),
        total_records: records.len(),
        fields,
        records,
        warnings: vec![],
    })
}

fn collect_placemarks(kml: &Kml, records: &mut Vec<FeatureRecord>, field_names: &mut BTreeSet<String>) {
    match kml {
        Kml::Placemark(placemark) => {
            if let Some(record) = placemark_to_record(records.len() + 1, placemark, field_names) {
                records.push(record);
            }
        }
        Kml::Document { elements, .. } | Kml::Folder { elements, .. } => {
            for element in elements {
                collect_placemarks(element, records, field_names);
            }
        }
        _ => {}
    }
}

fn placemark_to_record(
    id: usize,
    placemark: &Placemark,
    field_names: &mut BTreeSet<String>,
) -> Option<FeatureRecord> {
    let (lon, lat) = point_from_geometry(placemark.geometry.as_ref()?)?;
    let mut properties = BTreeMap::new();

    if let Some(name) = placemark.name.clone() {
        field_names.insert("name".to_string());
        properties.insert("name".to_string(), FieldValue::String(name));
    }

    for element in placemark
        .extended_data
        .as_ref()
        .map(|data| data.elements.as_slice())
        .unwrap_or_default()
    {
        if let Element {
            name,
            content: Some(content),
            ..
        } = element
        {
            field_names.insert(name.clone());
            properties.insert(name.clone(), FieldValue::String(content.clone()));
        }
    }

    Some(FeatureRecord {
        id,
        geometry: Some(Geometry::Point { lon, lat }),
        properties,
        derived: DerivedFields::default(),
    })
}

fn point_from_geometry(geometry: &KmlGeometry) -> Option<(f64, f64)> {
    match geometry {
        KmlGeometry::Point(point) => Some((point.coord.x, point.coord.y)),
        _ => None,
    }
}
```

- [ ] **Step 5: Run KML tests and adjust only compile errors caused by crate API naming**

Run:

```powershell
cargo test --manifest-path src-tauri/Cargo.toml --test import_kml
```

Expected: tests pass. If the `kml` crate exposes extended data with different field names, inspect the compiler error and change only the field access lines in `src-tauri/src/import/kml.rs`, preserving the same public interface and test assertions.

- [ ] **Step 6: Commit**

Run:

```powershell
git add src-tauri/src/import src-tauri/src/lib.rs src-tauri/tests/import_kml.rs
git commit -m "feat: import kml point attributes"
```

---

### Task 5: Implement SHP Import for Point Data

**Files:**
- Create: `src-tauri/src/import/shp.rs`
- Create: `src-tauri/tests/import_shp.rs`
- Modify: `src-tauri/src/import/mod.rs`

**Interfaces:**
- Consumes: `import_file(path)` dispatch from Task 4.
- Produces:
  - `pub fn import_shp(path: &Path) -> Result<Dataset, GeoTableError>`

- [ ] **Step 1: Write SHP missing-sidecar test**

Create `src-tauri/tests/import_shp.rs`:

```rust
use geotable_lib::import::import_file;
use std::fs;

#[test]
fn reports_missing_dbf_for_shp() {
    let dir = tempfile::tempdir().expect("temp dir");
    let shp_path = dir.path().join("points.shp");
    fs::write(&shp_path, b"not a real shp").expect("write placeholder shp");

    let error = import_file(&shp_path).expect_err("missing sidecar should fail");
    assert!(error.user_message().contains("SHP 缺少配套文件"));
}
```

- [ ] **Step 2: Run SHP test to verify it fails**

Run:

```powershell
cargo test --manifest-path src-tauri/Cargo.toml --test import_shp
```

Expected: FAIL because SHP dispatch returns unsupported format.

- [ ] **Step 3: Implement SHP sidecar checks and point import**

Create `src-tauri/src/import/shp.rs`:

```rust
use crate::error::GeoTableError;
use crate::model::{
    Dataset, DerivedFields, FeatureRecord, FieldDefinition, FieldSource, FieldValue, Geometry,
    ImportWarning, WarningCode,
};
use shapefile::{dbase, Reader, Shape};
use std::collections::{BTreeMap, BTreeSet};
use std::path::{Path, PathBuf};

pub fn import_shp(path: &Path) -> Result<Dataset, GeoTableError> {
    ensure_sidecar(path, "dbf")?;
    ensure_sidecar(path, "shx")?;

    let mut reader = Reader::from_path(path)
        .map_err(|error| GeoTableError::FileRead(error.to_string()))?;
    let mut field_names = BTreeSet::new();
    let mut records = Vec::new();
    let mut warnings = Vec::new();

    for result in reader.iter_shapes_and_records() {
        let (shape, dbf_record) =
            result.map_err(|error| GeoTableError::FileRead(error.to_string()))?;
        let id = records.len() + 1;
        let geometry = match shape {
            Shape::Point(point) => Some(Geometry::Point {
                lon: point.x,
                lat: point.y,
            }),
            _ => {
                warnings.push(ImportWarning {
                    code: WarningCode::NonPointGeometry,
                    message: "非点几何已保留属性表，但不参与行政区识别。".to_string(),
                    record_id: Some(id),
                });
                None
            }
        };

        let properties = convert_dbf_record(&dbf_record, &mut field_names);
        records.push(FeatureRecord {
            id,
            geometry,
            properties,
            derived: DerivedFields::default(),
        });
    }

    let mut fields: Vec<FieldDefinition> = field_names
        .into_iter()
        .map(|name| FieldDefinition {
            name,
            source: FieldSource::Original,
        })
        .collect();
    fields.push(FieldDefinition {
        name: "admin_country".to_string(),
        source: FieldSource::Derived,
    });
    fields.push(FieldDefinition {
        name: "admin_level1".to_string(),
        source: FieldSource::Derived,
    });

    Ok(Dataset {
        file_name: path
            .file_name()
            .and_then(|value| value.to_str())
            .unwrap_or("dataset.shp")
            .to_string(),
        total_records: records.len(),
        fields,
        records,
        warnings,
    })
}

fn ensure_sidecar(path: &Path, extension: &str) -> Result<(), GeoTableError> {
    let sidecar = path.with_extension(extension);
    if sidecar.exists() {
        Ok(())
    } else {
        Err(GeoTableError::MissingShpSidecar(display_path(sidecar)))
    }
}

fn convert_dbf_record(
    record: &dbase::Record,
    field_names: &mut BTreeSet<String>,
) -> BTreeMap<String, FieldValue> {
    let mut properties = BTreeMap::new();
    for (name, value) in record.as_ref() {
        field_names.insert(name.to_string());
        properties.insert(name.to_string(), convert_dbf_value(value));
    }
    properties
}

fn convert_dbf_value(value: &dbase::FieldValue) -> FieldValue {
    match value {
        dbase::FieldValue::Character(Some(value)) => FieldValue::String(value.trim().to_string()),
        dbase::FieldValue::Numeric(Some(value)) => FieldValue::Number(*value),
        dbase::FieldValue::Float(Some(value)) => FieldValue::Number((*value).into()),
        dbase::FieldValue::Logical(Some(value)) => FieldValue::Bool(*value),
        dbase::FieldValue::Date(Some(value)) => FieldValue::String(value.to_string()),
        _ => FieldValue::Null,
    }
}

fn display_path(path: PathBuf) -> String {
    path.to_string_lossy().to_string()
}
```

Modify `src-tauri/src/import/mod.rs`:

```rust
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
```

- [ ] **Step 4: Run SHP test**

Run:

```powershell
cargo test --manifest-path src-tauri/Cargo.toml --test import_shp
```

Expected: missing sidecar test passes. If the `dbase::Record` iteration API differs, inspect the compiler error and change only `convert_dbf_record`, preserving `import_shp(path) -> Result<Dataset, GeoTableError>`.

- [ ] **Step 5: Add manual verification note for real SHP**

Create `docs/superpowers/plans/manual-test-data.md`:

```markdown
# Manual Test Data Notes

Use one small WGS84 point SHP with `.shp`, `.shx`, `.dbf`, and `.prj` sidecars for manual import verification. The expected result is that GeoTable shows all DBF fields, record count equals the DBF row count, and point geometries have longitude/latitude values.
```

- [ ] **Step 6: Commit**

Run:

```powershell
git add src-tauri/src/import src-tauri/tests/import_shp.rs docs/superpowers/plans/manual-test-data.md
git commit -m "feat: import shp point attributes"
```

---

### Task 6: Implement Administrative Boundary Lookup

**Files:**
- Create: `src-tauri/src/admin/mod.rs`
- Create: `src-tauri/src/admin/boundary.rs`
- Create: `src-tauri/src/admin/lookup.rs`
- Create: `src-tauri/assets/admin/README.md`
- Create: `src-tauri/assets/admin/admin0.sample.geojson`
- Create: `src-tauri/assets/admin/admin1.sample.geojson`
- Create: `src-tauri/tests/admin_lookup.rs`
- Modify: `src-tauri/src/lib.rs`

**Interfaces:**
- Consumes: `Dataset`, `FeatureRecord`, and `Geometry` from Task 2.
- Produces:
  - `pub struct AdminIndex`
  - `impl AdminIndex { pub fn from_geojson_str(admin0: &str, admin1: &str) -> Result<Self, GeoTableError> }`
  - `pub fn enrich_dataset(dataset: Dataset, index: &AdminIndex) -> Dataset`

- [ ] **Step 1: Write admin lookup tests**

Create `src-tauri/tests/admin_lookup.rs`:

```rust
use geotable_lib::admin::{enrich_dataset, AdminIndex};
use geotable_lib::model::{
    Dataset, DerivedFields, FeatureRecord, FieldDefinition, FieldSource, FieldValue, Geometry,
};
use pretty_assertions::assert_eq;
use std::collections::BTreeMap;

const ADMIN0: &str = r#"{
  "type": "FeatureCollection",
  "features": [
    {
      "type": "Feature",
      "properties": { "name": "中国" },
      "geometry": {
        "type": "Polygon",
        "coordinates": [[[100,20],[125,20],[125,40],[100,40],[100,20]]]
      }
    },
    {
      "type": "Feature",
      "properties": { "name": "印度" },
      "geometry": {
        "type": "Polygon",
        "coordinates": [[[70,5],[90,5],[90,35],[70,35],[70,5]]]
      }
    }
  ]
}"#;

const ADMIN1: &str = r#"{
  "type": "FeatureCollection",
  "features": [
    {
      "type": "Feature",
      "properties": { "name": "云南", "country": "中国" },
      "geometry": {
        "type": "Polygon",
        "coordinates": [[[100,20],[110,20],[110,30],[100,30],[100,20]]]
      }
    },
    {
      "type": "Feature",
      "properties": { "name": "浙江", "country": "中国" },
      "geometry": {
        "type": "Polygon",
        "coordinates": [[[118,27],[123,27],[123,32],[118,32],[118,27]]]
      }
    }
  ]
}"#;

#[test]
fn enriches_points_with_country_and_level1() {
    let index = AdminIndex::from_geojson_str(ADMIN0, ADMIN1).expect("index");
    let dataset = Dataset {
        file_name: "tea.kml".to_string(),
        total_records: 2,
        fields: vec![FieldDefinition {
            name: "name".to_string(),
            source: FieldSource::Original,
        }],
        records: vec![
            FeatureRecord {
                id: 1,
                geometry: Some(Geometry::Point { lon: 102.7, lat: 25.0 }),
                properties: BTreeMap::from([(
                    "name".to_string(),
                    FieldValue::String("茶树".to_string()),
                )]),
                derived: DerivedFields::default(),
            },
            FeatureRecord {
                id: 2,
                geometry: Some(Geometry::Point { lon: 77.2, lat: 28.6 }),
                properties: BTreeMap::new(),
                derived: DerivedFields::default(),
            },
        ],
        warnings: vec![],
    };

    let enriched = enrich_dataset(dataset, &index);

    assert_eq!(enriched.records[0].derived.admin_country.as_deref(), Some("中国"));
    assert_eq!(enriched.records[0].derived.admin_level1.as_deref(), Some("云南"));
    assert_eq!(enriched.records[1].derived.admin_country.as_deref(), Some("印度"));
    assert_eq!(enriched.records[1].derived.admin_level1, None);
}
```

- [ ] **Step 2: Run admin lookup test to verify it fails**

Run:

```powershell
cargo test --manifest-path src-tauri/Cargo.toml --test admin_lookup
```

Expected: FAIL because `geotable_lib::admin` does not exist.

- [ ] **Step 3: Add sample boundary assets and source notes**

Create `src-tauri/assets/admin/README.md`:

```markdown
# Administrative Boundary Assets

Production assets should be derived from Natural Earth Admin 0 Countries and Admin 1 States/Provinces. GeoTable uses these files only for offline statistical grouping, not for legal boundary decisions.

The checked-in `admin0.sample.geojson` and `admin1.sample.geojson` files are tiny test fixtures. Replace them with simplified production GeoJSON before packaging a user build.
```

Create `src-tauri/assets/admin/admin0.sample.geojson` with the same JSON string used in `ADMIN0`.

Create `src-tauri/assets/admin/admin1.sample.geojson` with the same JSON string used in `ADMIN1`.

- [ ] **Step 4: Implement boundary index**

Create `src-tauri/src/admin/mod.rs`:

```rust
mod boundary;
mod lookup;

pub use boundary::AdminIndex;
pub use lookup::enrich_dataset;
```

Create `src-tauri/src/admin/boundary.rs`:

```rust
use crate::error::GeoTableError;
use geo::{Coord, LineString, Polygon};
use geojson::{GeoJson, Value};

#[derive(Debug, Clone)]
pub struct AdminPolygon {
    pub name: String,
    pub country: Option<String>,
    pub bbox: [f64; 4],
    pub polygon: Polygon<f64>,
}

#[derive(Debug, Clone)]
pub struct AdminIndex {
    pub countries: Vec<AdminPolygon>,
    pub level1: Vec<AdminPolygon>,
}

impl AdminIndex {
    pub fn from_geojson_str(admin0: &str, admin1: &str) -> Result<Self, GeoTableError> {
        Ok(Self {
            countries: parse_polygons(admin0, "name", None)?,
            level1: parse_polygons(admin1, "name", Some("country"))?,
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

        if let Some(geometry) = feature.geometry {
            match geometry.value {
                Value::Polygon(rings) => {
                    if let Some(polygon) = polygon_from_rings(rings) {
                        let bbox = bbox_for_polygon(&polygon);
                        polygons.push(AdminPolygon {
                            name,
                            country,
                            bbox,
                            polygon,
                        });
                    }
                }
                Value::MultiPolygon(groups) => {
                    for rings in groups {
                        if let Some(polygon) = polygon_from_rings(rings) {
                            let bbox = bbox_for_polygon(&polygon);
                            polygons.push(AdminPolygon {
                                name: name.clone(),
                                country: country.clone(),
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

fn polygon_from_rings(rings: Vec<Vec<Vec<f64>>>) -> Option<Polygon<f64>> {
    let mut iter = rings.into_iter();
    let exterior = line_string(iter.next()?)?;
    let interiors = iter.filter_map(line_string).collect();
    Some(Polygon::new(exterior, interiors))
}

fn line_string(coords: Vec<Vec<f64>>) -> Option<LineString<f64>> {
    let points = coords
        .into_iter()
        .map(|coord| {
            Some(Coord {
                x: *coord.get(0)?,
                y: *coord.get(1)?,
            })
        })
        .collect::<Option<Vec<_>>>()?;
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
```

Create `src-tauri/src/admin/lookup.rs`:

```rust
use super::boundary::{AdminIndex, AdminPolygon};
use crate::model::{Dataset, Geometry};
use geo::{Contains, Point};

pub fn enrich_dataset(mut dataset: Dataset, index: &AdminIndex) -> Dataset {
    for record in &mut dataset.records {
        let Some(Geometry::Point { lon, lat }) = record.geometry else {
            continue;
        };
        if !is_wgs84_like(lon, lat) {
            continue;
        }

        let point = Point::new(lon, lat);
        record.derived.admin_country = find_polygon(&index.countries, &point).map(|item| item.name.clone());
        record.derived.admin_level1 = find_polygon(&index.level1, &point).map(|item| item.name.clone());
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
    lon.is_finite() && lat.is_finite() && (-180.0..=180.0).contains(&lon) && (-90.0..=90.0).contains(&lat)
}
```

Modify `src-tauri/src/lib.rs`:

```rust
pub mod admin;
pub mod error;
pub mod import;
pub mod model;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

- [ ] **Step 5: Run admin lookup tests**

Run:

```powershell
cargo test --manifest-path src-tauri/Cargo.toml --test admin_lookup
```

Expected: admin lookup test passes.

- [ ] **Step 6: Commit**

Run:

```powershell
git add src-tauri/src/admin src-tauri/assets/admin src-tauri/tests/admin_lookup.rs src-tauri/src/lib.rs
git commit -m "feat: derive administrative regions from point coordinates"
```

---

### Task 7: Add Tauri Commands and CSV Export

**Files:**
- Create: `src-tauri/src/export.rs`
- Create: `src-tauri/tests/export_csv.rs`
- Modify: `src-tauri/src/lib.rs`

**Interfaces:**
- Consumes: `import_file(path)`, `AdminIndex`, `enrich_dataset`.
- Produces:
  - Tauri command `open_dataset(path: String) -> Result<Dataset, GeoTableError>`
  - Tauri command `export_csv(path: String, dataset: Dataset, record_ids: Vec<usize>) -> Result<(), GeoTableError>`
  - `pub fn write_csv(path: &Path, dataset: &Dataset, record_ids: &[usize]) -> Result<(), GeoTableError>`

- [ ] **Step 1: Write CSV export test**

Create `src-tauri/tests/export_csv.rs`:

```rust
use geotable_lib::export::write_csv;
use geotable_lib::model::{
    Dataset, DerivedFields, FeatureRecord, FieldDefinition, FieldSource, FieldValue, Geometry,
};
use std::collections::BTreeMap;
use std::fs;

#[test]
fn exports_filtered_records_with_derived_fields_as_utf8_csv() {
    let dir = tempfile::tempdir().expect("temp dir");
    let path = dir.path().join("filtered.csv");
    let dataset = Dataset {
        file_name: "tea.kml".to_string(),
        total_records: 2,
        fields: vec![
            FieldDefinition {
                name: "name".to_string(),
                source: FieldSource::Original,
            },
            FieldDefinition {
                name: "admin_country".to_string(),
                source: FieldSource::Derived,
            },
            FieldDefinition {
                name: "admin_level1".to_string(),
                source: FieldSource::Derived,
            },
        ],
        records: vec![
            FeatureRecord {
                id: 1,
                geometry: Some(Geometry::Point { lon: 102.7, lat: 25.0 }),
                properties: BTreeMap::from([(
                    "name".to_string(),
                    FieldValue::String("茶树".to_string()),
                )]),
                derived: DerivedFields {
                    admin_country: Some("中国".to_string()),
                    admin_level1: Some("云南".to_string()),
                },
            },
            FeatureRecord {
                id: 2,
                geometry: Some(Geometry::Point { lon: 77.2, lat: 28.6 }),
                properties: BTreeMap::from([(
                    "name".to_string(),
                    FieldValue::String("茶树（印度）".to_string()),
                )]),
                derived: DerivedFields {
                    admin_country: Some("印度".to_string()),
                    admin_level1: None,
                },
            },
        ],
        warnings: vec![],
    };

    write_csv(&path, &dataset, &[1]).expect("write csv");

    let content = fs::read_to_string(path).expect("read csv");
    assert!(content.contains("name,admin_country,admin_level1"));
    assert!(content.contains("茶树,中国,云南"));
    assert!(!content.contains("茶树（印度）"));
}
```

- [ ] **Step 2: Run CSV test to verify it fails**

Run:

```powershell
cargo test --manifest-path src-tauri/Cargo.toml --test export_csv
```

Expected: FAIL because `geotable_lib::export` does not exist.

- [ ] **Step 3: Implement CSV export**

Create `src-tauri/src/export.rs`:

```rust
use crate::error::GeoTableError;
use crate::model::Dataset;
use std::collections::BTreeSet;
use std::path::Path;

pub fn write_csv(path: &Path, dataset: &Dataset, record_ids: &[usize]) -> Result<(), GeoTableError> {
    let selected: BTreeSet<usize> = record_ids.iter().copied().collect();
    let mut writer = csv::Writer::from_path(path)
        .map_err(|error| GeoTableError::CsvExport(error.to_string()))?;
    let headers: Vec<String> = dataset.fields.iter().map(|field| field.name.clone()).collect();

    writer
        .write_record(headers.iter())
        .map_err(|error| GeoTableError::CsvExport(error.to_string()))?;

    for record in dataset.records.iter().filter(|record| selected.contains(&record.id)) {
        let row: Vec<String> = headers
            .iter()
            .map(|field| record.field_as_string(field).unwrap_or_default())
            .collect();
        writer
            .write_record(row)
            .map_err(|error| GeoTableError::CsvExport(error.to_string()))?;
    }

    writer
        .flush()
        .map_err(|error| GeoTableError::CsvExport(error.to_string()))?;
    Ok(())
}
```

- [ ] **Step 4: Add Tauri commands**

Modify `src-tauri/src/lib.rs`:

```rust
pub mod admin;
pub mod error;
pub mod export;
pub mod import;
pub mod model;

use admin::{enrich_dataset, AdminIndex};
use error::GeoTableError;
use model::Dataset;
use std::path::PathBuf;

#[tauri::command]
pub fn open_dataset(path: String) -> Result<Dataset, GeoTableError> {
    let dataset = import::import_file(&PathBuf::from(path))?;
    let admin0 = include_str!("../assets/admin/admin0.sample.geojson");
    let admin1 = include_str!("../assets/admin/admin1.sample.geojson");
    let index = AdminIndex::from_geojson_str(admin0, admin1)?;
    Ok(enrich_dataset(dataset, &index))
}

#[tauri::command]
pub fn export_csv(path: String, dataset: Dataset, record_ids: Vec<usize>) -> Result<(), GeoTableError> {
    export::write_csv(&PathBuf::from(path), &dataset, &record_ids)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![open_dataset, export_csv])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

- [ ] **Step 5: Run Rust tests**

Run:

```powershell
cargo test --manifest-path src-tauri/Cargo.toml
```

Expected: all Rust tests pass.

- [ ] **Step 6: Commit**

Run:

```powershell
git add src-tauri/src/export.rs src-tauri/tests/export_csv.rs src-tauri/src/lib.rs
git commit -m "feat: add dataset commands and csv export"
```

---

### Task 8: Build Workbench UI State and Toolbar

**Files:**
- Modify: `src/App.tsx`
- Create: `src/components/Toolbar.tsx`
- Modify: `src/styles.css`

**Interfaces:**
- Consumes:
  - Tauri `openDataset` command exposed as `open_dataset`.
  - Tauri `exportCsv` command exposed as `export_csv`.
  - `Dataset`, `FilterState`, `ImportStatus` from `src/types/geo.ts`.
  - `applyFilters` from `src/lib/filtering.ts`.
- Produces:
  - App-level state for dataset, filters, filtered records, status, and errors.
  - Toolbar props:
    `fileName: string | null`, `totalRecords: number`, `filteredRecords: number`, `status: ImportStatus`, `onOpen(): void`, `onExport(): void`.

- [ ] **Step 1: Create Toolbar component**

Create `src/components/Toolbar.tsx`:

```tsx
import { Download, FolderOpen } from "lucide-react"
import type { ImportStatus } from "../types/geo"

type ToolbarProps = {
  fileName: string | null
  totalRecords: number
  filteredRecords: number
  status: ImportStatus
  onOpen: () => void
  onExport: () => void
}

const statusText: Record<ImportStatus, string> = {
  idle: "未打开文件",
  loading: "读取中",
  admin_lookup_running: "识别行政区中",
  ready: "已就绪",
  partial_failure: "部分失败",
  failed: "失败",
}

export function Toolbar({
  fileName,
  totalRecords,
  filteredRecords,
  status,
  onOpen,
  onExport,
}: ToolbarProps) {
  return (
    <header className="toolbar">
      <button className="toolbar-button primary" type="button" onClick={onOpen} title="打开文件">
        <FolderOpen size={18} />
        <span>打开文件</span>
      </button>
      <div className="toolbar-meta">
        <strong>{fileName ?? "未选择文件"}</strong>
        <span>总样本 {totalRecords.toLocaleString("zh-CN")}</span>
        <span>当前结果 {filteredRecords.toLocaleString("zh-CN")}</span>
        <span>{statusText[status]}</span>
      </div>
      <button
        className="toolbar-button"
        type="button"
        onClick={onExport}
        disabled={filteredRecords === 0}
        title="导出当前结果"
      >
        <Download size={18} />
        <span>导出 CSV</span>
      </button>
    </header>
  )
}
```

- [ ] **Step 2: Replace App with stateful workbench shell**

Modify `src/App.tsx`:

```tsx
import { invoke } from "@tauri-apps/api/core"
import { open, save } from "@tauri-apps/plugin-dialog"
import { useMemo, useState } from "react"
import { Toolbar } from "./components/Toolbar"
import { applyFilters } from "./lib/filtering"
import type { Dataset, FilterState, ImportStatus } from "./types/geo"
import "./styles.css"

const initialFilter: FilterState = {
  searchText: "",
  searchMode: "all",
  searchFields: [],
  fieldFilters: {},
  sort: null,
}

export default function App() {
  const [dataset, setDataset] = useState<Dataset | null>(null)
  const [filter, setFilter] = useState<FilterState>(initialFilter)
  const [status, setStatus] = useState<ImportStatus>("idle")
  const [error, setError] = useState<string | null>(null)

  const filteredRecords = useMemo(
    () => (dataset ? applyFilters(dataset.records, filter) : []),
    [dataset, filter],
  )

  async function handleOpen() {
    setError(null)
    const selected = await open({
      multiple: false,
      filters: [{ name: "Geo files", extensions: ["shp", "kml", "kmz"] }],
    })
    if (typeof selected !== "string") return

    setStatus("loading")
    try {
      const result = await invoke<Dataset>("open_dataset", { path: selected })
      setDataset(result)
      setFilter(initialFilter)
      setStatus(result.warnings.length > 0 ? "partial_failure" : "ready")
    } catch (caught) {
      setStatus("failed")
      setError(String(caught))
    }
  }

  async function handleExport() {
    if (!dataset || filteredRecords.length === 0) return
    const target = await save({
      filters: [{ name: "CSV", extensions: ["csv"] }],
      defaultPath: `${dataset.fileName}.csv`,
    })
    if (typeof target !== "string") return

    try {
      await invoke("export_csv", {
        path: target,
        dataset,
        recordIds: filteredRecords.map((record) => record.id),
      })
    } catch (caught) {
      setError(String(caught))
    }
  }

  return (
    <main className="app-shell">
      <Toolbar
        fileName={dataset?.fileName ?? null}
        totalRecords={dataset?.totalRecords ?? 0}
        filteredRecords={filteredRecords.length}
        status={status}
        onOpen={handleOpen}
        onExport={handleExport}
      />
      {error && <div className="error-banner">{error}</div>}
      <section className="workbench-placeholder">
        <h1>GeoTable</h1>
        <p>字段、表格和统计面板将在后续任务接入。</p>
      </section>
    </main>
  )
}
```

- [ ] **Step 3: Add toolbar styles**

Append to `src/styles.css`:

```css
.toolbar {
  height: 56px;
  display: grid;
  grid-template-columns: auto 1fr auto;
  align-items: center;
  gap: 16px;
  padding: 0 16px;
  border-bottom: 1px solid #d8dee3;
  background: #ffffff;
}

.toolbar-button {
  min-height: 36px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 0 12px;
  border: 1px solid #c9d2d8;
  border-radius: 6px;
  color: #172026;
  background: #ffffff;
  cursor: pointer;
}

.toolbar-button.primary {
  color: #ffffff;
  border-color: #136f63;
  background: #136f63;
}

.toolbar-button:disabled {
  cursor: not-allowed;
  opacity: 0.45;
}

.toolbar-meta {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 16px;
  color: #56646d;
  white-space: nowrap;
  overflow: hidden;
}

.toolbar-meta strong {
  min-width: 120px;
  max-width: 320px;
  overflow: hidden;
  text-overflow: ellipsis;
  color: #172026;
}

.error-banner {
  margin: 12px 16px 0;
  padding: 10px 12px;
  border: 1px solid #d45b5b;
  border-radius: 6px;
  color: #842525;
  background: #fff0f0;
}

.workbench-placeholder {
  min-height: calc(100vh - 56px);
  display: grid;
  place-items: center;
  align-content: center;
  gap: 8px;
}
```

- [ ] **Step 4: Build frontend**

Run:

```powershell
pnpm build
```

Expected: build succeeds.

- [ ] **Step 5: Commit**

Run:

```powershell
git add src/App.tsx src/components/Toolbar.tsx src/styles.css
git commit -m "feat: add workbench toolbar and dataset state"
```

---

### Task 9: Build Field Panel and Statistics Panel

**Files:**
- Create: `src/components/FieldPanel.tsx`
- Create: `src/components/StatsPanel.tsx`
- Modify: `src/App.tsx`
- Modify: `src/styles.css`

**Interfaces:**
- Consumes: `Dataset`, `FilterState`, `StatsRow`, `getUniqueValues`, `buildStats`.
- Produces:
  - `FieldPanel` props:
    `dataset`, `records`, `filter`, `onFilterChange`.
  - `StatsPanel` props:
    `fields`, `records`, `selectedField`, `onSelectedFieldChange`, `onAddFieldFilter`.

- [ ] **Step 1: Create FieldPanel**

Create `src/components/FieldPanel.tsx`:

```tsx
import { useMemo, useState } from "react"
import { getUniqueValues } from "../lib/filtering"
import type { Dataset, FeatureRecord, FilterState } from "../types/geo"

type FieldPanelProps = {
  dataset: Dataset | null
  records: FeatureRecord[]
  filter: FilterState
  onFilterChange: (next: FilterState) => void
}

export function FieldPanel({ dataset, records, filter, onFilterChange }: FieldPanelProps) {
  const [fieldSearch, setFieldSearch] = useState("")
  const [selectedField, setSelectedField] = useState<string | null>(null)

  const fields = useMemo(() => {
    const query = fieldSearch.trim().toLocaleLowerCase()
    return (dataset?.fields ?? []).filter((field) =>
      query ? field.name.toLocaleLowerCase().includes(query) : true,
    )
  }, [dataset, fieldSearch])

  const values = useMemo(
    () => (selectedField ? getUniqueValues(records, selectedField).slice(0, 200) : []),
    [records, selectedField],
  )

  function toggleValue(value: string) {
    if (!selectedField) return
    const current = filter.fieldFilters[selectedField] ?? []
    const nextValues = current.includes(value)
      ? current.filter((item) => item !== value)
      : [...current, value]
    onFilterChange({
      ...filter,
      fieldFilters: {
        ...filter.fieldFilters,
        [selectedField]: nextValues,
      },
    })
  }

  function clearFilters() {
    onFilterChange({ ...filter, fieldFilters: {} })
  }

  return (
    <aside className="side-panel">
      <div className="panel-header">
        <h2>字段</h2>
        <button type="button" onClick={clearFilters}>清除筛选</button>
      </div>
      <input
        className="text-input"
        value={fieldSearch}
        onChange={(event) => setFieldSearch(event.target.value)}
        placeholder="搜索字段名"
      />
      <div className="field-list">
        {fields.map((field) => (
          <button
            className={field.name === selectedField ? "field-row active" : "field-row"}
            type="button"
            key={field.name}
            onClick={() => setSelectedField(field.name)}
          >
            <span>{field.name}</span>
            <small>{field.source === "derived" ? "派生" : "原始"}</small>
          </button>
        ))}
      </div>
      <div className="value-list">
        {values.map((item) => {
          const checked = selectedField
            ? (filter.fieldFilters[selectedField] ?? []).includes(item.value)
            : false
          return (
            <label className="value-row" key={item.value}>
              <input
                type="checkbox"
                checked={checked}
                onChange={() => toggleValue(item.value)}
              />
              <span>{item.value}</span>
              <small>{item.count}</small>
            </label>
          )
        })}
      </div>
    </aside>
  )
}
```

- [ ] **Step 2: Create StatsPanel**

Create `src/components/StatsPanel.tsx`:

```tsx
import { useMemo } from "react"
import { buildStats } from "../lib/filtering"
import type { FeatureRecord, FieldDefinition } from "../types/geo"

type StatsPanelProps = {
  fields: FieldDefinition[]
  records: FeatureRecord[]
  selectedField: string
  onSelectedFieldChange: (field: string) => void
  onAddFieldFilter: (field: string, value: string) => void
}

export function StatsPanel({
  fields,
  records,
  selectedField,
  onSelectedFieldChange,
  onAddFieldFilter,
}: StatsPanelProps) {
  const stats = useMemo(() => buildStats(records, selectedField), [records, selectedField])

  async function copyStats() {
    const text = stats
      .map((row) => `${row.value}\t${row.count}\t${(row.ratio * 100).toFixed(2)}%`)
      .join("\n")
    await navigator.clipboard.writeText(text)
  }

  return (
    <aside className="stats-panel">
      <div className="panel-header">
        <h2>统计</h2>
        <button type="button" onClick={copyStats} disabled={stats.length === 0}>复制</button>
      </div>
      <select
        className="text-input"
        value={selectedField}
        onChange={(event) => onSelectedFieldChange(event.target.value)}
      >
        {fields.map((field) => (
          <option key={field.name} value={field.name}>
            {field.name}
          </option>
        ))}
      </select>
      <div className="stats-list">
        {stats.map((row) => (
          <button
            className="stats-row"
            type="button"
            key={row.value}
            onClick={() => onAddFieldFilter(selectedField, row.value)}
          >
            <span>{row.value}</span>
            <strong>{row.count.toLocaleString("zh-CN")}</strong>
            <small>{(row.ratio * 100).toFixed(1)}%</small>
          </button>
        ))}
      </div>
    </aside>
  )
}
```

- [ ] **Step 3: Wire panels into App**

Modify `src/App.tsx` to add imports:

```tsx
import { FieldPanel } from "./components/FieldPanel"
import { StatsPanel } from "./components/StatsPanel"
```

Add state:

```tsx
const [statsField, setStatsField] = useState("admin_country")
```

Add handler inside `App`:

```tsx
function addFieldFilter(field: string, value: string) {
  const current = filter.fieldFilters[field] ?? []
  if (current.includes(value)) return
  setFilter({
    ...filter,
    fieldFilters: {
      ...filter.fieldFilters,
      [field]: [...current, value],
    },
  })
}
```

Replace the placeholder section:

```tsx
<section className="workbench-grid">
  <FieldPanel
    dataset={dataset}
    records={filteredRecords}
    filter={filter}
    onFilterChange={setFilter}
  />
  <div className="table-placeholder">
    <input
      className="global-search"
      value={filter.searchText}
      onChange={(event) => setFilter({ ...filter, searchText: event.target.value })}
      placeholder="全局搜索，例如：茶"
    />
    <p>表格将在下一任务接入。</p>
  </div>
  <StatsPanel
    fields={dataset?.fields ?? []}
    records={filteredRecords}
    selectedField={statsField}
    onSelectedFieldChange={setStatsField}
    onAddFieldFilter={addFieldFilter}
  />
</section>
```

- [ ] **Step 4: Add panel styles**

Append to `src/styles.css`:

```css
.workbench-grid {
  height: calc(100vh - 56px);
  display: grid;
  grid-template-columns: 280px minmax(0, 1fr) 300px;
  overflow: hidden;
}

.side-panel,
.stats-panel {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 12px;
  overflow: hidden;
  border-right: 1px solid #d8dee3;
  background: #ffffff;
}

.stats-panel {
  border-right: 0;
  border-left: 1px solid #d8dee3;
}

.panel-header {
  min-height: 32px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.panel-header h2 {
  margin: 0;
  font-size: 15px;
}

.panel-header button {
  min-height: 28px;
  border: 1px solid #c9d2d8;
  border-radius: 6px;
  background: #ffffff;
}

.text-input,
.global-search {
  width: 100%;
  min-height: 34px;
  padding: 0 10px;
  border: 1px solid #c9d2d8;
  border-radius: 6px;
  background: #ffffff;
}

.field-list,
.value-list,
.stats-list {
  min-height: 0;
  overflow: auto;
}

.field-row,
.stats-row {
  width: 100%;
  min-height: 34px;
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 8px;
  padding: 0 8px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  text-align: left;
  cursor: pointer;
}

.field-row.active,
.field-row:hover,
.stats-row:hover {
  background: #e8f3f1;
}

.field-row span,
.stats-row span,
.value-row span {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.field-row small,
.value-row small,
.stats-row small {
  color: #60707a;
}

.value-row {
  min-height: 30px;
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 8px;
}

.table-placeholder {
  min-width: 0;
  display: grid;
  grid-template-rows: auto 1fr;
  gap: 12px;
  padding: 12px;
  overflow: hidden;
}
```

- [ ] **Step 5: Build frontend**

Run:

```powershell
pnpm build
```

Expected: build succeeds.

- [ ] **Step 6: Commit**

Run:

```powershell
git add src/App.tsx src/components/FieldPanel.tsx src/components/StatsPanel.tsx src/styles.css
git commit -m "feat: add field filters and statistics panel"
```

---

### Task 10: Build Virtualized Attribute Table

**Files:**
- Create: `src/components/DataTable.tsx`
- Modify: `src/App.tsx`
- Modify: `src/styles.css`

**Interfaces:**
- Consumes:
  - `FeatureRecord`, `FieldDefinition`, `FilterState`.
  - `getRecordValue` from `src/lib/filtering.ts`.
- Produces:
  - `DataTable` props:
    `fields`, `records`, `sort`, `onSortChange`.

- [ ] **Step 1: Create DataTable component**

Create `src/components/DataTable.tsx`:

```tsx
import { useVirtualizer } from "@tanstack/react-virtual"
import { ArrowDown, ArrowUp, ChevronsUpDown } from "lucide-react"
import { useMemo, useRef } from "react"
import { getRecordValue } from "../lib/filtering"
import type { FeatureRecord, FieldDefinition, FilterState } from "../types/geo"

type DataTableProps = {
  fields: FieldDefinition[]
  records: FeatureRecord[]
  sort: FilterState["sort"]
  onSortChange: (sort: FilterState["sort"]) => void
}

export function DataTable({ fields, records, sort, onSortChange }: DataTableProps) {
  const parentRef = useRef<HTMLDivElement | null>(null)
  const rowVirtualizer = useVirtualizer({
    count: records.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 34,
    overscan: 12,
  })

  const columns = useMemo(() => fields.map((field) => field.name), [fields])

  function toggleSort(field: string) {
    if (sort?.field !== field) {
      onSortChange({ field, direction: "asc" })
      return
    }
    if (sort.direction === "asc") {
      onSortChange({ field, direction: "desc" })
      return
    }
    onSortChange(null)
  }

  return (
    <div className="data-table-shell">
      <div className="data-table-header" style={{ gridTemplateColumns: gridTemplate(columns.length) }}>
        {columns.map((field) => (
          <button className="column-header" type="button" key={field} onClick={() => toggleSort(field)}>
            <span>{field}</span>
            {sort?.field === field ? (
              sort.direction === "asc" ? <ArrowUp size={14} /> : <ArrowDown size={14} />
            ) : (
              <ChevronsUpDown size={14} />
            )}
          </button>
        ))}
      </div>
      <div className="data-table-body" ref={parentRef}>
        <div
          className="data-table-spacer"
          style={{ height: `${rowVirtualizer.getTotalSize()}px` }}
        >
          {rowVirtualizer.getVirtualItems().map((virtualRow) => {
            const record = records[virtualRow.index]
            return (
              <div
                className="data-table-row"
                key={record.id}
                style={{
                  gridTemplateColumns: gridTemplate(columns.length),
                  transform: `translateY(${virtualRow.start}px)`,
                }}
              >
                {columns.map((field) => (
                  <span className="data-table-cell" key={field} title={getRecordValue(record, field) ?? ""}>
                    {getRecordValue(record, field) ?? ""}
                  </span>
                ))}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function gridTemplate(columnCount: number) {
  return `repeat(${Math.max(columnCount, 1)}, minmax(140px, 1fr))`
}
```

- [ ] **Step 2: Wire DataTable into App**

Modify `src/App.tsx` imports:

```tsx
import { DataTable } from "./components/DataTable"
```

Replace the `<p>表格将在下一任务接入。</p>` inside `.table-placeholder`:

```tsx
<DataTable
  fields={dataset?.fields ?? []}
  records={filteredRecords}
  sort={filter.sort}
  onSortChange={(sort) => setFilter({ ...filter, sort })}
/>
```

- [ ] **Step 3: Add table styles**

Append to `src/styles.css`:

```css
.data-table-shell {
  min-width: 0;
  min-height: 0;
  display: grid;
  grid-template-rows: 36px minmax(0, 1fr);
  overflow: hidden;
  border: 1px solid #d8dee3;
  border-radius: 6px;
  background: #ffffff;
}

.data-table-header {
  display: grid;
  overflow: hidden;
  border-bottom: 1px solid #d8dee3;
  background: #eef3f5;
}

.column-header {
  min-width: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 0 8px;
  border: 0;
  border-right: 1px solid #d8dee3;
  background: transparent;
  color: #172026;
  cursor: pointer;
}

.column-header span {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.data-table-body {
  min-height: 0;
  overflow: auto;
}

.data-table-spacer {
  position: relative;
  min-width: max-content;
}

.data-table-row {
  position: absolute;
  left: 0;
  right: 0;
  height: 34px;
  display: grid;
  border-bottom: 1px solid #edf0f2;
}

.data-table-row:nth-child(even) {
  background: #fafbfc;
}

.data-table-cell {
  min-width: 0;
  display: block;
  padding: 7px 8px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  border-right: 1px solid #edf0f2;
}
```

- [ ] **Step 4: Build frontend**

Run:

```powershell
pnpm build
```

Expected: build succeeds.

- [ ] **Step 5: Commit**

Run:

```powershell
git add src/components/DataTable.tsx src/App.tsx src/styles.css
git commit -m "feat: add virtualized attribute table"
```

---

### Task 11: Final Integration Verification

**Files:**
- Modify: `README.md`
- Modify: `docs/superpowers/plans/manual-test-data.md`

**Interfaces:**
- Consumes: all previous tasks.
- Produces:
  - User-facing README with build/run instructions.
  - Verified application build.

- [ ] **Step 1: Add README**

Create or replace `README.md`:

```markdown
# GeoTable

GeoTable 是一个 Windows 桌面属性表工具，用于打开 `shp`、`kml`、`kmz` 点数据，浏览属性字段，进行模糊搜索、字段筛选、分类统计，并根据 WGS84 点坐标离线生成 `admin_country` 和 `admin_level1` 派生字段。

## 开发运行

```powershell
chcp 65001
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
pnpm install
pnpm tauri dev
```

## 验证

```powershell
chcp 65001
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
pnpm test
cargo test --manifest-path src-tauri/Cargo.toml
pnpm build
```

## 第一版限制

- 不显示地图。
- 不支持 `tif` / GeoTIFF。
- 行政区识别只支持 WGS84 经纬度点坐标。
- SHP 如果不是经纬度坐标，仍可浏览属性表，但不识别行政区。
- 内置行政区样例数据仅用于开发验证，发布前需要替换为简化后的 Natural Earth Admin 0 / Admin 1 数据。
```

- [ ] **Step 2: Run full verification**

Run:

```powershell
chcp 65001
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
pnpm test
cargo test --manifest-path src-tauri/Cargo.toml
pnpm build
```

Expected:

```text
Vitest tests pass
Rust tests pass
Vite build succeeds
```

- [ ] **Step 3: Start desktop app for manual smoke test**

Run:

```powershell
pnpm tauri dev
```

Expected:

```text
GeoTable desktop window opens
Toolbar shows 打开文件
```

Manual smoke test:

```text
1. Open a small KML file containing 茶树 and 水稻 placemarks.
2. Confirm total sample count matches the placemark count.
3. Search 茶.
4. Confirm only 茶-related records remain.
5. Select admin_country in the statistics panel.
6. Confirm category counts match visible records.
7. Export CSV and confirm the CSV contains Chinese text in UTF-8.
```

- [ ] **Step 4: Commit**

Run:

```powershell
git add README.md docs/superpowers/plans/manual-test-data.md
git commit -m "docs: add geotable run and verification notes"
```

---

## Plan Self-Review

Spec coverage:

- `shp` import is covered by Task 5.
- `kml` and `kmz` import are covered by Task 4.
- Attribute table and field display are covered by Tasks 2, 8, 9, and 10.
- Global fuzzy search is covered by Task 3 and wired in Task 9.
- Field-specific filtering and field-value filtering are covered by Tasks 3 and 9.
- Manual field statistics are covered by Tasks 3 and 9.
- Total/current result counts are covered by Task 8.
- Offline `admin_country` and `admin_level1` derivation is covered by Task 6 and wired through Task 7.
- CSV export is covered by Task 7.
- Windows desktop shell is covered by Task 1 and verified in Task 11.
- No map preview, no TIFF, no GDAL, and WGS84-only administrative lookup are captured in Global Constraints and README.

Placeholder scan:

- Search found no forbidden marker strings.
- Every task has concrete files, interfaces, commands, and expected results.

Type consistency:

- TypeScript uses `FeatureRecord`, `Dataset`, `FilterState`, `StatsRow`, and `ImportStatus`.
- Rust uses `FeatureRecord`, `Dataset`, `Geometry`, `DerivedFields`, and `GeoTableError`.
- Tauri commands use `open_dataset` and `export_csv`; frontend invokes the same command names.
