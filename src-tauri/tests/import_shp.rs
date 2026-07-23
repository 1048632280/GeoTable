use geotable_lib::import::import_file;
use geotable_lib::model::{FieldDefinition, FieldSource, FieldValue, Geometry, WarningCode};
use shapefile::dbase::{self, TableWriterBuilder};
use shapefile::{Point, PointZ, Writer};
use std::fs::{self, OpenOptions};
use std::io::{Seek, SeekFrom, Write};
use std::path::Path;

#[test]
fn reports_missing_dbf_for_shp() {
    let dir = tempfile::tempdir().expect("temp dir");
    let shp_path = dir.path().join("points.shp");
    fs::write(&shp_path, b"not a real shp").expect("write placeholder shp");

    let error = import_file(&shp_path).expect_err("missing sidecar should fail");
    assert!(error.user_message().contains("SHP 缺少配套文件"));
}

#[test]
fn imports_wgs84_point_with_dbf_field() {
    let dir = tempfile::tempdir().expect("temp dir");
    let shp_path = dir.path().join("points.shp");
    write_point_shp(&shp_path, Point::new(116.397, 39.908), "Beijing");
    write_wgs84_prj(&shp_path);

    let dataset = import_file(&shp_path).expect("point SHP imports");

    assert_eq!(dataset.total_records, 1);
    assert_eq!(dataset.warnings, Vec::new());
    assert_eq!(
        dataset.records[0].geometry,
        Some(Geometry::Point {
            lon: 116.397,
            lat: 39.908,
        })
    );
    assert_eq!(
        dataset.records[0].properties.get("name"),
        Some(&FieldValue::String("Beijing".to_string()))
    );
}

#[test]
fn uses_cpg_encoding_for_dbf_schema_and_values() {
    let dir = tempfile::tempdir().expect("temp dir");
    let shp_path = dir.path().join("gbk.shp");
    let builder = TableWriterBuilder::with_encoding(dbase::encoding::EncodingRs::from(
        dbase::encoding_rs::GBK,
    ))
    .add_character_field("ABCD".try_into().expect("field name"), 20);
    let mut writer = Writer::from_path(&shp_path, builder).expect("create GBK SHP writer");
    let mut record = dbase::Record::default();
    record.insert(
        "ABCD".to_string(),
        dbase::FieldValue::Character(Some("北京".to_string())),
    );
    writer
        .write_shape_and_record(&Point::new(116.397, 39.908), &record)
        .expect("write GBK record");
    drop(writer);
    let mut dbf = OpenOptions::new()
        .write(true)
        .open(shp_path.with_extension("dbf"))
        .expect("open dbf header");
    dbf.seek(SeekFrom::Start(32))
        .expect("seek field descriptor");
    let (field_name, _, had_errors) = dbase::encoding_rs::GBK.encode("名称");
    assert!(!had_errors);
    let mut descriptor_name = [0_u8; 11];
    descriptor_name[..field_name.len()].copy_from_slice(&field_name);
    dbf.write_all(&descriptor_name)
        .expect("write GBK field name");
    drop(dbf);
    fs::write(shp_path.with_extension("cpg"), "GBK").expect("write cpg");
    write_wgs84_prj(&shp_path);

    let dataset = import_file(&shp_path).expect("imports GBK SHP");

    assert!(dataset.fields.iter().any(|field| field.name == "名称"));
    assert_eq!(
        dataset.records[0].field_as_string("名称").as_deref(),
        Some("北京")
    );
}

#[test]
fn preserves_dbf_fields_for_empty_dataset() {
    let dir = tempfile::tempdir().expect("temp dir");
    let shp_path = dir.path().join("empty.shp");
    write_empty_point_shp(&shp_path);
    write_wgs84_prj(&shp_path);

    let dataset = import_file(&shp_path).expect("empty SHP imports");

    assert_eq!(dataset.total_records, 0);
    assert!(dataset.fields.contains(&FieldDefinition {
        name: "name".to_string(),
        source: FieldSource::Original,
    }));
    assert!(dataset.fields.contains(&FieldDefinition {
        name: "admin_country".to_string(),
        source: FieldSource::Derived,
    }));
    assert!(dataset.fields.contains(&FieldDefinition {
        name: "admin_level1".to_string(),
        source: FieldSource::Derived,
    }));
}

#[test]
fn warns_when_prj_is_missing_or_not_wgs84_geographic() {
    let dir = tempfile::tempdir().expect("temp dir");
    let missing_prj = dir.path().join("missing-prj.shp");
    let projected_prj = dir.path().join("projected-prj.shp");
    write_point_shp(&missing_prj, Point::new(116.397, 39.908), "missing");
    write_point_shp(&projected_prj, Point::new(116.397, 39.908), "projected");
    fs::write(
        projected_prj.with_extension("prj"),
        "PROJCS[\"WGS 84 / Pseudo-Mercator\",GEOGCS[\"WGS 84\",DATUM[\"WGS_1984\",SPHEROID[\"WGS 84\",6378137,298.257223563]],UNIT[\"degree\",0.0174532925199433]],UNIT[\"metre\",1]]",
    )
    .expect("write projected prj");

    for path in [&missing_prj, &projected_prj] {
        let dataset = import_file(path).expect("point SHP imports with CRS warning");
        assert!(dataset.warnings.iter().any(|warning| {
            warning.code == WarningCode::NonWgs84
                && warning.record_id.is_none()
                && warning.message.contains("行政区识别")
        }));
    }
}

#[test]
fn imports_point_z_as_point_geometry() {
    let dir = tempfile::tempdir().expect("temp dir");
    let shp_path = dir.path().join("points-z.shp");
    write_point_z_shp(
        &shp_path,
        PointZ::new(121.4737, 31.2304, 4.0, 0.0),
        "Shanghai",
    );
    write_wgs84_prj(&shp_path);

    let dataset = import_file(&shp_path).expect("PointZ SHP imports");

    assert_eq!(dataset.warnings, Vec::new());
    assert_eq!(
        dataset.records[0].geometry,
        Some(Geometry::Point {
            lon: 121.4737,
            lat: 31.2304,
        })
    );
}

fn write_point_shp(path: &Path, point: Point, name: &str) {
    let mut writer = Writer::from_path(path, dbf_table_builder()).expect("create SHP writer");
    writer
        .write_shape_and_record(&point, &dbf_record(name))
        .expect("write point SHP record");
}

fn write_empty_point_shp(path: &Path) {
    Writer::from_path(path, dbf_table_builder()).expect("create empty SHP writer");
}

fn write_point_z_shp(path: &Path, point: PointZ, name: &str) {
    let mut writer = Writer::from_path(path, dbf_table_builder()).expect("create SHP writer");
    writer
        .write_shape_and_record(&point, &dbf_record(name))
        .expect("write PointZ SHP record");
}

fn dbf_table_builder() -> TableWriterBuilder {
    TableWriterBuilder::new().add_character_field("name".try_into().expect("field name"), 40)
}

fn dbf_record(name: &str) -> dbase::Record {
    let mut record = dbase::Record::default();
    record.insert(
        "name".to_string(),
        dbase::FieldValue::Character(Some(name.to_string())),
    );
    record
}

fn write_wgs84_prj(path: &Path) {
    fs::write(
        path.with_extension("prj"),
        "GEOGCS[\"WGS 84\",DATUM[\"WGS_1984\",SPHEROID[\"WGS 84\",6378137,298.257223563]],PRIMEM[\"Greenwich\",0],UNIT[\"degree\",0.0174532925199433]]",
    )
    .expect("write WGS84 prj");
}
