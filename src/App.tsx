import { invoke } from "@tauri-apps/api/core"
import { open, save } from "@tauri-apps/plugin-dialog"
import { useMemo, useRef, useState } from "react"
import { FieldPanel } from "./components/FieldPanel"
import { DataTable } from "./components/DataTable"
import { StatsPanel } from "./components/StatsPanel"
import { Toolbar } from "./components/Toolbar"
import {
  applyFieldFilters,
  applyFilters,
  getDefaultVisibleFields,
  sortRecords,
} from "./lib/filtering"
import type { Dataset, FilterState, ImportStatus } from "./types/geo"
import "./styles.css"

const initialFilter: FilterState = {
  searchText: "",
  searchMode: "all",
  searchFields: [],
  visibleFields: [],
  includeHiddenFieldsInSearch: false,
  exactSearch: false,
  fieldFilters: {},
  sort: null,
}

function withoutFieldFilter(filter: FilterState, field: string): FilterState {
  const { [field]: _excluded, ...fieldFilters } = filter.fieldFilters
  return { ...filter, fieldFilters }
}

function warningSummary(warnings: Dataset["warnings"]): Array<{
  key: string
  message: string
  count: number
  recordIds: number[]
}> {
  const groups = new Map<string, { message: string; count: number; recordIds: number[] }>()
  for (const warning of warnings) {
    const key = `${warning.code}\0${warning.message}`
    const group = groups.get(key) ?? { message: warning.message, count: 0, recordIds: [] }
    group.count += 1
    if (warning.recordId !== undefined && group.recordIds.length < 5) {
      group.recordIds.push(warning.recordId)
    }
    groups.set(key, group)
  }
  return Array.from(groups, ([key, group]) => ({ key, ...group }))
}

export default function App() {
  const [dataset, setDataset] = useState<Dataset | null>(null)
  const [filter, setFilter] = useState<FilterState>(initialFilter)
  const [status, setStatus] = useState<ImportStatus>("idle")
  const [error, setError] = useState<string | null>(null)
  const [statsField, setStatsField] = useState("admin_country")
  const isOpeningRef = useRef(false)

  const baseRecords = useMemo(
    () => dataset
      ? applyFilters(dataset.records, {
          ...initialFilter,
          searchText: filter.searchText,
          searchMode: filter.searchMode,
          searchFields: filter.searchFields,
          visibleFields: filter.visibleFields,
          includeHiddenFieldsInSearch: filter.includeHiddenFieldsInSearch,
          exactSearch: filter.exactSearch,
        })
      : [],
    [
      dataset,
      filter.exactSearch,
      filter.includeHiddenFieldsInSearch,
      filter.searchFields,
      filter.searchMode,
      filter.searchText,
      filter.visibleFields,
    ],
  )
  const filteredRecords = useMemo(() => {
    const records = applyFieldFilters(baseRecords, filter.fieldFilters)
    return filter.sort ? sortRecords(records, filter.sort.field, filter.sort.direction) : records
  }, [baseRecords, filter.fieldFilters, filter.sort])
  const statsRecords = useMemo(
    () => applyFieldFilters(baseRecords, withoutFieldFilter(filter, statsField).fieldFilters),
    [baseRecords, filter, statsField],
  )
  const warningGroups = useMemo(() => warningSummary(dataset?.warnings ?? []), [dataset])

  async function handleOpen() {
    if (isOpeningRef.current) return
    isOpeningRef.current = true
    const previousStatus = status
    setStatus("loading")
    setError(null)
    try {
      const selected = await open({
        multiple: false,
        filters: [{ name: "Geo files", extensions: ["shp", "kml", "kmz"] }],
      })
      if (typeof selected !== "string") {
        setStatus(previousStatus)
        return
      }

      const result = await invoke<Dataset>("open_dataset", { path: selected })
      setDataset(result)
      setFilter({ ...initialFilter, visibleFields: getDefaultVisibleFields(result.fields) })
      setStatsField(
        result.fields.some((field) => field.name === "admin_country")
          ? "admin_country"
          : (result.fields[0]?.name ?? ""),
      )
      setStatus(result.warnings.length > 0 ? "partial_failure" : "ready")
    } catch (caught) {
      setStatus("failed")
      setError(String(caught))
    } finally {
      isOpeningRef.current = false
    }
  }

  async function handleExport() {
    if (!dataset || filteredRecords.length === 0) return
    setError(null)
    try {
      const target = await save({
        filters: [{ name: "CSV", extensions: ["csv"] }],
        defaultPath: `${dataset.fileName}.csv`,
      })
      if (typeof target !== "string") return

      await invoke("export_csv", {
        path: target,
        dataset,
        recordIds: filteredRecords.map((record) => record.id),
      })
    } catch (caught) {
      setError(String(caught))
    }
  }

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
      {warningGroups.length > 0 && (
        <section className="warning-banner" aria-label="导入警告">
          <strong>导入完成，共 {dataset?.warnings.length ?? 0} 条警告</strong>
          <ul>
            {warningGroups.map((group) => (
              <li key={group.key}>
                {group.message}
                {group.recordIds.length > 0 && `（记录 ${group.recordIds.join("、")}）`}
                {group.count > 1 && `，共 ${group.count} 条`}
              </li>
            ))}
          </ul>
        </section>
      )}
      <section className="workbench-grid">
        <FieldPanel
          dataset={dataset}
          candidateRecords={baseRecords}
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
          <DataTable
            fields={dataset?.fields ?? []}
            records={filteredRecords}
            sort={filter.sort}
            onSortChange={(sort) => setFilter({ ...filter, sort })}
          />
        </div>
        <StatsPanel
          fields={dataset?.fields ?? []}
          records={statsRecords}
          selectedField={statsField}
          onSelectedFieldChange={setStatsField}
          onAddFieldFilter={addFieldFilter}
        />
      </section>
    </main>
  )
}
