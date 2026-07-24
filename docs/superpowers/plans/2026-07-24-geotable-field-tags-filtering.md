# GeoTable Field Tags Filtering Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the left panel a field-management-only surface and make the right panel the single place for tag-based attribute filtering.

**Architecture:** Add a small display helper for field labels and UI value aliases, then route field labels through FieldPanel, DataTable, and StatsPanel. Keep filter storage in existing `FilterState.fieldFilters`, where values remain the same strings returned by `getRecordValue`, and make StatsPanel render one grouped tag per filtered field plus checkbox rows for OR-within-field and AND-across-fields filtering.

**Tech Stack:** React 19, TypeScript, Vitest, Testing Library, existing CSS, existing Tauri data model.

## Global Constraints

- Work directly on `main`; the user explicitly approved using `main`.
- Use UTF-8 for all file reads/writes. In PowerShell, run `chcp 65001` and set UTF-8 output before reading Chinese files.
- Do not commit `.codex/` or `.superpowers/`.
- Code comments, if added, must be Chinese.
- Left panel only manages fields: no field-value list, no field-value search, no field sample text.
- `admin_country` displays as `国家`, `admin_level1` displays as `一级行政区`, and original field `name` displays as `作物`.
- UI display value `中华人民共和国` displays as `中国` in table cells, statistics rows, and filter tags.
- Original fields except `name` default into a collapsible "其他原始字段" group. Searching field names shows matching fields even if they are inside that group.
- Right panel uses tag-based filters. Same-field values are OR; different fields are AND. Statistics for the currently selected field ignores that field's own active filter so users can select additional values from the same field.

---

### Task 1: Display Labels And UI Value Aliases

**Files:**
- Create: `src/lib/display.ts`
- Create: `src/lib/display.test.ts`
- Modify: `src/components/DataTable.tsx`
- Modify: `src/components/StatsPanel.tsx`
- Modify: `src/components/FieldPanel.tsx`

**Interfaces:**
- Produces: `displayFieldName(fieldName: string): string`
- Produces: `displayFieldValue(value: string | null): string`
- Consumes: Existing `getRecordValue(record, field)`

- [ ] **Step 1: Write failing tests**

Add `src/lib/display.test.ts`:

```ts
import { describe, expect, it } from "vitest"
import { displayFieldName, displayFieldValue } from "./display"

describe("display helpers", () => {
  it("uses Chinese labels for known fields", () => {
    expect(displayFieldName("name")).toBe("作物")
    expect(displayFieldName("admin_country")).toBe("国家")
    expect(displayFieldName("admin_level1")).toBe("一级行政区")
    expect(displayFieldName("soil_type")).toBe("soil_type")
  })

  it("shortens People's Republic of China for UI display", () => {
    expect(displayFieldValue("中华人民共和国")).toBe("中国")
    expect(displayFieldValue("澳大利亚")).toBe("澳大利亚")
    expect(displayFieldValue(null)).toBe("")
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --run src/lib/display.test.ts`

Expected: FAIL because `src/lib/display.ts` does not exist.

- [ ] **Step 3: Implement display helper**

Create `src/lib/display.ts`:

```ts
const FIELD_LABELS: Record<string, string> = {
  name: "作物",
  admin_country: "国家",
  admin_level1: "一级行政区",
}

export function displayFieldName(fieldName: string): string {
  return FIELD_LABELS[fieldName] ?? fieldName
}

export function displayFieldValue(value: string | null): string {
  if (value === null) return ""
  return value === "中华人民共和国" ? "中国" : value
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- --run src/lib/display.test.ts`

Expected: PASS.

- [ ] **Step 5: Wire helper into UI components**

Use `displayFieldName` for field labels in `DataTable`, `StatsPanel`, and `FieldPanel`. Use `displayFieldValue` for table cells and stats row labels. Keep raw field names in `value`, `key`, sort state, filter state, and aria labels where needed to keep behavior stable.

- [ ] **Step 6: Run focused tests**

Run: `npm test -- --run src/lib/display.test.ts src/App.test.tsx`

