import { useEffect, useRef, useState } from 'react';
import { useStore } from '../store';
import { nanoid } from '../util';
import Icon from './Icon';
import { api, assetUrl, type Asset } from '../api';
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
  decalImage: { url: string; w: number; h: number } | null;
  setDecalImage: (v: { url: string; w: number; h: number } | null) => void;
  decalSize: number;
  setDecalSize: (n: number) => void;
  decalOpacity: number;
  setDecalOpacity: (n: number) => void;
  fillEnabled: boolean;
  setFillEnabled: (b: boolean) => void;
  fillColor: string;
  setFillColor: (c: string) => void;
  fillOpacity: number;
  setFillOpacity: (n: number) => void;
}

export default function ScenePanel(props: Props) {
  const state = useStore((s) => s.state);
  const roomId = useStore((s) => s.roomId);
  const dispatch = useStore((s) => s.dispatch);
  const previewSceneId = useStore((s) => s.previewSceneId);
  const setPreviewScene = useStore((s) => s.setPreviewScene);
  const mapInput = useRef<HTMLInputElement>(null);
  const [collapsed, setCollapsed] = useState(false);

  const scene = state.scenes.find((s) => s.id === state.activeSceneId) || state.scenes[0];
  // Entering from a campaign uses the campaign id as the room id, which is how
  // the board links are built (`/?room=<campaignId>`). Casual rooms have no
  // assets to draw from, so the picker simply stays empty.
  const campaignId = roomId;
  const [images, setImages] = useState<Asset[]>([]);

  // Images available to paste onto the map.
  useEffect(() => {
    if (!campaignId) return;
    api
      .get<{ assets: Asset[] }>(`/campaigns/${campaignId}/assets`)
      .then((d) => setImages(d.assets.filter((a) => a.mime.startsWith('image/'))))
      .catch(() => setImages([]));
  }, [campaignId]);

  if (!scene) return null;
  const canManage = can(props.role, 'scene.manage');

  // When previewing, edit the previewed scene (GM only, local view).
  const editScene = (previewSceneId && state.scenes.find((s) => s.id === previewSceneId)) || scene;

  const patch = (p: Partial<Scene>) => dispatch({ kind: 'scene.update', id: editScene.id, patch: p });

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
          {canManage ? (
            <>
              {previewSceneId && (
                <div className="preview-banner">
                  <span>
                    Vista previa de <b>{editScene.name}</b> (solo tú la ves)
                  </span>
                  <button className="btn sm" onClick={() => setPreviewScene(null)}>
                    Salir
                  </button>
                </div>
              )}
              {state.scenes.map((s) => (
                <div
                  key={s.id}
                  className={`scene-item ${s.id === editScene.id ? 'active' : ''}`}
                  title="Clic para previsualizar · botón para activar"
                >
                  {s.mapUrl ? (
                    <img className="scene-thumb" src={s.mapUrl} alt="" />
                  ) : (
                    <div className="scene-thumb" style={{ background: s.backgroundColor }} />
                  )}
                  <input
                    value={s.name}
                    onClick={(e) => e.stopPropagation()}
                    onChange={(e) =>
                      dispatch({ kind: 'scene.update', id: s.id, patch: { name: e.target.value } })
                    }
                  />
                  <button
                    className="icon-btn"
                    title="Previsualizar (solo para ti)"
                    onClick={(e) => {
                      e.stopPropagation();
                      setPreviewScene(s.id);
                    }}
                  >
                    <Icon name="eye" size={14} />
                  </button>
                  <button
                    className="icon-btn"
                    title={s.id === state.activeSceneId ? 'Escena activa' : 'Activar para todos'}
                    disabled={s.id === state.activeSceneId}
                    onClick={(e) => {
                      e.stopPropagation();
                      dispatch({ kind: 'scene.activate', id: s.id });
                      setPreviewScene(null);
                    }}
                  >
                    <Icon name="check" size={14} />
                  </button>
                  {state.scenes.length > 1 && (
                    <button
                      className="icon-btn danger"
                      title="Eliminar escena"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (confirm(`¿Eliminar la escena "${s.name}"?`)) {
                          dispatch({ kind: 'scene.remove', id: s.id });
                          if (previewSceneId === s.id) setPreviewScene(null);
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
                <label>Mapa de fondo {previewSceneId ? '(editando vista previa)' : ''}</label>
                <div className="row">
                  <button className="btn" onClick={() => mapInput.current?.click()}>
                    <Icon name="image" size={14} /> Subir mapa
                  </button>
                  {editScene.mapUrl && (
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
                    value={editScene.gridType}
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
                    value={editScene.gridSize}
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
                    value={editScene.backgroundColor}
                    onChange={(e) => patch({ backgroundColor: e.target.value })}
                  />
                </div>
                <div className="field">
                  <label>Color de rejilla</label>
                  <input
                    type="color"
                    value={rgbToHex(editScene.gridColor)}
                    onChange={(e) => patch({ gridColor: e.target.value + '55' })}
                  />
                </div>
              </div>

              <div className="tool-divider" />
              <div className="section-label">Dibujo y niebla</div>
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

              <label className="row checklist" title="Rellena rectángulos y círculos con el color de abajo">
                <input
                  type="checkbox"
                  checked={props.fillEnabled}
                  onChange={(e) => props.setFillEnabled(e.target.checked)}
                />
                Rellenar formas
              </label>
              {props.fillEnabled && (
                <>
                  <div className="field">
                    <label>Color de relleno</label>
                    <input
                      type="color"
                      value={props.fillColor}
                      onChange={(e) => props.setFillColor(e.target.value)}
                    />
                  </div>
                  <div className="field">
                    <label>Opacidad: {Math.round(props.fillOpacity * 100)}%</label>
                    <input
                      type="range"
                      min={5}
                      max={100}
                      value={Math.round(props.fillOpacity * 100)}
                      onChange={(e) => props.setFillOpacity(+e.target.value / 100)}
                    />
                  </div>
                </>
              )}
              {canManage && (
                <>
                  <div className="tool-divider" />
                  <div className="section-label">Imágenes sobre el mapa</div>
                  <p className="muted" style={{ margin: 0, fontSize: 11.5 }}>
                    Elige una imagen y haz clic en el mapa para pegarla como un sticker.
                  </p>
                  {images.length === 0 ? (
                    <p className="muted" style={{ margin: 0, fontSize: 11.5 }}>
                      Sube imágenes a los recursos de la campaña para usarlas aquí.
                    </p>
                  ) : (
                    <div className="decal-picker">
                      {images.map((a) => (
                        <button
                          key={a.id}
                          className={`decal-chip ${
                            props.decalImage?.url === a.url ? 'active' : ''
                          }`}
                          title={a.name}
                          onClick={() =>
                            props.setDecalImage({ url: a.url, w: 200, h: 200 })
                          }
                        >
                          <img src={assetUrl(a.url) || a.url} alt={a.name} loading="lazy" />
                        </button>
                      ))}
                    </div>
                  )}
                  <div className="field">
                    <label>Tamaño al pegar: {props.decalSize}px</label>
                    <input
                      type="range"
                      min={40}
                      max={800}
                      step={10}
                      value={props.decalSize}
                      onChange={(e) => props.setDecalSize(+e.target.value)}
                    />
                  </div>
                  <div className="field">
                    <label>Opacidad del sticker: {Math.round(props.decalOpacity * 100)}%</label>
                    <input
                      type="range"
                      min={10}
                      max={100}
                      value={Math.round(props.decalOpacity * 100)}
                      onChange={(e) => props.setDecalOpacity(+e.target.value / 100)}
                    />
                  </div>
                </>
              )}

              </>
          ) : (
            <p className="hint">
              El director de juego controla los mapas, las escenas y la rejilla. Tú puedes mover tus
              tokens, dibujar y usar el chat.
            </p>
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
