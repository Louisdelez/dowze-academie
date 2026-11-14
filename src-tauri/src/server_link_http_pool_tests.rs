//! Actual exchange_scoped HTTP/1.1 tests. Only a disposable loopback listener;
//! no vault, live API, synthetic authentication shortcut or external service.
use super::*;
use std::{
    collections::BTreeMap,
    io::{Read, Write},
    net::{TcpListener, TcpStream},
    sync::{atomic::{AtomicBool, Ordering}, Arc},
    thread::{self, JoinHandle},
    time::{Duration, Instant},
};

#[derive(Debug)]
struct Observed {
    connection: usize,
    method: String,
    path: String,
    headers: BTreeMap<String, String>,
    body: Vec<u8>,
}
struct Connection { stream: TcpStream, bytes: Vec<u8>, id: usize, closed: bool }
struct Fixture {
    origin: String,
    stop: Arc<AtomicBool>,
    original: Option<JoinHandle<Result<Vec<Observed>, String>>>,
}
impl Fixture {
    fn start(redirect: bool) -> Self {
        let listener = TcpListener::bind("127.0.0.1:0").expect("private loopback bind");
        listener.set_nonblocking(true).unwrap();
        let origin = format!("http://{}", listener.local_addr().unwrap());
        let stop = Arc::new(AtomicBool::new(false));
        let stopped = stop.clone();
        let original = thread::spawn(move || {
            let deadline = Instant::now() + Duration::from_secs(15);
            let mut connections: Vec<Connection> = Vec::new();
            let mut observed = Vec::new();
            while !stopped.load(Ordering::Acquire) {
                if Instant::now() >= deadline { return Err("loopback fixture deadline".into()); }
                loop {
                    match listener.accept() {
                        Ok((stream, address)) => {
                            if !address.ip().is_loopback() || connections.len() >= 8 {
                                return Err("closed loopback connection bound".into());
                            }
                            stream.set_nonblocking(true).map_err(|_| "nonblocking stream")?;
                            let id = connections.len();
                            connections.push(Connection { stream, bytes: Vec::new(), id, closed: false });
                        }
                        Err(error) if error.kind() == std::io::ErrorKind::WouldBlock => break,
                        Err(_) => return Err("loopback accept".into()),
                    }
                }
                for connection in &mut connections {
                    if connection.closed { continue; }
                    let mut block = [0_u8; 4096];
                    match connection.stream.read(&mut block) {
                        Ok(0) => { connection.closed = true; continue; }
                        Ok(size) => connection.bytes.extend_from_slice(&block[..size]),
                        Err(error) if error.kind() == std::io::ErrorKind::WouldBlock => continue,
                        Err(error) if error.kind() == std::io::ErrorKind::ConnectionReset => {
                            connection.closed = true; continue;
                        }
                        Err(_) => return Err("loopback read".into()),
                    }
                    if connection.bytes.len() > 16 * 1024 { return Err("request fixture cap".into()); }
                    let Some(end) = connection.bytes.windows(4).position(|part| part == b"\r\n\r\n") else { continue; };
                    let head = std::str::from_utf8(&connection.bytes[..end]).map_err(|_| "HTTP header UTF8")?;
                    let mut lines = head.split("\r\n");
                    let first: Vec<_> = lines.next().ok_or("request line")?.split(' ').collect();
                    if first.len() != 3 || first[2] != "HTTP/1.1" { return Err("HTTP/1.1 fixture request".into()); }
                    let method = first[0].to_owned();
                    let path = first[1].to_owned();
                    let mut headers = BTreeMap::new();
                    for line in lines {
                        let (key, value) = line.split_once(':').ok_or("HTTP header")?;
                        if headers.insert(key.to_ascii_lowercase(), value.trim().to_owned()).is_some() {
                            return Err("duplicate fixture header".into());
                        }
                    }
                    let length = headers.get("content-length").map(|value| value.parse::<usize>()).transpose().map_err(|_| "content length")?.unwrap_or(0);
                    if length > 4096 || headers.contains_key("transfer-encoding") { return Err("bounded exact HTTP body".into()); }
                    let used = end + 4 + length;
                    if connection.bytes.len() < used { continue; }
                    let body = connection.bytes[end + 4..used].to_vec();
                    connection.bytes.drain(..used);
                    let is_redirect = redirect && path == "/v1/me";
                    observed.push(Observed { connection: connection.id, method, path, headers, body });
                    if observed.len() > 8 { return Err("bounded fixture request count".into()); }
                    let response_body = b"{\"version\":1}";
                    let status = if is_redirect { "302 Found" } else { "200 OK" };
                    let location = if is_redirect { "Location: /v1/catalog\r\n" } else { "" };
                    // Never a real session. A persistent cookie jar would wrongly
                    // forward this on the following request without an explicit Session.
                    let injected = if observed.len() == 1 { "Set-Cookie: injected_cookie=must_not_replay; Path=/\r\n" } else { "" };
                    let header = format!("HTTP/1.1 {status}\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: keep-alive\r\n{location}{injected}\r\n", response_body.len());
                    connection.stream.set_nonblocking(false).map_err(|_| "response blocking")?;
                    connection.stream.set_write_timeout(Some(Duration::from_secs(1))).map_err(|_| "response deadline")?;
                    connection.stream.write_all(header.as_bytes()).and_then(|_| connection.stream.write_all(response_body)).map_err(|_| "exact fixture response")?;
                    connection.stream.set_nonblocking(true).map_err(|_| "response nonblocking")?;
                }
                thread::sleep(Duration::from_millis(2));
            }
            // Dropping these exact accepted sockets and listener closes all
            // owned endpoints before this original thread becomes terminal.
            drop(connections);
            drop(listener);
            Ok(observed)
        });
        Self { origin, stop, original: Some(original) }
    }
    fn finish(&mut self) -> Result<Vec<Observed>, String> {
        self.stop.store(true, Ordering::Release);
        self.original.take().ok_or("fixture original already joined")?.join().map_err(|_| "fixture original panicked")?
    }
}
impl Drop for Fixture {
    fn drop(&mut self) {
        if self.original.is_some() { let _ = self.finish(); }
    }
}

