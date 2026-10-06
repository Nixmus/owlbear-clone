import { useEffect, useState } from 'react';
import { useAuth } from '../auth';
import { api, assetUrl, type Campaign } from '../api';
import CampaignView from './CampaignView';

export default function Hub() {
  const user = useAuth((s) => s.user);
  const [activeCampaign, setActiveCampaign] = useState<string | null>(null);

  if (!user) return <AuthScreen />;
  if (activeCampaign) {
    return <CampaignView campaignId={activeCampaign} onBack={() => setActiveCampaign(null)} />;
  }
  return <CampaignList onOpen={setActiveCampaign} />;
}

/* ------------------------------------------------------------------ */

function AuthScreen() {
  const login = useAuth((s) => s.login);
  const register = useAuth((s) => s.register);
  const loading = useAuth((s) => s.loading);
  const error = useAuth((s) => s.error);
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [form, setForm] = useState({ username: '', email: '', password: '', displayName: '' });

  const submit = async () => {
    try {
      if (mode === 'login') await login(form.username, form.password);
      else await register(form.username, form.email, form.password, form.displayName);
    } catch {
      /* error shown from store */
    }
  };

  return (
    <div className="overlay">
      <div className="card">
        <h1>
          <span>🦉</span> Owlbear Clone
        </h1>
        <p>Manage campaigns, characters and play sessions in one place.</p>

        <div className="role-toggle">
          <button className={mode === 'login' ? 'active' : ''} onClick={() => setMode('login')}>
            Log in
          </button>
          <button className={mode === 'register' ? 'active' : ''} onClick={() => setMode('register')}>
            Sign up
          </button>
        </div>

        <div className="field">
          <label>Username</label>
          <input
            value={form.username}
            onChange={(e) => setForm({ ...form, username: e.target.value })}
            onKeyDown={(e) => e.key === 'Enter' && submit()}
          />
        </div>

        {mode === 'register' && (
          <>
            <div className="field">
              <label>Email</label>
              <input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </div>
            <div className="field">
              <label>Display name</label>
              <input
                value={form.displayName}
                onChange={(e) => setForm({ ...form, displayName: e.target.value })}
              />
            </div>
          </>
        )}

        <div className="field">
          <label>Password</label>
          <input
            type="password"
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
            onKeyDown={(e) => e.key === 'Enter' && submit()}
          />
        </div>

        {error && <p className="error">{error}</p>}

        <button className="btn primary" style={{ padding: 10 }} onClick={submit} disabled={loading}>
          {loading ? '…' : mode === 'login' ? 'Log in →' : 'Create account →'}
        </button>

        <button className="btn" onClick={() => (location.href = '/?room=pickup')} style={{ fontSize: 12 }}>
          🎲 Skip login — quick play
        </button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function CampaignList({ onOpen }: { onOpen: (id: string) => void }) {
  const user = useAuth((s) => s.user)!;
  const logout = useAuth((s) => s.logout);
  const updateProfile = useAuth((s) => s.updateProfile);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [showNew, setShowNew] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [form, setForm] = useState({ name: '', description: '', system: 'Generic' });
  const [profile, setProfile] = useState({ displayName: user.displayName, bio: user.bio || '' });

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function load() {
    const d = await api.get<{ campaigns: Campaign[] }>('/campaigns');
    setCampaigns(d.campaigns);
  }

  async function create() {
    if (!form.name.trim()) return;
    const { id } = await api.post<{ id: string }>('/campaigns', form);
    setForm({ name: '', description: '', system: 'Generic' });
    setShowNew(false);
    await load();
    onOpen(id);
  }

  return (
    <div className="hub">
      <header className="hub-top">
        <div className="brand">
          <span className="owl">🦉</span> Owlbear Clone
        </div>
        <div className="spacer" />
        <button className="btn sm" onClick={() => setShowProfile((v) => !v)}>
          👤 {user.displayName}
        </button>
        <button className="btn sm" onClick={logout}>
          Log out
        </button>
      </header>

      {showProfile && (
        <div className="hub-card profile-card">
          <div className="field">
            <label>Display name</label>
            <input
              value={profile.displayName}
              onChange={(e) => setProfile({ ...profile, displayName: e.target.value })}
            />
          </div>
          <div className="field">
            <label>Bio</label>
            <textarea
              rows={2}
              value={profile.bio}
              onChange={(e) => setProfile({ ...profile, bio: e.target.value })}
            />
          </div>
          <button
            className="btn primary"
            onClick={async () => {
              await updateProfile(profile);
              setShowProfile(false);
            }}
          >
            Save profile
          </button>
        </div>
      )}

      <div className="hub-body">
        <div className="row" style={{ justifyContent: 'space-between', marginBottom: 12 }}>
          <h2 style={{ margin: 0 }}>Your campaigns</h2>
          <button className="btn primary" onClick={() => setShowNew((v) => !v)}>
            ➕ New campaign
          </button>
        </div>

        {showNew && (
          <div className="hub-card">
            <div className="row">
              <div className="field">
                <label>Name</label>
                <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </div>
              <div className="field">
                <label>System</label>
                <input value={form.system} onChange={(e) => setForm({ ...form, system: e.target.value })} />
              </div>
            </div>
            <div className="field">
              <label>Description</label>
              <textarea
                rows={2}
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
              />
            </div>
            <button className="btn primary" onClick={create}>
              Create campaign
            </button>
          </div>
        )}

        <div className="campaign-grid">
          {campaigns.map((c) => (
            <div key={c.id} className="campaign-card" onClick={() => onOpen(c.id)}>
              {c.coverUrl ? (
                <img src={assetUrl(c.coverUrl) || c.coverUrl} alt="" />
              ) : (
                <div className="campaign-cover placeholder">🎲</div>
              )}
              <div className="campaign-body">
                <h3>{c.name}</h3>
                <p className="muted">{c.description || 'No description.'}</p>
                <div className="row" style={{ gap: 6 }}>
                  <span className="chip">{c.system}</span>
                  <span className="chip">{c.role}</span>
                  <span className="chip">👥 {c.memberCount + 1}</span>
                </div>
              </div>
            </div>
          ))}
          {campaigns.length === 0 && (
            <p className="muted">No campaigns yet. Create your first one to get started.</p>
          )}
        </div>
      </div>
    </div>
  );
}
