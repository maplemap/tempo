const base = '/api';

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

// Domain types (inlined to avoid rootDir issues with shared/types)
export interface EntryLink { id: number; entry_id: number; url: string; label: string | null; }
export interface Entry {
  id: number; project_id: number | null; project_name: string | null;
  github_repo: string | null; description: string | null;
  started_at: string; ended_at: string | null; duration_seconds: number | null;
  links: EntryLink[]; badges: string[];
}
export interface TimerEntry {
  id: number; project_id: number | null; project_name: string | null;
  github_repo: string | null; description: string | null; started_at: string;
}
export interface Project {
  id: number; name: string; archived: 0 | 1;
  github_repo: string | null; github_base_branch: string | null; created_at: string;
}
export interface SyncStateRow { source: string; last_synced_at: string | null; last_error: string | null; }
export interface Plan {
  id: number; project_id: number | null; project_name: string | null;
  text: string; position: number; done: 0 | 1; done_at: string | null; created_at: string;
}

interface RequestOptions extends Omit<RequestInit, 'body'> {
  body?: unknown;
}

async function request<T = unknown>(urlPath: string, opts: RequestOptions = {}): Promise<T> {
  const { headers: customHeaders = {}, body, ...rest } = opts;
  const hasBody = body !== undefined && body !== null;
  const headers: Record<string, string> = { ...(customHeaders as Record<string, string>) };
  if (hasBody) headers['content-type'] = 'application/json';

  const res = await fetch(`${base}${urlPath}`, {
    credentials: 'include',
    ...rest,
    headers,
    body: hasBody ? JSON.stringify(body) : undefined
  });
  const text = await res.text();
  const data = text ? (JSON.parse(text) as Record<string, unknown>) : null;
  if (!res.ok) {
    throw new ApiError(
      (data?.['error'] as string | undefined) ?? res.statusText,
      res.status
    );
  }
  return data as T;
}

export const api = {
  auth: {
    me:     ()                 => request<{ user: string }>('/auth/me'),
    login:  (password: string) => request<{ ok: boolean }>('/auth/login', { method: 'POST', body: { password } }),
    logout: ()                 => request<{ ok: boolean }>('/auth/logout', { method: 'POST' })
  },
  timer: {
    current: () => request<{ current: TimerEntry | null }>('/timer/current'),
    start:   (body: { projectId?: number | null; description?: string }) =>
      request<{ current: TimerEntry }>('/timer/start', { method: 'POST', body }),
    stop:    () => request<{ ok: boolean; entryId: number | null; alreadyStopped?: boolean }>(
      '/timer/stop', { method: 'POST' }
    )
  },
  entries: {
    list:    (params: Record<string, string> = {}) => {
      const qs = new URLSearchParams(params).toString();
      return request<{ entries: Entry[]; hasMore: boolean }>(`/entries${qs ? `?${qs}` : ''}`);
    },
    update:  (id: number, body: object) =>
      request<{ entry: Entry }>(`/entries/${id}`, { method: 'PATCH', body }),
    remove:  (id: number) =>
      request<{ ok: boolean }>(`/entries/${id}`, { method: 'DELETE' }),
    addLink: (id: number, body: { url: string; label?: string }) =>
      request<{ entry: Entry }>(`/entries/${id}/links`, { method: 'POST', body }),
    removeLink: (id: number, linkId: number) =>
      request<{ entry: Entry }>(`/entries/${id}/links/${linkId}`, { method: 'DELETE' })
  },
  projects: {
    list:   ()                    => request<{ projects: Project[] }>('/projects'),
    create: (name: string)        => request<{ project: Project }>('/projects', { method: 'POST', body: { name } }),
    update: (id: number, b: object) =>
      request<{ project: Project }>(`/projects/${id}`, { method: 'PATCH', body: b }),
    remove: (id: number)          =>
      request<{ ok: boolean }>(`/projects/${id}`, { method: 'DELETE' })
  },
  stats: {
    get: (params: Record<string, string> = {}) => {
      const qs = new URLSearchParams(params).toString();
      return request(`/stats${qs ? `?${qs}` : ''}`);
    }
  },
  sync: {
    state: () => request<{ state: SyncStateRow[] }>('/sync/state'),
    run:   () => request<{ ok: boolean }>('/sync/run', { method: 'POST' })
  },
  github: {
    repos: () => request<{ repos: string[] }>('/github/repos')
  },
  plans: {
    list:    () => request<{ plans: Plan[] }>('/plans'),
    create:  (body: { project_id?: number | null; text: string }) =>
      request<{ plan: Plan }>('/plans', { method: 'POST', body }),
    update:  (id: number, body: { done?: boolean; text?: string; project_id?: number | null }) =>
      request<{ plan: Plan }>(`/plans/${id}`, { method: 'PATCH', body }),
    reorder: (ids: number[]) =>
      request<{ ok: boolean }>('/plans/reorder', { method: 'PATCH', body: { ids } }),
    remove:  (id: number) =>
      request<{ ok: boolean }>(`/plans/${id}`, { method: 'DELETE' })
  }
};
