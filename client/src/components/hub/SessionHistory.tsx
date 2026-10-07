import { useEffect, useState } from 'react';
import { api, type GameSession } from '../../api';
import Icon from '../Icon';

interface ChatLine {
  author: string;
  color?: string;
  text: string;
}

export default function SessionHistory({ campaignId }: { campaignId: string }) {
  const [sessions, setSessions] = useState<GameSession[]>([]);
  const [name, setName] = useState('');
  const [notes, setNotes] = useState('');
  const [selected, setSelected] = useState<GameSession | null>(null);
  const [record, setRecord] = useState<{ chat?: ChatLine[] }>({});

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

  const chat = Array.isArray(record.chat) ? record.chat : [];

  return (
    <div className="hub-grid">
      <div className="hub-card">
        <h3>Historial de partidas</h3>
        <p className="muted">
          Registra cada sesión para llevar la crónica. El chat de la mesa se guarda automáticamente
          mientras la sesión esté abierta.
        </p>
        <div className="create-row">
          <input
            placeholder="Nombre de la sesión (opcional)"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <button className="btn primary" onClick={create}>
            <Icon name="plus" size={14} /> Registrar sesión
          </button>
        </div>
        <div className="field">
          <label>Notas de la sesión</label>
          <textarea
            rows={2}
            placeholder="Qué pasó, decisiones, pendientes…"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </div>

        <ul className="list">
          {sessions.map((s) => (
            <li key={s.id} className={selected?.id === s.id ? 'active' : ''} onClick={() => open(s)}>
              <b>{s.name}</b>
              <span className="muted">{new Date(s.startedAt).toLocaleString()}</span>
              {s.endedAt ? <span className="chip ok">cerrada</span> : <span className="chip warn">abierta</span>}
            </li>
          ))}
          {sessions.length === 0 && <li className="muted">Todavía no hay sesiones registradas.</li>}
        </ul>
      </div>

      {selected && (
        <div className="hub-card">
          <div className="row spread">
            <h3>{selected.name}</h3>
            {!selected.endedAt && (
              <button className="btn sm" onClick={endSession}>
                Cerrar sesión
              </button>
            )}
          </div>
          <p className="muted">{selected.notes || 'Sin notas.'}</p>
          <div className="field">
            <label>Registro de chat ({chat.length} mensajes)</label>
            <div className="record-box">
              {chat.slice(-50).map((m, i) => (
                <div key={i} className="record-line">
                  <b style={{ color: m.color }}>{m.author}:</b> {m.text}
                </div>
              ))}
              {chat.length === 0 && <span className="muted">Sin chat registrado en esta sesión.</span>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
