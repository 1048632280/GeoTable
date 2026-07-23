import type { FeatureRecord, FieldValue, FilterState, StatsRow } from "../types/geo"

export function getRecordValue(record: FeatureRecord, field: string): string | null {
  if (field === "admin_country") return record.derived.admin_country ?? null
  if (field === "admin_level1") return record.derived.admin_level1 ?? null
  return normalizeFieldValue(record.properties[field])
}

export function applyFilters(records: FeatureRecord[], filter: FilterState): FeatureRecord[] {
  const searchText = filter.searchText.trim().toLocaleLowerCase()
  const searchFields =
    filter.searchMode === "fields" && filter.searchFields.length > 0
      ? filter.searchFields
      : null

  let result = records.filter((record) => {
    if (searchText && !recordMatchesSearch(record, searchText, searchFields)) {
      return false
    }

    return recordMatchesFieldFilters(record, filter.fieldFilters)
  })

  if (filter.sort) {
    result = sortRecords(result, filter.sort.field, filter.sort.direction)
  }

  return result
}

export function applyFieldFilters(
  records: FeatureRecord[],
  fieldFilters: FilterState["fieldFilters"],
): FeatureRecord[] {
  return records.filter((record) => recordMatchesFieldFilters(record, fieldFilters))
}

export function getUniqueValues(
  records: FeatureRecord[],
  field: string,
): Array<{ value: string; count: number }> {
  const counts = countValues(records, field)
  return Array.from(counts.entries())
    .map(([value, count]) => ({ value, count }))
    .sort((left, right) => right.count - left.count || left.value.localeCompare(right.value, "zh-Hans-CN"))
}

export function buildStats(records: FeatureRecord[], field: string): StatsRow[] {
  const total = records.length
  if (total === 0) return []

  return getUniqueValues(records, field).map(({ value, count }) => ({
    value,
    count,
    ratio: count / total,
  }))
}

export function sortRecords(
  records: FeatureRecord[],
  field: string,
  direction: "asc" | "desc",
): FeatureRecord[] {
  const multiplier = direction === "asc" ? 1 : -1
  return [...records].sort((left, right) => {
    const leftValue = getRecordValue(left, field)
    const rightValue = getRecordValue(right, field)

    if (leftValue === null && rightValue === null) return 0
    if (leftValue === null) return 1
    if (rightValue === null) return -1

    const leftNumber = Number(leftValue)
    const rightNumber = Number(rightValue)
    if (Number.isFinite(leftNumber) && Number.isFinite(rightNumber)) {
      return (leftNumber - rightNumber) * multiplier
    }

    return leftValue.localeCompare(rightValue, "zh-Hans-CN", { numeric: true }) * multiplier
  })
}

function recordMatchesSearch(
  record: FeatureRecord,
  searchText: string,
  searchFields: string[] | null,
): boolean {
  const fields =
    searchFields ??
    Array.from(
      new Set([
        ...Object.keys(record.properties),
        "admin_country",
        "admin_level1",
      ]),
    )

  return fields.some((field) => {
    const value = getRecordValue(record, field)
    return value !== null && value.toLocaleLowerCase().includes(searchText)
  })
}

function countValues(records: FeatureRecord[], field: string): Map<string, number> {
  const counts = new Map<string, number>()
  for (const record of records) {
    const value = getRecordValue(record, field)
    if (value === null || value === "") continue
    counts.set(value, (counts.get(value) ?? 0) + 1)
  }
  return counts
}

function recordMatchesFieldFilters(
  record: FeatureRecord,
  fieldFilters: FilterState["fieldFilters"],
): boolean {
  return Object.entries(fieldFilters).every(([field, allowedValues]) => {
    if (allowedValues.length === 0) return true
    const value = getRecordValue(record, field)
    return value !== null && allowedValues.includes(value)
  })
}

function normalizeFieldValue(value: FieldValue | undefined): string | null {
  if (value === undefined || value === null) return null
  return String(value)
}
