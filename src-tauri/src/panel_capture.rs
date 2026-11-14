use rand::{rngs::OsRng, RngCore};
use serde::{Deserialize, Serialize};
use std::sync::{Arc, Mutex};
use tauri::{Manager, State, Url, Webview};

use super::conversation_archive::{
    CaptureMessage, CaptureMessageState, CaptureProvider, CaptureStatus, ConversationCaptureInput,
    MessageRole,
};
use super::{AiProvider, CommandResult, AI_PANEL_LABEL};

const SNAPSHOT_SCRIPT: &str =
    r#"JSON.stringify(window.__DOWZE_CAPTURE_V1__?.snapshot(100) ?? null)"#;

pub(crate) const CAPTURE_INITIALIZATION_SCRIPT: &str = r#"
(() => {
  "use strict";
  if (window.top !== window || window.__DOWZE_CAPTURE_V1__) return;
  const provider = location.hostname === "chatgpt.com" ? "chatgpt"
    : location.hostname === "claude.ai" ? "claude" : null;
  if (!provider) return;
  const MAX_QUEUE_BYTES = 16 * 1024 * 1024, MAX_EVENTS = 10000;
  const MAX_RESPONSE_BYTES = 8 * 1024 * 1024, MAX_EVENT_BYTES = 2 * 1024 * 1024;
  const encoder = new TextEncoder(), documentId = crypto.randomUUID();
  const seed = window.__DOWZE_NATIVE_CAPTURE_SEED__;
  try { delete window.__DOWZE_NATIVE_CAPTURE_SEED__; } catch (_) {}
  const nativeToken = typeof seed?.token === "string" && /^[a-f0-9]{32}$/.test(seed.token)
    ? seed.token : null;
  let sequence = 0, queueBytes = 0, active = Boolean(nativeToken) && !seed?.paused;
  let epoch = Number.isSafeInteger(seed?.generation) ? seed.generation : 0;
  let requestSequence = 0, captureEpoch = 0, nativeStateKnown = false;
  const queue = [], latest = new Map(), gaps = new Set(), readers = new Set();
  let latestBytes = 0, inFlight = 0, nativePushInFlight = false, nativePushScheduled = false;
  const gap = reason => gaps.add(String(reason).slice(0, 160));
  const safeId = value => typeof value === "string" && /^[a-zA-Z0-9_-]{1,128}$/.test(value);
  const conversationId = () => location.pathname.match(provider === "chatgpt"
    ? /^\/c\/([a-zA-Z0-9_-]{1,128})\/?$/ : /^\/chat\/([a-zA-Z0-9_-]{1,128})\/?$/)?.[1] || null;
  const contexts = new Map();
  let pendingContext = {id:null, key:crypto.randomUUID()}, lastPath = location.pathname;
  const contextFor = (id = conversationId()) => {
    if (safeId(id)) {
      if (!contexts.has(id)) {
        if (contexts.size >= MAX_EVENTS) { gap("HISTORY_LIMIT_REACHED"); return {id, key:id}; }
        contexts.set(id, {id, key:id});
      }
      return contexts.get(id);
    }
    if (lastPath !== location.pathname || pendingContext.id) pendingContext = {id:null, key:crypto.randomUUID()};
    lastPath = location.pathname; return pendingContext;
  };
  const claimConversation = (candidate, context) => {
    if (!safeId(candidate)) return false;
    if (context.id && context.id !== candidate) { gap("CONVERSATION_MISMATCH"); return false; }
    context.id = candidate;
    if (!contexts.has(candidate) && contexts.size < MAX_EVENTS) contexts.set(candidate, context);
    return true;
  };

  const snapshotBatch = (limit=100, offset=0) => {
    const context = queue[offset]?._context || contextFor();
    const selected = [];
    for (const event of queue.slice(offset)) {
      if (event._context.id !== context.id || selected.length >= Math.max(1,Math.min(100,limit))) break;
      selected.push(event);
    }
    const events=selected.map(({_bytes,_context,...event})=>event);
    return {documentId,documentToken:nativeToken,conversationId:context.id,generation:epoch,
      cursor:events.at(-1)?.sequence||0,hasMore:queue.length>events.length,gaps:Array.from(gaps),events};
  };
  const scheduleNativePush = (delay=0) => {
    if (nativePushScheduled || nativePushInFlight || (nativeStateKnown && !queue.length)) return;
    const invoke = window.__TAURI_INTERNALS__?.invoke;
    if (typeof invoke !== "function") return;
    nativePushScheduled = true;
    const push = async () => {
      nativePushScheduled = false;
      if (nativePushInFlight || (nativeStateKnown && !queue.length)) return;
      nativePushInFlight = true;
      try {
        if (!nativeStateKnown) {
          const state = await invoke("push_ai_capture", {batch:{probe:true,documentToken:nativeToken}});
          if (!Number.isSafeInteger(state?.generation) || typeof state?.paused !== "boolean") throw new Error("NATIVE_STATE_INVALID");
          if (!nativeStateKnown) {
            epoch = state.generation;
            nativeStateKnown = true;
            active = !state.paused;
            if (!active) {
              captureEpoch++;
              for (const reader of readers) void reader.cancel().catch(() => {});
              queue.length = 0; queueBytes = 0; latest.clear(); latestBytes = 0;
              return;
            }
          }
        }
        if (!active || !queue.length) return;
        const batch = snapshotBatch(100);
        const ack = await invoke("push_ai_capture", {batch});
        if (ack?.documentId !== batch.documentId || ack?.cursor !== batch.cursor) throw new Error("NATIVE_ACK_INVALID");
        while (queue.length && queue[0].sequence <= ack.cursor) queueBytes -= queue.shift()._bytes;
        gaps.delete("NATIVE_PERSIST_RETRY");
      } catch (_) {
        gap("NATIVE_PERSIST_RETRY");
      } finally {
        nativePushInFlight = false;
        if (active && queue.length) scheduleNativePush(200);
      }
    };
    if (delay) setTimeout(push, delay); else void push();
  };

  function observe({id, role, text, parentId = null, attachments = [], source, final = false}, context = contextFor()) {
    if (!active) return false;
    if (!safeId(id) || !["user","assistant","system","tool"].includes(role) || typeof text !== "string") {
      gap("UNRECOGNIZED_MESSAGE"); return false;
    }
    attachments = Array.isArray(attachments)
      ? attachments.filter(name => typeof name === "string" && name.trim()).slice(0, 100) : [];
    const canonical = JSON.stringify({id,role,text,parentId,attachments,final});
    const key = `${context.key}|${id}`;
    const previous = latest.get(key);
    if (previous?.fingerprint === canonical) return true;
    const bytes = encoder.encode(canonical).byteLength;
    if (bytes > MAX_EVENT_BYTES || queueBytes + bytes > MAX_QUEUE_BYTES || latestBytes - (previous?.bytes || 0) + bytes > MAX_QUEUE_BYTES || queue.length >= MAX_EVENTS) {
      gap("CAPTURE_LIMIT_REACHED"); return false;
    }
    const event = {id, role, text, parentId:safeId(parentId) ? parentId : null, attachments,
      source, final:Boolean(final), version:(previous?.version || 0) + 1,
      sequence:++sequence, observedAt:new Date().toISOString(), _bytes:bytes, _context:context};
    if (!latest.has(key) && latest.size >= MAX_EVENTS) { gap("HISTORY_LIMIT_REACHED"); return false; }
    latestBytes += bytes - (previous?.bytes || 0);
    latest.set(key, {fingerprint:canonical, version:event.version, bytes});
    queue.push(event); queueBytes += bytes; scheduleNativePush(); return true;
  }
  function chatgptMessage(message, parentId = null, source = "network", final = false, context = contextFor()) {
    const parts = message?.content?.parts;
    if (!Array.isArray(parts)) { gap("CHATGPT_CONTENT_SCHEMA"); return false; }
    const text = [], attachments = [];
    for (const part of parts) {
      if (typeof part === "string") text.push(part);
      else if (part && typeof part.text === "string") text.push(part.text);
      else { gap("ATTACHMENT_CONTENT_NOT_CAPTURED"); if (part?.name) attachments.push(String(part.name)); }
    }
    return observe({id:message?.id, role:message?.author?.role, text:text.join("\n"),
      parentId, attachments, source, final}, context);
  }
  function history(payload, context) {
    if (provider === "chatgpt") {
      if (payload?.conversation_id && !claimConversation(payload.conversation_id, context)) return true;
      if (!payload?.mapping || typeof payload.mapping !== "object" || Array.isArray(payload.mapping)) return false;
      for (const node of Object.values(payload.mapping)) if (node?.message) {
        chatgptMessage(node.message, node.parent || null, "network-history", true, context);
      }
      return true;
    }
    if (payload?.uuid && !claimConversation(payload.uuid, context)) return true;
    if (!Array.isArray(payload?.chat_messages)) return false;
    for (const message of payload.chat_messages) {
      let text = message?.text;
      if (Array.isArray(message?.content)) {
        text = message.content.filter(part => part?.type === "text" && typeof part.text === "string")
          .map(part => part.text).join("\n");
        if (message.content.some(part => part?.type !== "text")) gap("CLAUDE_NON_TEXT_CONTENT");
      }
      const attachments = [...(message?.attachments || []), ...(message?.files || [])]
        .map(item => item?.file_name || item?.name).filter(name => typeof name === "string");
      if (attachments.length) gap("ATTACHMENT_CONTENT_NOT_CAPTURED");
      observe({id:message?.uuid, role:message?.sender === "human" ? "user" : message?.sender,
        text, parentId:message?.parent_message_uuid || null, attachments,
        source:"network-history", final:true}, context);
    }
    return true;
  }
  function streamPayload(payload, state, context) {
    if (provider === "chatgpt" && payload?.message) {
      if (payload.conversation_id && !claimConversation(payload.conversation_id, context)) return;
      state.lastMessage = payload.message;
      chatgptMessage(payload.message, null, "network-stream", payload.message.status === "finished_successfully", context); return;
    }
    if (provider === "claude") {
      if (payload?.type === "message_start" && safeId(payload.message?.id)) {
        state.id = payload.message.id; state.blocks = new Map(); return;
      }
      if (payload?.type === "content_block_start" && state.id && Number.isSafeInteger(payload.index)) {
        if (payload.content_block?.type !== "text") { gap("CLAUDE_NON_TEXT_CONTENT"); return; }
        state.blocks.set(payload.index, payload.content_block.text || "");
      } else if (payload?.type === "content_block_delta" && state.id && payload.delta?.type === "text_delta" && typeof payload.delta.text === "string") {
        const previous = state.blocks.get(payload.index) || "";
        if (encoder.encode(previous).byteLength + encoder.encode(payload.delta.text).byteLength > MAX_EVENT_BYTES) { gap("CAPTURE_LIMIT_REACHED"); return; }
        state.blocks.set(payload.index, previous + payload.delta.text);
      } else if (["content_block_stop", "message_delta", "message_stop", "ping"].includes(payload?.type)) {
        if (!state.id || payload.type === "ping") return;
      } else { gap("STREAM_SCHEMA_UNQUALIFIED"); return; }
      observe({id:state.id, role:"assistant", text:[...state.blocks.entries()].sort((a,b)=>a[0]-b[0]).map(item=>item[1]).join("\n"), source:"network-stream", final:payload.type === "message_stop"}, context);
      return;
    }
    gap("STREAM_SCHEMA_UNQUALIFIED");
  }
  function captureRequest(input, init, context) {
    const raw=init?.body;
    if (typeof raw !== "string" || encoder.encode(raw).byteLength > MAX_RESPONSE_BYTES) return;
    let payload; try { payload=JSON.parse(raw); } catch (_) { gap("REQUEST_FORMAT_UNKNOWN"); return; }
    if (provider === "chatgpt" && Array.isArray(payload?.messages)) {
      for (const message of payload.messages) chatgptMessage(message, null, "network-request", true, context);
      return;
    }
    if (provider === "claude" && typeof payload?.prompt === "string") {
      const attachments=(payload.attachments || []).map(item=>item?.file_name || item?.name)
        .filter(name=>typeof name === "string");
      if (attachments.length) gap("ATTACHMENT_CONTENT_NOT_CAPTURED");
      observe({id:`request-${documentId}-${++requestSequence}`,role:"user",text:payload.prompt,
        attachments,source:"network-request",final:true}, context);
      return;
    }
    gap("REQUEST_SCHEMA_UNQUALIFIED");
  }
  class SseDecoder {
    constructor(emit) {
      this.emit=emit; this.decoder=new TextDecoder("utf-8", { fatal: true });
      this.line=""; this.data=[]; this.event=""; this.id=""; this.cr=false; this.bytes=0; this.emitted=0;
    }
    push(bytes, done=false) {
      const text=this.decoder.decode(bytes,{stream:!done});
      for (const character of text) {
        if (this.cr) { this.cr=false; if (character === "\n") continue; }
        if (character === "\r" || character === "\n") { this.consumeLine(); this.cr=character === "\r"; }
        else { this.bytes += encoder.encode(character).byteLength;
          if (this.bytes > MAX_EVENT_BYTES) throw new Error("SSE_EVENT_LIMIT"); this.line += character; }
      }
      if (done && (this.line || this.data.length)) throw new Error("SSE_TRUNCATED_EVENT");
    }
    consumeLine() {
      const line=this.line; this.line="";
      if (!line) {
        if (this.data.length) { this.emit({data:this.data.join("\n"),event:this.event||"message",id:this.id}); this.emitted++; }
        this.data=[]; this.event=""; this.bytes=0; return;
      }
      if (line.startsWith(":")) return;
      const separator=line.indexOf(":"), key=separator<0?line:line.slice(0,separator);
      let value=separator<0?"":line.slice(separator+1); if (value.startsWith(" ")) value=value.slice(1);
      if (key === "data") this.data.push(value); if (key === "event") this.event=value;
      if (key === "id" && !value.includes("\0")) this.id=value;
    }
  }
  async function consumeResponse(response, requestEpoch, context) {
    const reader=response.body?.getReader(); if (!reader) { gap("NETWORK_BODY_UNAVAILABLE"); return; }
    readers.add(reader);
    const chunks=[]; let bytesRead=0;
    const streaming = (response.headers.get("content-type") || "").includes("text/event-stream");
    const streamState = {};
    const decoder=new SseDecoder(event => {
      if (event.data === "[DONE]") { if (streamState.lastMessage) chatgptMessage(streamState.lastMessage, null, "network-stream", true, context); return; }
      try { streamPayload(JSON.parse(event.data), streamState, context); } catch (_) { gap("STREAM_JSON_INVALID"); }
    });
    try {
      while (true) {
        const {value,done}=await reader.read(); if (done) break;
        if (!active || captureEpoch !== requestEpoch) {
          void reader.cancel().catch(() => {}); return;
        }
        bytesRead += value.byteLength; if (bytesRead > MAX_RESPONSE_BYTES) throw new Error("NETWORK_RESPONSE_LIMIT");
        if (streaming) decoder.push(value); else chunks.push(value);
      }
      if (!active || captureEpoch !== requestEpoch) return;
      try { if (streaming) decoder.push(new Uint8Array(),true); } catch (error) { gap(error?.message || "SSE_TRUNCATED_EVENT"); }
      if (!streaming) {
        const merged=new Uint8Array(bytesRead); let offset=0;
        for (const chunk of chunks) { merged.set(chunk,offset); offset += chunk.byteLength; }
        try { if (!history(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(merged)), context)) gap("NETWORK_SCHEMA_UNQUALIFIED"); }
        catch (_) { gap("NETWORK_FORMAT_UNKNOWN"); }
      }
    } catch (error) { gap(error?.message || "NETWORK_STREAM_INTERRUPTED"); void reader.cancel().catch(() => {}); }
    finally { readers.delete(reader); try { reader.releaseLock(); } catch (_) {} }
  }
  const nativeFetch=window.fetch;
  window.fetch=function () {
    const responsePromise=nativeFetch.apply(this, arguments);
    let target;
    try { target = new URL(typeof arguments[0] === "string" || arguments[0] instanceof URL
      ? arguments[0] : arguments[0]?.url, location.href); } catch (_) { return responsePromise; }
    const allowed = target.origin === location.origin && (provider === "chatgpt"
      ? /^\/backend-api\/conversation(?:\/[a-zA-Z0-9_-]+)?$/.test(target.pathname)
      : /^\/api\/organizations\/[a-zA-Z0-9_-]+\/chat_conversations\/[a-zA-Z0-9_-]+(?:\/completion)?$/.test(target.pathname));
    if (!active || !allowed) return responsePromise;
    const requestId = target.pathname.match(provider === "chatgpt"
      ? /^\/backend-api\/conversation\/([a-zA-Z0-9_-]+)$/
      : /\/chat_conversations\/([a-zA-Z0-9_-]+)/)?.[1];
    const context = contextFor(requestId || conversationId()), requestEpoch = captureEpoch;
    captureRequest(arguments[0], arguments[1], context);
    responsePromise.then(response => {
      if (!active || captureEpoch !== requestEpoch) return;
      if (inFlight >= 4) { gap("NETWORK_CONCURRENCY_LIMIT"); return; }
      let copy; try { copy=response.clone(); } catch (_) { gap("NETWORK_COPY_UNAVAILABLE"); return; }
      inFlight++;
      void consumeResponse(copy, requestEpoch, context).catch(() => gap("NETWORK_READ_FAILED")).finally(() => { inFlight--; });
    }).catch(() => gap("NETWORK_REQUEST_FAILED"));
    return responsePromise;
  };
  let domScheduled=false;
  function scanDom() {
    domScheduled=false;
    for (const candidate of document.querySelectorAll("[data-message-id], [data-message-author-role], [data-testid^='conversation-turn-']")) {
      const root=candidate.closest("[data-message-id], [data-testid^='conversation-turn-']") || candidate;
      const turn=(root.getAttribute("data-testid") || "").match(/^conversation-turn-([0-9]+)$/)?.[1];
      const id=root.getAttribute("data-message-id") || (turn ? `dom-${turn}` : null);
      const role=candidate.getAttribute("data-message-author-role") || root.querySelector("[data-message-author-role]")?.getAttribute("data-message-author-role");
      if (!id || !role || typeof root.textContent !== "string") continue;
      const attachments=Array.from(root.querySelectorAll("[data-testid*='attachment'], [download]"))
        .map(node => node.getAttribute("download") || node.getAttribute("aria-label")).filter(Boolean);
      observe({id,role,text:root.textContent,attachments,source:"dom",final:false}); gap("DOM_SCHEMA_UNQUALIFIED");
    }
  }
  const scheduleDomScan=() => { if (!domScheduled) { domScheduled=true; queueMicrotask(scanDom); } };
  const startObserver=() => {
    if (!document.documentElement) return;
    new MutationObserver(scheduleDomScan).observe(document.documentElement,{subtree:true,childList:true,characterData:true});
    scheduleDomScan();
  };
  if (document.documentElement) startObserver();
  else document.addEventListener("DOMContentLoaded",startObserver,{once:true});
  // Submit remaining data synchronously to IPC while the document still exists.
  // No evaluation callback or disk wait is performed inside navigation handlers.
  const flushOnPageHide = () => {
    const invoke = window.__TAURI_INTERNALS__?.invoke;
    if (!nativeStateKnown || !active || typeof invoke !== "function") return;
    for (let offset = 0; offset < queue.length;) {
      const batch = snapshotBatch(100, offset);
      if (!batch.events.length) break;
      offset += batch.events.length;
      try { void Promise.resolve(invoke("push_ai_capture", {batch})).catch(() => {}); } catch (_) {}
    }
  };
  window.addEventListener?.("pagehide", flushOnPageHide);
  scheduleNativePush();
  Object.defineProperty(window,"__DOWZE_CAPTURE_V1__",{configurable:false,enumerable:false,writable:false,
    value:Object.freeze({
      bind(nextEpoch, paused, expectedToken, preserveProvisional = false) {
        if (!nativeToken || expectedToken !== nativeToken || !Number.isSafeInteger(nextEpoch) || nextEpoch < epoch) return false;
        if (!nativeStateKnown && paused && !preserveProvisional) {
          queue.length = 0; queueBytes = 0; latest.clear(); latestBytes = 0;
        }
        nativeStateKnown = true;
        if (paused && active) {
          scheduleNativePush();
          captureEpoch++;
          for (const reader of readers) { void reader.cancel().catch(() => {}); }
        }
        epoch = nextEpoch;
        active = !paused;
        if (active) scheduleDomScan();
        return true;
      },
      snapshot(limit=100) {
        return snapshotBatch(limit);
      },
      ack(expectedDocumentId,cursor) {
        if (expectedDocumentId !== documentId || !Number.isSafeInteger(cursor) || cursor < 0) return false;
        while (queue.length && queue[0].sequence <= cursor) queueBytes -= queue.shift()._bytes;
        return true;
      }
    })});
})();
"#;

