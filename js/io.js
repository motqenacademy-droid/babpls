/*
 * BabPls file I/O without libraries: read .xlsx (first worksheet) and SPSS .sav (uncompressed or bytecode-
 * compressed), write .xlsx workbooks. Readers return CSV text so the rest of the app keeps one data format.
 */
(function (root) {
  'use strict';

  // ------------------------------------------------------------------ zip
  async function inflateRaw(bytes) {
    if (typeof DecompressionStream === 'undefined') throw new Error('xlsx_unsupported');
    const ds = new DecompressionStream('deflate-raw'), w = ds.writable.getWriter();
    w.write(bytes); w.close();
    return new Uint8Array(await new Response(ds.readable).arrayBuffer());
  }
  async function unzip(buf) {
    const u8 = new Uint8Array(buf), dv = new DataView(buf), files = {};
    let eocd = -1; for (let i = u8.length - 22; i >= Math.max(0, u8.length - 65557); i--) if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
    if (eocd < 0) throw new Error('xlsx_bad');
    const count = dv.getUint16(eocd + 10, true); let off = dv.getUint32(eocd + 16, true);
    const dec = new TextDecoder('utf-8');
    for (let e = 0; e < count; e++) {
      if (dv.getUint32(off, true) !== 0x02014b50) throw new Error('xlsx_bad');
      const method = dv.getUint16(off + 10, true), csize = dv.getUint32(off + 20, true), nlen = dv.getUint16(off + 28, true), xlen = dv.getUint16(off + 30, true), clen = dv.getUint16(off + 32, true), lho = dv.getUint32(off + 42, true);
      const name = dec.decode(u8.subarray(off + 46, off + 46 + nlen));
      const ds = lho + 30 + dv.getUint16(lho + 26, true) + dv.getUint16(lho + 28, true), data = u8.subarray(ds, ds + csize);
      files[name] = { method, data };
      off += 46 + nlen + xlen + clen;
    }
    return {
      names: Object.keys(files),
      text: async n => { const f = files[n]; if (!f) return null; const raw = f.method === 0 ? f.data : await inflateRaw(f.data); return dec.decode(raw); }
    };
  }
  const unesc = s => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(+d)).replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16))).replace(/&amp;/g, '&');
  const csvCell = v => { const s = v === null || v === undefined ? '' : String(v); return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  const colIndex = ref => { let c = 0; for (const ch of ref.replace(/\d+$/, '')) c = c * 26 + ch.charCodeAt(0) - 64; return c - 1; };

  // ------------------------------------------------------------------ xlsx → csv
  async function xlsxToCSV(buf) {
    const z = await unzip(buf);
    const wb = await z.text('xl/workbook.xml'); if (!wb) throw new Error('xlsx_bad');
    const rels = (await z.text('xl/_rels/workbook.xml.rels')) || '';
    const first = wb.match(/<sheet\b[^>]*\br:id="([^"]+)"/) || wb.match(/<sheet\b[^>]*\bid="([^"]+)"/);
    let path = 'xl/worksheets/sheet1.xml';
    if (first) { const rel = rels.match(new RegExp('<Relationship\\b[^>]*Id="' + first[1] + '"[^>]*Target="([^"]+)"')) || rels.match(new RegExp('<Relationship\\b[^>]*Target="([^"]+)"[^>]*Id="' + first[1] + '"')); if (rel) path = rel[1].startsWith('/') ? rel[1].slice(1) : 'xl/' + rel[1].replace(/^\.\//, ''); }
    const shared = [];
    const ss = await z.text('xl/sharedStrings.xml');
    if (ss) for (const m of ss.matchAll(/<si>([\s\S]*?)<\/si>/g)) shared.push(unesc(Array.from(m[1].matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)).map(x => x[1]).join('')));
    const sheet = await z.text(path); if (!sheet) throw new Error('xlsx_bad');
    const rows = [];
    for (const rm of sheet.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>|<row\b[^>]*\/>/g)) {
      const row = [];
      if (rm[1]) for (const cm of rm[1].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
        const attr = cm[1], body = cm[2] || '', ref = (attr.match(/\br="([A-Z]+\d+)"/) || [])[1], type = (attr.match(/\bt="([^"]+)"/) || [])[1];
        const v = (body.match(/<v>([\s\S]*?)<\/v>/) || [])[1];
        let val = '';
        if (type === 's') val = shared[+v] || '';
        else if (type === 'inlineStr') val = unesc(Array.from(body.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)).map(x => x[1]).join(''));
        else if (type === 'b') val = v === '1' ? '1' : '0';
        else if (type === 'e') val = '';
        else val = v !== undefined ? unesc(v) : '';
        row[ref ? colIndex(ref) : row.length] = val;
      }
      rows.push(row);
    }
    while (rows.length && rows[rows.length - 1].every(v => v === undefined || v === '')) rows.pop();
    if (rows.length < 2) throw new Error('csv_empty');
    const width = Math.max(...rows.map(r => r.length));
    return rows.map(r => Array.from({ length: width }, (_, i) => csvCell(r[i] === undefined ? '' : r[i])).join(',')).join('\n');
  }

  // ------------------------------------------------------------------ SPSS .sav → csv
  function savToCSV(buf) {
    const dv = new DataView(buf), u8 = new Uint8Array(buf);
    const magic = String.fromCharCode(...u8.subarray(0, 4));
    if (magic === '$FL3') throw new Error('sav_zsav');
    if (magic !== '$FL2') throw new Error('sav_bad');
    let le = true; { const lc = dv.getInt32(64, true); if (lc !== 2 && lc !== 3) le = false; }
    const i32 = o => dv.getInt32(o, le), f64 = o => dv.getFloat64(o, le);
    const compression = i32(72), bias = f64(84);
    let enc = 'windows-1252';
    let off = 176;
    const vars = []; // slot-level records
    const labelSets = [];
    let longNames = null;
    const raw8 = o => u8.subarray(o, o + 8);
    while (true) {
      const rt = i32(off); off += 4;
      if (rt === 2) {
        const type = i32(off), hasLabel = i32(off + 4), nMiss = i32(off + 8), name = u8.subarray(off + 20, off + 28); off += 28;
        let label = null; if (hasLabel) { const len = i32(off); off += 4; label = u8.subarray(off, off + len); off += Math.ceil(len / 4) * 4; }
        const miss = []; for (let i = 0; i < Math.abs(nMiss); i++) { miss.push(f64(off)); off += 8; }
        vars.push({ type, name, label, nMiss, miss });
      } else if (rt === 3) {
        const cnt = i32(off); off += 4; const labs = [];
        for (let i = 0; i < cnt; i++) { const val = raw8(off), v = f64(off); off += 8; const len = u8[off]; const txt = u8.subarray(off + 1, off + 1 + len); off += Math.ceil((len + 1) / 8) * 8; labs.push({ val, v, txt }); }
        if (i32(off) !== 4) throw new Error('sav_bad'); off += 4;
        const nv = i32(off); off += 4; const idx = []; for (let i = 0; i < nv; i++) { idx.push(i32(off) - 1); off += 4; }
        labelSets.push({ labs, idx });
      } else if (rt === 6) { const n = i32(off); off += 4 + n * 80; }
      else if (rt === 7) {
        const sub = i32(off), size = i32(off + 4), count = i32(off + 8); off += 12;
        const data = u8.subarray(off, off + size * count); off += size * count;
        if (sub === 20) enc = new TextDecoder('ascii').decode(data).trim().toLowerCase() || enc;
        if (sub === 13) longNames = data;
      } else if (rt === 999) { off += 4; break; }
      else throw new Error('sav_bad');
    }
    let dec; try { dec = new TextDecoder(enc === 'utf8' ? 'utf-8' : enc); } catch (e) { dec = new TextDecoder('utf-8'); }
    const str = b => dec.decode(b).replace(/[\s\u0000]+$/, '');
    // variables = slots that are not string continuations
    const real = []; vars.forEach((v, slot) => { if (v.type !== -1) real.push({ slot, width: v.type, nslots: v.type > 0 ? Math.ceil(v.type / 8) : 1, short: str(v.name), name: str(v.name), miss: v.nMiss > 0 ? v.miss : [], range: v.nMiss < 0 ? v.miss : null, labels: null }); });
    if (longNames) str(longNames).split('\t').forEach(pair => { const [s, l] = pair.split('='); const r = real.find(x => x.short === s); if (r && l) r.name = l; });
    labelSets.forEach(ls => ls.idx.forEach(slot => { const r = real.find(x => x.slot === slot); if (r && r.width === 0) { r.labels = new Map(); ls.labs.forEach(l => r.labels.set(l.v, str(l.txt))); } }));
    const slots = vars.length, SYSMIS = -Number.MAX_VALUE;
    const rows = [];
    let p = off, cmd = [], ci = 8;
    const readSlot = () => { // returns {num} or {bytes} or null at end
      if (compression === 0) { if (p + 8 > u8.length) return null; const o = p; p += 8; return { o }; }
      while (true) {
        if (ci >= 8) { if (p + 8 > u8.length) return null; cmd = u8.subarray(p, p + 8); p += 8; ci = 0; }
        const c = cmd[ci++];
        if (c === 0) continue;
        if (c === 252) return null;
        if (c === 253) { const o = p; p += 8; return { o }; }
        if (c === 254) return { spaces: true };
        if (c === 255) return { num: NaN };
        return { num: c - bias };
      }
    };
    outer: while (true) {
      const vals = new Array(slots);
      for (let s = 0; s < slots; s++) { const r = readSlot(); if (!r) { if (s === 0) break outer; throw new Error('sav_bad'); } vals[s] = r; }
      rows.push(real.map(v => {
        if (v.width === 0) {
          const r = vals[v.slot]; let x = r.o !== undefined ? f64(r.o) : r.num;
          if (r.spaces || x === SYSMIS || v.miss.includes(x) || (v.range && x >= v.range[0] && x <= v.range[1]) || (v.range && v.range.length === 3 && x === v.range[2])) return '';
          return v.labels && v.labels.has(x) && opts_labels ? v.labels.get(x) : String(x);
        }
        const parts = []; for (let s = 0; s < v.nslots; s++) { const r = vals[v.slot + s]; parts.push(r.o !== undefined ? u8.subarray(r.o, r.o + 8) : new Uint8Array(8).fill(32)); }
        const all = new Uint8Array(parts.length * 8); parts.forEach((b, i) => all.set(b, i * 8));
        return str(all.subarray(0, v.width));
      }));
    }
    const head = real.map(v => csvCell(v.name)).join(',');
    return head + '\n' + rows.map(r => r.map(csvCell).join(',')).join('\n');
  }
  let opts_labels = false; // numeric codes are kept as numbers (analysable); labels are not substituted

  // ------------------------------------------------------------------ xlsx writer
  let CRC = null;
  function crc32(u8) {
    if (!CRC) { CRC = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; CRC[n] = c >>> 0; } }
    let c = 0xffffffff; for (let i = 0; i < u8.length; i++) c = CRC[(c ^ u8[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0;
  }
  function zipStore(entries) { // [{name, data:Uint8Array}] → Uint8Array (no compression)
    const enc = new TextEncoder(), parts = [], central = []; let off = 0;
    entries.forEach(e => {
      const nb = enc.encode(e.name), crc = crc32(e.data), h = new DataView(new ArrayBuffer(30));
      h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, 0x0800, true); h.setUint16(8, 0, true);
      h.setUint32(14, crc, true); h.setUint32(18, e.data.length, true); h.setUint32(22, e.data.length, true); h.setUint16(26, nb.length, true);
      parts.push(new Uint8Array(h.buffer), nb, e.data);
      const c = new DataView(new ArrayBuffer(46));
      c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x0800, true);
      c.setUint32(16, crc, true); c.setUint32(20, e.data.length, true); c.setUint32(24, e.data.length, true); c.setUint16(28, nb.length, true); c.setUint32(42, off, true);
      central.push(new Uint8Array(c.buffer), nb);
      off += 30 + nb.length + e.data.length;
    });
    const csize = central.reduce((s, b) => s + b.length, 0), end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054b50, true); end.setUint16(8, entries.length, true); end.setUint16(10, entries.length, true); end.setUint32(12, csize, true); end.setUint32(16, off, true);
    const all = parts.concat(central, [new Uint8Array(end.buffer)]), out = new Uint8Array(all.reduce((s, b) => s + b.length, 0));
    let p = 0; all.forEach(b => { out.set(b, p); p += b.length; }); return out;
  }
  const x = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '');
  const colName = i => { let s = ''; i++; while (i > 0) { const m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); } return s; };
  // sheets: [{ name, rows: [[cell...]...] }]; first row is bold. Numbers stay numeric.
  // sheets: [{ name, rows }] with plain values (first row = bold shaded header, decimals as 0.000) or, with styled: true,
  // cells { v, s } where s = { b, i, fill, fmt (Excel number format code), bt / bb (top / bottom border: 1 thin, 2 medium),
  // al ('center' | 'right') } and freeze = number of rows kept visible at the top (0: none)
  function writeXLSX(sheets, rtl) {
    const enc = new TextEncoder(), used = new Set();
    const safe = sheets.map((s, i) => { let n = String(s.name || 'Sheet' + (i + 1)).replace(/[\[\]:*?/\\]/g, ' ').slice(0, 31).trim() || 'Sheet' + (i + 1); let base = n.slice(0, 28), k = 2; while (used.has(n.toLowerCase())) n = base + ' ' + k++; used.add(n.toLowerCase()); return n; });
    // style registry: cellXfs 0 = normal, 1 = legacy header, 2 = legacy 0.000; styled cells add their own combinations
    const fmts = [], fonts = ['', 'b'], borders = ['0|0'], xfs = ['n', 'h', 'f'], xfIndex = { n: 0, h: 1, f: 2 };
    const idx = (arr, k) => { let i = arr.indexOf(k); if (i < 0) { arr.push(k); i = arr.length - 1; } return i; };
    const styleOf = st => {
      if (!st) return 0;
      const font = idx(fonts, (st.b ? 'b' : '') + (st.i ? 'i' : '')), border = idx(borders, (st.bt || 0) + '|' + (st.bb || 0));
      const fmt = st.fmt ? 164 + 1 + idx(fmts, st.fmt) : 0, key = [font, st.fill ? 2 : 0, border, fmt, st.al || ''].join(',');
      if (!(key in xfIndex)) { xfIndex[key] = xfs.length; xfs.push(key); }
      return xfIndex[key];
    };
    const files = [];
    files.push({ name: '[Content_Types].xml', text: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>` });
    files.push({ name: '_rels/.rels', text: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>' });
    files.push({ name: 'xl/workbook.xml', text: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${safe.map((n, i) => `<sheet name="${x(n)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets></workbook>` });
    files.push({ name: 'xl/_rels/workbook.xml.rels', text: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>` });
    sheets.forEach((s, i) => {
      const width = Math.max(1, ...s.rows.map(r => r.length));
      const val = c => (s.styled && c && typeof c === 'object' ? c.v : c);
      const cols = Array.from({ length: width }, (_, c) => Math.min(60, Math.max(8, ...s.rows.map(r => (r.length > 1 || !s.styled ? String(val(r[c]) === undefined || val(r[c]) === null ? '' : val(r[c])).length + 2 : 8)))));
      const body = s.rows.map((r, ri) => `<row r="${ri + 1}">${r.map((c, ci) => {
        const ref = colName(ci) + (ri + 1), v = val(c);
        let st;
        if (s.styled) { st = c && typeof c === 'object' ? styleOf(c.s) : 0; if (v === null || v === undefined || v === '') return st ? `<c r="${ref}" s="${st}"/>` : ''; }
        else { if (v === null || v === undefined || v === '') return ''; st = ri === 0 ? 1 : (typeof v === 'number' && !Number.isInteger(v) ? 2 : 0); }
        if (typeof v === 'number' && isFinite(v)) return `<c r="${ref}"${st ? ` s="${st}"` : ''}><v>${v}</v></c>`;
        return `<c r="${ref}" t="inlineStr"${st ? ` s="${st}"` : ''}><is><t xml:space="preserve">${x(v)}</t></is></c>`;
      }).join('')}</row>`).join('');
      const fr = s.styled ? (s.freeze || 0) : 1;
      const pane = fr ? `<pane ySplit="${fr}" topLeftCell="A${fr + 1}" activePane="bottomLeft" state="frozen"/>` : '';
      files.push({ name: `xl/worksheets/sheet${i + 1}.xml`, text: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"${rtl ? ' rightToLeft="1"' : ''}${s.styled ? ' showGridLines="0"' : ''}>${pane}</sheetView></sheetViews><cols>${cols.map((w, c) => `<col min="${c + 1}" max="${c + 1}" width="${w}" customWidth="1"/>`).join('')}</cols><sheetData>${body}</sheetData></worksheet>` });
    });
    const fontXML = f => `<font>${f.includes('b') ? '<b/>' : ''}${f.includes('i') ? '<i/>' : ''}<sz val="11"/><name val="Calibri"/></font>`;
    const side = (tag, w) => (+w ? `<${tag} style="${+w > 1 ? 'medium' : 'thin'}"><color rgb="FF000000"/></${tag}>` : `<${tag}/>`);
    const borderXML = b => { const [t, bo] = b.split('|'); return `<border><left/><right/>${side('top', t)}${side('bottom', bo)}<diagonal/></border>`; };
    const xfXML = k => {
      if (k === 'n') return '<xf xfId="0"/>';
      if (k === 'h') return '<xf xfId="0" fontId="1" fillId="2" applyFont="1" applyFill="1"/>';
      if (k === 'f') return '<xf xfId="0" numFmtId="164" applyNumberFormat="1"/>';
      const [font, fill, border, fmt, al] = k.split(',');
      return `<xf xfId="0" fontId="${font}" fillId="${fill}" borderId="${border}" numFmtId="${fmt}" applyFont="1" applyFill="1" applyBorder="1" applyNumberFormat="1"${al ? ` applyAlignment="1"><alignment horizontal="${al}"/></xf>` : '/>'}`;
    };
    const numFmts = ['0.000'].concat(fmts);
    files.push({ name: 'xl/styles.xml', text: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="${numFmts.length}">${numFmts.map((f, i) => `<numFmt numFmtId="${164 + i}" formatCode="${x(f)}"/>`).join('')}</numFmts><fonts count="${fonts.length}">${fonts.map(fontXML).join('')}</fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFE8EEF8"/></patternFill></fill></fills><borders count="${borders.length}">${borders.map(borderXML).join('')}</borders><cellStyleXfs count="1"><xf/></cellStyleXfs><cellXfs count="${xfs.length}">${xfs.map(xfXML).join('')}</cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>` });
    // classic part order: package files, styles, then the sheets
    const order = ['[Content_Types].xml', '_rels/.rels', 'xl/workbook.xml', 'xl/_rels/workbook.xml.rels', 'xl/styles.xml'];
    files.sort((a, b) => ((order.indexOf(a.name) + 1 || 99) - (order.indexOf(b.name) + 1 || 99)));
    return zipStore(files.map(f => ({ name: f.name, data: enc.encode(f.text) })));
  }

  const api = { xlsxToCSV, savToCSV, writeXLSX, unzip, crc32 };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.YPIO = api;
})(typeof self !== 'undefined' ? self : this);
