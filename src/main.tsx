import { Component, StrictMode, type ErrorInfo, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import RootApp from "./RootApp";
import "./styles.css";

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
        <main className="fatal-error" role="alert">
          <span aria-hidden="true">É</span>
          <h1>L’interface a rencontré un problème</h1>
          <p>Tes données locales sont conservées. Recharge l’application pour reprendre.</p>
          <button onClick={() => window.location.reload()}>Recharger Dowze Academie</button>
        </main>
      );
    }
    return this.props.children;
  }
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <AppErrorBoundary><RootApp /></AppErrorBoundary>
  </StrictMode>
);
