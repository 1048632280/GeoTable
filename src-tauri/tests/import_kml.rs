use geotable_lib::import::import_file;
use pretty_assertions::assert_eq;
use std::fs;
use std::io::Write;
use zip::write::SimpleFileOptions;
use zip::{CompressionMethod, ZipWriter};

#[test]
fn imports_kml_points_with_extended_data() {
    let dir = tempfile::tempdir().expect("temp dir");
    let path = dir.path().join("tea.kml");
    fs::write(
        &path,
        r#"<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <Placemark>
      <name>茶树</name>
      <ExtendedData>
        <Data name="crop"><value>茶</value></Data>
      </ExtendedData>
      <Point><coordinates>102.7,25.0,0</coordinates></Point>
    </Placemark>
    <Placemark>
      <name>水稻</name>
      <ExtendedData>
        <Data name="crop"><value>水稻</value></Data>
      </ExtendedData>
      <Point><coordinates>100.0,15.0,0</coordinates></Point>
    </Placemark>
  </Document>
</kml>"#,
    )
    .expect("write kml");

    let dataset = import_file(&path).expect("imports kml");

    assert_eq!(dataset.file_name, "tea.kml");
    assert_eq!(dataset.total_records, 2);
    assert_eq!(
        dataset.records[0].field_as_string("name").as_deref(),
        Some("茶树")
    );
    assert_eq!(
        dataset.records[0].field_as_string("crop").as_deref(),
        Some("茶")
    );
}

#[test]
fn imports_schema_data_simple_data_from_kml() {
    let dir = tempfile::tempdir().expect("temp dir");
    let path = dir.path().join("schema-data.kml");
    fs::write(
        &path,
        r##"<kml xmlns="http://www.opengis.net/kml/2.2"><Document><Schema id="sample"><SimpleField name="species" type="string"/></Schema><Placemark><ExtendedData><SchemaData schemaUrl="#sample"><SimpleData name="species">茶树</SimpleData></SchemaData></ExtendedData><Point><coordinates>102.7,25.0</coordinates></Point></Placemark></Document></kml>"##,
    )
    .expect("write kml");

    let dataset = import_file(&path).expect("imports schema data");

    assert_eq!(
        dataset.records[0].field_as_string("species").as_deref(),
        Some("茶树")
    );
}

#[test]
fn imports_schema_data_simple_data_from_kmz() {
    let dir = tempfile::tempdir().expect("temp dir");
    let path = dir.path().join("schema-data.kmz");
    write_kmz(
        &path,
        &[(
            "doc.kml",
            r##"<kml xmlns="http://www.opengis.net/kml/2.2"><Placemark><ExtendedData><SchemaData schemaUrl="#sample"><SimpleData name="species">水稻</SimpleData></SchemaData></ExtendedData><Point><coordinates>102.7,25.0</coordinates></Point></Placemark></kml>"##,
        )],
    );

    let dataset = import_file(&path).expect("imports kmz schema data");

    assert_eq!(
        dataset.records[0].field_as_string("species").as_deref(),
        Some("水稻")
    );
}

#[test]
fn renames_source_admin_fields_without_duplicate_headers() {
    let dir = tempfile::tempdir().expect("temp dir");
    let path = dir.path().join("reserved-fields.kml");
    fs::write(
        &path,
        r#"<kml xmlns="http://www.opengis.net/kml/2.2"><Placemark><ExtendedData><Data name="admin_country"><value>源国家</value></Data><SchemaData><SimpleData name="admin_level1">源省份</SimpleData></SchemaData></ExtendedData><Point><coordinates>102.7,25.0</coordinates></Point></Placemark></kml>"#,
    )
    .expect("write kml");

    let dataset = import_file(&path).expect("imports reserved fields");
    let field_names: Vec<&str> = dataset
        .fields
        .iter()
        .map(|field| field.name.as_str())
        .collect();

    assert_eq!(
        dataset.records[0]
            .field_as_string("source_admin_country")
            .as_deref(),
        Some("源国家")
    );
    assert_eq!(
        dataset.records[0]
            .field_as_string("source_admin_level1")
            .as_deref(),
        Some("源省份")
    );
    assert_eq!(
        field_names
            .iter()
            .filter(|name| **name == "admin_country")
            .count(),
        1
    );
    assert_eq!(
        field_names
            .iter()
            .filter(|name| **name == "admin_level1")
            .count(),
        1
    );
}

#[test]
fn rejects_kml_without_points() {
    let dir = tempfile::tempdir().expect("temp dir");
    let path = dir.path().join("empty.kml");
    fs::write(
        &path,
        r#"<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2"><Document></Document></kml>"#,
    )
    .expect("write kml");

    let error = import_file(&path).expect_err("empty kml fails");
    assert!(error.user_message().contains("KML/KMZ 内没有可用点要素"));
}

