/* shell.js — genera il menu laterale (uguale per tutte le pagine) e gli helper di interfaccia.
   Va incluso nel <body>, nel punto in cui compariva il vecchio <nav>. Richiede icone.js caricato prima. */
(function () {
  var VOCI = [
    { sez: 'Overview' },
    { page: 'dashboard',         label: 'Dashboard',          ic: 'dashboard' },
    { page: 'transazioni',       label: 'Transazioni',        ic: 'transazioni' },
    { page: 'report',            label: 'Report',             ic: 'report' },
    { sez: 'Mensile' },
    { page: 'mensile',           label: 'Mese Corrente',      ic: 'mensile' },
    { sez: 'Gestione' },
    { page: 'budget',            label: 'Budget',             ic: 'budget' },
    { page: 'programmate',       label: 'Spese Programmate',  ic: 'programmate' },
    { page: 'categorie',         label: 'Categorie',          ic: 'categorie' },
    { page: 'impostazioni',      label: 'Impostazioni',       ic: 'impostazioni' },
    { page: 'personalizzazioni', label: 'Personalizzazioni',  ic: 'personalizzazioni' }
  ];
  var links = VOCI.map(function (v) {
    if (v.sez) return '<div class="nav-section">' + v.sez + '</div>';
    return '<a class="nav-link" href="' + v.page + '.html" data-page="' + v.page + '" title="' + v.label + '">' +
      '<span class="icon">' + icona(v.ic, 20) + '</span><span class="lbl">' + v.label + '</span></a>';
  }).join('');
  var html =
    '<button id="nav-toggle" onclick="toggleNav()" aria-label="Menu">' + icona('menu', 22) + '</button>' +
    '<div class="nav-overlay" id="nav-overlay" onclick="toggleNav()"></div>' +
    '<nav id="nav">' +
      '<div class="nav-logo">' +
        '<span class="logo-mark">' + icona('wallet', 20) + '</span>' +
        '<h1>Finanze<br><span id="nav-year">—</span></h1>' +
        '<span>Personali</span>' +
      '</div>' +
      '<div id="anno-switcher"></div>' +
      '<div class="nav-links">' + links + '</div>' +
      '<div class="nav-user" id="nav-user"></div>' +
    '</nav>';
  document.currentScript.insertAdjacentHTML('beforebegin', html);
})();

function renderNavUser() {
  var el = document.getElementById('nav-user');
  if (!el) return;
  var nome = (DB.global.nome || '').trim();
  el.textContent = '';
  var av = document.createElement('span'); av.className = 'avatar'; av.textContent = (nome.charAt(0) || '?').toUpperCase();
  var lb = document.createElement('span'); lb.className = 'lbl'; lb.textContent = nome;
  el.appendChild(av); el.appendChild(lb);
}

/* ── Selettore di stile (Classico / Glass / Bento) ──
   Si usa con un contenitore <div id="selettore-stile"></div> e renderSelettoreStile(). */
var STILI = [
  { id: 'classico', nome: 'Classico', desc: 'Chiaro, con menu blu scuro' },
  { id: 'glass',    nome: 'Glass',    desc: 'Scuro, vetro sfocato e sfondo aurora' },
  { id: 'bento',    nome: 'Bento',    desc: 'Scuro, riquadri e accento lime' }
];

function renderSelettoreStile(containerId, conNota) {
  var el = document.getElementById(containerId || 'selettore-stile');
  if (!el) return;
  var attivo = temaCorrente();
  el.innerHTML = '<div class="stile-grid">' + STILI.map(function (s) {
    var on = s.id === attivo;
    return '<button type="button" class="stile-tile' + (on ? ' active' : '') + '" onclick="scegliStile(\'' + s.id + '\')" aria-pressed="' + on + '">' +
      '<div class="stile-prev prev-' + s.id + '"><span class="p-nav"></span><div class="p-main"><span class="p-h"></span>' +
      '<div class="p-row"><span></span><span></span><span></span></div><span class="p-wide"></span></div></div>' +
      '<div class="nm"><span>' + s.nome + '</span>' + (on ? '<span class="stile-ck">' + icona('check', 18) + '</span>' : '') + '</div>' +
      '<div class="ds">' + s.desc + '</div></button>';
  }).join('') + '</div>' +
  (conNota && attivo !== 'classico' ? '<p class="stile-nota">Font e colori base si personalizzano solo con lo stile Classico. Gruppi Spese e Grafico Mensile valgono per tutti gli stili.</p>' : '');
}

function scegliStile(nome) {
  var p = DB.global.personalizzazioni = DB.global.personalizzazioni || {};
  if (p.tema === nome) return;
  p.tema = nome;
  autoSave();
  applicaTema(nome);
  applyPersonalizzazioni();
  if (typeof renderCurrentPage === 'function') renderCurrentPage();
  var s = STILI.filter(function (x) { return x.id === nome; })[0];
  toast('Stile ' + (s ? s.nome : nome) + ' applicato', 'success');
}

/* Riempie gli slot statici <span data-ic="nome" data-s="16"></span> con l'icona SVG corrispondente. */
function hydrateIcone(root) {
  (root || document).querySelectorAll('[data-ic]').forEach(function (el) {
    el.innerHTML = icona(el.getAttribute('data-ic'), parseInt(el.getAttribute('data-s'), 10) || 16);
  });
}
document.addEventListener('DOMContentLoaded', function () { hydrateIcone(); });
