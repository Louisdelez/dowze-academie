import { invoke } from "@tauri-apps/api/core";
import { isTauri } from "./tauri";
import type { AiSessionMode } from "../types";

export const FREE_CHAT_STORAGE = {
  conversations: "etude.free-chat.conversations.v1",
  activeConversation: "etude.free-chat.active.v1",
  config: "etude.free-chat.config.v1",
  backend: "etude.free-chat.backend.v1"
} as const;

export type FreeChatBackend =
  | "openai"
  | "mistral"
  | "deepseek"
  | "kimi"
  | "compatible"
  | "ollama";

export type FreeChatRole = "system" | "user" | "assistant";

export interface FreeChatApiMessage {
  role: FreeChatRole;
  content: string;
  reasoningContent?: string;
}

export type StoredFreeChatMessage = FreeChatApiMessage & {
  id: string;
  createdAt: string;
  reasoningContent?: string;
};

export interface FreeChatCourseContext {
  key: string;
  requestId: string;
  prompt: string;
  title: string;
  subjectId: string;
  curriculumScope?: string;
  moduleId?: string;
  itemId?: string;
  lessonUnitId?: string;
  lessonMode: AiSessionMode;
}

export interface StoredFreeChatConversation {
  id: string;
  title: string;
  name?: string;
  note?: string;
  backend: FreeChatBackend;
  model: string;
  endpoint?: string;
  contextKey?: string;
  contextTitle?: string;
  subjectId?: string;
  curriculumScope?: string;
  moduleId?: string;
  itemId?: string;
  lessonUnitId?: string;
  lessonMode?: AiSessionMode;
  messages: StoredFreeChatMessage[];
  createdAt: string;
  updatedAt: string;
}

export interface FreeChatRequest {
  backend: FreeChatBackend;
  model: string;
  messages: FreeChatApiMessage[];
  endpoint?: string;
}

export interface FreeChatReply {
  content: string;
  model: string;
  reasoningContent?: string;
}

export interface FreeChatKeyStatus {
  backend: Exclude<FreeChatBackend, "ollama">;
  configured: boolean;
}

export async function sendFreeChatMessage(
  request: FreeChatRequest
): Promise<FreeChatReply> {
  if (!isTauri()) {
    throw new Error("Le Chat libre utilise le moteur sécurisé de l’application de bureau.");
  }
  return invoke<FreeChatReply>("send_free_chat_message", { request });
}

export async function getFreeChatKeyStatus(endpoint?: string): Promise<FreeChatKeyStatus[]> {
  if (!isTauri()) return [];
  return invoke<FreeChatKeyStatus[]>("free_chat_key_status", { endpoint });
}

export async function saveFreeChatApiKey(
  backend: Exclude<FreeChatBackend, "ollama">,
  apiKey: string,
  endpoint?: string
): Promise<void> {
  if (!isTauri()) {
    throw new Error("Le coffre sécurisé est disponible dans l’application de bureau.");
  }
  await invoke("save_free_chat_api_key", { backend, apiKey, endpoint });
}

export async function deleteFreeChatApiKey(
  backend: Exclude<FreeChatBackend, "ollama">,
  endpoint?: string
): Promise<boolean> {
  if (!isTauri()) return false;
  return invoke<boolean>("delete_free_chat_api_key", { backend, endpoint });
}

export async function listOllamaModels(endpoint: string): Promise<string[]> {
  if (!isTauri()) {
    throw new Error("La détection d’Ollama est disponible dans l’application de bureau.");
  }
  return invoke<string[]>("list_ollama_models", { endpoint });
}
