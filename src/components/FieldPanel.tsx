import { useVirtualizer } from "@tanstack/react-virtual"
import { Eye, EyeOff } from "lucide-react"
import { useEffect, useMemo, useRef, useState } from "react"
import { applyFieldFilters, getRecordValue, getUniqueValues } from "../lib/filtering"
import type { FeatureRecord } from "../types/geo"
import type { Dataset, FilterState } from "../types/geo"

type FieldPanelProps = {
  dataset: Dataset | null
  candidateRecords: FeatureRecord[]
  filter: FilterState
  onFilterChange: (next: FilterState) => void
}

function getFieldSample(dataset: Dataset | null, fieldName: string): string {
  const value = dataset?.records[0] ? getRecordValue(dataset.records[0], fieldName) : null
  if (value === null || value === "") return "样例：空"
  return `样例：${value.slice(0, 20)}${value.length > 20 ? "..." : ""}`
}

export function FieldPanel({ dataset, candidateRecords, filter, onFilterChange }: FieldPanelProps) {
  const [fieldSearch, setFieldSearch] = useState("")
  const [valueSearch, setValueSearch] = useState("")
  const [selectedField, setSelectedField] = useState<string | null>(null)
  const fieldListRef = useRef<HTMLDivElement | null>(null)

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
  const fieldVirtualizer = useVirtualizer({
    count: fields.length,
    getScrollElement: () => fieldListRef.current,
    estimateSize: () => 36,
    initialRect: { width: 0, height: 360 },
    overscan: 12,
  })
  const virtualFields = fieldVirtualizer.getVirtualItems()
  // 无布局尺寸时保留首批字段，避免首次渲染或测试环境中字段面板为空。
  const renderedFields = virtualFields.length > 0
    ? virtualFields
    : fields.slice(0, 12).map((_, index) => ({ index, start: index * 36 }))

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
    const visibleValueSet = new Set(values.map((item) => item.value))
    for (const value of selectedValues) {
      if (visibleValueSet.has(value)) continue
      const counted = countedValues.find((item) => item.value === value)
      values.push(counted ?? { value, count: 0 })
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

  function setVisibleFields(names: string[]) {
    onFilterChange({ ...filter, visibleFields: names })
  }

  function toggleFieldVisibility(field: string) {
    const visibleFields = new Set(filter.visibleFields)
    if (visibleFields.has(field)) {
      visibleFields.delete(field)
    } else {
      visibleFields.add(field)
    }
    setVisibleFields((dataset?.fields ?? [])
      .filter((item) => visibleFields.has(item.name))
      .map((item) => item.name))
  }

  function hideEmptyFields() {
    const nonEmptyFields = new Set<string>()
    for (const record of dataset?.records ?? []) {
      for (const field of dataset?.fields ?? []) {
        const value = getRecordValue(record, field.name)
        if (value !== undefined && value !== null && value !== "") {
          nonEmptyFields.add(field.name)
        }
      }
    }
    setVisibleFields(filter.visibleFields.filter((field) => nonEmptyFields.has(field)))
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
      <div className="field-actions" aria-label="字段显示操作">
        <button type="button" onClick={() => setVisibleFields((dataset?.fields ?? []).map((field) => field.name))}>全部显示</button>
        <button type="button" onClick={() => setVisibleFields([])}>全部隐藏</button>
        <button type="button" onClick={() => setVisibleFields(fields.map((field) => field.name))}>只显示搜索结果</button>
        <button type="button" onClick={hideEmptyFields}>隐藏空字段</button>
      </div>
      <div className="field-list" ref={fieldListRef}>
        <div style={{ height: `${fieldVirtualizer.getTotalSize()}px`, position: "relative" }}>
          {renderedFields.map((virtualField) => {
            const field = fields[virtualField.index]
            const isVisible = filter.visibleFields.includes(field.name)
            const sample = getFieldSample(dataset, field.name)
            return (
              <div
                className="field-row-wrap"
                key={field.name}
                style={{ transform: `translateY(${virtualField.start}px)` }}
              >
                <button
                  className={field.name === selectedField ? "field-row active" : "field-row"}
                  type="button"
                  aria-label={`${field.name}${field.source === "derived" ? "派生" : "原始"}`}
                  onClick={() => setSelectedField(field.name)}
                >
                  <span>{field.name}</span>
                  <span className="field-metadata">
                    <small>{field.source === "derived" ? "派生" : "原始"}</small>
                    <small title={sample}>{sample}</small>
                  </span>
                </button>
                <button
                  className="field-visibility-button"
                  type="button"
                  aria-label={`${isVisible ? "隐藏" : "显示"}${field.name}`}
                  title={isVisible ? "隐藏字段" : "显示字段"}
                  onClick={() => toggleFieldVisibility(field.name)}
                >
                  {isVisible ? <Eye size={16} /> : <EyeOff size={16} />}
                </button>
              </div>
            )
          })}
        </div>
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
