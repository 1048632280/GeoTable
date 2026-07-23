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
