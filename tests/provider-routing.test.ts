import assert from "node:assert/strict";
import test from "node:test";
import {
  AI_PROVIDER_OPTIONS,
  isConversationUrl,
  normalizeConversationUrl,
  providerHome,
  providerLabel
} from "../src/lib/tauri.ts";
import type { AiProvider } from "../src/types.ts";

const providers: AiProvider[] = [
  "chatgpt",
  "claude",
  "gemini",
  "mistral",
  "deepseek",
  "kimi",
  "freechat",
  "duolingo",
  "khanacademy",
  "youtube",
  "tiktok",
  "notebooklm"
];

test("les douze services ont un libellé et une destination déterministes", () => {
  assert.deepEqual(AI_PROVIDER_OPTIONS.map((option) => option.value), providers);
  assert.deepEqual(providers.map(providerLabel), [
    "ChatGPT",
    "Claude",
    "Gemini",
    "Mistral",
    "DeepSeek",
    "Kimi",
    "Chat libre",
    "Duolingo",
    "Khan Academy",
    "YouTube",
    "TikTok",
    "NotebookLM"
  ]);
  const webProviders = providers.filter((provider) => provider !== "freechat");
  assert.deepEqual(webProviders.map(providerHome), [
    "https://chatgpt.com/",
    "https://claude.ai/new",
    "https://gemini.google.com/app",
    "https://chat.mistral.ai/chat",
    "https://chat.deepseek.com/",
    "https://www.kimi.com/",
    "https://www.duolingo.com/learn",
    "https://fr.khanacademy.org/",
    "https://www.youtube.com/",
    "https://www.tiktok.com/",
    "https://notebook.google.com/"
  ]);
  assert.throws(() => providerHome("freechat"), /intégré à Dowze Academie/);
});

test("chaque service reconnaît uniquement ses propres liens d’historique", () => {
  const urls: Record<AiProvider, string> = {
    chatgpt: "https://chatgpt.com/c/chatgpt-history-test",
    claude: "https://claude.ai/chat/claude-history-test",
    gemini: "https://gemini.google.com/app/gemini-history-test",
    mistral: "https://chat.mistral.ai/chat/mistral-history-test",
    deepseek: "https://chat.deepseek.com/a/chat/s/deepseek-history-test",
    kimi: "https://www.kimi.com/chat/kimi-history-test",
    freechat: "",
    duolingo: "https://www.duolingo.com/learn",
    khanacademy: "https://www.khanacademy.org/",
    youtube: "https://www.youtube.com/watch?v=video-history-test",
    tiktok: "https://www.tiktok.com/@science/video/1234567890123456789",
    notebooklm: "https://notebook.google.com/notebook/notebook-history-test"
  };

  for (const provider of providers) {
    for (const candidate of providers) {
      assert.equal(
        isConversationUrl(urls[candidate], provider),
        candidate === provider && !["freechat", "duolingo", "khanacademy"].includes(candidate),
        `${provider} ne doit ${candidate === provider && !["freechat", "duolingo", "khanacademy"].includes(candidate) ? "pas refuser" : "pas accepter"} ${candidate}`
      );
    }
  }
});

test("Duolingo ouvre sa page officielle sans créer de faux historique", () => {
  assert.equal(providerHome("duolingo"), "https://www.duolingo.com/learn");
  for (const url of [
    "https://www.duolingo.com/learn",
    "https://duolingo.com/learn",
    "https://www.duolingo.com/lesson/unit-1"
  ]) {
    assert.equal(isConversationUrl(url, "duolingo"), false, url);
  }
});

test("Khan Academy ouvre sa plateforme officielle sans créer de faux historique", () => {
  assert.equal(providerHome("khanacademy"), "https://fr.khanacademy.org/");
  for (const url of [
    "https://www.khanacademy.org/",
    "https://fr.khanacademy.org/",
    "https://www.khanacademy.org/math"
  ]) {
    assert.equal(isConversationUrl(url, "khanacademy"), false, url);
  }
});

