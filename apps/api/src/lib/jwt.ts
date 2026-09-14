/** Minimal HS256 JWT implementation on WebCrypto (no external dependency). */
const encoder = new TextEncoder();

const b64url = (bytes: Uint8Array): string => {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

const b64urlDecode = (str: string): Uint8Array => {
  const pad = str.length % 4 === 0 ? '' : '='.repeat(4 - (str.length % 4));
  const bin = atob(str.replace(/-/g, '+').replace(/_/g, '/') + pad);
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
};

export interface AccessPayload {
  sub: string;
  sid: string;
  role: string;
  /** Role UUID — lets the backend resolve the DB-backed permission set per request. */
  role_id: string;
  store_id: string;
  /** Multi-store: the store the user is currently working in (must be one of their
   * user_stores memberships). Defaults to store_id for tokens issued before this field. */
  active_store_id?: string;
  exp: number;
  iat: number;
}

const hmacKey = (secret: string): Promise<CryptoKey> =>
  crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);

export const signAccessToken = async (
  payload: Omit<AccessPayload, 'exp' | 'iat'>,
  secret: string,
  ttlMinutes: number,
): Promise<string> => {
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(encoder.encode(JSON.stringify({ alg: 'HS256', typ: 'JWT' })));
  const body = b64url(encoder.encode(JSON.stringify({ ...payload, iat: now, exp: now + ttlMinutes * 60 })));
  const key = await hmacKey(secret);
  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(`${header}.${body}`));
  return `${header}.${body}.${b64url(new Uint8Array(sig))}`;
};

export const verifyAccessToken = async (token: string, secret: string): Promise<AccessPayload | null> => {
  try {
    const [header, body, sig] = token.split('.');
    if (!header || !body || !sig) return null;
    const key = await hmacKey(secret);
    const valid = await crypto.subtle.verify('HMAC', key, b64urlDecode(sig), encoder.encode(`${header}.${body}`));
    if (!valid) return null;
    const payload = JSON.parse(new TextDecoder().decode(b64urlDecode(body))) as AccessPayload;
    if (payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
};

export const generateRefreshToken = (): string => crypto.randomUUID() + '.' + crypto.randomUUID();

export const hashToken = async (token: string): Promise<string> => {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(token));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
};
