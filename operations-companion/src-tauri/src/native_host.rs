use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::{
    collections::HashMap,
    env, fs,
    io::{self, BufRead, BufReader, Read, Write},
    net::{Shutdown, TcpListener, TcpStream},
    path::PathBuf,
    sync::{mpsc, Arc, Mutex},
    thread,
    time::Duration,
};
use uuid::Uuid;

pub const NATIVE_HOST_NAME: &str = "com.leshuazf.operations_companion";
const BRIDGE_PORT: u16 = 46127;
const RESPONSE_TIMEOUT: Duration = Duration::from_secs(180);

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DesktopOperation {
    pub action: String,
    pub merchant_id: String,
    pub business_line: Option<String>,
    pub report_type: Option<String>,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BridgeResponse {
    pub ok: bool,
    pub message: String,
    pub copied: Option<bool>,
}

#[derive(Deserialize)]
struct BridgeRequest {
    token: String,
    operation: DesktopOperation,
}

#[derive(Deserialize)]
struct NativeResult {
    #[serde(rename = "type")]
    message_type: String,
    request_id: String,
    ok: bool,
    message: String,
    copied: Option<bool>,
}

fn bridge_directory() -> PathBuf {
    #[cfg(target_os = "windows")]
    {
        return PathBuf::from(env::var("APPDATA").unwrap_or_else(|_| ".".to_string()))
            .join("运营工具");
    }
    #[cfg(target_os = "macos")]
    {
        return PathBuf::from(env::var("HOME").unwrap_or_else(|_| ".".to_string()))
            .join("Library/Application Support/运营工具");
    }
    #[allow(unreachable_code)]
    PathBuf::from(env::var("HOME").unwrap_or_else(|_| ".".to_string())).join(".运营工具")
}

fn token_path() -> PathBuf {
    bridge_directory().join("native-bridge-token")
}

pub fn bridge_token() -> Result<String, String> {
    let directory = bridge_directory();
    fs::create_dir_all(&directory).map_err(|error| error.to_string())?;
    let path = token_path();
    if let Ok(token) = fs::read_to_string(&path) {
        let token = token.trim().to_string();
        if !token.is_empty() {
            return Ok(token);
        }
    }
    let token = Uuid::new_v4().to_string();
    fs::write(&path, &token).map_err(|error| error.to_string())?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let _ = fs::set_permissions(&path, fs::Permissions::from_mode(0o600));
    }
    Ok(token)
}

fn native_manifest_path() -> Result<PathBuf, String> {
    #[cfg(target_os = "macos")]
    {
        let home = env::var("HOME").map_err(|error| error.to_string())?;
        return Ok(PathBuf::from(home).join(
            "Library/Application Support/Google/Chrome/NativeMessagingHosts/com.leshuazf.operations_companion.json",
        ));
    }
    #[cfg(target_os = "windows")]
    {
        return Ok(bridge_directory().join("com.leshuazf.operations_companion.json"));
    }
    #[allow(unreachable_code)]
    Ok(bridge_directory().join("com.leshuazf.operations_companion.json"))
}

pub fn register_native_host() -> Result<(), String> {
    bridge_token()?;
    let manifest_path = native_manifest_path()?;
    let parent = manifest_path
        .parent()
        .ok_or_else(|| "Native Host 配置目录无效".to_string())?;
    fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    let executable = env::current_exe().map_err(|error| error.to_string())?;
    let manifest = json!({
        "name": NATIVE_HOST_NAME,
        "description": "运营工具快捷菜单与 Chrome 插件通信桥接",
        "path": executable,
        "type": "stdio",
        "allowed_origins": ["chrome-extension://mcimgfeelkjaeonopegodhlcopniajbo/"]
    });
    fs::write(
        &manifest_path,
        serde_json::to_vec_pretty(&manifest).map_err(|error| error.to_string())?,
    )
    .map_err(|error| error.to_string())?;

    #[cfg(target_os = "windows")]
    {
        use winreg::{enums::HKEY_CURRENT_USER, RegKey};
        let hkcu = RegKey::predef(HKEY_CURRENT_USER);
        let (key, _) = hkcu
            .create_subkey(format!(
                "Software\\Google\\Chrome\\NativeMessagingHosts\\{}",
                NATIVE_HOST_NAME
            ))
            .map_err(|error| error.to_string())?;
        key.set_value("", &manifest_path.to_string_lossy().to_string())
            .map_err(|error| error.to_string())?;
    }
    Ok(())
}

pub fn execute_operation(operation: DesktopOperation) -> Result<BridgeResponse, String> {
    let token = bridge_token()?;
    let mut stream = TcpStream::connect_timeout(
        &format!("127.0.0.1:{BRIDGE_PORT}")
            .parse()
            .map_err(|error: std::net::AddrParseError| error.to_string())?,
        Duration::from_secs(2),
    )
    .map_err(|_| {
        "未连接 Chrome 插件。请确认 Chrome 已启动，且“运营工具”插件已启用。".to_string()
    })?;
    stream
        .set_read_timeout(Some(RESPONSE_TIMEOUT))
        .map_err(|error| error.to_string())?;
    let payload = serde_json::to_string(&json!({ "token": token, "operation": operation }))
        .map_err(|error| error.to_string())?;
    stream
        .write_all(format!("{payload}\n").as_bytes())
        .map_err(|error| error.to_string())?;
    let _ = stream.shutdown(Shutdown::Write);
    let mut line = String::new();
    BufReader::new(stream)
        .read_line(&mut line)
        .map_err(|error| error.to_string())?;
    if line.trim().is_empty() {
        return Err("Chrome 插件未返回执行结果".to_string());
    }
    serde_json::from_str(&line).map_err(|error| format!("解析插件执行结果失败: {error}"))
}

