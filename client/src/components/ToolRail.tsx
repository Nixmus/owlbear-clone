import type { Tool } from '../types';
import Icon, { type IconName } from './Icon';
import { can, type Role } from '../permissions';

interface Props {
  tool: Tool;
  setTool: (t: Tool) => void;
  role: Role;
  canUndo: boolean;
  onUndo: () => void;
  onClearDrawings: () => void;
  onClearFog: () => void;
  onAddToken: () => void;
}

const TOOLS: { id: Tool; icon: IconName; tip: string }[] = [
  { id: 'select', icon: 'select', tip: 'Select / Move' },
  { id: 'pan', icon: 'pan', tip: 'Pan' },
  { id: 'ruler', icon: 'ruler', tip: 'Measure' },
];

const DRAW: { id: Tool; icon: IconName; tip: string }[] = [
  { id: 'pen', icon: 'pen', tip: 'Freehand' },
  { id: 'line', icon: 'line', tip: 'Line' },
  { id: 'rect', icon: 'rect', tip: 'Rectangle' },
  { id: 'circle', icon: 'circle', tip: 'Circle' },
];

const FOG: { id: Tool; icon: IconName; tip: string }[] = [
  { id: 'fog-reveal', icon: 'reveal', tip: 'Reveal fog' },
  { id: 'fog-hide', icon: 'fog', tip: 'Hide (re-cover)' },
];

export default function ToolRail({
  tool,
  setTool,
  role,
  canUndo,
  onUndo,
  onClearDrawings,
  onClearFog,
  onAddToken,
}: Props) {
  const Btn = ({ id, icon, tip }: { id: Tool; icon: IconName; tip: string }) => (
    <button
      className={`tool ${tool === id ? 'active' : ''}`}
      data-tip={tip}
      onClick={() => setTool(id)}
      title={tip}
    >
      <Icon name={icon} />
    </button>
  );

  const canDraw = can(role, 'draw');
  const canFog = can(role, 'fog.edit');
  const canToken = can(role, 'token.add');

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
          data-tip="Borrar dibujos"
          title="Borrar dibujos"
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
    </nav>
  );
}
