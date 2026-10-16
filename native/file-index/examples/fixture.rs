//! End-to-end child parser smoke test. Uses only a temporary fixture directory.
use kit_file_index::{Index, Policy};
use std::io::Write;
fn main() {
    if kit_file_index::extractor_main() {
        return;
    }
    let temp = tempfile::tempdir().expect("temporary fixture");
    let home = temp.path().join("fixture-home");
    std::fs::create_dir(&home).unwrap();
    std::fs::write(home.join("Rolando.txt"), "Rolando audiovisual proposal").unwrap();
    let mut zip = zip::ZipWriter::new(std::io::Cursor::new(Vec::new()));
    zip.start_file(
        "word/document.xml",
        zip::write::SimpleFileOptions::default(),
    )
    .unwrap();
    zip.write_all(b"<document><p>Rolando room proposal</p></document>")
        .unwrap();
    std::fs::write(home.join("room.docx"), zip.finish().unwrap().into_inner()).unwrap();
    let index = Index::with_key(
        home,
        &temp.path().join("index.db"),
        "fixture-key-not-production",
    )
    .unwrap();
    index
        .set_policy(Policy {
            granted: true,
            ..Default::default()
        })
        .unwrap();
    index.scan().unwrap();
    let results = index.search("Rolando").unwrap();
    assert_eq!(results.len(), 2, "{:?}", index.status().unwrap().errors);
    assert!(results
        .iter()
        .any(|r| index.preview(&r.id).unwrap().text.contains("room")));
    index.set_policy(Policy::default()).unwrap();
    assert!(index.preview(&results[0].id).is_err());
    println!("Isolated parser, encrypted index, search, preview and revocation passed with temporary fixtures.");
}