fn write_native_message(value: &Value) -> io::Result<()> {
    let payload = serde_json::to_vec(value)?;
    let mut stdout = io::stdout().lock();
    stdout.write_all(&(payload.len() as u32).to_le_bytes())?;
    stdout.write_all(&payload)?;
    stdout.flush()
}

fn read_native_message(reader: &mut impl Read) -> io::Result<Option<Value>> {
    let mut length = [0_u8; 4];
    match reader.read_exact(&mut length) {
        Ok(()) => {}
        Err(error) if error.kind() == io::ErrorKind::UnexpectedEof => return Ok(None),
        Err(error) => return Err(error),
    }
    let mut payload = vec![0_u8; u32::from_le_bytes(length) as usize];
    reader.read_exact(&mut payload)?;
    serde_json::from_slice(&payload)
        .map(Some)
        .map_err(io::Error::other)
}

fn write_bridge_response(stream: &mut TcpStream, response: BridgeResponse) {
    if let Ok(payload) = serde_json::to_string(&response) {
        let _ = stream.write_all(format!("{payload}\n").as_bytes());
        let _ = stream.flush();
    }
}

fn handle_bridge_connection(
    mut stream: TcpStream,
    token: &str,
    outgoing: mpsc::Sender<Value>,
    pending: Arc<Mutex<HashMap<String, mpsc::Sender<NativeResult>>>>,
) {
    let mut line = String::new();
    if BufReader::new(&mut stream).read_line(&mut line).is_err() {
        return;
    }
    let request: BridgeRequest = match serde_json::from_str(&line) {
        Ok(request) => request,
        Err(_) => {
            write_bridge_response(
                &mut stream,
                BridgeResponse {
                    ok: false,
                    message: "桌面请求格式无效".to_string(),
                    copied: None,
                },
            );
            return;
        }
    };
    if request.token != token {
        write_bridge_response(
            &mut stream,
            BridgeResponse {
                ok: false,
                message: "桌面工具身份校验失败".to_string(),
                copied: None,
            },
        );
        return;
    }
    let request_id = Uuid::new_v4().to_string();
    let (result_sender, result_receiver) = mpsc::channel();
    pending
        .lock()
        .expect("pending lock poisoned")
        .insert(request_id.clone(), result_sender);
    let command = json!({
        "type": "operations-companion.execute",
        "requestId": request_id,
        "action": request.operation.action,
        "merchantId": request.operation.merchant_id,
        "businessLine": request.operation.business_line,
        "reportType": request.operation.report_type,
    });
    if outgoing.send(command).is_err() {
        pending
            .lock()
            .expect("pending lock poisoned")
            .remove(&request_id);
        write_bridge_response(
            &mut stream,
            BridgeResponse {
                ok: false,
                message: "Chrome 插件连接已断开".to_string(),
                copied: None,
            },
        );
        return;
    }
    match result_receiver.recv_timeout(RESPONSE_TIMEOUT) {
        Ok(result) => write_bridge_response(
            &mut stream,
            BridgeResponse {
                ok: result.ok,
                message: result.message,
                copied: result.copied,
            },
        ),
        Err(_) => {
            pending
                .lock()
                .expect("pending lock poisoned")
                .remove(&request_id);
            write_bridge_response(
                &mut stream,
                BridgeResponse {
                    ok: false,
                    message: "等待 Chrome 插件执行结果超时".to_string(),
                    copied: None,
                },
            );
        }
    }
}

pub fn run() {
    let token = match bridge_token() {
        Ok(token) => token,
        Err(_) => return,
    };
    let listener = match TcpListener::bind(("127.0.0.1", BRIDGE_PORT)) {
        Ok(listener) => listener,
        Err(_) => return,
    };
    let pending = Arc::new(Mutex::new(
        HashMap::<String, mpsc::Sender<NativeResult>>::new(),
    ));
    let (outgoing_sender, outgoing_receiver) = mpsc::channel::<Value>();
    let pending_for_input = Arc::clone(&pending);
    thread::spawn(move || {
        let mut stdin = io::stdin().lock();
        while let Ok(Some(value)) = read_native_message(&mut stdin) {
            let parsed: Result<NativeResult, _> = serde_json::from_value(value);
            if let Ok(result) = parsed {
                if result.message_type == "operations-companion.result" {
                    if let Some(sender) = pending_for_input
                        .lock()
                        .expect("pending lock poisoned")
                        .remove(&result.request_id)
                    {
                        let _ = sender.send(result);
                    }
                }
            }
        }
    });
    let outgoing_for_server = outgoing_sender.clone();
    let pending_for_server = Arc::clone(&pending);
    thread::spawn(move || {
        for stream in listener.incoming().flatten() {
            let token = token.clone();
            let outgoing = outgoing_for_server.clone();
            let pending = Arc::clone(&pending_for_server);
            thread::spawn(move || handle_bridge_connection(stream, &token, outgoing, pending));
        }
    });
    for message in outgoing_receiver {
        if write_native_message(&message).is_err() {
            break;
        }
    }
}
