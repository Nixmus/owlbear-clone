import { useEffect, useState } from 'react';
import { api } from '../../api';

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
        <h3>Members</h3>
        <ul className="list">
          {owner && (
            <li>
              <span className="dot" style={{ background: '#fbbf24' }} />
              <b>{owner.displayName}</b> <span className="chip">owner</span>
            </li>
          )}
          {members.map((m) => (
            <li key={m.id}>
              <span className="dot" style={{ background: m.avatarUrl || '#7dd3fc' }} />
              <b>{m.displayName}</b>{' '}
              <span className="muted">@{m.username}</span>{' '}
              <span className="chip">{m.role}</span>
              {canEdit && (
                <button className="btn sm danger" onClick={() => remove(m.id)}>
                  ✕
                </button>
              )}
            </li>
          ))}
          {members.length === 0 && !owner && <li className="muted">No members yet.</li>}
        </ul>
      </div>

      {canEdit && (
        <div className="hub-card">
          <h3>Invite by username</h3>
          <div className="field">
            <label>Username</label>
            <input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="e.g. aragorn" />
          </div>
          <div className="field">
            <label>Campaign role</label>
            <select value={memberRole} onChange={(e) => setMemberRole(e.target.value)}>
              <option value="gm">Game Master</option>
              <option value="player">Player</option>
              <option value="observer">Observer</option>
            </select>
          </div>
          {error && <p className="error">{error}</p>}
          <button className="btn primary" onClick={add} disabled={!username}>
            ➕ Add member
          </button>
        </div>
      )}
    </div>
  );
}
