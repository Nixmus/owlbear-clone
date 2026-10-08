import { useEffect, useMemo, useRef, useState } from 'react';
import {
  api,
  assetUrl,
  uploadImage,
  type Character,
  type SheetField,
  type SheetSchema,
  type SheetTemplate,
  type Visibility,
} from '../../api';
import Icon from '../Icon';
import SheetTemplateEditor from './SheetTemplateEditor';
import VisibilityToggle from '../VisibilityToggle';

/**
 * The default sheet, used whenever a character has no template. The attribute
 * keys are lowercase on purpose: existing characters already store
 * `attributes.str` etc, and switching to uppercase would blank their values.
 */
const BUILTIN_SCHEMA: SheetSchema = {
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

export default function CharacterManager({ campaignId }: { campaignId: string }) {
  const [characters, setCharacters] = useState<Character[]>([]);
  const [templates, setTemplates] = useState<SheetTemplate[]>([]);
  const [selected, setSelected] = useState<Character | null>(null);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [kind, setKind] = useState<'pc' | 'npc' | 'monster'>('pc');
  const [templateId, setTemplateId] = useState('');
  const [canEdit, setCanEdit] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campaignId]);

  async function load() {
    const [chars, tpls] = await Promise.all([
      api.get<{ characters: Character[] }>(`/campaigns/${campaignId}/characters`),
      api.get<{ templates: SheetTemplate[] }>(`/campaigns/${campaignId}/templates`).catch(() => ({
        templates: [] as SheetTemplate[],
      })),
    ]);
    setCharacters(chars.characters);
    setTemplates(tpls.templates);
    api
      .get<{ role: string }>(`/campaigns/${campaignId}`)
      .then((d) => setCanEdit(d.role === 'owner' || d.role === 'gm'))
      .catch(() => setCanEdit(false));
  }

  async function create() {
    if (!name.trim()) return;
    const { id } = await api.post<{ id: string }>(`/campaigns/${campaignId}/characters`, {
      name,
      kind,
      // With a template the server seeds the declared fields; without one we keep
      // the familiar D&D defaults so a new sheet is not all zeroes.
      data: templateId ? undefined : defaultSheet(kind),
      templateId: templateId || undefined,
    });
    setName('');
    setTemplateId('');
    setCreating(false);
    await load();
    const created = (await api.get<{ character: Character }>(`/characters/${id}`)).character;
    setSelected(created);
  }

  return (
    <>
      <div className="hub-grid">
        <div className="hub-card">
          <div className="row spread">
            <h3>Personajes y fichas</h3>
            <div className="row" style={{ flex: 'none', gap: 6 }}>
              {canEdit && (
                <button
                  className="btn sm"
                  onClick={() => setShowTemplates((v) => !v)}
                  title="Gestionar plantillas de ficha"
                >
                  <Icon name="edit" size={13} /> Plantillas
                </button>
              )}
              <button className="btn sm primary" onClick={() => setCreating((v) => !v)}>
                <Icon name="plus" size={14} /> Nuevo
              </button>
            </div>
          </div>

          {creating && (
            <div className="create-row">
              <input
                placeholder="Nombre del personaje"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
              <select value={kind} onChange={(e) => setKind(e.target.value as typeof kind)}>
                <option value="pc">Personaje jugador</option>
                <option value="npc">PNJ</option>
                <option value="monster">Monstruo</option>
              </select>
              <select
                value={templateId}
                onChange={(e) => setTemplateId(e.target.value)}
                title="Tipo de ficha"
              >
                <option value="">Ficha básica (D&amp;D)</option>
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
              <button className="btn primary" onClick={create}>
                Crear
              </button>
            </div>
          )}

          <ul className="list">
            {characters.map((c) => (
              <li
                key={c.id}
                className={selected?.id === c.id ? 'active' : ''}
                onClick={() => setSelected(c)}
              >
                <span className="kind-badge">{kindLabel(c.kind)}</span>
                <b>{c.name}</b>
                {c.visibility === 'private' && (
                  <span className="chip" title="Solo tú puedes verlo">
                    <Icon name="lock" size={11} /> privado
                  </span>
                )}
                {c.templateId && <span className="chip">{templateName(c.templateId, templates)}</span>}
              </li>
            ))}
            {characters.length === 0 && <li className="muted">Todavía no hay personajes.</li>}
          </ul>
        </div>

        {selected && (
          <CharacterSheet
            character={selected}
            templates={templates}
            canEdit={canEdit}
            onSaved={load}
            onDeleted={() => {
              setSelected(null);
              load();
            }}
          />
        )}
      </div>

      {showTemplates && canEdit && (
        <div className="hub-card" style={{ marginTop: 16 }}>
          <SheetTemplateEditor
            campaignId={campaignId}
            templates={templates}
            onChanged={load}
            onClose={() => setShowTemplates(false)}
          />
        </div>
      )}
    </>
  );
}

