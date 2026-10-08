import { useEffect, useRef, useState } from 'react';
import { nanoid } from '../util';
import { useStore } from '../store';
import { api } from '../api';
import Icon from './Icon';
import { can, type Role } from '../permissions';
import type { Token } from '../types';

const COLORS = ['#60a5fa', '#f87171', '#4ade80', '#fbbf24', '#a78bfa', '#f472b6', '#34d399', '#fb923c'];
const CONDITIONS = ['poisoned', 'prone', 'stunned', 'invisible', 'burning', 'blessed', 'dead', 'grappled'];

export default function Inspector({ selectedId, role }: { selectedId: string | null; role: Role }) {
  const state = useStore((s) => s.state);
  const dispatch = useStore((s) => s.dispatch);
  const self = useStore((s) => s.self);
  const characters = useStore((s) => s.characters);
  const setCharacters = useStore((s) => s.setCharacters);
  const fileRef = useRef<HTMLInputElement>(null);
  const [collapsed, setCollapsed] = useState(false);

  const scene = state.scenes.find((s) => s.id === state.activeSceneId) || state.scenes[0];
  const token = state.tokens.find((t) => t.id === selectedId) || null;

  // --- linked character sheet -------------------------------------------
  // The sheet is the source of truth for name/portrait: changes made in the
  // hub flow onto the token here. Edits made in this panel flow the other way
  // through `patch()`, which mirrors them back onto the sheet AND updates the
  // local `characters` list so the two never disagree.
  const linkedCharacter = token?.characterId
    ? characters.find((c) => c.id === token.characterId) ?? null
    : null;
  const linkedName = linkedCharacter?.name ?? null;
  const linkedPortrait = linkedCharacter?.portraitUrl ?? null;
  const linkedTokenId = linkedCharacter ? token!.id : null;

  useEffect(() => {
    if (!linkedTokenId) return;
    const current = useStore.getState().state.tokens.find((t) => t.id === linkedTokenId);
    if (!current) return;
    if (linkedName !== null && current.name !== linkedName) {
      dispatch({ kind: 'token.update', id: linkedTokenId, patch: { name: linkedName } });
    }
    if (linkedPortrait !== null && current.imageUrl !== linkedPortrait) {
      dispatch({ kind: 'token.update', id: linkedTokenId, patch: { imageUrl: linkedPortrait } });
    }
  }, [linkedTokenId, linkedName, linkedPortrait, dispatch]);

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
  // Ownership survives reconnects: `owner` is a per-session clientId, while
  // `userId` is the account, so accept either.
  const canEdit =
    isGM ||
    !token.owner ||
    token.owner === self.id ||
    (!!token.userId && token.userId === self.userId);
  const patch = (p: Partial<Token>) => {
    dispatch({ kind: 'token.update', id: token.id, patch: p });

    // Mirror name/portrait edits onto the linked character sheet. The local
    // `characters` list is updated too, otherwise the effect above would see
    // the stale sheet name and immediately undo this edit.
    if (!token.characterId) return;
    if (p.name === undefined && p.imageUrl === undefined) return;

    const patchData: { name?: string; portraitUrl?: string | null } = {};
    const localPatch: Partial<import('../api').Character> = {};
    if (p.name !== undefined) {
      patchData.name = p.name;
      localPatch.name = p.name;
    }
    if (p.imageUrl !== undefined) {
      patchData.portraitUrl = p.imageUrl;
      localPatch.portraitUrl = p.imageUrl;
    }

    setCharacters(
      characters.map((c) =>
        c.id === token.characterId ? { ...c, ...localPatch } : c,
      ),
    );
    api.patch(`/characters/${token.characterId}`, patchData).catch(() => {});
  };

  const toggleCondition = (c: string) => {
    const has = token.conditions.includes(c);
    patch({ conditions: has ? token.conditions.filter((x) => x !== c) : [...token.conditions, c] });
  };

  if (!canEdit) {
    return (
      <div className="panel">
        <div className="panel-head">
          <Icon name="user" size={14} />
          <span>Token de otro jugador</span>
          <span className="grow" />
          <button onClick={() => setCollapsed((v) => !v)}>{collapsed ? '▾' : '▴'}</button>
        </div>
        {!collapsed && (
          <div className="panel-body">
            <p className="hint">
              Este token pertenece a otro jugador. Solo su dueño o el director de juego pueden editarlo.
            </p>
          </div>
        )}
      </div>
    );
  }

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

          {isGM && (
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
          )}

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
            <label>Dueño del token</label>
            <select
              value={token.owner || ''}
              onChange={(e) => patch({ owner: e.target.value || null })}
            >
              <option value="">Sin dueño (PNJ / enemigo)</option>
              <OwnerOptions />
            </select>
            <span className="hint">
              Cada jugador controla los tokens que tenga asignados.
            </span>
          </div>

          <div className="field">
            <label>Vincular a ficha de personaje</label>
            <select
              value={token.characterId || ''}
              onChange={(e) => patch({ characterId: e.target.value || null })}
            >
              <option value="">Sin vincular</option>
              {characters.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <span className="hint">
              Al vincular, el token y la ficha comparten nombre, imagen y datos.
            </span>
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

function OwnerOptions() {
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
