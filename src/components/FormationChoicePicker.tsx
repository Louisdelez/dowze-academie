import "../planning-redesign.css";
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Check, CheckCircle2, GraduationCap } from 'lucide-react';
import type { FormationImportPreview } from '../lib/formations';
import { formationChoiceErrors, selectFormationChoices } from '../lib/formationChoices';

export function FormationChoicePicker({ preview, onConfirm, onCancel }: {
  preview: FormationImportPreview;
  onConfirm: (preview: FormationImportPreview) => Promise<void>;
  onCancel?: () => void;
}) {
  const [selection, setSelection] = useState<Record<string, string>>({});
  const [step, setStep] = useState(0);
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState('');
  const heading = useRef<HTMLHeadingElement>(null);
  const groupName = useId();
  const choices = preview.manifest?.choices;
  const selected = Object.values(selection);
  const errors = choices ? formationChoiceErrors(choices, selected) : [];
  const selectedPreview = useMemo(() => choices && !choices.selected && !errors.length ? selectFormationChoices(preview, selected) : undefined, [preview, selection]);
  useEffect(() => { setQuery(''); heading.current?.focus(); }, [step]);
  if (!choices || choices.selected) return null;
  const group = choices.groups[step];
  const review = step === choices.groups.length;
  const visibleOptions = group?.options.filter(option => option.label.toLocaleLowerCase('fr').includes(query.trim().toLocaleLowerCase('fr'))) ?? [];
  const options = choices.groups.flatMap(g => g.options);
  const prior = choices.groups.slice(0, step).map(g => selection[g.id]).filter(Boolean);
  const conflicts = (id: string) => prior.flatMap(value => {
    const previous = options.find(o => o.id === value)!;
    return previous.excludes.includes(id) || options.find(o => o.id === id)!.excludes.includes(value) ? [previous.label] : [];
  });
  function choose(value: string) {
    const next = Object.fromEntries(choices!.groups.slice(0, step).map(g => [g.id, selection[g.id]]).filter(([, v]) => v));
    setSelection({ ...next, [group.id]: value });
    setFailure('');
  }
  async function confirm() {
    if (!selectedPreview || busy) return;
    setBusy(true); setFailure('');
    try { await onConfirm(selectedPreview); }
    catch (error) { setFailure(error instanceof Error ? error.message : 'La sélection n’a pas pu être enregistrée.'); }
    finally { setBusy(false); }
  }
  return <section className="formation-choice-picker annual-story" aria-label="Choix des matières de l’année" aria-busy={busy}>
    <div className="annual-story-progress" aria-label={`Étape ${step + 1} sur ${choices.groups.length + 1}`}>
      {Array.from({ length: choices.groups.length + 1 }, (_, i) => <span key={i} className={i <= step ? 'is-complete' : ''} />)}
    </div>
    <div className="annual-story-context"><GraduationCap /><span>{preview.manifest?.name}</span><small>{step + 1} / {choices.groups.length + 1}</small></div>
    <h3 className="annual-story-title" ref={heading} tabIndex={-1}>{review ? 'Vérifier mon programme' : group.label}</h3>
    {!review && <p className="annual-choice-guidance">Choisis une option. Tu pourras vérifier tous tes choix avant de préparer l’année.</p>}
    {review ? <>
      <p>Le tronc commun est inclus. Voici les choix qui complètent votre programme.</p>
      <dl className="annual-story-summary">{choices.groups.map((item, index) => <div key={item.id}><dt>{item.label}</dt><dd>{item.options.find(option => option.id === selection[item.id])?.label}<button type="button" disabled={busy} onClick={() => setStep(index)} aria-label={`Modifier ${item.label}`}>Modifier</button></dd></div>)}</dl>
      {selectedPreview && <div className="annual-story-ready"><CheckCircle2 /><p><strong>{selectedPreview.counts.subjects} matières · {selectedPreview.counts.lessons} cours</strong><span>Votre planning et vos évaluations suivent ces choix. Vos autres années restent intactes.</span></p></div>}
      {errors.length > 0 && <ul aria-label="Choix à compléter">{errors.map(error => <li key={error}>{error}</li>)}</ul>}
    </> : <fieldset disabled={busy} className="annual-story-question">
      <legend>{group.label}</legend><p>{group.description}</p>
      {group.options.length > 10 && <input className="annual-story-search" aria-label="Rechercher un choix" placeholder="Rechercher une option…" value={query} onChange={event => setQuery(event.target.value)} />}
      <div className="annual-story-options">
        {!visibleOptions.length && <p role="status">Aucun choix ne correspond à « {query} ». <button type="button" onClick={() => setQuery('')}>Effacer la recherche</button></p>}
        {visibleOptions.map(option => {
          const incompatible = conflicts(option.id);
          return <label key={option.id} className={`annual-story-option ${selection[group.id] === option.id ? 'is-selected' : ''} ${incompatible.length ? 'is-unavailable' : ''}`}>
            <input type="radio" name={groupName} value={option.id} checked={selection[group.id] === option.id} disabled={incompatible.length > 0 || busy} onChange={() => choose(option.id)} />
            <span><strong>{option.label}</strong><small>{incompatible.length ? `Incompatible avec ${incompatible.join(', ')}` : option.description}</small></span>
            <span className="annual-story-option-check" aria-hidden="true">{selection[group.id] === option.id && <Check />}</span>
          </label>;
        })}
      </div>
    </fieldset>}
    {failure && <p role="alert">{failure}</p>}
    <footer className="annual-story-actions">
      <button type="button" className="secondary-button" disabled={busy || step === 0} onClick={() => setStep(step - 1)}><ArrowLeft /> Retour</button>
      {onCancel && <button type="button" className="annual-story-later" disabled={busy} onClick={onCancel}>Plus tard</button>}
      {review ? <button type="button" className="primary-button" disabled={busy || errors.length > 0} onClick={() => void confirm()}>{busy ? 'Préparation…' : 'Confirmer mon programme annuel'}<Check /></button> : <button type="button" className="primary-button" disabled={busy || !selection[group.id]} onClick={() => setStep(step + 1)}>Continuer <ArrowRight /></button>}
    </footer>
  </section>;
}
