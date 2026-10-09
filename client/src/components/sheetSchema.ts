import type { SheetSchema } from '../api';

/**
 * The default sheet, used whenever a character has no template. The attribute
 * keys are lowercase on purpose: existing characters already store
 * `attributes.str` etc, and switching to uppercase would blank their values.
 *
 * Shared between the hub editor and the read-only sheet viewer at the table, so
 * a character always reads the same way in both places.
 */
export const BUILTIN_SCHEMA: SheetSchema = {
  fields: [
    { key: 'class', label: 'Clase', type: 'text' },
    { key: 'race', label: 'Raza', type: 'text' },
    { key: 'level', label: 'Nivel', type: 'number', width: 'tight' },
    { key: 'hp.current', label: 'PG actuales', type: 'number' },
    { key: 'hp.max', label: 'PG máximos', type: 'number' },
    { key: 'ac', label: 'CA', type: 'number', width: 'tight' },
    { key: 'speed', label: 'Velocidad', type: 'number', width: 'tight' },
    { key: 'keyword', label: 'Palabra clave (hablar en el chat)', type: 'text' },
    { key: 'skills', label: 'Habilidades', type: 'textarea' },
    { key: 'inventory', label: 'Inventario', type: 'textarea' },
    { key: 'spells', label: 'Conjuros', type: 'textarea' },
    { key: 'notes', label: 'Notas', type: 'textarea' },
  ],
  attributes: ['str', 'dex', 'con', 'int', 'wis', 'cha'],
};

const KIND_LABELS: Record<string, string> = {
  pc: 'PJ',
  npc: 'PNJ',
  monster: 'Monstruo',
};

export function kindLabel(kind: string): string {
  return KIND_LABELS[kind] || kind;
}

/**
 * Reads a (possibly dotted) key out of the sheet data and normalizes it to
 * something displayable. Returning `string` rather than `unknown` matters:
 * `unknown` is not assignable to a React child's props, and `unknown ?? ''`
 * narrows to `{}`, which is not a string either.
 */
export function readPath(obj: Record<string, any>, path: string): string {
  let cur: any = obj;
  for (const k of path.split('.')) {
    if (cur === null || cur === undefined) return '';
    cur = cur[k];
  }
  if (typeof cur === 'number') return String(cur);
  if (typeof cur === 'string') return cur;
  if (typeof cur === 'boolean') return cur ? 'Sí' : 'No';
  if (cur === null || cur === undefined) return '';
  // Objects and arrays are not text; show something short rather than "[object]".
  try {
    return JSON.stringify(cur);
  } catch {
    return '';
  }
}

/** The D&D style modifier for an ability score. */
export function formatModifier(score: number): string {
  const m = Math.floor((score - 10) / 2);
  return m >= 0 ? `+${m}` : `${m}`;
}