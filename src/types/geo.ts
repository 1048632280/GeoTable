export type FieldValue = string | number | boolean | null

export type FieldSource = "original" | "derived"

export type FieldDefinition = {
  name: string
  source: FieldSource
}

export type PointGeometry = {
  type: "Point"
  lon: number
  lat: number
}

export type FeatureRecord = {
  id: number
  geometry: PointGeometry | null
  properties: Record<string, FieldValue>
  derived: {
    admin_country?: string
    admin_level1?: string
  }
}

export type ImportWarning = {
  code:
    | "non_point_geometry"
    | "missing_geometry"
    | "non_wgs84"
    | "admin_lookup_failed"
    | "encoding_fallback"
  message: string
  recordId?: number
}

export type Dataset = {
  fileName: string
  totalRecords: number
  fields: FieldDefinition[]
  records: FeatureRecord[]
  warnings: ImportWarning[]
}

export type TextSearchMode = "all" | "fields"

export type FilterState = {
  searchText: string
  searchMode: TextSearchMode
  searchFields: string[]
  visibleFields: string[]
  includeHiddenFieldsInSearch: boolean
  exactSearch: boolean
  fieldFilters: Record<string, string[]>
  sort: {
    field: string
    direction: "asc" | "desc"
  } | null
}

export type StatsRow = {
  value: string
  count: number
  ratio: number
}

export type ImportStatus =
  | "idle"
  | "loading"
  | "admin_lookup_running"
  | "ready"
  | "partial_failure"
  | "failed"
