/**
 * RFC 4180 CSV parser. Quoted fields may contain commas, quotes, and newlines.
 * A doubled quote inside a quoted field is one quote character.
 */

function parseCsv(text) {
  const input = String(text || '').replace(/^\uFEFF/, '');
  if (!input.trim()) return { ok: false, error: 'The file is empty', headers: [], rows: [] };

  const records = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  let rowNumber = 1;

  for (let i = 0; i < input.length; i += 1) {
    const char = input[i];
    const next = input[i + 1];
    if (inQuotes) {
      if (char === '"' && next === '"') {
        field += '"';
        i += 1;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        field += char;
        if (char === '\n') rowNumber += 1;
      }
      continue;
    }
    if (char === '"') {
      inQuotes = true;
      continue;
    }
    if (char === ',') {
      row.push(field);
      field = '';
      continue;
    }
    if (char === '\n' || (char === '\r' && next === '\n')) {
      if (char === '\r') i += 1;
      row.push(field);
      records.push({ rowNumber, cells: row });
      row = [];
      field = '';
      rowNumber += 1;
      continue;
    }
    if (char !== '\r') field += char;
  }
  if (inQuotes) return { ok: false, error: 'A quoted field was not closed', headers: [], rows: [] };
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    records.push({ rowNumber, cells: row });
  }

  const headerRecord = records.find((record) => record.cells.some((cell) => String(cell).trim()));
  if (!headerRecord) return { ok: false, error: 'The file has no header row', headers: [], rows: [] };
  const headers = headerRecord.cells.map((cell) => String(cell).trim().toLowerCase());
  const width = headers.length;
  const rows = [];
  const errors = [];
  records.slice(records.indexOf(headerRecord) + 1).forEach((record) => {
    if (record.cells.every((cell) => String(cell).trim() === '')) return;
    if (record.cells.length !== width) {
      errors.push({ row: record.rowNumber, error: `Expected ${width} columns and found ${record.cells.length}` });
      return;
    }
    const value = {};
    headers.forEach((header, index) => {
      if (header) value[header] = String(record.cells[index] ?? '').trim();
    });
    rows.push({ row: record.rowNumber, value });
  });
  return { ok: true, headers, rows, errors };
}

function leadFromCsvRow(value) {
  const pick = (...keys) => {
    for (const key of keys) {
      if (value[key]) return value[key];
    }
    return '';
  };
  return {
    name: pick('name', 'full name', 'fullname'),
    phone: pick('phone', 'mobile', 'phone number'),
    email: pick('email', 'e-mail'),
    inquiry: pick('inquiry', 'message', 'query', 'requirement'),
    source: pick('source', 'campaign') || 'CSV Import',
    project_id: pick('project_id', 'projectid'),
  };
}

module.exports = { parseCsv, leadFromCsvRow };
