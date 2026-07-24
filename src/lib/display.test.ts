import { describe, expect, it } from "vitest"
import { displayFieldName, displayFieldValue } from "./display"

describe("display helpers", () => {
  it("uses Chinese labels for known fields", () => {
    expect(displayFieldName("name")).toBe("作物")
    expect(displayFieldName("admin_country")).toBe("国家")
    expect(displayFieldName("admin_level1")).toBe("一级行政区")
    expect(displayFieldName("soil_type")).toBe("soil_type")
  })

  it("shortens People's Republic of China for UI display", () => {
    expect(displayFieldValue("中华人民共和国")).toBe("中国")
    expect(displayFieldValue("澳大利亚")).toBe("澳大利亚")
    expect(displayFieldValue(null)).toBe("")
  })
})
