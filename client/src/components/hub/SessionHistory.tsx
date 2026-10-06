import { useEffect, useState } from 'react';
import { api, type GameSession } from '../../api';

export default function SessionHistory({ campaignId }: { campaignId: string }) {
  const [sessions, setSessions] = useState<GameSession[]>([]);
  const [name, setName] = useState('');
  const [notes, setNotes] = useState('');
  const [selected, setSelected] = useState<GameSession | null>(null);
  const [record, setRecord] = useState<{ chat?: unknown[]; scenes?: unknown[] }>({});

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campaignId]);

  async function load() {
    const d = await api.get<{ sessions: GameSession[] }>(`/campaigns/${campaignId}/sessions`);
    setSessions(d.sessions);
  }

  async function create() {
    await api.post(`/campaigns/${campaignId}/sessions`, { name: name || undefined, notes });
    setName('');
    setNotes('');
    load();
  }

  async function open(s: GameSession) {
    const d = await api.get<{ session: GameSession & { record: typeof record } }>(`/sessions/${s.id}`);
    setSelected(d.session);
    setRecord(d.session.record || {});
  }

  async function endSession() {
    if (!selected) return;
    await api.patch(`/sessions/${selected.id}`, { endedAt: Date.now() });
    setSelected(null);
    load();
  }

  return (
    <div className="hub-grid">
      <div className="hub-card">
        <h3>Session history</h3>
        <div className="create-row">
          <input placeholder="Session name (optional)" value={name} onChange={(e) => setName(e.target.value)} />
          <button className="btn primary" onClick={create}>
            ➕ Log session
          </button>
        </div>
        <div className="field">
          <label>Notes</label>
          <textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>

        <ul className="list">
          {sessions.map((s) => (
            <li key={s.id} onClick={() => open(s)}>
              <b>{s.name}</b>
              <span className="muted">{new Date(s.startedAt).toLocaleString()}</span>
              {s.endedAt ? <span className="chip ok">ended</span> : <span className="chip warn">open</span>}
            </li>
          ))}
          {sessions.length === 0 && <li className="muted">No sessions logged yet.</li>}
        </ul>
      </div>

      {selected && (
        <div className="hub-card">
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <h3>{selected.name}</h3>
            {!selected.endedAt && (
              <button className="btn sm" onClick={endSession}>
                ⏹ End session
              </button>
            )}
          </div>
          <p className="muted">{selected.notes || 'No notes.'}</p>
          <div className="field">
            <label>Chat log ({Array.isArray(record.chat) ? record.chat.length : 0} messages)</label>
            <div className="record-box">
              {(Array.isArray(record.chat) ? (record.chat as any[]) : []).slice(-50).map((m, i) => (
                <div key={i} className="record-line">
                  <b style={{ color: m.color }}>{m.author}:</b> {m.text}
                </div>
              ))}
              {(!Array.isArray(record.chat) || record.chat.length === 0) && (
                <span className="muted">No recorded chat for this session.</span>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