#[derive(Clone, Debug, PartialEq, Eq)]
pub(crate) struct CaptureLocation {
    pub(crate) conversation_id: String,
    pub(crate) source_url: String,
}

pub(crate) fn capture_location(url: &Url, provider: AiProvider) -> CommandResult<CaptureLocation> {
    if url.scheme() != "https"
        || !url.username().is_empty()
        || url.password().is_some()
        || url.port().is_some_and(|port| port != 443)
    {
        return Err("La capture exige une URL HTTPS sûre.".into());
    }
    let host = url
        .domain()
        .ok_or_else(|| "Domaine fournisseur absent.".to_string())?;
    let prefix = match provider {
        AiProvider::Chatgpt if host == "chatgpt.com" => "/c/",
        AiProvider::Claude if host == "claude.ai" => "/chat/",
        _ => return Err("La page ne correspond pas au fournisseur capturé.".into()),
    };
    let path = url.path().trim_end_matches('/');
    let id = path
        .strip_prefix(prefix)
        .filter(|id| {
            !id.is_empty()
                && id.len() <= 128
                && !id.contains('/')
                && id
                    .bytes()
                    .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_'))
        })
        .ok_or_else(|| "Ouvrez une conversation fournisseur reconnue.".to_string())?;
    Ok(CaptureLocation {
        conversation_id: id.into(),
        source_url: format!("https://{host}{prefix}{id}"),
    })
}

