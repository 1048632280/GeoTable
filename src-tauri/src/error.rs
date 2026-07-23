use thiserror::Error;

#[derive(Debug, Error)]
pub enum GeoTableError {
    #[error("不支持的文件格式：{0}")]
    UnsupportedFormat(String),
    #[error("文件无法读取：{0}")]
    FileRead(String),
    #[error("SHP 缺少配套文件：{0}")]
    MissingShpSidecar(String),
    #[error("KML/KMZ 内没有可用点要素")]
    EmptyKml,
    #[error("点坐标缺失或无效")]
    InvalidCoordinate,
    #[error("行政区识别失败：{0}")]
    AdminLookup(String),
    #[error("CSV 导出失败：{0}")]
    CsvExport(String),
}

impl GeoTableError {
    pub fn user_message(&self) -> String {
        self.to_string()
    }
}

impl serde::Serialize for GeoTableError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        serializer.serialize_str(&self.user_message())
    }
}
