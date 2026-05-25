# Mobile Responsive Design Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Адаптувати Tempo під мобільні екрани (≤ 600px) через єдиний `@media` блок у `styles.css`.

**Architecture:** Один `@media (max-width: 600px)` блок у кінці `frontend/src/styles.css`. Жодних змін у компонентах, жодних нових файлів. Верифікація — вручну через браузер з увімкненим DevTools mobile emulation.

**Tech Stack:** CSS (custom properties, grid, flexbox), Vite dev server

---

### Task 1: Scaffold media query + app container padding

**Files:**
- Modify: `frontend/src/styles.css` (кінець файлу)

- [ ] **Step 1: Відкрити `frontend/src/styles.css` і додати в самий кінець:**

```css
/* ─── Mobile (≤ 600px) ─────────────────────────────────────── */
@media (max-width: 600px) {
  .app {
    padding: 16px 16px 96px;
  }
}
```

- [ ] **Step 2: Запустити dev-сервер (якщо ще не запущено)**

```bash
npm run dev
```

- [ ] **Step 3: Відкрити http://localhost:5173 у Chrome DevTools → Toggle Device Toolbar (Ctrl+Shift+M) → iPhone SE (375×667)**

Очікується: контент має `16px` відступи з боків замість `24px`.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/styles.css
git commit -m "style: scaffold mobile media query, reduce app padding"
```

---

### Task 2: Navigation — 2×2 grid

**Files:**
- Modify: `frontend/src/styles.css`

- [ ] **Step 1: Додати у `@media (max-width: 600px)` блок після `.app`:**

```css
  .nav {
    padding: 0;
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0;
  }

  .nav .btn {
    min-width: unset;
    width: 100%;
    border: none;
    border-top: 1px solid var(--hairline);
    padding: 12px 4px;
    text-align: center;
  }

  .nav .btn:nth-child(odd) {
    border-right: 1px solid var(--hairline);
  }
```

- [ ] **Step 2: Перевірити в DevTools (iPhone SE)**

Очікується: чотири кнопки у сітці 2×2. Активна кнопка — чорна. Між кнопками є лінії без подвоєння. Кнопка `●` (nav-running) займає окрему комірку — це нормально для тестування.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/styles.css
git commit -m "style(mobile): nav → 2×2 grid layout"
```

---

### Task 3: Entry row — card layout

**Files:**
- Modify: `frontend/src/styles.css`

- [ ] **Step 1: Додати у `@media` блок:**

```css
  .entry-row {
    display: block;
    border: 1px solid var(--hairline);
    padding: 10px;
    margin-bottom: 6px;
    border-bottom: 1px solid var(--hairline);
  }

  .entry-row:hover {
    border-bottom-color: var(--hairline);
  }

  .entry-row .time {
    display: inline;
    font-size: 13px;
  }

  .entry-row .dur {
    float: right;
    font-size: 13px;
  }

  .entry-row .proj {
    display: block;
    margin-bottom: 2px;
  }

  .entry-row .desc {
    display: block;
    white-space: normal;
    overflow: visible;
    text-overflow: unset;
    font-size: 13px;
    margin-bottom: 6px;
    color: var(--muted);
  }

  .entry-row .badges {
    display: inline-flex;
    margin-bottom: 6px;
  }

  .entry-row .entry-actions {
    float: right;
  }

  .entry-row::after {
    content: '';
    display: block;
    clear: both;
  }
```

- [ ] **Step 2: Перевірити на TimerPage і EntriesPage (iPhone SE)**

Очікується:
- Кожен запис — прямокутна картка з рамкою
- Перший рядок: проєкт (зліва), тривалість (справа)
- Другий рядок: опис
- Третій рядок: часовий діапазон (зліва), `[ ▶ ][ × ]` (справа)

- [ ] **Step 3: Commit**

```bash
git add frontend/src/styles.css
git commit -m "style(mobile): entry-row → card layout"
```

---

### Task 4: Entry edit form — wrap inputs

**Files:**
- Modify: `frontend/src/styles.css`

- [ ] **Step 1: Додати у `@media` блок:**

```css
  .entry-edit-row {
    flex-wrap: wrap;
  }

  .entry-edit-row input[type="datetime-local"] {
    min-width: 150px;
    flex: 1 1 140px;
  }
```

- [ ] **Step 2: Перевірити: клікнути на entry-картку в EntriesPage (iPhone SE)**

