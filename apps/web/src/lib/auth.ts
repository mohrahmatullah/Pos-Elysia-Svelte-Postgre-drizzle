import { post, saveAuth, clearAuth, type SessionUser } from './api';
  import { setUser } from '$lib/stores/user';
  import { applyLoginPermissions, clearPermissions } from '$lib/permissions';
  import { clearMenus } from '$lib/menu';

interface LoginResponse {
  accessToken: string;
  refreshToken: string;
  user: SessionUser;
  role?: string;
  permissions?: string[];
  business_type?: string;
}

export async function login(email: string, password: string): Promise<SessionUser> {
  const { data } = await post<LoginResponse>('/auth/login', { email, password });
  saveAuth(data);
  setUser(data.user);

  // Populate the permission store from the backend payload (UI-only cache).
  applyLoginPermissions({ role: data.role, permissions: data.permissions, business_type: data.business_type });

  return data.user;
}

export async function logout(): Promise<void> {
  try {
    await post('/auth/logout', {});
  } catch {
    // best-effort; clear local session regardless
  }
  clearAuth();
  setUser(null);
  clearPermissions();
  clearMenus();
}
