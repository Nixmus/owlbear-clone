import { useRef, useState } from 'react';
import { nanoid } from '../util';
import { useStore } from '../store';
import Icon from './Icon';
import { can, type Role } from '../permissions';
import type { Token } from '../types';

const COLORS = ['#60a5fa', '#f87171', '#4ade80', '#fbbf24', '#a78bfa', '#f472b6', '#34d399', '#fb923c'];

export default function Inspector({ selectedId, role }: { selectedId: string | null; role: Role }) {
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
          <Icon name="select" size={14} />
          <span>Ficha del token</span>
          <span className="grow" />
          <button onClick={() => setCollapsed((v) => !v)}>{collapsed ? '▾' : '▴'}</button>
        </div>
        {!collapsed && (
          <div className="panel-body">
            <p className="hint">
              Selecciona un token en el mapa para editarlo. Para crear uno, usa el botón
              <b> Añadir token</b> en la barra de herramientas.
            </p>
            <div className="field">
              <label>Escena activa</label>
              <div className="chip">{scene.name}</div>
            </div>
          </div>
        )}
      </div>
    );
  }

  const isGM = can(role, 'token.deleteAny');
  const patch = (p: Partial<Token>) => dispatch({ kind: 'token.update', id: token.id, patch: p });

  return (
    <div className="panel">
      <div className="panel-head">
        <Icon name="user" size={14} />
        <span>Token</span>
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
              <label>Nombre</label>
              <input
                type="text"
                value={token.name}
                placeholder="Nombre del token"
                onChange={(e) => patch({ name: e.target.value })}
              />
            </div>
          </div>

          <div className="field">
            <label>Tamaño: {token.size.toFixed(2)} casillas</label>
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
              <Icon name="image" size={14} /> Imagen
            </button>
            {token.imageUrl && (
              <button className="btn danger" onClick={() => patch({ imageUrl: null })}>
                Quitar imagen
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
            <label className="row checklist" title="Los jugadores no verán este token">
              <input
                type="checkbox"
                checked={token.hidden}
                onChange={(e) => patch({ hidden: e.target.checked })}
              />
              Oculto a jugadores
            </label>
            <label className="row checklist" title="Evita moverlo por accidente">
              <input
                type="checkbox"
                checked={token.locked}
                onChange={(e) => patch({ locked: e.target.checked })}
              />
              Bloqueado
            </label>
          </div>

          <div className="field">
            <label>Estado / condiciones</label>
            <div className="swatches">
              {CONDITIONS.map((c) => (
                <button
                  key={c}
                  className="chip toggle"
                  style={{
                    cursor: 'pointer',
                    background: token.conditions.includes(c) ? 'var(--accent)' : undefined,
                    color: token.conditions.includes(c) ? '#10131c' : undefined,
                  }}
                  onClick={() => toggleCondition(c)}
                >
                  {c}
                </button>
              ))}
            </div>
          </div>

          <div className="field">
            <label>Tipo de token</label>
            <select
              value={token.owner ? 'owned' : 'npc'}
              onChange={(e) => patch({ owner: e.target.value === 'owned' ? self.id : null })}
            >
              <option value="owned">Personaje de jugador</option>
              <option value="npc">PNJ / enemigo</option>
            </select>
          </div>

          <div className="row" style={{ marginTop: 4 }}>
            <button
              className="btn"
              title="Duplica este token"
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
              Duplicar
            </button>
            {isGM && (
              <button
                className="btn danger"
                onClick={() => dispatch({ kind: 'token.remove', id: token.id })}
              >
                <Icon name="trash" size={14} /> Eliminar
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
