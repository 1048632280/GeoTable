import { invoke } from "@tauri-apps/api/core"
import { open, save } from "@tauri-apps/plugin-dialog"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"
import App from "./App"
import { FieldPanel } from "./components/FieldPanel"
import { StatsPanel } from "./components/StatsPanel"
import type { Dataset, FilterState } from "./types/geo"

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}))

vi.mock("@tauri-apps/plugin-dialog", () => ({
  open: vi.fn(),
  save: vi.fn(),
}))

const openMock = vi.mocked(open)
const saveMock = vi.mocked(save)
const invokeMock = vi.mocked(invoke)
const writeTextMock = vi.fn()

const teaDataset: Dataset = {
  fileName: "tea.kml",
  totalRecords: 1,
  fields: [
    { name: "name", source: "original" },
    { name: "admin_country", source: "derived" },
  ],
  records: [
    {
      id: 1,
      geometry: { type: "Point", lon: 102.7, lat: 25.0 },
      properties: { name: "茶树" },
      derived: { admin_country: "中国", admin_level1: "云南" },
    },
  ],
  warnings: [],
}

const teaAndCoffeeDataset: Dataset = {
  ...teaDataset,
  totalRecords: 2,
  records: [
    teaDataset.records[0],
    {
      id: 2,
      geometry: { type: "Point", lon: 103.8, lat: 24.5 },
      properties: { name: "咖啡" },
      derived: { admin_country: "越南", admin_level1: "林同" },
    },
  ],
}

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((next) => {
    resolve = next
  })
  return { promise, resolve }
}

