import { invoke } from "@tauri-apps/api/core"
import { open, save } from "@tauri-apps/plugin-dialog"
import { useMemo, useRef, useState } from "react"
import { FieldPanel } from "./components/FieldPanel"
import { StatsPanel } from "./components/StatsPanel"
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

function withoutFieldFilter(filter: FilterState, field: string): FilterState {
  const { [field]: _excluded, ...fieldFilters } = filter.fieldFilters
  return { ...filter, fieldFilters }
}

export default function App() {
  const [dataset, setDataset] = useState<Dataset | null>(null)
  const [filter, setFilter] = useState<FilterState>(initialFilter)
  const [status, setStatus] = useState<ImportStatus>("idle")
  const [error, setError] = useState<string | null>(null)
  const [statsField, setStatsField] = useState("admin_country")
  const isOpeningRef = useRef(false)

  const filteredRecords = useMemo(
    () => (dataset ? applyFilters(dataset.records, filter) : []),
    [dataset, filter],
  )
  const statsRecords = useMemo(
    () => (dataset ? applyFilters(dataset.records, withoutFieldFilter(filter, statsField)) : []),
    [dataset, filter, statsField],
  )

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
      setFilter(initialFilter)
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
          records={statsRecords}
          selectedField={statsField}
          onSelectedFieldChange={setStatsField}
          onAddFieldFilter={addFieldFilter}
        />
      </section>
    </main>
  )
}
