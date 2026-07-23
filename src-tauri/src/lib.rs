pub mod admin;
pub mod error;
pub mod export;
pub mod import;
pub mod model;

mod commands {
    use super::admin::{enrich_dataset, production_admin_index};
    use super::error::GeoTableError;
    use super::export;
    use super::import;
    use super::model::Dataset;
    use std::path::PathBuf;

    #[tauri::command]
    pub fn open_dataset(path: String) -> Result<Dataset, GeoTableError> {
        let dataset = import::import_file(&PathBuf::from(path))?;
        let index = production_admin_index()?;
        Ok(enrich_dataset(dataset, &index))
    }

    #[tauri::command]
    pub fn export_csv(
        path: String,
        dataset: Dataset,
        record_ids: Vec<usize>,
    ) -> Result<(), GeoTableError> {
        export::write_csv(&PathBuf::from(path), &dataset, &record_ids)
    }
}

pub use commands::{export_csv, open_dataset};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            commands::open_dataset,
            commands::export_csv
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
