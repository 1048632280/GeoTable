import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
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
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("renders field values", () => {
    render(<DataTable fields={fields} records={records} sort={null} onSortChange={vi.fn()} />)

    expect(screen.getByText("茶树")).toBeInTheDocument()
    expect(screen.getByText("中国")).toBeInTheDocument()
  })

  it("keeps the header and body inside the shared horizontal scroll area", () => {
    const { container } = render(
      <DataTable fields={fields} records={records} sort={null} onSortChange={vi.fn()} />,
    )

    const scrollArea = container.querySelector<HTMLElement>(".data-table-scroll")
    const inner = scrollArea?.querySelector<HTMLElement>(".data-table-inner") ?? null
    const body = container.querySelector<HTMLElement>(".data-table-body")
    const header = inner?.querySelector<HTMLElement>(".data-table-header") ?? null
    const spacer = body?.querySelector<HTMLElement>(".data-table-spacer") ?? null

    expect(scrollArea).toContainElement(inner)
    expect(inner).toContainElement(header)
    expect(inner).toContainElement(body)
    expect(header).toBeInTheDocument()
    expect(inner).toHaveStyle({ minWidth: "280px" })
    expect(header).toHaveStyle({ gridTemplateColumns: "repeat(2, minmax(140px, 1fr))" })
    expect(spacer).toHaveStyle({ height: "34px" })
  })

  it("reserves header space for the vertical scrollbar", async () => {
    vi.spyOn(HTMLElement.prototype, "offsetWidth", "get").mockImplementation(function getOffsetWidth(
      this: HTMLElement,
    ) {
      return this.classList.contains("data-table-body") ? 320 : 0
    })
    vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockImplementation(function getClientWidth(
      this: HTMLElement,
    ) {
      return this.classList.contains("data-table-body") ? 303 : 0
    })

    const { container } = render(
      <DataTable fields={fields} records={records} sort={null} onSortChange={vi.fn()} />,
    )

    const header = container.querySelector<HTMLElement>(".data-table-header")

    await waitFor(() => expect(header).toHaveStyle({ paddingRight: "17px" }))
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