#[derive(Clone, Copy, Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub(crate) enum CaptureRuntimePhase {
    Capturing,
    Paused,
    WaitingForConversation,
    Limited,
    Unavailable,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct CaptureRuntimeStatus {
    pub(crate) generation: u64,
    pub(crate) phase: CaptureRuntimePhase,
    pub(crate) detail: String,
    pub(crate) last_persisted_messages: usize,
}

#[derive(Clone, Debug)]
struct CaptureSession {
    generation: u64,
    account_id: String,
    formation_id: String,
    provider: AiProvider,
    document_token: String,
    paused: bool,
    in_flight: bool,
    last_activity: Option<(String, std::time::Instant)>,
    status: CaptureRuntimeStatus,
}

#[derive(Default)]
struct PanelCaptureInner {
    generation: u64,
    session: Option<CaptureSession>,
}

#[derive(Clone, Default)]
pub(crate) struct PanelCaptureState {
    inner: Arc<Mutex<PanelCaptureInner>>,
}

impl PanelCaptureState {
    fn new_document_token() -> String {
        let mut bytes = [0_u8; 16];
        OsRng.fill_bytes(&mut bytes);
        bytes.iter().map(|byte| format!("{byte:02x}")).collect()
    }

    pub(crate) fn initialization_script(&self, provider: AiProvider) -> CommandResult<String> {
        let session = self.current()?;
        if session.provider != provider || session.account_id.is_empty() {
            return Err("Le scope natif de capture ne correspond pas au panneau demandé.".into());
        }
        let token = serde_json::to_string(&session.document_token)
            .map_err(|_| "Jeton de document indisponible.".to_string())?;
        Ok(format!(
            "window.__DOWZE_NATIVE_CAPTURE_SEED__={{token:{token},generation:{},paused:{}}};{}",
            session.generation, session.paused, CAPTURE_INITIALIZATION_SCRIPT
        ))
    }

    pub(crate) fn navigation_started(&self) {
        if let Ok(mut inner) = self.inner.lock() {
            if let Some(session) = inner.session.as_mut() {
                session.in_flight = false;
                session.status.phase = CaptureRuntimePhase::WaitingForConversation;
                session.status.detail =
                    "Navigation détectée ; le canal natif conserve le scope du document.".into();
                session.status.last_persisted_messages = 0;
            }
        }
    }

