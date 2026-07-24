import { describe, expect, it } from "vitest"
import type { FeatureRecord, FieldDefinition, FilterState } from "../types/geo"
import {
  applyFieldFilters,
  applyFilters,
  buildStats,
  getDefaultVisibleFields,
  getUniqueValues,
  sortRecords,
} from "./filtering"

const records: FeatureRecord[] = [
  {
    id: 1,
    geometry: { type: "Point", lon: 102.7, lat: 25.0 },
    properties: { name: "茶树", crop: "茶", samples: 10 },
    derived: { admin_country: "中国", admin_level1: "云南" },
  },
  {
    id: 2,
    geometry: { type: "Point", lon: 120.2, lat: 30.2 },
    properties: { name: "茶树园", crop: "茶", samples: 5 },
    derived: { admin_country: "中国", admin_level1: "浙江" },
  },
  {
    id: 3,
    geometry: { type: "Point", lon: 77.2, lat: 28.6 },
    properties: { name: "茶树（印度）", crop: "茶树", samples: 7 },
    derived: { admin_country: "印度", admin_level1: "Delhi" },
  },
  {
    id: 4,
    geometry: { type: "Point", lon: 100.0, lat: 15.0 },
    properties: { name: "水稻", crop: "水稻", samples: null },
    derived: { admin_country: "泰国", admin_level1: "Chiang Mai" },
  },
]

const emptyFilter: FilterState = {
  searchText: "",
  searchMode: "all",
  searchFields: [],
  visibleFields: ["name", "crop", "samples", "admin_country", "admin_level1"],
  includeHiddenFieldsInSearch: false,
  exactSearch: false,
  fieldFilters: {},
  sort: null,
}

describe("filtering", () => {
  it("matches Chinese substring search across all fields", () => {
    const filtered = applyFilters(records, { ...emptyFilter, searchText: "茶" })
    expect(filtered.map((record) => record.id)).toEqual([1, 2, 3])
  })

  it("matches only selected search fields when searchMode is fields", () => {
    const filtered = applyFilters(records, {
      ...emptyFilter,
      searchText: "中国",
      searchMode: "fields",
      searchFields: ["admin_country"],
    })
    expect(filtered.map((record) => record.id)).toEqual([1, 2])
  })

  it("excludes hidden fields from global search by default", () => {
    const filtered = applyFilters(records, {
      ...emptyFilter,
      searchText: "云南",
      visibleFields: ["name", "crop", "samples", "admin_country"],
    })

    expect(filtered).toEqual([])
  })

  it("includes hidden fields in search when enabled", () => {
    const filtered = applyFilters(records, {
      ...emptyFilter,
      searchText: "云南",
      visibleFields: ["name", "crop", "samples", "admin_country"],
      includeHiddenFieldsInSearch: true,
    })

    expect(filtered.map((record) => record.id)).toEqual([1])
  })

  it("uses exact equality instead of substring matching when enabled", () => {
    const filtered = applyFilters(records, {
      ...emptyFilter,
      searchText: "茶树",
      exactSearch: true,
    })

    expect(filtered.map((record) => record.id)).toEqual([1, 3])
  })

  it("shows every field by default when there are 40 fields", () => {
    const fields: FieldDefinition[] = Array.from({ length: 40 }, (_, index) => ({
      name: `field_${index + 1}`,
      source: "original",
    }))

    expect(getDefaultVisibleFields(fields)).toEqual(fields.map((field) => field.name))
  })

  it("shows derived fields and the first 30 original fields when there are more than 40 fields", () => {
    const originalFields: FieldDefinition[] = Array.from({ length: 39 }, (_, index) => ({
      name: `field_${index + 1}`,
      source: "original",
    }))
    const derivedFields: FieldDefinition[] = [
      { name: "admin_country", source: "derived" },
      { name: "admin_level1", source: "derived" },
    ]
    const fields = [...originalFields, ...derivedFields]

    expect(getDefaultVisibleFields(fields)).toEqual([
      ...originalFields.slice(0, 30).map((field) => field.name),
      "admin_country",
      "admin_level1",
    ])
  })

  it("combines search and field filters", () => {
    const filtered = applyFilters(records, {
      ...emptyFilter,
      searchText: "茶",
      fieldFilters: { admin_country: ["中国"] },
    })
    expect(filtered.map((record) => record.id)).toEqual([1, 2])
  })

  it("applies field filters to a prefiltered candidate set", () => {
    const candidates = applyFilters(records, { ...emptyFilter, searchText: "茶" })
    const filtered = applyFieldFilters(candidates, { admin_country: ["中国"] })

    expect(filtered.map((record) => record.id)).toEqual([1, 2])
  })

  it("builds category counts and ratios from current records", () => {
    const stats = buildStats(records.slice(0, 3), "admin_country")
    expect(stats).toEqual([
      { value: "中国", count: 2, ratio: 2 / 3 },
      { value: "印度", count: 1, ratio: 1 / 3 },
    ])
  })

  it("lists unique field values with counts", () => {
    expect(getUniqueValues(records, "crop")).toEqual([
      { value: "茶", count: 2 },
      { value: "茶树", count: 1 },
      { value: "水稻", count: 1 },
    ])
  })

  it("sorts numeric-looking values numerically", () => {
    const sorted = sortRecords(records, "samples", "asc")
    expect(sorted.map((record) => record.id)).toEqual([2, 3, 1, 4])
  })
})
