import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

dotenv.config({ path: path.resolve(__dirname, '../../../.env') });
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

function required(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}

function num(name, def) {
  const v = process.env[name];
  return v ? Number(v) : def;
}

export const env = {
  port: num('PORT', 3000),
  adminPassword: required('ADMIN_PASSWORD'),
  jwtSecret: required('JWT_SECRET'),
  dataDir: path.resolve(process.env.DATA_DIR || path.join(__dirname, '../../data')),
  isProduction: process.env.NODE_ENV === 'production',
  secureCookie: process.env.SECURE_COOKIE === 'true',
  github: {
    token: process.env.GITHUB_TOKEN || null,
    baseBranch: process.env.GITHUB_BASE_BRANCH || 'main'
  },
  syncIntervalMinutes: num('SYNC_INTERVAL_MINUTES', 15),
  backfillDays: num('BACKFILL_DAYS', 30)
};
