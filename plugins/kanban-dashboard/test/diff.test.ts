import { readFileSync } from 'fs';
import { runInNewContext } from 'vm';
import { resolve } from 'path';
import { describe, it, expect, beforeAll } from 'vitest';

interface DiffLine {
  type: 'context' | 'added' | 'removed';
  content: string;
  oldNum?: number;
  newNum?: number;
}

interface Hunk {
  header: string;
  lines: DiffLine[];
}

interface SideBySideRow {
  type: 'hunk' | 'context' | 'modified' | 'removed' | 'added';
  header?: string;
  leftNum?: number | null;
  leftContent?: string | null;
  rightNum?: number | null;
  rightContent?: string | null;
}

let parseDiff: (diffText: string) => Hunk[];
let buildSideBySide: (hunks: Hunk[]) => SideBySideRow[];
let escapeHtml: (text: string) => string;
let renderDiff: (diffText: string) => string;

beforeAll(() => {
  const code = readFileSync(resolve(__dirname, '../public/js/diff.js'), 'utf-8');
  const context: Record<string, unknown> = {};
  runInNewContext(code, context);
  parseDiff = context.parseDiff as typeof parseDiff;
  buildSideBySide = context.buildSideBySide as typeof buildSideBySide;
  escapeHtml = context.escapeHtml as typeof escapeHtml;
  renderDiff = context.renderDiff as typeof renderDiff;
});

describe('parseDiff', () => {
  it('returns [] for null input', () => {
    expect(parseDiff(null as unknown as string)).toEqual([]);
  });

  it('returns [] for empty string', () => {
    expect(parseDiff('')).toEqual([]);
  });

  it('returns [] for whitespace-only string', () => {
    expect(parseDiff('   \n  ')).toEqual([]);
  });

  it('parses a single hunk header correctly', () => {
    const diff = [
      'diff --git a/file.ts b/file.ts',
      '--- a/file.ts',
      '+++ b/file.ts',
      '@@ -10,3 +10,4 @@ function foo() {',
      ' context line',
      '-removed line',
      '+added line',
      '+another added',
    ].join('\n');

    const hunks = parseDiff(diff);
    expect(hunks).toHaveLength(1);
    expect(hunks[0].header).toBe('@@ -10,3 +10,4 @@ function foo() {');
  });

  it('identifies context lines with correct line numbers', () => {
    const diff = [
      '@@ -5,3 +5,3 @@',
      ' context line',
    ].join('\n');

    const hunks = parseDiff(diff);
    expect(hunks[0].lines).toHaveLength(1);
    expect(hunks[0].lines[0]).toEqual({
      type: 'context',
      content: 'context line',
      oldNum: 5,
      newNum: 5,
    });
  });

  it('identifies removed lines with correct old line number', () => {
    const diff = [
      '@@ -5,3 +5,2 @@',
      '-removed line',
    ].join('\n');

    const hunks = parseDiff(diff);
    expect(hunks[0].lines[0]).toEqual({
      type: 'removed',
      content: 'removed line',
      oldNum: 5,
    });
  });

  it('identifies added lines with correct new line number', () => {
    const diff = [
      '@@ -5,2 +5,3 @@',
      '+added line',
    ].join('\n');

    const hunks = parseDiff(diff);
    expect(hunks[0].lines[0]).toEqual({
      type: 'added',
      content: 'added line',
      newNum: 5,
    });
  });

  it('tracks line numbers correctly across mixed lines', () => {
    const diff = [
      '@@ -10,5 +10,5 @@',
      ' context1',
      '-old line',
      '+new line',
      ' context2',
    ].join('\n');

    const hunks = parseDiff(diff);
    const lines = hunks[0].lines;

    expect(lines[0]).toEqual({ type: 'context', content: 'context1', oldNum: 10, newNum: 10 });
    expect(lines[1]).toEqual({ type: 'removed', content: 'old line', oldNum: 11 });
    expect(lines[2]).toEqual({ type: 'added', content: 'new line', newNum: 11 });
    expect(lines[3]).toEqual({ type: 'context', content: 'context2', oldNum: 12, newNum: 12 });
  });

  it('parses multiple hunks', () => {
    const diff = [
      '@@ -1,3 +1,3 @@',
      ' line1',
      '-old',
      '+new',
      '@@ -20,2 +20,3 @@',
      ' line20',
      '+inserted',
    ].join('\n');

    const hunks = parseDiff(diff);
    expect(hunks).toHaveLength(2);
    expect(hunks[0].header).toBe('@@ -1,3 +1,3 @@');
    expect(hunks[1].header).toBe('@@ -20,2 +20,3 @@');
    expect(hunks[1].lines).toHaveLength(2);
  });

  it('skips diff, index, ---, +++ header lines', () => {
    const diff = [
      'diff --git a/foo.js b/foo.js',
      'index abc123..def456 100644',
      '--- a/foo.js',
      '+++ b/foo.js',
      '@@ -1,1 +1,1 @@',
      '-old',
      '+new',
    ].join('\n');

    const hunks = parseDiff(diff);
    expect(hunks).toHaveLength(1);
    expect(hunks[0].lines).toHaveLength(2);
  });
});

