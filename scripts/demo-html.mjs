import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DOCS_DIR = path.join(__dirname, '..', 'docs');

const screenshots = [
  { file: 'screenshots/01-timer.png',     caption: 'timer — track time with a running clock' },
  { file: 'screenshots/03-dashboard.png', caption: 'dashboard — weekly stats with ascii bars' },
  { file: 'screenshots/02-entries.png',   caption: 'entries — full log with project breakdown' },
  { file: 'screenshots/04-settings.png',  caption: 'settings — projects and github sync config' },
];

const figures = screenshots.map(({ file, caption }) => `
    <figure>
      <img src="${file}" alt="${caption}">
      <figcaption>${caption}</figcaption>
    </figure>`).join('');

const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Tempo — personal time tracker</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&display=swap" rel="stylesheet">
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'IBM Plex Mono', ui-monospace, SFMono-Regular, Menlo, monospace;
      font-size: 14px;
      line-height: 1.5;
      background: #fff;
      color: #000;
      padding: 48px 24px 80px;
      max-width: 960px;
      margin: 0 auto;
    }
    h1 { font-size: 22px; font-weight: 500; letter-spacing: -0.5px; }
    .tagline { color: #888; margin-top: 6px; }
    .stack { margin-top: 20px; color: #888; font-size: 13px; }
    .screenshots {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 12px;
      margin-top: 40px;
    }
    figure { border: 1px solid #000; }
    figure img { width: 100%; display: block; }
    figcaption {
      padding: 8px 12px;
      border-top: 1px solid #000;
      font-size: 12px;
      color: #888;
    }
    .quickstart { margin-top: 48px; }
    .quickstart h2 { font-size: 13px; font-weight: 500; margin-bottom: 10px; text-transform: uppercase; letter-spacing: 0.05em; }
    pre {
      border: 1px solid #000;
      padding: 16px;
      font-family: inherit;
      font-size: 13px;
      line-height: 1.7;
      overflow-x: auto;
    }
    .link { margin-top: 32px; }
    .link a { color: #000; text-decoration: underline; text-underline-offset: 3px; }
    @media (max-width: 640px) {
      .screenshots { grid-template-columns: 1fr; }
    }
  </style>
</head>
<body>
  <h1>tempo</h1>
  <p class="tagline">personal time tracker with github verification overlay</p>
  <p class="stack">Node.js · Fastify · React · SQLite · Docker</p>

  <div class="screenshots">${figures}
  </div>

  <div class="quickstart">
    <h2>Quick start</h2>
    <pre>cp .env.example .env
# set ADMIN_PASSWORD and JWT_SECRET
make prod</pre>
  </div>

  <p class="link"><a href="https://github.com/maplemap/tempo">→ github.com/maplemap/tempo</a></p>
</body>
</html>
`;

fs.writeFileSync(path.join(DOCS_DIR, 'index.html'), html, 'utf8');
console.log('Generated docs/index.html');
