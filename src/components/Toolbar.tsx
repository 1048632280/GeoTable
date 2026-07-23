import { Download, FolderOpen } from "lucide-react"
import type { ImportStatus } from "../types/geo"

type ToolbarProps = {
  fileName: string | null
  totalRecords: number
  filteredRecords: number
  status: ImportStatus
  onOpen: () => void
  onExport: () => void
}

const statusText: Record<ImportStatus, string> = {
  idle: "未打开文件",
  loading: "读取中",
  admin_lookup_running: "识别行政区中",
  ready: "已就绪",
  partial_failure: "部分失败",
  failed: "失败",
}

export function Toolbar({
  fileName,
  totalRecords,
  filteredRecords,
  status,
  onOpen,
  onExport,
}: ToolbarProps) {
  return (
    <header className="toolbar">
      <button className="toolbar-button primary" type="button" onClick={onOpen} title="打开文件">
        <FolderOpen size={18} />
        <span>打开文件</span>
      </button>
      <div className="toolbar-meta">
        <strong>{fileName ?? "未选择文件"}</strong>
        <span>总样本 {totalRecords.toLocaleString("zh-CN")}</span>
        <span>当前结果 {filteredRecords.toLocaleString("zh-CN")}</span>
        <span>{statusText[status]}</span>
      </div>
      <button
        className="toolbar-button"
        type="button"
        onClick={onExport}
        disabled={filteredRecords === 0}
        title="导出当前结果"
      >
        <Download size={18} />
        <span>导出 CSV</span>
      </button>
    </header>
  )
}
