import { useState } from 'react';
import { useStore } from '../store';
import { nanoid } from '../util';
import Icon from './Icon';
import Brand from './Brand';

const COLORS = ['#7dd3fc', '#f472b6', '#4ade80', '#fbbf24', '#a78bfa', '#fb923c', '#f87171', '#34d399'];

export default function JoinDialog() {
  const roomId = useStore((s) => s.roomId);
  const self = useStore((s) => s.self);
  const connect = useStore((s) => s.connect);

  const [name, setName] = useState(self.name === 'Player' ? '' : self.name);
  const [color, setColor] = useState(self.color);
  const [role, setRole] = useState<'gm' | 'player'>('gm');
  const [room, setRoom] = useState(roomId);

  const join = () => {
    const finalName = name.trim() || 'Aventurero';
    localStorage.setItem('vtt.name', finalName);
    localStorage.setItem('vtt.color', color);
    localStorage.setItem('vtt.role', role);
    useStore.setState({ self: { ...self, name: finalName, color, role } });
    const url = new URL(location.href);
    url.searchParams.set('room', room);
    history.replaceState(null, '', url.toString());
    connect(room);
  };

  return (
    <div className="overlay">
      <div className="card">
        <h1>
          <Brand withName={false} /> Unirse a una mesa
        </h1>
        <p>Elige tu nombre y color, y comparte el código de sala con tus jugadores.</p>

        <div className="field">
          <label>Tu nombre</label>
          <input
            type="text"
            value={name}
            placeholder="Cómo te verán los demás"
            autoFocus
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && join()}
          />
        </div>

        <div className="field">
          <label>Código de sala</label>
          <div className="row">
            <input type="text" value={room} onChange={(e) => setRoom(e.target.value)} />
            <button
              className="btn"
              style={{ flex: 'none' }}
              title="Generar un código nuevo"
              onClick={() => setRoom(nanoid(6))}
            >
              <Icon name="dice" size={14} /> Nuevo
            </button>
          </div>
          <span className="hint">Todos los que usen el mismo código juegan juntos.</span>
        </div>

        <div className="field">
          <label>Color</label>
          <div className="swatches">
            {COLORS.map((c) => (
              <div
                key={c}
                className={`swatch ${color === c ? 'active' : ''}`}
                style={{ background: c }}
                onClick={() => setColor(c)}
              />
            ))}
          </div>
        </div>

        <div className="field">
          <label>Rol</label>
          <div className="role-toggle">
            <button className={role === 'gm' ? 'active' : ''} onClick={() => setRole('gm')}>
              <Icon name="crown" size={14} /> Director de juego
            </button>
            <button className={role === 'player' ? 'active' : ''} onClick={() => setRole('player')}>
              <Icon name="user" size={14} /> Jugador
            </button>
          </div>
        </div>

        <button className="btn primary big" onClick={join}>
          Entrar a la mesa
        </button>
      </div>
    </div>
  );
}