test("YouTube conserve recherches, vidéos, playlists et Shorts", () => {
  for (const url of [
    "https://www.youtube.com/results?search_query=cycle+de+carnot",
    "https://m.youtube.com/watch?v=video-history-test",
    "https://youtu.be/video-history-test?si=tracking",
    "https://www.youtube.com/playlist?list=playlist-history-test",
    "https://www.youtube.com/shorts/short-history-test"
  ]) {
    assert.equal(isConversationUrl(url, "youtube"), true, url);
  }
  assert.equal(isConversationUrl("https://www.youtube.com/", "youtube"), false);
  assert.equal(isConversationUrl("https://www.youtube.com/results", "youtube"), false);
});

test("les URL non sûres et les domaines ressemblants sont rejetés côté interface", () => {
  for (const url of [
    "http://chatgpt.com/c/history-test",
    "https://user@chatgpt.com/c/history-test",
    "https://chatgpt.com:444/c/history-test",
    "https://chatgpt.com.evil.example/c/history-test",
    "https://gemini.google.com@evil.example/app/history-test",
    "https://chat.mistral.ai.evil.example/chat/history-test",
    "https://chat.deepseek.com.evil.example/a/chat/s/history-test",
    "https://chat.deepseek.com@evil.example/a/chat/s/history-test",
    "https://www.kimi.com.evil.example/chat/history-test",
    "https://www.kimi.com@evil.example/chat/history-test",
    "https://www.duolingo.com.evil.example/learn",
    "https://www.duolingo.com@evil.example/learn",
    "http://www.duolingo.com/learn",
    "https://www.duolingo.com:444/learn",
    "https://www.khanacademy.org.evil.example/math",
    "https://www.khanacademy.org@evil.example/math",
    "http://www.khanacademy.org/math",
    "https://www.khanacademy.org:444/math",
    "https://www.youtube.com.evil.example/watch?v=history-test",
    "https://www.tiktok.com.evil.example/search?q=history-test",
    "https://notebooklm.google.com.evil.example/notebook/history-test"
  ]) {
    assert.equal(providers.some((provider) => isConversationUrl(url, provider)), false, url);
  }
});

test("la normalisation YouTube garde l’identité utile et retire le suivi", () => {
  const results = new URL(normalizeConversationUrl(
    "https://www.youtube.com/results?search_query=thermodynamique+appliqu%C3%A9e&sp=EgIQAQ%3D%3D&utm_source=test#results"
  ));
  assert.equal(results.pathname, "/results");
  assert.equal(results.searchParams.get("search_query"), "thermodynamique appliquée");
  assert.equal(results.searchParams.get("sp"), "EgIQAQ==");
  assert.equal(results.searchParams.has("utm_source"), false);
  assert.equal(results.hash, "");

  const video = new URL(normalizeConversationUrl(
    "https://www.youtube.com/watch?v=video-history-test&list=playlist-history-test&t=123s&si=tracking"
  ));
  assert.deepEqual([...video.searchParams.keys()], ["v", "list"]);
  assert.equal(video.searchParams.get("v"), "video-history-test");
  assert.equal(video.searchParams.get("list"), "playlist-history-test");

  assert.equal(
    normalizeConversationUrl(
      "https://youtu.be/video-history-test/?si=tracking&list=playlist-history-test#comments"
    ),
    "https://www.youtube.com/watch?v=video-history-test&list=playlist-history-test"
  );
});