    pub(crate) fn configure(
        &self,
        account_id: &str,
        formation_id: &str,
        provider: AiProvider,
        paused: bool,
    ) -> CommandResult<CaptureRuntimeStatus> {
        super::local_auth::validate_account_id(account_id)?;
        let formation_valid = !formation_id.is_empty()
            && formation_id.len() <= 128
            && formation_id.trim() == formation_id
            && formation_id.bytes().all(|byte| {
                byte.is_ascii_lowercase() || byte.is_ascii_digit() || matches!(byte, b'-' | b'_')
            });
        if !formation_valid {
            return Err("L’identifiant d’instance de formation est mal formé.".into());
        }
        let mut inner = self
            .inner
            .lock()
            .map_err(|_| "État de capture indisponible.".to_string())?;
        inner.generation = inner.generation.wrapping_add(1).max(1);
        let generation = inner.generation;
        let (phase, detail) = if !matches!(
            provider,
            AiProvider::Chatgpt | AiProvider::Claude | AiProvider::Youtube | AiProvider::Tiktok
        ) {
            (
                CaptureRuntimePhase::Unavailable,
                "Capture directe limitée à ChatGPT et Claude dans ce lot.".into(),
            )
        } else if paused {
            (CaptureRuntimePhase::Paused, "Capture mise en pause.".into())
        } else {
            (
                CaptureRuntimePhase::WaitingForConversation,
                "Capture prête ; ouvrez une conversation.".into(),
            )
        };
        let document_token = inner
            .session
            .as_ref()
            .filter(|session| {
                session.account_id == account_id && session.formation_id == formation_id
            })
            .map(|session| session.document_token.clone())
            .unwrap_or_else(Self::new_document_token);
        let status = CaptureRuntimeStatus {
            generation,
            phase,
            detail,
            last_persisted_messages: 0,
        };
        inner.session = Some(CaptureSession {
            generation,
            account_id: account_id.into(),
            formation_id: formation_id.into(),
            provider,
            document_token,
            paused,
            in_flight: false,
            last_activity: None,
            status: status.clone(),
        });
        Ok(status)
    }

    pub(crate) fn invalidate(&self, detail: &str) {
        if let Ok(mut inner) = self.inner.lock() {
            inner.generation = inner.generation.wrapping_add(1).max(1);
            let generation = inner.generation;
            inner.session = Some(CaptureSession {
                generation,
                account_id: String::new(),
                formation_id: String::new(),
                provider: AiProvider::Chatgpt,
                document_token: Self::new_document_token(),
                paused: true,
                in_flight: false,
                last_activity: None,
                status: CaptureRuntimeStatus {
                    generation,
                    phase: CaptureRuntimePhase::Unavailable,
                    detail: detail.into(),
                    last_persisted_messages: 0,
                },
            });
        }
    }

    pub(crate) fn belongs_to(&self, account_id: &str, provider: AiProvider) -> bool {
        self.current().is_ok_and(|session| !account_id.is_empty() && session.account_id == account_id && session.provider == provider)
    }

    fn current(&self) -> CommandResult<CaptureSession> {
        self.inner
            .lock()
            .map_err(|_| "État de capture indisponible.".to_string())?
            .session
            .clone()
            .ok_or_else(|| "La capture n’est pas configurée.".to_string())
    }

    pub(crate) fn begin_poll(&self, generation: u64) -> CommandResult<bool> {
        let mut inner = self
            .inner
            .lock()
            .map_err(|_| "État de capture indisponible.".to_string())?;
        let Some(session) = inner.session.as_mut() else {
            return Ok(false);
        };
        if session.generation != generation
            || session.paused
            || session.in_flight
            || !matches!(
                session.provider,
                AiProvider::Chatgpt | AiProvider::Claude | AiProvider::Youtube | AiProvider::Tiktok
            )
        {
            return Ok(false);
        }
        session.in_flight = true;
        session.status.phase = CaptureRuntimePhase::Capturing;
        session.status.detail = "Capture directe active ; archive partielle en cours.".into();
        Ok(true)
    }

    pub(crate) fn finish_poll(&self, generation: u64) {
        if let Ok(mut inner) = self.inner.lock() {
            if let Some(session) = inner.session.as_mut() {
                if session.generation == generation {
                    session.in_flight = false;
                }
            }
        }
    }

    pub(crate) fn callback_is_current(
        &self,
        generation: u64,
        account_id: &str,
        formation_id: &str,
    ) -> bool {
        self.inner.lock().ok().and_then(|inner| {
            inner.session.as_ref().map(|session| {
                session.generation == generation
                    && !session.paused
                    && session.account_id == account_id
                    && session.formation_id == formation_id
            })
        }) == Some(true)
    }

    fn record(
        &self,
        generation: u64,
        phase: CaptureRuntimePhase,
        detail: String,
        persisted: usize,
    ) {
        if let Ok(mut inner) = self.inner.lock() {
            if let Some(session) = inner.session.as_mut() {
                if session.generation == generation {
                    session.status.phase = phase;
                    session.status.detail = detail;
                    session.status.last_persisted_messages = persisted;
                }
            }
        }
    }
}

#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct PageCaptureBatch {
    document_id: String,
    document_token: String,
    conversation_id: Option<String>,
    generation: u64,
    cursor: u64,
    has_more: bool,
    #[serde(default)]
    gaps: Vec<String>,
    #[serde(default)]
    events: Vec<PageCaptureEvent>,
}
#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct PageCaptureEvent {
    id: String,
    version: u32,
    sequence: u32,
    role: String,
    text: String,
    parent_id: Option<String>,
    #[serde(default)]
    attachments: Vec<String>,
    #[serde(rename = "final")]
    final_state: bool,
    observed_at: String,
}
pub(crate) struct ParsedCaptureBatch {
    document_id: String,
    cursor: u64,
    has_more: bool,
    pub(crate) input: ConversationCaptureInput,
}

fn archive_provider(provider: AiProvider) -> CommandResult<CaptureProvider> {
    match provider {
        AiProvider::Chatgpt => Ok(CaptureProvider::Chatgpt),
        AiProvider::Claude => Ok(CaptureProvider::Claude),
        _ => Err("Adaptateur fournisseur indisponible.".into()),
    }
}

#[allow(clippy::too_many_arguments)] // Explicit host scope and document proof at the parsing boundary.
pub(crate) fn parse_capture_batch(
    raw: &str,
    account_id: &str,
    formation_id: &str,
    provider: AiProvider,
    location: &CaptureLocation,
    generation: u64,
    document_token: &str,
) -> CommandResult<ParsedCaptureBatch> {
    let batch: PageCaptureBatch = serde_json::from_str(raw)
        .map_err(|error| format!("Retour de capture invalide: {error}"))?;
    if batch.conversation_id.as_deref() != Some(location.conversation_id.as_str())
        || batch.generation != generation
        || batch.document_token != document_token
    {
        return Err("Lot provenant d’une autre conversation ou génération.".into());
    }
    if batch.document_id.is_empty() || batch.document_id.len() > 128 || batch.events.len() > 100 {
        return Err("Lot de capture hors limites.".into());
    }
    let mut gaps = batch.gaps;
    let mut messages = Vec::with_capacity(batch.events.len());
    for event in batch.events {
        let role = match event.role.as_str() {
            "user" => MessageRole::User,
            "assistant" => MessageRole::Assistant,
            "system" => MessageRole::System,
            "tool" => MessageRole::Tool,
            _ => {
                gaps.push("UNRECOGNIZED_MESSAGE_ROLE".into());
                continue;
            }
        };
        if event.version == 0 || event.sequence == 0 {
            gaps.push("UNRECOGNIZED_MESSAGE_VERSION".into());
            continue;
        }
        messages.push(CaptureMessage {
            message_id: event.id,
            version: event.version,
            position: event.sequence,
            role,
            content: event.text,
            state: if event.final_state {
                CaptureMessageState::Final
            } else {
                CaptureMessageState::Partial
            },
            captured_at: event.observed_at,
            branch_id: event.parent_id,
            attachment_names: event.attachments,
        });
    }
    if batch.has_more {
        gaps.push("QUEUE_REMAINS_AFTER_BATCH".into());
    }
    if gaps.is_empty() {
        gaps.push("LIVE_PROVIDER_COVERAGE_NOT_QUALIFIED".into());
    }
    gaps.sort();
    gaps.dedup();
    Ok(ParsedCaptureBatch {
        document_id: batch.document_id,
        cursor: batch.cursor,
        has_more: batch.has_more,
        input: ConversationCaptureInput {
            account_id: account_id.into(),
            formation_id: formation_id.into(),
            provider: archive_provider(provider)?,
            conversation_id: location.conversation_id.clone(),
            source_url: location.source_url.clone(),
            status: CaptureStatus::Partial,
            status_detail: Some(format!(
                "Capture directe non qualifiée : {}",
                gaps.join(", ")
            )),
            messages,
        },
    })
}

