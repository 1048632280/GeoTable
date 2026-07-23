use crate::error::GeoTableError;
use crate::model::Dataset;
use std::collections::BTreeSet;
use std::path::Path;

pub fn write_csv(
    path: &Path,
    dataset: &Dataset,
    record_ids: &[usize],
) -> Result<(), GeoTableError> {
    let selected: BTreeSet<usize> = record_ids.iter().copied().collect();
    let mut writer = csv::Writer::from_path(path)
        .map_err(|error| GeoTableError::CsvExport(error.to_string()))?;
    let headers: Vec<String> = dataset
        .fields
        .iter()
        .map(|field| field.name.clone())
        .collect();

    writer
        .write_record(headers.iter())
        .map_err(|error| GeoTableError::CsvExport(error.to_string()))?;

    for record in dataset
        .records
        .iter()
        .filter(|record| selected.contains(&record.id))
    {
        let row: Vec<String> = headers
            .iter()
            .map(|field| record.field_as_string(field).unwrap_or_default())
            .collect();
        writer
            .write_record(row)
            .map_err(|error| GeoTableError::CsvExport(error.to_string()))?;
    }

    writer
        .flush()
        .map_err(|error| GeoTableError::CsvExport(error.to_string()))?;
    Ok(())
}
