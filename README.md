# GeoTable

GeoTable 是一个 Windows 桌面属性表工具，用于打开 `shp`、`kml`、`kmz` 点数据，浏览属性字段，进行模糊搜索、字段筛选、分类统计，并根据 WGS84 点坐标离线生成 `admin_country` 和 `admin_level1` 派生字段。

## 开发运行

```powershell
chcp 65001
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
pnpm install
pnpm tauri dev
```

## 验证

```powershell
chcp 65001
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
pnpm test
cargo test --manifest-path src-tauri/Cargo.toml
pnpm build
```

## 第一版限制

- 不显示地图。
- 不支持 `tif` / GeoTIFF。
- 行政区识别只支持 WGS84 经纬度点坐标。
- SHP 如果不是经纬度坐标，仍可浏览属性表，但不识别行政区。
- 内置 Natural Earth 5.1.2 边界仅用于离线统计分组，不代表法定或权威边界。
- `admin_country` 使用 1:110m 全球 Admin 0；`admin_level1` 使用 1:10m 中国和印度一级行政区（中国 32 个、印度 36 个）。其他国家的 `admin_level1` 保持为空并显示明确警告。
- 边界数据来源、许可和精确覆盖范围见 `src-tauri/assets/admin/README.md`。