Очікується: форма редагування розгортається без горизонтального переповнення. `datetime-local` inputs переносяться на новий рядок якщо не влазять.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/styles.css
git commit -m "style(mobile): entry edit form flex-wrap"
```

---

### Task 5: Dashboard row, counters, timer form

**Files:**
- Modify: `frontend/src/styles.css`

- [ ] **Step 1: Додати у `@media` блок:**

```css
  /* Dashboard rows — shrink name column */
  .dash-row {
    grid-template-columns: minmax(0, 1fr) 60px 60px 36px;
  }

  .dash-row .name {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  /* Counters — 2 columns, third spans full width */
  .counters {
    grid-template-columns: repeat(2, 1fr);
    gap: 16px;
  }

  .counter-block:nth-child(3) {
    grid-column: 1 / -1;
  }

  /* Timer form — stack label above input */
  .timer-form {
    grid-template-columns: 1fr;
    gap: 4px 0;
  }

  .timer-form .label {
    margin-top: 12px;
    margin-bottom: 2px;
  }

  /* Timer display — slightly smaller */
  .timer-display {
    font-size: 44px;
  }

  /* Page headers — period buttons wrap on small screens */
  .hd {
    flex-wrap: wrap;
    gap: 8px;
  }
```

- [ ] **Step 2: Перевірити DashboardPage (iPhone SE)**

Очікується:
- Рядки By project / By day: назва скорочується через `…`, решта колонок зберігаються
- Counters: 2+1 layout (два в рядок, третій на повну ширину)

- [ ] **Step 3: Перевірити TimerPage (iPhone SE)**

Очікується:
- "Project" label → поле select — стек у колонку
- "What" label → input — стек у колонку
- Цифри таймера `00:00:00` трохи менші (44px)

- [ ] **Step 4: Commit**

```bash
git add frontend/src/styles.css
git commit -m "style(mobile): dashboard, counters, timer form adjustments"
```

---

### Task 6: Running timer full-screen

**Files:**
- Modify: `frontend/src/styles.css`

- [ ] **Step 1: Додати у `@media` блок:**

```css
  .running {
    padding: 24px 16px;
  }

  .running .timer-display {
    font-size: 64px;
  }

  .running .running-desc {
    font-size: 16px;
  }
```

- [ ] **Step 2: Запустити таймер і перевірити full-screen режим (iPhone SE)**

Очікується: великий таймер вміщається на екрані, опис читається, кнопка `[ STOP ]` видима без скролу.

- [ ] **Step 3: Перевірити SettingsPage і LoginPage (iPhone SE)**

SettingsPage — scroll-able контент, нічого не обрізається.
LoginPage — картка входу `.login-card` має `max-width: 320px; padding: 32px`. На 320px екрані бічний padding займає весь простір. Додати у `@media` блок:

```css
  .login-card {
    padding: 24px 16px;
  }
```

- [ ] **Step 4: Commit**

```bash
git add frontend/src/styles.css
git commit -m "style(mobile): running timer font sizes"
```

---

### Task 7: Final sweep

- [ ] **Step 1: Перевірити всі сторінки на трьох розмірах у DevTools**

| Розмір | Пристрій |
|--------|----------|
| 375×667 | iPhone SE |
| 390×844 | iPhone 14 |
| 768×1024 | iPad (має виглядати як desktop — breakpoint 600px) |

Для кожної сторінки: Timer, Entries (day / week / month), Dashboard (day / week / month), Settings, Login.

Перевірити: немає горизонтального скролу, текст не обрізається, кнопки натискаються.

- [ ] **Step 2: Перевірити активний таймер у nav (`.nav-running` — ● індикатор)**

На мобільному ● займає третю комірку у 2×2 сітці → або виглядає прийнятно, або додати `display: none` на мобільному (він і так видно в full-screen режимі).

- [ ] **Step 3: Додати `.superpowers/` до `.gitignore` якщо ще немає**

```bash
grep -q '.superpowers' /Users/maplemap/Work/Projects/_own-projects/tempo/.gitignore || echo '.superpowers/' >> /Users/maplemap/Work/Projects/_own-projects/tempo/.gitignore
```

- [ ] **Step 4: Final commit**

```bash
git add frontend/src/styles.css .gitignore
git commit -m "style(mobile): final sweep and .gitignore update"
```
