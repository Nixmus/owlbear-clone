import { useState } from 'react';
import { useStore } from '../store';
import { nanoid } from '../util';

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
    // Persist identity so the store can send it on the socket handshake.
    const finalName = name.trim() || 'Adventurer';
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
          <span>🦉</span> Join a table
        </h1>
        <p>Pick a name and color, then join or create a room to play together.</p>

        <div className="field">
          <label>Display name</label>
          <input
            type="text"
            value={name}
            placeholder="Adventurer"
            autoFocus
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && join()}
          />
        </div>

        <div className="field">
          <label>Room id</label>
          <div className="row">
            <input type="text" value={room} onChange={(e) => setRoom(e.target.value)} />
            <button className="btn" style={{ flex: 'none' }} onClick={() => setRoom(nanoid(6))}>
              🎲 New
            </button>
          </div>
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
          <label>Role</label>
          <div className="role-toggle">
            <button className={role === 'gm' ? 'active' : ''} onClick={() => setRole('gm')}>
              👑 Game Master
            </button>
            <button className={role === 'player' ? 'active' : ''} onClick={() => setRole('player')}>
              🧙 Player
            </button>
          </div>
        </div>

        <button className="btn primary" style={{ padding: '10px' }} onClick={join}>
          Enter table →
        </button>
      </div>
    </div>
  );
}
