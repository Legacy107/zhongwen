import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { parseChangelog } from './changelog';

const ROOT = path.resolve(import.meta.dirname, '..');

test('reads releases, paragraphs and bullets', () => {
  const releases = parseChangelog('# Changelog\n\nIntro.\n\n## 1.1.0 — 2026-10-03\n\nWhy.\n\n- One\n- Two\n\n## 1.0.0 — 2026-09-26\n\n- First\n');
  assert.deepEqual(releases, [
    {
      version: '1.1.0',
      date: '2026-10-03',
      blocks: [
        { kind: 'text', text: 'Why.' },
        { kind: 'bullet', text: 'One' },
        { kind: 'bullet', text: 'Two' },
      ],
    },
    { version: '1.0.0', date: '2026-09-26', blocks: [{ kind: 'bullet', text: 'First' }] },
  ]);
});

test('the newest changelog entry is the version in package.json', () => {
  const { version } = JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf8')) as { version: string };
  const [latest] = parseChangelog(readFileSync(path.join(ROOT, 'CHANGELOG.md'), 'utf8'));
  assert.equal(latest?.version, version, 'bumped the version without a CHANGELOG.md entry');
  assert.ok(latest.blocks.length > 0, `the ${version} entry is empty`);
});
