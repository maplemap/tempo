export type Category = 'review' | 'bug' | 'refactor' | 'task' | 'daily';

export const CATEGORIES: Category[] = ['review', 'bug', 'refactor', 'task', 'daily'];

export function isCategory(value: unknown): value is Category {
  return typeof value === 'string' && (CATEGORIES as string[]).includes(value);
}
