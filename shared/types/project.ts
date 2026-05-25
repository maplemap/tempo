export interface Project {
  id: number;
  name: string;
  archived: 0 | 1;
  github_repo: string | null;
  github_base_branch: string | null;
  created_at: string;
}
