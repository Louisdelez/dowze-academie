import { invoke } from "@tauri-apps/api/core";
import { isValidLocalAccountId } from "./profileStorage.ts";
import { isTauri } from "./tauri.ts";

const AUTH_REGISTRY_KEY = "etude.auth.accounts.v1";
const AUTH_SESSION_KEY = "etude.auth.session.v1";
const AUTH_REMEMBERED_SESSION_KEY = "etude.auth.remembered-session.v1";
const PASSWORD_ITERATIONS = 310_000;
const PASSWORD_MIN_LENGTH = 10;
const PASSWORD_MAX_LENGTH = 256;

interface StoredLocalAccount {
  id: string;
  displayName: string;
  username: string;
  passwordSalt: string;
  passwordVerifier: string;
  passwordIterations: number;
  createdAt: string;
  lastLoginAt: string;
}

interface StoredAccountRegistry {
  version: 1;
  accounts: StoredLocalAccount[];
}

interface StoredAuthSession {
  version: 1;
  accountId: string;
}

export interface LocalAccount {
  id: string;
  displayName: string;
  username: string;
  createdAt: string;
}

export interface LocalAuthStatus {
  accounts: LocalAccount[];
  activeAccount?: LocalAccount;
}

export interface RegisterLocalAccountInput {
  displayName: string;
  username: string;
  password: string;
}

export class LocalAuthError extends Error {
  readonly code:
    | "invalid-display-name"
    | "invalid-username"
    | "invalid-password"
    | "username-taken"
    | "invalid-credentials"
    | "storage-unavailable";

