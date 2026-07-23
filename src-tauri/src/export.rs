use crate::error::GeoTableError;
use crate::model::{Dataset, FeatureRecord, FieldValue};
use std::collections::BTreeSet;
use std::fs::{self, File, OpenOptions};
use std::io::{BufWriter, Write};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};

static TEMP_FILE_COUNTER: AtomicU64 = AtomicU64::new(0);

pub fn write_csv(
    path: &Path,
    dataset: &Dataset,
    record_ids: &[usize],
) -> Result<(), GeoTableError> {
    let selected: BTreeSet<usize> = record_ids.iter().copied().collect();
    let (temp_path, temp_file) = create_sibling_temp_file(path)?;
    let result = write_csv_to_file(temp_file, dataset, &selected);
    if let Err(error) = result {
        let _ = fs::remove_file(&temp_path);
        return Err(error);
    }
    replace_file(&temp_path, path).map_err(|error| {
        let _ = fs::remove_file(&temp_path);
        GeoTableError::CsvExport(error.to_string())
    })
}

fn write_csv_to_file(
    file: File,
    dataset: &Dataset,
    selected: &BTreeSet<usize>,
) -> Result<(), GeoTableError> {
    let mut writer = csv::Writer::from_writer(BufWriter::new(file));
    let raw_headers: Vec<&str> = dataset
        .fields
        .iter()
        .map(|field| field.name.as_str())
        .collect();
    let headers: Vec<String> = raw_headers
        .iter()
        .map(|field| escape_spreadsheet_text(field))
        .collect();

    writer
        .write_record(headers.iter())
        .map_err(|error| GeoTableError::CsvExport(error.to_string()))?;

    for record in dataset
        .records
        .iter()
        .filter(|record| selected.contains(&record.id))
    {
        let row: Vec<String> = raw_headers
            .iter()
            .map(|field| export_cell(record, field))
            .collect();
        writer
            .write_record(row)
            .map_err(|error| GeoTableError::CsvExport(error.to_string()))?;
    }

    writer
        .flush()
        .map_err(|error| GeoTableError::CsvExport(error.to_string()))?;
    let mut buffered = writer
        .into_inner()
        .map_err(|error| GeoTableError::CsvExport(error.to_string()))?;
    buffered
        .flush()
        .map_err(|error| GeoTableError::CsvExport(error.to_string()))?;
    buffered
        .get_ref()
        .sync_all()
        .map_err(|error| GeoTableError::CsvExport(error.to_string()))?;
    Ok(())
}

fn export_cell(record: &FeatureRecord, field: &str) -> String {
    let value = record.field_as_string(field).unwrap_or_default();
    let is_text = matches!(field, "admin_country" | "admin_level1")
        || matches!(record.properties.get(field), Some(FieldValue::String(_)));
    if is_text {
        escape_spreadsheet_text(&value)
    } else {
        value
    }
}

fn escape_spreadsheet_text(value: &str) -> String {
    if matches!(value.chars().next(), Some('=' | '+' | '-' | '@')) {
        format!("'{value}")
    } else {
        value.to_string()
    }
}

fn create_sibling_temp_file(path: &Path) -> Result<(PathBuf, File), GeoTableError> {
    let directory = path.parent().unwrap_or_else(|| Path::new("."));
    let file_name = path
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or("export.csv");
    for _ in 0..100 {
        let suffix = TEMP_FILE_COUNTER.fetch_add(1, Ordering::Relaxed);
        let temp_path = directory.join(format!(
            ".{file_name}.geotable-{}-{suffix}.tmp",
            std::process::id()
        ));
        match OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&temp_path)
        {
            Ok(file) => return Ok((temp_path, file)),
            Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => continue,
            Err(error) => return Err(GeoTableError::CsvExport(error.to_string())),
        }
    }
    Err(GeoTableError::CsvExport("无法创建临时导出文件".to_string()))
}

#[cfg(windows)]
fn replace_file(source: &Path, target: &Path) -> std::io::Result<()> {
    use std::os::windows::ffi::OsStrExt;
    use windows_sys::Win32::Storage::FileSystem::{
        MoveFileExW, MOVEFILE_REPLACE_EXISTING, MOVEFILE_WRITE_THROUGH,
    };

    let source_wide: Vec<u16> = source.as_os_str().encode_wide().chain(Some(0)).collect();
    let target_wide: Vec<u16> = target.as_os_str().encode_wide().chain(Some(0)).collect();
    let succeeded = unsafe {
        MoveFileExW(
            source_wide.as_ptr(),
            target_wide.as_ptr(),
            MOVEFILE_REPLACE_EXISTING | MOVEFILE_WRITE_THROUGH,
        )
    };
    if succeeded == 0 {
        Err(std::io::Error::last_os_error())
    } else {
        Ok(())
    }
}

#[cfg(not(windows))]
fn replace_file(source: &Path, target: &Path) -> std::io::Result<()> {
    fs::rename(source, target)
}
