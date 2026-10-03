/**
 * CHANGELOG.md, parsed for the What's new screen. It understands only what
 * that file uses: a `## <version> — <date>` heading per release, then
 * paragraphs and `- ` bullets.
 */

export interface Release {
  version: string;
  date: string;
  /** Paragraphs and bullets, in order. */
  blocks: Array<{ kind: 'text' | 'bullet'; text: string }>;
}

export function parseChangelog(markdown: string): Release[] {
  const releases: Release[] = [];
  for (const line of markdown.split('\n')) {
    const heading = line.match(/^##\s+(\S+)\s+—\s+(\S+)/);
    if (heading) {
      releases.push({ version: heading[1], date: heading[2], blocks: [] });
      continue;
    }
    const release = releases[releases.length - 1];
    const text = line.trim();
    if (!release || !text) continue;
    if (text.startsWith('- ')) release.blocks.push({ kind: 'bullet', text: text.slice(2) });
    else release.blocks.push({ kind: 'text', text });
  }
  return releases;
}
