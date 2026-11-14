import type { AiProvider, Conversation, AssessmentRecord, PaperAssessmentConfig } from "../types";
import type { StoredFreeChatConversation } from "./freeChat";
const HISTORY_PROVIDERS = new Set<AiProvider>([
  "chatgpt", "claude", "gemini", "mistral", "deepseek", "kimi",
  "freechat", "youtube", "tiktok", "notebooklm"
]);
const RECORDED_ASSESSMENT_KINDS = new Set([
  "mini-test", "test", "control", "midterm", "exam", "final-exam",
  "written-practical", "resit", "evaluation"
]);
const FREE_CHAT_BACKENDS = new Set(["openai", "mistral", "deepseek", "kimi", "compatible", "ollama"]);

export function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isRecordArray(value: unknown): value is Record<string, unknown>[] {
  return Array.isArray(value) && value.every(isRecord);
}

function isOptionalString(value: unknown) {
  return value === undefined || typeof value === "string";
}

function isIsoDate(value: unknown) {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

function isStoredLessonMode(value: unknown) {
  return value === undefined || [
    "course", "exercises", "chapter-test", "paper-assessment", "assessment-correction"
  ].includes(value as string);
}

const PAPER_ASSESSMENT_KINDS = new Set([
  "test", "control", "midterm", "exam", "final-exam",
  "written-practical", "resit", "evaluation"
]);

function isStoredPaperAssessment(value: unknown): value is PaperAssessmentConfig | undefined {
  if (value === undefined) return true;
  if (!isRecord(value)) return false;
  const chapterIds = value.chapterIds;
  return typeof value.eventId === "string" && value.eventId.length > 0 &&
    typeof value.kind === "string" && PAPER_ASSESSMENT_KINDS.has(value.kind) &&
    typeof value.title === "string" && value.title.length > 0 &&
    isIsoDate(value.scheduledAt) &&
    typeof value.durationMinutes === "number" && Number.isInteger(value.durationMinutes) &&
    value.durationMinutes >= 10 && value.durationMinutes <= 360 &&
    Array.isArray(chapterIds) && chapterIds.length > 0 &&
    chapterIds.every((id) => typeof id === "string" && id.length > 0) &&
    new Set(chapterIds).size === chapterIds.length &&
    typeof value.allowedMaterials === "string" && value.allowedMaterials.length > 0 &&
    isOptionalString(value.instructions);
}

export function isStoredConversations(value: unknown): value is Conversation[] {
  return isRecordArray(value) && value.every((conversation) =>
    typeof conversation.id === "string" &&
    typeof conversation.subjectId === "string" &&
    typeof conversation.provider === "string" && HISTORY_PROVIDERS.has(conversation.provider as AiProvider) &&
    typeof conversation.url === "string" &&
    isIsoDate(conversation.createdAt) &&
    isOptionalString(conversation.moduleId) &&
    isOptionalString(conversation.curriculumScope) &&
    isOptionalString(conversation.itemId) &&
    isOptionalString(conversation.lessonUnitId) &&
    isStoredLessonMode(conversation.lessonMode) &&
    isOptionalString(conversation.lessonTitle) &&
    (conversation.kind === undefined || conversation.kind === "lesson" || conversation.kind === "general") &&
    isStoredPaperAssessment(conversation.assessment) &&
    isOptionalString(conversation.localConversationId) &&
    isOptionalString(conversation.name) &&
    isOptionalString(conversation.note)
  );
}

export function isStoredFreeChatConversations(value: unknown): value is StoredFreeChatConversation[] {
  return isRecordArray(value) && value.every((conversation) =>
    typeof conversation.id === "string" &&
    typeof conversation.title === "string" &&
    typeof conversation.backend === "string" && FREE_CHAT_BACKENDS.has(conversation.backend) &&
    typeof conversation.model === "string" &&
    isOptionalString(conversation.endpoint) &&
    Array.isArray(conversation.messages) && conversation.messages.every((message) =>
      isRecord(message) &&
      typeof message.id === "string" &&
      ["system", "user", "assistant"].includes(message.role as string) &&
      typeof message.content === "string" &&
      isOptionalString(message.reasoningContent) &&
      isIsoDate(message.createdAt)
    ) &&
    isIsoDate(conversation.createdAt) &&
    isIsoDate(conversation.updatedAt) &&
    isOptionalString(conversation.name) &&
    isOptionalString(conversation.note) &&
    isOptionalString(conversation.contextKey) &&
    isOptionalString(conversation.contextTitle) &&
    isOptionalString(conversation.subjectId) &&
    isOptionalString(conversation.curriculumScope) &&
    isOptionalString(conversation.moduleId) &&
    isOptionalString(conversation.itemId) &&
    isOptionalString(conversation.lessonUnitId) &&
    isStoredLessonMode(conversation.lessonMode)
  );
}

export function isStoredAssessments(value: unknown): value is AssessmentRecord[] {
  return isRecordArray(value) && value.every((assessment) =>
    typeof assessment.id === "string" &&
    typeof assessment.subjectId === "string" &&
    typeof assessment.title === "string" &&
    typeof assessment.kind === "string" && RECORDED_ASSESSMENT_KINDS.has(assessment.kind) &&
    isIsoDate(assessment.assessmentDate) &&
    typeof assessment.score === "number" && Number.isFinite(assessment.score) &&
    typeof assessment.maxScore === "number" && Number.isFinite(assessment.maxScore) && assessment.maxScore > 0 &&
    (assessment.coefficient === undefined || (typeof assessment.coefficient === "number" && Number.isFinite(assessment.coefficient) && assessment.coefficient >= 0.1 && assessment.coefficient <= 20)) &&
    typeof assessment.appreciation === "string" &&
    isOptionalString(assessment.personalNote) &&
    isOptionalString(assessment.conversationId) &&
    isOptionalString(assessment.conversationUrl) &&
    (assessment.provider === undefined || (typeof assessment.provider === "string" && HISTORY_PROVIDERS.has(assessment.provider as AiProvider))) &&
    isStoredAssessmentPdf(assessment.blankPdf) &&
    isStoredAssessmentPdf(assessment.completedPdf) &&
    isIsoDate(assessment.createdAt) &&
    isIsoDate(assessment.updatedAt)
  );
}

function isStoredAssessmentPdf(value: unknown) {
  return value === undefined || (
    isRecord(value) &&
    typeof value.originalName === "string" &&
    typeof value.sizeBytes === "number" && Number.isFinite(value.sizeBytes) && value.sizeBytes >= 0 &&
    isIsoDate(value.importedAt)
  );
}