// Shared by continuous IPC and the explicit close/pause drain.
pub(crate) fn validated_pending_capture(
    metadata: &serde_json::Value,
    account: &str,
    year: &str,
) -> CommandResult<serde_json::Value> {
    let raw = serde_json::to_string(metadata).map_err(|error| error.to_string())?;
    if raw.len() > 20 * 1024 * 1024 {
        return Err("Lot de capture trop volumineux.".into());
    }
    let batch: PageCaptureBatch = serde_json::from_str(&raw).map_err(|error| error.to_string())?;
    if batch.conversation_id.is_some() || batch.events.is_empty() || batch.cursor == 0 {
        return Err("Lot en attente invalide.".into());
    }
    let canonical = serde_json::to_value(&batch).map_err(|error| error.to_string())?;
    let mut checked = canonical.clone();
    checked["conversationId"] = serde_json::json!("pending");
    let location = CaptureLocation {
        conversation_id: "pending".into(),
        source_url: "https://chatgpt.com/c/pending".into(),
    };
    let parsed = parse_capture_batch(
        &checked.to_string(),
        account,
        year,
        AiProvider::Chatgpt,
        &location,
        batch.generation,
        &batch.document_token,
    )?;
    if parsed.input.messages.len() != batch.events.len() {
        return Err("Messages non reconnus dans le lot en attente.".into());
    }
    super::conversation_archive::validate_runtime_capture(&parsed.input)?;
    Ok(canonical)
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct NativeCaptureAck {
    document_id: String,
    cursor: u64,
    generation: u64,
    paused: bool,
}

#[tauri::command]
pub(crate) async fn push_ai_capture(
    caller: Webview,
    auth_state: State<'_, super::local_auth::LocalAuthState>,
    capture_state: State<'_, PanelCaptureState>,
    batch: serde_json::Value,
) -> CommandResult<NativeCaptureAck> {
    if caller.label() != AI_PANEL_LABEL {
        return Err("Canal de capture réservé au panneau IA.".into());
    }
    let caller_url = caller
        .url()
        .map_err(|_| "Origine du panneau indisponible.".to_string())?;
    let provider = super::provider_for_url(&caller_url)?;
    if !matches!(provider, AiProvider::Chatgpt | AiProvider::Claude) {
        return Err("Origine non autorisée pour la capture native.".into());
    }
    let session = capture_state.current()?;
    auth_state.require_active_account(&session.account_id)?;
    if session.provider != provider
        || batch
            .get("documentToken")
            .and_then(serde_json::Value::as_str)
            != Some(session.document_token.as_str())
    {
        return Err("Document de capture obsolète ou hors scope.".into());
    }
    if batch.get("probe").and_then(serde_json::Value::as_bool) == Some(true) {
        return Ok(NativeCaptureAck {
            document_id: String::new(),
            cursor: 0,
            generation: session.generation,
            paused: session.paused,
        });
    }
    let raw = serde_json::to_string(&batch).map_err(|_| "Lot de capture invalide.".to_string())?;
    if raw.len() > 20 * 1024 * 1024 {
        return Err("Lot de capture trop volumineux.".into());
    }
    let metadata: PageCaptureBatch =
        serde_json::from_str(&raw).map_err(|_| "Lot de capture invalide.".to_string())?;
    if metadata.events.is_empty()
        || metadata.events.len() > 100
        || metadata.document_id.is_empty()
        || metadata.document_id.len() > 128
        || metadata.cursor == 0
    {
        return Err("Lot de capture vide ou hors limites.".into());
    }
    let session = capture_state.current()?;
    if session.paused
        || session.provider != provider
        || session.generation != metadata.generation
        || session.document_token != metadata.document_token
    {
        return Err("Document de capture obsolète ou hors scope.".into());
    }
    auth_state.require_active_account(&session.account_id)?;
    let app = caller.app_handle().clone();
    let document_id = metadata.document_id.clone();
    let cursor = metadata.cursor;
    let conversation_id = metadata.conversation_id.clone();
    let work = if let Some(conversation_id) = conversation_id {
        let prefix = match provider {
            AiProvider::Chatgpt => "https://chatgpt.com/c/",
            AiProvider::Claude => "https://claude.ai/chat/",
            _ => unreachable!(),
        };
        let synthetic_url = Url::parse(&format!("{prefix}{conversation_id}"))
            .map_err(|_| "Identifiant de conversation invalide.".to_string())?;
        let location = capture_location(&synthetic_url, provider)?;
        let parsed = parse_capture_batch(
            &raw,
            &session.account_id,
            &session.formation_id,
            provider,
            &location,
            session.generation,
            &session.document_token,
        )?;
        let app = app.clone();
        tauri::async_runtime::spawn_blocking(move || {
            super::conversation_archive::persist_runtime_capture(&app, parsed.input).map(|_| ())
        })
    } else {
        let account_id = session.account_id.clone();
        let formation_id = session.formation_id.clone();
        let metadata = batch;
        let document = document_id.clone();
        let app = app.clone();
        tauri::async_runtime::spawn_blocking(move || {
            app.state::<super::local_auth::LocalAuthState>()
                .require_active_account(&account_id)?;
            Ok::<(), String>(())
        })
    };
    work.await
        .map_err(|_| "Persistance native interrompue.".to_string())??;
    Ok(NativeCaptureAck {
        document_id,
        cursor,
        generation: session.generation,
        paused: false,
    })
}

fn decode_eval_result(raw: String) -> Option<String> {
    let decoded = serde_json::from_str::<String>(&raw).unwrap_or(raw);
    (decoded != "null" && !decoded.is_empty()).then_some(decoded)
}

#[tauri::command]
pub(crate) async fn configure_ai_capture(
    caller: Webview,
    auth_state: State<'_, super::local_auth::LocalAuthState>,
    capture_state: State<'_, PanelCaptureState>,
    account_id: String,
    formation_id: String,
    provider: AiProvider,
    paused: bool,
) -> CommandResult<CaptureRuntimeStatus> {
    super::require_main_caller(&caller)?;
    let remote = caller.app_handle().state::<super::RemoteWebSessionState>();
    let _transition_guard = remote.begin_account_transition()?;
    auth_state.require_active_account(&account_id)?;
    if capture_state.current().is_ok_and(|session| !session.paused) {
        let app = caller.app_handle().clone();
        tauri::async_runtime::spawn_blocking(move || drain_before_transition(&app))
            .await
            .map_err(|_| "Sauvegarde interrompue.")??;
    }
    let status = capture_state.configure(&account_id, &formation_id, provider, paused)?;
    if let Some(panel) = caller.app_handle().get_webview(AI_PANEL_LABEL) {
        let session = capture_state.current()?;
        let token = serde_json::to_string(&session.document_token)
            .map_err(|_| "Jeton de document indisponible.".to_string())?;
        panel
            .eval(format!(
                "window.__DOWZE_CAPTURE_V1__?.bind({}, {}, {token})",
                status.generation, paused
            ))
            .map_err(|error| format!("Configuration de l’observateur impossible: {error}"))?;
    }
    Ok(status)
}

fn poll_web_activity(
    caller: &Webview,
    webview: &Webview,
    state: &PanelCaptureState,
    session: CaptureSession,
    start_url: Url,
) -> CommandResult<CaptureRuntimeStatus> {
    if super::provider_for_url(&start_url)? != session.provider {
        return Err("Page d’activité inattendue.".into());
    }
    if session
        .last_activity
        .as_ref()
        .is_some_and(|(url, time)| url == start_url.as_str() && time.elapsed().as_secs() < 30)
    {
        return Ok(session.status);
    }
    if !state.begin_poll(session.generation)? {
        return Ok(session.status);
    }
    let app = caller.app_handle().clone();
    let state = state.clone();
    let callback_state = state.clone();
    let panel = webview.clone();
    let generation = session.generation;
    let evaluation = webview.eval_with_callback(r#"JSON.stringify({url:location.href,title:document.title,text:(document.body?.innerText||'').slice(0,60000),observedAt:new Date().toISOString(),video:Array.from(document.querySelectorAll('video')).slice(0,1).map(v=>({currentTime:v.currentTime,duration:Number.isFinite(v.duration)?v.duration:null,paused:v.paused}))})"#, move |raw| {
        let result = (|| -> CommandResult<()> {
            if panel.url().map_err(|_| "Page d’activité indisponible.")? != start_url { return Err("Navigation pendant la lecture de l’activité.".into()); }
            let decoded = decode_eval_result(raw).ok_or("Activité vide.")?;
            if decoded.len() > 512 * 1024 { return Err("Activité trop volumineuse.".into()); }
            let value: serde_json::Value = serde_json::from_str(&decoded).map_err(|_| "Activité invalide.")?;
            if value["url"] != start_url.as_str() { return Err("URL d’activité incohérente.".into()); }
            let auth = app.state::<super::local_auth::LocalAuthState>(); auth.require_active_account(&session.account_id)?;
            let mut guard = callback_state.inner.lock().map_err(|_| "Capture indisponible.")?;
            let current = guard.session.as_mut().ok_or("Session indisponible.")?;
            if current.generation != generation || current.paused || current.account_id != session.account_id || current.formation_id != session.formation_id { return Err("Retour d’activité obsolète.".into()); }
            
            current.last_activity = Some((start_url.to_string(), std::time::Instant::now()));
            current.status.detail = "Page, recherche et position vidéo enregistrées ; audio/vidéo non transcrits.".into();
            current.status.last_persisted_messages = 1;
            Ok(())
        })();
        if let Err(detail) = result { callback_state.record(generation, CaptureRuntimePhase::Limited, detail, 0); }
        callback_state.finish_poll(generation);
    });
    if let Err(error) = evaluation {
        state.finish_poll(generation);
        return Err(format!("Lecture de l’activité impossible : {error}"));
    }
    Ok(state.current()?.status)
}

