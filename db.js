// ── COSTANTI ──────────────────────────────────────────────────────
const MESI = ['Gennaio','Febbraio','Marzo','Aprile','Maggio','Giugno',
              'Luglio','Agosto','Settembre','Ottobre','Novembre','Dicembre'];
const MESI_SHORT = ['Gen','Feb','Mar','Apr','Mag','Giu','Lug','Ago','Set','Ott','Nov','Dic'];

// ── DATABASE DEFAULT ───────────────────────────────────────────────
const DEFAULT_DB = {
  global: {
    nome: 'Utente',
    valuta: '€',
    conti: [
      { nome: 'Banca', icona: '🏦', saldoIniziale: {} }
    ],
    categorie: {
      SPESE: {
        Casa: ['Affitto/Mutuo','Elettricità','Gas','Acqua','Telefono/Internet','Pay TV/Musica','Assicurazione casa','Manutenzione','Spese condominiali'],
        Vita: ['Spesa','Cibo','Abbigliamento','Medico','Farmacia','Parrucchiere','Svago','Sport','Regali','Trasporti','Altro'],
        Auto: ['Carburante','Assicurazione auto','Manutenzione auto','Bollo','Parcheggio'],
        Varie: ['Spese Bancarie','Prelievo','Altro']
      },
      REDDITO: { Reddito: ['Stipendio','Pensione','Reddito secondario','Rimborsi','Regali ricevuti','Altro'] },
      DEBITI: { Debiti: ['Rata mutuo','Rata auto','Carta di credito','Prestito','Altro'] },
      INVESTIMENTI: { Investimenti: ['Versamento','Prelievo','Altro investimento'] }
    },
    programmate: [],
    metodi: ['Addebito conto','Bancomat','Carta di Credito','Contanti','Bonifico','Altro'],
    commissioni: { 'Bonifico': 0.12 },
    personalizzazioni: {
      font: "'DM Sans', sans-serif",
      colori: { reddito: '', spese: '', debiti: '', investimenti: '', oro: '' },
      coloriGruppi: {},
      grafico: { tipo: 'barre', filtroTipo: 'totale', filtroValore: '', colore1: '', colore2: '' }
    }
  },
  anni: {}
};

// ── STATO GLOBALE ─────────────────────────────────────────────────
let DB = JSON.parse(JSON.stringify(DEFAULT_DB));
let annoAttivo = 2026;
let selectedMese = 1;
let editingId = null;
let editingProgId = null;
let confirmCb = null;

// ── ACCESSO DATI ───────────────────────────────────────────────────
function annoData() {
  if (!DB.anni[annoAttivo]) DB.anni[annoAttivo] = { transazioni: [], budget: {}, saldiMensili: {} };
  return DB.anni[annoAttivo];
}
function txAnno()          { return annoData().transazioni; }
function budgetAnno()      { return annoData().budget; }
function saldiAnno()       { return annoData().saldiMensili; }
function anniDisponibili() { return Object.keys(DB.anni).map(Number).sort((a,b)=>a-b); }

// ── HELPERS ───────────────────────────────────────────────────────
const fmt = (n, dec=2) => {
  if (n==null||isNaN(n)) return '—';
  return new Intl.NumberFormat('it-IT',{minimumFractionDigits:dec,maximumFractionDigits:dec}).format(n);
};
const fmtEur = n => DB.global.valuta + ' ' + fmt(Math.abs(n));
const uid  = () => 't' + Date.now() + Math.random().toString(36).slice(2,7);
const pidx = () => 'p' + Date.now() + Math.random().toString(36).slice(2,5);

