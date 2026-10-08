import { useStore } from '../store';
import Icon from './Icon';

export default function UserManager({ onClose }: { onClose: () => void }) {
  const players = useStore((s) => s.players);
  const self = useStore((s) => s.self);
  const setRole = useStore((s) => s.setRole);

  return (
    <div className="overlay" onClick={onClose}>
      <div className="card wide" onClick={(e) => e.stopPropagation()}>
        <div className="row spread">
          <h1>
            <Icon name="members" size={18} /> Jugadores de la mesa
          </h1>
          <button className="icon-btn" onClick={onClose} title="Cerrar" aria-label="Cerrar">
            <Icon name="close" size={16} />
          </button>
        </div>
        <p className="muted">
          Como director de juego puedes asignar quién hace de director. Solo puede haber un concepto de
          permisos: el director controla mapas, niebla y jugadores.
        </p>

        <ul className="list">
          {players.map((p) => (
            <li key={p.id}>
              <span className="dot" style={{ background: p.color }} />
              <b>{p.name}</b>
              {p.id === self.id && <span className="chip">tú</span>}
              <span className="spacer" style={{ flex: 1 }} />
              <select
                value={p.role}
                disabled={p.id === self.id}
                title={p.id === self.id ? 'No puedes cambiar tu propio rol' : 'Cambiar rol'}
                onChange={(e) => setRole(p.id, e.target.value as 'gm' | 'player')}
              >
                <option value="gm">Director de juego</option>
                <option value="player">Jugador</option>
              </select>
            </li>
          ))}
          {players.length === 0 && <li className="muted">Sin jugadores conectados.</li>}
        </ul>
      </div>
    </div>
  );
}
