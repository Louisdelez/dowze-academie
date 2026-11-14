import { RotateCcw, ShieldCheck } from "lucide-react";

export function RecoveryScreen({ title, message, detail, onRetry }: {
  title: string;
  message: string;
  detail?: string;
  onRetry: () => void;
}) {
  return <main className="recovery-screen" aria-labelledby="recovery-title">
    <section>
      <p className="recovery-brand">Dowze Académie</p>
      <span className="recovery-symbol" aria-hidden="true"><ShieldCheck /></span>
      <h1 id="recovery-title">{title}</h1>
      <p role="alert">{message}</p>
      <button className="primary-button" onClick={onRetry}><RotateCcw aria-hidden="true" /> Réessayer</button>
      {detail && <details><summary>Voir le détail du problème</summary><p>{detail}</p></details>}
    </section>
  </main>;
}
