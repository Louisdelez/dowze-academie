import {
  ArrowRight,
  Eye,
  EyeOff,
  LockKeyhole,
  ShieldCheck,
  UserRound
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import etudeAppMark from "../assets/generated/etude-app-mark-v3.webp";
import type { RegisterLocalAccountInput } from "../lib/localAuth";
import { isTauri } from "../lib/tauri";

type AuthMode = "login" | "register";

interface AuthPageProps {
  hasAccounts: boolean;
  onLogin: (username: string, password: string, rememberMe: boolean) => Promise<void>;
  onRegister: (input: RegisterLocalAccountInput) => Promise<void>;
}

export function AuthPage({
  hasAccounts,
  onLogin,
  onRegister
}: AuthPageProps) {
  const [mode, setMode] = useState<AuthMode>(hasAccounts ? "login" : "register");
  const [displayName, setDisplayName] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirmation, setPasswordConfirmation] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const usernameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    usernameRef.current?.focus();
  }, [mode]);

  const switchMode = (nextMode: AuthMode) => {
    setMode(nextMode);
    setPassword("");
    setPasswordConfirmation("");
    setShowPassword(false);
    setRememberMe(false);
    setError(null);
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (isSubmitting) return;
    setError(null);
    if (mode === "register" && password !== passwordConfirmation) {
      setError("Les deux mots de passe ne correspondent pas.");
      return;
    }
    setIsSubmitting(true);
    try {
      if (mode === "login") {
        await onLogin(username, password, rememberMe);
      } else {
        await onRegister({ displayName, username, password });
      }
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : String(submitError));
      setIsSubmitting(false);
    }
  };

  return (
    <main className="auth-page">
      <div className="auth-window-drag" data-tauri-drag-region />
      <section className="auth-access" aria-labelledby="auth-title">
        <div className="auth-shell">
          <header className="auth-brand" aria-label="Dowze Academie, espace personnel de formation">
            <img src={etudeAppMark} alt="" aria-hidden="true" />
            <div><strong>Dowze Academie</strong><small>Espace personnel de formation</small></div>
          </header>

          <div className="auth-card">
            <p className="eyebrow">Compte local</p>
            <h1 id="auth-title">{mode === "login" ? "Se connecter" : "Créer ton compte"}</h1>
            <p className="auth-card-subtitle">
              {mode === "login"
                ? "Entre tes identifiants pour continuer."
                : "Renseigne tes identifiants pour commencer."}
            </p>

            <form className="auth-form" onSubmit={submit}>
              {mode === "register" && (
                <label>
                  <span>Nom affiché</span>
                  <div className="auth-input-shell">
                    <UserRound aria-hidden="true" />
                    <input
                      value={displayName}
                      onChange={(event) => setDisplayName(event.target.value)}
                      autoComplete="name"
                      required
                      minLength={2}
                      maxLength={60}
                      placeholder="Prénom ou pseudonyme"
                    />
                  </div>
                </label>
              )}

              <label>
                <span>Identifiant</span>
                <div className="auth-input-shell">
                  <UserRound aria-hidden="true" />
                  <input
                    ref={usernameRef}
                    value={username}
                    onChange={(event) => setUsername(event.target.value)}
                    autoCapitalize="none"
                    autoCorrect="off"
                    autoComplete="username"
                    required
                    minLength={3}
                    maxLength={64}
                    placeholder="mon.identifiant"
                  />
                </div>
                {mode === "register" && <small>3 à 64 lettres ASCII, chiffres, points, _ ou -, sans espace.</small>}
              </label>

              <label>
                <span>Mot de passe</span>
                <div className="auth-input-shell">
                  <LockKeyhole aria-hidden="true" />
                  <input
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    autoComplete={mode === "login" ? "current-password" : "new-password"}
                    required
                    minLength={10}
                    maxLength={256}
                    placeholder="10 caractères minimum"
                  />
                  <button
                    className="auth-password-toggle"
                    type="button"
                    onClick={() => setShowPassword((visible) => !visible)}
                    aria-label={showPassword ? "Masquer le mot de passe" : "Afficher le mot de passe"}
                    aria-pressed={showPassword}
                  >
                    {showPassword ? <EyeOff /> : <Eye />}
                  </button>
                </div>
              </label>

              {mode === "register" && (
                <label>
                  <span>Confirmer le mot de passe</span>
                  <div className="auth-input-shell">
                    <LockKeyhole aria-hidden="true" />
                    <input
                      type={showPassword ? "text" : "password"}
                      value={passwordConfirmation}
                      onChange={(event) => setPasswordConfirmation(event.target.value)}
                      autoComplete="new-password"
                      required
                      minLength={10}
                      maxLength={256}
                      placeholder="Répète ton mot de passe"
                    />
                  </div>
                </label>
              )}

              {mode === "login" && (
                <label className="auth-remember">
                  <input
                    type="checkbox"
                    checked={rememberMe}
                    onChange={(event) => setRememberMe(event.target.checked)}
                    aria-label="Se souvenir de moi"
                  />
                  <span>
                    <strong>Se souvenir de moi sur cet appareil</strong>
                    <small>
                      {isTauri()
                        ? "Identifiant et mot de passe protégés dans le coffre sécurisé du système."
                        : "Prévisualisation : la session de test reste dans ce navigateur."}
                    </small>
                  </span>
                </label>
              )}

              {error && <p className="auth-error" role="alert">{error}</p>}

              <button className="auth-submit" type="submit" disabled={isSubmitting}>
                {isSubmitting
                  ? <><span className="auth-spinner" /> Vérification…</>
                  : mode === "login"
                    ? <>Se connecter <ArrowRight /></>
                    : <>Créer le compte <ArrowRight /></>}
              </button>
            </form>

            <p className="auth-switch">
              {mode === "login" ? "Pas encore de profil ?" : "Tu as déjà un profil ?"}
              <button type="button" onClick={() => switchMode(mode === "login" ? "register" : "login")}>
                {mode === "login" ? "Créer un compte" : "Se connecter"}
              </button>
            </p>

            <div className="auth-local-note">
              <ShieldCheck aria-hidden="true" />
              <p><strong>Local, sans cloud</strong><span>Ce compte fonctionne uniquement sur cet appareil. Il ne synchronise aucune donnée en ligne.</span></p>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