#[test]
fn imports_kmz_root_doc_with_attributes() {
    let dir = tempfile::tempdir().expect("temp dir");
    let path = dir.path().join("tea.kmz");
    write_kmz(
        &path,
        &[
            (
                "alternate.kml",
                r#"<kml xmlns="http://www.opengis.net/kml/2.2"><Placemark><name>不应导入</name><Point><coordinates>0,0</coordinates></Point></Placemark></kml>"#,
            ),
            (
                "doc.kml",
                r#"<kml xmlns="http://www.opengis.net/kml/2.2"><Document><Placemark><name>茶树</name><ExtendedData><Data name="crop"><value>茶</value></Data></ExtendedData><Point><coordinates>102.7,25.0</coordinates></Point></Placemark></Document></kml>"#,
            ),
        ],
    );

    let dataset = import_file(&path).expect("imports kmz root doc");

    assert_eq!(dataset.file_name, "tea.kmz");
    assert_eq!(dataset.total_records, 1);
    assert_eq!(
        dataset.records[0].field_as_string("name").as_deref(),
        Some("茶树")
    );
    assert_eq!(
        dataset.records[0].field_as_string("crop").as_deref(),
        Some("茶")
    );
}

#[test]
fn imports_first_kml_entry_when_kmz_has_no_root_doc() {
    let dir = tempfile::tempdir().expect("temp dir");
    let path = dir.path().join("fallback.kmz");
    write_kmz(
        &path,
        &[(
            "nested/feature.kml",
            r#"<kml xmlns="http://www.opengis.net/kml/2.2"><Placemark><name>回退点</name><Point><coordinates>102.7,25.0</coordinates></Point></Placemark></kml>"#,
        )],
    );

    let dataset = import_file(&path).expect("imports fallback kml entry");

    assert_eq!(dataset.total_records, 1);
    assert_eq!(
        dataset.records[0].field_as_string("name").as_deref(),
        Some("回退点")
    );
}

#[test]
fn rejects_kmz_without_kml_entry() {
    let dir = tempfile::tempdir().expect("temp dir");
    let path = dir.path().join("missing-kml.kmz");
    write_kmz(&path, &[("notes.txt", "没有 KML 文档")]);

    let error = import_file(&path).expect_err("kmz without kml fails");

    assert!(error.user_message().contains("KMZ 内未找到 KML 文档"));
}

#[test]
fn rejects_kmz_without_usable_points() {
    let dir = tempfile::tempdir().expect("temp dir");
    let path = dir.path().join("empty.kmz");
    write_kmz(
        &path,
        &[(
            "doc.kml",
            r#"<kml xmlns="http://www.opengis.net/kml/2.2"><Placemark><LineString><coordinates>102.7,25.0 103.0,25.1</coordinates></LineString></Placemark></kml>"#,
        )],
    );

    let error = import_file(&path).expect_err("kmz without points fails");

    assert!(error.user_message().contains("KML/KMZ 内没有可用点要素"));
}

#[test]
fn skips_out_of_range_kml_points() {
    let dir = tempfile::tempdir().expect("temp dir");
    let path = dir.path().join("coordinates.kml");
    fs::write(
        &path,
        r#"<kml xmlns="http://www.opengis.net/kml/2.2"><Document><Placemark><name>有效点</name><Point><coordinates>102.7,25.0</coordinates></Point></Placemark><Placemark><name>无效点</name><Point><coordinates>181,91</coordinates></Point></Placemark></Document></kml>"#,
    )
    .expect("write kml");

    let dataset = import_file(&path).expect("imports valid point only");

    assert_eq!(dataset.total_records, 1);
    assert_eq!(
        dataset.records[0].field_as_string("name").as_deref(),
        Some("有效点")
    );
    assert_eq!(dataset.warnings.len(), 1);
}

#[test]
fn imports_points_in_nested_folders() {
    let dir = tempfile::tempdir().expect("temp dir");
    let path = dir.path().join("nested-folders.kml");
    fs::write(
        &path,
        r#"<kml xmlns="http://www.opengis.net/kml/2.2"><Document><Folder><Folder><Placemark><name>嵌套点</name><Point><coordinates>102.7,25.0</coordinates></Point></Placemark></Folder></Folder></Document></kml>"#,
    )
    .expect("write kml");

    let dataset = import_file(&path).expect("imports nested folder point");

    assert_eq!(dataset.total_records, 1);
    assert_eq!(
        dataset.records[0].field_as_string("name").as_deref(),
        Some("嵌套点")
    );
}

fn write_kmz(path: &std::path::Path, entries: &[(&str, &str)]) {
    let file = fs::File::create(path).expect("create kmz");
    let mut writer = ZipWriter::new(file);
    let options = SimpleFileOptions::default().compression_method(CompressionMethod::Stored);

    for (name, contents) in entries {
        writer.start_file(name, options).expect("start kmz entry");
        writer
            .write_all(contents.as_bytes())
            .expect("write kmz entry");
    }

    writer.finish().expect("finish kmz");
}
