#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
use tauri::Manager;
mod files;

// Keep the existing service on its own origin with no native capabilities.
#[tauri::command]
async fn open_company_window(
    app: tauri::AppHandle,
    window: tauri::WebviewWindow,
    route: Option<String>,
) -> Result<(), String> {
    if window.label() != "main" {
        return Err("Open company records from the local window".into());
    }
    let target: tauri::Url = format!("http://127.0.0.1:3001{}", route.as_deref().unwrap_or("/"))
        .parse()
        .map_err(|_| "Invalid record route")?;
    if let Some(route) = route.as_ref() {
        let module = target.path().split('/').nth(1).unwrap_or("");
        if route.len() > 1500
            || !route.starts_with('/')
            || route.starts_with("//")
            || route.contains('\\')
            || !matches!(
                module,
                "events"
                    | "clients"
                    | "proposals"
                    | "creative"
                    | "venues"
                    | "inventory"
                    | "kit"
                    | "search"
            )
        {
            return Err("Unsupported company record route".into());
        }
    }
    let address = "127.0.0.1:3001"
        .parse()
        .map_err(|_| "Invalid service address")?;
    std::net::TcpStream::connect_timeout(&address, std::time::Duration::from_secs(2))
        .map_err(|_| "Start the KIT company server on port 3001")?;
    if let Some(window) = app.get_webview_window("company") {
        if let Some(route) = route {
            let encoded = serde_json::to_string(&route).map_err(|e| e.to_string())?;
            window.eval(&format!("window.dispatchEvent(new CustomEvent('kit:company-route',{{detail:{encoded}}}))")).map_err(|e|e.to_string())?;
        }
        return window.set_focus().map_err(|error| error.to_string());
    }
    tauri::WebviewWindowBuilder::new(&app, "company", tauri::WebviewUrl::External(target))
        .title("KIT · Empresa")
        .inner_size(1440.0, 960.0)
        .build()
        .map(|_| ())
        .map_err(|error| error.to_string())
}
fn main() {
    if kit_file_index::extractor_main() {
        return;
    }
    tauri::Builder::default()
        .manage(files::Files(std::sync::Mutex::new(None)))
        .manage(files::Cloud(tauri::async_runtime::Mutex::new(())))
        .setup(|app| {
            tauri::async_runtime::spawn(files::reconcile(app.handle().clone()));
            Ok(())
        })
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .invoke_handler(tauri::generate_handler![
            open_company_window,
            files::file_status,
            files::file_policy,
            files::file_scan,
            files::file_search,
            files::file_preview,
            files::file_image,
            files::file_open,
            files::cloud_search
        ])
        .run(tauri::generate_context!())
        .expect("Unable to start KIT desktop");
}
