const TOKEN_KEY = 'vtt.token';

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string | null) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

function base() {
  // Configurable for split deployments (e.g. frontend on GitHub Pages).
  // Defaults to a same-origin relative path, working with the Vite proxy in dev
  // and the combined server in production.
  const configured = import.meta.env.VITE_API_URL as string | undefined;
  return configured ? `${configured.replace(/\/$/, '')}/api` : '/api';
}

async function request<T>(method: string, url: string, data?: unknown, isForm = false): Promise<T> {
  const headers: Record<string, string> = {};
  const token = getToken();
  if (token) headers['Authorization'] = `Bearer ${token}`;
  let body: BodyInit | undefined;
  if (data !== undefined) {
    if (isForm) {
      body = data as FormData;
    } else {
      headers['Content-Type'] = 'application/json';
      body = JSON.stringify(data);
    }
  }
  const res = await fetch(base() + url, { method, headers, body });
  const text = await res.text();
  const json = text ? JSON.parse(text) : {};
  if (!res.ok) throw new Error(json.error || `Request failed (${res.status})`);
  return json as T;
}

export const api = {
  get: <T>(url: string) => request<T>('GET', url),
  post: <T>(url: string, data?: unknown) => request<T>('POST', url, data),
  patch: <T>(url: string, data?: unknown) => request<T>('PATCH', url, data),
  del: <T>(url: string) => request<T>('DELETE', url),
  upload: <T>(url: string, form: FormData) => request<T>('POST', url, form, true),
};

/** Resolve a stored asset path (e.g. `/uploads/x.png`) against the API origin. */
export function assetUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  if (/^https?:\/\//i.test(url) || url.startsWith('data:')) return url;
  const configured = import.meta.env.VITE_API_URL as string | undefined;
  if (configured) return `${configured.replace(/\/$/, '')}${url}`;
  return url;
}

/* ------------------------------------------------------------------ *
 * Types
 * ------------------------------------------------------------------ */

export interface User {
  id: string;
  username: string;
  email: string;
  displayName: string;
  avatarUrl: string | null;
  bio: string | null;
  isAdmin: boolean;
  createdAt: number;
}

export interface Campaign {
  id: string;
  name: string;
  description: string | null;
  system: string | null;
  coverUrl: string | null;
  role: 'owner' | 'gm' | 'player' | 'observer';
  memberCount: number;
  createdAt: number;
  updatedAt: number;
}

export interface CampaignDetail {
  campaign: Omit<Campaign, 'role' | 'memberCount'>;
  role: Campaign['role'];
  owner: User;
  members: Array<{
    id: string;
    username: string;
    displayName: string;
    avatarUrl: string | null;
    role: string;
    joinedAt: number;
  }>;
}

export interface Character {
  id: string;
  campaignId: string | null;
  ownerId: string;
  name: string;
  kind: 'pc' | 'npc' | 'monster';
  data: Record<string, unknown>;
  portraitUrl: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface GlobalCharacter {
  id: string;
  campaignId: string | null;
  campaignName: string | null;
  ownerId: string;
  isMine: boolean;
  name: string;
  kind: 'pc' | 'npc' | 'monster';
  data: Record<string, unknown>;
  portraitUrl: string | null;
  updatedAt: number;
}

export interface Asset {
  id: string;
  campaignId: string;
  ownerId: string;
  name: string;
  mime: string;
  kind: string;
  url: string;
  createdAt: number;
}

export interface GameSession {
  id: string;
  campaignId: string;
  name: string;
  notes: string | null;
  startedAt: number;
  endedAt: number | null;
}

export interface Overview {
  counts: { campaigns: number; characters: number; assets: number; sessions: number };
  campaigns: Array<{
    id: string;
    name: string;
    system: string | null;
    coverUrl: string | null;
    role: string;
    updatedAt: number;
  }>;
  recentCharacters: Array<{
    id: string;
    campaign_id: string;
    name: string;
    kind: string;
    portrait_url: string | null;
    updated_at: number;
  }>;
  recentSessions: Array<{
    id: string;
    campaign_id: string;
    name: string;
    started_at: number;
    ended_at: number | null;
    campaign_name: string;
  }>;
}
