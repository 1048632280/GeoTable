import { useEffect, useMemo, useState } from "react"
import { buildStats } from "../lib/filtering"
import type { FeatureRecord, FieldDefinition } from "../types/geo"

export const MAX_VISIBLE_STATS = 200

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
  const [statSearch, setStatSearch] = useState("")
  useEffect(() => {
    setStatSearch("")
  }, [selectedField])
  const matchingStats = useMemo(() => {
    const query = statSearch.trim().toLocaleLowerCase()
    return query
      ? stats.filter((row) => row.value.toLocaleLowerCase().includes(query))
      : stats
  }, [statSearch, stats])
  const visibleStats = matchingStats.slice(0, MAX_VISIBLE_STATS)
  const [copyError, setCopyError] = useState(false)

  async function copyStats() {
    setCopyError(false)
    const text = stats
      .map((row) => `${row.value}\t${row.count}\t${(row.ratio * 100).toFixed(2)}%`)
      .join("\n")
    try {
      const clipboard = globalThis.navigator.clipboard
      if (!clipboard) throw new Error("Clipboard unavailable")
      await clipboard.writeText(text)
    } catch {
      setCopyError(true)
    }
  }

  return (
    <aside className="stats-panel">
      <div className="panel-header">
        <h2>统计</h2>
        <button type="button" onClick={copyStats} disabled={stats.length === 0}>复制</button>
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
            {field.name}
          </option>
        ))}
      </select>
      <input
        className="text-input"
        value={statSearch}
        onChange={(event) => setStatSearch(event.target.value)}
        placeholder="搜索统计值"
      />
      <div className="stats-list">
        {visibleStats.map((row) => (
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
      {matchingStats.length > MAX_VISIBLE_STATS && (
        <small className="list-limit" role="status">
          显示前 {MAX_VISIBLE_STATS} 项，共 {matchingStats.length.toLocaleString("zh-CN")} 项
        </small>
      )}
    </aside>
  )
}
