/* report.js — pagina Report: 5 schede, periodo libero (da data a data) e confronto personalizzabile.
   Riusa i calcoli di db.js (txConfirmed, txSplits, getGruppoSpesa, isInvestReturning, calcSaldoConto) senza modificarli. */

// I saldi dei conti (calcSaldoConto) dipendono dall'anno attivo: lo si imposta solo per il tempo del calcolo
function withAnno(y, fn) { const s = annoAttivo; annoAttivo = y; try { return fn(); } finally { annoAttivo = s; } }
const esc = s => String(s).replace(/[&<>"]/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'}[c]));

/* ═════════ PERIODI (da data a data) ═════════ */
const iso = (y, m, d) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
const lastDay = (y, m) => new Date(y, m, 0).getDate();
const addM = (y, m, dm) => { const d = new Date(y, m - 1 + dm, 1); return [d.getFullYear(), d.getMonth() + 1]; };
const addDays = (s, n) => { const d = new Date(s + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const days = P => Math.round((Date.parse(P.b + 'T00:00:00Z') - Date.parse(P.a + 'T00:00:00Z')) / 864e5) + 1;
const shiftYear = (s, dy) => { const y = +s.slice(0, 4) + dy, m = +s.slice(5, 7), d = +s.slice(8, 10); return iso(y, m, Math.min(d, lastDay(y, m))); };
const fd = s => s.slice(8, 10) + '/' + s.slice(5, 7) + '/' + s.slice(0, 4);
const NOW = new Date();
// Punto di riferimento ("oggi"): la data di oggi se l'anno attivo è quello corrente, altrimenti il 31 dicembre dell'anno attivo
const refIso = () => annoAttivo === NOW.getFullYear() ? iso(NOW.getFullYear(), NOW.getMonth() + 1, NOW.getDate()) : iso(annoAttivo, 12, 31);
const earliest = () => { let m = refIso(); Object.values(DB.anni).forEach(a => (a.transazioni || []).forEach(t => { if (t.data && t.data < m) m = t.data; })); return m; };
const PRESETS = {
  mese: ['Mese att.', () => { const r = refIso(); return {a: iso(+r.slice(0, 4), +r.slice(5, 7), 1), b: r}; }],
  '3m': ['3 mesi', () => { const r = refIso(), [y, m] = addM(+r.slice(0, 4), +r.slice(5, 7), -2); return {a: iso(y, m, 1), b: r}; }],
  '6m': ['6 mesi', () => { const r = refIso(), [y, m] = addM(+r.slice(0, 4), +r.slice(5, 7), -5); return {a: iso(y, m, 1), b: r}; }],
  anno: ['Anno att.', () => ({a: iso(annoAttivo, 1, 1), b: refIso()})],
  annoprec: ['Anno prec.', () => ({a: iso(annoAttivo - 1, 1, 1), b: iso(annoAttivo - 1, 12, 31)})],
  tutto: ['Tutto', () => ({a: earliest(), b: refIso()})]
};
const UI_KEY = 'finanze_report_ui';   // solo scheda, scorciatoia e modo di confronto: non entra nel DB né nell'export
let S = {pre: 'anno', P: null, cmp: 'ap', Cc: null, tab: 'panoramica', metric: 'out', all: {SPESE: false, REDDITO: false}, yearRef: null};
function loadUI() {
  try {
    const j = JSON.parse(localStorage.getItem(UI_KEY) || 'null'); if (!j) return;
    if (TABS.some(t => t[0] === j.tab)) S.tab = j.tab;
    if (PRESETS[j.pre]) S.pre = j.pre;                 // "personalizzato" non si ricorda: si riparte da Anno att.
    if (['ap', 'prec', 'custom'].includes(j.cmp)) S.cmp = j.cmp;
  } catch (e) {}
}
const save = () => { try { localStorage.setItem(UI_KEY, JSON.stringify({tab: S.tab, pre: S.pre, cmp: S.cmp})); } catch (e) {} };
const cmpPeriodBase = () => ({a: shiftYear(S.P.a, -1), b: shiftYear(S.P.b, -1)});
const cmpPeriod = () => {
  if (S.cmp === 'ap') return cmpPeriodBase();
  if (S.cmp === 'prec') { const n = days(S.P), b = addDays(S.P.a, -1); return {a: addDays(b, -(n - 1)), b}; }
  if (!S.Cc) S.Cc = cmpPeriodBase();
  return S.Cc;
};
const monthName = (y, m) => MESI[m - 1] + ' ' + y;
const lbl = P => {   // etichetta leggibile: mesi interi se possibile, altrimenti date
  const ya = +P.a.slice(0, 4), ma = +P.a.slice(5, 7), yb = +P.b.slice(0, 4), mb = +P.b.slice(5, 7);
  if (P.a.slice(8) === '01' && +P.b.slice(8) === lastDay(yb, mb)) {
    if (ya === yb && ma === mb) return monthName(ya, ma);
    if (ya === yb && ma === 1 && mb === 12) return 'Anno ' + ya;
    return ya === yb ? `${MESI_SHORT[ma - 1]}–${MESI_SHORT[mb - 1]} ${ya}` : `${MESI_SHORT[ma - 1]} ${ya} – ${MESI_SHORT[mb - 1]} ${yb}`;
  }
  return fd(P.a) + ' – ' + fd(P.b);
};

/* ═════════ AGGREGAZIONI SULLE TRANSAZIONI CONFERMATE (GIROCONTO escluso) ═════════ */
function txIn(P, tipo) {
  const out = [];
  for (let y = +P.a.slice(0, 4); y <= +P.b.slice(0, 4); y++) {
    const d = DB.anni[y]; if (!d) continue;
    (d.transazioni || []).forEach(t => { if (txConfirmed(t) && t.data && t.data >= P.a && t.data <= P.b && t.tipo !== 'GIROCONTO' && (!tipo || t.tipo === tipo)) out.push(t); });
  }
  return out;
}
function aggr(P) {
  const r = {in: 0, out: 0, debt: 0, inv: 0};
  txIn(P).forEach(t => { if (t.tipo === 'REDDITO') r.in += t.importo; else if (t.tipo === 'SPESE') r.out += t.importo; else if (t.tipo === 'DEBITI') r.debt += t.importo; else if (t.tipo === 'INVESTIMENTI' && !isInvestReturning(t)) r.inv += t.importo; });
  return r;
}
function catTotals(P, tipo = 'SPESE') { const o = {}; txIn(P, tipo).forEach(t => txSplits(t).forEach(s => { o[s.categoria] = (o[s.categoria] || 0) + s.importo; })); return o; }
function grpTotals(P) { const o = {}; txIn(P, 'SPESE').forEach(t => txSplits(t).forEach(s => { const g = getGruppoSpesa(s.categoria); o[g] = (o[g] || 0) + s.importo; })); return o; }
const keyOf = t => +t.data.slice(0, 4) * 100 + +t.data.slice(5, 7);
function catMonth(P, tipo) { const o = {}; txIn(P, tipo).forEach(t => txSplits(t).forEach(s => { const c = (o[s.categoria] = o[s.categoria] || {}); c[keyOf(t)] = (c[keyOf(t)] || 0) + s.importo; })); return o; }
function monthsOf(P) {   // mesi di calendario toccati dal periodo
  const r = [], ya = +P.a.slice(0, 4), ma = +P.a.slice(5, 7), yb = +P.b.slice(0, 4), mb = +P.b.slice(5, 7), multi = ya !== yb;
  let y = ya, m = ma;
  while (y < yb || (y === yb && m <= mb)) {
    const first = iso(y, m, 1), last = iso(y, m, lastDay(y, m));
    const partial = (y === ya && m === ma && P.a > first) || (y === yb && m === mb && P.b < last);
    r.push({y, m, key: y * 100 + m, partial, lab: MESI_SHORT[m - 1] + (multi ? ' ' + String(y).slice(2) : '') + (partial ? '*' : '')});
    [y, m] = addM(y, m, 1);
  }
  return r;
}
function buckets(P) {   // totali per mese di calendario, nell'ordine di monthsOf
  const ms = monthsOf(P), b = {}; ms.forEach(m => { b[m.key] = {in: 0, out: 0, debt: 0}; });
  txIn(P).forEach(t => { const x = b[keyOf(t)]; if (!x) return; if (t.tipo === 'REDDITO') x.in += t.importo; else if (t.tipo === 'SPESE') x.out += t.importo; else if (t.tipo === 'DEBITI') x.debt += t.importo; });
  return ms.map(m => Object.assign({}, m, b[m.key]));
}
const risp = A => A.in - A.out - A.debt;
const rate = A => A.in > 0 ? risp(A) / A.in : null;

/* ═════════ FORMATTAZIONE E COMPONENTI ═════════ */
const eur = v => (v < 0 ? '−' : '') + '€ ' + Math.round(Math.abs(v)).toLocaleString('it-IT', {useGrouping: 'always'});
const eur2 = v => (v < 0 ? '−' : '') + '€ ' + Math.abs(v).toLocaleString('it-IT', {minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: 'always'});
const pct = (v, d = 0) => (v >= 0 ? '+' : '−') + Math.abs(v * 100).toFixed(d).replace('.', ',') + '%';
const sum = a => a.reduce((x, y) => x + y, 0);
const same = () => days(S.P) === days(cmpPeriod());
let _hasC = null;   // il periodo di confronto contiene transazioni? (calcolato una volta per disegno)
const hasC = () => _hasC === null ? (_hasC = txIn(cmpPeriod()).length > 0) : _hasC;
const NODATA = 'nessun dato nel periodo di confronto';
// variazione % confrontata sulla media giornaliera, così periodi di durata diversa restano confrontabili
const chipD = (cur, prev, good) => {
  if (!prev) return '';
  const rc = cur / days(S.P), rp = prev / days(cmpPeriod()), d = (rc - rp) / Math.abs(rp), up = d >= 0;
  const cls = good === 0 ? 'neu' : ((up ? 1 : -1) * good > 0 ? 'good' : 'bad');
  return `<span class="chip ${cls}">${up ? '▲' : '▼'} ${Math.abs(d * 100).toFixed(0)}%</span>`;
};
const kp = (l, v, cur, prev, good) => `<div class="k"><div class="l">${l}</div><div class="v">${v}</div><div class="d">${chipD(cur, prev, good)}<span>${prev ? 'confronto ' + eur2(prev) : (hasC() ? 'confronto € 0,00' : NODATA)}</span></div></div>`;
const kpRate = (r1, r0) => {
  const v = r1 === null ? '—' : (r1 * 100).toFixed(1).replace('.', ',').replace('-', '−') + '%';
  let chip = '', sub = hasC() ? 'quota delle entrate risparmiata' : NODATA;
  if (r1 !== null && r0 !== null) { const d = (r1 - r0) * 100, up = d >= 0; chip = `<span class="chip ${up ? 'good' : 'bad'}">${up ? '▲' : '▼'} ${Math.abs(d).toFixed(1).replace('.', ',')} pt</span>`; sub = 'confronto ' + (r0 * 100).toFixed(1).replace('.', ',').replace('-', '−') + '%'; }
  return `<div class="k"><div class="l">Savings rate</div><div class="v" style="color:${r1 === null ? 'var(--text2)' : r1 >= 0 ? 'var(--investimenti)' : 'var(--spese)'}">${v}</div><div class="d">${chip}<span>${sub}</span></div></div>`;
};

/* ───── SCHEDE ───── */
/* ───── PANORAMICA ───── */
function vPanoramica() {
  const P = S.P, C = cmpPeriod(), A1 = aggr(P), A0 = aggr(C), r = risp(A1), r0 = risp(A0), ok = hasC();
  const u1 = A1.out + A1.debt, u0 = A0.out + A0.debt;
  const du = u0 ? (u1 / days(P)) / (u0 / days(C)) - 1 : null, de = A0.in ? (A1.in / days(P)) / (A0.in / days(C)) - 1 : null;
  const head = r >= 0 ? `Nel periodo hai risparmiato <span class="pos">${eur(r)}</span>.` : `Nel periodo hai speso <span class="neg">${eur(-r)} in più</span> di quanto hai incassato.`;
  const tail = ok ? ` Rispetto al confronto le uscite sono ${du === null ? 'n.d.' : pct(du)} e le entrate ${de === null ? 'n.d.' : pct(de)}.` : ' Nel periodo di confronto non ci sono dati.';
  const c1 = catTotals(P), c0 = catTotals(C);
  const rows = [...new Set([...Object.keys(c1), ...Object.keys(c0)])].map(n => ({n, d: (c1[n] || 0) - (c0[n] || 0) * days(P) / days(C)}));
  const up = rows.filter(x => x.d > 0).sort((a, b) => b.d - a.d).slice(0, 5), dn = rows.filter(x => x.d < 0).sort((a, b) => a.d - b.d).slice(0, 5);
  const mx = Math.max(...up.map(x => x.d), ...dn.map(x => -x.d), 1);
  const list = (arr, col, sg) => arr.map(x => `<div class="dvr"><span title="${esc(x.n)}">${esc(x.n)}</span><div class="bar"><i style="width:${Math.abs(x.d) / mx * 100}%;background:${col}"></i></div><b style="color:${col}">${sg}${eur(Math.abs(x.d))}</b></div>`).join('') || '<p class="note">Nessuna variazione</p>';
  const change = ok ? `<div class="dv"><div><div class="ttl" style="color:var(--spese)">Spendi di più in</div>${list(up, 'var(--spese)', '+')}</div><div><div class="ttl" style="color:var(--investimenti)">Spendi di meno in</div>${list(dn, 'var(--investimenti)', '−')}</div></div>` : `<p class="note">${NODATA}.</p>`;
  return `<div class="box"><div class="kick">${lbl(P)} · confronto con ${lbl(C)}</div><p class="head3">${head}${tail}</p>${same() ? '' : `<div class="warn">I due periodi hanno durata diversa (${days(P)} e ${days(C)} giorni): le variazioni % e la lista "cosa è cambiato" sono riportate alla stessa durata.</div>`}<p class="note sub">${txIn(P).length} transazioni · ${Object.keys(c1).length} categorie di spesa usate nel periodo</p></div>
  <div class="grid5">${kp('Entrate', eur2(A1.in), A1.in, A0.in, 1)}${kp('Uscite (spese + debiti)', eur2(u1), u1, u0, -1)}${kp('Risparmio', (r >= 0 ? '+' : '−') + eur2(Math.abs(r)), r, r0, 1)}${kpRate(rate(A1), rate(A0))}${kp('Investito', eur2(A1.inv), A1.inv, A0.inv, 0)}</div>
  <div class="grid2" style="margin-bottom:16px">
    <div class="box"><h4>Dalle entrate al risparmio</h4>${waterfall(A1)}<p class="note">Investito nel periodo: <b>${eur(A1.inv)}</b> (non incluso nel risparmio, come nel resto dell'app).</p></div>
    <div class="box"><h4>Cosa è cambiato rispetto al confronto</h4>${change}</div>
  </div>${monthlyBox()}${sankey(A1)}`;
}
function monthlyBox() {
  const bk = buckets(S.P), W = 900, H = 270, Pd = {l: 8, r: 8, t: 28, b: 30}, up = bk.map(b => b.out + b.debt), mx = Math.max(...bk.map(b => b.in), ...up, 1);
  const y = v => Pd.t + (1 - v / mx) * (H - Pd.t - Pd.b), gw = (W - Pd.l - Pd.r) / bk.length, bw = Math.min(gw * .32, 34), base = H - Pd.b;
  let s = `<line x1="${Pd.l}" x2="${W - Pd.r}" y1="${base}" y2="${base}" stroke="var(--border)"/>`;
  bk.forEach((b, i) => {
    const cx = Pd.l + i * gw + gw / 2;
    [[b.in, 'var(--reddito)', cx - bw - 2, 'Entrate'], [up[i], 'var(--spese)', cx + 2, 'Uscite']].forEach(([v, c, x, l]) => {
      if (v <= 0) return;
      s += `<rect x="${x}" y="${y(v)}" width="${bw}" height="${base - y(v)}" rx="6" fill="${c}" opacity=".9"><title>${l} ${MESI[b.m - 1]} ${b.y}: ${eur(v)}</title></rect>`;
      if (bk.length <= 12) s += `<text class="t" x="${x + bw / 2}" y="${y(v) - 6}" text-anchor="middle" font-size="12" font-weight="600">${v >= 1000 ? (v / 1000).toFixed(1).replace('.', ',') + 'k' : Math.round(v)}</text>`;
    });
    s += `<text x="${cx}" y="${H - 8}" text-anchor="middle" font-size="12.5">${b.lab}</text>`;
  });
  if (bk.length >= 3) {   // media mobile a 3 mesi sulle uscite
    const ma = up.map((v, i) => { const sl = up.slice(Math.max(0, i - 2), i + 1); return sum(sl) / sl.length; });
    s += `<polyline points="${ma.map((v, i) => `${Pd.l + i * gw + gw / 2},${y(v)}`).join(' ')}" fill="none" stroke="var(--text2)" stroke-width="1.6" stroke-dasharray="5 4" opacity=".85"><title>Media mobile a 3 mesi delle uscite</title></polyline>`;
  }
  const par = bk.some(b => b.partial) ? 'I mesi con * sono parziali: contano solo i giorni compresi nel periodo.' : '';
  return `<div class="box"><div class="pills" style="margin-bottom:6px"><h4 style="margin:0">Andamento mensile · ${lbl(S.P)}</h4><div class="lg"><span><i style="background:var(--reddito)"></i>Entrate</span><span><i style="background:var(--spese)"></i>Uscite (spese + debiti)</span>${bk.length >= 3 ? '<span><i style="background:none;border-top:2px dashed var(--text2);height:0;border-radius:0"></i>Media 3 mesi</span>' : ''}</div></div>
    <div class="sv"><svg class="wide" viewBox="0 0 ${W} ${H}">${s}</svg></div>${par ? `<p class="note">${par}</p>` : ''}</div>`;
}
function waterfall(A) {
  const W = 560, H = 300, P = {l: 10, r: 10, t: 34, b: 34}, r = risp(A);
  const steps = [{l: 'Entrate', f: 0, t: A.in, c: 'var(--reddito)', v: A.in}, {l: 'Spese', f: A.in, t: A.in - A.out, c: 'var(--spese)', v: -A.out}, {l: 'Debiti', f: A.in - A.out, t: A.in - A.out - A.debt, c: 'var(--debiti)', v: -A.debt}, {l: 'Risparmio', f: 0, t: r, c: r >= 0 ? 'var(--investimenti)' : 'var(--spese)', v: r}];
  const lv = steps.flatMap(s => [s.f, s.t]), mx = Math.max(...lv, 1), mn = Math.min(...lv, 0), rg = mx - mn || 1;
  const y = v => P.t + (mx - v) / rg * (H - P.t - P.b), bw = (W - P.l - P.r) / steps.length, w = bw * .58;
  let s = `<line x1="${P.l}" x2="${W - P.r}" y1="${y(0)}" y2="${y(0)}" stroke="var(--border)"/>`;
  steps.forEach((st, i) => {
    const x = P.l + i * bw + (bw - w) / 2, top = Math.min(y(st.f), y(st.t)), h = Math.max(Math.abs(y(st.f) - y(st.t)), 2);
    s += `<rect x="${x}" y="${top}" width="${w}" height="${h}" rx="8" fill="${st.c}" opacity=".9"><title>${st.l}: ${eur(st.v)}</title></rect><text class="t" x="${x + w / 2}" y="${top - 9}" text-anchor="middle" font-size="14" font-weight="700">${eur(st.v)}</text><text x="${x + w / 2}" y="${H - 10}" text-anchor="middle" font-size="13">${st.l}</text>`;
    if (i < steps.length - 1) s += `<line x1="${x + w}" x2="${P.l + (i + 1) * bw + (bw - w) / 2}" y1="${y(st.t)}" y2="${y(st.t)}" stroke="var(--text2)" stroke-dasharray="3 4" opacity=".6"/>`;
  });
  return `<div class="sv"><svg viewBox="0 0 ${W} ${H}">${s}</svg></div>`;
}
function sankey(A) {
  const W = 980, H = 430, LP = 175, RP = 250, nw = 16, gap = 12, T = 12;
  const gr = Object.entries(grpTotals(S.P)).sort((a, b) => b[1] - a[1]), top = gr.slice(0, 5), rest = sum(gr.slice(5).map(x => x[1]));
  const sinks = top.map(([n, v], i) => ({n, v, c: `var(--g${i + 1})`}));
  if (rest > 0) sinks.push({n: 'Altri gruppi', v: rest, c: 'var(--text2)'});
  if (A.debt > 0) sinks.push({n: 'Debiti', v: A.debt, c: 'var(--debiti)'});
  if (A.inv > 0) sinks.push({n: 'Investimenti', v: A.inv, c: 'var(--investimenti)'});
  const outflow = sum(sinks.map(x => x.v)), rim = Math.max(0, A.in - outflow), cover = Math.max(0, outflow - A.in);
  if (rim > 0) sinks.push({n: 'Rimasto in conto', v: rim, c: 'var(--accent)'});
  const srcs = [{n: 'Entrate', v: A.in, c: 'var(--reddito)'}]; if (cover > 0) srcs.push({n: 'Da saldo e risparmi', v: cover, c: 'var(--oro)'});
  const tot = Math.max(sum(srcs.map(x => x.v)), sum(sinks.map(x => x.v))) || 1;
  if (!sinks.length) return '';
  const sc = (H - T * 2 - gap * (Math.max(srcs.length, sinks.length) - 1)) / tot;
  let yy = T; srcs.forEach(n => { n.y = yy; n.h = n.v * sc; n.o = 0; yy += n.h + gap; });
  yy = T; sinks.forEach(n => { n.y = yy; n.h = n.v * sc; n.o = 0; yy += n.h + gap; });
  const xL = LP, xR = W - RP - nw; let si = 0, srem = srcs[0].v, links = '';
  sinks.forEach(k => {
    let need = k.v;
    while (need > 1e-6 && si < srcs.length) {
      const take = Math.min(need, srem), h = take * sc, s0 = srcs[si], y0 = s0.y + s0.o, y1 = k.y + k.o, mx = (xL + nw + xR) / 2;
      links += `<path d="M${xL + nw},${y0} C${mx},${y0} ${mx},${y1} ${xR},${y1} L${xR},${y1 + h} C${mx},${y1 + h} ${mx},${y0 + h} ${xL + nw},${y0 + h}Z" fill="${k.c}" opacity=".38"><title>${esc(s0.n)} → ${esc(k.n)}: ${eur(take)}</title></path>`;
      s0.o += h; k.o += h; need -= take; srem -= take;
      if (srem <= 1e-6 && si < srcs.length - 1) { si++; srem = srcs[si].v; } else if (srem <= 1e-6) break;
    }
  });
  let nodes = '';
  srcs.forEach(n => { nodes += `<rect x="${xL}" y="${n.y}" width="${nw}" height="${n.h}" rx="5" fill="${n.c}"/><text class="t" x="${xL - 12}" y="${n.y + n.h / 2 - 4}" text-anchor="end" font-size="14" font-weight="700">${n.n}</text><text x="${xL - 12}" y="${n.y + n.h / 2 + 15}" text-anchor="end" font-size="13">${eur(n.v)}</text>`; });
  let prevLy = -99, Hd = H;
  sinks.forEach(n => {
    const cy = n.y + n.h / 2, ly = Math.max(cy, prevLy + 36); prevLy = ly; Hd = Math.max(Hd, ly + 30);
    nodes += `<rect x="${xR}" y="${n.y}" width="${nw}" height="${n.h}" rx="5" fill="${n.c}"/>`;
    if (ly > cy + 2) nodes += `<path d="M${xR + nw},${cy} L${xR + nw + 8},${ly - 4}" stroke="${n.c}" stroke-width="1.5" fill="none"/>`;
    nodes += `<text class="t" x="${xR + nw + 12}" y="${ly - 3}" font-size="14" font-weight="600">${esc(n.n)}</text><text x="${xR + nw + 12}" y="${ly + 14}" font-size="12.5">${eur(n.v)} · ${(n.v / tot * 100).toFixed(1).replace('.', ',')}%</text>`;
  });
  return `<div class="box"><h4>Da dove arrivano i soldi e dove vanno · ${lbl(S.P)}</h4><div class="sv"><svg class="wide" viewBox="0 0 ${W} ${Hd}">${links}${nodes}</svg></div>
  <p class="note">Ogni fascia ha lo spessore proporzionale all'importo. ${cover > 0 ? `Le uscite hanno superato le entrate di <b>${eur(cover)}</b>: quella parte è stata coperta dal saldo.` : `Ti sono rimasti <b>${eur(rim)}</b>.`} Passa il mouse su una fascia per il dettaglio.</p></div>`;
}

/* ───── mappa di calore (categorie × mesi di calendario) ───── */
function heatBox(tipo, col, titolo, totLabel, nota, maxRows, cls) {
  const ms = monthsOf(S.P), cm = catMonth(S.P, tipo);
  const all = Object.entries(cm).map(([n, a]) => [n, a, sum(ms.map(m => a[m.key] || 0))]).sort((a, b) => b[2] - a[2]);
  if (!all.length) return `<div class="box"><h4>${titolo}</h4><p class="note">Nessun dato nel periodo.</p></div>`;
  const showAll = !!S.all[tipo], rows = showAll ? all : all.slice(0, maxRows), hidden = all.length - rows.length;
  const monthTot = ms.map(m => sum(Object.values(cm).map(a => a[m.key] || 0))), mMax = Math.max(...monthTot, 1), nm = days(S.P) / 30.4375;
  const heat = (v, mx) => v > 0 ? `background:color-mix(in srgb,${col} ${(8 + 52 * v / mx).toFixed(0)}%,transparent)` : '';
  let h = `<tr><th>Categoria</th>${ms.map(m => `<th title="${m.partial ? 'mese parziale: solo i giorni del periodo' : MESI[m.m - 1] + ' ' + m.y}">${m.lab}</th>`).join('')}<th>Totale</th><th>Media/mese</th></tr>`;
  rows.forEach(([n, a, t]) => {
    const vs = ms.map(m => a[m.key] || 0), nz = vs.filter(v => v > 0), avg = nz.length ? sum(nz) / nz.length : 0, mx = Math.max(...vs, 1);
    h += `<tr><td>${esc(n)}</td>${vs.map((v, i) => `<td class="${v > 0 ? (nz.length > 2 && v > avg * 1.7 && v > 60 ? 'hi' : '') : 'n'}" style="${heat(v, mx)}" title="${esc(n)} · ${MESI[ms[i].m - 1]} ${ms[i].y}: ${v ? eur(v) : '—'}">${v > 0 ? Math.round(v) : '·'}</td>`).join('')}<td class="tot">${eur(t)}</td><td class="tot" style="color:var(--text2)">${eur(t / nm)}</td></tr>`;
  });
  h += `<tr class="sum"><td>${totLabel}</td>${monthTot.map((v, i) => `<td style="${heat(v, mMax)}" title="${MESI[ms[i].m - 1]} ${ms[i].y}: ${eur(v)}">${Math.round(v)}</td>`).join('')}<td class="tot">${eur(sum(monthTot))}</td><td class="tot" style="color:var(--text2)">${eur(sum(monthTot) / nm)}</td></tr>`;
  const par = ms.some(m => m.partial) ? ' I mesi con * sono parziali: contano solo i giorni compresi nel periodo.' : '';
  const nascoste = hidden > 0 ? ` La riga in fondo comprende anche le ${hidden} categorie non mostrate.` : '';
  const btn = all.length > maxRows ? `<button class="more" data-all="${tipo}">${showAll ? 'Mostra meno categorie' : `Mostra tutte le categorie (${all.length})`}</button>` : '';
  return `<div class="box"><h4>${titolo}</h4><div class="hmw"><table class="hm ${cls}">${h}</table></div>${btn}<p class="note">${nota}${par}${nascoste}</p></div>`;
}

/* ───── SPESE ───── */
function vSpese() {
  const g1 = grpTotals(S.P), g0 = grpTotals(cmpPeriod()), rows = Object.entries(g1).sort((a, b) => b[1] - a[1]), mx = rows[0] ? rows[0][1] : 1, ok = hasC();
  const gl = rows.map(([n, v], i) => `<div class="grp"><span title="${esc(n)}">${esc(n)}</span><div class="bar"><i style="width:${v / mx * 100}%;background:var(--g${i % 7 + 1})"></i></div><b>${eur(v)}</b><span style="text-align:right">${ok ? (chipD(v, g0[n] || 0, -1) || '<span class="chip neu">nuovo</span>') : '<span class="chip neu">—</span>'}</span></div>`).join('');
  return `<div class="box"><h4>Spese per gruppo · ${lbl(S.P)} <span style="text-transform:none;letter-spacing:0;font-weight:500">(variazione rispetto a ${lbl(cmpPeriod())})</span></h4>${gl || '<p class="note">Nessuna spesa nel periodo.</p>'}${ok ? '' : `<p class="note">${NODATA}.</p>`}${same() ? '' : `<div class="warn">Durata diversa (${days(S.P)} e ${days(cmpPeriod())} giorni): le variazioni sono calcolate sulla media giornaliera.</div>`}</div>`
    + heatBox('SPESE', 'var(--spese)', `Spese per categoria e mese · ${lbl(S.P)}`, 'Tutte le spese', 'Più il colore è intenso, più è alta la spesa <b>di quella categoria</b> rispetto al suo mese più alto. Il riquadro rosso segnala un mese molto sopra la media della categoria (oltre 1,7 volte).', 12, '');
}

/* ───── ENTRATE ───── */
function vEntrate() {
  const A1 = aggr(S.P), A0 = aggr(cmpPeriod()), bk = buckets(S.P), best = bk.reduce((m, x) => x.in > m.in ? x : m, {in: -1, lab: '—'}), nm = days(S.P) / 30.4375, nm0 = days(cmpPeriod()) / 30.4375;
  const c = catTotals(S.P, 'REDDITO'), main = Object.entries(c).sort((a, b) => b[1] - a[1])[0];
  return `<div class="grid4">${kp('Entrate nel periodo', eur2(A1.in), A1.in, A0.in, 1)}${kp('Media al mese', eur2(A1.in / nm), A1.in / nm, A0.in / nm0, 1)}
    <div class="k"><div class="l">Mese più ricco</div><div class="v">${best.in > 0 ? eur2(best.in) : '—'}</div><div class="d"><span>${best.in > 0 ? MESI[best.m - 1] + ' ' + best.y : 'nessuna entrata nel periodo'}</span></div></div>
    <div class="k"><div class="l">Voce principale</div><div class="v" style="font-size:clamp(18px,1.9vw,24px);white-space:normal">${main ? esc(main[0]) : '—'}</div><div class="d"><span>${main ? eur(main[1]) + ' · ' + (main[1] / (A1.in || 1) * 100).toFixed(0) + '% delle entrate' : 'nessuna entrata nel periodo'}</span></div></div></div>${same() ? '' : `<div class="warn" style="margin:-4px 0 16px">Durata diversa (${days(S.P)} e ${days(cmpPeriod())} giorni): le variazioni sono calcolate sulla media giornaliera.</div>`}`
    + heatBox('REDDITO', 'var(--reddito)', `Entrate per categoria e mese · ${lbl(S.P)}`, 'Tutte le entrate', 'Stessa lettura delle spese: la riga in fondo mostra quanto è entrato ogni mese, il riquadro evidenziato un mese molto sopra la media di quella voce.', 10, 'in');
}

/* ───── CONTI ───── */
function area(vals, w, h, col, pad = 4) {
  if (vals.length < 2) vals = [vals[0], vals[0]];   // un solo mese: linea piatta
  const mn = Math.min(...vals), mx = Math.max(...vals), rg = mx - mn || 1, n = vals.length;
  const px = i => pad + i * (w - 2 * pad) / (n - 1), py = v => pad + (mx - v) / rg * (h - 2 * pad), pts = vals.map((v, i) => `${px(i)},${py(v)}`).join(' ');
  return `<svg viewBox="0 0 ${w} ${h}"><path d="M${px(0)},${h} L${pts.split(' ').join(' L')} L${px(n - 1)},${h}Z" fill="${col}" opacity=".16"/><polyline points="${pts}" fill="none" stroke="${col}" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round"/><circle cx="${px(n - 1)}" cy="${py(vals[n - 1])}" r="4" fill="${col}"/></svg>`;
}
function vConti() {
  const ms = monthsOf(S.P);
  const ser = getConti().map((c, i) => ({n: c.nome, col: (c.colore && coloreLeggibile(c.colore)) || `var(--g${i % 7 + 1})`, v: ms.map(m => { const s = withAnno(m.y, () => calcSaldoConto(c.nome, m.m)); return s.inserito ?? s.calcolato; })}));
  if (!ser.length) return '<div class="box"><p class="note">Nessun conto configurato.</p></div>';
  const tot = ms.map((_, k) => sum(ser.map(s => s.v[k]))), last = tot[tot.length - 1], d = last - tot[0];
  return `<div class="box"><div class="grid2" style="grid-template-columns:minmax(0,.7fr) minmax(0,1.6fr);align-items:center">
    <div><div class="kick">Patrimonio totale a fine ${ms.length ? MESI[ms[ms.length - 1].m - 1].toLowerCase() : 'periodo'}</div><div style="font:650 clamp(28px,3.4vw,44px) var(--font-head);letter-spacing:-.04em">${eur(last)}</div>${ms.length > 1 ? `<div class="d" style="margin-top:8px;display:flex;gap:8px;align-items:center;flex-wrap:wrap;color:var(--text2)"><span class="chip ${d >= 0 ? 'good' : 'bad'}">${d >= 0 ? '▲' : '▼'} ${eur(Math.abs(d))}</span><span>dalla fine di ${MESI[ms[0].m - 1].toLowerCase()}</span></div>` : ''}</div>
    <div class="sv">${area(tot, 700, 150, 'var(--accent)', 8)}</div></div></div>
  <div class="acc">${ser.map(s => { const l = s.v[s.v.length - 1], dd = l - s.v[0]; return `<div class="k" style="border-top:3px solid ${s.col}"><div class="l">${esc(s.n)}</div><div class="v" style="color:${s.col}">${eur(l)}</div><div class="sv" style="margin:6px 0 10px">${area(s.v, 240, 56, s.col)}</div><div class="d">${ms.length > 1 ? `<span class="chip ${dd >= 0 ? 'good' : 'bad'}">${dd >= 0 ? '▲' : '▼'} ${eur(Math.abs(dd))}</span>` : ''}<span>${(last ? l / last * 100 : 0).toFixed(0)}% del totale</span></div></div>`; }).join('')}</div>
  <p class="note">I saldi sono quelli a fine mese, per i mesi toccati dal periodo. I grafici piccoli sono scalati sul minimo e massimo di ogni conto (non partono da zero): servono a vedere l'andamento, i valori esatti sono nei numeri.</p>`;
}

/* ───── CONFRONTO TRA PERIODI ───── */
const MET = {in: ['Entrate', 1, b => b.in], out: ['Uscite', -1, b => b.out + b.debt], sav: ['Risparmio', 1, b => b.in - b.out - b.debt]};
function vConfronto() {
  const P = S.P, C = cmpPeriod(), bp = buckets(P), bc = buckets(C), n = Math.max(bp.length, bc.length), [nm, good, fn] = MET[S.metric];
  const v1 = Array.from({length: n}, (_, i) => bp[i] ? fn(bp[i]) : null), v0 = Array.from({length: n}, (_, i) => bc[i] ? fn(bc[i]) : null);
  const W = 900, H = 300, Pd = {l: 8, r: 8, t: 26, b: 44}, all = [...v1, ...v0, 0].filter(v => v !== null), mx = Math.max(...all, 1), mn = Math.min(...all, 0), rg = mx - mn || 1;
  const y = v => Pd.t + (mx - v) / rg * (H - Pd.t - Pd.b), gw = (W - Pd.l - Pd.r) / n, bw = Math.min(gw * .32, 34);
  let s = `<line x1="${Pd.l}" x2="${W - Pd.r}" y1="${y(0)}" y2="${y(0)}" stroke="var(--border)"/>`;
  for (let i = 0; i < n; i++) {
    const cx = Pd.l + i * gw + gw / 2;
    [[v0[i], cx - bw - 2, 'var(--text2)', .45, bc[i]], [v1[i], cx + 2, 'var(--accent)', .95, bp[i]]].forEach(([v, x, c, o, m]) => {
      if (v === null) return;
      s += `<rect x="${x}" y="${Math.min(y(v), y(0))}" width="${bw}" height="${Math.max(Math.abs(y(v) - y(0)), 1.5)}" rx="6" fill="${c}" opacity="${o}"><title>${MESI[m.m - 1]} ${m.y}: ${eur(v)}</title></rect>`;
    });
    if (v1[i] !== null) s += `<text class="t" x="${cx + 2 + bw / 2}" y="${Math.min(y(v1[i]), y(0)) - 7}" text-anchor="middle" font-size="12" font-weight="700">${Math.round(v1[i])}</text>`;
    s += `<text class="t" x="${cx}" y="${H - 22}" text-anchor="middle" font-size="12.5">${bp[i] ? bp[i].lab : ''}</text><text x="${cx}" y="${H - 6}" text-anchor="middle" font-size="12">${bc[i] ? 'vs ' + bc[i].lab : ''}</text>`;
  }
  const chipC = d => `<span class="chip ${d === 0 ? 'neu' : ((d > 0 ? 1 : -1) * good > 0 ? 'good' : 'bad')}">${d >= 0 ? '+' : '−'}${eur(Math.abs(d)).replace('−', '')}</span>`;
  const rowsT = Array.from({length: n}, (_, i) => `<tr><td>${bp[i] ? MESI[bp[i].m - 1] + ' ' + bp[i].y : '—'} <span style="color:var(--text2)">vs ${bc[i] ? MESI[bc[i].m - 1] + ' ' + bc[i].y : '—'}</span></td><td>${v0[i] === null ? '—' : eur(v0[i])}</td><td>${v1[i] === null ? '—' : eur(v1[i])}</td><td>${v0[i] !== null && v1[i] !== null ? chipC(v1[i] - v0[i]) : '—'}</td></tr>`).join('');
  const T1 = sum(v1.filter(v => v !== null)), T0 = sum(v0.filter(v => v !== null));
  const partial = [...bp, ...bc].some(m => m.partial);
  return `<div class="box"><div class="pills">${Object.entries(MET).map(([k, [nn]]) => `<button class="pill2${k === S.metric ? ' on' : ''}" data-m="${k}">${nn}</button>`).join('')}<div class="lg"><span><i style="background:var(--text2);opacity:.5"></i>Confronto · ${lbl(C)}</span><span><i style="background:var(--accent)"></i>Periodo · ${lbl(P)}</span></div></div>
    <div class="sv"><svg class="wide" viewBox="0 0 ${W} ${H}">${s}</svg></div>
    <p class="note">I mesi dei due periodi sono affiancati in ordine (il primo mese del periodo con il primo mese del confronto, e così via).${partial ? ' I mesi con * sono parziali: contano solo i giorni compresi nel periodo.' : ''}${hasC() ? '' : ' Nel periodo di confronto non ci sono dati.'}</p></div>
  <div class="box"><h4>${nm} mese per mese</h4><div class="hmw"><table class="cmp"><thead><tr><th>Mesi affiancati</th><th>Confronto</th><th>Periodo</th><th>Differenza</th></tr></thead><tbody>${rowsT}<tr class="tot"><td>Totale</td><td>${eur(T0)}</td><td>${eur(T1)}</td><td>${chipC(T1 - T0)}</td></tr></tbody></table></div>${same() ? '' : `<div class="warn">Durata diversa (${days(P)} e ${days(C)} giorni): la differenza sui totali non è a parità di durata.</div>`}</div>`;
}

/* ═════════ INTERFACCIA ═════════ */
const TABS = [['panoramica', 'Panoramica', 'dashboard', () => vPanoramica()], ['spese', 'Spese', 'banknote', () => vSpese()], ['entrate', 'Entrate', 'briefcase', () => vEntrate()], ['conti', 'Conti', 'landmark', () => vConti()], ['confronto', 'Confronto periodi', 'shuffle', () => vConfronto()]];
function renderView() {
  _hasC = null;
  const v = document.getElementById('view');
  v.innerHTML = TABS.find(t => t[0] === S.tab)[3]();
  v.querySelectorAll('.pill2').forEach(b => b.onclick = () => { S.metric = b.dataset.m; renderView(); });
  v.querySelectorAll('[data-all]').forEach(b => b.onclick = () => { S.all[b.dataset.all] = !S.all[b.dataset.all]; renderView(); });
}
function syncBar() {
  document.querySelectorAll('.vt').forEach(b => { const on = b.dataset.t === S.tab; b.classList.toggle('on', on); b.setAttribute('aria-selected', on); b.tabIndex = on ? 0 : -1; });
  document.getElementById('view').setAttribute('aria-labelledby', 'tab-' + S.tab);
  document.querySelectorAll('.pre').forEach(b => b.classList.toggle('on', b.dataset.p === S.pre));
  document.getElementById('pa').value = S.P.a; document.getElementById('pb').value = S.P.b;
  document.getElementById('cm').value = S.cmp;
  const C = cmpPeriod(), cust = S.cmp === 'custom';
  document.getElementById('cmr').style.display = cust ? 'none' : ''; document.getElementById('cmi').style.display = cust ? '' : 'none';
  document.getElementById('cmr').textContent = fd(C.a) + ' – ' + fd(C.b) + ' (' + days(C) + ' gg)';
  document.getElementById('ca').value = C.a; document.getElementById('cb').value = C.b;
  document.getElementById('dur').textContent = days(S.P) + ' giorni';
}
function setTab(k, focus) { S.tab = k; save(); syncBar(); renderView(); window.scrollTo(0, 0); if (focus) document.getElementById('tab-' + k).focus(); }
function build() {
  const tr = document.getElementById('trow');
  tr.innerHTML = TABS.map(([k, n, ic]) => `<button class="vt" role="tab" id="tab-${k}" data-t="${k}" aria-selected="false" tabindex="-1">${icona(ic, 16)}<span>${n}</span></button>`).join('');
  tr.querySelectorAll('.vt').forEach(b => b.onclick = () => setTab(b.dataset.t));
  tr.onkeydown = e => {   // frecce sulle schede
    const i = TABS.findIndex(t => t[0] === S.tab); let n = null;
    if (e.key === 'ArrowRight') n = (i + 1) % TABS.length; else if (e.key === 'ArrowLeft') n = (i + TABS.length - 1) % TABS.length;
    else if (e.key === 'Home') n = 0; else if (e.key === 'End') n = TABS.length - 1;
    if (n !== null) { e.preventDefault(); setTab(TABS[n][0], true); }
  };
  document.getElementById('prow').innerHTML = `<span class="pl">Periodo</span>${Object.entries(PRESETS).map(([k, [n]]) => `<button class="pre" data-p="${k}">${n}</button>`).join('')}
    <input type="date" id="pa" title="Dal"><span>→</span><input type="date" id="pb" title="Al"><span id="dur"></span><span class="sep"></span>
    <span class="pl">Confronta con</span><select id="cm" title="Periodo di confronto"><option value="ap">Stesso periodo dell'anno scorso</option><option value="prec">Periodo precedente (stessa durata)</option><option value="custom">Personalizzato…</option></select>
    <span class="cmr" id="cmr"></span><span id="cmi" style="display:none"><input type="date" id="ca" title="Dal"> → <input type="date" id="cb" title="Al"></span>`;
  document.querySelectorAll('.pre').forEach(b => b.onclick = () => { S.pre = b.dataset.p; S.P = PRESETS[b.dataset.p][1](); save(); syncBar(); renderView(); });
  const onP = () => { let a = document.getElementById('pa').value, b = document.getElementById('pb').value; if (!a || !b) return; if (a > b) [a, b] = [b, a]; S.P = {a, b}; S.pre = 'custom'; save(); syncBar(); renderView(); };
  document.getElementById('pa').onchange = onP; document.getElementById('pb').onchange = onP;
  document.getElementById('cm').onchange = e => { S.cmp = e.target.value; if (S.cmp === 'custom') S.Cc = cmpPeriodBase(); save(); syncBar(); renderView(); };
  const onC = () => { let a = document.getElementById('ca').value, b = document.getElementById('cb').value; if (!a || !b) return; if (a > b) [a, b] = [b, a]; S.Cc = {a, b}; save(); syncBar(); renderView(); };
  document.getElementById('ca').onchange = onC; document.getElementById('cb').onchange = onC;
}
// Chiamata da switchAnno, deleteTransaction, importazione ecc.: se cambia l'anno attivo il periodo torna a "Anno att."
function renderReport() {
  if (S.yearRef !== annoAttivo) { S.yearRef = annoAttivo; S.pre = 'anno'; S.P = PRESETS.anno[1](); S.Cc = null; }
  syncBar(); renderView();
}
function reportInit() {
  try { localStorage.removeItem('report_dash_layout'); } catch (e) {}
  loadUI(); S.yearRef = annoAttivo; S.P = PRESETS[S.pre][1]();
  build(); syncBar(); renderView();
}