test("les chemins d’historique refusent tout segment suffixe parasite", () => {
  const malformedUrls: Array<[AiProvider, string]> = [
    ["chatgpt", "https://chatgpt.com/c/chatgpt-history-test/parasite"],
    ["chatgpt", "https://chatgpt.com/share/chatgpt-history-test/parasite"],
    ["claude", "https://claude.ai/chat/claude-history-test/parasite"],
    ["gemini", "https://gemini.google.com/app/gemini-history-test/parasite"],
    ["mistral", "https://chat.mistral.ai/chat/mistral-history-test/parasite"],
    ["deepseek", "https://chat.deepseek.com/a/chat/s/deepseek-history-test/parasite"],
    ["kimi", "https://www.kimi.com/chat/kimi-history-test/parasite"],
    ["notebooklm", "https://notebook.google.com/notebook/notebook-history-test/parasite"],
    ["youtube", "https://www.youtube.com/shorts/short-history-test/parasite"],
    ["youtube", "https://youtu.be/video-history-test/parasite"],
    ["tiktok", "https://www.tiktok.com/@science/video/1234567890123456789/parasite"],
    ["tiktok", "https://vm.tiktok.com/ZMexample/parasite"]
  ];

  for (const [provider, url] of malformedUrls) {
    assert.equal(isConversationUrl(url, provider), false, url);
  }
});

test("la normalisation des assistants et notebooks retire paramètres et fragments", () => {
  assert.equal(
    normalizeConversationUrl("https://gemini.google.com/app/gemini-history-test?authuser=0#prompt"),
    "https://gemini.google.com/app/gemini-history-test"
  );
  assert.equal(
    normalizeConversationUrl("https://chat.deepseek.com/a/chat/s/deepseek-history-test?ref=course#answer"),
    "https://chat.deepseek.com/a/chat/s/deepseek-history-test"
  );
  assert.equal(
    normalizeConversationUrl("https://kimi.com/chat/kimi-history-test?from=course#answer"),
    "https://www.kimi.com/chat/kimi-history-test"
  );
  assert.equal(
    normalizeConversationUrl("https://notebook.google.com/notebook/notebook-history-test?pli=1#notes"),
    "https://notebook.google.com/notebook/notebook-history-test"
  );
});

test("les liens NotebookLM historiques restent lisibles après le changement de domaine", () => {
  assert.equal(
    isConversationUrl(
      "https://notebooklm.google.com/notebook/legacy-notebook-history-test",
      "notebooklm"
    ),
    true
  );
  assert.equal(
    isConversationUrl(
      "https://notebook.google.com/notebook/current-notebook-history-test",
      "notebooklm"
    ),
    true
  );
  assert.equal(
    normalizeConversationUrl(
      "https://notebooklm.google.com/notebook/legacy-notebook-history-test?authuser=0"
    ),
    "https://notebook.google.com/notebook/legacy-notebook-history-test"
  );
});

test("TikTok conserve les recherches et vidéos de séance sans paramètres de suivi", () => {
  const search = "https://www.tiktok.com/search?q=premier+principe+thermodynamique&utm_source=test#top";
  const video = "https://www.tiktok.com/@science/video/1234567890123456789?_r=1&_t=tracking";
  const shortVideo = "https://vm.tiktok.com/ZMexample/?share_app_id=1233";

  assert.equal(isConversationUrl(search, "tiktok"), true);
  assert.equal(isConversationUrl(video, "tiktok"), true);
  assert.equal(isConversationUrl(shortVideo, "tiktok"), true);
  assert.equal(
    normalizeConversationUrl(search),
    "https://www.tiktok.com/search?q=premier+principe+thermodynamique"
  );
  assert.equal(
    normalizeConversationUrl(video),
    "https://www.tiktok.com/@science/video/1234567890123456789"
  );
  assert.equal(
    normalizeConversationUrl(shortVideo),
    "https://vm.tiktok.com/ZMexample"
  );
});

test("TikTok refuse les pages sans séance et les domaines ressemblants", () => {
  for (const url of [
    "https://www.tiktok.com/",
    "https://www.tiktok.com/search",
    "http://www.tiktok.com/search?q=thermodynamique",
    "https://www.tiktok.com:8443/search?q=thermodynamique",
    "https://www.tiktok.com.evil.example/search?q=thermodynamique",
    "https://www.tiktok.com@evil.example/search?q=thermodynamique"
  ]) {
    assert.equal(isConversationUrl(url, "tiktok"), false, url);
  }
});
