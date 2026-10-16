#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
use tauri::Manager;

// Keep the existing service on its own origin with no native capabilities.
#[tauri::command]
async fn open_company_window(app: tauri::AppHandle) -> Result<(), String> {
    let address = "127.0.0.1:3001".parse().map_err(|_| "Invalid service address")?;
    std::net::TcpStream::connect_timeout(&address, std::time::Duration::from_secs(2))
        .map_err(|_| "Start the KIT company server on port 3001")?;
    if let Some(window) = app.get_webview_window("company") {
        return window.set_focus().map_err(|error| error.to_string());
    }
    tauri::WebviewWindowBuilder::new(&app, "company", tauri::WebviewUrl::External(
        "http://127.0.0.1:3001".parse().map_err(|_| "Invalid service URL")?
    ))
    .title("KIT · Empresa")
    .inner_size(1440.0, 960.0)
    .build()
    .map(|_| ())
    .map_err(|error| error.to_string())
}
fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .invoke_handler(tauri::generate_handler![open_company_window])
        .run(tauri::generate_context!())
        .expect("Unable to start KIT desktop");
}
