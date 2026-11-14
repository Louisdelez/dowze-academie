import type { FormationImportPreview } from './formations';

export interface FormationChoiceOption {
  id: string;
  label: string;
  description: string;
  subjectIds: string[];
  excludes: string[];
}
export interface FormationChoiceGroup {
  id: string;
  label: string;
  description: string;
  options: FormationChoiceOption[];
}
export interface FormationChoices {
  groups: FormationChoiceGroup[];
  selected?: string[];
}

// This parser is shared by package imports and restored manifests. Never trust
// catalogue metadata merely because it came from our server.
export function parseFormationChoices(value: unknown): FormationChoices {
  const object = (v: unknown, keys: string[]): Record<string, unknown> => {
    if (!v || typeof v !== 'object' || Array.isArray(v) || Object.keys(v).some(k => !keys.includes(k))) throw new Error('Objet de choix invalide.');
    return v as Record<string, unknown>;
  };
  const text = (v: unknown, max = 1000): string => {
    if (typeof v !== 'string' || !v.trim() || v.length > max || /[\u0000-\u001f\u007f]/u.test(v) || /[\uD800-\uDFFF]/u.test(v)) throw new Error('Texte de choix invalide.');
    return v;
  };
  const id = (v: unknown): string => { const s = text(v, 64); if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(s)) throw new Error('Identifiant de choix invalide.'); return s; };
  const array = (v: unknown, max: number): unknown[] => { if (!Array.isArray(v) || v.length > max) throw new Error('Liste de choix invalide.'); return v; };
  const ids = (v: unknown, max: number): string[] => { const list = array(v, max).map(id); if (new Set(list).size !== list.length) throw new Error('Choix dupliqué.'); return list; };
  const root = object(value, ['groups', 'selected']);
  const known = new Set<string>();
  const groupIds = new Set<string>();
  const groups = array(root.groups, 20).map(raw => {
    const g = object(raw, ['id', 'label', 'description', 'options']);
    const groupId = id(g.id);
    if (groupIds.has(groupId)) throw new Error('Groupe dupliqué.');
    groupIds.add(groupId);
    const options = array(g.options, 40).map(rawOption => {
      const o = object(rawOption, ['id', 'label', 'description', 'subjectIds', 'excludes']);
      const optionId = id(o.id);
      if (known.has(optionId)) throw new Error('Option dupliquée.');
      known.add(optionId);
      return { id: optionId, label: text(o.label, 200), description: text(o.description), subjectIds: ids(o.subjectIds, 40), excludes: ids(o.excludes, 100) };
    });
    if (options.length < 2) throw new Error('Un groupe doit offrir au moins deux alternatives.');
    return { id: groupId, label: text(g.label, 200), description: text(g.description), options };
  });
  if (!groups.length) throw new Error('Aucun groupe de choix.');
  for (const o of groups.flatMap(g => g.options)) {
    if (o.excludes.some(ex => !known.has(ex) || ex === o.id)) throw new Error('Incompatibilité inconnue ou réflexive.');
  }
  const result: FormationChoices = { groups, ...(root.selected !== undefined ? { selected: ids(root.selected, 20) } : {}) };
  if (result.selected && formationChoiceErrors(result, result.selected).length) throw new Error('Sélection annuelle invalide.');
  return result;
}

export function formationChoiceErrors(choices: FormationChoices, selected: readonly string[]): string[] {
  const errors: string[] = [];
  const options = choices.groups.flatMap(g => g.options);
  const selectedSet = new Set(selected);
  if (selectedSet.size !== selected.length || selected.some(id => !options.some(o => o.id === id))) errors.push('La sélection contient une option inconnue ou dupliquée.');
  for (const group of choices.groups) {
    if (group.options.filter(o => selectedSet.has(o.id)).length !== 1) errors.push(`Choisissez une seule alternative pour « ${group.label} ».`);
  }
  for (const option of options.filter(o => selectedSet.has(o.id))) {
    for (const other of option.excludes.filter(id => selectedSet.has(id))) errors.push(`${option.label} est incompatible avec ${options.find(o => o.id === other)?.label}.`);
  }
  return [...new Set(errors)];
}

export function selectFormationChoices(preview: FormationImportPreview, selected: string[]): FormationImportPreview {
  const choices = preview.manifest?.choices;
  if (!preview.valid || !preview.compiled || !choices || choices.selected) throw new Error('Cette formation ne permet pas cette sélection.');
  const errors = formationChoiceErrors(choices, selected);
  if (errors.length) throw new Error(errors.join(' '));
  const options = choices.groups.flatMap(g => g.options);
  const optional = new Set(options.flatMap(o => o.subjectIds));
  const included = new Set(options.filter(o => selected.includes(o.id)).flatMap(o => o.subjectIds));
  const subjects = preview.subjects.filter(s => !optional.has(s.id) || included.has(s.id));
  if (!subjects.length) throw new Error('La sélection doit conserver au moins une matière.');
  const subjectIds = new Set(subjects.map(s => s.id));
  const belongs = (item: { subjectId?: string }) => !item.subjectId || subjectIds.has(item.subjectId);
  const events = preview.events.filter(belongs);
  const tasks = preview.tasks.filter(belongs);
  return {
    ...preview,
    manifest: { ...preview.manifest!, choices: { ...choices, selected: [...selected] } },
    subjects, events, tasks, compiled: { subjects, events, tasks },
    counts: {
      subjects: subjects.length,
      modules: subjects.reduce((n, s) => n + s.modules.length, 0),
      chapters: subjects.reduce((n, s) => n + s.modules.reduce((m, x) => m + x.items.length, 0), 0),
      lessons: subjects.reduce((n, s) => n + s.modules.reduce((m, x) => m + x.items.reduce((k, c) => k + (c.lessons?.length ?? 0), 0), 0), 0),
      events: events.length, tasks: tasks.length
    }
  };
}
