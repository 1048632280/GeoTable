import { useVirtualizer } from "@tanstack/react-virtual"
import { ArrowDown, ArrowUp, ChevronsUpDown } from "lucide-react"
import { useLayoutEffect, useMemo, useRef, useState } from "react"
import { displayFieldName } from "../lib/display"
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
  const [scrollbarWidth, setScrollbarWidth] = useState(0)
  const rowVirtualizer = useVirtualizer({
    count: records.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 34,
    overscan: 12,
  })

  const columns = useMemo(() => fields.map((field) => field.name), [fields])
  const gridTemplateColumns = gridTemplate(columns.length)
  const tableMinWidth = `${columns.length * 140}px`

  useLayoutEffect(() => {
    function measureScrollbar() {
      const element = parentRef.current
      if (!element) return
      setScrollbarWidth(element.offsetWidth - element.clientWidth)
    }

    measureScrollbar()
    window.addEventListener("resize", measureScrollbar)
    return () => window.removeEventListener("resize", measureScrollbar)
  }, [columns.length, records.length])

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
      <div className="data-table-scroll">
        <div className="data-table-inner" style={{ minWidth: tableMinWidth }}>
          <div
            className="data-table-header"
            style={{ gridTemplateColumns, paddingRight: `${scrollbarWidth}px` }}
          >
            {columns.map((field) => (
              <button className="column-header" type="button" key={field} onClick={() => toggleSort(field)}>
                <span title={field}>{displayFieldName(field)}</span>
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
                    className={`data-table-row${virtualRow.index % 2 === 1 ? " data-table-row-striped" : ""}`}
                    key={record.id}
                    style={{
                      gridTemplateColumns,
                      transform: `translateY(${virtualRow.start}px)`,
                    }}
                  >
                    {columns.map((field) => {
                      const value = getRecordValue(record, field) ?? ""
                      return (
                        <span className="data-table-cell" key={field} title={value}>
                          {value}
                        </span>
                      )
                    })}
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function gridTemplate(columnCount: number) {
  return `repeat(${Math.max(columnCount, 1)}, minmax(140px, 1fr))`
}
