use std::io::{Read, Write};
use std::net::TcpListener;
use serde::Serialize;
use std::sync::Mutex;
use std::collections::HashMap;

static LISTENERS: std::sync::LazyLock<Mutex<HashMap<u16, TcpListener>>> =
    std::sync::LazyLock::new(|| Mutex::new(HashMap::new()));

#[derive(Clone, Serialize)]
pub struct OAuthCallbackResult {
    pub code: String,
}

/// Bind a loopback server on a random port and return the port number.
/// The listener is stored internally for later use by `oauth_wait_callback`.
#[tauri::command]
pub fn oauth_get_port() -> Result<u16, String> {
    let listener = TcpListener::bind("127.0.0.1:0")
        .map_err(|e| format!("포트 바인딩 실패: {}", e))?;
    let port = listener
        .local_addr()
        .map_err(|e| e.to_string())?
        .port();

    LISTENERS
        .lock()
        .map_err(|e| e.to_string())?
        .insert(port, listener);

    println!("[OAuth] Loopback server bound on port {}", port);
    Ok(port)
}

/// Wait for the OAuth callback on the given port.
/// Blocks until the authorization code is received or 120 seconds timeout.
#[tauri::command]
pub async fn oauth_wait_callback(port: u16) -> Result<OAuthCallbackResult, String> {
    let listener = {
        LISTENERS
            .lock()
            .map_err(|e| e.to_string())?
            .remove(&port)
            .ok_or_else(|| format!("포트 {}에 대한 서버가 없습니다", port))?
    };

    let (tx, rx) = std::sync::mpsc::channel::<Result<OAuthCallbackResult, String>>();

    std::thread::spawn(move || {
        let result = handle_oauth_callback(listener, port);
        let _ = tx.send(result);
    });

    rx.recv_timeout(std::time::Duration::from_secs(120))
        .map_err(|_| {
            "인증 시간이 초과되었습니다 (120초). 다시 시도해주세요.".to_string()
        })?
}

/// Cancel a pending OAuth server and clean up the stored listener.
#[tauri::command]
pub fn oauth_cancel(port: u16) -> Result<(), String> {
    LISTENERS
        .lock()
        .map_err(|e| e.to_string())?
        .remove(&port);
    println!("[OAuth] Server on port {} cancelled", port);
    Ok(())
}

fn handle_oauth_callback(
    listener: TcpListener,
    port: u16,
) -> Result<OAuthCallbackResult, String> {
    listener
        .set_nonblocking(false)
        .map_err(|e| e.to_string())?;

    let (mut stream, _) = listener
        .accept()
        .map_err(|e| format!("연결 수락 실패: {}", e))?;

    stream
        .set_read_timeout(Some(std::time::Duration::from_secs(5)))
        .ok();

    let mut buf = [0u8; 4096];
    let n = stream
        .read(&mut buf)
        .map_err(|e| format!("요청 읽기 실패: {}", e))?;
    let request = String::from_utf8_lossy(&buf[..n]);

    let code = extract_code(&request)?;

    let html = concat!(
        "<!DOCTYPE html><html><head><meta charset=\"utf-8\"><title>DocuMind</title>",
        "<style>",
        "body{font-family:-apple-system,BlinkMacSystemFont,sans-serif;display:flex;",
        "justify-content:center;align-items:center;height:100vh;margin:0;background:#f8f9fa}",
        ".c{text-align:center;padding:40px;border-radius:12px;background:#fff;",
        "box-shadow:0 2px 8px rgba(0,0,0,.1)}",
        "h1{color:#16a34a;font-size:24px;margin:0 0 8px}",
        "p{color:#6b7280;font-size:14px;margin:0}",
        "</style></head><body><div class=\"c\">",
        "<h1>&#10003; 인증 성공!</h1>",
        "<p>DocuMind 앱으로 돌아가주세요.<br>이 창은 닫아도 됩니다.</p>",
        "</div></body></html>"
    );

    let response = format!(
        "HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
        html.len(),
        html
    );
    stream.write_all(response.as_bytes()).ok();
    stream.flush().ok();
    drop(stream);
    drop(listener);

    println!("[OAuth] Authorization code received on port {}", port);
    Ok(OAuthCallbackResult { code })
}

fn extract_code(request: &str) -> Result<String, String> {
    let first_line = request.lines().next().unwrap_or("");

    // Check for OAuth error response
    if first_line.contains("error=") {
        let error = first_line
            .split("error=")
            .nth(1)
            .and_then(|s| s.split(['&', ' ']).next())
            .unwrap_or("unknown");
        return Err(format!("Google 인증이 거부되었습니다: {}", error));
    }

    // Extract the authorization code from the query string
    let code = first_line
        .split("code=")
        .nth(1)
        .and_then(|s| s.split(['&', ' ']).next())
        .ok_or_else(|| "인증 코드를 찾을 수 없습니다.".to_string())?;

    Ok(percent_decode(code))
}

fn percent_decode(input: &str) -> String {
    let mut result = Vec::new();
    let bytes = input.as_bytes();
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%' && i + 2 < bytes.len() {
            if let Ok(byte) =
                u8::from_str_radix(&String::from_utf8_lossy(&bytes[i + 1..i + 3]), 16)
            {
                result.push(byte);
                i += 3;
                continue;
            }
        }
        result.push(bytes[i]);
        i += 1;
    }
    String::from_utf8_lossy(&result).to_string()
}
