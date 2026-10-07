import { useStore } from '../store';
import Icon from './Icon';
import Brand from './Brand';

export default function TopBar() {
  const status = useStore((s) => s.status);
  const roomId = useStore((s) => s.roomId);
  const players = useStore((s) => s.players);
  const self = useStore((s) => s.self);
  const setSelf = useStore((s) => s.setSelf);

  const copyLink = () => {
    const url = `${location.origin}${location.pathname}?room=${roomId}`;
    navigator.clipboard?.writeText(url);
  };

  return (
    <header className="topbar">
      <Brand />

      <div className="roomchip" title="Room id">
        <span className={`status-dot ${status}`} />
        <span>Sala</span>
        <code>{roomId}</code>
        <button className="btn sm" onClick={copyLink} title="Copy invite link">
          <Icon name="link" size={14} />
        </button>
      </div>

      <div className="spacer" />

      <div className="players">
        {players.map((p) => (
          <div
            key={p.id}
            className={`avatar ${p.id === self.id ? 'self' : ''}`}
            style={{ background: p.color }}
            title={`${p.name} (${p.role})`}
          >
            {p.name.slice(0, 1).toUpperCase()}
            {p.role === 'gm' && (
              <span className="gm-badge" title="Game Master">
                <Icon name="crown" size={12} />
              </span>
            )}
          </div>
        ))}
      </div>

      <button
        className="topbtn"
        onClick={() => {
          const name = prompt('Your name', self.name);
          if (name) setSelf({ name });
        }}
        title="Change name"
      >
        <Icon name="edit" size={14} /> {self.name}
      </button>

      <button
        className={`topbtn ${self.role === 'gm' ? 'active' : ''}`}
        onClick={() => setSelf({ role: self.role === 'gm' ? 'player' : 'gm' })}
        title="Toggle GM role (affects fog visibility)"
      >
        <Icon name="crown" size={14} /> {self.role === 'gm' ? 'GM' : 'Player'}
      </button>
    </header>
  );
}