#[test]
fn pooled_http_reuses_connection_without_carrying_account_cookies_or_csrf() {
    let mut fixture = Fixture::start(false);
    let origin = fixture.origin.clone();
    let replies = tauri::async_runtime::block_on(async {
        let a = Session { token: "SyntheticTokenAccountA".into(), csrf: "SyntheticCsrfAccountA".into() };
        let b = Session { token: "SyntheticTokenAccountB".into(), csrf: "SyntheticCsrfAccountB".into() };
        let first = exchange_scoped(&origin, "PUT", "/v1/spaces/annual-a/documents/preferences/a", Some(json!({"account":"a"})), Some(&a), Some("mutation-a"), Some("actor-a")).await?;
        let second = exchange_scoped(&origin, "PUT", "/v1/spaces/annual-b/documents/preferences/b", Some(json!({"account":"b"})), Some(&b), Some("mutation-b"), Some("actor-b")).await?;
        let third = exchange_scoped(&origin, "GET", "/v1/me", None, None, None, None).await?;
        Ok::<_, String>([first, second, third])
    });
    // Join the real listener original before checking any result assertion.
    let requests = fixture.finish().expect("all loopback originals terminal");
    let replies = replies.expect("actual reqwest exchange");
    assert!(replies.iter().all(|reply| reply.0 == 200 && reply.1 == json!({"version":1}) && reply.2.is_none()));
    assert_eq!(requests.len(), 3);
    assert_eq!(requests[0].connection, requests[1].connection, "separate accounts reuse one actual TCP connection");
    assert_eq!(requests[1].connection, requests[2].connection);
    for (index, account) in ["a", "b"].into_iter().enumerate() {
        let request = &requests[index];
        assert_eq!(request.method, "PUT");
        assert_eq!(request.path, format!("/v1/spaces/annual-{account}/documents/preferences/{account}"));
        assert_eq!(request.headers.get("origin"), Some(&origin));
        assert_eq!(request.headers.get("x-dowze-account"), Some(&format!("actor-{account}")));
        assert_eq!(request.headers.get("x-idempotency-key"), Some(&format!("mutation-{account}")));
        assert_eq!(serde_json::from_slice::<Value>(&request.body).unwrap(), json!({"account":account}));
    }
    assert_eq!(requests[0].headers.get("cookie").map(String::as_str), Some("dowze_session=SyntheticTokenAccountA"));
    assert_eq!(requests[1].headers.get("cookie").map(String::as_str), Some("dowze_session=SyntheticTokenAccountB"));
    assert_eq!(requests[0].headers.get("x-csrf-token").map(String::as_str), Some("SyntheticCsrfAccountA"));
    assert_eq!(requests[1].headers.get("x-csrf-token").map(String::as_str), Some("SyntheticCsrfAccountB"));
    let anonymous = &requests[2];
    assert_eq!(anonymous.method, "GET");
    assert_eq!(anonymous.path, "/v1/me");
    for header in ["cookie", "x-csrf-token", "x-dowze-account", "x-idempotency-key", "authorization", "proxy-authorization"] {
        assert!(!anonymous.headers.contains_key(header), "no implicit credential header: {header}");
    }
}

#[test]
fn pooled_http_preserves_redirect_none() {
    let mut fixture = Fixture::start(true);
    let reply = tauri::async_runtime::block_on(exchange_scoped(&fixture.origin, "GET", "/v1/me", None, None, None, None));
    let requests = fixture.finish().expect("redirect fixture originals terminal");
    let reply = reply.expect("actual redirect response is returned");
    assert_eq!(reply.0, 302);
    assert_eq!(reply.1, json!({"version":1}));
    assert!(reply.2.is_none());
    assert_eq!(requests.len(), 1, "no follow-up request to Location");
    assert_eq!(requests[0].path, "/v1/me");
}
