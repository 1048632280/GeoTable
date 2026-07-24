import { useVirtualizer } from "@tanstack/react-virtual"
import { Eye, EyeOff } from "lucide-react"
import { useMemo, useRef, useState } from "react"
import { displayFieldName } from "../lib/display"
import { getRecordValue } from "../lib/filtering"
import type { Dataset, FieldDefinition, FilterState } from "../types/geo"

type FieldPanelProps = {
  dataset: Dataset | null
  filter: FilterState
  onFilterChange: (next: FilterState) => void
}

type FieldListItem =
  | { type: "field"; field: FieldDefinition }
  | { type: "other-original-toggle"; count: number }

const PRIMARY_FIELD_ORDER = ["name", "admin_country", "admin_level1"]

function sourceLabel(field: FieldDefinition): string {
  return field.source === "derived" ? "派生" : "原始"
}

function matchesFieldSearch(field: FieldDefinition, query: string): boolean {
  if (!query) return true
  return (
    field.name.toLocaleLowerCase().includes(query) ||
    displayFieldName(field.name).toLocaleLowerCase().includes(query)
  )
}

function orderedPrimaryFields(fields: FieldDefinition[]): FieldDefinition[] {
  return [...fields]
    .filter((field) => PRIMARY_FIELD_ORDER.includes(field.name))
    .sort((left, right) =>
      PRIMARY_FIELD_ORDER.indexOf(left.name) - PRIMARY_FIELD_ORDER.indexOf(right.name),
    )
}

export function FieldPanel({ dataset, filter, onFilterChange }: FieldPanelProps) {
  const [fieldSearch, setFieldSearch] = useState("")
  const [otherOriginalExpanded, setOtherOriginalExpanded] = useState(false)
  const fieldListRef = useRef<HTMLDivElement | null>(null)
  const query = fieldSearch.trim().toLocaleLowerCase()
  const allFields = dataset?.fields ?? []

  const matchingFields = useMemo(
    () => allFields.filter((field) => matchesFieldSearch(field, query)),
    [allFields, query],
  )
  const listItems = useMemo<FieldListItem[]>(() => {
    if (query) return matchingFields.map((field) => ({ type: "field", field }))

    const primaryFields = orderedPrimaryFields(allFields)
    const primaryFieldNames = new Set(primaryFields.map((field) => field.name))
    const otherDerivedFields = allFields.filter(
      (field) => field.source === "derived" && !primaryFieldNames.has(field.name),
    )
    const otherOriginalFields = allFields.filter(
      (field) => field.source === "original" && !primaryFieldNames.has(field.name),
    )
    const items: FieldListItem[] = [
      ...primaryFields.map((field) => ({ type: "field" as const, field })),
      ...otherDerivedFields.map((field) => ({ type: "field" as const, field })),
    ]
    if (otherOriginalFields.length > 0) {
      items.push({ type: "other-original-toggle", count: otherOriginalFields.length })
      if (otherOriginalExpanded) {
        items.push(...otherOriginalFields.map((field) => ({ type: "field" as const, field })))
      }
    }
    return items
  }, [allFields, matchingFields, otherOriginalExpanded, query])

  const fieldVirtualizer = useVirtualizer({
    count: listItems.length,
    getScrollElement: () => fieldListRef.current,
    estimateSize: () => 36,
    initialRect: { width: 0, height: 360 },
    overscan: 12,
  })
  const virtualRows = fieldVirtualizer.getVirtualItems()
  const renderedRows = virtualRows.length > 0
    ? virtualRows
    : listItems.slice(0, 12).map((_, index) => ({ index, start: index * 36 }))

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
    setVisibleFields(allFields
      .filter((item) => visibleFields.has(item.name))
      .map((item) => item.name))
  }

  function hideEmptyFields() {
    const nonEmptyFields = new Set<string>()
    for (const record of dataset?.records ?? []) {
      for (const field of allFields) {
        const value = getRecordValue(record, field.name)
        if (value !== undefined && value !== null && value !== "") {
          nonEmptyFields.add(field.name)
        }
      }
    }
    setVisibleFields(filter.visibleFields.filter((field) => nonEmptyFields.has(field)))
  }

  function renderField(field: FieldDefinition, start: number) {
    const label = displayFieldName(field.name)
    const isVisible = filter.visibleFields.includes(field.name)
    return (
      <div
        className="field-row-wrap"
        key={field.name}
        style={{ transform: `translateY(${start}px)` }}
      >
        <div
          className="field-row"
          aria-label={`${label}${sourceLabel(field)}`}
          title={field.name === label ? undefined : field.name}
        >
          <span>{label}</span>
          <span className="field-metadata">
            <small>{sourceLabel(field)}</small>
          </span>
        </div>
        <button
          className="field-visibility-button"
          type="button"
          aria-label={`${isVisible ? "隐藏" : "显示"}${label}`}
          title={isVisible ? "隐藏字段" : "显示字段"}
          onClick={() => toggleFieldVisibility(field.name)}
        >
          {isVisible ? <Eye size={16} /> : <EyeOff size={16} />}
        </button>
      </div>
    )
  }

  return (
    <aside className="side-panel">
      <div className="panel-header">
        <h2>字段</h2>
      </div>
      <input
        className="text-input"
        value={fieldSearch}
        onChange={(event) => setFieldSearch(event.target.value)}
        placeholder="搜索字段名"
      />
      <div className="field-actions" aria-label="字段显示操作">
        <button type="button" onClick={() => setVisibleFields(allFields.map((field) => field.name))}>全部显示</button>
        <button type="button" onClick={() => setVisibleFields([])}>全部隐藏</button>
        <button type="button" onClick={() => setVisibleFields(matchingFields.map((field) => field.name))}>只显示搜索结果</button>
        <button type="button" onClick={hideEmptyFields}>隐藏空字段</button>
      </div>
      <div className="field-list" ref={fieldListRef}>
        <div style={{ height: `${fieldVirtualizer.getTotalSize()}px`, position: "relative" }}>
          {renderedRows.map((virtualRow) => {
            const item = listItems[virtualRow.index]
            if (!item) return null
            if (item.type === "field") return renderField(item.field, virtualRow.start)

            return (
              <div
                className="field-row-wrap field-group-wrap"
                key="other-original-toggle"
                style={{ transform: `translateY(${virtualRow.start}px)` }}
              >
                <button
                  className="field-group-toggle"
                  type="button"
                  aria-expanded={otherOriginalExpanded}
                  onClick={() => setOtherOriginalExpanded((expanded) => !expanded)}
                >
                  其他原始字段（{item.count}）
                </button>
              </div>
            )
          })}
        </div>
      </div>
    </aside>
  )
}