function formatDateIt(iso) {
  if (!iso) return '—';
  const [y,m,d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

function allCategorie(tipo) {
  const c = DB.global.categorie[tipo];
  if (!c) return [];
  return Object.values(c).flat();
}
function categorieFlat() {
  let arr = [];
  for (const tipo of ['SPESE','REDDITO','DEBITI','INVESTIMENTI'])
    arr = arr.concat(allCategorie(tipo).map(c=>({tipo,cat:c})));
  return arr;
}

// Restituisce gli split di una transazione (retrocompatibile: se non ci sono split usa categoria+importo)
function txSplits(t) {
  return (t.splits && t.splits.length > 0) ? t.splits : [{categoria: t.categoria, importo: t.importo}];
}
function getGruppoSpesa(cat) {
  for (const [g, arr] of Object.entries(DB.global.categorie.SPESE||{}))
    if (arr.includes(cat)) return g;
  return 'Varie';
}

// ── CONTI ─────────────────────────────────────────────────────────
function getConti() { return DB.global.conti || []; }

// ── METODI DI PAGAMENTO ───────────────────────────────────────────
function getMetodi() { return DB.global.metodi && DB.global.metodi.length ? DB.global.metodi : ['Bancomat','Carta di Credito','Contanti','Bonifico','Altro']; }
function getCommissioneMetodo(metodo) { return (DB.global.commissioni && DB.global.commissioni[metodo]) || 0; }
function populateMetodoSelect(selId, selectedVal) {
  const sel = document.getElementById(selId);
  if (!sel) return;
  const prev = selectedVal !== undefined ? selectedVal : sel.value;
  sel.innerHTML = '<option value="">— Metodo —</option>';
  getMetodi().forEach(m => { const o = document.createElement('option'); o.value = m; o.textContent = m; sel.appendChild(o); });
  if (prev) sel.value = prev;
}
function getSaldoIniziale(nomeConto) {
  const c = getConti().find(c=>c.nome===nomeConto);
  if (!c) return 0;
  if (typeof c.saldoIniziale === 'object') return c.saldoIniziale[annoAttivo] ?? 0;
  return c.saldoIniziale ?? 0;
}
function setSaldoInizialeAnno(nomeConto, anno, val) {
  const c = getConti().find(c=>c.nome===nomeConto);
  if (!c) return;
  if (typeof c.saldoIniziale !== 'object') c.saldoIniziale = {};
  c.saldoIniziale[anno] = val;
}
function populateContoSelect(selId, selectedVal, withEmpty) {
  const sel = document.getElementById(selId);
  if (!sel) return;
  const prev = selectedVal !== undefined ? selectedVal : sel.value;
  sel.innerHTML = withEmpty ? '<option value="">Tutti i conti</option>' : '';
  getConti().forEach(c=>{
    const o = document.createElement('option');
    o.value = c.nome; o.textContent = c.icona + ' ' + c.nome;
    sel.appendChild(o);
  });
  if (prev) sel.value = prev;
}

// ── CAMBIO ANNO ───────────────────────────────────────────────────
const NAV_KEY = 'finanze_nav';
function saveNavState() {
  try { localStorage.setItem(NAV_KEY, JSON.stringify({annoAttivo, selectedMese})); } catch(e) {}
}

function switchAnno(anno) {
  annoAttivo = parseInt(anno);
  if (!DB.anni[annoAttivo]) DB.anni[annoAttivo] = { transazioni: [], budget: {}, saldiMensili: {} };
  const now = new Date();
  selectedMese = (now.getFullYear()===annoAttivo) ? Math.min(now.getMonth()+1,12) : 1;
  (DB.global.programmate||[]).forEach(p => generaTransazioniRegola(p, annoAttivo));
  saveNavState();
  updateAnnoUI();
  autoSave();
  if (typeof renderCurrentPage === 'function') renderCurrentPage();
}

function addNewAnno() {
  const nuovi = anniDisponibili();
  const input = document.getElementById('new-anno-input');
  const annoInput = input ? input.value.trim() : '';
  if (!annoInput) { toast('⚠️ Inserisci un anno nel campo','error'); return; }
  const y = parseInt(annoInput);
  if (isNaN(y) || y < 2000 || y > 2100) { toast('⚠️ Anno non valido (2000–2100)','error'); return; }
  if (DB.anni[y]) { toast(`⚠️ L'anno ${y} esiste già`,'error'); return; }
  DB.anni[y] = { transazioni: [], budget: {}, saldiMensili: {} };

  const prevAnno = nuovi.length ? Math.max(...nuovi) : null;
  if (prevAnno && DB.anni[prevAnno]) {
    const savedAnno = annoAttivo;
    annoAttivo = prevAnno;
    getConti().forEach(c => {
      const sb = calcSaldoConto(c.nome, 12);
      const val = Math.round((sb.inserito ?? sb.calcolato) * 100) / 100;
      setSaldoInizialeAnno(c.nome, y, val);
    });
    annoAttivo = savedAnno;
  }

  if (input) input.value = '';
  autoSave();
  switchAnno(y);
  toast(`✅ Anno ${y} creato — saldi iniziali copiati dal ${prevAnno||'anno precedente'}`, 'success');
}

function deleteAnno(anno) {
  anno = parseInt(anno);
  const txCount = (DB.anni[anno]?.transazioni||[]).length;
  const msg = txCount
    ? `Eliminare l'anno ${anno} con ${txCount} transazioni? L'operazione è irreversibile.`
    : `Eliminare l'anno ${anno}?`;
  showConfirm(`Elimina anno ${anno}`, msg, 'Elimina anno', ()=>{
    delete DB.anni[anno];
    autoSave();
    const anni = anniDisponibili();
    if (anni.length) switchAnno(anni[anni.length-1]);
    else { annoAttivo = new Date().getFullYear(); updateAnnoUI(); if (typeof renderCurrentPage === 'function') renderCurrentPage(); }
    toast(`🗑️ Anno ${anno} eliminato`);
  });
}

function updateAnnoUI() {
  const el = document.getElementById('nav-year');
  if (el) el.textContent = annoAttivo;
  renderAnnoSwitcher();
}

function renderAnnoSwitcher() {
  const el = document.getElementById('anno-switcher');
  if (!el) return;
  const anni = anniDisponibili();
  const prossimo = (anni.length ? Math.max(...anni) : annoAttivo) + 1;
  let html = `<div style="padding:8px 12px;border-bottom:1px solid rgba(255,255,255,.1)">
    <div style="font-size:10px;color:rgba(255,255,255,.4);text-transform:uppercase;letter-spacing:.08em;margin-bottom:6px">Anno attivo</div>
    <div style="display:flex;flex-wrap:wrap;gap:4px;margin-bottom:8px">`;
  anni.forEach(a => {
    const active = a === annoAttivo;
    html += `<button onclick="switchAnno(${a})" style="padding:4px 10px;border-radius:6px;font-size:13px;font-weight:600;cursor:pointer;border:none;background:${active?'var(--oro)':'rgba(255,255,255,.12)'};color:${active?'#000':'rgba(255,255,255,.8)'};transition:.2s">${a}</button>`;
  });
  html += `</div>
    <div style="display:flex;gap:4px;align-items:center">
      <input type="number" id="new-anno-input" placeholder="${prossimo}" min="2000" max="2100"
        style="width:68px;padding:4px 6px;border-radius:5px;font-size:12px;border:1px dashed rgba(255,255,255,.35);background:rgba(255,255,255,.05);color:rgba(255,255,255,.85);outline:none;font-family:inherit"
        onkeydown="if(event.key==='Enter')addNewAnno()">
      <button onclick="addNewAnno()" style="padding:4px 10px;border-radius:5px;font-size:12px;cursor:pointer;border:1px solid rgba(255,255,255,.25);background:rgba(255,255,255,.08);color:rgba(255,255,255,.75)" title="Crea anno">＋</button>
      <button onclick="deleteAnno(${annoAttivo})" style="padding:4px 8px;border-radius:5px;font-size:12px;cursor:pointer;border:1px solid rgba(192,57,43,.5);background:rgba(192,57,43,.2);color:#ff8a80" title="Elimina anno attivo">🗑️</button>
    </div>
  </div>`;
  el.innerHTML = html;
}

// ── NAVIGATION ────────────────────────────────────────────────────
function toggleNav() {
  document.getElementById('nav').classList.toggle('open');
  document.getElementById('nav-overlay').classList.toggle('open');
}

// ── TOAST ─────────────────────────────────────────────────────────
function toast(msg, type='') {
  const c = document.getElementById('toast-container');
  if (!c) return;
  const t = document.createElement('div');
  t.className = 'toast ' + type; t.textContent = msg;
  c.appendChild(t); setTimeout(()=>t.remove(), 3200);
}

// ── CONFIRM DIALOG ────────────────────────────────────────────────
function showConfirm(title, msg, okLabel, cb) {
  document.getElementById('confirm-title').textContent = title;
  document.getElementById('confirm-msg').textContent = msg;
  document.getElementById('confirm-ok-btn').textContent = okLabel || 'Elimina';
  document.getElementById('confirm-backdrop').classList.add('open');
  confirmCb = cb;
}
function confirmAccept() { document.getElementById('confirm-backdrop').classList.remove('open'); if(confirmCb) confirmCb(); confirmCb=null; }
function confirmReject() { document.getElementById('confirm-backdrop').classList.remove('open'); confirmCb=null; }

// ── BUSINESS LOGIC ────────────────────────────────────────────────
function txConfirmed(t) { return t.stato !== 'Programmata'; }

// Restituisce true se la transazione INVESTIMENTI porta soldi INDIETRO in banca
// (prelievo da investimento o vendita) — keyword-based, indipendente dai nomi esatti
function isInvestReturning(t) {
  if (t.tipo !== 'INVESTIMENTI') return false;
  const cat = (t.categoria || '').toLowerCase();
  return cat.includes('prelievo') || cat.includes('vendita');
}

function monthlyTotals(mese) {
  const tx = txAnno().filter(t=>t.mese===mese && txConfirmed(t));
  const reddito   = tx.filter(t=>t.tipo==='REDDITO').reduce((s,t)=>s+t.importo,0);
  const spese     = tx.filter(t=>t.tipo==='SPESE').reduce((s,t)=>s+t.importo,0);
  const debiti    = tx.filter(t=>t.tipo==='DEBITI').reduce((s,t)=>s+t.importo,0);
  const investOut = tx.filter(t=>t.tipo==='INVESTIMENTI'&&!isInvestReturning(t)).reduce((s,t)=>s+t.importo,0);
  const investIn  = tx.filter(t=>isInvestReturning(t)).reduce((s,t)=>s+t.importo,0);
  return { reddito, spese, debiti, investOut, investIn, investNet: investIn-investOut };
}

function annualTotals() {
  let reddito=0,spese=0,debiti=0,investOut=0;
  for(let m=1;m<=12;m++){const mt=monthlyTotals(m);reddito+=mt.reddito;spese+=mt.spese;debiti+=mt.debiti;investOut+=mt.investOut;}
  return {reddito,spese,debiti,investOut};
}

function ccPrevMese(mese) {
  let tx;
  if (mese < 2) {
    // Gennaio: cerca le CC di Dicembre dell'anno precedente
    const prevAnno = annoAttivo - 1;
    if (!DB.anni[prevAnno]) return {spese:0, debiti:0};
    tx = DB.anni[prevAnno].transazioni.filter(t => t.mese === 12 && t.metodo === 'Carta di Credito' && txConfirmed(t));
  } else {
    tx = txAnno().filter(t => t.mese === mese-1 && t.metodo === 'Carta di Credito' && txConfirmed(t));
  }
  return { spese: tx.filter(t=>t.tipo==='SPESE').reduce((s,t)=>s+t.importo,0), debiti: tx.filter(t=>t.tipo==='DEBITI').reduce((s,t)=>s+t.importo,0) };
}

function calcSaldoConto(nomeConto, mese) {
  const c = getConti().find(ct => ct.nome === nomeConto);
  const isMainBank = c?.tipo ? c.tipo !== 'investimenti' : nomeConto === getConti()[0]?.nome;
  let saldoInizio;
  if (mese === 1) {
    saldoInizio = getSaldoIniziale(nomeConto);
  } else {
    const prev = calcSaldoConto(nomeConto, mese - 1);
    // Investment accounts carry forward the real (user-inserted) value when available
    saldoInizio = (!isMainBank && prev.inserito !== null) ? prev.inserito : prev.calcolato;
  }
  const tx = txAnno().filter(t=>t.mese===mese && txConfirmed(t) && t.conto===nomeConto);
  const allTxMese = txAnno().filter(t=>t.mese===mese && txConfirmed(t));

  if (isMainBank) {
    const entrate   = tx.filter(t=>t.tipo==='REDDITO').reduce((s,t)=>s+t.importo,0);
    const spese     = tx.filter(t=>t.tipo==='SPESE'&&t.metodo!=='Carta di Credito').reduce((s,t)=>s+t.importo,0);
    const debiti    = tx.filter(t=>t.tipo==='DEBITI'&&t.metodo!=='Carta di Credito').reduce((s,t)=>s+t.importo,0);
    const investOut = tx.filter(t=>t.tipo==='INVESTIMENTI'&&!isInvestReturning(t)).reduce((s,t)=>s+t.importo,0);
    const investIn  = tx.filter(t=>isInvestReturning(t)).reduce((s,t)=>s+t.importo,0);
    const giroOut   = tx.filter(t=>t.tipo==='GIROCONTO').reduce((s,t)=>s+t.importo,0);
    const giroIn    = allTxMese.filter(t=>t.tipo==='GIROCONTO'&&t.contoDestinazione===nomeConto).reduce((s,t)=>s+t.importo,0);
    const cc = ccPrevMese(mese);
    const calcolato = saldoInizio + entrate - spese - debiti + (investIn-investOut) + (giroIn-giroOut) - cc.spese - cc.debiti;
    const inserito  = saldiAnno()[nomeConto]?.[mese]?.inserito ?? null;
    return { saldoInizio, entrate, spese, debiti, investOut, investIn, giroOut, giroIn, cc, calcolato, inserito, isMainBank:true };
  } else {
    const matchConto = t => t.contoInvest === nomeConto ||
      (!t.contoInvest && (t.conto === nomeConto || (t.categoria||'').toLowerCase().includes(nomeConto.toLowerCase())));
    const flussiOut = allTxMese.filter(t => t.tipo==='INVESTIMENTI' && !isInvestReturning(t) && matchConto(t)).reduce((s,t)=>s+t.importo,0);
    const flussiIn  = allTxMese.filter(t => t.tipo==='INVESTIMENTI' && isInvestReturning(t) && matchConto(t)).reduce((s,t)=>s+t.importo,0);
    const giroOut   = allTxMese.filter(t=>t.tipo==='GIROCONTO'&&t.conto===nomeConto).reduce((s,t)=>s+t.importo,0);
    const giroIn    = allTxMese.filter(t=>t.tipo==='GIROCONTO'&&t.contoDestinazione===nomeConto).reduce((s,t)=>s+t.importo,0);
    const calcolato = saldoInizio + flussiOut - flussiIn + (giroIn-giroOut);
    const inserito  = saldiAnno()[nomeConto]?.[mese]?.inserito ?? null;
    return { saldoInizio, flussiIn, flussiOut, giroOut, giroIn, calcolato, inserito, isMainBank:false };
  }
}

// ── TRANSAZIONI (operazioni cross-page) ───────────────────────────
function deleteTransaction(id) {
  const t = txAnno().find(x=>x.id===id);
  if (!t) return;
  showConfirm('Elimina transazione', `Eliminare "${t.descrizione}" del ${formatDateIt(t.data)}?`, 'Elimina', ()=>{
    annoData().transazioni = annoData().transazioni.filter(x=>x.id!==id);
    autoSave();
    if (typeof renderCurrentPage === 'function') renderCurrentPage();
    toast('🗑️ Transazione eliminata');
  });
}

function addCommissioneMetodo(tx) {
  const importo = getCommissioneMetodo(tx.metodo);
  if (!importo) return;
  annoData().transazioni.push({
    id: uid(), data: tx.data, mese: tx.mese,
    tipo: 'SPESE', categoria: 'Spese Bancarie',
    descrizione: tx.descrizione ? `Commissione: ${tx.descrizione}` : `Commissione ${tx.metodo}`,
    importo: importo, metodo: '', conto: tx.conto, note: '', stato: 'Confermata'
  });
}

function confermaTx(id) {
  const tx = txAnno().find(t=>t.id===id);
  if (!tx) return;
  tx.stato = 'Confermata';
  addCommissioneMetodo(tx);
  autoSave();
  if (typeof renderCurrentPage === 'function') renderCurrentPage();
  toast(`✅ "${tx.descrizione}" confermata e conteggiata`, 'success');
}

// ── SPESE PROGRAMMATE (logica condivisa) ──────────────────────────
function calcolaScadenzeAnno(p, anno) {
  const date = [];
  const inizio = new Date(p.dataInizio);
  const fine   = p.dataFine ? new Date(p.dataFine) : new Date(anno, 11, 31);
  const inizioAnno = new Date(anno, 0, 1);
  const fineAnno   = new Date(anno, 11, 31);
  const aggiungi = d => {
    if (d >= inizioAnno && d <= fineAnno && d >= inizio && d <= fine)
      date.push(new Date(d));
  };
  const periodicita = p.periodicita;
  if (periodicita === 'Una volta sola') { aggiungi(new Date(p.dataInizio)); return date; }
  const stepMesi = { Mensile:1, Bimensile:2, Trimestrale:3, Semestrale:6, Annuale:12 }[periodicita];
  const stepGiorni = periodicita === 'Settimanale' ? 7 : periodicita === 'Bi-mensile' ? 14 : null;
  if (stepGiorni) {
    let cur = new Date(inizio);
    while (cur <= fineAnno) { aggiungi(new Date(cur)); cur.setDate(cur.getDate()+stepGiorni); }
  } else if (stepMesi) {
    const giorno = p.giornoMese || inizio.getDate();
    let m = inizio.getMonth(), y = inizio.getFullYear();
    while (new Date(y, m, giorno) <= fineAnno) {
      aggiungi(new Date(y, m, giorno));
      m += stepMesi;
      if (m >= 12) { y += Math.floor(m/12); m = m % 12; }
    }
  }
  return date;
}

function generaTransazioniRegola(p, anno) {
  const scadenze = calcolaScadenzeAnno(p, anno);
  const txEsistenti = annoData().transazioni;
  let aggiunte = 0;
  scadenze.forEach(d => {
    const dataStr = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    const mese = d.getMonth() + 1;
    const esisteGia = txEsistenti.some(t => t._regolaId === p.id && t.data === dataStr);
    if (!esisteGia) {
      txEsistenti.push({ id:uid(), _regolaId:p.id, data:dataStr, mese, tipo:p.tipo, categoria:p.categoria, descrizione:p.descrizione, importo:p.importo, metodo:p.metodo||'', conto:p.conto, note:'Generata automaticamente', stato:'Programmata' });
      aggiunte++;
    }
  });
  return aggiunte;
}

// ── STORAGE (localStorage) ────────────────────────────────────────
const STORAGE_KEY = 'finanze_db';

function autoSave() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(DB)); } catch(e) {}
}