describe("App", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    writeTextMock.mockResolvedValue(undefined)
  })

  it("renders the initial workbench toolbar state", () => {
    render(<App />)
    expect(screen.getByRole("heading", { name: "字段" })).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "统计" })).toBeInTheDocument()
    expect(screen.getByPlaceholderText("全局搜索，例如：茶")).toBeInTheDocument()
    expect(document.querySelector(".data-table-shell")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "打开文件" })).toBeEnabled()
    expect(screen.getByText("未选择文件")).toBeInTheDocument()
    expect(screen.getByText("总样本 0")).toBeInTheDocument()
    expect(screen.getByText("当前结果 0")).toBeInTheDocument()
    expect(screen.getByText("未打开文件")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "导出 CSV" })).toBeDisabled()
  })

  it("updates search text and supports multi-value filters for the same field", async () => {
    openMock.mockResolvedValueOnce("tea.kml")
    invokeMock.mockResolvedValueOnce(teaAndCoffeeDataset)
    const user = userEvent.setup()

    render(<App />)
    await user.click(screen.getByRole("button", { name: "打开文件" }))
    await screen.findByText("已就绪")

    await user.type(screen.getByPlaceholderText("全局搜索，例如：茶"), "茶")
    expect(screen.getByText("当前结果 1")).toBeInTheDocument()

    await user.clear(screen.getByPlaceholderText("全局搜索，例如：茶"))

    await user.click(screen.getByRole("button", { name: "name原始" }))
    await user.click(screen.getByRole("checkbox", { name: "茶树1" }))
    expect(screen.getByRole("checkbox", { name: "茶树1" })).toBeChecked()
    expect(screen.getByRole("checkbox", { name: "咖啡1" })).toBeInTheDocument()

    await user.click(screen.getByRole("checkbox", { name: "咖啡1" }))
    expect(screen.getByRole("checkbox", { name: "茶树1" })).toBeChecked()
    expect(screen.getByRole("checkbox", { name: "咖啡1" })).toBeChecked()

    await user.click(screen.getByRole("button", { name: "清除筛选" }))
    expect(screen.getByRole("checkbox", { name: "茶树1" })).not.toBeChecked()
  })

  it("keeps selected values visible when another field narrows candidates", async () => {
    openMock.mockResolvedValueOnce("tea.kml")
    invokeMock.mockResolvedValueOnce(teaAndCoffeeDataset)
    const user = userEvent.setup()

    render(<App />)
    await user.click(screen.getByRole("button", { name: "打开文件" }))
    await screen.findByText("已就绪")

    await user.click(screen.getByRole("button", { name: "admin_country派生" }))
    await user.click(screen.getByRole("checkbox", { name: "中国1" }))
    await user.click(screen.getByRole("checkbox", { name: "越南1" }))

    await user.click(screen.getByRole("button", { name: "name原始" }))
    await user.click(screen.getByRole("checkbox", { name: "茶树1" }))
    await user.click(screen.getByRole("button", { name: "admin_country派生" }))
    await user.click(screen.getByRole("checkbox", { name: "中国1" }))

    await user.click(screen.getByRole("button", { name: "name原始" }))
    const selectedValue = screen.getByRole("checkbox", { name: "茶树0" })
    expect(selectedValue).toBeChecked()

    await user.click(selectedValue)
    expect(screen.getByText("当前结果 1")).toBeInTheDocument()
  })

  it("allows filtering consecutive statistic rows for the selected field", async () => {
    openMock.mockResolvedValueOnce("tea.kml")
    invokeMock.mockResolvedValueOnce(teaAndCoffeeDataset)
    const user = userEvent.setup()

    render(<App />)
    await user.click(screen.getByRole("button", { name: "打开文件" }))
    await screen.findByText("已就绪")

    await user.selectOptions(screen.getByRole("combobox"), "name")
    await user.click(screen.getByRole("button", { name: "茶树150.0%" }))
    expect(screen.getByRole("button", { name: "咖啡150.0%" })).toBeInTheDocument()

    await user.click(screen.getByRole("button", { name: "咖啡150.0%" }))
    expect(screen.getByText("当前结果 2")).toBeInTheDocument()
  })

  it("copies selected statistics to the clipboard", async () => {
    Object.defineProperty(globalThis, "navigator", {
      configurable: true,
      value: { clipboard: { writeText: writeTextMock } },
    })
    render(
      <StatsPanel
        fields={teaAndCoffeeDataset.fields}
        records={teaAndCoffeeDataset.records}
        selectedField="name"
        onSelectedFieldChange={vi.fn()}
        onAddFieldFilter={vi.fn()}
      />,
    )
    fireEvent.click(screen.getByRole("button", { name: "复制" }))

    await waitFor(() =>
      expect(writeTextMock).toHaveBeenCalledWith("茶树\t1\t50.00%\n咖啡\t1\t50.00%"),
    )
  })

  it("handles clipboard copy failures without rejecting the click handler", async () => {
    writeTextMock.mockRejectedValueOnce(new Error("clipboard denied"))
    Object.defineProperty(globalThis, "navigator", {
      configurable: true,
      value: { clipboard: { writeText: writeTextMock } },
    })
    render(
      <StatsPanel
        fields={teaDataset.fields}
        records={teaDataset.records}
        selectedField="name"
        onSelectedFieldChange={vi.fn()}
        onAddFieldFilter={vi.fn()}
      />,
    )
    fireEvent.click(screen.getByRole("button", { name: "复制" }))

    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("复制失败"))
  })

  it("disables opening while an import is running", async () => {
    const importResult = deferred<Dataset>()
    openMock.mockResolvedValueOnce("tea.kml")
    invokeMock.mockReturnValueOnce(importResult.promise)

    render(<App />)

    const openButton = screen.getByRole("button", { name: "打开文件" })
    await userEvent.click(openButton)

    await waitFor(() => expect(openButton).toBeDisabled())
    expect(screen.getByText("读取中")).toBeInTheDocument()
    expect(invokeMock).toHaveBeenCalledWith("open_dataset", { path: "tea.kml" })

    await userEvent.click(openButton)
    expect(openMock).toHaveBeenCalledTimes(1)
    expect(invokeMock).toHaveBeenCalledTimes(1)

    importResult.resolve(teaDataset)

    expect(await screen.findByText("已就绪")).toBeInTheDocument()
    expect(openButton).toBeEnabled()
  })

  it("shows the loaded filename, counts, and ready status after opening", async () => {
    openMock.mockResolvedValueOnce("tea.kml")
    invokeMock.mockResolvedValueOnce(teaDataset)

    render(<App />)
    await userEvent.click(screen.getByRole("button", { name: "打开文件" }))

    expect(await screen.findByText("已就绪")).toBeInTheDocument()
    expect(invokeMock).toHaveBeenCalledWith("open_dataset", { path: "tea.kml" })
    expect(screen.getByText("tea.kml")).toBeInTheDocument()
    expect(screen.getByText("总样本 1")).toBeInTheDocument()
    expect(screen.getByText("当前结果 1")).toBeInTheDocument()
  })

  it("shows partial failure when opening returns warnings", async () => {
    openMock.mockResolvedValueOnce("tea.kml")
    invokeMock.mockResolvedValueOnce({
      ...teaDataset,
      warnings: [{ code: "admin_lookup_failed", message: "行政区识别失败", recordId: 7 }],
    })

    render(<App />)
    await userEvent.click(screen.getByRole("button", { name: "打开文件" }))

    expect(await screen.findByText("部分失败")).toBeInTheDocument()
    expect(screen.getByRole("region", { name: "导入警告" })).toHaveTextContent(
      "行政区识别失败（记录 7）",
    )
  })

  it("caps rendered statistic rows for high-cardinality fields", () => {
    const records = Array.from({ length: 250 }, (_, index) => ({
      id: index + 1,
      geometry: null,
      properties: { name: `值${index}` },
      derived: {},
    }))

    render(
      <StatsPanel
        fields={[{ name: "name", source: "original" }]}
        records={records}
        selectedField="name"
        onSelectedFieldChange={vi.fn()}
        onAddFieldFilter={vi.fn()}
      />,
    )

    expect(document.querySelectorAll(".stats-row")).toHaveLength(200)
    expect(screen.getByRole("status")).toHaveTextContent("显示前 200 项，共 250 项")
  })

  it("searches statistic values beyond the rendered cap before filtering", async () => {
    const records = Array.from({ length: 250 }, (_, index) => ({
      id: index + 1,
      geometry: null,
      properties: { name: `值${index}` },
      derived: {},
    }))
    const onAddFieldFilter = vi.fn()

    render(
      <StatsPanel
        fields={[{ name: "name", source: "original" }]}
        records={records}
        selectedField="name"
        onSelectedFieldChange={vi.fn()}
        onAddFieldFilter={onAddFieldFilter}
      />,
    )

    await userEvent.type(screen.getByPlaceholderText("搜索统计值"), "值249")
    await userEvent.click(screen.getByRole("button", { name: /值249/ }))

    expect(onAddFieldFilter).toHaveBeenCalledWith("name", "值249")
  })

  it("clears statistics value search when switching fields", async () => {
    const props = {
      fields: [
        { name: "name", source: "original" } as const,
        { name: "crop", source: "original" } as const,
      ],
      records: [
        { id: 1, geometry: null, properties: { name: "茶树", crop: "茶" }, derived: {} },
        { id: 2, geometry: null, properties: { name: "水稻", crop: "粮食" }, derived: {} },
      ],
      onSelectedFieldChange: vi.fn(),
      onAddFieldFilter: vi.fn(),
    }
    const { rerender } = render(
      <StatsPanel
        {...props}
        selectedField="name"
      />,
    )

    await userEvent.type(screen.getByPlaceholderText("搜索统计值"), "茶")
    expect(screen.queryByRole("button", { name: /水稻/ })).not.toBeInTheDocument()

    rerender(
      <StatsPanel
        {...props}
        selectedField="crop"
      />,
    )

    expect(screen.getByPlaceholderText("搜索统计值")).toHaveValue("")
  })

  it("searches field values beyond the facet cap before filtering", async () => {
    const records = Array.from({ length: 250 }, (_, index) => ({
      id: index + 1,
      geometry: null,
      properties: { name: `值${index}` },
      derived: {},
    }))
    const filter: FilterState = {
      searchText: "",
      searchMode: "all",
      searchFields: [],
      fieldFilters: {},
      sort: null,
    }
    const onFilterChange = vi.fn()

    render(
      <FieldPanel
        dataset={{
          fileName: "values.kml",
          totalRecords: records.length,
          fields: [{ name: "name", source: "original" }],
          records,
          warnings: [],
        }}
        candidateRecords={records}
        filter={filter}
        onFilterChange={onFilterChange}
      />,
    )

    await userEvent.click(screen.getByRole("button", { name: "name原始" }))
    await userEvent.type(screen.getByPlaceholderText("搜索字段值"), "值249")
    await userEvent.click(screen.getByRole("checkbox", { name: "值2491" }))

    expect(onFilterChange).toHaveBeenCalledWith({
      ...filter,
      fieldFilters: { name: ["值249"] },
    })
  })

  it("keeps selected facet values visible while a different value search is active", async () => {
    const records = [
      { id: 1, geometry: null, properties: { name: "茶树" }, derived: {} },
      { id: 2, geometry: null, properties: { name: "水稻" }, derived: {} },
    ]
    const filter: FilterState = {
      searchText: "",
      searchMode: "all",
      searchFields: [],
      fieldFilters: { name: ["茶树"] },
      sort: null,
    }

    render(
      <FieldPanel
        dataset={{
          fileName: "values.kml",
          totalRecords: records.length,
          fields: [{ name: "name", source: "original" }],
          records,
          warnings: [],
        }}
        candidateRecords={records}
        filter={filter}
        onFilterChange={vi.fn()}
      />,
    )

    await userEvent.click(screen.getByRole("button", { name: "name原始" }))
    await userEvent.type(screen.getByPlaceholderText("搜索字段值"), "水")

    expect(screen.getByRole("checkbox", { name: "茶树1" })).toBeChecked()
    expect(screen.getByRole("checkbox", { name: "水稻1" })).toBeInTheDocument()
  })

  it("resets dataset-specific field selections after opening another dataset", async () => {
    const nextDataset: Dataset = {
      fileName: "rice.kml",
      totalRecords: 1,
      fields: [
        { name: "crop", source: "original" },
        { name: "admin_country", source: "derived" },
      ],
      records: [{ id: 1, geometry: null, properties: { crop: "水稻" }, derived: {} }],
      warnings: [],
    }
    openMock.mockResolvedValueOnce("tea.kml").mockResolvedValueOnce("rice.kml")
    invokeMock.mockResolvedValueOnce(teaDataset).mockResolvedValueOnce(nextDataset)

    render(<App />)
    const openButton = screen.getByRole("button", { name: "打开文件" })
    await userEvent.click(openButton)
    await screen.findByText("tea.kml")
    await userEvent.selectOptions(screen.getByRole("combobox"), "name")
    await userEvent.click(screen.getByRole("button", { name: "name原始" }))
    expect(screen.getAllByText("茶树").length).toBeGreaterThan(0)

    await userEvent.click(openButton)
    await screen.findByText("rice.kml")

    expect(screen.getByRole("combobox")).toHaveValue("admin_country")
    expect(document.querySelector(".field-row.active")).toBeNull()
  })

  it("keeps the existing dataset when open_dataset rejects", async () => {
    openMock.mockResolvedValueOnce("tea.kml").mockResolvedValueOnce("broken.kml")
    invokeMock.mockResolvedValueOnce(teaDataset).mockRejectedValueOnce(new Error("open failed"))

    render(<App />)
    const openButton = screen.getByRole("button", { name: "打开文件" })
    await userEvent.click(openButton)
    expect(await screen.findByText("已就绪")).toBeInTheDocument()

    await userEvent.click(openButton)

    expect(await screen.findByText("Error: open failed")).toBeInTheDocument()
    expect(screen.getByText("失败")).toBeInTheDocument()
    expect(screen.getByText("tea.kml")).toBeInTheDocument()
    expect(screen.getByText("总样本 1")).toBeInTheDocument()
    expect(screen.getByText("当前结果 1")).toBeInTheDocument()
  })

  it("exports the current filtered record IDs", async () => {
    openMock.mockResolvedValueOnce("tea.kml")
    invokeMock.mockResolvedValueOnce(teaAndCoffeeDataset).mockResolvedValueOnce(undefined)
    saveMock.mockResolvedValueOnce("tea-filtered.csv")

    render(<App />)
    await userEvent.click(screen.getByRole("button", { name: "打开文件" }))
    expect(await screen.findByText("总样本 2")).toBeInTheDocument()

    await userEvent.type(screen.getByPlaceholderText("全局搜索，例如：茶"), "茶")
    expect(screen.getByText("当前结果 1")).toBeInTheDocument()

    await userEvent.click(screen.getByRole("button", { name: "导出 CSV" }))

    expect(saveMock).toHaveBeenCalledWith({
      filters: [{ name: "CSV", extensions: ["csv"] }],
      defaultPath: "tea.kml.csv",
    })
    expect(invokeMock).toHaveBeenNthCalledWith(2, "export_csv", {
      path: "tea-filtered.csv",
      dataset: teaAndCoffeeDataset,
      recordIds: [1],
    })
  })

  it("shows an error when the open dialog rejects", async () => {
    openMock.mockRejectedValueOnce(new Error("dialog failed"))

    render(<App />)
    await userEvent.click(screen.getByRole("button", { name: "打开文件" }))

    expect(await screen.findByText("Error: dialog failed")).toBeInTheDocument()
    expect(screen.getByText("失败")).toBeInTheDocument()
  })

  it("shows an error when the save dialog rejects", async () => {
    openMock.mockResolvedValueOnce("tea.kml")
    invokeMock.mockResolvedValueOnce(teaDataset)
    saveMock.mockRejectedValueOnce(new Error("save failed"))

    render(<App />)
    await userEvent.click(screen.getByRole("button", { name: "打开文件" }))
    expect(await screen.findByText("已就绪")).toBeInTheDocument()

    await userEvent.click(screen.getByRole("button", { name: "导出 CSV" }))

    expect(await screen.findByText("Error: save failed")).toBeInTheDocument()
    expect(invokeMock).toHaveBeenCalledTimes(1)
  })

  it("keeps the existing dataset when export_csv rejects", async () => {
    openMock.mockResolvedValueOnce("tea.kml")
    invokeMock.mockResolvedValueOnce(teaDataset).mockRejectedValueOnce(new Error("export failed"))
    saveMock.mockResolvedValueOnce("tea.csv")

    render(<App />)
    await userEvent.click(screen.getByRole("button", { name: "打开文件" }))
    expect(await screen.findByText("已就绪")).toBeInTheDocument()

    await userEvent.click(screen.getByRole("button", { name: "导出 CSV" }))

    expect(await screen.findByText("Error: export failed")).toBeInTheDocument()
    expect(screen.getByText("已就绪")).toBeInTheDocument()
    expect(screen.getByText("tea.kml")).toBeInTheDocument()
    expect(screen.getByText("总样本 1")).toBeInTheDocument()
    expect(screen.getByText("当前结果 1")).toBeInTheDocument()
    expect(invokeMock).toHaveBeenNthCalledWith(2, "export_csv", {
      path: "tea.csv",
      dataset: teaDataset,
      recordIds: [1],
    })
  })
})
