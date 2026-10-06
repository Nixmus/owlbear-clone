import { useRef, useState } from 'react';
import { nanoid } from '../util';
import { useStore } from '../store';
import { conditionIcon } from './Board';
import type { Token } from '../types';

const COLORS = ['#60a5fa', '#f87171', '#4ade80', '#fbbf24', '#a78bfa', '#f472b6', '#34d399', '#fb923c'];
const CONDITIONS = ['poisoned', 'prone', 'stunned', 'invisible', 'burning', 'blessed', 'dead', 'grappled'];

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export default function Inspector({ selectedId }: { selectedId: string | null }) {
  const state = useStore((s) => s.state);
  const dispatch = useStore((s) => s.dispatch);
  const self = useStore((s) => s.self);
  const fileRef = useRef<HTMLInputElement>(null);
  const [collapsed, setCollapsed] = useState(false);

  const scene = state.scenes.find((s) => s.id === state.activeSceneId) || state.scenes[0];
  const token = state.tokens.find((t) => t.id === selectedId) || null;
  if (!scene) return null;

  if (!token) {
    return (
      <div className="panel">
        <div className="panel-head">
          <span>🎲 Inspector</span>
          <span className="grow" />
          <button onClick={() => setCollapsed((v) => !v)}>{collapsed ? '▾' : '▴'}</button>
        </div>
        {!collapsed && (
          <div className="panel-body">
            <p style={{ fontSize: 12, color: 'var(--text-dim)', margin: 0 }}>
              Select a token to edit it. Use <b>➕ Add token</b> in the toolbar.
            </p>
            <div className="field">
              <label>Active scene</label>
              <div className="chip">{scene.name}</div>
            </div>
          </div>
        )}
      </div>
    );
  }

  const isGM = self.role === 'gm';
  const patch = (p: Partial<Token>) => dispatch({ kind: 'token.update', id: token.id, patch: p });

  const toggleCondition = (c: string) => {
    const has = token.conditions.includes(c);
    patch({ conditions: has ? token.conditions.filter((x) => x !== c) : [...token.conditions, c] });
  };

  return (
    <div className="panel">
      <div className="panel-head">
        <span>🎲 Token</span>
        <span className="grow" />
        <button onClick={() => setCollapsed((v) => !v)}>{collapsed ? '▾' : '▴'}</button>
      </div>
      {!collapsed && (
        <div className="panel-body">
          <div className="row" style={{ alignItems: 'center' }}>
            <div
              style={{
                width: 54,
                height: 54,
                borderRadius: '50%',
                background: token.imageUrl ? `url(${token.imageUrl}) center/cover` : token.color,
                border: `2px solid ${token.color}`,
                flex: 'none',
              }}
            />
            <div className="field" style={{ flex: 1 }}>
              <label>Name</label>
              <input type="text" value={token.name} onChange={(e) => patch({ name: e.target.value })} />
            </div>
          </div>

          <div className="field">
            <label>Size: {token.size.toFixed(2)} cells</label>
            <input
              type="range"
              min={0.25}
              max={8}
              step={0.25}
              value={token.size}
              onChange={(e) => patch({ size: +e.target.value })}
            />
          </div>

          <div className="field">
            <label>Color</label>
            <div className="swatches">
              {COLORS.map((c) => (
                <div
                  key={c}
                  className={`swatch ${token.color === c ? 'active' : ''}`}
                  style={{ background: c }}
                  onClick={() => patch({ color: c })}
                />
              ))}
            </div>
          </div>

          <div className="row">
            <button className="btn" onClick={() => fileRef.current?.click()}>
              🖼️ Image
            </button>
            {token.imageUrl && (
              <button className="btn danger" onClick={() => patch({ imageUrl: null })}>
                Clear
              </button>
            )}
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              style={{ display: 'none' }}
              onChange={async (e) => {
                const f = e.target.files?.[0];
                if (f) patch({ imageUrl: await fileToDataUrl(f) });
              }}
            />
          </div>

          <div className="row">
            <label className="row" style={{ fontSize: 12, color: 'var(--text-dim)' }}>
              <input
                type="checkbox"
                checked={token.hidden}
                onChange={(e) => patch({ hidden: e.target.checked })}
              />
              Hidden from players
            </label>
            <label className="row" style={{ fontSize: 12, color: 'var(--text-dim)' }}>
              <input
                type="checkbox"
                checked={token.locked}
                onChange={(e) => patch({ locked: e.target.checked })}
              />
              Locked
            </label>
          </div>

          <div className="field">
            <label>Conditions</label>
            <div className="swatches">
              {CONDITIONS.map((c) => (
                <button
                  key={c}
                  className={`chip ${token.conditions.includes(c) ? 'primary' : ''}`}
                  style={{ cursor: 'pointer', background: token.conditions.includes(c) ? 'var(--accent)' : undefined }}
                  onClick={() => toggleCondition(c)}
                  title={c}
                >
                  {conditionIcon(c)} {c}
                </button>
              ))}
            </div>
          </div>

          <div className="field">
            <label>Assign owner</label>
            <select
              value={token.owner || ''}
              onChange={(e) => patch({ owner: e.target.value || null })}
            >
              <option value="">— none —</option>
              <PlayerOptions />
            </select>
          </div>

          <div className="row">
            <button
              className="btn"
              onClick={() =>
                dispatch({
                  kind: 'token.add',
                  token: {
                    ...token,
                    id: nanoid(),
                    x: token.x + scene.gridSize,
                    y: token.y,
                  },
                })
              }
            >
              ⧉ Duplicate
            </button>
            {isGM && (
              <button
                className="btn danger"
                onClick={() => dispatch({ kind: 'token.remove', id: token.id })}
              >
                🗑️ Delete
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function PlayerOptions() {
  const players = useStore((s) => s.players);
  return (
    <>
      {players.map((p) => (
        <option key={p.id} value={p.id}>
          {p.name}
        </option>
      ))}
    </>
  );
}