function loadFromStorage() {
  try {
    const s = localStorage.getItem(STORAGE_KEY);
    if (s) DB = JSON.parse(s);
  } catch(e) {}
  migrateDB();
}

function migrateDB() {
  if (DB.settings && !DB.global) {
    const old = DB;
    DB = {
      global: {
        nome: old.settings.nome||'Andrea',
        valuta: old.settings.valuta||'€',
        categorie: old.categorie||DEFAULT_DB.global.categorie,
        conti: (old.settings.conti||[]).map(c=>({
          nome:c.nome, icona:c.icona,
          saldoIniziale:{[old.settings.anno||2026]: typeof c.saldoIniziale==='number'?c.saldoIniziale:0}
        })),
        programmate: old.programmate||[]
      },
      anni: {
        [old.settings.anno||2026]: {
          transazioni: old.transazioni||[],
          budget: old.budget||{},
          saldiMensili: old.saldiMensili||{}
        }
      }
    };
    if (old.settings.saldiIniziali && DB.global.conti.length===0) {
      const si=old.settings.saldiIniziali, y=old.settings.anno||2026;
      DB.global.conti=[
        {nome:'Banca',icona:'🏦',saldoIniziale:{[y]:si.Banca||0}},
        {nome:'Crypto',icona:'₿',saldoIniziale:{[y]:si.Crypto||0}},
        {nome:'PAC',icona:'📈',saldoIniziale:{[y]:si.PAC||0}},
        {nome:'Trade Republic',icona:'🟢',saldoIniziale:{[y]:si['Trade Republic']||0}}
      ];
    }
  }
  if (!DB.global) DB = JSON.parse(JSON.stringify(DEFAULT_DB));
  if (!DB.anni) DB.anni = {};
  if (!DB.global.personalizzazioni) DB.global.personalizzazioni = JSON.parse(JSON.stringify(DEFAULT_DB.global.personalizzazioni));
  if (!DB.global.personalizzazioni.grafico) DB.global.personalizzazioni.grafico = { tipo:'barre', filtroTipo:'totale', filtroValore:'', colore1:'', colore2:'' };
  if (!DB.global.metodi || !DB.global.metodi.length) DB.global.metodi = [...DEFAULT_DB.global.metodi];
  const metodoCanonico = new Map();
  DB.global.metodi = DB.global.metodi.filter(m => {
    const k = m.toLowerCase();
    if (metodoCanonico.has(k)) return false;
    metodoCanonico.set(k, m);
    return true;
  });
  const unisciMetodo = o => { const c = o && o.metodo && metodoCanonico.get(o.metodo.toLowerCase()); if (c) o.metodo = c; };
  Object.values(DB.anni).forEach(a => (a.transazioni || []).forEach(unisciMetodo));
  (DB.global.programmate || []).forEach(unisciMetodo);
  if (!metodoCanonico.has('addebito conto')) DB.global.metodi.unshift('Addebito conto');
  if (!DB.global.commissioni) DB.global.commissioni = DB.global.metodi.includes('Bonifico') ? { 'Bonifico': 0.12 } : {};
  Object.keys(DB.global.commissioni).forEach(k => {
    const c = metodoCanonico.get(k.toLowerCase());
    if (c && c !== k) {
      if (DB.global.commissioni[c] === undefined) DB.global.commissioni[c] = DB.global.commissioni[k];
      delete DB.global.commissioni[k];
    }
  });
}

