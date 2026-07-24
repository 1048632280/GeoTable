import { invoke } from "@tauri-apps/api/core"
import { open, save } from "@tauri-apps/plugin-dialog"
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"
import App from "./App"
import { StatsPanel } from "./components/StatsPanel"
import type { Dataset } from "./types/geo"

const { onDragDropEventMock } = vi.hoisted(() => ({
  onDragDropEventMock: vi.fn(),
}))

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}))

vi.mock("@tauri-apps/plugin-dialog", () => ({
  open: vi.fn(),
  save: vi.fn(),
}))

vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: () => ({ onDragDropEvent: onDragDropEventMock }),
}))

const openMock = vi.mocked(open)
const saveMock = vi.mocked(save)
const invokeMock = vi.mocked(invoke)
const writeTextMock = vi.fn()

function setViewportWidth(width: number) {
  Object.defineProperty(window, "innerWidth", { configurable: true, value: width })
}

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

const cropFilterDataset: Dataset = {
  fileName: "crops.kml",
  totalRecords: 4,
  fields: [
    { name: "name", source: "original" },
    { name: "note", source: "original" },
    { name: "soil", source: "original" },
    { name: "admin_country", source: "derived" },
    { name: "admin_level1", source: "derived" },
  ],
  records: [
    {
      id: 1,
      geometry: null,
      properties: { name: "茶园", note: "高山", soil: "红壤" },
      derived: { admin_country: "中华人民共和国", admin_level1: "云南" },
    },
    {
      id: 2,
      geometry: null,
      properties: { name: "茶树", note: "沿海", soil: "砂壤" },
      derived: { admin_country: "澳大利亚", admin_level1: "昆士兰" },
    },
    {
      id: 3,
      geometry: null,
      properties: { name: "小麦", note: "平原", soil: "黑土" },
      derived: { admin_country: "澳大利亚", admin_level1: "维多利亚" },
    },
    {
      id: 4,
      geometry: null,
      properties: { name: "咖啡", note: "山地", soil: "火山土" },
      derived: { admin_country: "越南", admin_level1: "林同" },
    },
  ],
  warnings: [],
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
    localStorage.clear()
    setViewportWidth(1024)
    onDragDropEventMock.mockResolvedValue(vi.fn())
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

  it("persists splitter widths and restores them after remounting", () => {
    const { unmount } = render(<App />)

    const grid = document.querySelector<HTMLElement>(".workbench-grid")
    const splitter = screen.getByRole("separator", { name: "调整字段面板宽度" })
    fireEvent.pointerDown(splitter, { clientX: 280, pointerId: 1 })
    fireEvent.pointerMove(splitter, { clientX: 340, pointerId: 1 })
    fireEvent.pointerUp(splitter, { pointerId: 1 })

    expect(grid).toHaveStyle({ gridTemplateColumns: "340px 8px minmax(260px, 1fr) 8px 300px" })
    expect(localStorage.getItem("geotable.workbench-layout")).toBe('{"left":340,"right":300}')

    unmount()
    render(<App />)
    expect(document.querySelector(".workbench-grid")).toHaveStyle({
      gridTemplateColumns: "340px 8px minmax(260px, 1fr) 8px 300px",
    })
  })

  it("supports keyboard resizing and exposes splitter ranges", () => {
    render(<App />)

    const leftSplitter = screen.getByRole("separator", { name: "调整字段面板宽度" })
    const rightSplitter = screen.getByRole("separator", { name: "调整统计面板宽度" })
    expect(leftSplitter).toHaveAttribute("aria-valuemin", "220")
    expect(leftSplitter).toHaveAttribute("aria-valuemax", "508")
    expect(leftSplitter).toHaveAttribute("aria-valuenow", "280")
    expect(rightSplitter).toHaveAttribute("aria-valuemin", "240")
    expect(rightSplitter).toHaveAttribute("aria-valuemax", "528")
    expect(rightSplitter).toHaveAttribute("aria-valuenow", "300")

    fireEvent.keyDown(leftSplitter, { key: "ArrowRight" })
    expect(document.querySelector(".workbench-grid")).toHaveStyle({
      gridTemplateColumns: "304px 8px minmax(260px, 1fr) 8px 300px",
    })
    expect(leftSplitter).toHaveAttribute("aria-valuenow", "304")

    fireEvent.keyDown(rightSplitter, { key: "ArrowLeft" })
    expect(document.querySelector(".workbench-grid")).toHaveStyle({
      gridTemplateColumns: "304px 8px minmax(260px, 1fr) 8px 324px",
    })
    expect(rightSplitter).toHaveAttribute("aria-valuenow", "324")
  })

  it("uses a fitting fallback layout for narrow viewports and invalid saved values", () => {
    setViewportWidth(800)
    localStorage.setItem("geotable.workbench-layout", '{"left":"invalid","right":9999}')

    render(<App />)

    expect(document.querySelector(".workbench-grid")).toHaveStyle({
      gridTemplateColumns: "280px 8px minmax(260px, 1fr) 8px 244px",
    })
    expect(localStorage.getItem("geotable.workbench-layout")).toBe('{"left":280,"right":244}')
  })

  it("re-clamps the layout when the viewport shrinks and remains usable after restoration", () => {
    localStorage.setItem("geotable.workbench-layout", '{"left":340,"right":300}')
    render(<App />)

    setViewportWidth(800)
    fireEvent(window, new Event("resize"))
    expect(document.querySelector(".workbench-grid")).toHaveStyle({
      gridTemplateColumns: "284px 8px minmax(260px, 1fr) 8px 240px",
    })

    setViewportWidth(1024)
    fireEvent(window, new Event("resize"))
    expect(document.querySelector(".workbench-grid")).toHaveStyle({
      gridTemplateColumns: "284px 8px minmax(260px, 1fr) 8px 240px",
    })
  })

  it("ends splitter dragging when pointer capture is lost or the window loses focus", () => {
    render(<App />)
    const splitter = screen.getByRole("separator", { name: "调整字段面板宽度" })

    fireEvent.pointerDown(splitter, { clientX: 280, pointerId: 1 })
    fireEvent.lostPointerCapture(splitter, { pointerId: 1 })
    fireEvent.pointerMove(splitter, { clientX: 340, pointerId: 1 })
    expect(document.querySelector(".workbench-grid")).toHaveStyle({
      gridTemplateColumns: "280px 8px minmax(260px, 1fr) 8px 300px",
    })

    fireEvent.pointerDown(splitter, { clientX: 280, pointerId: 2 })
    fireEvent(window, new Event("blur"))
    fireEvent.pointerMove(splitter, { clientX: 340, pointerId: 2 })
    expect(document.querySelector(".workbench-grid")).toHaveStyle({
      gridTemplateColumns: "280px 8px minmax(260px, 1fr) 8px 300px",
    })
  })

  it("imports supported files dropped onto the Tauri window", async () => {
    invokeMock.mockResolvedValueOnce(teaDataset)
    render(<App />)

    await waitFor(() => expect(onDragDropEventMock).toHaveBeenCalled())
    const handler = onDragDropEventMock.mock.calls[0][0] as (event: {
      payload: { type: "drop"; paths: string[] }
    }) => void
    await act(async () => {
      handler({ payload: { type: "drop", paths: ["C:\\data\\tea.KMZ"] } })
    })

    expect(await screen.findByText("已就绪")).toBeInTheDocument()
    expect(invokeMock).toHaveBeenCalledWith("open_dataset", { path: "C:\\data\\tea.KMZ" })
    expect(screen.getByText("tea.kml")).toBeInTheDocument()
  })

  it("shows a clear error for unsupported dropped files", async () => {
    render(<App />)

    await waitFor(() => expect(onDragDropEventMock).toHaveBeenCalled())
    const handler = onDragDropEventMock.mock.calls[0][0] as (event: {
      payload: { type: "drop"; paths: string[] }
    }) => void
    await act(async () => {
      handler({ payload: { type: "drop", paths: ["C:\\data\\tea.csv"] } })
    })

    expect(await screen.findByText("不支持的文件类型。请拖入 .shp、.kml 或 .kmz 文件。")).toBeInTheDocument()
    expect(invokeMock).not.toHaveBeenCalled()
  })

  it("updates global search text", async () => {
    openMock.mockResolvedValueOnce("tea.kml")
    invokeMock.mockResolvedValueOnce(teaAndCoffeeDataset)
    const user = userEvent.setup()

    render(<App />)
    await user.click(screen.getByRole("button", { name: "打开文件" }))
    await screen.findByText("已就绪")

    await user.type(screen.getByPlaceholderText("全局搜索，例如：茶"), "茶")
    expect(screen.getByText("当前结果 1")).toBeInTheDocument()
  })

  it("wires field visibility into the table and statistics selector", async () => {
    openMock.mockResolvedValueOnce("tea.kml")
    invokeMock.mockResolvedValueOnce(teaDataset)
    const user = userEvent.setup()

    render(<App />)
    await user.click(screen.getByRole("button", { name: "打开文件" }))
    await screen.findByText("已就绪")

    expect(screen.getByRole("button", { name: "国家" })).toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: "隐藏国家" }))

    expect(screen.queryByRole("button", { name: "国家" })).not.toBeInTheDocument()
    expect(screen.getByRole("combobox")).toHaveValue("name")
    expect(screen.queryByRole("option", { name: "国家" })).not.toBeInTheDocument()
  })

  it("shows the left panel as field management without samples or value filters", async () => {
    openMock.mockResolvedValueOnce("crops.kml")
    invokeMock.mockResolvedValueOnce(cropFilterDataset)
    const user = userEvent.setup()

    render(<App />)
    await user.click(screen.getByRole("button", { name: "打开文件" }))
    await screen.findByText("已就绪")

    expect(screen.getByRole("button", { name: "隐藏作物" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "隐藏国家" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "隐藏一级行政区" })).toBeInTheDocument()
    expect(screen.queryByPlaceholderText("搜索字段值")).not.toBeInTheDocument()
    expect(screen.queryByText(/样例：/)).not.toBeInTheDocument()
  })

  it("collapses non-name original fields and expands matches during field search", async () => {
    openMock.mockResolvedValueOnce("crops.kml")
    invokeMock.mockResolvedValueOnce(cropFilterDataset)
    const user = userEvent.setup()

    render(<App />)
    await user.click(screen.getByRole("button", { name: "打开文件" }))
    await screen.findByText("已就绪")

    expect(screen.getByRole("button", { name: "其他原始字段（2）" })).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "隐藏soil" })).not.toBeInTheDocument()

    await user.type(screen.getByPlaceholderText("搜索字段名"), "soil")

    expect(screen.getByRole("button", { name: "隐藏soil" })).toBeInTheDocument()
  })

  it("uses right-panel tags for same-field OR and cross-field AND filters", async () => {
    openMock.mockResolvedValueOnce("crops.kml")
    invokeMock.mockResolvedValueOnce(cropFilterDataset)
    const user = userEvent.setup()

    render(<App />)
    await user.click(screen.getByRole("button", { name: "打开文件" }))
    await screen.findByText("已就绪")

    await user.selectOptions(screen.getByRole("combobox"), "admin_country")
    expect(document.querySelector(".stats-list input[type='checkbox']")).toBeNull()

    const chinaRow = screen.getByRole("button", { name: /中国.*1/ })
    await user.click(chinaRow)
    expect(screen.getByText("当前结果 1")).toBeInTheDocument()
    expect(chinaRow).toHaveClass("selected")
    expect(screen.getByRole("button", { name: /澳大利亚.*2/ })).toBeInTheDocument()

    await user.click(screen.getByRole("button", { name: /澳大利亚.*2/ }))
    expect(screen.getByText("当前结果 3")).toBeInTheDocument()
    expect(screen.getByText("国家: 中国、澳大利亚")).toBeInTheDocument()

    await user.selectOptions(screen.getByRole("combobox"), "name")
    await user.click(screen.getByRole("button", { name: /茶园.*1/ }))

    expect(screen.getByText("当前结果 1")).toBeInTheDocument()
    expect(screen.getByText("作物: 茶园")).toBeInTheDocument()

    await user.click(screen.getByRole("button", { name: /茶园.*1/ }))

    expect(screen.getByText("当前结果 3")).toBeInTheDocument()
    expect(screen.queryByText("作物: 茶园")).not.toBeInTheDocument()
  })

  it("clears right-panel tag filters without clearing global search", async () => {
    openMock.mockResolvedValueOnce("crops.kml")
    invokeMock.mockResolvedValueOnce(cropFilterDataset)
    const user = userEvent.setup()

    render(<App />)
    await user.click(screen.getByRole("button", { name: "打开文件" }))
    await screen.findByText("已就绪")

    await user.type(screen.getByPlaceholderText("全局搜索，例如：茶"), "茶")
    expect(screen.getByText("当前结果 2")).toBeInTheDocument()

    await user.selectOptions(screen.getByRole("combobox"), "admin_country")
    await user.click(screen.getByRole("button", { name: /中国.*1/ }))
    expect(screen.getByText("当前结果 1")).toBeInTheDocument()

    await user.click(screen.getByRole("button", { name: "清空" }))

    expect(screen.getByText("当前结果 2")).toBeInTheDocument()
    expect(screen.queryByText("国家: 中国")).not.toBeInTheDocument()
  })

  it("exposes hidden-field and exact search options", async () => {
    openMock.mockResolvedValueOnce("tea.kml")
    invokeMock.mockResolvedValueOnce(teaDataset)
    const user = userEvent.setup()

    render(<App />)
    await user.click(screen.getByRole("button", { name: "打开文件" }))
    await screen.findByText("已就绪")

    const hiddenFields = screen.getByRole("checkbox", { name: "搜索隐藏字段" })
    const exactSearch = screen.getByRole("checkbox", { name: "精确搜索" })
    await user.click(hiddenFields)
    await user.click(exactSearch)

    expect(hiddenFields).toBeChecked()
    expect(exactSearch).toBeChecked()
  })

  it("supports field visibility batch controls", async () => {
    openMock.mockResolvedValueOnce("tea.kml")
    invokeMock.mockResolvedValueOnce(teaDataset)
    const user = userEvent.setup()

    render(<App />)
    await user.click(screen.getByRole("button", { name: "打开文件" }))
    await screen.findByText("已就绪")

    await user.click(screen.getByRole("button", { name: "全部隐藏" }))
    expect(screen.queryByRole("button", { name: "作物" })).not.toBeInTheDocument()
    expect(screen.getByRole("combobox")).toHaveValue("")

    await user.click(screen.getByRole("button", { name: "全部显示" }))
    expect(screen.getByRole("button", { name: "作物" })).toBeInTheDocument()
    expect(screen.getByRole("combobox")).toHaveValue("admin_country")
  })

  it("limits visibility batch actions to matching and non-empty fields", async () => {
    const dataset: Dataset = {
      ...teaDataset,
      fields: [
        { name: "name", source: "original" },
        { name: "empty", source: "original" },
        { name: "admin_country", source: "derived" },
      ],
      records: [{
        ...teaDataset.records[0],
        properties: { name: "茶树", empty: null },
      }],
    }
    openMock.mockResolvedValueOnce("tea.kml")
    invokeMock.mockResolvedValueOnce(dataset)
    const user = userEvent.setup()

    render(<App />)
    await user.click(screen.getByRole("button", { name: "打开文件" }))
    await screen.findByText("已就绪")

    await user.type(screen.getByPlaceholderText("搜索字段名"), "name")
    await user.click(screen.getByRole("button", { name: "只显示搜索结果" }))
    expect(screen.getByRole("button", { name: "作物" })).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "国家" })).not.toBeInTheDocument()

    await user.clear(screen.getByPlaceholderText("搜索字段名"))
    await user.click(screen.getByRole("button", { name: "全部显示" }))
    await user.click(screen.getByRole("button", { name: "隐藏空字段" }))
    expect(screen.getByRole("button", { name: "作物" })).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "empty" })).not.toBeInTheDocument()
  })

  it("allows filtering consecutive statistic rows for the selected field", async () => {
    openMock.mockResolvedValueOnce("tea.kml")
    invokeMock.mockResolvedValueOnce(teaAndCoffeeDataset)
    const user = userEvent.setup()

    render(<App />)
    await user.click(screen.getByRole("button", { name: "打开文件" }))
    await screen.findByText("已就绪")

    await user.selectOptions(screen.getByRole("combobox"), "name")
    await user.click(screen.getByRole("button", { name: /茶树.*1/ }))
    expect(screen.getByRole("button", { name: /咖啡.*1/ })).toBeInTheDocument()

    await user.click(screen.getByRole("button", { name: /咖啡.*1/ }))
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
        fieldFilters={{}}
        onSelectedFieldChange={vi.fn()}
        onFieldFiltersChange={vi.fn()}
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
        fieldFilters={{}}
        onSelectedFieldChange={vi.fn()}
        onFieldFiltersChange={vi.fn()}
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
        fieldFilters={{}}
        onSelectedFieldChange={vi.fn()}
        onFieldFiltersChange={vi.fn()}
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
    const onFieldFiltersChange = vi.fn()

    render(
      <StatsPanel
        fields={[{ name: "name", source: "original" }]}
        records={records}
        selectedField="name"
        fieldFilters={{}}
        onSelectedFieldChange={vi.fn()}
        onFieldFiltersChange={onFieldFiltersChange}
      />,
    )

    await userEvent.type(screen.getByPlaceholderText("搜索统计值"), "值249")
    await userEvent.click(screen.getByRole("button", { name: /值249.*1/ }))

    expect(onFieldFiltersChange).toHaveBeenCalledWith({ name: ["值249"] })
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
      fieldFilters: {},
      onSelectedFieldChange: vi.fn(),
      onFieldFiltersChange: vi.fn(),
    }
    const { rerender } = render(
      <StatsPanel
        {...props}
        selectedField="name"
      />,
    )

    await userEvent.type(screen.getByPlaceholderText("搜索统计值"), "茶")
    expect(screen.queryByText("水稻")).not.toBeInTheDocument()

    rerender(
      <StatsPanel
        {...props}
        selectedField="crop"
      />,
    )

    expect(screen.getByPlaceholderText("搜索统计值")).toHaveValue("")
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
    expect(screen.getAllByText("茶树").length).toBeGreaterThan(0)

    await userEvent.click(openButton)
    await screen.findByText("rice.kml")

    expect(screen.getByRole("combobox")).toHaveValue("admin_country")
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
