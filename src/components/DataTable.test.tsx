import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { DataTable } from "./DataTable"
import type { FeatureRecord, FieldDefinition } from "../types/geo"

vi.mock("@tanstack/react-virtual", () => ({
  useVirtualizer: ({ count }: { count: number }) => ({
    getTotalSize: () => count * 34,
    getVirtualItems: () => Array.from({ length: count }, (_, index) => ({ index, start: index * 34 })),
  }),
}))

const fields: FieldDefinition[] = [
  { name: "name", source: "original" },
  { name: "admin_country", source: "derived" },
]

const records: FeatureRecord[] = [
  {
    id: 1,
    geometry: null,
    properties: { name: "茶树" },
    derived: { admin_country: "中国" },
  },
]

describe("DataTable", () => {
  it("renders field values", () => {
    render(<DataTable fields={fields} records={records} sort={null} onSortChange={vi.fn()} />)

    expect(screen.getByText("茶树")).toBeInTheDocument()
    expect(screen.getByText("中国")).toBeInTheDocument()
  })

  it("cycles a column through ascending, descending, and unsorted", () => {
    const onSortChange = vi.fn()
    const { rerender } = render(
      <DataTable fields={fields} records={records} sort={null} onSortChange={onSortChange} />,
    )

    fireEvent.click(screen.getByRole("button", { name: "name" }))
    expect(onSortChange).toHaveBeenLastCalledWith({ field: "name", direction: "asc" })

    rerender(
      <DataTable
        fields={fields}
        records={records}
        sort={{ field: "name", direction: "asc" }}
        onSortChange={onSortChange}
      />,
    )
    fireEvent.click(screen.getByRole("button", { name: "name" }))
    expect(onSortChange).toHaveBeenLastCalledWith({ field: "name", direction: "desc" })

    rerender(
      <DataTable
        fields={fields}
        records={records}
        sort={{ field: "name", direction: "desc" }}
        onSortChange={onSortChange}
      />,
    )
    fireEvent.click(screen.getByRole("button", { name: "name" }))
    expect(onSortChange).toHaveBeenLastCalledWith(null)
  })
})
