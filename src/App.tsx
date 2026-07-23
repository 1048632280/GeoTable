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
