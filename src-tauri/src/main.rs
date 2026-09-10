#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use serde::Serialize;
use serde_json::{json, Value};
use std::sync::{
    atomic::{AtomicBool, Ordering},
    Arc, Mutex,
};
use std::time::Duration;
use tauri::{Emitter, Manager};
use tauri_plugin_opener::OpenerExt;
use tauri_plugin_shell::{
    process::{CommandChild, CommandEvent},
    ShellExt,
};
use tauri_plugin_updater::UpdaterExt;
use tokio::sync::{oneshot, Mutex as AsyncMutex};

const SERVICE: &str = "com.nicolasgomeztoua.gex-cockpit";
const UPDATE_URL: &str =
    "https://github.com/nicolasgomeztoua/gex-cockpit/releases/latest/download/latest.json";
type Child = Arc<Mutex<Option<CommandChild>>>;

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct Context {
    api_base: String,
    token: String,
    has_key: bool,
    data_dir: String,
    version: String,
}
struct Running {
    context: Context,
    alive: Arc<AtomicBool>,
}
#[derive(Default)]
struct AppState {
    backend: AsyncMutex<Option<Running>>,
    child: Mutex<Option<Child>>,
    update: AsyncMutex<Option<tauri_plugin_updater::Update>>,
}

fn credential() -> Result<keyring::Entry, String> {
    keyring::Entry::new(SERVICE, "gexbot-api-key").map_err(|_| "KEYCHAIN_UNAVAILABLE".into())
}
fn stored_key() -> Result<Option<String>, String> {
    match credential()?.get_password() {
        Ok(key) => Ok(Some(key)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(_) => Err("KEYCHAIN_UNAVAILABLE".into()),
    }
}
fn empty_context(app: &tauri::AppHandle) -> Result<Context, String> {
    let dir = app.path().app_data_dir().map_err(|_| "BACKEND_FAILED")?;
    std::fs::create_dir_all(&dir).map_err(|_| "BACKEND_FAILED")?;
    Ok(Context {
        api_base: String::new(),
        token: String::new(),
        has_key: false,
        data_dir: dir.to_string_lossy().into_owned(),
        version: app.package_info().version.to_string(),
    })
}
fn stop_child(app: &tauri::AppHandle) {
    if let Some(child) = app.state::<AppState>().child.lock().unwrap().take() {
        if let Some(child) = child.lock().unwrap().take() {
            let _ = child.kill();
        }
    }
}

async fn start_backend(app: &tauri::AppHandle, key: &str) -> Result<Running, String> {
    let mut context = empty_context(app)?;
    context.has_key = true;
    context.token = uuid::Uuid::new_v4().simple().to_string();
    let resources = if cfg!(debug_assertions) {
        std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("..")
    } else {
        app.path().resource_dir().map_err(|_| "BACKEND_FAILED")?
    };
    // Do not inherit a developer's GEXBOT_API_KEY, MOCK, REPLAY, Bun flags or port.
    let mut command = app
        .shell()
        .sidecar("gex-backend")
        .map_err(|_| "BACKEND_FAILED")?
        .env_clear();
    for name in [
        "HOME",
        "USERPROFILE",
        "SystemRoot",
        "WINDIR",
        "TEMP",
        "TMP",
        "TMPDIR",
        "LANG",
        "LOCALAPPDATA",
        "APPDATA",
    ] {
        if let Some(value) = std::env::var_os(name) {
            command = command.env(name, value);
        }
    }
    command = command
        .current_dir(&context.data_dir)
        .env("GEX_DESKTOP", "1")
        .env("PORT", "0")
        .env("NODE_ENV", "production")
        .env(
            "GEX_DESKTOP_DEV",
            if cfg!(debug_assertions) { "1" } else { "0" },
        )
        .env("GEX_SESSION_TOKEN", &context.token)
        .env("GEXBOT_API_KEY", key)
        .env(
            "DB_PATH",
            std::path::Path::new(&context.data_dir).join("gex-cockpit.db"),
        )
        .env("GEX_RESOURCE_DIR", resources);
    let (mut events, process) = command.spawn().map_err(|_| "BACKEND_FAILED")?;
    let child = Arc::new(Mutex::new(Some(process)));
    *app.state::<AppState>().child.lock().unwrap() = Some(child.clone());
    let alive = Arc::new(AtomicBool::new(true));
    let running_alive = alive.clone();
    let handle = app.clone();
    let (ready_tx, ready_rx) = oneshot::channel();
    tauri::async_runtime::spawn(async move {
        let mut ready = Some(ready_tx);
        let mut provider_error = String::new();
        while let Some(event) = events.recv().await {
            match event {
                CommandEvent::Stdout(bytes) => {
                    let Ok(msg) = serde_json::from_slice::<Value>(&bytes) else {
                        continue;
                    };
                    match msg["type"].as_str() {
                        Some("ready") => {
                            if let Some(tx) = ready.take() {
                                let _ =
                                    tx.send(msg["port"].as_u64().filter(|p| *p > 0 && *p <= 65535));
                            }
                        }
                        Some("provider-error") => {
                            if let Some(code) = msg["code"]
                                .as_str()
                                .filter(|code| ["KEY_REJECTED", "ACCESS_DENIED"].contains(code))
                            {
                                if code != provider_error {
                                    provider_error = code.to_owned();
                                    let _ = handle.emit("provider-error", code);
                                }
                            }
                        }
                        Some("notification") => {
                            let notification = msg.clone();
                            // Await the OS API result before acknowledging durable delivery.
                            // The Tauri notification plugin currently discards that result.
                            let ok = tauri::async_runtime::spawn_blocking(move || {
                                native_notification(&notification)
                            })
                            .await
                            .unwrap_or(false);
                            let ack = format!(
                                "{}\n",
                                json!({ "type": "notification-result", "id": msg["id"], "ok": ok })
                            );
                            if let Some(child) = child.lock().unwrap().as_mut() {
                                let _ = child.write(ack.as_bytes());
                            }
                        }
                        _ => {}
                    }
                }
                CommandEvent::Terminated(_) | CommandEvent::Error(_) => break,
                // Never forward raw logs to the webview: credentials must stay private.
                _ => {}
            }
        }
        if running_alive.swap(false, Ordering::SeqCst) {
            let _ = handle.emit("backend-exited", ());
        }
    });
    match tokio::time::timeout(Duration::from_secs(20), ready_rx).await {
        Ok(Ok(Some(port))) => context.api_base = format!("http://127.0.0.1:{port}"),
        _ => {
            alive.store(false, Ordering::SeqCst);
            stop_child(app);
            return Err("BACKEND_FAILED".into());
        }
    }
    Ok(Running { context, alive })
}

fn native_notification(msg: &Value) -> bool {
    let mut notification = notify_rust::Notification::new();
    notification
        .summary(msg["title"].as_str().unwrap_or("GEX Cockpit"))
        .body(msg["body"].as_str().unwrap_or(""));
    let sound = msg["sound"].as_str().unwrap_or("off");
    #[cfg(target_os = "macos")]
    {
        if notify_rust::set_application(SERVICE).is_err() {
            return false;
        }
        match sound {
            "ping" => {
                notification.sound_name("Ping");
            }
            "chime" => {
                notification.sound_name("Glass");
            }
            "blip" => {
                notification.sound_name("Pop");
            }
            _ => {}
        }
    }
    #[cfg(windows)]
    {
        notification.app_id(SERVICE);
        match sound {
            "ping" => {
                notification.sound_name("Default");
            }
            "chime" => {
                notification.sound_name("IM");
            }
            "blip" => {
                notification.sound_name("Mail");
            }
            _ => {}
        }
    }
    notification.show().is_ok()
}

#[tauri::command]
async fn desktop_context(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
) -> Result<Context, String> {
    let mut backend = state.backend.lock().await;
    if let Some(running) = backend.as_ref().filter(|b| b.alive.load(Ordering::SeqCst)) {
        return Ok(running.context.clone());
    }
    stop_child(&app);
    let Some(key) = stored_key()? else {
        return empty_context(&app);
    };
    let running = start_backend(&app, &key).await?;
    let context = running.context.clone();
    *backend = Some(running);
    Ok(context)
}

fn key_status(status: u16) -> Result<(), String> {
    match status {
        200 => Ok(()),
        401 => Err("KEY_REJECTED".into()),
        403 => Err("ACCESS_DENIED".into()),
        429 => Err("RATE_LIMITED".into()),
        _ => Err("PROVIDER_UNAVAILABLE".into()),
    }
}
async fn validate_key(key: &str) -> Result<(), String> {
    validate_key_at(key, "https://api.gex.bot/v2").await
}
async fn validate_key_at(key: &str, base: &str) -> Result<(), String> {
    if key.trim().is_empty() || key.len() > 1024 || key.chars().any(char::is_control) {
        return Err("KEY_REJECTED".into());
    }
    let http = reqwest::Client::builder()
        .user_agent("gex-cockpit/0.3.0 (desktop)")
        .timeout(Duration::from_secs(12))
        .redirect(reqwest::redirect::Policy::none())
        .build()
        .map_err(|_| "PROVIDER_UNAVAILABLE")?;
    for ticker in ["NDX", "QQQ"] {
        for feed in ["state/gex_zero", "classic/gex_full"] {
            let response = http
                .get(format!("{base}/{ticker}/{feed}"))
                .bearer_auth(key)
                .send()
                .await
                .map_err(|_| "PROVIDER_UNAVAILABLE")?;
            key_status(response.status().as_u16())?;
            let body: Value = response.json().await.map_err(|_| "PROVIDER_UNAVAILABLE")?;
            if !body["spot"].is_number() || !body["timestamp"].is_number() {
                return Err("PROVIDER_UNAVAILABLE".into());
            }
        }
    }
    Ok(())
}

#[tauri::command]
async fn save_key(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
    key: String,
) -> Result<(), String> {
    let mut backend = state.backend.lock().await;
    let key = key.trim();
    // Failed validation cannot replace a working saved key or interrupt its backend.
    validate_key(key).await?;
    credential()?
        .set_password(key)
        .map_err(|_| "KEYCHAIN_UNAVAILABLE")?;
    if let Some(previous) = backend.take() {
        previous.alive.store(false, Ordering::SeqCst);
    }
    stop_child(&app);
    *backend = Some(start_backend(&app, key).await?);
    Ok(())
}

#[tauri::command]
fn open_link(app: tauri::AppHandle, url: String) -> Result<(), String> {
    let parsed = tauri::Url::parse(&url).map_err(|_| "Link unavailable")?;
    let allowed = parsed.scheme() == "https"
        && parsed.username().is_empty()
        && parsed.password().is_none()
        && parsed.port().is_none()
        && match parsed.host_str() {
            Some("www.gexbot.com" | "www.tradingview.com") => parsed.path() == "/",
            Some("github.com") => parsed.path() == "/nicolasgomeztoua/gex-cockpit/releases",
            _ => false,
        };
    if !allowed {
        return Err("Link unavailable".into());
    }
    app.opener()
        .open_url(url, None::<&str>)
        .map_err(|_| "Link unavailable".into())
}

#[tauri::command]
async fn check_update(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
) -> Result<Value, String> {
    let mut pending = state.update.lock().await;
    *pending = None;
    let http = reqwest::Client::builder()
        .user_agent("gex-cockpit/0.3.0 (desktop)")
        .timeout(Duration::from_secs(15))
        .build()
        .map_err(|_| "UPDATE_FAILED")?;
    let status = http
        .head(UPDATE_URL)
        .send()
        .await
        .map_err(|_| "UPDATE_FAILED")?
        .status();
    if status.as_u16() == 404 {
        return Ok(json!({ "unpublished": true }));
    }
    if !status.is_success() {
        return Err("UPDATE_FAILED".into());
    }
    let update = app
        .updater()
        .map_err(|_| "UPDATE_FAILED")?
        .check()
        .await
        .map_err(|_| "UPDATE_FAILED")?;
    let result = json!({ "version": update.as_ref().map(|u| u.version.clone()) });
    *pending = update;
    Ok(result)
}

#[tauri::command]
async fn install_update(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
) -> Result<(), String> {
    let update = state.update.lock().await.take().ok_or("UPDATE_FAILED")?;
    // Download and signature verification finish before interrupting collection.
    let bytes = update
        .download(|_, _| {}, || {})
        .await
        .map_err(|_| "UPDATE_FAILED")?;
    let mut backend = state.backend.lock().await;
    if let Some(running) = backend.take() {
        running.alive.store(false, Ordering::SeqCst);
    }
    stop_child(&app);
    if update.install(bytes).is_err() {
        drop(backend);
        let _ = desktop_context(app.clone(), state).await;
        return Err("UPDATE_FAILED".into());
    }
    app.restart();
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _, _| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.unminimize();
                let _ = window.show();
                let _ = window.set_focus();
            }
        }))
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .manage(AppState::default())
        .invoke_handler(tauri::generate_handler![
            desktop_context,
            save_key,
            open_link,
            check_update,
            install_update
        ])
        .on_window_event(|window, event| {
            if matches!(event, tauri::WindowEvent::Destroyed) {
                window.app_handle().exit(0);
            }
        })
        .build(tauri::generate_context!())
        .expect("Could not open GEX Cockpit")
        .run(|app, event| {
            if matches!(event, tauri::RunEvent::Exit) {
                stop_child(app);
            }
        });
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::{Read, Write};

    fn provider(
        responses: Vec<(u16, &'static str)>,
    ) -> (String, std::thread::JoinHandle<Vec<String>>) {
        let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
        let base = format!("http://{}", listener.local_addr().unwrap());
        listener.set_nonblocking(true).unwrap();
        let worker = std::thread::spawn(move || {
            let mut requests = Vec::new();
            let deadline = std::time::Instant::now() + Duration::from_secs(10);
            for (status, body) in responses {
                let mut connection = loop {
                    if let Ok((connection, _)) = listener.accept() {
                        break connection;
                    }
                    assert!(
                        std::time::Instant::now() < deadline,
                        "Provider request never arrived"
                    );
                    std::thread::sleep(Duration::from_millis(5));
                };
                // Windows inherits the listener's nonblocking mode on accepted sockets.
                connection.set_nonblocking(false).unwrap();
                connection
                    .set_read_timeout(Some(Duration::from_secs(3)))
                    .unwrap();
                let mut bytes = [0u8; 4096];
                let mut request = String::new();
                while !request.contains("\r\n\r\n") {
                    let count = connection.read(&mut bytes).unwrap();
                    assert!(count > 0);
                    request.push_str(&String::from_utf8_lossy(&bytes[..count]));
                }
                requests.push(request);
                write!(connection, "HTTP/1.1 {status} Response\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\nLocation: http://127.0.0.1:1/do-not-follow\r\n\r\n{body}", body.len()).unwrap();
            }
            requests
        });
        (base, worker)
    }

    #[test]
    fn checks_both_required_packages_for_both_tickers_with_provider_headers() {
        let (base, worker) = provider(vec![(200, r#"{"spot":123,"timestamp":123}"#); 4]);
        assert!(tauri::async_runtime::block_on(validate_key_at("test-key", &base)).is_ok());
        let requests = worker.join().unwrap();
        for (request, path) in requests.iter().zip([
            "NDX/state/gex_zero",
            "NDX/classic/gex_full",
            "QQQ/state/gex_zero",
            "QQQ/classic/gex_full",
        ]) {
            assert!(request.contains(&format!("GET /{path} ")));
            assert!(request
                .to_lowercase()
                .contains("authorization: bearer test-key"));
            assert!(request.to_lowercase().contains("user-agent: gex-cockpit/"));
        }
    }

    #[test]
    fn rejects_auth_errors_invalid_payloads_and_redirects_without_exposing_bodies() {
        for (status, body, expected) in [
            (401, "private provider response", "KEY_REJECTED"),
            (403, "", "ACCESS_DENIED"),
            (429, "", "RATE_LIMITED"),
            (302, "", "PROVIDER_UNAVAILABLE"),
            (200, "{}", "PROVIDER_UNAVAILABLE"),
        ] {
            let (base, worker) = provider(vec![(status, body)]);
            assert_eq!(
                tauri::async_runtime::block_on(validate_key_at("test-key", &base)).unwrap_err(),
                expected
            );
            assert_eq!(worker.join().unwrap().len(), 1);
        }
    }
}
