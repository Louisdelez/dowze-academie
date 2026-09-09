import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const tauriConfig = JSON.parse(readFileSync("src-tauri/tauri.conf.json", "utf8"));
const infoPlist = readFileSync("src-tauri/Info.plist", "utf8");
const entitlements = readFileSync("src-tauri/Entitlements.plist", "utf8");
const cargoManifest = readFileSync("src-tauri/Cargo.toml", "utf8");
const rustSource = readFileSync("src-tauri/src/lib.rs", "utf8");
const tauriBridge = readFileSync("src/lib/tauri.ts", "utf8");
const aiPanel = readFileSync("src/components/AiPanel.tsx", "utf8");

test("le bundle macOS déclare et signe l’accès au microphone des WebViews", () => {
  assert.equal(tauriConfig.bundle.macOS.entitlements, "./Entitlements.plist");
  assert.equal(tauriConfig.bundle.macOS.minimumSystemVersion, "10.14");
  assert.match(infoPlist, /<key>NSMicrophoneUsageDescription<\/key>\s*<string>[^<]+<\/string>/);
  assert.match(entitlements, /<key>com\.apple\.security\.device\.audio-input<\/key>\s*<true\s*\/>/);
  assert.match(cargoManifest, /objc2-av-foundation\s*=\s*\{[^\n]+"AVCaptureDevice"[^\n]+"AVMediaFormat"/);
  assert.match(rustSource, /AVCaptureDevice::authorizationStatusForMediaType\(media_type\)/);
  assert.match(rustSource, /AVCaptureDevice::requestAccessForMediaType_completionHandler\(/);
  assert.match(rustSource, /request_macos_microphone_access\(caller\.app_handle\(\)\.clone\(\)\)\.await/);
  assert.match(rustSource, /request_microphone_access,/);
  assert.match(
    rustSource,
    /async fn request_microphone_access\(caller: Webview\)[\s\S]+?require_main_caller\(&caller\)\?;/
  );
  assert.match(tauriBridge, /invoke<MicrophoneAccessStatus>\("request_microphone_access"\)/);
  assert.match(aiPanel, /requestMicrophoneAccess/);
  assert.match(aiPanel, /aria-label="Autoriser la dictée et les appels vocaux"/);
});
