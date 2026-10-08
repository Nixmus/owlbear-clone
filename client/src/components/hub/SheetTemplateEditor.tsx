import { useEffect, useState } from 'react';
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

type DragIndex = number | null;

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
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  // Which row is being dragged, and which one it would land on.
  const [dragIndex, setDragIndex] = useState<DragIndex>(null);
  const [dragOverIndex, setDragOverIndex] = useState<DragIndex>(null);

  const attrList = attributes
    .split(/[\s,]+/)
    .map((a) => a.trim())
    .filter(Boolean);

  // Collect every problem so they can all be shown at once, instead of a
  // disabled save button that never explains itself.
  const problems: string[] = [];
  if (!name.trim()) problems.push('Ponle un nombre a la plantilla.');
  const seen = new Set<string>();
  fields.forEach((f) => {
    if (!f.key.trim() && !f.label.trim()) return; // untouched empty row
    const key = f.key.trim();
    if (!KEY_RE.test(key)) {
      problems.push(`La clave “${f.key || '(vacía)'}” no es válida: empieza por letra y usa letras, números o _.`);
    }
    if (seen.has(key)) problems.push(`La clave “${key}” está repetida.`);
    seen.add(key);
    if (!f.label.trim()) {
      problems.push(`El campo con clave “${key || '(vacía)'}” necesita una etiqueta visible.`);
    }
  });

  // Any edit marks the form dirty; reset() clears it after save/load/cancel.
  function touch() {
    setDirty(true);
    setSaved(false);
  }

  function loadTemplate(t: SheetTemplate) {
    if (dirty && !confirm('Hay cambios sin guardar. ¿Descartarlos y abrir esta plantilla?')) {
      return;
    }
    setEditingId(t.id);
    setName(t.name);
    setFields(t.schema.fields?.length ? t.schema.fields.map((f) => ({ ...f })) : [blankField()]);
    setAttributes((t.schema.attributes || []).join(', '));
    setEditingVisibility(t.visibility || 'public');
    setError('');
    setDirty(false);
    setSaved(false);
  }

  function startNew() {
    if (dirty && !confirm('Hay cambios sin guardar. ¿Descartarlos y empezar una plantilla nueva?')) {
      return;
    }
    reset();
  }

  function reset() {
    setEditingId(null);
    setName('');
    setFields([blankField()]);
    setAttributes('');
    setEditingVisibility('public');
    setError('');
    setDirty(false);
    setSaved(false);
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
      const payload = { name: name.trim(), schema, visibility: editingVisibility };

      if (editingId) {
        await api.patch(`/templates/${editingId}`, payload);
      } else {
        await api.post(`/campaigns/${campaignId}/templates`, payload);
      }
      // Clear the form and confirm clearly. Keeping the saved template loaded
      // would make "Guardar" ambiguous about what it is saving.
      reset();
      setSaved(true);
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
    if (
      !confirm(
        `¿Eliminar la plantilla “${t.name}”? Las fichas que la usan volverán a la ficha básica.`,
      )
    )
      return;
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
    touch();
  }

  function moveField(from: number, to: number) {
    setFields((prev) => {
      if (to < 0 || to >= prev.length || from === to) return prev;
      const next = [...prev];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
    touch();
  }

  function removeField(i: number) {
    setFields((prev) => (prev.length > 1 ? prev.filter((_, idx) => idx !== i) : [blankField()]));
    touch();
  }

  function addField() {
    setFields((prev) => [...prev, blankField()]);
    touch();
  }

  // Escape closes, but not while a confirm/alert is up or while typing a value.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="tpl-editor">
      <div className="row spread">
        <h3>Plantillas de ficha</h3>
        <button className="icon-btn" onClick={onClose} title="Cerrar">
          <Icon name="close" size={16} />
        </button>
      </div>
      <p className="muted" style={{ margin: 0 }}>
        Describe la ficha de tu sistema. Cada fila es un campo: la <b>clave</b> es donde se guarda
        el dato, la <b>etiqueta</b> es lo que ve el jugador. Usa las flechas o arrastra para
        reordenar.
      </p>

      {/* ---- existing templates ---- */}
      <div className="row spread">
        <label className="section-label" style={{ margin: 0 }}>
          {editingId ? 'Editando' : 'Tus plantillas'}
        </label>
        <button className="btn sm" onClick={startNew}>
          <Icon name="plus" size={13} /> Nueva
        </button>
      </div>

      {templates.length === 0 ? (
        <p className="muted" style={{ margin: 0 }}>
          Todavía no has creado ninguna. Rellena el formulario de abajo y pulsa Crear.
        </p>
      ) : (
        <ul className="list">
          {templates.map((t) => (
            <li key={t.id} className={editingId === t.id ? 'active' : ''}>
              <button
                className="tpl-pick"
                onClick={() => (editingId === t.id ? reset() : loadTemplate(t))}
              >
                <b>{t.name}</b>
                <span className="muted">
                  {editingId === t.id ? 'Cerrar edición' : `${t.schema.fields?.length || 0} campos`}
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

      {/* ---- editor form ---- */}
      <div className="field">
        <label>Nombre de la plantilla</label>
        <input
          value={name}
          placeholder="p. ej. Call of Cthulhu 7e"
          onChange={(e) => {
            setName(e.target.value);
            touch();
          }}
        />
      </div>

      <div className="row spread">
        <label className="section-label" style={{ margin: 0 }}>
          Campos de la ficha
        </label>
        <button className="btn sm" onClick={addField}>
          <Icon name="plus" size={13} /> Añadir campo
        </button>
      </div>

      <div className="tpl-rows">
        {fields.map((f, i) => {
          const keyInvalid = !!f.key.trim() && !KEY_RE.test(f.key.trim());
          const keyDup = !!f.key.trim() && fields.filter((o) => o.key.trim() === f.key.trim()).length > 1;
          const labelMissing = !!f.key.trim() && !f.label.trim();
          return (
            <div
              className={`tpl-row ${dragOverIndex === i ? 'drag-over' : ''} ${
                dragIndex === i ? 'dragging' : ''
              }`}
              key={i}
              draggable
              onDragStart={() => setDragIndex(i)}
              onDragOver={(e) => {
                e.preventDefault();
                if (dragIndex !== null && dragIndex !== i) setDragOverIndex(i);
              }}
              onDrop={(e) => {
                e.preventDefault();
                if (dragIndex !== null) moveField(dragIndex, i);
                setDragIndex(null);
                setDragOverIndex(null);
              }}
              onDragEnd={() => {
                setDragIndex(null);
                setDragOverIndex(null);
              }}
            >
              <span className="tpl-handle" title="Arrastra para reordenar">
                ⠿
              </span>
              <input
                value={f.key}
                placeholder="clave"
                aria-label="Clave del campo"
                className={keyInvalid || keyDup ? 'invalid' : ''}
                title={keyDup ? 'Clave repetida' : keyInvalid ? 'Clave no válida' : 'Donde se guarda el dato'}
                onChange={(e) => updateField(i, { key: e.target.value })}
              />
              <input
                value={f.label}
                placeholder="Etiqueta"
                aria-label="Etiqueta del campo"
                className={labelMissing ? 'invalid' : ''}
                title={labelMissing ? 'Falta la etiqueta' : 'Lo que ve el jugador'}
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
              <div className="tpl-reorder">
                <button
                  className="icon-btn"
                  title="Subir"
                  aria-label={`Subir campo ${f.label || f.key || i + 1}`}
                  disabled={i === 0}
                  onClick={() => moveField(i, i - 1)}
                >
                  <Icon name="up" size={13} />
                </button>
                <button
                  className="icon-btn"
                  title="Bajar"
                  aria-label={`Bajar campo ${f.label || f.key || i + 1}`}
                  disabled={i === fields.length - 1}
                  onClick={() => moveField(i, i + 1)}
                >
                  <Icon name="down" size={13} />
                </button>
              </div>
              <button className="icon-btn danger" title="Quitar campo" onClick={() => removeField(i)}>
                <Icon name="trash" size={14} />
              </button>
            </div>
          );
        })}
      </div>

      <div className="field">
        <label>Atributos (separados por comas, opcional)</label>
        <input
          value={attributes}
          placeholder="str, dex, con, int, wis, cha"
          onChange={(e) => {
            setAttributes(e.target.value);
            touch();
          }}
        />
        <span className="hint">
          Si los rellenas, la ficha muestra el bloque de atributos con su modificador. Para un
          sistema sin atributos, déjalo vacío.
        </span>
      </div>

      <div className="field">
        <label>Visibilidad de la plantilla</label>
        <VisibilityToggle
          value={editingVisibility}
          onChange={(next) => {
            setEditingVisibility(next);
            touch();
          }}
          label="Visibilidad de la plantilla"
        />
        <span className="hint">
          {editingVisibility === 'private'
            ? 'Solo tú verás esta plantilla. Los demás GM y jugadores no la verán en su selector.'
            : 'Todos los miembros de la campaña podrán usar esta plantilla.'}
        </span>
      </div>

      {/* ---- problems, always visible ---- */}
      {problems.length > 0 && (
        <ul className="tpl-problems">
          {problems.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      )}

      {error && <p className="error">{error}</p>}
      {saved && (
        <p className="tpl-saved">
          <Icon name="check" size={13} /> Guardado.
        </p>
      )}

      {/* ---- save bar ---- */}
      <div className="row">
        <button className="btn primary" onClick={save} disabled={busy || problems.length > 0}>
          <Icon name="check" size={14} />{' '}
          {editingId ? 'Guardar cambios' : 'Crear plantilla'}
          {dirty && <span className="tpl-dirty"> •</span>}
        </button>
        {editingId && (
          <button className="btn" onClick={reset}>
            Cancelar
          </button>
        )}
        {dirty && <span className="muted tpl-hint-dirty">Cambios sin guardar</span>}
      </div>
    </div>
  );
}