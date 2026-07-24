import { useEffect, useMemo, useState } from "react"
import { displayFieldName, displayFieldValue } from "../lib/display"
import { buildStats } from "../lib/filtering"
import type { FeatureRecord, FieldDefinition, FilterState } from "../types/geo"

export const MAX_VISIBLE_STATS = 200

type StatsPanelProps = {
  fields: FieldDefinition[]
  records: FeatureRecord[]
  selectedField: string
  fieldFilters: FilterState["fieldFilters"]
  onSelectedFieldChange: (field: string) => void
  onFieldFiltersChange: (fieldFilters: FilterState["fieldFilters"]) => void
}

function filterEntries(fieldFilters: FilterState["fieldFilters"]) {
  return Object.entries(fieldFilters).filter(([, values]) => values.length > 0)
}

export function StatsPanel({
  fields,
  records,
  selectedField,
  fieldFilters,
  onSelectedFieldChange,
  onFieldFiltersChange,
}: StatsPanelProps) {
  const stats = useMemo(() => buildStats(records, selectedField), [records, selectedField])
  const [statSearch, setStatSearch] = useState("")
  const [copyError, setCopyError] = useState(false)
  const activeFilters = useMemo(() => filterEntries(fieldFilters), [fieldFilters])

  useEffect(() => {
    setStatSearch("")
  }, [selectedField])

  const matchingStats = useMemo(() => {
    const query = statSearch.trim().toLocaleLowerCase()
    return query
      ? stats.filter((row) => displayFieldValue(row.value).toLocaleLowerCase().includes(query))
      : stats
  }, [statSearch, stats])
  const visibleStats = matchingStats.slice(0, MAX_VISIBLE_STATS)

  async function copyStats() {
    setCopyError(false)
    const text = stats
      .map((row) => `${displayFieldValue(row.value)}\t${row.count}\t${(row.ratio * 100).toFixed(2)}%`)
      .join("\n")
    try {
      const clipboard = globalThis.navigator.clipboard
      if (!clipboard) throw new Error("Clipboard unavailable")
      await clipboard.writeText(text)
    } catch {
      setCopyError(true)
    }
  }

  function updateFieldFilter(field: string, values: string[]) {
    const nextFilters = { ...fieldFilters }
    if (values.length > 0) {
      nextFilters[field] = values
    } else {
      delete nextFilters[field]
    }
    onFieldFiltersChange(nextFilters)
  }

  function toggleStatsValue(value: string) {
    if (!selectedField) return
    const currentValues = fieldFilters[selectedField] ?? []
    const nextValues = currentValues.includes(value)
      ? currentValues.filter((item) => item !== value)
      : [...currentValues, value]
    updateFieldFilter(selectedField, nextValues)
  }

  function clearAllFilters() {
    onFieldFiltersChange({})
  }

  function clearFieldFilter(field: string) {
    const nextFilters = { ...fieldFilters }
    delete nextFilters[field]
    onFieldFiltersChange(nextFilters)
  }

  return (
    <aside className="stats-panel">
      <div className="panel-header">
        <h2>统计</h2>
        <div className="panel-actions">
          <button type="button" onClick={copyStats} disabled={stats.length === 0}>复制</button>
          <button type="button" onClick={clearAllFilters} disabled={activeFilters.length === 0}>清空</button>
        </div>
      </div>
      {copyError && <small role="status">复制失败</small>}
      <select
        className="text-input"
        value={selectedField}
        onChange={(event) => onSelectedFieldChange(event.target.value)}
      >
        {fields.length === 0 && <option value="" disabled>无可见字段</option>}
        {fields.map((field) => (
          <option key={field.name} value={field.name}>
            {displayFieldName(field.name)}
          </option>
        ))}
      </select>
      {activeFilters.length > 0 && (
        <div className="filter-tags" aria-label="已选筛选">
          {activeFilters.map(([field, values]) => (
            <span className="filter-tag" key={field}>
              <span>{displayFieldName(field)}: {values.map(displayFieldValue).join("、")}</span>
              <button
                type="button"
                aria-label={`清除${displayFieldName(field)}筛选`}
                onClick={() => clearFieldFilter(field)}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}
      <input
        className="text-input"
        value={statSearch}
        onChange={(event) => setStatSearch(event.target.value)}
        placeholder="搜索统计值"
      />
      <div className="stats-list">
        {visibleStats.map((row) => {
          const selected = (fieldFilters[selectedField] ?? []).includes(row.value)
          const label = displayFieldValue(row.value)
          return (
            <button
              className={selected ? "stats-row selected" : "stats-row"}
              key={row.value}
              type="button"
              aria-pressed={selected}
              onClick={() => toggleStatsValue(row.value)}
            >
              <span className="stats-row-main">
                <span className="stats-row-value">{label}</span>
                <small>{(row.ratio * 100).toFixed(1)}%</small>
              </span>
              <strong>{row.count.toLocaleString("zh-CN")}</strong>
            </button>
          )
        })}
      </div>
      {matchingStats.length > MAX_VISIBLE_STATS && (
        <small className="list-limit" role="status">
          显示前 {MAX_VISIBLE_STATS} 项，共 {matchingStats.length.toLocaleString("zh-CN")} 项
        </small>
      )}
    </aside>
  )
}
