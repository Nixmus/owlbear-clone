import { useRef, useState } from 'react';
import { useStore } from '../store';
import { nanoid } from '../util';
import type { Scene } from '../types';

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

interface Props {
  color: string;
  setColor: (c: string) => void;
  strokeWidth: number;
  setStrokeWidth: (n: number) => void;
  brushSize: number;
  setBrushSize: (n: number) => void;
  fogOccludes: boolean;
  setFogOccludes: (b: boolean) => void;
}

export default function ScenePanel(props: Props) {
  const state = useStore((s) => s.state);
  const dispatch = useStore((s) => s.dispatch);
  const self = useStore((s) => s.self);
  const mapInput = useRef<HTMLInputElement>(null);
  const [collapsed, setCollapsed] = useState(false);

  const scene = state.scenes.find((s) => s.id === state.activeSceneId) || state.scenes[0];
  if (!scene) return null;
  const isGM = self.role === 'gm';

  const patch = (p: Partial<Scene>) => dispatch({ kind: 'scene.update', id: scene.id, patch: p });

  const onMap = async (file?: File) => {
    if (!file) return;
    const url = await fileToDataUrl(file);
    const img = new Image();
    img.onload = () => {
      patch({ mapUrl: url, width: img.naturalWidth, height: img.naturalHeight });
    };
    img.src = url;
  };

  const addScene = () => {
    const s: Scene = {
      id: nanoid(10),
      name: `Scene ${state.scenes.length + 1}`,
      mapUrl: null,
      backgroundColor: '#2b2b33',
      gridType: 'square',
      gridSize: 70,
      gridColor: '#ffffff22',
      width: 1920,
      height: 1080,
    };
    dispatch({ kind: 'scene.add', scene: s });
    dispatch({ kind: 'scene.activate', id: s.id });
  };

  return (
    <div className="panel">
      <div className="panel-head">
        <span>🗺️ Scenes</span>
        <span className="grow" />
        <button onClick={() => setCollapsed((v) => !v)}>{collapsed ? '▾' : '▴'}</button>
      </div>
      {!collapsed && (
        <div className="panel-body">
          {state.scenes.map((s) => (
            <div
              key={s.id}
              className={`scene-item ${s.id === scene.id ? 'active' : ''}`}
              onClick={() => dispatch({ kind: 'scene.activate', id: s.id })}
            >
              {s.mapUrl ? (
                <img className="scene-thumb" src={s.mapUrl} alt="" />
              ) : (
                <div className="scene-thumb" style={{ background: s.backgroundColor }} />
              )}
              <input
                value={s.name}
                onClick={(e) => e.stopPropagation()}
                onChange={(e) => dispatch({ kind: 'scene.update', id: s.id, patch: { name: e.target.value } })}
              />
              {state.scenes.length > 1 && (
                <button
                  className="btn sm danger"
                  onClick={(e) => {
                    e.stopPropagation();
                    dispatch({ kind: 'scene.remove', id: s.id });
                  }}
                >
                  ✕
                </button>
              )}
            </div>
          ))}
          <button className="btn" onClick={addScene}>
            ➕ New scene
          </button>

          <div className="field">
            <label>Background map</label>
            <div className="row">
              <button className="btn" onClick={() => mapInput.current?.click()}>
                🖼️ Upload map
              </button>
              {scene.mapUrl && (
                <button className="btn danger" onClick={() => patch({ mapUrl: null })}>
                  Remove
                </button>
              )}
            </div>
            <input
              ref={mapInput}
              type="file"
              accept="image/*"
              style={{ display: 'none' }}
              onChange={(e) => onMap(e.target.files?.[0])}
            />
          </div>

          <div className="row">
            <div className="field">
              <label>Grid type</label>
              <select
                value={scene.gridType}
                onChange={(e) => patch({ gridType: e.target.value as Scene['gridType'] })}
              >
                <option value="square">Square</option>
                <option value="hex">Hex</option>
                <option value="none">None</option>
              </select>
            </div>
            <div className="field">
              <label>Grid size</label>
              <input
                type="number"
                value={scene.gridSize}
                min={10}
                max={300}
                onChange={(e) => patch({ gridSize: clampNum(+e.target.value, 10, 300) })}
              />
            </div>
          </div>

          <div className="row">
            <div className="field">
              <label>Background</label>
              <input
                type="color"
                value={scene.backgroundColor}
                onChange={(e) => patch({ backgroundColor: e.target.value })}
              />
            </div>
            <div className="field">
              <label>Grid color</label>
              <input
                type="color"
                value={rgbToHex(scene.gridColor)}
                onChange={(e) => patch({ gridColor: e.target.value + '55' })}
              />
            </div>
          </div>

          {isGM && (
            <>
              <div className="tool-divider" />
              <div className="field">
                <label>Drawing color</label>
                <input type="color" value={props.color} onChange={(e) => props.setColor(e.target.value)} />
              </div>
              <div className="field">
                <label>Stroke width: {props.strokeWidth}px</label>
                <input
                  type="range"
                  min={1}
                  max={24}
                  value={props.strokeWidth}
                  onChange={(e) => props.setStrokeWidth(+e.target.value)}
                />
              </div>
              <div className="field">
                <label>Fog brush size: {props.brushSize}px</label>
                <input
                  type="range"
                  min={10}
                  max={400}
                  value={props.brushSize}
                  onChange={(e) => props.setBrushSize(+e.target.value)}
                />
              </div>
              <label className="row" style={{ fontSize: 12, color: 'var(--text-dim)' }}>
                <input
                  type="checkbox"
                  checked={props.fogOccludes}
                  onChange={(e) => props.setFogOccludes(e.target.checked)}
                />
                Total blackout (occlude fully)
              </label>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function clampNum(n: number, min: number, max: number) {
  if (Number.isNaN(n)) return min;
  return Math.max(min, Math.min(max, n));
}

function rgbToHex(color: string): string {
  if (color.startsWith('#')) return color.slice(0, 7);
  return '#ffffff';
}