Expected: existing App tests will fail where they still expect raw field names; those tests are updated in Task 2 and Task 3.

- [ ] **Step 7: Commit**

Commit message: `feat: add display labels for fields and values`

---

### Task 2: Left Panel Field Management Only

**Files:**
- Modify: `src/components/FieldPanel.tsx`
- Modify: `src/App.tsx`
- Modify: `src/App.test.tsx`
- Modify: `src/styles.css`

**Interfaces:**
- Consumes: `displayFieldName(fieldName: string): string`
- Produces: FieldPanel no longer needs `candidateRecords`
- Produces: FieldPanel no longer changes `fieldFilters`

- [ ] **Step 1: Write failing tests**

Update `src/App.test.tsx` with tests that assert:

```ts
it("shows the left panel as field management without samples or value filters", async () => {
  openMock.mockResolvedValueOnce("tea.kml")
  invokeMock.mockResolvedValueOnce(teaDataset)
  const user = userEvent.setup()

  render(<App />)
  await user.click(screen.getByRole("button", { name: "打开文件" }))
  await screen.findByText("已就绪")

  expect(screen.getByRole("button", { name: "隐藏作物" })).toBeInTheDocument()
  expect(screen.getByRole("button", { name: "隐藏国家" })).toBeInTheDocument()
  expect(screen.queryByPlaceholderText("搜索字段值")).not.toBeInTheDocument()
  expect(screen.queryByText(/样例：/)).not.toBeInTheDocument()
})
```

Add a second test with a dataset containing `name`, `note`, `soil`, `admin_country`, and `admin_level1` to assert that non-name original fields are under a collapsed `其他原始字段（2）` group by default, and searching `soil` shows `soil`.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --run src/App.test.tsx`

Expected: FAIL because FieldPanel still renders sample text and field value controls.

- [ ] **Step 3: Implement field-only panel**

Remove `selectedField`, `valueSearch`, `values`, and `toggleValue` from `FieldPanel`. Render primary fields first:

```ts
const primaryFieldNames = new Set(["name", "admin_country", "admin_level1"])
const primaryFields = fields.filter((field) => primaryFieldNames.has(field.name))
const otherOriginalFields = fields.filter(
  (field) => field.source === "original" && !primaryFieldNames.has(field.name),
)
const otherDerivedFields = fields.filter(
  (field) => field.source === "derived" && !primaryFieldNames.has(field.name),
)
```

When `fieldSearch.trim()` is empty, show `primaryFields`, then a collapsible button `其他原始字段（N）`, then other original fields only when expanded. When searching, show all matching fields without forcing the group to stay collapsed. Keep visibility actions and `hideEmptyFields`.

- [ ] **Step 4: Update App props**

Remove `candidateRecords={baseRecords}` from FieldPanel usage, and remove `candidateRecords` from `FieldPanelProps`.

- [ ] **Step 5: Run focused tests**

Run: `npm test -- --run src/App.test.tsx`

Expected: PASS after updating existing assertions to use `作物`, `国家`, and `一级行政区`.

- [ ] **Step 6: Commit**

Commit message: `feat: simplify field panel management`

---

### Task 3: Right Panel Tag-Based Attribute Filters

**Files:**
- Modify: `src/components/StatsPanel.tsx`
- Modify: `src/App.tsx`
- Modify: `src/App.test.tsx`
- Modify: `src/styles.css`

**Interfaces:**
- Consumes: `displayFieldName(fieldName: string): string`
- Consumes: `displayFieldValue(value: string | null): string`
- Consumes: `filter.fieldFilters`
- Produces: `onFieldFiltersChange(next: FilterState["fieldFilters"]): void`

- [ ] **Step 1: Write failing tests**

Update `src/App.test.tsx` to assert:

```ts
it("uses right-panel tags for same-field OR and cross-field AND filters", async () => {
  const dataset = {
    ...teaDataset,
    totalRecords: 4,
    fields: [
      { name: "name", source: "original" },
      { name: "admin_country", source: "derived" },
      { name: "admin_level1", source: "derived" },
    ],
    records: [
      { id: 1, geometry: null, properties: { name: "茶园" }, derived: { admin_country: "中华人民共和国", admin_level1: "云南" } },
      { id: 2, geometry: null, properties: { name: "茶树" }, derived: { admin_country: "澳大利亚", admin_level1: "昆士兰" } },
      { id: 3, geometry: null, properties: { name: "小麦" }, derived: { admin_country: "澳大利亚", admin_level1: "维多利亚" } },
      { id: 4, geometry: null, properties: { name: "咖啡" }, derived: { admin_country: "越南", admin_level1: "林同" } },
    ],
    warnings: [],
  } satisfies Dataset
  openMock.mockResolvedValueOnce("crops.kml")
  invokeMock.mockResolvedValueOnce(dataset)
  const user = userEvent.setup()

  render(<App />)
  await user.click(screen.getByRole("button", { name: "打开文件" }))
  await screen.findByText("已就绪")

  await user.selectOptions(screen.getByRole("combobox"), "admin_country")
  await user.click(screen.getByRole("checkbox", { name: "中国1" }))
  await user.click(screen.getByRole("checkbox", { name: "澳大利亚2" }))
  expect(screen.getByText("当前结果 3")).toBeInTheDocument()
  expect(screen.getByText("国家: 中国、澳大利亚")).toBeInTheDocument()

  await user.selectOptions(screen.getByRole("combobox"), "name")
  await user.click(screen.getByRole("checkbox", { name: "茶园1" }))
  expect(screen.getByText("当前结果 1")).toBeInTheDocument()
  expect(screen.getByText("作物: 茶园")).toBeInTheDocument()
})
```

Add a second test to assert that clicking the right-panel `清空` button clears field filters and restores all current search results.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --run src/App.test.tsx`

