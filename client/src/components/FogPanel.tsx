import { useStore } from '../store';
import Icon from '../Icon';
import { can, type Role } from '../permissions';

interface Props {
  role: Role;
  fogOccludes: boolean;
  setFogOccludes: (b: boolean) => void;
  gmFogTransparent: boolean;
  setGmFogTransparent: (b: boolean) => void;
  fogOpacity: number;
  setFogOpacity: (n: number) => void;
  brushSize: number;
  setBrushSize: (n: number) => void;
  fogLighting: boolean;
  setFogLighting: (b: boolean) => void;
  fogLightRadius: number;
  setFogLightRadius: (n: number) => void;
  fogOwnTokensOnly: boolean;
  setFogOwnTokensOnly: (b: boolean) => void;
}

/**
 * All fog settings in one place. Previously these were scattered across the
 * scene panel next to the drawing controls, which made the fog hard to find.
 */
export default function FogPanel(props: Props) {
  const dispatch = useStore((s) => s.dispatch);
  const scene = useStore((s) => s.state.scenes.find((x) => x.id === s.state.activeSceneId));
  const isGM = props.role === 'gm';
  const canEdit = can(props.role, 'fog.edit');

  if (!isGM && !canEdit) {
    return (
      <div className="panel">
        <div className="panel-head">
          <Icon name="fog" size={14} />
          <span>Niebla</span>
        </div>
        <div className="panel-body">
          <p className="hint">Solo el director de juego puede gestionar la niebla.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="panel">
      <div className="panel-head">
        <Icon name="fog" size={14} />
        <span>Niebla e iluminación</span>
        <span className="grow" />
        <button
          className="icon-btn danger"
          title="Quitar toda la niebla de esta escena"
          onClick={() => {
            if (scene && confirm('¿Quitar toda la niebla de esta escena?')) {
              dispatch({ kind: 'fog.clear', sceneId: scene.id });
            }
          }}
        >
          <Icon name="clear" size={14} />
        </button>
      </div>

      <div className="panel-body">
        {/* ---- painting ---- */}
        <div className="section-label">Pincel de niebla</div>
        <div className="field">
          <label>Tamaño del pincel: {props.brushSize}px</label>
          <input
            type="range"
            min={10}
            max={400}
            value={props.brushSize}
            onChange={(e) => props.setBrushSize(+e.target.value)}
          />
        </div>
        <div className="field">
          <label>Densidad de la niebla nueva: {Math.round(props.fogOpacity * 100)}%</label>
          <input
            type="range"
            min={10}
            max={100}
            value={Math.round(props.fogOpacity * 100)}
            onChange={(e) => props.setFogOpacity(+e.target.value / 100)}
          />
          <span className="hint">Se aplica a lo que pintes a partir de ahora.</span>
        </div>
        <label className="row checklist">
          <input
            type="checkbox"
            checked={props.fogOccludes}
            onChange={(e) => props.setFogOccludes(e.target.checked)}
          />
          Niebla totalmente opaca
        </label>
        <span className="hint">
          Si la apagas, la niebla deja translucir el mapa. Útil para que los jugadores no pierdan
          del todo la orientación.
        </span>

        <div className="tool-divider" />

        {/* ---- lighting ---- */}
        <div className="section-label">Iluminación</div>
        <label
          className="row checklist"
          title="Abre la niebla alrededor de cada token con caída progresiva: cerca se ve claro y se va difuminando hasta la distancia máxima de visión"
        >
          <input
            type="checkbox"
            checked={props.fogLighting}
            onChange={(e) => props.setFogLighting(e.target.checked)}
          />
          Modo iluminación
        </label>
        {props.fogLighting && (
          <>
            <div className="field">
              <label>Distancia máxima de visión: {props.fogLightRadius}px</label>
              <input
                type="range"
                min={60}
                max={900}
                step={20}
                value={props.fogLightRadius}
                onChange={(e) => props.setFogLightRadius(+e.target.value)}
              />
              <span className="hint">
                La luz se va difuminando poco a poco hasta esta distancia, donde la niebla vuelve a
                ser opaca.
              </span>
            </div>
            <label
              className="row checklist"
              title="Con la iluminación activa, los jugadores ven únicamente sus propios tokens. El director los ve todos."
            >
              <input
                type="checkbox"
                checked={props.fogOwnTokensOnly}
                onChange={(e) => props.setFogOwnTokensOnly(e.target.checked)}
              />
              Los jugadores solo ven sus propios tokens
            </label>
          </>
        )}

        <div className="tool-divider" />

        {/* ---- GM view ---- */}
        <div className="section-label">Vista del director</div>
        <label
          className="row checklist"
          title="Solo tú ves el mapa bajo la niebla. Los jugadores no se ven afectados."
        >
          <input
            type="checkbox"
            checked={props.gmFogTransparent}
            onChange={(e) => props.setGmFogTransparent(e.target.checked)}
          />
          Ver a través de la niebla
        </label>
      </div>
    </div>
  );
}