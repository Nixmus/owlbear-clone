import type { Tool } from '../types';
import Icon, { type IconName } from './Icon';
import { can, type Role } from '../permissions';

interface Props {
  tool: Tool;
  setTool: (t: Tool) => void;
  role: Role;
  color: string;
  setColor: (c: string) => void;
  canUndo: boolean;
  onUndo: () => void;
  onClearDrawings: () => void;
  onClearFog: () => void;
  onAddToken: () => void;
  onManageUsers: () => void;
}

const TOOLS: { id: Tool; icon: IconName; tip: string }[] = [
  { id: 'select', icon: 'select', tip: 'Seleccionar / Mover' },
  { id: 'pan', icon: 'pan', tip: 'Desplazar' },
  { id: 'ruler', icon: 'ruler', tip: 'Medir' },
];

const DRAW: { id: Tool; icon: IconName; tip: string }[] = [
  { id: 'pen', icon: 'pen', tip: 'Mano alzada' },
  { id: 'line', icon: 'line', tip: 'Línea' },
  { id: 'rect', icon: 'rect', tip: 'Rectángulo' },
  { id: 'circle', icon: 'circle', tip: 'Círculo' },
  { id: 'eraser', icon: 'eraser', tip: 'Borrador' },
];

const FOG: { id: Tool; icon: IconName; tip: string }[] = [
  { id: 'fog-reveal', icon: 'reveal', tip: 'Revelar niebla' },
  { id: 'fog-hide', icon: 'fog', tip: 'Cubrir con niebla' },
];

export default function ToolRail({
  tool,
  setTool,
  role,
  color,
  setColor,
  canUndo,
  onUndo,
  onClearDrawings,
  onClearFog,
  onAddToken,
  onManageUsers,
}: Props) {
  const Btn = ({ id, icon, tip }: { id: Tool; icon: IconName; tip: string }) => (
    <button
      className={`tool ${tool === id ? 'active' : ''}`}
      data-tip={tip}
      onClick={() => setTool(id)}
      title={tip}
      aria-label={tip}
    >
      <Icon name={icon} />
    </button>
  );

  const canDraw = can(role, 'draw');
  const canFog = can(role, 'fog.edit');
  const canToken = can(role, 'token.add');
  const isGM = can(role, 'user.manage');

  return (
    <nav className="tools">
      {TOOLS.filter((t) => t.id !== 'ruler' || can(role, 'measure')).map((t) => (
        <Btn key={t.id} {...t} />
      ))}
      {canDraw && (
        <>
          <div className="tool-divider" />
          {DRAW.map((t) => (
            <Btn key={t.id} {...t} />
          ))}
        </>
      )}
      {canFog && (
        <>
          <div className="tool-divider" />
          {FOG.map((t) => (
            <Btn key={t.id} {...t} />
          ))}
        </>
      )}
      <div className="tool-divider" />
      {canToken && (
        <button className="tool" data-tip="Añadir token" title="Añadir token" onClick={onAddToken}>
          <Icon name="plus" />
        </button>
      )}
      {canDraw && (
        <button
          className="tool"
          data-tip="Deshacer último dibujo"
          title="Deshacer último dibujo"
          onClick={onUndo}
          disabled={!canUndo}
        >
          <Icon name="undo" />
        </button>
      )}
      {canDraw && (
        <button
          className="tool"
          data-tip="Borrar todos los dibujos"
          title="Borrar todos los dibujos"
          onClick={onClearDrawings}
        >
          <Icon name="clear" />
        </button>
      )}
      {canFog && (
        <button className="tool" data-tip="Reiniciar niebla" title="Reiniciar niebla" onClick={onClearFog}>
          <Icon name="reset" />
        </button>
      )}

      {isGM && (
        <>
          <div className="tool-divider" />
          <button
            className="tool"
            data-tip="Gestionar jugadores"
            title="Gestionar jugadores"
            onClick={onManageUsers}
          >
            <Icon name="members" />
          </button>
          <label className="tool color-tool" data-tip="Color del trazo" title="Color del trazo">
            <span style={{ background: color }} />
            <input type="color" value={color} onChange={(e) => setColor(e.target.value)} />
          </label>
        </>
      )}
    </nav>
  );
}
