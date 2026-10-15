/* tema.js — da includere nel <head> di OGNI pagina, DOPO styles.css e prima di qualsiasi altro script.
   Legge il tema salvato, imposta <html data-theme="..."> e inserisce i CSS del tema in modo bloccante (niente lampo del tema sbagliato). */
(function () {
  var TEMI = { classico: ['tema-classico.css'], glass: ['tema-comune.css', 'tema-glass.css'], bento: ['tema-comune.css', 'tema-bento.css'] };
  var TEMA_DEFAULT = 'glass';

  function leggi() {
    try {
      var db = JSON.parse(localStorage.getItem('finanze_db') || 'null');
      var t = db && db.global && db.global.personalizzazioni && db.global.personalizzazioni.tema;
      return TEMI[t] ? t : TEMA_DEFAULT;
    } catch (e) { return TEMA_DEFAULT; }
  }

  window.TEMI_DISPONIBILI = Object.keys(TEMI);
  window.TEMA_DEFAULT = TEMA_DEFAULT;

  /* Cambio tema a runtime: sostituisce i <link> del tema precedente. */
  /* I CSS del tema precedente vengono tolti solo quando quelli nuovi sono caricati (niente sfarfallio). */
  window.applicaTema = function (nome) {
    if (!TEMI[nome]) nome = TEMA_DEFAULT;
    var vecchi = Array.prototype.slice.call(document.querySelectorAll('link[data-tema-css]'));
    var attesa = 0;
    function pulisci() { vecchi.forEach(function (l) { l.remove(); }); }
    document.documentElement.setAttribute('data-theme', nome);
    TEMI[nome].forEach(function (href) {
      var l = document.createElement('link');
      l.rel = 'stylesheet'; l.href = href; l.setAttribute('data-tema-css', '1');
      if (vecchi.length) { attesa++; l.onload = l.onerror = function () { if (--attesa === 0) pulisci(); }; }
      document.head.appendChild(l);
    });
    if (vecchi.length && !attesa) pulisci();
  };

  /* Primo caricamento: document.write mette i <link> nel flusso del parser, quindi la pagina non viene
     disegnata finché i CSS del tema non sono pronti (un <link> creato con createElement non blocca il primo disegno
     e lascia vedere per un attimo lo stile Classico di styles.css). */
  var nome = leggi();
  document.documentElement.setAttribute('data-theme', nome);
  TEMI[nome].forEach(function (href) {
    document.write('<link rel="stylesheet" href="' + href + '" data-tema-css="1">');
  });
})();
