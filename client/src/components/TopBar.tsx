import { useStore } from '../store';
import Icon from './Icon';
import Brand from './Brand';

/** `panelOpen` only matters on phones, where the side panels cover the map. */
export default function TopBar({ panelOpen, onTogglePanels }: {
  panelOpen?: boolean;
  onTogglePanels?: () => void;
}) {
  const status = useStore((s) => s.status);
  const roomId = useStore((s) => s.roomId);
  const players = useStore((s) => s.players);
  const self = useStore((s) => s.self);

  const copyLink = () => {
    const url = `${location.origin}${location.pathname}?room=${roomId}`;
    navigator.clipboard?.writeText(url);
  };

  const goHome = () => {
    const url = new URL(location.href);
    url.searchParams.delete('room');
    location.href = url.toString();
  };

  const roleLabel = self.role === 'gm' ? 'Director' : 'Jugador';

  return (
    <header className="topbar">
      <button className="icon-btn" onClick={goHome} title="Ir al panel principal">
        <Icon name="home" size={16} />
      </button>

      <Brand />

      <div className="roomchip" title="Código de sala">
        <span className={`status-dot ${status}`} />
        <span>Sala</span>
        <code>{roomId}</code>
        <button className="btn sm" onClick={copyLink} title="Copiar enlace de invitación" aria-label="Copiar enlace">
          <Icon name="link" size={14} />
        </button>
      </div>

      <div className="spacer" />

      {onTogglePanels && (
        <button
          className={`icon-btn panels-toggle ${panelOpen ? 'on' : ''}`}
          onClick={onTogglePanels}
          title={panelOpen ? 'Cerrar paneles' : 'Abrir paneles'}
          aria-label={panelOpen ? 'Cerrar paneles' : 'Abrir paneles'}
          aria-expanded={!!panelOpen}
        >
          <Icon name="overview" size={16} />
        </button>
      )}

      <div className="players" title="Jugadores conectados">
        {players.map((p) => (
          <div
            key={p.id}
            className={`avatar ${p.id === self.id ? 'self' : ''}`}
            style={{ background: p.color }}
            title={`${p.name} (${p.role === 'gm' ? 'Director' : 'Jugador'})`}
          >
            {p.name.slice(0, 1).toUpperCase()}
            {p.role === 'gm' && (
              <span className="gm-badge" title="Director de juego">
                <Icon name="crown" size={12} />
              </span>
            )}
          </div>
        ))}
      </div>

      <div className="role-pill" title="Tu rol en esta mesa">
        <Icon name={self.role === 'gm' ? 'crown' : 'user'} size={13} />
        {roleLabel}
      </div>
    </header>
  );
}
