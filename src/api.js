const API = 'https://phira.5wyxi.com';
const SESSION_KEY = 'phira-web-session';
const VERSION = '0.8.3';

function readSession() {
  try {
    return JSON.parse(localStorage.getItem(SESSION_KEY) || 'null');
  } catch {
    return null;
  }
}

let session = readSession();

export function getSession() {
  return session;
}

export function setSession(value) {
  session = value;
  if (value) localStorage.setItem(SESSION_KEY, JSON.stringify(value));
  else localStorage.removeItem(SESSION_KEY);
  window.dispatchEvent(new CustomEvent('sessionchange', { detail: value }));
}

export function logout() {
  setSession(null);
}

function toQuery(params = {}) {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && String(value).trim() !== '') query.set(key, value);
  });
  const value = query.toString();
  return value ? `?${value}` : '';
}

async function refreshSession() {
  if (!session?.refreshToken) return false;
  const previous = session;
  const response = await fetch(`${API}/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      refreshToken: previous.refreshToken,
      cancelDeleteRequest: false,
      clientVersion: VERSION,
      clientFlavor: 'none'
    })
  });
  if (!response.ok) {
    logout();
    return false;
  }
  const tokens = await response.json();
  if (session !== previous) return false;
  setSession({ id: tokens.id ?? previous.id, token: tokens.token, refreshToken: tokens.refreshToken });
  return true;
}

export async function request(path, options = {}, canRefresh = true) {
  const headers = new Headers(options.headers || {});
  if (session?.token) headers.set('Authorization', `Bearer ${session.token}`);
  if (options.body !== undefined && !(options.body instanceof Blob) && !(options.body instanceof ArrayBuffer)) {
    headers.set('Content-Type', 'application/json');
  }
  let response;
  try {
    response = await fetch(`${API}${path}`, {
      ...options,
      headers,
      body: options.body !== undefined && typeof options.body !== 'string' && !(options.body instanceof Blob) && !(options.body instanceof ArrayBuffer)
        ? JSON.stringify(options.body)
        : options.body
    });
  } catch (error) {
    throw new Error(error instanceof TypeError ? '无法连接 Phira 服务，请检查网络或 API 状态。' : error.message);
  }

  if (response.status === 401 && canRefresh && session?.refreshToken && !path.startsWith('/login')) {
    if (await refreshSession()) return request(path, options, false);
  }

  if (!response.ok) {
    let message = `请求失败 (${response.status})`;
    try {
      const data = await response.json();
      message = data.error || data.message || message;
    } catch {
      if (response.status === 401) message = '登录已过期，请重新登录。';
      if (response.status === 412) message = '收藏夹已在其他位置更新，请重新载入后再试。';
    }
    const error = new Error(message);
    error.status = response.status;
    throw error;
  }
  if (response.status === 204) return null;
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

export async function listCharts(params) {
  return request(`/chart${toQuery(params)}`);
}

export async function getChart(id) {
  return request(`/chart/${encodeURIComponent(id)}`);
}

export async function popularCharts() {
  return request('/chart/popular');
}

export async function leaderboard(id, standard = false) {
  return request(`/record/list15/${encodeURIComponent(id)}${toQuery({ std: String(standard) })}`);
}

export async function login(email, password) {
  const result = await request('/login', {
    method: 'POST',
    body: { email, password, cancelDeleteRequest: false, clientVersion: VERSION, clientFlavor: 'none' }
  }, false);
  setSession({ id: result.id, token: result.token, refreshToken: result.refreshToken });
  return result;
}

export async function currentUser() {
  return request('/me');
}

export async function listCollections() {
  return request('/collection?page=1&pageNum=50&order=-updated');
}

export async function getCollection(id) {
  return request(`/collection/${encodeURIComponent(id)}`);
}

export async function createCollection(name, description, charts = []) {
  return request('/collection', { method: 'POST', body: { name, description, charts, public: false } });
}

export async function patchCollection(id, charts) {
  return request(`/collection/${encodeURIComponent(id)}`, { method: 'PATCH', body: charts });
}

export async function downloadFile(url, filename) {
  if (!url) throw new Error('谱面文件地址不可用。');
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.target = '_blank';
  link.rel = 'noreferrer';
  document.body.append(link);
  link.click();
  link.remove();
}

export function apiFile(url) {
  return url || '';
}
