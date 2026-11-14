import "./account-surfaces.css";
import {
  ArrowRight,
  Eye,
  EyeOff,
  LockKeyhole,
  ShieldCheck,
  UserRound
} from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import type { FormEvent } from "react";
import etudeAppMark from "../assets/generated/etude-app-mark-v3.webp";
import type { RegisterLocalAccountInput } from "../lib/localAuth";
import { isTauri } from "../lib/tauri";

type AuthMode = "login" | "register";

interface AuthPageProps {
  hasAccounts: boolean;
  onLogin: (username: string, password: string, rememberMe: boolean) => Promise<void>;
  onRegister: (input: RegisterLocalAccountInput) => Promise<void>;
  onCloudLogin?: (email: string, password: string, register: boolean, rememberMe: boolean) => Promise<void>;
}

export function AuthPage({
  hasAccounts,
  onLogin,
  onRegister,
  onCloudLogin
}: AuthPageProps) {
  const [mode, setMode] = useState<AuthMode>(onCloudLogin || hasAccounts ? "login" : "register");
  const [cloud, setCloud] = useState(Boolean(onCloudLogin));
  const [displayName, setDisplayName] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirmation, setPasswordConfirmation] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const errorId = useId();
  const passwordHelpId = useId();
  const confirmationRef = useRef<HTMLInputElement>(null);
  const usernameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    usernameRef.current?.focus();
  }, [mode, cloud]);

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
      setError("Les deux mots de passe ne correspondent pas. Répète le même mot de passe.");
      confirmationRef.current?.focus();
      return;
    }
    setIsSubmitting(true);
    try {
      if (cloud && onCloudLogin) {
        await onCloudLogin(username.trim(), password, mode === 'register', rememberMe);
      } else if (mode === "login") {
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
      <div className="auth-window-drag" />
      <section className="auth-access" aria-labelledby="auth-title">
        <div className="auth-shell">
          <header className="auth-brand" aria-label="Dowze Academie, espace personnel de formation">
            <img src={etudeAppMark} alt="" aria-hidden="true" />
            <div><strong>Dowze Academie</strong><small>Espace personnel de formation</small></div>
          </header>

          <div className="auth-card">
            <p className="auth-account-kind">{cloud ? 'Compte synchronisé' : 'Profil sur cet appareil'}</p>
            {onCloudLogin && <button className="auth-account-route" type="button" disabled={isSubmitting} onClick={() => { setCloud(!cloud); switchMode('login'); setUsername(''); }}>{cloud ? 'Ouvrir un ancien profil local' : 'Utiliser mon compte synchronisé'}</button>}
            <h1 id="auth-title">{mode === "login" ? "Se connecter" : "Créer ton compte"}</h1>
            <p className="auth-card-subtitle">
              {mode === "login"
                ? "Entre tes identifiants pour continuer."
                : "Renseigne tes identifiants pour commencer."}
            </p>

            <form className="auth-form" onSubmit={submit} aria-busy={isSubmitting}>
              {mode === "register" && !cloud && (
                <label>
                  <span>Nom affiché</span>
                  <div className="auth-input-shell">
                    <UserRound aria-hidden="true" />
                    <input
                      name="displayName"
                      disabled={isSubmitting}
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
                <span>{cloud ? 'Adresse e-mail' : 'Identifiant'}</span>
                <div className="auth-input-shell">
                  <UserRound aria-hidden="true" />
                  <input
                    ref={usernameRef}
                    name="username"
                    disabled={isSubmitting}
                    spellCheck={false}
                    inputMode={cloud ? "email" : "text"}
                    type={cloud ? 'email' : 'text'}
                    value={username}
                    onChange={(event) => setUsername(event.target.value)}
                    autoCapitalize="none"
                    autoCorrect="off"
                    autoComplete="username"
                    required
                    minLength={3}
                    maxLength={cloud ? 254 : 64}
                    placeholder={cloud ? 'mon@email.ch' : 'mon.identifiant'}
                  />
                </div>
                {mode === "register" && !cloud && <small>3 à 64 lettres ASCII, chiffres, points, _ ou -, sans espace.</small>}
              </label>

              <label>
                <span>Mot de passe</span>
                <div className="auth-input-shell">
                  <LockKeyhole aria-hidden="true" />
                  <input
                    type={showPassword ? "text" : "password"}
                    name="password"
                    aria-label="Mot de passe"
                    disabled={isSubmitting}
                    aria-describedby={[mode === "register" ? passwordHelpId : undefined, error ? errorId : undefined].filter(Boolean).join(" ") || undefined}
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    autoComplete={mode === "login" ? "current-password" : "new-password"}
                    required
                    minLength={mode === "register" ? (cloud ? 12 : 10) : undefined}
                    maxLength={256}
                    placeholder={mode === "register" ? `${cloud ? 12 : 10} caractères minimum` : "Ton mot de passe"}
                  />
                  <button
                    className="auth-password-toggle"
                    disabled={isSubmitting}
                    type="button"
                    onClick={() => setShowPassword((visible) => !visible)}
                    aria-label={showPassword ? "Masquer le mot de passe" : "Afficher le mot de passe"}
                    aria-pressed={showPassword}
                  >
                    {showPassword ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
                  </button>
                </div>
              </label>

              {mode === "register" && <p id={passwordHelpId}>Utilise au moins {cloud ? 12 : 10} caractères.</p>}
              {mode === "register" && (
                <label>
                  <span>Confirmer le mot de passe</span>
                  <div className="auth-input-shell">
                    <LockKeyhole aria-hidden="true" />
                    <input
                      type={showPassword ? "text" : "password"}
                      ref={confirmationRef}
                      name="passwordConfirmation"
                      disabled={isSubmitting}
                      aria-describedby={error ? errorId : undefined}
                      aria-invalid={Boolean(error && mode === "register" && password !== passwordConfirmation)}
                      value={passwordConfirmation}
                      onChange={(event) => setPasswordConfirmation(event.target.value)}
                      autoComplete="new-password"
                      required
                      minLength={cloud ? 12 : 10}
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
                    disabled={isSubmitting}
                    checked={rememberMe}
                    onChange={(event) => setRememberMe(event.target.checked)}
                    aria-label="Se souvenir de moi"
                  />
                  <span>
                    <strong>Se souvenir de moi sur cet appareil</strong>
                    <small>
                      {isTauri()
                        ? "Identifiant et mot de passe protégés dans le coffre sécurisé du système."
                        : "Ta session reste enregistrée dans ce navigateur. À utiliser sur un appareil personnel."}
                    </small>
                  </span>
                </label>
              )}

              {error && <p id={errorId} className="auth-error" role="alert">{error}</p>}

              <button className="auth-submit" type="submit" disabled={isSubmitting}>
                {isSubmitting
                  ? <><span className="auth-spinner" aria-hidden="true" /> Vérification…</>
                  : mode === "login"
                    ? <>Se connecter <ArrowRight aria-hidden="true" /></>
                    : <>Créer le compte <ArrowRight aria-hidden="true" /></>}
              </button>
            </form>

            <p className="auth-switch">
              {mode === "login" ? "Pas encore de profil ?" : "Tu as déjà un profil ?"}
              <button type="button" disabled={isSubmitting} onClick={() => switchMode(mode === "login" ? "register" : "login")}>
                {mode === "login" ? "Créer un compte" : "Se connecter"}
              </button>
            </p>

            <div className="auth-local-note">
              <ShieldCheck aria-hidden="true" />
              <p><strong>{cloud ? 'Un compte sur tous tes appareils' : 'Local, sans cloud'}</strong><span>{cloud ? 'Utilise les mêmes identifiants que sur mobile. Retrouve tes années et ton travail synchronisé. Après une première connexion, les données conservées sur cet appareil restent accessibles hors ligne.' : 'Ce compte fonctionne uniquement sur cet appareil. Il ne synchronise aucune donnée en ligne.'}</span></p>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
