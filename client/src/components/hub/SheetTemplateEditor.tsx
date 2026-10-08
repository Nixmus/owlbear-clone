import { useState } from 'react';
import { api, type SheetField, type SheetTemplate, type Visibility } from '../../api';
import Icon from '../Icon';
import VisibilityToggle from '../VisibilityToggle';

const TYPES: { value: SheetField['type']; label: string }[] = [
  { value: 'text', label: 'Texto' },
  { value: 'number', label: 'Número' },
  { value: 'textarea', label: 'Texto largo' },
];

/** Mirrors the server's key rule so the UI can warn before saving. */
const KEY_RE = /^[a-zA-Z][a-zA-Z0-9_]*(\.[a-zA-Z][a-zA-Z0-9_]*)*$/;

function blankField(): SheetField {
  return { key: '', label: '', type: 'text' };
}

/**
 * Lets a GM describe a character sheet so the group can play a different
 * system. The schema is just a list of fields plus an optional attribute
 * block, which the server validates again before storing it.
 */
export default function SheetTemplateEditor({
  campaignId,
  templates,
  onChanged,
  onClose,
}: {
  campaignId: string;
  templates: SheetTemplate[];
  onChanged: () => void;
  onClose: () => void;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [fields, setFields] = useState<SheetField[]>([blankField()]);
  const [attributes, setAttributes] = useState('');
  const [editingVisibility, setEditingVisibility] = useState<Visibility>('public');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const attrList = attributes
    .split(/[\s,]+/)
    .map((a) => a.trim())
    .filter(Boolean);

  const problems: string[] = [];
  if (!name.trim()) problems.push('Falta el nombre de la plantilla.');
  const keys = new Set<string>();
  for (const f of fields) {
    if (!f.key.trim() && !f.label.trim()) continue; // untouched empty row
    if (!KEY_RE.test(f.key.trim())) {
      problems.push(`Clave inválida: “${f.key}”. Empieza por letra y usa letras, números o _ (puedes anidar con punto).`);
    }
    if (keys.has(f.key.trim())) problems.push(`Clave repetida: “${f.key}”.`);
    keys.add(f.key.trim());
    if (!f.label.trim()) problems.push(`El campo “${f.key || '?'}” necesita una etiqueta.`);
  }

  function loadTemplate(t: SheetTemplate) {
    setEditingId(t.id);
    setName(t.name);
    setFields(t.schema.fields?.length ? t.schema.fields.map((f) => ({ ...f })) : [blankField()]);
    setAttributes((t.schema.attributes || []).join(', '));
    setEditingVisibility(t.visibility || 'public');
    setError('');
  }

  function reset() {
    setEditingId(null);
    setName('');
    setFields([blankField()]);
    setAttributes('');
    setEditingVisibility('public');
    setError('');
  }

  async function save() {
    setError('');
    if (problems.length) {
      setError(problems[0]);
      return;
    }
    setBusy(true);
    try {
      const clean = fields
        .filter((f) => f.key.trim() || f.label.trim())
        .map((f) => ({
          key: f.key.trim(),
          label: f.label.trim(),
          type: f.type,
          width: f.width === 'tight' ? 'tight' : undefined,
        }));
      const schema = { fields: clean, attributes: attrList.map((a) => a.toUpperCase()) };

      if (editingId) {
        await api.patch(`/templates/${editingId}`, {
          name: name.trim(),
          schema,
          visibility: editingVisibility,
        });
      } else {
        await api.post(`/campaigns/${campaignId}/templates`, {
          name: name.trim(),
          schema,
          visibility: editingVisibility,
        });
      }
      reset();
      onChanged();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function setTemplateVisibility(t: SheetTemplate, next: Visibility) {
    setError('');
    try {
      await api.patch(`/templates/${t.id}`, { visibility: next });
      // `templates` is a prop owned by the parent, so reload instead of
      // keeping a second copy that could drift.
      onChanged();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function remove(t: SheetTemplate) {
    if (!confirm(`¿Eliminar la plantilla “${t.name}”? Las fichas que la usan volverán a la ficha básica.`)) return;
    setError('');
    try {
      await api.del(`/templates/${t.id}`);
      if (editingId === t.id) reset();
      onChanged();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  function updateField(i: number, patch: Partial<SheetField>) {
    setFields((prev) => prev.map((f, idx) => (idx === i ? { ...f, ...patch } : f)));
  }

  return (
    <div className="tpl-editor">
      <div className="row spread">
        <h3>Plantillas de ficha</h3>
        <button className="icon-btn" onClick={onClose} title="Cerrar">
          <Icon name="close" size={16} />
        </button>
      </div>
      <p className="muted" style={{ margin: 0 }}>
        Describe la ficha de tu sistema: cada campo con su clave, su etiqueta y su tipo. Los jugadores
        ven exactamente estos campos. Déjalo vacío si prefieres la ficha básica de D&amp;D.
      </p>

      {templates.length > 0 && (
        <ul className="list">
          {templates.map((t) => (
            <li key={t.id} className={editingId === t.id ? 'active' : ''}>
              <button className="tpl-pick" onClick={() => loadTemplate(t)}>
                <b>{t.name}</b>
                <span className="muted">
                  {t.schema.fields?.length || 0} campos
                  {t.visibility === 'private' ? ' · privada' : ''}
                </span>
              </button>
              <VisibilityToggle
                value={t.visibility || 'public'}
                onChange={(next) => setTemplateVisibility(t, next)}
                label={`Visibilidad de la plantilla ${t.name}`}
              />
              <button className="icon-btn danger" title="Eliminar plantilla" onClick={() => remove(t)}>
                <Icon name="trash" size={14} />
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="field">
        <label>Nombre de la plantilla</label>
        <input
          value={name}
          placeholder="p. ej. Call of Cthulhu 7e"
          onChange={(e) => setName(e.target.value)}
        />
      </div>

      <label className="section-label">Campos de la ficha</label>
      <div className="tpl-rows">
        {fields.map((f, i) => (
          <div className="tpl-row" key={i}>
            <input
              value={f.key}
              placeholder="clave"
              aria-label="Clave del campo"
              onChange={(e) => updateField(i, { key: e.target.value })}
            />
            <input
              value={f.label}
              placeholder="Etiqueta"
              aria-label="Etiqueta del campo"
              onChange={(e) => updateField(i, { label: e.target.value })}
            />
            <select
              value={f.type}
              aria-label="Tipo del campo"
              onChange={(e) => updateField(i, { type: e.target.value as SheetField['type'] })}
            >
              {TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
            <label className="tpl-check" title="Campo estrecho">
              <input
                type="checkbox"
                checked={f.width === 'tight'}
                onChange={(e) => updateField(i, { width: e.target.checked ? 'tight' : undefined })}
              />
              <span>Estrecho</span>
            </label>
            <button
              className="icon-btn danger"
              title="Quitar campo"
              onClick={() => setFields((prev) => (prev.length > 1 ? prev.filter((_, idx) => idx !== i) : [blankField()]))}
            >
              <Icon name="trash" size={14} />
            </button>
          </div>
        ))}
      </div>
      <button className="btn" onClick={() => setFields((prev) => [...prev, blankField()])}>
        <Icon name="plus" size={14} /> Añadir campo
      </button>

      <div className="field">
        <label>Atributos (separados por comas, opcional)</label>
        <input
          value={attributes}
          placeholder="str, dex, con, int, wis, cha"
          onChange={(e) => setAttributes(e.target.value)}
        />
        <span className="hint">
          Si los rellenas, la ficha muestra el bloque de atributos con su modificador. Para un sistema
          sin atributos, déjalo vacío.
        </span>
      </div>

      <div className="field">
        <label>Visibilidad de la plantilla</label>
        <VisibilityToggle
          value={editingVisibility}
          onChange={(next) => setEditingVisibility(next)}
          label="Visibilidad de la plantilla"
        />
        <span className="hint">
          {editingVisibility === 'private'
            ? 'Solo tú verás esta plantilla. Los demás GM y jugadores no la verán en su selector.'
            : 'Todos los miembros de la campaña podrán usar esta plantilla.'}
        </span>
      </div>

      {error && <p className="error">{error}</p>}

      <div className="row">
        <button className="btn primary" onClick={save} disabled={busy || problems.length > 0}>
          <Icon name="check" size={14} /> {editingId ? 'Guardar cambios' : 'Crear plantilla'}
        </button>
        {editingId && (
          <button className="btn" onClick={reset}>
            Cancelar
          </button>
        )}
      </div>
    </div>
  );
}