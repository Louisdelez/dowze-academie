import {bindNotebookWorkspaceClose} from './lib/notebookWorkspaceClose';
import {hasPendingNotebookWrites} from './lib/notebookSession';
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { isTauri } from "./lib/tauri";
import { appStorage } from "./lib/appStorage";
import { Component, StrictMode, type ErrorInfo, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import RootApp from "./RootApp";
import { RecoveryScreen } from "./components/RecoveryScreen";
import { StartupSplash } from './components/StartupSplash';
import { appUpdates } from './lib/nativeUpdates';
import { startupUpdates } from './lib/startupUpdates';
import "./styles.css";
import "./ui-system.css";
import "./workspace-redesign.css";
import "./learning-redesign.css";
import "./planning-redesign.css";
import "./components/account-surfaces.css";
import "./components/studio-tools.css";
import "../pwa/src/shared-study.css";
import "./dialogs-redesign.css";
import "./desktop-ergonomics.css";
import "./design-tokens.css";
import "./study-desk.css";
import "./panel-edge-tabs.css";
import "./workspace-tabs.css";

class AppErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Dowze Academie a intercepté une erreur d’interface.", error, info.componentStack);
  }

  render() {
    if (this.state.failed) {
      return (
        <RecoveryScreen title="Reprenons votre espace" message="L’interface a rencontré un problème. Les données déjà enregistrées seront retrouvées après rechargement." onRetry={() => window.location.reload()} />
      );
    }
    return this.props.children;
  }
}

async function start() {
  const root = createRoot(document.getElementById("root")!);
  root.render(<StartupSplash label="Ouverture de ton espace…" />);
  const ready = appStorage.initialize(window.localStorage);
  try {
    if (isTauri()) {
      const close=bindNotebookWorkspaceClose({cache:appStorage,ready,body:document.body});
      await close.ready;
      window.addEventListener('pagehide',()=>{void close.dispose().catch(()=>{});},{once:true});
      await listen('automatic-update-installing', () => root.render(<StartupSplash installing />));
    }
    window.addEventListener('beforeunload', event => {
      if (appStorage.status().pending || appStorage.status().error||hasPendingNotebookWrites()) { event.preventDefault(); event.returnValue = ''; }
    });
    await ready;
    if (isTauri()) {
      appStorage.freeze();
      try {
        await appStorage.flush();
        await startupUpdates(appUpdates, navigator.onLine, () => invoke('automatic_update_boot'));
      }
      catch (error) { console.warn('Mise à jour différée ; ouverture de la version actuelle.', error); }
      finally { appStorage.unfreeze(); }
    }
    void navigator.storage?.persist?.().catch(() => false);
    root.render(<StrictMode><AppErrorBoundary><RootApp /></AppErrorBoundary></StrictMode>);
  } catch {
    root.render(<RecoveryScreen title="Votre espace n’a pas pu être ouvert" message="Les données existantes sont conservées. Libérez de l’espace sur cet appareil, puis réessayez." onRetry={() => window.location.reload()} />);
  }
}
void start();