describe('buildSideBySide', () => {
  it('converts context lines to paired rows', () => {
    const hunks: Hunk[] = [{
      header: '@@ -1,1 +1,1 @@',
      lines: [{ type: 'context', content: 'same', oldNum: 1, newNum: 1 }],
    }];

    const rows = buildSideBySide(hunks);
    expect(rows).toHaveLength(2); // hunk header + 1 context row
    expect(rows[0]).toEqual({ type: 'hunk', header: '@@ -1,1 +1,1 @@' });
    expect(rows[1]).toEqual({
      type: 'context',
      leftNum: 1,
      leftContent: 'same',
      rightNum: 1,
      rightContent: 'same',
    });
  });

  it('pairs adjacent removed+added lines as modified', () => {
    const hunks: Hunk[] = [{
      header: '@@ -1,1 +1,1 @@',
      lines: [
        { type: 'removed', content: 'old text', oldNum: 1 },
        { type: 'added', content: 'new text', newNum: 1 },
      ],
    }];

    const rows = buildSideBySide(hunks);
    expect(rows[1]).toEqual({
      type: 'modified',
      leftNum: 1,
      leftContent: 'old text',
      rightNum: 1,
      rightContent: 'new text',
    });
  });

  it('handles unpaired removed line with null right side', () => {
    const hunks: Hunk[] = [{
      header: '@@ -1,1 +1,0 @@',
      lines: [
        { type: 'removed', content: 'deleted', oldNum: 1 },
      ],
    }];

    const rows = buildSideBySide(hunks);
    expect(rows[1]).toEqual({
      type: 'removed',
      leftNum: 1,
      leftContent: 'deleted',
      rightNum: null,
      rightContent: null,
    });
  });

  it('handles unpaired added line with null left side', () => {
    const hunks: Hunk[] = [{
      header: '@@ -1,0 +1,1 @@',
      lines: [
        { type: 'added', content: 'inserted', newNum: 1 },
      ],
    }];

    const rows = buildSideBySide(hunks);
    expect(rows[1]).toEqual({
      type: 'added',
      leftNum: null,
      leftContent: null,
      rightNum: 1,
      rightContent: 'inserted',
    });
  });

  it('handles more removed than added lines', () => {
    const hunks: Hunk[] = [{
      header: '@@ -1,3 +1,1 @@',
      lines: [
        { type: 'removed', content: 'line1', oldNum: 1 },
        { type: 'removed', content: 'line2', oldNum: 2 },
        { type: 'removed', content: 'line3', oldNum: 3 },
        { type: 'added', content: 'combined', newNum: 1 },
      ],
    }];

    const rows = buildSideBySide(hunks);
    // hunk header + 1 modified + 2 removed
    expect(rows[1]).toEqual({
      type: 'modified',
      leftNum: 1,
      leftContent: 'line1',
      rightNum: 1,
      rightContent: 'combined',
    });
    expect(rows[2]).toEqual({
      type: 'removed',
      leftNum: 2,
      leftContent: 'line2',
      rightNum: null,
      rightContent: null,
    });
    expect(rows[3]).toEqual({
      type: 'removed',
      leftNum: 3,
      leftContent: 'line3',
      rightNum: null,
      rightContent: null,
    });
  });

  it('handles more added than removed lines', () => {
    const hunks: Hunk[] = [{
      header: '@@ -1,1 +1,3 @@',
      lines: [
        { type: 'removed', content: 'original', oldNum: 1 },
        { type: 'added', content: 'split1', newNum: 1 },
        { type: 'added', content: 'split2', newNum: 2 },
        { type: 'added', content: 'split3', newNum: 3 },
      ],
    }];

    const rows = buildSideBySide(hunks);
    expect(rows[1]).toEqual({
      type: 'modified',
      leftNum: 1,
      leftContent: 'original',
      rightNum: 1,
      rightContent: 'split1',
    });
    expect(rows[2]).toEqual({
      type: 'added',
      leftNum: null,
      leftContent: null,
      rightNum: 2,
      rightContent: 'split2',
    });
    expect(rows[3]).toEqual({
      type: 'added',
      leftNum: null,
      leftContent: null,
      rightNum: 3,
      rightContent: 'split3',
    });
  });
});

