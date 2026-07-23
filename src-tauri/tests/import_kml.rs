use geotable_lib::import::import_file;
use pretty_assertions::assert_eq;
use std::fs;

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