function templateName(id: string, templates: SheetTemplate[]): string {
  return templates.find((t) => t.id === id)?.name || 'Plantilla';
}

function defaultSheet(kind: string): Record<string, unknown> {
  return {
    hp: { current: 10, max: 10 },
    ac: 12,
    speed: 30,
    level: 1,
    class: '',
    race: '',
    attributes: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 },
    skills: '',
    inventory: '',
    spells: '',
    notes: kind === 'monster' ? 'Monster stat block' : '',
  };
}

/* ------------------------------------------------------------------ */

function CharacterSheet({
  character,
  templates,
  canEdit,
  onSaved,
  onDeleted,
}: {
  character: Character;
  templates: SheetTemplate[];
  canEdit: boolean;
  onSaved: () => void;
  onDeleted: () => void;
}) {
  const [data, setData] = useState<Record<string, any>>(character.data);
  const [name, setName] = useState(character.name);
  const [portraitUrl, setPortraitUrl] = useState<string | null>(character.portraitUrl);
  const [localVisibility, setLocalVisibility] = useState<Visibility>(
    character.visibility || 'public',
  );
  const [visibilityError, setVisibilityError] = useState('');
  const [saved, setSaved] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setData(character.data);
    setName(character.name);
    setPortraitUrl(character.portraitUrl);
    setLocalVisibility(character.visibility || 'public');
    setVisibilityError('');
  }, [character.id, character.data, character.name, character.portraitUrl, character.visibility]);

  const set = (path: string, value: unknown) => {
    setData((d) => setPath({ ...d }, path, value));
  };

  const schema = useMemo<SheetSchema>(() => {
    if (character.templateId) {
      const t = templates.find((x) => x.id === character.templateId);
      if (t?.schema) return t.schema;
    }
    return BUILTIN_SCHEMA;
  }, [character.templateId, templates]);

  const hasKeyword = schema.fields.some((f) => f.key === 'keyword');
  // The keyword gets its own block up in the header (it needs the chat hint),
  // so keep it out of the generic grid to avoid rendering it twice.
  const gridSchema = useMemo<SheetSchema>(
    () => ({
      ...schema,
      fields: hasKeyword ? schema.fields.filter((f) => f.key !== 'keyword') : schema.fields,
    }),
    [schema, hasKeyword],
  );
  const attrs = (data.attributes as Record<string, number>) || {};

  async function sendLogo(file: File) {
    try {
      const url = await uploadImage(file);
      setPortraitUrl(url);
    } catch (e) {
      alert((e as Error).message);
    }
  }

  async function save() {
    await api.patch(`/characters/${character.id}`, { name, data, portraitUrl });
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
    onSaved();
  }

  /** Private means owner-only, so the server only accepts this from the owner. */
  async function setVisibility(next: Visibility) {
    setVisibilityError('');
    try {
      await api.patch(`/characters/${character.id}`, { visibility: next });
      setLocalVisibility(next);
      onSaved();
    } catch (e) {
      setVisibilityError((e as Error).message);
    }
  }

  async function remove() {
    if (!confirm(`Delete ${character.name}?`)) return;
    await api.del(`/characters/${character.id}`);
    onDeleted();
  }

  async function changeTemplate(nextId: string) {
    await api.patch(`/characters/${character.id}`, { templateId: nextId || null });
    const fresh = (await api.get<{ character: Character }>(`/characters/${character.id}`)).character;
    setData(fresh.data);
    onSaved();
  }

  return (
    <div className="hub-card sheet">
      <div className="row" style={{ alignItems: 'flex-start', gap: 12 }}>
        <div className="portrait-edit" onClick={() => fileRef.current?.click()} title="Subir foto">
          {portraitUrl ? (
            <img src={assetUrl(portraitUrl) || portraitUrl} alt="" />
          ) : (
            <span>{name.slice(0, 1).toUpperCase()}</span>
          )}
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          style={{ display: 'none' }}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) sendLogo(f);
          }}
        />
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div className="row spread">
            <input className="sheet-name" value={name} onChange={(e) => setName(e.target.value)} />
            <button className="icon-btn danger" title="Eliminar personaje" onClick={remove}>
              <Icon name="trash" size={15} />
            </button>
          </div>
          {canEdit && templates.length > 0 && (
            <div className="field">
              <label>Tipo de ficha</label>
              <select
                value={character.templateId || ''}
                onChange={(e) => changeTemplate(e.target.value)}
              >
                <option value="">Ficha básica (D&amp;D)</option>
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
              <span className="hint">Cambiar de plantilla conserva los valores ya escritos.</span>
            </div>
          )}
          <div className="field">
            <label>Visibilidad</label>
            <VisibilityToggle
              value={localVisibility}
              onChange={(next) => setVisibility(next)}
              label={`Visibilidad de ${character.name}`}
            />
            <span className="hint">
              {localVisibility === 'private'
                ? 'Solo tú puedes ver esta ficha, el director incluido.'
                : 'Todos los miembros de la campaña ven esta ficha.'}
            </span>
            {visibilityError && <span className="error">{visibilityError}</span>}
          </div>
          {hasKeyword && (
            <div className="field">
              <label>Palabra clave (hablar en el chat)</label>
              <input
                placeholder="p. ej. Ale"
                value={data.keyword || ''}
                onChange={(e) => set('keyword', e.target.value)}
              />
              <span className="hint">
                Escribe <b>{data.keyword || 'palabra'}: tu mensaje</b> en el chat para hablar como este
                personaje.
              </span>
            </div>
          )}
        </div>
      </div>

      <SheetFields schema={gridSchema} data={data} onSet={set} />

      {schema.attributes.length > 0 && (
        <>
          <label className="section-label">Atributos</label>
          <div className="attrs">
            {schema.attributes.map((a) => (
              <div key={a} className="attr">
                <span>{a.toUpperCase()}</span>
                <input
                  type="number"
                  value={attrs[a] ?? 10}
                  onChange={(e) => set(`attributes.${a}`, +e.target.value)}
                />
                <em>{modifier(attrs[a] ?? 10)}</em>
              </div>
            ))}
          </div>
        </>
      )}

      <button className="btn primary" onClick={save}>
        {saved ? (
          <>
            <Icon name="check" size={14} /> Guardado
          </>
        ) : (
          'Guardar ficha'
        )}
      </button>
    </div>
  );
}