describe('escapeHtml', () => {
  it('escapes & to &amp;', () => {
    expect(escapeHtml('a & b')).toBe('a &amp; b');
  });

  it('escapes < to &lt;', () => {
    expect(escapeHtml('<div>')).toBe('&lt;div&gt;');
  });

  it('escapes > to &gt;', () => {
    expect(escapeHtml('a > b')).toBe('a &gt; b');
  });

  it('escapes " to &quot;', () => {
    expect(escapeHtml('say "hello"')).toBe('say &quot;hello&quot;');
  });

  it('escapes all special characters together', () => {
    expect(escapeHtml('<a href="x">&</a>')).toBe('&lt;a href=&quot;x&quot;&gt;&amp;&lt;/a&gt;');
  });

  it('returns empty string for null input', () => {
    expect(escapeHtml(null as unknown as string)).toBe('');
  });

  it('returns empty string for undefined input', () => {
    expect(escapeHtml(undefined as unknown as string)).toBe('');
  });

  it('returns empty string for empty string input', () => {
    expect(escapeHtml('')).toBe('');
  });
});

describe('renderDiff', () => {
  it('returns "No changes" for null input', () => {
    const result = renderDiff(null as unknown as string);
    expect(result).toContain('No changes');
  });

  it('returns "No changes" for empty string', () => {
    const result = renderDiff('');
    expect(result).toContain('No changes');
  });

  it('returns "No changes" for whitespace-only input', () => {
    const result = renderDiff('   \n  ');
    expect(result).toContain('No changes');
  });

  it('produces HTML with diff-table class', () => {
    const diff = [
      '@@ -1,1 +1,1 @@',
      '-old',
      '+new',
    ].join('\n');

    const result = renderDiff(diff);
    expect(result).toContain('diff-table');
  });

  it('produces HTML with diff-container class', () => {
    const diff = [
      '@@ -1,1 +1,1 @@',
      '-old',
      '+new',
    ].join('\n');

    const result = renderDiff(diff);
    expect(result).toContain('diff-container');
  });

  it('renders hunk headers with diff-hunk-header class', () => {
    const diff = [
      '@@ -1,1 +1,1 @@',
      '-old',
      '+new',
    ].join('\n');

    const result = renderDiff(diff);
    expect(result).toContain('diff-hunk-header');
  });

  it('renders line numbers in diff-line-num cells', () => {
    const diff = [
      '@@ -5,1 +5,1 @@',
      '-old',
      '+new',
    ].join('\n');

    const result = renderDiff(diff);
    expect(result).toContain('diff-line-num');
    expect(result).toContain('>5<');
  });

  it('escapes HTML in diff content', () => {
    const diff = [
      '@@ -1,1 +1,1 @@',
      '-<div>old</div>',
      '+<span>new</span>',
    ].join('\n');

    const result = renderDiff(diff);
    expect(result).toContain('&lt;div&gt;');
    expect(result).toContain('&lt;span&gt;');
    expect(result).not.toContain('<div>old</div>');
  });

  it('marks empty cells with diff-empty-cell class', () => {
    const diff = [
      '@@ -1,1 +1,0 @@',
      '-deleted line',
    ].join('\n');

    const result = renderDiff(diff);
    expect(result).toContain('diff-empty-cell');
  });
});