#[tauri::command]
pub(crate) fn poll_ai_capture(
    caller: Webview,
    auth_state: State<'_, super::local_auth::LocalAuthState>,
    capture_state: State<'_, PanelCaptureState>,
) -> CommandResult<CaptureRuntimeStatus> {
    super::require_main_caller(&caller)?;
    let session = capture_state.current()?;
    if caller
        .app_handle()
        .state::<super::RemoteWebSessionState>()
        .is_account_transition_in_progress()
    {
        return Ok(session.status);
    }
    if session.account_id.is_empty()
        || session.paused
        || !matches!(
            session.provider,
            AiProvider::Chatgpt | AiProvider::Claude | AiProvider::Youtube | AiProvider::Tiktok
        )
    {
        return Ok(session.status);
    }
    auth_state.require_active_account(&session.account_id)?;
    let webview = super::required_ai_panel(&caller)?;
    if webview.label() != AI_PANEL_LABEL {
        return Err("WebView de capture inattendue.".into());
    }
    let start_url = webview
        .url()
        .map_err(|error| format!("Contrôle URL initial impossible: {error}"))?;
    if matches!(session.provider, AiProvider::Youtube | AiProvider::Tiktok) {
        return poll_web_activity(&caller, &webview, &capture_state, session, start_url);
    }
    if super::provider_for_url(&start_url)? != session.provider {
        return Err("La page ne correspond pas au fournisseur capturé.".into());
    }
    if !capture_state.begin_poll(session.generation)? {
        return Ok(capture_state.current()?.status);
    }

    let app = caller.app_handle().clone();
    let state = capture_state.inner().clone();
    let callback_webview = webview.clone();
    let account_id = session.account_id.clone();
    let formation_id = session.formation_id.clone();
    let provider = session.provider;
    let generation = session.generation;
    let document_token = session.document_token.clone();
    let serialized_token = serde_json::to_string(&document_token)
        .map_err(|_| "Jeton de document indisponible.".to_string())?;
    let script = format!("window.__DOWZE_CAPTURE_V1__?.bind({generation}, false, {serialized_token});{SNAPSHOT_SCRIPT}");
    let evaluation = webview.eval_with_callback(script, move |raw| {
        let callback_app = app.clone();
        let callback_result = (|| -> CommandResult<()> {
            if callback_webview.label() != AI_PANEL_LABEL {
                return Err("WebView changée au retour.".into());
            }
            let return_url = callback_webview
                .url()
                .map_err(|error| format!("Contrôle URL retour impossible: {error}"))?;
            if super::provider_for_url(&return_url)? != provider
                || return_url.origin() != start_url.origin()
            {
                return Err("Origine changée pendant capture ; retour refusé.".into());
            }
            if !state.callback_is_current(generation, &account_id, &formation_id) {
                return Err("Retour obsolète après changement de session.".into());
            }
            let decoded = decode_eval_result(raw)
                .ok_or_else(|| "Observateur absent du document.".to_string())?;
            // A same-document SPA may already display another conversation. The native
            // document token retains ownership; each queued batch keeps its original ID.
            if decoded.len() > 20 * 1024 * 1024 {
                return Err("Lot de capture trop volumineux.".into());
            }
            let metadata: serde_json::Value =
                serde_json::from_str(&decoded).map_err(|_| "Lot de capture invalide.")?;
            let Some(conversation_id) = metadata["conversationId"].as_str() else {
                state.record(
                    generation,
                    CaptureRuntimePhase::WaitingForConversation,
                    "En attente de l’identifiant de conversation.".into(),
                    0,
                );
                state.finish_poll(generation);
                return Ok(());
            };
            let prefix = match provider {
                AiProvider::Chatgpt => "https://chatgpt.com/c/",
                AiProvider::Claude => "https://claude.ai/chat/",
                _ => return Err("Fournisseur inattendu.".into()),
            };
            let captured_url = Url::parse(&format!("{prefix}{conversation_id}"))
                .map_err(|_| "Identifiant de conversation invalide.")?;
            let captured_location = capture_location(&captured_url, provider)?;
            let parsed = parse_capture_batch(
                &decoded,
                &account_id,
                &formation_id,
                provider,
                &captured_location,
                generation,
                &document_token,
            )?;
            if parsed.input.messages.is_empty() {
                state.record(
                    generation,
                    CaptureRuntimePhase::Capturing,
                    parsed.input.status_detail.clone().unwrap_or_default(),
                    0,
                );
                state.finish_poll(generation);
                return Ok(());
            }
            let worker_state = state.clone();
            let worker_webview = callback_webview.clone();
            let worker_account = account_id.clone();
            let worker_formation = formation_id.clone();
            let worker_app = callback_app.clone();
            std::thread::spawn(move || {
                let result = (|| -> CommandResult<_> {
                    let guard = worker_state
                        .inner
                        .lock()
                        .map_err(|_| "Capture indisponible.".to_string())?;
                    let valid = guard.session.as_ref().is_some_and(|session| {
                        session.generation == generation
                            && !session.paused
                            && session.account_id == worker_account
                            && session.formation_id == worker_formation
                    });
                    if !valid {
                        return Err("Session obsolète avant persistance.".into());
                    }
                    super::conversation_archive::persist_runtime_capture(&worker_app, parsed.input)
                })();
                match result {
                    Ok(written) => {
                        if worker_state.callback_is_current(
                            generation,
                            &worker_account,
                            &worker_formation,
                        ) {
                            let document = serde_json::to_string(&parsed.document_id)
                                .unwrap_or_else(|_| "\"invalid\"".into());
                            let _ = worker_webview.eval(format!(
                                "window.__DOWZE_CAPTURE_V1__?.ack({document}, {})",
                                parsed.cursor
                            ));
                            worker_state.record(
                                generation,
                                if parsed.has_more {
                                    CaptureRuntimePhase::Limited
                                } else {
                                    CaptureRuntimePhase::Capturing
                                },
                                "Archive écrite ; couverture fournisseur réelle non qualifiée."
                                    .into(),
                                written.inserted_messages,
                            );
                        }
                    }
                    Err(error) => worker_state.record(
                        generation,
                        CaptureRuntimePhase::Limited,
                        format!("Capture conservée en attente : {error}"),
                        0,
                    ),
                }
                worker_state.finish_poll(generation);
            });
            Ok(())
        })();
        if let Err(error) = callback_result {
            state.record(generation, CaptureRuntimePhase::Limited, error, 0);
            state.finish_poll(generation);
        }
    });
    if let Err(error) = evaluation {
        capture_state.finish_poll(generation);
        capture_state.record(
            generation,
            CaptureRuntimePhase::Limited,
            format!("Lecture native WebView impossible: {error}"),
            0,
        );
    }
    Ok(capture_state.current()?.status)
}

