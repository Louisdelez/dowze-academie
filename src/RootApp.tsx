import { appStorage } from "./lib/appStorage";
import { startUpdateChecks } from './lib/nativeUpdates';
import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from '@tauri-apps/api/core';
import App from "./App";
import { StartupSplash } from './components/StartupSplash';
import { AuthPage } from "./components/AuthPage";
import { RecoveryScreen } from "./components/RecoveryScreen";
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
import { secureAiPanelForAccountTransition, isTauri } from "./lib/tauri";
import type { AiProvider, ToastMessage } from "./types";

const ACCOUNT_PROVIDERS = new Set<AiProvider>([
  "chatgpt", "claude", "gemini", "mistral", "kimi",
  "freechat", "duolingo", "khanacademy", "youtube", "tiktok", "notebooklm"
]);

function accountProvider(accountId: string): AiProvider {
  try {
    const stored = JSON.parse(appStorage.getItem(workspaceStorageFor(accountId).provider) ?? "null");
    return typeof stored === "string" && ACCOUNT_PROVIDERS.has(stored as AiProvider)
      ? stored as AiProvider
      : "chatgpt";
  } catch {
    return "chatgpt";
  }
}

async function prepareProviderPanel(accountId: string, resume = false): Promise<void> {
  const provider = accountProvider(accountId);
  await secureAiPanelForAccountTransition(provider, resume ? accountId : undefined);
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
            await prepareProviderPanel(status.activeAccount.id, true);
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
    startUpdateChecks();
    void loadAuth();
  }, [loadAuth]);

  useEffect(() => {
    if (!isLoading && isTauri()) void invoke('startup_workspace_ready').catch(console.warn);
  }, [isLoading]);

  if (isLoading) {
    return <StartupSplash label="Ouverture de ton espace…" />;
  }

  if (loadError) {
    return (
      <RecoveryScreen title="Votre espace ne peut pas encore s’ouvrir" message="Vos données sont conservées. Réessayez pour retrouver votre compte et vos cours." detail={loadError} onRetry={() => void loadAuth()} />
    );
  }

  if (!account) {
    return (
      <AuthPage
        hasAccounts={accountCount > 0}
        onCloudLogin={isTauri() ? async (email, password, register, rememberMe) => {
          const result = await invoke<{ account: LocalAccount; server: { id: string; email: string } }>('login_synchronized_account', { email, password, register, rememberMe, offline: !navigator.onLine });
          try {
            await prepareProviderPanel(result.account.id);
            const key = `dowze.server.link.${result.account.id}`;
            const value = JSON.stringify(result.server);
            appStorage.setItem(key, value);
            appStorage.setItem(`dowze.server.owner.${result.account.id}`, value);
            if (appStorage.getItem(key) !== value) throw new Error('Liaison du compte non enregistrée.');
          } catch (error) { await failClosedAfterAuthentication('Le compte a été vérifié mais son espace ne peut pas être ouvert.', error); }
          setAccount(result.account);
        } : undefined}
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
