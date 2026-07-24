import { useEffect, useMemo, useState } from "react"
import { applyFieldFilters, getUniqueValues } from "../lib/filtering"
import type { FeatureRecord } from "../types/geo"
import type { Dataset, FilterState } from "../types/geo"

type FieldPanelProps = {
  dataset: Dataset | null
  candidateRecords: FeatureRecord[]
  filter: FilterState
  onFilterChange: (next: FilterState) => void
}

export function FieldPanel({ dataset, candidateRecords, filter, onFilterChange }: FieldPanelProps) {
  const [fieldSearch, setFieldSearch] = useState("")
  const [valueSearch, setValueSearch] = useState("")
  const [selectedField, setSelectedField] = useState<string | null>(null)

  useEffect(() => {
    setSelectedField(null)
  }, [dataset])

  useEffect(() => {
    setValueSearch("")
  }, [dataset, selectedField])

  const fields = useMemo(() => {
    const query = fieldSearch.trim().toLocaleLowerCase()
    return (dataset?.fields ?? []).filter((field) =>
      query ? field.name.toLocaleLowerCase().includes(query) : true,
    )
  }, [dataset, fieldSearch])

  const values = useMemo(() => {
    if (!dataset || !selectedField) return []
    const query = valueSearch.trim().toLocaleLowerCase()
    const { [selectedField]: _excluded, ...fieldFilters } = filter.fieldFilters
    const records = applyFieldFilters(candidateRecords, fieldFilters)
    const countedValues = getUniqueValues(records, selectedField)
    const matchingValues = query
      ? countedValues.filter((item) => item.value.toLocaleLowerCase().includes(query))
      : countedValues
    const selectedValues = filter.fieldFilters[selectedField] ?? []
    const values = matchingValues.filter(
      (item, index) => index < 200 || selectedValues.includes(item.value),
    )
    const countedValueSet = new Set(countedValues.map((item) => item.value))
    for (const value of selectedValues) {
      if (!countedValueSet.has(value)) values.push({ value, count: 0 })
    }
    return values
  }, [candidateRecords, dataset, filter.fieldFilters, selectedField, valueSearch])

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
      {selectedField && (
        <input
          className="text-input"
          value={valueSearch}
          onChange={(event) => setValueSearch(event.target.value)}
          placeholder="搜索字段值"
        />
      )}
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
