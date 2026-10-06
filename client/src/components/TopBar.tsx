import { useStore } from '../store';

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
      <div className="brand">
        <span className="owl">🦉</span> Owlbear Clone
      </div>

      <div className="roomchip" title="Room id">
        <span className={`status-dot ${status}`} />
        <span>Sala</span>
        <code>{roomId}</code>
        <button className="btn sm" onClick={copyLink} title="Copy invite link">
          🔗
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
            {p.role === 'gm' && <span className="gm-badge">👑</span>}
          </div>
        ))}
      </div>

      <button
        className="topbtn"
        onClick={() => {
          const name = prompt('Your name', self.name);
          if (name) setSelf({ name });
        }}
      >
        ✏️ {self.name}
      </button>

      <button
        className={`topbtn ${self.role === 'gm' ? 'active' : ''}`}
        onClick={() => setSelf({ role: self.role === 'gm' ? 'player' : 'gm' })}
        title="Toggle GM role (affects fog visibility)"
      >
        👑 {self.role === 'gm' ? 'GM' : 'Player'}
      </button>
    </header>
  );
}
