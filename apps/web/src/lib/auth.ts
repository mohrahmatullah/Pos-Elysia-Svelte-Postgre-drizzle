import { post, saveAuth, clearAuth, type SessionUser } from './api';
import { setUser } from '$lib/stores/user';

interface LoginResponse {
  accessToken: string;
  refreshToken: string;
  user: SessionUser;
}

export async function login(email: string, password: string): Promise<SessionUser> {
  const { data } = await post<LoginResponse>('/auth/login', { email, password });
  saveAuth(data);
  setUser(data.user); // keep UI session in sync immediately
  return data.user;
}

export async function logout(): Promise<void> {
  try {
    await post('/auth/logout', {});
  } catch {
    // best-effort; clear local session regardless
  }
  clearAuth();
  setUser(null); // reset UI session so the next login reflects the new account
}
