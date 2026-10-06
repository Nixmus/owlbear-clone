import { useEffect, useState } from 'react';
import { useAuth } from '../auth';
import { api } from '../api';
import CharacterManager from './hub/CharacterManager';
import AssetManager from './hub/AssetManager';
import SessionHistory from './hub/SessionHistory';
import MemberManager from './hub/MemberManager';

type Tab = 'overview' | 'members' | 'characters' | 'assets' | 'sessions';

export default function CampaignView({ campaignId, onBack }: { campaignId: string; onBack: () => void }) {
  const user = useAuth((s) => s.user);
  const [tab, setTab] = useState<Tab>('overview');

  const tabs: { id: Tab; label: string }[] = [
    { id: 'overview', label: '📋 Overview' },
    { id: 'members', label: '👥 Members' },
    { id: 'characters', label: '🎭 Characters' },
    { id: 'assets', label: '🖼️ Assets' },
    { id: 'sessions', label: '📜 History' },
  ];

  return (
    <div className="hub">
      <header className="hub-top">
        <button className="btn sm" onClick={onBack}>
          ← Campaigns
        </button>
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
            {t.label}
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

function CampaignOverview({ campaignId }: { campaignId: string }) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [detail, setDetail] = useState<any>(null);
  const [error, setError] = useState('');
  const [form, setForm] = useState({ name: '', description: '', system: '', coverUrl: '' });
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campaignId]);

  async function load() {
    try {
      const d = await api.get<{ campaign: any; role: string; members: any[] }>(`/campaigns/${campaignId}`);
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
    if (!confirm('Delete this campaign permanently?')) return;
    await api.del(`/campaigns/${campaignId}`);
    location.reload();
  }

  if (!detail) return <div className="hub-empty">Loading… {error}</div>;

  const canEdit = detail.role === 'owner' || detail.role === 'gm';

  return (
    <div className="hub-grid">
      <div className="hub-card">
        {detail.campaign.coverUrl && (
          <img className="campaign-cover" src={detail.campaign.coverUrl} alt="" />
        )}
        <h2>{detail.campaign.name}</h2>
        <p className="muted">{detail.campaign.description || 'No description yet.'}</p>
        <p className="muted">
          System: <b>{detail.campaign.system}</b> · Members: <b>{detail.members.length + 1}</b> · Your role:{' '}
          <b>{detail.role}</b>
        </p>
        <div className="row">
          <a className="btn primary" href={`/?room=${campaignId}`}>
            🎲 Enter table
          </a>
          {detail.role === 'owner' && (
            <button className="btn danger" onClick={remove}>
              🗑️ Delete
            </button>
          )}
        </div>
      </div>

      {canEdit && (
        <div className="hub-card">
          <h3>Edit campaign</h3>
          <div className="field">
            <label>Name</label>
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div className="field">
            <label>Description</label>
            <textarea
              rows={3}
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
          </div>
          <div className="field">
            <label>System</label>
            <input value={form.system} onChange={(e) => setForm({ ...form, system: e.target.value })} />
          </div>
          <div className="field">
            <label>Cover image URL</label>
            <input value={form.coverUrl} onChange={(e) => setForm({ ...form, coverUrl: e.target.value })} />
          </div>
          <button className="btn primary" onClick={save}>
            {saved ? '✓ Saved' : 'Save changes'}
          </button>
        </div>
      )}
    </div>
  );
}
