import { invoke } from "@tauri-apps/api/core"
import { open, save } from "@tauri-apps/plugin-dialog"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"
import App from "./App"
import { StatsPanel } from "./components/StatsPanel"
import type { Dataset } from "./types/geo"

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
    expect(screen.getByText("表格将在下一任务接入。")).toBeInTheDocument()
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
      warnings: [{ code: "admin_lookup_failed", message: "行政区识别失败" }],
    })

    render(<App />)
    await userEvent.click(screen.getByRole("button", { name: "打开文件" }))

    expect(await screen.findByText("部分失败")).toBeInTheDocument()
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
