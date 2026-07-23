use geotable_lib::import::import_file;
use std::fs;

#[test]
fn reports_missing_dbf_for_shp() {
    let dir = tempfile::tempdir().expect("temp dir");
    let shp_path = dir.path().join("points.shp");
    fs::write(&shp_path, b"not a real shp").expect("write placeholder shp");

    let error = import_file(&shp_path).expect_err("missing sidecar should fail");
    assert!(error.user_message().contains("SHP 缺少配套文件"));
}
