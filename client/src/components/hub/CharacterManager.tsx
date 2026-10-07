import { useEffect, useState } from 'react';
import { api, type Character } from '../../api';

export default function CharacterManager({ campaignId }: { campaignId: string }) {
  const [characters, setCharacters] = useState<Character[]>([]);
  const [selected, setSelected] = useState<Character | null>(null);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [kind, setKind] = useState<'pc' | 'npc' | 'monster'>('pc');

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campaignId]);

  async function load() {
    const d = await api.get<{ characters: Character[] }>(`/campaigns/${campaignId}/characters`);
    setCharacters(d.characters);
  }

  async function create() {
    if (!name.trim()) return;
    const { id } = await api.post<{ id: string }>(`/campaigns/${campaignId}/characters`, {
      name,
      kind,
      data: defaultSheet(kind),
    });
    setName('');
    setCreating(false);
    await load();
    const created = (await api.get<{ character: Character }>(`/characters/${id}`)).character;
    setSelected(created);
  }

  return (
    <div className="hub-grid">
      <div className="hub-card">
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <h3>Characters & sheets</h3>
          <button className="btn sm primary" onClick={() => setCreating((v) => !v)}>
            ➕ New
          </button>
        </div>

        {creating && (
          <div className="create-row">
            <input placeholder="Character name" value={name} onChange={(e) => setName(e.target.value)} />
            <select value={kind} onChange={(e) => setKind(e.target.value as typeof kind)}>
              <option value="pc">PC</option>
              <option value="npc">NPC</option>
              <option value="monster">Monster</option>
            </select>
            <button className="btn primary" onClick={create}>
              Create
            </button>
          </div>
        )}

        <ul className="list">
          {characters.map((c) => (
            <li key={c.id} className={selected?.id === c.id ? 'active' : ''} onClick={() => setSelected(c)}>
              <span className="kind-badge">{c.kind}</span>
              <b>{c.name}</b>
            </li>
          ))}
          {characters.length === 0 && <li className="muted">No characters yet.</li>}
        </ul>
      </div>

      {selected && (
        <CharacterSheet
          character={selected}
          onSaved={load}
          onDeleted={() => {
            setSelected(null);
            load();
          }}
        />
      )}
    </div>
  );
}

function defaultSheet(kind: string) {
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

function CharacterSheet({
  character,
  onSaved,
  onDeleted,
}: {
  character: Character;
  onSaved: () => void;
  onDeleted: () => void;
}) {
  const [data, setData] = useState<Record<string, any>>(character.data);
  const [name, setName] = useState(character.name);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setData(character.data);
    setName(character.name);
  }, [character.id, character.data, character.name]);

  const set = (path: string, value: unknown) => {
    setData((d) => setPath({ ...d }, path, value));
  };

  async function save() {
    await api.patch(`/characters/${character.id}`, { name, data });
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
    onSaved();
  }

  async function remove() {
    if (!confirm(`Delete ${character.name}?`)) return;
    await api.del(`/characters/${character.id}`);
    onDeleted();
  }

  const attrs = (data.attributes as Record<string, number>) || {};

  return (
    <div className="hub-card sheet">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <input className="sheet-name" value={name} onChange={(e) => setName(e.target.value)} />
        <button className="btn danger sm" onClick={remove}>
          🗑️
        </button>
      </div>

      <div className="row">
        <div className="field">
          <label>Class</label>
          <input value={data.class || ''} onChange={(e) => set('class', e.target.value)} />
        </div>
        <div className="field">
          <label>Race</label>
          <input value={data.race || ''} onChange={(e) => set('race', e.target.value)} />
        </div>
        <div className="field tight">
          <label>Level</label>
          <input type="number" value={data.level ?? 1} onChange={(e) => set('level', +e.target.value)} />
        </div>
      </div>

      <div className="row">
        <div className="field">
          <label>HP current</label>
          <input
            type="number"
            value={data.hp?.current ?? 0}
            onChange={(e) => set('hp.current', +e.target.value)}
          />
        </div>
        <div className="field">
          <label>HP max</label>
          <input type="number" value={data.hp?.max ?? 0} onChange={(e) => set('hp.max', +e.target.value)} />
        </div>
        <div className="field tight">
          <label>AC</label>
          <input type="number" value={data.ac ?? 0} onChange={(e) => set('ac', +e.target.value)} />
        </div>
        <div className="field tight">
          <label>Speed</label>
          <input type="number" value={data.speed ?? 0} onChange={(e) => set('speed', +e.target.value)} />
        </div>
      </div>

      <label className="section-label">Attributes</label>
      <div className="attrs">
        {['str', 'dex', 'con', 'int', 'wis', 'cha'].map((a) => (
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

      <div className="field">
        <label>Skills</label>
        <textarea rows={2} value={data.skills || ''} onChange={(e) => set('skills', e.target.value)} />
      </div>
      <div className="field">
        <label>Inventory</label>
        <textarea rows={2} value={data.inventory || ''} onChange={(e) => set('inventory', e.target.value)} />
      </div>
      <div className="field">
        <label>Spells</label>
        <textarea rows={2} value={data.spells || ''} onChange={(e) => set('spells', e.target.value)} />
      </div>
      <div className="field">
        <label>Notes</label>
        <textarea rows={3} value={data.notes || ''} onChange={(e) => set('notes', e.target.value)} />
      </div>

      <button className="btn primary" onClick={save}>
        {saved ? '✓ Saved' : 'Save sheet'}
      </button>
    </div>
  );
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
