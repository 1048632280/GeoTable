import { invoke } from "@tauri-apps/api/core"
import { open, save } from "@tauri-apps/plugin-dialog"
import { getCurrentWindow } from "@tauri-apps/api/window"
import {
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react"
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

const LAYOUT_STORAGE_KEY = "geotable.workbench-layout"
const LEFT_PANE_MIN_WIDTH = 220
const CENTER_PANE_MIN_WIDTH = 260
const RIGHT_PANE_MIN_WIDTH = 240
const SPLITTER_WIDTH = 8
const DEFAULT_LAYOUT = { left: 280, right: 300 }
const SUPPORTED_IMPORT_EXTENSIONS = new Set(["shp", "kml", "kmz"])
const KEYBOARD_RESIZE_STEP = 24

type WorkbenchLayout = typeof DEFAULT_LAYOUT

type SplitterDrag = {
  splitter: "left" | "right"
  pointerId: number
  startX: number
  startLayout: WorkbenchLayout
  viewportWidth: number
}

function clampLayout(layout: WorkbenchLayout, viewportWidth = window.innerWidth): WorkbenchLayout {
  if (!Number.isFinite(layout.left) || !Number.isFinite(layout.right)) {
    return clampLayout(DEFAULT_LAYOUT, viewportWidth)
  }

  const paneWidth = Math.max(0, viewportWidth - (SPLITTER_WIDTH * 2))
  const availableSideWidth = paneWidth - CENTER_PANE_MIN_WIDTH
  if (availableSideWidth < LEFT_PANE_MIN_WIDTH + RIGHT_PANE_MIN_WIDTH) {
    return {
      left: Math.max(0, Math.floor(availableSideWidth / 2)),
      right: Math.max(0, Math.ceil(availableSideWidth / 2)),
    }
  }

  let left = Math.max(LEFT_PANE_MIN_WIDTH, Math.round(layout.left))
  let right = Math.max(RIGHT_PANE_MIN_WIDTH, Math.round(layout.right))
  const overflow = left + right - availableSideWidth
  if (overflow > 0) {
    const rightReduction = Math.min(overflow, right - RIGHT_PANE_MIN_WIDTH)
    right -= rightReduction
    left = Math.max(LEFT_PANE_MIN_WIDTH, left - (overflow - rightReduction))
  }
  return { left, right }
}

function getStoredLayout(): WorkbenchLayout {
  try {
    const stored = localStorage.getItem(LAYOUT_STORAGE_KEY)
    if (!stored) return clampLayout(DEFAULT_LAYOUT)
    const parsed = JSON.parse(stored) as Partial<WorkbenchLayout>
    if (typeof parsed.left !== "number" || typeof parsed.right !== "number") {
      return clampLayout(DEFAULT_LAYOUT)
    }
    return clampLayout({ left: parsed.left, right: parsed.right })
  } catch {
    return clampLayout(DEFAULT_LAYOUT)
  }
}

function isSupportedImportPath(path: string): boolean {
  const extension = path.split(".").pop()?.toLowerCase()
  return extension !== undefined && SUPPORTED_IMPORT_EXTENSIONS.has(extension)
}

function sidePaneRange(
  side: "left" | "right",
  viewportWidth = window.innerWidth,
): { min: number; max: number } {
  const paneWidth = Math.max(0, viewportWidth - (SPLITTER_WIDTH * 2))
  const availableSideWidth = paneWidth - CENTER_PANE_MIN_WIDTH
  if (availableSideWidth < LEFT_PANE_MIN_WIDTH + RIGHT_PANE_MIN_WIDTH) {
    const left = Math.max(0, Math.floor(availableSideWidth / 2))
    const right = Math.max(0, Math.ceil(availableSideWidth / 2))
    const fixedWidth = side === "left" ? left : right
    return { min: fixedWidth, max: fixedWidth }
  }

  return side === "left"
    ? {
        min: LEFT_PANE_MIN_WIDTH,
        max: availableSideWidth - RIGHT_PANE_MIN_WIDTH,
      }
    : {
        min: RIGHT_PANE_MIN_WIDTH,
        max: availableSideWidth - LEFT_PANE_MIN_WIDTH,
      }
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
  const [layout, setLayout] = useState<WorkbenchLayout>(getStoredLayout)
  const isOpeningRef = useRef(false)
  const workbenchRef = useRef<HTMLElement | null>(null)
  const splitterDragRef = useRef<SplitterDrag | null>(null)

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
  const visibleFields = useMemo(() => {
    const visibleFieldNames = new Set(filter.visibleFields)
    return (dataset?.fields ?? []).filter((field) => visibleFieldNames.has(field.name))
  }, [dataset, filter.visibleFields])

  useEffect(() => {
    const visibleFieldNames = new Set(visibleFields.map((field) => field.name))
    if (visibleFieldNames.has(statsField)) return
    setStatsField(
      visibleFieldNames.has("admin_country")
        ? "admin_country"
        : (visibleFields[0]?.name ?? ""),
    )
  }, [statsField, visibleFields])

  useEffect(() => {
    localStorage.setItem(LAYOUT_STORAGE_KEY, JSON.stringify(layout))
  }, [layout])

  useEffect(() => {
    const updateLayoutForViewport = () => setLayout((current) => clampLayout(current))
    window.addEventListener("resize", updateLayoutForViewport)
    return () => window.removeEventListener("resize", updateLayoutForViewport)
  }, [])

  const finishSplitterDrag = useCallback((splitter?: HTMLElement) => {
    const drag = splitterDragRef.current
    splitterDragRef.current = null
    if (drag && splitter?.hasPointerCapture?.(drag.pointerId)) {
      splitter.releasePointerCapture?.(drag.pointerId)
    }
  }, [])

  useEffect(() => {
    const handleWindowBlur = () => finishSplitterDrag()
    window.addEventListener("blur", handleWindowBlur)
    return () => {
      window.removeEventListener("blur", handleWindowBlur)
      finishSplitterDrag()
    }
  }, [finishSplitterDrag])

  const importDataset = useCallback(async (path: string) => {
    if (isOpeningRef.current) return
    isOpeningRef.current = true
    setStatus("loading")
    setError(null)
    try {
      const result = await invoke<Dataset>("open_dataset", { path })
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
  }, [])

  useEffect(() => {
    let disposed = false
    let unlisten: (() => void) | undefined

    void getCurrentWindow().onDragDropEvent((event) => {
      if (event.payload.type !== "drop" || event.payload.paths.length === 0) return
      const path = event.payload.paths[0]
      if (!isSupportedImportPath(path)) {
        setError("不支持的文件类型。请拖入 .shp、.kml 或 .kmz 文件。")
        return
      }
      void importDataset(path)
    }).then((nextUnlisten) => {
      if (disposed) nextUnlisten()
      else unlisten = nextUnlisten
    }).catch(() => {
      // 浏览器预览环境没有 Tauri 窗口 API，忽略监听失败。
    })

    return () => {
      disposed = true
      unlisten?.()
    }
  }, [importDataset])

  function handleSplitterPointerDown(splitter: "left" | "right", event: ReactPointerEvent<HTMLDivElement>) {
    const workbenchWidth = workbenchRef.current?.clientWidth || window.innerWidth
    event.currentTarget.setPointerCapture?.(event.pointerId)
    splitterDragRef.current = {
      splitter,
      pointerId: event.pointerId,
      startX: event.clientX,
      startLayout: layout,
      viewportWidth: workbenchWidth,
    }
  }

  function handleSplitterPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const drag = splitterDragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    const delta = event.clientX - drag.startX
    setLayout(() => clampLayout(
      drag.splitter === "left"
        ? { ...drag.startLayout, left: drag.startLayout.left + delta }
        : { ...drag.startLayout, right: drag.startLayout.right - delta },
      drag.viewportWidth,
    ))
  }

  function handleSplitterKeyDown(splitter: "left" | "right", event: ReactKeyboardEvent<HTMLDivElement>) {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return

    event.preventDefault()
    const direction = event.key === "ArrowRight" ? 1 : -1
    const workbenchWidth = workbenchRef.current?.clientWidth || window.innerWidth
    setLayout((current) => clampLayout(
      splitter === "left"
        ? { ...current, left: current.left + (direction * KEYBOARD_RESIZE_STEP) }
        : { ...current, right: current.right - (direction * KEYBOARD_RESIZE_STEP) },
      workbenchWidth,
    ))
  }

  async function handleOpen() {
    if (isOpeningRef.current) return
    isOpeningRef.current = true
    const previousStatus = status
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
      isOpeningRef.current = false
      await importDataset(selected)
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

  const workbenchWidth = workbenchRef.current?.clientWidth || window.innerWidth
  const leftPaneRange = sidePaneRange("left", workbenchWidth)
  const rightPaneRange = sidePaneRange("right", workbenchWidth)

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
      <section
        ref={workbenchRef}
        className="workbench-grid"
        style={{ gridTemplateColumns: `${layout.left}px ${SPLITTER_WIDTH}px minmax(${CENTER_PANE_MIN_WIDTH}px, 1fr) ${SPLITTER_WIDTH}px ${layout.right}px` }}
      >
        <FieldPanel
          dataset={dataset}
          filter={filter}
          onFilterChange={setFilter}
        />
        <div
          className="workbench-splitter"
          role="separator"
          aria-label="调整字段面板宽度"
          aria-orientation="vertical"
          aria-valuemin={leftPaneRange.min}
          aria-valuemax={leftPaneRange.max}
          aria-valuenow={layout.left}
          tabIndex={0}
          onPointerDown={(event) => handleSplitterPointerDown("left", event)}
          onPointerMove={handleSplitterPointerMove}
          onPointerUp={(event) => finishSplitterDrag(event.currentTarget)}
          onLostPointerCapture={() => finishSplitterDrag()}
          onKeyDown={(event) => handleSplitterKeyDown("left", event)}
        />
        <div className="table-placeholder">
          <input
            className="global-search"
            value={filter.searchText}
            onChange={(event) => setFilter({ ...filter, searchText: event.target.value })}
            placeholder="全局搜索，例如：茶"
          />
          <div className="search-options" aria-label="搜索选项">
            <label>
              <input
                type="checkbox"
                checked={filter.includeHiddenFieldsInSearch}
                onChange={(event) => setFilter({
                  ...filter,
                  includeHiddenFieldsInSearch: event.target.checked,
                })}
              />
              搜索隐藏字段
            </label>
            <label>
              <input
                type="checkbox"
                checked={filter.exactSearch}
                onChange={(event) => setFilter({ ...filter, exactSearch: event.target.checked })}
              />
              精确搜索
            </label>
          </div>
          <DataTable
            fields={visibleFields}
            records={filteredRecords}
            sort={filter.sort}
            onSortChange={(sort) => setFilter({ ...filter, sort })}
          />
        </div>
        <div
          className="workbench-splitter"
          role="separator"
          aria-label="调整统计面板宽度"
          aria-orientation="vertical"
          aria-valuemin={rightPaneRange.min}
          aria-valuemax={rightPaneRange.max}
          aria-valuenow={layout.right}
          tabIndex={0}
          onPointerDown={(event) => handleSplitterPointerDown("right", event)}
          onPointerMove={handleSplitterPointerMove}
          onPointerUp={(event) => finishSplitterDrag(event.currentTarget)}
          onLostPointerCapture={() => finishSplitterDrag()}
          onKeyDown={(event) => handleSplitterKeyDown("right", event)}
        />
        <StatsPanel
          fields={visibleFields}
          records={statsRecords}
          selectedField={statsField}
          fieldFilters={filter.fieldFilters}
          onSelectedFieldChange={setStatsField}
          onFieldFiltersChange={(fieldFilters) => setFilter((current) => ({ ...current, fieldFilters }))}
        />
      </section>
    </main>
  )
}
