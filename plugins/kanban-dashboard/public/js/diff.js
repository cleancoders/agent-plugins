//region Diff Parser

function parseDiff(diffText) {
  if (!diffText || !diffText.trim()) return [];

  const lines = diffText.split('\n');
  const hunks = [];
  let currentHunk = null;
  let oldLine = 0;
  let newLine = 0;

  for (const line of lines) {
    const hunkMatch = line.match(/^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@(.*)/);
    if (hunkMatch) {
      currentHunk = { header: line, lines: [] };
      hunks.push(currentHunk);
      oldLine = parseInt(hunkMatch[1], 10);
      newLine = parseInt(hunkMatch[2], 10);
      continue;
    }

    if (line.startsWith('---') || line.startsWith('+++') ||
        line.startsWith('diff ') || line.startsWith('index ')) {
      continue;
    }

    if (!currentHunk) continue;

    if (line.startsWith('+')) {
      currentHunk.lines.push({ type: 'added', content: line.slice(1), newNum: newLine });
      newLine++;
    } else if (line.startsWith('-')) {
      currentHunk.lines.push({ type: 'removed', content: line.slice(1), oldNum: oldLine });
      oldLine++;
    } else if (line.startsWith(' ') || line === '') {
      currentHunk.lines.push({
        type: 'context',
        content: line.startsWith(' ') ? line.slice(1) : line,
        oldNum: oldLine,
        newNum: newLine,
      });
      oldLine++;
      newLine++;
    }
  }

  return hunks;
}

//endregion

//region Side-by-Side Builder

function buildSideBySide(hunks) {
  const rows = [];

  for (const hunk of hunks) {
    rows.push({ type: 'hunk', header: hunk.header });

    const lines = hunk.lines;
    let i = 0;

    while (i < lines.length) {
      const line = lines[i];

      if (line.type === 'context') {
        rows.push({
          type: 'context',
          leftNum: line.oldNum,
          leftContent: line.content,
          rightNum: line.newNum,
          rightContent: line.content,
        });
        i++;
      } else if (line.type === 'removed') {
        const removed = [];
        while (i < lines.length && lines[i].type === 'removed') {
          removed.push(lines[i]);
          i++;
        }
        const added = [];
        while (i < lines.length && lines[i].type === 'added') {
          added.push(lines[i]);
          i++;
        }
        const maxLen = Math.max(removed.length, added.length);
        for (let j = 0; j < maxLen; j++) {
          const rem = removed[j];
          const add = added[j];
          if (rem && add) {
            rows.push({
              type: 'modified',
              leftNum: rem.oldNum,
              leftContent: rem.content,
              rightNum: add.newNum,
              rightContent: add.content,
            });
          } else if (rem) {
            rows.push({
              type: 'removed',
              leftNum: rem.oldNum,
              leftContent: rem.content,
              rightNum: null,
              rightContent: null,
            });
          } else if (add) {
            rows.push({
              type: 'added',
              leftNum: null,
              leftContent: null,
              rightNum: add.newNum,
              rightContent: add.content,
            });
          }
        }
      } else if (line.type === 'added') {
        rows.push({
          type: 'added',
          leftNum: null,
          leftContent: null,
          rightNum: line.newNum,
          rightContent: line.content,
        });
        i++;
      }
    }
  }

  return rows;
}

//endregion

//region HTML Utilities

function escapeHtml(text) {
  if (!text) return '';
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

//endregion

//region Diff Renderer

function renderDiff(diffText) {
  if (!diffText || !diffText.trim()) {
    return '<div class="diff-loading">No changes</div>';
  }

  const hunks = parseDiff(diffText);
  if (hunks.length === 0) {
    return '<div class="diff-loading">No changes</div>';
  }

  const rows = buildSideBySide(hunks);
  let html = '<div class="diff-container"><table class="diff-table">';

  for (const row of rows) {
    if (row.type === 'hunk') {
      html += `<tr class="diff-hunk-header"><td colspan="4">${escapeHtml(row.header)}</td></tr>`;
      continue;
    }

    const leftNum = row.leftNum != null ? row.leftNum : '';
    const rightNum = row.rightNum != null ? row.rightNum : '';
    const leftContent = row.leftContent != null ? escapeHtml(row.leftContent) : '';
    const rightContent = row.rightContent != null ? escapeHtml(row.rightContent) : '';
    const leftEmpty = row.leftContent == null ? ' diff-empty-cell' : '';
    const rightEmpty = row.rightContent == null ? ' diff-empty-cell' : '';

    html += `<tr class="diff-row ${row.type}">`;
    html += `<td class="diff-line-num diff-side-left${leftEmpty}">${leftNum}</td>`;
    html += `<td class="diff-line-content diff-side-left${leftEmpty}">${leftContent}</td>`;
    html += `<td class="diff-line-num diff-side-right${rightEmpty}">${rightNum}</td>`;
    html += `<td class="diff-line-content diff-side-right${rightEmpty}">${rightContent}</td>`;
    html += `</tr>`;
  }

  html += '</table></div>';
  return html;
}

//endregion