Expected: FAIL because StatsPanel still uses button-only additive filtering and has no tags or clear button.

- [ ] **Step 3: Implement StatsPanel filter tags and checkbox rows**

Change StatsPanel props to receive `fieldFilters` and `onFieldFiltersChange`. Render one tag per field in `fieldFilters`, using display names and display values:

```tsx
<button type="button" onClick={() => removeFieldFilter(field)}>
  {displayFieldName(field)}: {values.map(displayFieldValue).join("、")}
</button>
```

Render statistic rows as labels with checkboxes. Toggling a checkbox adds/removes the raw row value from `fieldFilters[selectedField]`; when the value list becomes empty, remove the key from `fieldFilters`.

- [ ] **Step 4: Keep current-field stats selectable**

Keep App's existing `statsRecords` behavior that removes the current `statsField` filter before building stats. This satisfies: "Statistics for the currently selected field ignores that field's own active filter."

- [ ] **Step 5: Update tests**

Replace existing App tests that click stat buttons with checkbox interactions. Assertions should use displayed labels: `作物`, `国家`, `一级行政区`, and `中国`.

- [ ] **Step 6: Run focused tests**

Run: `npm test -- --run src/App.test.tsx`

Expected: PASS.

- [ ] **Step 7: Commit**

Commit message: `feat: add tag-based stats filters`

---

### Task 4: Full Verification And Review

**Files:**
- Modify: `.superpowers/sdd/progress.md` only if present and ignored

**Interfaces:**
- Consumes: all earlier tasks
- Produces: pushed `main` if tests and review pass

- [ ] **Step 1: Run full checks**

Run:

```powershell
npm test
npm run build
cargo test --manifest-path src-tauri\Cargo.toml
git diff --check
```

Expected: all pass.

- [ ] **Step 2: Request final code review**

Dispatch a reviewer with the full branch diff from the base commit before Task 1 to HEAD. Ask it to verify the requested left/right panel responsibilities, display labels, tag filter semantics, and regression risk.

- [ ] **Step 3: Fix any Critical or Important findings**

If review finds Critical or Important issues, fix them with focused tests and rerun relevant checks.

- [ ] **Step 4: Push**

If tests and review pass:

```powershell
git push origin main
```
