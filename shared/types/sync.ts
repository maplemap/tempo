export type EventType = 'pr_created' | 'pr_reviewed' | 'pr_merged';

export interface ExternalEvent {
  id: number;
  source: string;
  event_type: EventType;
  ref_id: string;
  ref_url: string;
  title: string | null;
  repo_or_board: string | null;
  occurred_at: string;
  raw_json: string | null;
  fetched_at: string;
}

export interface SyncStateRow {
  source: string;
  last_synced_at: string | null;
  last_error: string | null;
}
