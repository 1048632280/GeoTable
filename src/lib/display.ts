const FIELD_LABELS: Record<string, string> = {
  name: "作物",
  admin_country: "国家",
  admin_level1: "一级行政区",
}

export function displayFieldName(fieldName: string): string {
  return FIELD_LABELS[fieldName] ?? fieldName
}

export function displayFieldValue(value: string | null): string {
  if (value === null) return ""
  return value === "中华人民共和国" ? "中国" : value
}
