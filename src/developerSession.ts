export interface DeveloperSession { token: string; server: string; username: string; }
const KEY = 'shuatitong_developer_session';

export function defaultPublisherServer(): string {
  return import.meta.env.DEV ? '/publisher' : 'http://127.0.0.1:3001';
}

export function publisherServer(value: string): string {
  const address = value.trim().replace(/\/+$/, '');
  if (address === '/publisher' && import.meta.env.DEV) return address;
  const url = new URL(address);
  if (url.username || url.password || url.search || url.hash || (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)))) {
    throw new Error('发布服务请使用 HTTPS 或本机 localhost / 127.0.0.1 地址');
  }
  return address;
}

export function getDeveloperSession(): DeveloperSession | null {
  try {
    if (sessionStorage.getItem('shuatitong_dev') !== 'true') return null;
    const session = JSON.parse(sessionStorage.getItem(KEY) || 'null');
    return session && typeof session.token === 'string' && session.token && typeof session.username === 'string'
      ? { token: session.token, username: session.username, server: publisherServer(session.server) } : null;
  } catch { return null; }
}

export function saveDeveloperSession(session: DeveloperSession): void {
  sessionStorage.setItem(KEY, JSON.stringify(session));
}

export function clearDeveloperSession(): void {
  sessionStorage.removeItem(KEY);
}
