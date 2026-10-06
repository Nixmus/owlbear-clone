import { create } from 'zustand';
import { api, setToken, getToken, type User } from './api';

interface AuthStore {
  user: User | null;
  loading: boolean;
  error: string | null;

  init: () => Promise<void>;
  login: (username: string, password: string) => Promise<void>;
  register: (username: string, email: string, password: string, displayName?: string) => Promise<void>;
  logout: () => void;
  updateProfile: (patch: { displayName?: string; bio?: string; avatarUrl?: string }) => Promise<void>;
}

const savedName = localStorage.getItem('vtt.name');

export const useAuth = create<AuthStore>((set) => ({
  user: null,
  loading: false,
  error: null,

  init: async () => {
    if (!getToken()) return;
    set({ loading: true });
    try {
      const { user } = await api.get<{ user: User }>('/auth/me');
      set({ user, loading: false });
      if (user) {
        localStorage.setItem('vtt.name', user.displayName);
        localStorage.setItem('vtt.color', user.avatarUrl || '#7dd3fc');
      }
    } catch {
      setToken(null);
      set({ user: null, loading: false });
    }
  },

  login: async (username, password) => {
    set({ loading: true, error: null });
    try {
      const { token, user } = await api.post<{ token: string; user: User }>('/auth/login', {
        username,
        password,
      });
      setToken(token);
      set({ user, loading: false });
      localStorage.setItem('vtt.name', user.displayName);
    } catch (e) {
      set({ error: (e as Error).message, loading: false });
      throw e;
    }
  },

  register: async (username, email, password, displayName) => {
    set({ loading: true, error: null });
    try {
      const { token, user } = await api.post<{ token: string; user: User }>('/auth/register', {
        username,
        email,
        password,
        displayName: displayName || savedName || username,
      });
      setToken(token);
      set({ user, loading: false });
      localStorage.setItem('vtt.name', user.displayName);
    } catch (e) {
      set({ error: (e as Error).message, loading: false });
      throw e;
    }
  },

  logout: () => {
    setToken(null);
    set({ user: null });
  },

  updateProfile: async (patch) => {
    const { user } = await api.patch<{ user: User }>('/me', patch);
    set({ user });
  },
}));
