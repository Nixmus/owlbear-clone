import { useEffect, useMemo, useState } from 'react';
import { api, assetUrl, type GlobalCharacter } from '../api';
import Icon from './Icon';

type Ownership = 'all' | 'mine' | 'others';
type Kind = 'all' | 'pc' | 'npc' | 'monster';

export default function CharactersGallery({ onOpenCampaign }: { onOpenCampaign: (id: string) => void }) {
  const [all, setAll] = useState<GlobalCharacter[]>([]);
  const [ownership, setOwnership] = useState<Ownership>('all');
  const [kind, setKind] = useState<Kind>('all');
  const [campaignId, setCampaignId] = useState('all');
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<GlobalCharacter | null>(null);

  useEffect(() => {
    api
      .get<{ characters: GlobalCharacter[] }>('/characters')
      .then((d) => setAll(d.characters))
      .catch(() => {});
  }, []);

  // Campaigns present in the data, for the campaign filter.
  const campaigns = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of all) {
      if (c.campaignId && c.campaignName) map.set(c.campaignId, c.campaignName);
    }
    return [...map.entries()];
  }, [all]);

  const filtered = useMemo(() => {
    return all.filter((c) => {
      if (ownership === 'mine' && !c.isMine) return false;
      if (ownership === 'others' && c.isMine) return false;
      if (kind !== 'all' && c.kind !== kind) return false;
      if (campaignId !== 'all' && c.campaignId !== campaignId) return false;
      if (query && !c.name.toLowerCase().includes(query.toLowerCase())) return false;
      return true;
    });
  }, [all, ownership, kind, campaignId, query]);

  return (
    <div className="hub-view">
      <h1>Personajes</h1>
      <p className="muted">Todos los personajes de las campañas en las que participas.</p>

      <div className="filters">
        <div className="field">
          <label>Búsqueda</label>
          <input
            placeholder="Buscar por nombre…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <div className="field">
          <label>Propiedad</label>
          <select value={ownership} onChange={(e) => setOwnership(e.target.value as Ownership)}>
            <option value="all">Todos</option>
            <option value="mine">Míos</option>
            <option value="others">De otros</option>
          </select>
        </div>
        <div className="field">
          <label>Tipo</label>
          <select value={kind} onChange={(e) => setKind(e.target.value as Kind)}>
            <option value="all">Todos</option>
            <option value="pc">Personajes jugadores</option>
            <option value="npc">PNJ</option>
            <option value="monster">Monstruos</option>
          </select>
        </div>
        <div className="field">
          <label>Campaña</label>
          <select value={campaignId} onChange={(e) => setCampaignId(e.target.value)}>
            <option value="all">Todas</option>
            {campaigns.map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="char-grid">
        {filtered.map((c) => (
          <div key={c.id} className="char-card" onClick={() => setSelected(c)}>
            <div className="char-portrait">
              {c.portraitUrl ? (
                <img src={assetUrl(c.portraitUrl) || c.portraitUrl} alt="" />
              ) : (
                <span>{c.name.slice(0, 1).toUpperCase()}</span>
              )}
            </div>
            <div className="char-body">
              <b>{c.name}</b>
              <span className="chip">{kindLabel(c.kind)}</span>
              <span className="muted">{c.campaignName || 'Sin campaña'}</span>
              {c.isMine && <span className="chip ok">tuyo</span>}
            </div>
          </div>
        ))}
        {filtered.length === 0 && <p className="muted">No hay personajes que coincidan.</p>}
      </div>

      {selected && (
        <div className="overlay" onClick={() => setSelected(null)}>
          <div className="card wide" onClick={(e) => e.stopPropagation()}>
            <div className="row spread">
              <h1>{selected.name}</h1>
              <button className="icon-btn" onClick={() => setSelected(null)} title="Cerrar">
                <Icon name="close" size={16} />
              </button>
            </div>
            <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
              <span className="chip">{kindLabel(selected.kind)}</span>
              <span className="chip">{selected.campaignName || 'Sin campaña'}</span>
              {selected.isMine && <span className="chip ok">tuyo</span>}
            </div>
            <CharacterReadout data={selected.data as Record<string, unknown>} />
            {selected.campaignId && (
              <button className="btn primary" onClick={() => onOpenCampaign(selected.campaignId!)}>
                Abrir campaña
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function CharacterReadout({ data }: { data: Record<string, any> }) {
  const attrs = (data.attributes as Record<string, number>) || {};
  return (
    <div className="readout">
      <div className="row">
        <div className="field">
          <label>Clase</label>
          <div className="chip">{data.class || '—'}</div>
        </div>
        <div className="field">
          <label>Raza</label>
          <div className="chip">{data.race || '—'}</div>
        </div>
        <div className="field">
          <label>Nivel</label>
          <div className="chip">{data.level ?? '—'}</div>
        </div>
      </div>
      <div className="row">
        <div className="field">
          <label>PG</label>
          <div className="chip">
            {data.hp?.current ?? '—'} / {data.hp?.max ?? '—'}
          </div>
        </div>
        <div className="field">
          <label>CA</label>
          <div className="chip">{data.ac ?? '—'}</div>
        </div>
        <div className="field">
          <label>Velocidad</label>
          <div className="chip">{data.speed ?? '—'}</div>
        </div>
      </div>
      <label className="section-label">Atributos</label>
      <div className="attrs">
        {['str', 'dex', 'con', 'int', 'wis', 'cha'].map((a) => (
          <div key={a} className="attr">
            <span>{a.toUpperCase()}</span>
            <em style={{ fontSize: 16 }}>{attrs[a] ?? 10}</em>
            <em>{modifier(attrs[a] ?? 10)}</em>
          </div>
        ))}
      </div>
      {data.notes && (
        <div className="field">
          <label>Notas</label>
          <p className="muted" style={{ whiteSpace: 'pre-wrap' }}>{String(data.notes)}</p>
        </div>
      )}
    </div>
  );
}

function modifier(score: number) {
  const m = Math.floor((score - 10) / 2);
  return m >= 0 ? `+${m}` : `${m}`;
}

function kindLabel(kind: string) {
  return kind === 'pc' ? 'PJ' : kind === 'npc' ? 'PNJ' : kind === 'monster' ? 'Monstruo' : kind;
}
