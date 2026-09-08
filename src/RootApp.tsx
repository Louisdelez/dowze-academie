import { useCallback, useEffect, useRef, useState } from "react";
import App from "./App";
import etudeAppMark from "./assets/generated/etude-app-mark-v3.webp";
import { AuthPage } from "./components/AuthPage";
import {
  getLocalAuthStatus,
  loginLocalAccount,
  logoutLocalAccount,
  registerLocalAccount,
  type LocalAccount,
  type RegisterLocalAccountInput
} from "./lib/localAuth";
import {
  clearLegacyWorkspaceData,
  workspaceStorageFor
} from "./lib/profileStorage";
import { resumeInterruptedProfileReset } from "./lib/profileReset";
import { secureAiPanelForAccountTransition } from "./lib/tauri";
import type { AiProvider, ToastMessage } from "./types";

const ACCOUNT_PROVIDERS = new Set<AiProvider>([
  "chatgpt", "claude", "gemini", "mistral", "deepseek", "kimi",
  "freechat", "duolingo", "youtube", "tiktok", "notebooklm"
]);

function accountProvider(accountId: string): AiProvider {
  try {
    const stored = JSON.parse(localStorage.getItem(workspaceStorageFor(accountId).provider) ?? "null");
    return typeof stored === "string" && ACCOUNT_PROVIDERS.has(stored as AiProvider)
      ? stored as AiProvider
      : "chatgpt";
  } catch {
    return "chatgpt";
  }
}

async function prepareProviderPanel(accountId: string): Promise<void> {
  const provider = accountProvider(accountId);
  await secureAiPanelForAccountTransition(provider);
}

async function failClosedAfterAuthentication(message: string, cause: unknown): Promise<never> {
  try {
    await logoutLocalAccount();
  } catch (logoutError) {
    throw new Error(
      `${message} La session locale n’a pas pu être refermée ; ferme puis rouvre Dowze Academie avant de réessayer. ${String(cause)} ${String(logoutError)}`
    );
  }
  throw new Error(`${message} La session a été refermée. ${String(cause)}`);
}

export default function RootApp() {
  const [account, setAccount] = useState<LocalAccount | null>(null);
  const [accountCount, setAccountCount] = useState(0);
  const [startupNotice, setStartupNotice] = useState<Omit<ToastMessage, "id"> | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const authLoadPromiseRef = useRef<Promise<void> | null>(null);

  const loadAuth = useCallback(async () => {
    if (authLoadPromiseRef.current) {
      await authLoadPromiseRef.current;
      return;
    }
    const loadPromise = (async () => {
      setIsLoading(true);
      setLoadError(null);
      try {
        const status = await getLocalAuthStatus();
        if (status.accounts.length === 0) clearLegacyWorkspaceData();
        if (status.activeAccount) {
          try {
            await prepareProviderPanel(status.activeAccount.id);
            if (await resumeInterruptedProfileReset(status.activeAccount.id)) {
              setStartupNotice({
                title: "Réinitialisation terminée",
                detail: "L’opération interrompue a repris automatiquement. Ton espace est maintenant prêt et remis à zéro.",
                tone: "success"
              });
            }
          } catch (error) {
            await failClosedAfterAuthentication(
              "La connexion mémorisée a été vérifiée, mais l’espace n’a pas pu être rouvert en sécurité.",
              error
            );
          }
        } else {
          await secureAiPanelForAccountTransition("chatgpt");
        }
        setAccountCount(status.accounts.length);
        setAccount(status.activeAccount ?? null);
      } catch (error) {
        setLoadError(error instanceof Error ? error.message : String(error));
      } finally {
        setIsLoading(false);
      }
    })();
    authLoadPromiseRef.current = loadPromise;
    try {
      await loadPromise;
    } finally {
      if (authLoadPromiseRef.current === loadPromise) authLoadPromiseRef.current = null;
    }
  }, []);

  useEffect(() => {
    void loadAuth();
  }, [loadAuth]);

  if (isLoading) {
    return (
      <main className="auth-loading" aria-live="polite" aria-busy="true">
        <img src={etudeAppMark} alt="" aria-hidden="true" />
        <span className="section-loading-spinner" aria-hidden="true" />
        <p>Ouverture de ton espace Dowze Academie…</p>
      </main>
    );
  }

  if (loadError) {
    return (
      <main className="fatal-error" role="alert">
        <span aria-hidden="true">D</span>
        <h1>Les comptes locaux sont indisponibles</h1>
        <p>{loadError}</p>
        <button onClick={() => void loadAuth()}>Réessayer</button>
      </main>
    );
  }

  if (!account) {
    return (
      <AuthPage
        hasAccounts={accountCount > 0}
        onLogin={async (username, password, rememberMe) => {
          const loggedIn = await loginLocalAccount(username, password, rememberMe);
          try {
            await prepareProviderPanel(loggedIn.id);
            if (await resumeInterruptedProfileReset(loggedIn.id)) {
              setStartupNotice({
                title: "Réinitialisation terminée",
                detail: "L’opération interrompue a repris automatiquement. Ton espace est maintenant prêt et remis à zéro.",
                tone: "success"
              });
            }
          } catch (error) {
            await failClosedAfterAuthentication(
              "La connexion a été vérifiée, mais l’espace n’a pas pu être ouvert en sécurité.",
              error
            );
          }
          setAccount(loggedIn);
        }}
        onRegister={async (input: RegisterLocalAccountInput) => {
          const registered = await registerLocalAccount(input);
          try {
            await prepareProviderPanel(registered.id);
          } catch (error) {
            setAccountCount((count) => count + 1);
            await failClosedAfterAuthentication(
              "Le compte a bien été créé, mais son espace n’a pas pu être ouvert en sécurité. Passe sur « Se connecter » puis réessaie.",
              error
            );
          }
          setAccountCount((count) => count + 1);
          setAccount(registered);
        }}
      />
    );
  }

  return (
    <App
      key={account.id}
      account={account}
      startupNotice={startupNotice}
      onLogout={async () => {
        await secureAiPanelForAccountTransition("chatgpt");
        await logoutLocalAccount();
        setStartupNotice(null);
        setAccount(null);
        const status = await getLocalAuthStatus();
        setAccountCount(status.accounts.length);
      }}
    />
  );
}
