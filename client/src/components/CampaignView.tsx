import { useEffect, useState } from 'react';
import { useAuth } from '../auth';
import { api, assetUrl } from '../api';
import CharacterManager from './hub/CharacterManager';
import AssetManager from './hub/AssetManager';
import SessionHistory from './hub/SessionHistory';
import MemberManager from './hub/MemberManager';
import Icon, { type IconName } from './Icon';
import { roleLabel } from './Hub';

type Tab = 'overview' | 'members' | 'characters' | 'assets' | 'sessions';

export default function CampaignView({ campaignId, onBack }: { campaignId: string; onBack: () => void }) {
  const user = useAuth((s) => s.user);
  const [tab, setTab] = useState<Tab>('overview');

  const tabs: { id: Tab; label: string; icon: IconName }[] = [
    { id: 'overview', label: 'Resumen', icon: 'overview' },
    { id: 'members', label: 'Miembros', icon: 'members' },
    { id: 'characters', label: 'Personajes', icon: 'user' },
    { id: 'assets', label: 'Recursos', icon: 'image' },
    { id: 'sessions', label: 'Historial', icon: 'history' },
  ];

  return (
    <div className="hub">
      <header className="hub-toolbar">
        <button className="icon-btn" onClick={onBack} title="Volver">
          <Icon name="back" size={16} />
        </button>
        <span style={{ fontWeight: 600 }}>Campaña</span>
        <div className="spacer" />
        <span className="hub-user">{user?.displayName}</span>
      </header>

      <div className="hub-tabs">
        {tabs.map((t) => (
          <button
            key={t.id}
            className={`hub-tab ${tab === t.id ? 'active' : ''}`}
            onClick={() => setTab(t.id)}
          >
            <Icon name={t.icon} size={14} /> {t.label}
          </button>
        ))}
      </div>

      <div className="hub-body">
        {tab === 'overview' && <CampaignOverview campaignId={campaignId} />}
        {tab === 'members' && <MemberManager campaignId={campaignId} />}
        {tab === 'characters' && <CharacterManager campaignId={campaignId} />}
        {tab === 'assets' && <AssetManager campaignId={campaignId} />}
        {tab === 'sessions' && <SessionHistory campaignId={campaignId} />}
      </div>
    </div>
  );
}

interface Detail {
  campaign: {
    id: string;
    name: string;
    description: string | null;
    system: string | null;
    coverUrl: string | null;
  };
  role: string;
  members: unknown[];
}

function CampaignOverview({ campaignId }: { campaignId: string }) {
  const [detail, setDetail] = useState<Detail | null>(null);
  const [error, setError] = useState('');
  const [form, setForm] = useState({ name: '', description: '', system: '', coverUrl: '' });
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campaignId]);

  async function load() {
    try {
      const d = await api.get<Detail>(`/campaigns/${campaignId}`);
      setDetail(d);
      setForm({
        name: d.campaign.name,
        description: d.campaign.description || '',
        system: d.campaign.system || '',
        coverUrl: d.campaign.coverUrl || '',
      });
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function save() {
    await api.patch(`/campaigns/${campaignId}`, form);
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
    load();
  }

  async function remove() {
    if (!confirm('¿Eliminar esta campaña de forma permanente? Esta acción no se puede deshacer.')) return;
    await api.del(`/campaigns/${campaignId}`);
    location.reload();
  }

  if (!detail) return <div className="hub-empty">Cargando… {error}</div>;

  const canEdit = detail.role === 'owner' || detail.role === 'gm';

  return (
    <div className="hub-grid">
      <div className="hub-card">
        {detail.campaign.coverUrl && (
          <img
            className="campaign-cover"
            src={assetUrl(detail.campaign.coverUrl) || detail.campaign.coverUrl}
            alt=""
          />
        )}
        <h2>{detail.campaign.name}</h2>
        <p className="muted">{detail.campaign.description || 'Todavía sin descripción.'}</p>
        <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
          <span className="chip">{detail.campaign.system || 'Genérico'}</span>
          <span className="chip">Tu rol: {roleLabel(detail.role)}</span>
          <span className="chip">
            <Icon name="members" size={12} /> {detail.members.length + 1} miembros
          </span>
        </div>
        <div className="row" style={{ marginTop: 6 }}>
          <a className="btn primary big" href={`/?room=${campaignId}`}>
            <Icon name="dice" size={15} /> Entrar a la mesa
          </a>
          {detail.role === 'owner' && (
            <button className="btn danger" onClick={remove}>
              <Icon name="trash" size={14} /> Eliminar
            </button>
          )}
        </div>
      </div>

      {canEdit && (
        <div className="hub-card">
          <h3>Editar campaña</h3>
          <div className="field">
            <label>Nombre</label>
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div className="field">
            <label>Descripción</label>
            <textarea
              rows={3}
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
          </div>
          <div className="field">
            <label>Sistema de juego</label>
            <input value={form.system} onChange={(e) => setForm({ ...form, system: e.target.value })} />
          </div>
          <div className="field">
            <label>URL de imagen de portada</label>
            <input
              placeholder="https://…"
              value={form.coverUrl}
              onChange={(e) => setForm({ ...form, coverUrl: e.target.value })}
            />
          </div>
          <button className="btn primary" onClick={save}>
            {saved ? (
              <>
                <Icon name="check" size={14} /> Guardado
              </>
            ) : (
              'Guardar cambios'
            )}
          </button>
        </div>
      )}
    </div>
  );
}
