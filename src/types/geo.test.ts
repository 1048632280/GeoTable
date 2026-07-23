import { describe, expect, it } from "vitest"
import type { Dataset, FeatureRecord } from "./geo"

describe("geo contracts", () => {
  it("allows records with original and derived fields", () => {
    const record: FeatureRecord = {
      id: 1,
      geometry: { type: "Point", lon: 102.7, lat: 25.0 },
      properties: { name: "茶树", count: 3, active: true, note: null },
      derived: { admin_country: "中国", admin_level1: "云南" },
    }

    const dataset: Dataset = {
      fileName: "tea.kml",
      totalRecords: 1,
      fields: [
        { name: "name", source: "original" },
        { name: "admin_country", source: "derived" },
      ],
      records: [record],
      warnings: [],
    }

    expect(dataset.records[0].derived.admin_level1).toBe("云南")
  })
})
