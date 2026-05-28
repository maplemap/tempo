import { test } from 'node:test';
import assert from 'node:assert/strict';
import { categorize, categorizeEntry } from './categorize.js';

test('empty input returns task', () => {
  assert.equal(categorize(''), 'task');
  assert.equal(categorize('   '), 'task');
});

test('daily keywords', () => {
  assert.equal(categorize('daily standup notes'), 'daily');
  assert.equal(categorize('team sync'), 'daily');
  assert.equal(categorize('мітинг з командою'), 'daily');
  assert.equal(categorize('дейлі'), 'daily');
});

test('review keywords', () => {
  assert.equal(categorize('review PR #234'), 'review');
  assert.equal(categorize('code review for auth'), 'review');
  assert.equal(categorize('PR 99 needs eyes'), 'review');
  assert.equal(categorize('огляд коду'), 'review');
});

test('bug keywords', () => {
  assert.equal(categorize('fix login redirect bug'), 'bug');
  assert.equal(categorize('hotfix for timer'), 'bug');
  assert.equal(categorize('баг помилку'), 'bug');
});

test('refactor keywords', () => {
  assert.equal(categorize('refactor auth module'), 'refactor');
  assert.equal(categorize('cleanup callbacks'), 'refactor');
  assert.equal(categorize('extract helper'), 'refactor');
  assert.equal(categorize('рефактор logging'), 'refactor');
});

test('priority: daily beats review', () => {
  assert.equal(categorize('daily review of dashboards'), 'daily');
});

test('priority: review beats bug and refactor', () => {
  assert.equal(categorize('review bug fix PR'), 'review');
  assert.equal(categorize('review refactor PR'), 'review');
});

test('priority: bug beats refactor', () => {
  assert.equal(categorize('fix bug after refactor'), 'bug');
});

test('no keywords returns task', () => {
  assert.equal(categorize('implement settings page'), 'task');
  assert.equal(categorize('write docs'), 'task');
});

test('word boundaries: previewing is not review', () => {
  assert.equal(categorize('preview the new layout'), 'task');
});

test('word boundaries: buggy is not bug', () => {
  assert.equal(categorize('buggy whip era'), 'task');
});

test('categorizeEntry combines task name and description', () => {
  assert.equal(categorizeEntry('Login refactor', null), 'refactor');
  assert.equal(categorizeEntry('Login refactor', 'fix login redirect bug'), 'bug');
  assert.equal(categorizeEntry(null, null), 'task');
  assert.equal(categorizeEntry('', ''), 'task');
});
