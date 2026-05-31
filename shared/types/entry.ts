import type { Category } from './category.js';

export interface EntryLink {
  id: number;
  entry_id: number;
  url: string;
  label: string | null;
}

export interface Entry {
  id: number;
  project_id: number | null;
  project_name: string | null;
  github_repo: string | null;
  description: string | null;
  started_at: string;
  ended_at: string | null;
  duration_seconds: number | null;
  category: Category;
  category_manual: 0 | 1;
  links: EntryLink[];
  badges: string[];
}

export interface TimerEntry {
  id: number;
  project_id: number | null;
  project_name: string | null;
  github_repo: string | null;
  description: string | null;
  started_at: string;
}
