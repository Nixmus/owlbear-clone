import { useEffect, useState } from 'react';
import { api } from '../../api';
import Icon from '../Icon';
import { roleLabel } from '../Hub';

interface Member {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  role: string;
  joinedAt: number;
}

export default function MemberManager({ campaignId }: { campaignId: string }) {
  const [members, setMembers] = useState<Member[]>([]);
  const [owner, setOwner] = useState<{ displayName: string } | null>(null);
  const [role, setRole] = useState<string>('player');
  const [username, setUsername] = useState('');
  const [memberRole, setMemberRole] = useState('player');
  const [error, setError] = useState('');

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campaignId]);

  async function load() {
    const d = await api.get<{ members: Member[]; role: string; owner: any }>(`/campaigns/${campaignId}`);
    setMembers(d.members);
    setRole(d.role);
    setOwner(d.owner);
  }

  async function add() {
    setError('');
    try {
      await api.post(`/campaigns/${campaignId}/members`, { username, role: memberRole });
      setUsername('');
      load();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function remove(userId: string) {
    await api.del(`/campaigns/${campaignId}/members/${userId}`);
    load();
  }

  const canEdit = role === 'owner' || role === 'gm';

  return (
    <div className="hub-grid">
      <div className="hub-card">
        <h3>Miembros de la campaña</h3>
        <ul className="list">
          {owner && (
            <li>
              <span className="dot" style={{ background: '#fbbf24' }} />
              <b>{owner.displayName}</b> <span className="chip">{roleLabel('owner')}</span>
            </li>
          )}
          {members.map((m) => (
            <li key={m.id}>
              <span className="dot" style={{ background: m.avatarUrl || '#7dd3fc' }} />
              <b>{m.displayName}</b> <span className="muted">@{m.username}</span>{' '}
              <span className="chip">{roleLabel(m.role)}</span>
              {canEdit && (
                <button
                  className="icon-btn danger"
                  title="Quitar de la campaña"
                  onClick={() => remove(m.id)}
                >
                  <Icon name="close" size={14} />
                </button>
              )}
            </li>
          ))}
          {members.length === 0 && !owner && <li className="muted">Aún no hay miembros.</li>}
        </ul>
      </div>

      {canEdit && (
        <div className="hub-card">
          <h3>Invitar a un usuario</h3>
          <p className="muted">
            La persona debe tener cuenta. Escribe su nombre de usuario para añadirla.
          </p>
          <div className="field">
            <label>Usuario</label>
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="p. ej. aragorn"
            />
          </div>
          <div className="field">
            <label>Rol en la campaña</label>
            <select value={memberRole} onChange={(e) => setMemberRole(e.target.value)}>
              <option value="gm">Director de juego</option>
              <option value="player">Jugador</option>
              <option value="observer">Observador</option>
            </select>
          </div>
          {error && <p className="error">{error}</p>}
          <button className="btn primary" onClick={add} disabled={!username}>
            <Icon name="plus" size={14} /> Añadir miembro
          </button>
        </div>
      )}
    </div>
  );
}
