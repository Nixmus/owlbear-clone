import { useRef, useState } from 'react';
import { useStore } from '../store';
import { nanoid } from '../util';
import Icon from './Icon';
import { can, type Role } from '../permissions';
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
  role: Role;
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
  const mapInput = useRef<HTMLInputElement>(null);
  const [collapsed, setCollapsed] = useState(false);

  const scene = state.scenes.find((s) => s.id === state.activeSceneId) || state.scenes[0];
  if (!scene) return null;
  const canManage = can(props.role, 'scene.manage');

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
      name: `Escena ${state.scenes.length + 1}`,
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
        <Icon name="map" size={14} />
        <span>Escenas</span>
        <span className="grow" />
        <button onClick={() => setCollapsed((v) => !v)} title={collapsed ? 'Expandir' : 'Contraer'}>
          {collapsed ? '▾' : '▴'}
        </button>
      </div>
      {!collapsed && (
        <div className="panel-body">
          {state.scenes.map((s) => (
            <div
              key={s.id}
              className={`scene-item ${s.id === scene.id ? 'active' : ''}`}
              onClick={() => dispatch({ kind: 'scene.activate', id: s.id })}
              title="Cambiar a esta escena"
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
                  className="icon-btn danger"
                  title="Eliminar escena"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (confirm(`¿Eliminar la escena "${s.name}"?`)) {
                      dispatch({ kind: 'scene.remove', id: s.id });
                    }
                  }}
                >
                  <Icon name="close" size={14} />
                </button>
              )}
            </div>
          ))}
          <button className="btn" onClick={addScene}>
            <Icon name="plus" size={14} /> Nueva escena
          </button>

          <div className="tool-divider" />

          <div className="field">
            <label>Mapa de fondo</label>
            <div className="row">
              <button className="btn" onClick={() => mapInput.current?.click()}>
                <Icon name="image" size={14} /> Subir mapa
              </button>
              {scene.mapUrl && (
                <button className="btn danger" onClick={() => patch({ mapUrl: null })}>
                  Quitar
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
            <span className="hint">Sube una imagen y se ajustará al tamaño automáticamente.</span>
          </div>

          <div className="row">
            <div className="field">
              <label>Tipo de rejilla</label>
              <select
                value={scene.gridType}
                onChange={(e) => patch({ gridType: e.target.value as Scene['gridType'] })}
              >
                <option value="square">Cuadrada</option>
                <option value="hex">Hexagonal</option>
                <option value="none">Sin rejilla</option>
              </select>
            </div>
            <div className="field">
              <label>Tamaño (px)</label>
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
              <label>Color de fondo</label>
              <input
                type="color"
                value={scene.backgroundColor}
                onChange={(e) => patch({ backgroundColor: e.target.value })}
              />
            </div>
            <div className="field">
              <label>Color de rejilla</label>
              <input
                type="color"
                value={rgbToHex(scene.gridColor)}
                onChange={(e) => patch({ gridColor: e.target.value + '55' })}
              />
            </div>
          </div>

          {canManage && (
            <>
              <div className="tool-divider" />
              <div className="section-label">Herramientas de dibujo y niebla</div>
              <div className="field">
                <label>Color de dibujo</label>
                <input type="color" value={props.color} onChange={(e) => props.setColor(e.target.value)} />
              </div>
              <div className="field">
                <label>Grosor de línea: {props.strokeWidth}px</label>
                <input
                  type="range"
                  min={1}
                  max={24}
                  value={props.strokeWidth}
                  onChange={(e) => props.setStrokeWidth(+e.target.value)}
                />
              </div>
              <div className="field">
                <label>Tamaño del pincel de niebla: {props.brushSize}px</label>
                <input
                  type="range"
                  min={10}
                  max={400}
                  value={props.brushSize}
                  onChange={(e) => props.setBrushSize(+e.target.value)}
                />
              </div>
              <label className="row checklist">
                <input
                  type="checkbox"
                  checked={props.fogOccludes}
                  onChange={(e) => props.setFogOccludes(e.target.checked)}
                />
                Niebla totalmente opaca
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