// ── PERSONALIZZAZIONI ─────────────────────────────────────────────
const DEFAULT_COLORS_GRUPPI = ['#004561','#C0392B','#7358C3','#16A34A','#D97706','#0891B2','#DB2777'];

function getGruppoColore(gruppo) {
  const custom = DB.global.personalizzazioni?.coloriGruppi?.[gruppo];
  if (custom) return custom;
  const gruppi = Object.keys(DB.global.categorie?.SPESE || {});
  const idx = gruppi.indexOf(gruppo);
  return DEFAULT_COLORS_GRUPPI[idx >= 0 ? idx % DEFAULT_COLORS_GRUPPI.length : 0];
}

function applyPersonalizzazioni() {
  const p = DB.global.personalizzazioni;
  if (!p) return;
  const root = document.documentElement;
  const map = {reddito:'--reddito', spese:'--spese', debiti:'--debiti', investimenti:'--investimenti', oro:'--oro'};
  if (p.colori) Object.entries(map).forEach(([k,v]) => { if (p.colori[k]) root.style.setProperty(v, p.colori[k]); });
  if (p.font) document.body.style.fontFamily = p.font;
}

// ── INIT ──────────────────────────────────────────────────────────
function initDB() {
  loadFromStorage();
  const anni = anniDisponibili();
  // Ripristina l'anno e il mese selezionati dall'ultima navigazione
  try {
    const nav = JSON.parse(localStorage.getItem(NAV_KEY) || 'null');
    if (nav && anni.includes(parseInt(nav.annoAttivo))) {
      annoAttivo = parseInt(nav.annoAttivo);
      selectedMese = parseInt(nav.selectedMese) || 1;
    } else {
      throw new Error('nav non valido');
    }
  } catch(_) {
    annoAttivo = anni.length ? anni[anni.length-1] : new Date().getFullYear();
    const now = new Date();
    selectedMese = (now.getFullYear()===annoAttivo) ? Math.min(now.getMonth()+1,12) : 1;
  }
  (DB.global.programmate||[]).forEach(p => generaTransazioniRegola(p, annoAttivo));
  applyPersonalizzazioni();
}
