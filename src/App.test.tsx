import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import App from "./App"

describe("App", () => {
  it("renders the GeoTable shell", () => {
    render(<App />)
    expect(screen.getByRole("heading", { name: "GeoTable" })).toBeInTheDocument()
    expect(screen.getByText("打开 shp、kml 或 kmz 文件后查看属性表。")).toBeInTheDocument()
  })
})
