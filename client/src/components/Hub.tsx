import { useEffect, useState } from 'react';
import { useAuth } from '../auth';
import { api, assetUrl, type Campaign, type Overview } from '../api';
import CampaignView from './CampaignView';
import Icon, { type IconName } from './Icon';
import Brand from './Brand';

export default function Hub() {
  const user = useAuth((s) => s.user);
  const [activeCampaign, setActiveCampaign] = useState<string | null>(null);

  if (!user) return <AuthScreen />;
  if (activeCampaign) {
    return <CampaignView campaignId={activeCampaign} onBack={() => setActiveCampaign(null)} />;
  }
  return <HubShell onOpen={setActiveCampaign} />;
}

/* ------------------------------------------------------------------ */

function AuthScreen() {
  const login = useAuth((s) => s.login);
  const register = useAuth((s) => s.register);
  const loading = useAuth((s) => s.loading);
  const error = useAuth((s) => s.error);
  const forgotPassword = useAuth((s) => s.forgotPassword);
  const resetPassword = useAuth((s) => s.resetPassword);

  const [mode, setMode] = useState<'login' | 'register' | 'forgot' | 'reset'>('login');
  const [form, setForm] = useState({ username: '', email: '', password: '', displayName: '' });
  const [resetToken, setResetToken] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [info, setInfo] = useState('');

  const submit = async () => {
    try {
      if (mode === 'login') await login(form.username, form.password);
      else if (mode === 'register')
        await register(form.username, form.email, form.password, form.displayName);
    } catch {
      /* shown via store */
    }
  };

  const requestReset = async () => {
    setInfo('');
    const token = await forgotPassword(form.username);
    if (token) {
      setResetToken(token);
      setMode('reset');
      setInfo('Se generó un código de recuperación (válido 30 min).');
    } else {
      setInfo('Si la cuenta existe, recibirás instrucciones para restablecer la contraseña.');
    }
  };

  const doReset = async () => {
    try {
      await resetPassword(resetToken, newPassword);
      setMode('login');
      setInfo('Contraseña actualizada. Ya puedes iniciar sesión.');
      setNewPassword('');
    } catch (e) {
      setInfo((e as Error).message);
    }
  };

  return (
    <div className="overlay">
      <div className="card">
        <h1>
          <Brand withName={false} /> Owlbear Clone
        </h1>
        <p>Crea campañas, gestiona personajes y juega tus partidas en un solo lugar.</p>

        {(mode === 'login' || mode === 'register') && (
          <div className="role-toggle">
            <button className={mode === 'login' ? 'active' : ''} onClick={() => setMode('login')}>
              Iniciar sesión
            </button>
            <button className={mode === 'register' ? 'active' : ''} onClick={() => setMode('register')}>
              Crear cuenta
            </button>
          </div>
        )}

        {(mode === 'login' || mode === 'register' || mode === 'forgot') && (
          <div className="field">
            <label>{mode === 'forgot' ? 'Usuario o email' : 'Usuario o email'}</label>
            <input
              value={form.username}
              placeholder="tu_usuario"
              onChange={(e) => setForm({ ...form, username: e.target.value })}
              onKeyDown={(e) => e.key === 'Enter' && (mode === 'forgot' ? requestReset() : submit())}
            />
          </div>
        )}

        {mode === 'register' && (
          <>
            <div className="field">
              <label>Email</label>
              <input
                type="email"
                placeholder="tu@email.com"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
            </div>
            <div className="field">
              <label>Nombre para mostrar</label>
              <input
                placeholder="Cómo te verán los demás"
                value={form.displayName}
                onChange={(e) => setForm({ ...form, displayName: e.target.value })}
              />
            </div>
          </>
        )}

        {(mode === 'login' || mode === 'register') && (
          <div className="field">
            <label>Contraseña</label>
            <input
              type="password"
              placeholder="Mínimo 6 caracteres"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              onKeyDown={(e) => e.key === 'Enter' && submit()}
            />
          </div>
        )}

        {mode === 'login' && (
          <button className="link-btn" onClick={() => { setInfo(''); setMode('forgot'); }}>
            ¿Olvidaste tu contraseña?
          </button>
        )}

        {mode === 'forgot' && info && <p className="muted">{info}</p>}

        {mode === 'reset' && (
          <>
            <p className="muted">{info}</p>
            <div className="field">
              <label>Código de recuperación</label>
              <input value={resetToken} onChange={(e) => setResetToken(e.target.value)} />
            </div>
            <div className="field">
              <label>Nueva contraseña</label>
              <input
                type="password"
                placeholder="Mínimo 6 caracteres"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && doReset()}
              />
            </div>
          </>
        )}

        {error && <p className="error">{error}</p>}

        {(mode === 'login' || mode === 'register') && (
          <button className="btn primary big" onClick={submit} disabled={loading}>
            {loading ? 'Un momento…' : mode === 'login' ? 'Entrar' : 'Crear cuenta'}
          </button>
        )}
        {mode === 'forgot' && (
          <button className="btn primary big" onClick={requestReset}>
            Recuperar contraseña
          </button>
        )}
        {mode === 'reset' && (
          <button className="btn primary big" onClick={doReset}>
            Guardar nueva contraseña
          </button>
        )}

        {mode !== 'login' && (
          <button className="link-btn" onClick={() => { setInfo(''); setMode('login'); }}>
            Volver a iniciar sesión
          </button>
        )}

        {(mode === 'login' || mode === 'register') && (
          <>
            <div className="divider-or">
              <span>o</span>
            </div>
            <button className="btn" onClick={() => (location.href = '/?room=pickup')}>
              <Icon name="dice" size={14} /> Jugar sin cuenta
            </button>
          </>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */

type View = 'overview' | 'campaigns' | 'profile';

function HubShell({ onOpen }: { onOpen: (id: string) => void }) {
  // Simple in-app history so back/forward/home work between views.
  const [history, setHistory] = useState<View[]>(['overview']);
  const [index, setIndex] = useState(0);
  const view = history[index];

  const go = (v: View) => {
    if (v === view) return;
    const next = history.slice(0, index + 1);
    next.push(v);
    setHistory(next);
    setIndex(next.length - 1);
  };
  const back = () => setIndex((i) => Math.max(0, i - 1));
  const forward = () => setIndex((i) => Math.min(history.length - 1, i + 1));
  const home = () => go('overview');

  const nav: { id: View; label: string; icon: IconName }[] = [
    { id: 'overview', label: 'Resumen', icon: 'overview' },
    { id: 'campaigns', label: 'Campañas', icon: 'map' },
    { id: 'profile', label: 'Mi perfil', icon: 'user' },
  ];

  return (
    <div className="hub-layout">
      <aside className="hub-sidebar">
        <div className="hub-sidebar-brand">
          <Brand />
        </div>
        <nav className="hub-nav">
          {nav.map((n) => (
            <button
              key={n.id}
              className={`hub-nav-item ${view === n.id ? 'active' : ''}`}
              onClick={() => go(n.id)}
            >
              <Icon name={n.icon} size={16} /> {n.label}
            </button>
          ))}
        </nav>
        <div className="hub-sidebar-foot">
          <a className="btn primary" href={`/?room=pickup`}>
            <Icon name="dice" size={14} /> Partida rápida
          </a>
        </div>
      </aside>

      <main className="hub-main">
        <div className="hub-toolbar">
          <button className="icon-btn" onClick={home} title="Inicio">
            <Icon name="home" size={16} />
          </button>
          <button className="icon-btn" onClick={back} disabled={index === 0} title="Atrás">
            <Icon name="back" size={16} />
          </button>
          <button
            className="icon-btn"
            onClick={forward}
            disabled={index >= history.length - 1}
            title="Adelante"
          >
            <Icon name="forward" size={16} />
          </button>
          <div className="spacer" />
          <HubTopBar />
        </div>

        {view === 'overview' && <Overview onOpen={onOpen} onSeeCampaigns={() => go('campaigns')} />}
        {view === 'campaigns' && <CampaignList onOpen={onOpen} />}
        {view === 'profile' && <ProfilePanel />}
      </main>
    </div>
  );
}

function HubTopBar() {
  const user = useAuth((s) => s.user)!;
  const logout = useAuth((s) => s.logout);
  return (
    <>
      <span className="hub-user">{user.displayName}</span>
      <button className="btn sm" onClick={logout}>
        Cerrar sesión
      </button>
    </>
  );
}

/* ------------------------------------------------------------------ */

function Overview({ onOpen, onSeeCampaigns }: { onOpen: (id: string) => void; onSeeCampaigns: () => void }) {
  const user = useAuth((s) => s.user)!;
  const [data, setData] = useState<Overview | null>(null);

  useEffect(() => {
    api
      .get<Overview>('/overview')
      .then(setData)
      .catch(() => {});
  }, []);

  if (!data) return <div className="hub-empty">Cargando…</div>;

  const stats: { label: string; value: number; icon: IconName }[] = [
    { label: 'Campañas', value: data.counts.campaigns, icon: 'map' },
    { label: 'Personajes', value: data.counts.characters, icon: 'user' },
    { label: 'Recursos', value: data.counts.assets, icon: 'image' },
    { label: 'Sesiones', value: data.counts.sessions, icon: 'history' },
  ];

  return (
    <div className="hub-view">
      <h1 className="hub-greeting">Hola, {user.displayName}</h1>
      <p className="muted">Este es el resumen de tu cuenta.</p>

      <div className="stat-grid">
        {stats.map((s) => (
          <div key={s.label} className="stat-card">
            <div className="stat-icon">
              <Icon name={s.icon} size={18} />
            </div>
            <div>
              <div className="stat-value">{s.value}</div>
              <div className="stat-label">{s.label}</div>
            </div>
          </div>
        ))}
      </div>

      <div className="hub-columns">
        <section className="hub-card">
          <div className="row spread">
            <h3>Campañas recientes</h3>
            <button className="btn sm" onClick={onSeeCampaigns}>
              Ver todas
            </button>
          </div>
          <div className="mini-list">
            {data.campaigns.slice(0, 5).map((c) => (
              <div key={c.id} className="mini-row" onClick={() => onOpen(c.id)}>
                {c.coverUrl ? (
                  <img className="mini-thumb" src={assetUrl(c.coverUrl) || c.coverUrl} alt="" />
                ) : (
                  <div className="mini-thumb placeholder">
                    <Icon name="map" size={16} />
                  </div>
                )}
                <div className="mini-body">
                  <b>{c.name}</b>
                  <span className="muted">{c.system || 'Genérico'}</span>
                </div>
                <span className="chip">{roleLabel(c.role)}</span>
              </div>
            ))}
            {data.campaigns.length === 0 && (
              <p className="muted">Todavía no tienes campañas.</p>
            )}
          </div>
        </section>

        <section className="hub-card">
          <h3>Sesiones recientes</h3>
          <div className="mini-list">
            {data.recentSessions.map((s) => (
              <div key={s.id} className="mini-row static">
                <div className="mini-body">
                  <b>{s.name}</b>
                  <span className="muted">{s.campaign_name}</span>
                </div>
                <span className={`chip ${s.ended_at ? 'ok' : 'warn'}`}>
                  {s.ended_at ? 'cerrada' : 'abierta'}
                </span>
              </div>
            ))}
            {data.recentSessions.length === 0 && <p className="muted">Sin sesiones todavía.</p>}
          </div>
        </section>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function ProfilePanel() {
  const user = useAuth((s) => s.user)!;
  const updateProfile = useAuth((s) => s.updateProfile);
  const changePassword = useAuth((s) => s.changePassword);
  const deleteAccount = useAuth((s) => s.deleteAccount);
  const [profile, setProfile] = useState({ displayName: user.displayName, bio: user.bio || '' });
  const [saved, setSaved] = useState(false);
  const [pw, setPw] = useState({ current: '', next: '' });
  const [pwMsg, setPwMsg] = useState('');

  const doChangePw = async () => {
    setPwMsg('');
    try {
      await changePassword(pw.current, pw.next);
      setPw({ current: '', next: '' });
      setPwMsg('Contraseña actualizada.');
    } catch (e) {
      setPwMsg((e as Error).message);
    }
  };

  const doDelete = async () => {
    if (!confirm('¿Eliminar tu cuenta y todos tus datos? Esta acción no se puede deshacer.')) return;
    await deleteAccount();
    location.href = '/';
  };

  return (
    <div className="hub-view">
      <h1>Mi perfil</h1>
      <div className="hub-card" style={{ maxWidth: 520 }}>
        <div className="row" style={{ alignItems: 'center', gap: 12 }}>
          <div className="avatar-lg" style={{ background: '#7dd3fc' }}>
            {user.displayName.slice(0, 1).toUpperCase()}
          </div>
          <div>
            <b>{user.displayName}</b>
            <div className="muted">@{user.username}</div>
          </div>
        </div>
        <div className="field">
          <label>Nombre para mostrar</label>
          <input
            value={profile.displayName}
            onChange={(e) => setProfile({ ...profile, displayName: e.target.value })}
          />
        </div>
        <div className="field">
          <label>Biografía</label>
          <textarea
            rows={3}
            placeholder="Cuéntanos algo sobre ti…"
            value={profile.bio}
            onChange={(e) => setProfile({ ...profile, bio: e.target.value })}
          />
        </div>
        <div className="field">
          <label>Email</label>
          <input value={user.email} disabled />
        </div>
        <button
          className="btn primary"
          onClick={async () => {
            await updateProfile(profile);
            setSaved(true);
            setTimeout(() => setSaved(false), 1500);
          }}
        >
          {saved ? (
            <>
              <Icon name="check" size={14} /> Guardado
            </>
          ) : (
            'Guardar cambios'
          )}
        </button>
      </div>

      <div className="hub-card" style={{ maxWidth: 520, marginTop: 16 }}>
        <h3>Contraseña</h3>
        <div className="row">
          <div className="field">
            <label>Contraseña actual</label>
            <input
              type="password"
              value={pw.current}
              onChange={(e) => setPw({ ...pw, current: e.target.value })}
            />
          </div>
          <div className="field">
            <label>Nueva contraseña</label>
            <input
              type="password"
              value={pw.next}
              onChange={(e) => setPw({ ...pw, next: e.target.value })}
            />
          </div>
        </div>
        {pwMsg && <p className="muted">{pwMsg}</p>}
        <button className="btn" onClick={doChangePw}>
          Cambiar contraseña
        </button>
      </div>

      <div className="hub-card danger-zone" style={{ maxWidth: 520, marginTop: 16 }}>
        <h3>Zona de peligro</h3>
        <p className="muted">Eliminar tu cuenta borra tus campañas, personajes y recursos.</p>
        <button className="btn danger" onClick={doDelete}>
          <Icon name="trash" size={14} /> Eliminar mi cuenta
        </button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function CampaignList({ onOpen }: { onOpen: (id: string) => void }) {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [showNew, setShowNew] = useState(false);
  const [form, setForm] = useState({ name: '', description: '', system: 'Genérico' });

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
    setForm({ name: '', description: '', system: 'Genérico' });
    setShowNew(false);
    await load();
    onOpen(id);
  }

  return (
    <div className="hub-view">
      <div className="row spread" style={{ marginBottom: 14 }}>
        <h1 style={{ margin: 0 }}>Campañas</h1>
        <button className="btn primary" onClick={() => setShowNew((v) => !v)}>
          <Icon name="plus" size={14} /> Nueva campaña
        </button>
      </div>

      {showNew && (
        <div className="hub-card" style={{ marginBottom: 16 }}>
          <div className="row">
            <div className="field">
              <label>Nombre</label>
              <input
                placeholder="La campaña de…"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>
            <div className="field">
              <label>Sistema de juego</label>
              <input
                placeholder="D&D 5e, Pathfinder…"
                value={form.system}
                onChange={(e) => setForm({ ...form, system: e.target.value })}
              />
            </div>
          </div>
          <div className="field">
            <label>Descripción</label>
            <textarea
              rows={2}
              placeholder="De qué va la campaña"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
          </div>
          <button className="btn primary" onClick={create}>
            Crear campaña
          </button>
        </div>
      )}

      <div className="campaign-grid">
        {campaigns.map((c) => (
          <div key={c.id} className="campaign-card" onClick={() => onOpen(c.id)}>
            {c.coverUrl ? (
              <img src={assetUrl(c.coverUrl) || c.coverUrl} alt="" />
            ) : (
              <div className="campaign-cover placeholder">
                <Icon name="map" size={34} />
              </div>
            )}
            <div className="campaign-body">
              <h3>{c.name}</h3>
              <p className="muted">{c.description || 'Sin descripción.'}</p>
              <div className="row" style={{ gap: 6 }}>
                <span className="chip">{c.system}</span>
                <span className="chip">{roleLabel(c.role)}</span>
                <span className="chip">
                  <Icon name="members" size={12} /> {c.memberCount + 1}
                </span>
              </div>
            </div>
          </div>
        ))}
        {campaigns.length === 0 && (
          <p className="muted">Aún no tienes campañas. Crea la primera para empezar.</p>
        )}
      </div>
    </div>
  );
}

export function roleLabel(role: string): string {
  switch (role) {
    case 'owner':
      return 'Propietario';
    case 'gm':
      return 'Director de juego';
    case 'player':
      return 'Jugador';
    case 'observer':
      return 'Observador';
    default:
      return role;
  }
}