/// Called on a worker thread while the remote-transition guard prevents new polls.
/// Native scope is captured before freezing the page; no page can choose an account.
pub(crate) fn drain_before_transition(app: &tauri::AppHandle) -> CommandResult<()> {
    let state = app.state::<PanelCaptureState>();
    let session = match state.current() {
        Ok(value) => value,
        Err(_) => return Ok(()),
    };
    if session.account_id.is_empty()
        || !matches!(session.provider, AiProvider::Chatgpt | AiProvider::Claude)
    {
        return Ok(());
    }
    let Some(panel) = app.get_webview(AI_PANEL_LABEL) else {
        return Ok(());
    };
    let url = panel.url().map_err(|_| "Page de capture indisponible.")?;
    if super::provider_for_url(&url).ok() != Some(session.provider) {
        return Ok(());
    }
    let token = serde_json::to_string(&session.document_token).map_err(|_| "Jeton invalide.")?;
    let evaluate = |script: String| -> CommandResult<String> {
        let (sender, receiver) = std::sync::mpsc::sync_channel(1);
        panel
            .eval_with_callback(script, move |raw| {
                let _ = sender.send(raw);
            })
            .map_err(|_| "Lecture de la capture impossible.")?;
        receiver
            .recv_timeout(std::time::Duration::from_secs(3))
            .map_err(|_| {
                "La sauvegarde de la conversation ne répond pas ; la fenêtre reste ouverte.".into()
            })
    };
    let result = (|| -> CommandResult<()> {
        let deadline = std::time::Instant::now() + std::time::Duration::from_secs(15);
        loop {
            if std::time::Instant::now() > deadline {
                return Err("La sauvegarde est encore en cours ; réessayez la fermeture.".into());
            }
            let raw = evaluate(format!(
                "window.__DOWZE_CAPTURE_V1__?.bind({}, true, {token}, {});{SNAPSHOT_SCRIPT}",
                session.generation, !session.paused
            ))?;
            let Some(decoded) = decode_eval_result(raw) else {
                return Ok(());
            };
            if decoded.len() > 20 * 1024 * 1024 {
                return Err("Capture trop volumineuse.".into());
            }
            let metadata: serde_json::Value =
                serde_json::from_str(&decoded).map_err(|_| "Capture invalide.")?;
            if metadata["documentToken"].as_str() != Some(&session.document_token)
                || metadata["generation"].as_u64() != Some(session.generation)
            {
                return Err("Le document ne correspond plus à la session.".into());
            }
            let events = metadata["events"]
                .as_array()
                .ok_or("Événements de capture invalides.")?;
            if events.is_empty() {
                return Ok(());
            }
            let document = metadata["documentId"]
                .as_str()
                .filter(|id| !id.is_empty() && id.len() <= 128)
                .ok_or("Document invalide.")?;
            let cursor = metadata["cursor"].as_u64().ok_or("Curseur invalide.")?;
            app.state::<super::local_auth::LocalAuthState>()
                .require_active_account(&session.account_id)?;
            {
                let guard = state.inner.lock().map_err(|_| "Capture indisponible.")?;
                if !guard.session.as_ref().is_some_and(|current| {
                    current.generation == session.generation
                        && current.document_token == session.document_token
                        && current.account_id == session.account_id
                        && current.formation_id == session.formation_id
                }) {
                    return Err("Session modifiée avant sauvegarde.".into());
                }
                if let Some(id) = metadata["conversationId"].as_str() {
                    let prefix = match session.provider {
                        AiProvider::Chatgpt => "https://chatgpt.com/c/",
                        _ => "https://claude.ai/chat/",
                    };
                    let url = Url::parse(&format!("{prefix}{id}"))
                        .map_err(|_| "Conversation invalide.")?;
                    let location = capture_location(&url, session.provider)?;
                    let parsed = parse_capture_batch(
                        &decoded,
                        &session.account_id,
                        &session.formation_id,
                        session.provider,
                        &location,
                        session.generation,
                        &session.document_token,
                    )?;
                    super::conversation_archive::persist_runtime_capture(app, parsed.input)?;
                } else {
                    // A brand-new request can close before the provider allocates its ID.
                    // Keep that observed content privately without inventing a provider URL.
                    
                }
            }
            let document = serde_json::to_string(document).map_err(|_| "Document invalide.")?;
            let ack = evaluate(format!(
                "JSON.stringify(window.__DOWZE_CAPTURE_V1__?.ack({document}, {cursor}) ?? false)"
            ))?;
            if decode_eval_result(ack).as_deref() != Some("true") {
                return Err("L’acquittement de sauvegarde a échoué.".into());
            }
            if metadata["hasMore"] != true {
                return Ok(());
            }
        }
    })();
    if result.is_err() {
        let _ = panel.eval(format!(
            "window.__DOWZE_CAPTURE_V1__?.bind({}, {}, {token})",
            session.generation, session.paused
        ));
    }
    result
}

#[cfg(test)]
mod tests {
    #[test]
    fn reload_resume_requires_same_native_account_and_provider() {
        let state = super::PanelCaptureState::default();
        let account = "0123456789abcdef0123456789abcdef";
        assert!(!state.belongs_to(account, super::super::AiProvider::Chatgpt));
        state.configure(account, "formation-2026", super::super::AiProvider::Chatgpt, false).unwrap();
        assert!(state.belongs_to(account, super::super::AiProvider::Chatgpt));
        assert!(!state.belongs_to("fedcba9876543210fedcba9876543210", super::super::AiProvider::Chatgpt));
        assert!(!state.belongs_to(account, super::super::AiProvider::Claude));
        assert!(!state.belongs_to("", super::super::AiProvider::Chatgpt));
        state.invalidate("test");
        assert!(!state.belongs_to(account, super::super::AiProvider::Chatgpt));
    }

    use super::*;
    use tauri::Url;

    #[test]
    fn pending_capture_rejects_invalid_content_and_strips_unrecognized_fields() {
        let account = "0123456789abcdef0123456789abcdef";
        let mut batch = serde_json::json!({
            "documentId":"document-1", "documentToken":"token", "generation":1,
            "conversationId":null, "cursor":1, "hasMore":false, "gaps":[],
            "events":[{"id":"message-1", "version":1, "sequence":1, "role":"user",
                "text":"synthetic", "parentId":null, "attachments":[], "final":true,
                "observedAt":"2026-09-21T12:00:00Z", "unrecognized":"must not persist"}]
        });
        let canonical = validated_pending_capture(&batch, account, "formation-2026").unwrap();
        assert!(canonical["events"][0].get("unrecognized").is_none());
        batch["events"][0]["attachments"] = serde_json::json!(["x".repeat(513)]);
        assert!(validated_pending_capture(&batch, account, "formation-2026").is_err());
        batch["events"][0]["attachments"] = serde_json::json!([]);
        batch["events"][0]["role"] = serde_json::json!("invalid");
        assert!(validated_pending_capture(&batch, account, "formation-2026").is_err());
        batch["events"][0]["role"] = serde_json::json!("user");
        batch["events"] = serde_json::json!(vec![batch["events"][0].clone(); 101]);
        assert!(validated_pending_capture(&batch, account, "formation-2026").is_err());
    }