/** Renders whatever fields a template declares. Textareas span the full row. */
function SheetFields({
  schema,
  data,
  onSet,
}: {
  schema: SheetSchema;
  data: Record<string, any>;
  onSet: (path: string, value: unknown) => void;
}) {
  if (!schema.fields.length) return null;
  return (
    <div className="sheet-fields">
      {schema.fields.map((f) => (
        <Field key={f.key} field={f} data={data} onSet={onSet} />
      ))}
    </div>
  );
}

function Field({
  field,
  data,
  onSet,
}: {
  field: SheetField;
  data: Record<string, any>;
  onSet: (path: string, value: unknown) => void;
}) {
  // getPath always returns string | number, so this is always a valid `value`.
  const raw = getPath(data, field.key);
  // Textareas span the row; normal fields share the grid; tight ones stay narrow.
  const cls =
    field.type === 'textarea' ? 'field wide' : field.width === 'tight' ? 'field tight' : 'field';
  return (
    <div className={cls}>
      <label>{field.label}</label>
      {field.type === 'textarea' ? (
        <textarea rows={2} value={raw} onChange={(e) => onSet(field.key, e.target.value)} />
      ) : field.type === 'number' ? (
        <input type="number" value={raw} onChange={(e) => onSet(field.key, Number(e.target.value))} />
      ) : (
        <input value={raw} onChange={(e) => onSet(field.key, e.target.value)} />
      )}
    </div>
  );
}

function kindLabel(kind: string): string {
  switch (kind) {
    case 'pc':
      return 'PJ';
    case 'npc':
      return 'PNJ';
    case 'monster':
      return 'Monstruo';
    default:
      return kind;
  }
}

function modifier(score: number) {
  const m = Math.floor((score - 10) / 2);
  return m >= 0 ? `+${m}` : `${m}`;
}

function setPath(obj: Record<string, any>, path: string, value: unknown): Record<string, any> {
  const keys = path.split('.');
  let cur: Record<string, any> = obj;
  for (let i = 0; i < keys.length - 1; i++) {
    if (typeof cur[keys[i]] !== 'object' || cur[keys[i]] === null) cur[keys[i]] = {};
    cur = cur[keys[i]];
  }
  cur[keys[keys.length - 1]] = value;
  return obj;
}

/**
 * Reads a (possibly dotted) key out of the sheet data and normalizes it to
 * something an input can hold. Returning `string | number` rather than
 * `unknown` matters: `unknown ?? ''` narrows to `{}`, which is not assignable
 * to the `value` prop of <input>/<textarea>.
 */
function getPath(obj: Record<string, any>, path: string): string | number {
  let cur: any = obj;
  for (const k of path.split('.')) {
    if (cur === null || cur === undefined) return '';
    cur = cur[k];
  }
  if (typeof cur === 'number') return cur;
  if (typeof cur === 'string') return cur;
  if (cur === null || cur === undefined) return '';
  // Objects/arrays/booleans are not valid input values; show something sane
  // rather than handing React an object for `value`.
  return String(cur);
}
