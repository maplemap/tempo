const base = '/api';

async function request(path, opts = {}) {
  const { headers: customHeaders = {}, body, ...rest } = opts;
  const hasBody = body !== undefined && body !== null;
  const headers = { ...customHeaders };
  if (hasBody) headers['content-type'] = 'application/json';

  const res = await fetch(`${base}${path}`, {
    credentials: 'include',
    ...rest,
    headers,
    body: hasBody ? JSON.stringify(body) : undefined
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) {
    const error = new Error(data?.error || res.statusText);
    error.status = res.status;
    throw error;
  }
  return data;
}

export const api = {
  auth: {
    me:     ()       => request('/auth/me'),
    login:  (password) => request('/auth/login',  { method: 'POST', body: { password } }),
    logout: ()       => request('/auth/logout', { method: 'POST' })
  },
  timer: {
    current: ()    => request('/timer/current'),
    start:   (body) => request('/timer/start', { method: 'POST', body }),
    stop:    ()    => request('/timer/stop',  { method: 'POST' })
  },
  entries: {
    list:    (params = {}) => {
      const qs = new URLSearchParams(params).toString();
      return request(`/entries${qs ? `?${qs}` : ''}`);
    },
    update:  (id, body) => request(`/entries/${id}`, { method: 'PATCH', body }),
    remove:  (id)       => request(`/entries/${id}`, { method: 'DELETE' }),
    addLink: (id, body) => request(`/entries/${id}/links`, { method: 'POST', body }),
    removeLink: (id, linkId) => request(`/entries/${id}/links/${linkId}`, { method: 'DELETE' })
  },
  projects: {
    list:   ()       => request('/projects'),
    create: (name)   => request('/projects', { method: 'POST', body: { name } }),
    update: (id, b)  => request(`/projects/${id}`, { method: 'PATCH', body: b }),
    remove: (id)     => request(`/projects/${id}`, { method: 'DELETE' })
  },
  stats: {
    get: (params = {}) => {
      const qs = new URLSearchParams(params).toString();
      return request(`/stats${qs ? `?${qs}` : ''}`);
    }
  },
  sync: {
    state: () => request('/sync/state'),
    run:   () => request('/sync/run', { method: 'POST' })
  },
  github: {
    repos: () => request('/github/repos')
  }
};
