import { useVirtualizer } from "@tanstack/react-virtual"
import { ArrowDown, ArrowUp, ChevronsUpDown } from "lucide-react"
import { useMemo, useRef } from "react"
import { getRecordValue } from "../lib/filtering"
import type { FeatureRecord, FieldDefinition, FilterState } from "../types/geo"

type DataTableProps = {
  fields: FieldDefinition[]
  records: FeatureRecord[]
  sort: FilterState["sort"]
  onSortChange: (sort: FilterState["sort"]) => void
}

export function DataTable({ fields, records, sort, onSortChange }: DataTableProps) {
  const parentRef = useRef<HTMLDivElement | null>(null)
  const rowVirtualizer = useVirtualizer({
    count: records.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 34,
    overscan: 12,
  })

  const columns = useMemo(() => fields.map((field) => field.name), [fields])

  function toggleSort(field: string) {
    if (sort?.field !== field) {
      onSortChange({ field, direction: "asc" })
      return
    }
    if (sort.direction === "asc") {
      onSortChange({ field, direction: "desc" })
      return
    }
    onSortChange(null)
  }

  return (
    <div className="data-table-shell">
      <div className="data-table-header" style={{ gridTemplateColumns: gridTemplate(columns.length) }}>
        {columns.map((field) => (
          <button className="column-header" type="button" key={field} onClick={() => toggleSort(field)}>
            <span>{field}</span>
            {sort?.field === field ? (
              sort.direction === "asc" ? <ArrowUp size={14} /> : <ArrowDown size={14} />
            ) : (
              <ChevronsUpDown size={14} />
            )}
          </button>
        ))}
      </div>
      <div className="data-table-body" ref={parentRef}>
        <div
          className="data-table-spacer"
          style={{ height: `${rowVirtualizer.getTotalSize()}px` }}
        >
          {rowVirtualizer.getVirtualItems().map((virtualRow) => {
            const record = records[virtualRow.index]
            return (
              <div
                className="data-table-row"
                key={record.id}
                style={{
                  gridTemplateColumns: gridTemplate(columns.length),
                  transform: `translateY(${virtualRow.start}px)`,
                }}
              >
                {columns.map((field) => (
                  <span className="data-table-cell" key={field} title={getRecordValue(record, field) ?? ""}>
                    {getRecordValue(record, field) ?? ""}
                  </span>
                ))}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function gridTemplate(columnCount: number) {
  return `repeat(${Math.max(columnCount, 1)}, minmax(140px, 1fr))`
}
