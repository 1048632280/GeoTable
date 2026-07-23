import { invoke } from "@tauri-apps/api/core"
import { open, save } from "@tauri-apps/plugin-dialog"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"
import App from "./App"
import { applyFilters } from "./lib/filtering"
import type { Dataset } from "./types/geo"

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}))

vi.mock("@tauri-apps/plugin-dialog", () => ({
  open: vi.fn(),
  save: vi.fn(),
}))

vi.mock("./lib/filtering", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./lib/filtering")>()),
  applyFilters: vi.fn(),
}))

const openMock = vi.mocked(open)
const saveMock = vi.mocked(save)
const invokeMock = vi.mocked(invoke)
const applyFiltersMock = vi.mocked(applyFilters)

const teaDataset: Dataset = {
  fileName: "tea.kml",
  totalRecords: 1,
  fields: [{ name: "name", source: "original" }],
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
      derived: { admin_country: "中国", admin_level1: "云南" },
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
    applyFiltersMock.mockImplementation((records) => records)
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

  it("updates search text and field filters from the workbench panels", async () => {
    openMock.mockResolvedValueOnce("tea.kml")
    invokeMock.mockResolvedValueOnce(teaDataset)
    const user = userEvent.setup()

    render(<App />)
    await user.click(screen.getByRole("button", { name: "打开文件" }))
    await screen.findByText("已就绪")

    await user.type(screen.getByPlaceholderText("全局搜索，例如：茶"), "茶")
    expect(applyFiltersMock).toHaveBeenLastCalledWith(
      teaDataset.records,
      expect.objectContaining({ searchText: "茶" }),
    )

    await user.click(screen.getByRole("button", { name: "name原始" }))
    await user.click(screen.getByRole("checkbox", { name: "茶树1" }))
    expect(screen.getByRole("checkbox", { name: "茶树1" })).toBeChecked()

    await user.click(screen.getByRole("button", { name: "清除筛选" }))
    expect(screen.getByRole("checkbox", { name: "茶树1" })).not.toBeChecked()
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
    applyFiltersMock.mockImplementationOnce((records) => records.filter((record) => record.id === 1))

    render(<App />)
    await userEvent.click(screen.getByRole("button", { name: "打开文件" }))
    expect(await screen.findByText("总样本 2")).toBeInTheDocument()

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
