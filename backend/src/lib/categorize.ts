// Mirror of shared/types/category.ts — kept inline because backend tsconfig
// rootDir is `src` and cannot import from `../shared`. Keep in sync with
// `shared/types/category.ts` and `frontend/src/lib/api.ts`.
export type Category = 'review' | 'bug' | 'refactor' | 'task' | 'daily';

export const CATEGORIES: Category[] = ['review', 'bug', 'refactor', 'task', 'daily'];

export function isCategory(value: unknown): value is Category {
  return typeof value === 'string' && (CATEGORIES as string[]).includes(value);
}

// Order matters: first match wins.
// Priority — Daily > Review > Bug > Refactor > Task (default).
const RULES: Array<{ category: Category; patterns: RegExp[] }> = [
  {
    category: 'daily',
    patterns: [
      /\b(daily|standup|stand-up|sync)\b/iu,
      /(митинг|мітинг|дейлі|дейли|синк)/iu,
    ],
  },
  {
    category: 'review',
    patterns: [
      /\b(review|reviewing|reviewed|cr)\b/iu,
      /\bcode\s*review\b/iu,
      /\bPR\s+#?\d+/iu,
      /(огляд|ревʼю|ревью)/iu,
    ],
  },
  {
    category: 'bug',
    patterns: [
      /\b(bug|fix|fixing|fixed|hotfix|issue|defect)\b/iu,
      /(помилка|баг|фікс|фіксити|регрес)/iu,
    ],
  },
  {
    category: 'refactor',
    patterns: [
      /\b(refactor|refactoring|cleanup|clean-up|tidy|simplify|rename|extract)\b/iu,
      /(рефактор|рефакторинг|почистити)/iu,
    ],
  },
];

export function categorize(text: string): Category {
  const normalized = text.trim();
  if (!normalized) return 'task';
  for (const rule of RULES) {
    if (rule.patterns.some((p) => p.test(normalized))) {
      return rule.category;
    }
  }
  return 'task';
}

export function categorizeEntry(
  taskName: string | null,
  description: string | null
): Category {
  return categorize([taskName, description].filter(Boolean).join(' '));
}