    #[test]
    fn capture_location_is_provider_scoped_and_strips_query_material() {
        let chatgpt = capture_location(
            &Url::parse("https://chatgpt.com/c/thread-1?token=private#fragment").unwrap(),
            super::super::AiProvider::Chatgpt,
        )
        .unwrap();
        assert_eq!(chatgpt.conversation_id, "thread-1");
        assert_eq!(chatgpt.source_url, "https://chatgpt.com/c/thread-1");
        assert!(capture_location(
            &Url::parse("https://chatgpt.com.evil.test/c/thread-1").unwrap(),
            super::super::AiProvider::Chatgpt
        )
        .is_err());
        assert!(capture_location(
            &Url::parse("https://claude.ai/chat/thread-1").unwrap(),
            super::super::AiProvider::Chatgpt
        )
        .is_err());
    }

    #[test]
    fn generations_reject_callbacks_after_pause_navigation_or_scope_change() {
        let state = PanelCaptureState::default();
        let first = state
            .configure(
                "0123456789abcdef0123456789abcdef",
                "formation-2026",
                super::super::AiProvider::Chatgpt,
                false,
            )
            .unwrap();
        assert!(state.begin_poll(first.generation).unwrap());
        state.finish_poll(first.generation);
        let paused = state
            .configure(
                "0123456789abcdef0123456789abcdef",
                "formation-2026",
                super::super::AiProvider::Chatgpt,
                true,
            )
            .unwrap();
        assert!(!state.callback_is_current(
            first.generation,
            "0123456789abcdef0123456789abcdef",
            "formation-2026"
        ));
        assert!(!state.begin_poll(paused.generation).unwrap());
        let next = state
            .configure(
                "0123456789abcdef0123456789abcdef",
                "formation-2027",
                super::super::AiProvider::Claude,
                false,
            )
            .unwrap();
        assert!(next.generation > paused.generation);
        assert!(!state.callback_is_current(
            paused.generation,
            "0123456789abcdef0123456789abcdef",
            "formation-2026"
        ));
        state.invalidate("session fermée");
        assert!(!state.callback_is_current(
            next.generation,
            "0123456789abcdef0123456789abcdef",
            "formation-2027"
        ));
    }

    #[test]
    fn native_document_token_is_stable_only_inside_the_same_account_instance_scope() {
        let state = PanelCaptureState::default();
        state
            .configure(
                "0123456789abcdef0123456789abcdef",
                "formation-2026",
                super::super::AiProvider::Chatgpt,
                false,
            )
            .unwrap();
        let first = state.current().unwrap().document_token;
        state
            .configure(
                "0123456789abcdef0123456789abcdef",
                "formation-2026",
                super::super::AiProvider::Chatgpt,
                true,
            )
            .unwrap();
        assert_eq!(state.current().unwrap().document_token, first);
        state
            .configure(
                "0123456789abcdef0123456789abcdef",
                "formation-2027",
                super::super::AiProvider::Chatgpt,
                false,
            )
            .unwrap();
        assert_ne!(state.current().unwrap().document_token, first);
        let script = state
            .initialization_script(super::super::AiProvider::Chatgpt)
            .unwrap();
        assert!(script.contains("window.__DOWZE_NATIVE_CAPTURE_SEED__"));
        assert!(script.contains(&state.current().unwrap().document_token));
    }

    #[test]
    fn poll_lease_is_immediate_and_prevents_unbounded_parallel_callbacks() {
        let state = PanelCaptureState::default();
        let configured = state
            .configure(
                "0123456789abcdef0123456789abcdef",
                "formation-2026",
                super::super::AiProvider::Chatgpt,
                false,
            )
            .unwrap();
        assert!(state.begin_poll(configured.generation).unwrap());
        assert!(!state.begin_poll(configured.generation).unwrap());
        state.finish_poll(configured.generation);
        assert!(state.begin_poll(configured.generation).unwrap());
    }

    #[test]
    fn document_navigation_keeps_the_native_scope_generation_for_continuous_pushes() {
        let state = PanelCaptureState::default();
        let configured = state
            .configure(
                "0123456789abcdef0123456789abcdef",
                "formation-2026",
                super::super::AiProvider::Chatgpt,
                false,
            )
            .unwrap();
        let token = state.current().unwrap().document_token;
        state.navigation_started();
        let after = state.current().unwrap();
        assert_eq!(after.generation, configured.generation);
        assert_eq!(after.document_token, token);
        assert!(state.callback_is_current(
            configured.generation,
            "0123456789abcdef0123456789abcdef",
            "formation-2026"
        ));
    }

    #[test]
    fn injected_collector_is_bounded_non_blocking_and_never_reads_auth_material() {
        assert!(CAPTURE_INITIALIZATION_SCRIPT.contains("nativeFetch.apply(this, arguments)"));
        assert!(CAPTURE_INITIALIZATION_SCRIPT.contains("return responsePromise"));
        assert!(CAPTURE_INITIALIZATION_SCRIPT.contains("response.clone()"));
        assert!(CAPTURE_INITIALIZATION_SCRIPT.contains("TextDecoder(\"utf-8\", { fatal: true })"));
        assert!(CAPTURE_INITIALIZATION_SCRIPT.contains("MutationObserver"));
        assert!(CAPTURE_INITIALIZATION_SCRIPT.contains("CAPTURE_LIMIT_REACHED"));
        // Reading the response MIME type is necessary to distinguish JSON from SSE.
        // No request headers or authentication material are inspected.
        let script = CAPTURE_INITIALIZATION_SCRIPT
            .replace("response.headers.get(\"content-type\")", "responseMimeType");
        for forbidden in [
            "document.cookie",
            "localStorage",
            "sessionStorage",
            ".headers",
            "Authorization",
        ] {
            assert!(
                !script.contains(forbidden),
                "forbidden page access: {forbidden}"
            );
        }
    }

    #[test]
    fn unknown_formats_and_stream_cuts_stay_partial_with_all_observed_versions() {
        let location = CaptureLocation {
            conversation_id: "thread-1".into(),
            source_url: "https://chatgpt.com/c/thread-1".into(),
        };
        let batch = r#"{"documentId":"doc-1","documentToken":"0123456789abcdef0123456789abcdef","conversationId":"thread-1","generation":1,"cursor":3,"hasMore":false,"gaps":["STREAM_SCHEMA_UNQUALIFIED","SSE_TRUNCATED_EVENT"],"events":[{"id":"m-1","version":1,"sequence":1,"role":"assistant","text":"début","parentId":null,"attachments":[],"final":false,"observedAt":"2026-09-21T12:00:00Z"},{"id":"m-1","version":2,"sequence":2,"role":"assistant","text":"début suite","parentId":null,"attachments":[],"final":false,"observedAt":"2026-09-21T12:00:01Z"},{"id":"m-2","version":1,"sequence":3,"role":"user","text":"question","parentId":"branch-a","attachments":["piece.pdf"],"final":true,"observedAt":"2026-09-21T12:00:02Z"}]}"#;
        let parsed = parse_capture_batch(
            batch,
            "0123456789abcdef0123456789abcdef",
            "formation-2026",
            super::super::AiProvider::Chatgpt,
            &location,
            1,
            "0123456789abcdef0123456789abcdef",
        )
        .unwrap();
        assert_eq!(parsed.input.messages.len(), 3);
        assert_eq!(parsed.input.messages[1].version, 2);
        assert_eq!(
            parsed.input.messages[2].branch_id.as_deref(),
            Some("branch-a")
        );
        assert_eq!(
            parsed.input.status,
            super::super::conversation_archive::CaptureStatus::Partial
        );
        let detail = parsed.input.status_detail.unwrap();
        assert!(detail.contains("STREAM_SCHEMA_UNQUALIFIED"));
        assert!(detail.contains("SSE_TRUNCATED_EVENT"));
    }

    #[test]
    fn native_scope_token_rejects_a_batch_from_another_account_instance_document() {
        let location = CaptureLocation {
            conversation_id: "thread-1".into(),
            source_url: "https://chatgpt.com/c/thread-1".into(),
        };
        let batch = r#"{"documentId":"doc-1","documentToken":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","conversationId":"thread-1","generation":1,"cursor":0,"hasMore":false,"gaps":[],"events":[]}"#;
        assert!(parse_capture_batch(
            batch,
            "0123456789abcdef0123456789abcdef",
            "formation-2026",
            super::super::AiProvider::Chatgpt,
            &location,
            1,
            "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
        )
        .is_err());
    }
}