  constructor(
    code:
      | "invalid-display-name"
      | "invalid-username"
      | "invalid-password"
      | "username-taken"
      | "invalid-credentials"
      | "storage-unavailable",
    message: string
  ) {
    super(message);
    this.name = "LocalAuthError";
    this.code = code;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isIsoDate(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

function isStoredLocalAccount(value: unknown): value is StoredLocalAccount {
  return isRecord(value) &&
    typeof value.id === "string" && isValidLocalAccountId(value.id) &&
    typeof value.displayName === "string" && [...value.displayName].length >= 1 && [...value.displayName].length <= 80 &&
    new TextEncoder().encode(value.displayName).length <= 320 &&
    typeof value.username === "string" && value.username.length >= 3 && value.username.length <= 64 &&
    typeof value.passwordSalt === "string" && /^[0-9a-f]{32}$/i.test(value.passwordSalt) &&
    typeof value.passwordVerifier === "string" && /^[0-9a-f]{64}$/i.test(value.passwordVerifier) &&
    typeof value.passwordIterations === "number" && Number.isInteger(value.passwordIterations) &&
    value.passwordIterations >= 100_000 && value.passwordIterations <= 2_000_000 &&
    isIsoDate(value.createdAt) && isIsoDate(value.lastLoginAt);
}

function emptyRegistry(): StoredAccountRegistry {
  return { version: 1, accounts: [] };
}

function loadRegistry(): StoredAccountRegistry {
  let stored: string | null = null;
  try {
    stored = window.localStorage.getItem(AUTH_REGISTRY_KEY);
    if (stored === null) return emptyRegistry();
    const parsed: unknown = JSON.parse(stored);
    if (
      isRecord(parsed) &&
      parsed.version === 1 &&
      Array.isArray(parsed.accounts) &&
      parsed.accounts.every(isStoredLocalAccount)
    ) {
      const accounts = parsed.accounts as StoredLocalAccount[];
      const usernames = new Set(accounts.map((account) => account.username));
      const accountIds = new Set(accounts.map((account) => account.id));
      const canonical = accounts.every((account) =>
        account.id === account.id.toLowerCase() &&
        validateLocalUsername(account.username) === account.username &&
        account.displayName === account.displayName.trim() &&
        !/[\u0000-\u001f\u007f]/.test(account.displayName)
      );
      if (
        canonical &&
        usernames.size === accounts.length &&
        accountIds.size === accounts.length
      ) return parsed as unknown as StoredAccountRegistry;
    }
    throw new Error("Le registre des comptes locaux est invalide.");
  } catch (error) {
    if (stored) {
      try {
        const recoveryKey = `${AUTH_REGISTRY_KEY}.recovery`;
        if (!window.localStorage.getItem(recoveryKey)) {
          window.localStorage.setItem(recoveryKey, stored);
        }
      } catch {
        // La copie de récupération est best-effort lorsque le quota est épuisé.
      }
    }
    throw new LocalAuthError(
      "storage-unavailable",
      error instanceof Error ? error.message : "Impossible de lire les comptes locaux."
    );
  }
}

function saveRegistry(registry: StoredAccountRegistry): void {
  try {
    window.localStorage.setItem(AUTH_REGISTRY_KEY, JSON.stringify(registry));
  } catch {
    throw new LocalAuthError(
      "storage-unavailable",
      "Impossible d’enregistrer le compte sur cet appareil. Libère de l’espace puis réessaie."
    );
  }
}

function publicAccount(account: StoredLocalAccount): LocalAccount {
  return {
    id: account.id,
    displayName: account.displayName,
    username: account.username,
    createdAt: account.createdAt
  };
}

function clearBrowserSessions(): void {
  try {
    window.sessionStorage.removeItem(AUTH_SESSION_KEY);
    window.localStorage.removeItem(AUTH_REMEMBERED_SESSION_KEY);
    if (
      window.sessionStorage.getItem(AUTH_SESSION_KEY) !== null ||
      window.localStorage.getItem(AUTH_REMEMBERED_SESSION_KEY) !== null
    ) {
      throw new Error("La session locale est toujours présente.");
    }
  } catch {
    throw new LocalAuthError(
      "storage-unavailable",
      "La session locale ne peut pas être supprimée."
    );
  }
}

function clearBrowserSessionsBestEffort(): void {
  try {
    window.sessionStorage.removeItem(AUTH_SESSION_KEY);
  } catch {
    // La suppression vérifiée reste assurée par clearBrowserSessions.
  }
  try {
    window.localStorage.removeItem(AUTH_REMEMBERED_SESSION_KEY);
  } catch {
    // La suppression vérifiée reste assurée par clearBrowserSessions.
  }
}

function setSession(accountId: string, rememberMe = false): void {
  clearBrowserSessions();
  const session: StoredAuthSession = { version: 1, accountId };
  const serialized = JSON.stringify(session);
  try {
    const storage = rememberMe ? window.localStorage : window.sessionStorage;
    const key = rememberMe ? AUTH_REMEMBERED_SESSION_KEY : AUTH_SESSION_KEY;
    storage.setItem(key, serialized);
    if (storage.getItem(key) !== serialized) {
      throw new Error("La session locale n’a pas pu être vérifiée.");
    }
  } catch {
    clearBrowserSessionsBestEffort();
    throw new LocalAuthError(
      "storage-unavailable",
      rememberMe
        ? "La session ne peut pas être mémorisée sur cet appareil."
        : "La session locale ne peut pas être ouverte."
    );
  }
}

function parseStoredSession(raw: string): StoredAuthSession | null {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (
      !isRecord(parsed) ||
      Object.keys(parsed).length !== 2 ||
      parsed.version !== 1 ||
      typeof parsed.accountId !== "string" ||
      !isValidLocalAccountId(parsed.accountId)
    ) return null;
    return parsed as unknown as StoredAuthSession;
  } catch {
    return null;
  }
}

function storedBrowserAccountId(): string | null {
  let transientRaw: string | null;
  let rememberedRaw: string | null;
  try {
    transientRaw = window.sessionStorage.getItem(AUTH_SESSION_KEY);
    rememberedRaw = window.localStorage.getItem(AUTH_REMEMBERED_SESSION_KEY);
  } catch {
    throw new LocalAuthError("storage-unavailable", "La session locale ne peut pas être lue.");
  }
  if (!transientRaw && !rememberedRaw) return null;
  if (transientRaw && rememberedRaw) {
    clearBrowserSessionsBestEffort();
    return null;
  }
  const session = parseStoredSession(transientRaw ?? rememberedRaw!);
  if (!session) {
    clearBrowserSessionsBestEffort();
    return null;
  }
  return session.accountId;
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function hexToBytes(hexadecimal: string): Uint8Array {
  const bytes = new Uint8Array(hexadecimal.length / 2);
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Number.parseInt(hexadecimal.slice(index * 2, index * 2 + 2), 16);
  }
  return bytes;
}

async function derivePasswordVerifier(
  password: string,
  saltHex: string,
  iterations: number
): Promise<string> {
  const passwordKey = await globalThis.crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"]
  );
  const bits = await globalThis.crypto.subtle.deriveBits({
    name: "PBKDF2",
    hash: "SHA-256",
    salt: hexToBytes(saltHex) as BufferSource,
    iterations
  }, passwordKey, 256);
  return bytesToHex(new Uint8Array(bits));
}

function constantTimeEqual(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return difference === 0;
}

async function withBrowserAuthLock<T>(operation: () => Promise<T>): Promise<T> {
  const lockManager = globalThis.navigator?.locks;
  if (!lockManager) return operation();
  return lockManager.request("etude-local-auth", { mode: "exclusive" }, operation);
}

export function normalizeLocalUsername(username: string): string {
  return username.trim().toLowerCase();
}

export function validateLocalUsername(username: string): string {
  const normalized = normalizeLocalUsername(username);
  if (
    normalized.length < 3 ||
    normalized.length > 64 ||
    !/^[a-z0-9][a-z0-9._-]*[a-z0-9]$/.test(normalized)
  ) {
    throw new LocalAuthError(
      "invalid-username",
      "L’identifiant doit contenir 3 à 64 lettres ASCII ou chiffres, peut inclure . _ -, et doit commencer et finir par une lettre ou un chiffre."
    );
  }
  return normalized;
}

export function validateLocalPassword(password: string): void {
  const characterCount = [...password].length;
  if (
    characterCount < PASSWORD_MIN_LENGTH ||
    characterCount > PASSWORD_MAX_LENGTH ||
    new TextEncoder().encode(password).length > 1024 ||
    /[\u0000-\u001f\u007f]/.test(password) ||
    password.trim().length === 0
  ) {
    throw new LocalAuthError(
      "invalid-password",
      `Le mot de passe doit contenir entre ${PASSWORD_MIN_LENGTH} et ${PASSWORD_MAX_LENGTH} caractères.`
    );
  }
}

export function listLocalAccounts(): LocalAccount[] {
  if (isTauri()) return [];
  try {
    return loadRegistry().accounts.map(publicAccount);
  } catch {
    return [];
  }
}

export function activeLocalAccount(): LocalAccount | null {
  if (isTauri()) return null;
  try {
    const accountId = storedBrowserAccountId();
    if (!accountId) return null;
    const account = loadRegistry().accounts.find((candidate) => candidate.id === accountId);
    if (!account) {
      clearBrowserSessionsBestEffort();
      return null;
    }
    return publicAccount(account);
  } catch {
    clearBrowserSessionsBestEffort();
    return null;
  }
}

export async function registerLocalAccount(
  input: RegisterLocalAccountInput
): Promise<LocalAccount> {
  if (isTauri()) {
    return invoke<LocalAccount>("register_local_account", {
      displayName: input.displayName,
      username: input.username,
      password: input.password
    });
  }
  const displayName = input.displayName.trim();
  if (
    [...displayName].length < 1 ||
    [...displayName].length > 80 ||
    new TextEncoder().encode(displayName).length > 320 ||
    /[\u0000-\u001f\u007f]/.test(displayName)
  ) {
    throw new LocalAuthError(
      "invalid-display-name",
      "Le nom affiché doit contenir entre 1 et 80 caractères."
    );
  }
  const username = validateLocalUsername(input.username);
  validateLocalPassword(input.password);

  const salt = bytesToHex(globalThis.crypto.getRandomValues(new Uint8Array(16)));
  const passwordVerifier = await derivePasswordVerifier(input.password, salt, PASSWORD_ITERATIONS);
  return withBrowserAuthLock(async () => {
    const registry = loadRegistry();
    if (registry.accounts.some((account) => account.username === username)) {
      throw new LocalAuthError("username-taken", "Cet identifiant local est déjà utilisé.");
    }
    const now = new Date().toISOString();
    const account: StoredLocalAccount = {
      id: globalThis.crypto.randomUUID(),
      displayName,
      username,
      passwordSalt: salt,
      passwordVerifier,
      passwordIterations: PASSWORD_ITERATIONS,
      createdAt: now,
      lastLoginAt: now
    };

    saveRegistry({ ...registry, accounts: [...registry.accounts, account] });
    try {
      setSession(account.id);
    } catch (error) {
      saveRegistry(registry);
      throw error;
    }
    return publicAccount(account);
  });
}

export async function loginLocalAccount(
  usernameInput: string,
  password: string,
  rememberMe = false
): Promise<LocalAccount> {
  if (isTauri()) {
    return invoke<LocalAccount>("login_local_account", {
      username: usernameInput,
      password,
      rememberMe
    });
  }
  const username = normalizeLocalUsername(usernameInput);
  return withBrowserAuthLock(async () => {
    const registry = loadRegistry();
    const account = registry.accounts.find((candidate) => candidate.username === username);
    if (!account) {
      throw new LocalAuthError("invalid-credentials", "Identifiant ou mot de passe incorrect.");
    }
    const verifier = await derivePasswordVerifier(
      password,
      account.passwordSalt,
      account.passwordIterations
    );
    if (!constantTimeEqual(verifier, account.passwordVerifier)) {
      throw new LocalAuthError("invalid-credentials", "Identifiant ou mot de passe incorrect.");
    }
    setSession(account.id, rememberMe);
    return publicAccount(account);
  });
}

export async function logoutLocalAccount(): Promise<void> {
  if (isTauri()) {
    await invoke("logout_local_account");
    return;
  }
  try {
    clearBrowserSessions();
  } catch {
    throw new LocalAuthError(
      "storage-unavailable",
      "La déconnexion locale n’a pas pu être vérifiée. Réessaie avant de quitter ce profil."
    );
  }
}

export async function getLocalAuthStatus(): Promise<LocalAuthStatus> {
  if (isTauri()) return invoke<LocalAuthStatus>("local_account_status");
  const registry = loadRegistry();
  const accounts = registry.accounts.map(publicAccount);
  const accountId = storedBrowserAccountId();
  if (!accountId) return { accounts };
  const activeAccount = accounts.find((account) => account.id === accountId);
  if (activeAccount) return { accounts, activeAccount };
  clearBrowserSessionsBestEffort();
  return { accounts };
}

export const LOCAL_AUTH_STORAGE_KEYS = {
  accounts: AUTH_REGISTRY_KEY,
  session: AUTH_SESSION_KEY,
  rememberedSession: AUTH_REMEMBERED_SESSION_KEY
} as const;
