import type { Tool } from '../types';

interface Props {
  tool: Tool;
  setTool: (t: Tool) => void;
  canUndo: boolean;
  onUndo: () => void;
  onClearDrawings: () => void;
  onClearFog: () => void;
  onAddToken: () => void;
}

const TOOLS: { id: Tool; icon: string; tip: string }[] = [
  { id: 'select', icon: '🖱️', tip: 'Select / Move' },
  { id: 'pan', icon: '✋', tip: 'Pan' },
  { id: 'ruler', icon: '📏', tip: 'Measure' },
];

const DRAW: { id: Tool; icon: string; tip: string }[] = [
  { id: 'pen', icon: '✏️', tip: 'Freehand' },
  { id: 'line', icon: '📐', tip: 'Line' },
  { id: 'rect', icon: '▭', tip: 'Rectangle' },
  { id: 'circle', icon: '◯', tip: 'Circle' },
];

const FOG: { id: Tool; icon: string; tip: string }[] = [
  { id: 'fog-reveal', icon: '💡', tip: 'Reveal fog' },
  { id: 'fog-hide', icon: '🌫️', tip: 'Hide (re-cover)' },
];

export default function ToolRail({
  tool,
  setTool,
  canUndo,
  onUndo,
  onClearDrawings,
  onClearFog,
  onAddToken,
}: Props) {
  const Btn = ({ id, icon, tip }: { id: Tool; icon: string; tip: string }) => (
    <button
      className={`tool ${tool === id ? 'active' : ''}`}
      data-tip={tip}
      onClick={() => setTool(id)}
    >
      {icon}
    </button>
  );

  return (
    <nav className="tools">
      {TOOLS.map((t) => (
        <Btn key={t.id} {...t} />
      ))}
      <div className="tool-divider" />
      {DRAW.map((t) => (
        <Btn key={t.id} {...t} />
      ))}
      <div className="tool-divider" />
      {FOG.map((t) => (
        <Btn key={t.id} {...t} />
      ))}
      <div className="tool-divider" />
      <button className="tool" data-tip="Add token" onClick={onAddToken}>
        ➕
      </button>
      <button className="tool" data-tip="Undo last drawing" onClick={onUndo} disabled={!canUndo}>
        ↩️
      </button>
      <button className="tool" data-tip="Clear drawings" onClick={onClearDrawings}>
        🧹
      </button>
      <button className="tool" data-tip="Reset fog" onClick={onClearFog}>
        ♻️
      </button>
    </nav>
  );
}
