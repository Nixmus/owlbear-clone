import { useState } from 'react';
import { useStore } from '../store';
import Icon from './Icon';

const KIND_LABEL: Record<string, string> = {
  join: 'Entrada',
  leave: 'Salida',
  'token.move': 'Movimiento',
  'token.add': 'Token creado',
  'token.remove': 'Token eliminado',
  'token.condition': 'Estado',
  'scene.activate': 'Escena',
  dice: 'Dados',
  note: 'Nota',
};

export default function History() {
  const log = useStore((s) => s.state.log || []);
  const isGM = useStore((s) => s.self.role === 'gm');
  const logEvent = useStore((s) => s.logEvent);
  const [open, setOpen] = useState(false);

  const addNote = () => {
    const text = prompt('Nota para el historial:');
    if (text) logEvent({ kind: 'note', text });
  };

  return (
    <div className="panel">
      <div className="panel-head">
        <Icon name="history" size={14} />
        <span>Historial</span>
        <span className="grow" />
        <button onClick={() => setOpen((v) => !v)} title={open ? 'Contraer' : 'Expandir'}>
          {open ? '▾' : '▴'}
        </button>
      </div>
      {open && (
        <div className="panel-body">
          {isGM && (
            <button className="btn sm" onClick={addNote}>
              <Icon name="plus" size={13} /> Añadir nota
            </button>
          )}
          <ul className="history-list">
            {[...log].reverse().map((e) => (
              <li key={e.id}>
                <span className="history-time">{new Date(e.ts).toLocaleTimeString()}</span>
                <span className="history-kind">{KIND_LABEL[e.kind] || e.kind}</span>
                <span>{e.text}</span>
              </li>
            ))}
            {log.length === 0 && <li className="muted">Sin movimientos todavía.</li>}
          </ul>
        </div>
      )}
    </div>
  );
}
