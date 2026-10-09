import { useEffect, useMemo, useState } from 'react';
import { api, assetUrl, type Character, type SheetSchema, type SheetTemplate } from '../api';
import Icon from './Icon';
import { BUILTIN_SCHEMA, formatModifier, kindLabel, readPath } from './sheetSchema';

/**
 * Read-only view of the character sheet behind a token.
 *
 * The token panel already links a token to a character and mirrors its name and
 * portrait, but it does not show the sheet itself: a player who wants to know
 * an NPC's AC or a PC's inventory had to leave the table and go to the hub.
 * This panel is the in-table answer, deliberately read-only so that looking at
 * a sheet never rewrites it.
 */
export default function SheetViewer({ characterId }: { characterId: string | null }) {
  const [character, setCharacter] = useState<Character | null>(null);
  const [templates, setTemplates] = useState<SheetTemplate[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Fetch the sheet itself whenever the selected token changes.
  useEffect(() => {
    if (!characterId) {
      setCharacter(null);
      setError('');
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError('');
    api
      .get<{ character: Character }>(`/characters/${characterId}`)
      .then((d) => {
        if (cancelled) return;
        setCharacter(d.character);
      })
      .catch((e: Error) => {
        if (cancelled) return;
        setCharacter(null);
        setError(e.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [characterId]);

  // Templates decide which fields the sheet has. They belong to a campaign, and
  // only a member can read them, so a failure here just falls back to the
  // built-in sheet instead of leaving the panel blank.
  const campaignId = character?.campaignId ?? null;
  useEffect(() => {
    if (!campaignId) return;
    let cancelled = false;
    api
      .get<{ templates: SheetTemplate[] }>(`/campaigns/${campaignId}/templates`)
      .then((d) => {
        if (!cancelled) setTemplates(d.templates);
      })
      .catch(() => {
        if (!cancelled) setTemplates([]);
      });
    return () => {
      cancelled = true;
    };
  }, [campaignId]);

  const schema: SheetSchema = useMemo(() => {
    if (!character?.templateId) return BUILTIN_SCHEMA;
    const t = templates.find((x) => x.id === character.templateId);
    return t?.schema || BUILTIN_SCHEMA;
  }, [character?.templateId, templates]);

  if (!characterId) {
    return (
      <div className="panel">
        <div className="panel-head">
          <Icon name="book" size={14} />
          <span>Ficha del personaje</span>
        </div>
        <div className="panel-body">
          <p className="hint">Selecciona un token vinculado a una ficha para verla aquí.</p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="panel">
        <div className="panel-head">
          <Icon name="book" size={14} />
          <span>Ficha del personaje</span>
        </div>
        <div className="panel-body">
          <p className="hint">Cargando ficha…</p>
        </div>
      </div>
    );
  }

  if (error || !character) {
    return (
      <div className="panel">
        <div className="panel-head">
          <Icon name="book" size={14} />
          <span>Ficha del personaje</span>
        </div>
        <div className="panel-body">
          <p className="hint">
            {error || 'No se pudo cargar la ficha.'}
          </p>
          <p className="hint">
            Si el personaje es privado, solo su dueño puede verlo, el director incluido.
          </p>
        </div>
      </div>
    );
  }

  const data = (character.data || {}) as Record<string, any>;
  const attrs = (data.attributes as Record<string, number>) || {};
  // Empty fields are noise in a read-only view: a sheet with six blank lines
  // hides the two values that matter.
  const fields = schema.fields.filter((f) => readPath(data, f.key).trim() !== '');

  return (
    <div className="panel">
      <div className="panel-head">
        <Icon name="book" size={14} />
        <span>Ficha del personaje</span>
      </div>
      <div className="panel-body">
        <div className="row" style={{ alignItems: 'flex-start', gap: 12 }}>
          <div
            style={{
              width: 64,
              height: 64,
              borderRadius: '10px',
              flex: 'none',
              overflow: 'hidden',
              background: character.portraitUrl ? '#222' : 'var(--panel-3)',
              display: 'grid',
              placeItems: 'center',
              fontSize: 24,
              fontWeight: 600,
            }}
          >
            {character.portraitUrl ? (
              <img
                src={assetUrl(character.portraitUrl) || character.portraitUrl}
                alt=""
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              />
            ) : (
              character.name.slice(0, 1).toUpperCase()
            )}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 16, fontWeight: 600 }}>{character.name}</div>
            <div className="row" style={{ gap: 6, marginTop: 4 }}>
              <span className="chip">{kindLabel(character.kind)}</span>
              {character.visibility === 'private' && <span className="chip">Privada</span>}
            </div>
          </div>
        </div>

        {fields.length > 0 && (
          <>
            <div className="section-label">Datos</div>
            <div className="sheet-read">
              {fields.map((f) => (
                <div key={f.key} className={`sheet-read-row ${f.type === 'textarea' ? 'wide' : ''}`}>
                  <span className="sheet-read-label">{f.label}</span>
                  <span className="sheet-read-value">{readPath(data, f.key)}</span>
                </div>
              ))}
            </div>
          </>
        )}

        {schema.attributes.length > 0 && (
          <>
            <div className="section-label">Atributos</div>
            <div className="attrs">
              {schema.attributes.map((a) => (
                <div key={a} className="attr">
                  <span>{a.toUpperCase()}</span>
                  <b>{attrs[a] ?? 10}</b>
                  <em>{formatModifier(attrs[a] ?? 10)}</em>
                </div>
              ))}
            </div>
          </>
        )}

        {!fields.length && !schema.attributes.length && (
          <p className="hint">Esta ficha no tiene datos todavía.</p>
        )}

        <p className="hint">
          Solo lectura. Para editar la ficha, abre el panel de campaña.
        </p>
      </div>
    </div>
  );
}