// Anki-style CSV export: front = word + transcription, back = translation + example.

const CsvExport = (() => {
  function field(v) {
    let s = String(v == null ? '' : v);
    // neutralise CSV/formula injection: Excel/Sheets treat a leading
    // =, +, -, or @ as the start of a formula when a CSV is opened
    if (/^[=+\-@]/.test(s)) s = "'" + s;
    if (/[",\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
    return s;
  }

  function buildCsv(entries) {
    const rows = entries.map(e => {
      const front = e.transcription ? `${e.word} [${e.transcription}]` : e.word;
      const back = e.example ? `${e.translation} — ${e.example}` : e.translation;
      return `${field(front)},${field(back)}`;
    });
    return rows.join('\r\n');
  }

  function download(unitNum, entries) {
    const csv = buildCsv(entries);
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `unit${pad2(unitNum)}-anki.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  return { download };
})();
