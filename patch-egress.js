/* ============================================================
   patch-egress.js
   Riduce il traffico verso Supabase (egress) senza toccare index.html
   se non per UNA riga che carica questo file.

   Cosa fa:
   1. Il controllo di aggiornamento dei dati passa da ogni 5 secondi a ogni 60 secondi.
   2. Il ritorno sulla finestra/scheda non rilegge tutto se è passato meno di 30 secondi.
   3. I messaggi WhatsApp (hanno un campo pesante e la sezione è nascosta) non vengono
      più riletti a ogni controllo.
   4. Aprire una scheda ordine non ricontrolla ogni volta le cartelle Dropbox già pronte.
   ============================================================ */
(function () {
  "use strict";

  var REFRESH_INTERVAL_MS = 60000; // prima: 5000
  var MIN_GAP_MS = 30000;          // minimo tra due letture complete
  var lastSharedRefresh = 0;

  /* ---- 1 + 2 + 3: lettura condivisa dei dati ---- */
  window.refreshSharedDataFromSupabase = async function (render) {
    if (render === undefined) render = true;
    if (!currentUser || dataSyncBusy || activeDbWrites > 0) return;
    if (Date.now() - lastSharedRefresh < MIN_GAP_MS) return;
    lastSharedRefresh = Date.now();

    dataSyncBusy = true;
    try {
      var skip = ["whatsappMessages"];
      var base = currentUser.role === "admin"
        ? Object.keys(TABLES)
        : Object.keys(TABLES).filter(function (c) {
            return !["expenses", "fixedCosts", "entrate"].includes(c);
          });
      var collections = base.filter(function (c) { return !skip.includes(c); });

      var results = await Promise.all(collections.map(function (c) {
        return c === "warehouse"
          ? sb.from(TABLES[c]).select("*").gt("quantita", 0)
          : sb.from(TABLES[c]).select("*");
      }));

      var anyChange = false;
      collections.forEach(function (c, i) {
        var r = results[i];
        if (r.error) { console.warn("Sync lettura", c, r.error); return; }
        var sig = "";
        try { sig = JSON.stringify(r.data || []); } catch (e) { sig = String(Math.random()); }
        if (rawSyncSignatures[c] !== sig) { rawSyncSignatures[c] = sig; anyChange = true; }
        state[c] = (r.data || []).map(function (row) { return fromDbRow(c, row); });
        if (c === "orders") state[c].forEach(function (o) { recalcFasi(o); });
        snapshotCollection(c);
      });

      if (render && anyChange) {
        var modal = document.getElementById("modalBackdrop");
        var modalOpen = modal && modal.classList.contains("open");
        if (!modalOpen) requestSafeCurrentViewRender();
      }
    } finally {
      dataSyncBusy = false;
    }
  };

  window.startDataAutoRefresh = function () {
    if (dataSyncTimer) clearInterval(dataSyncTimer);
    dataSyncTimer = setInterval(function () {
      if (document.visibilityState === "visible") window.refreshSharedDataFromSupabase(true);
    }, REFRESH_INTERVAL_MS);

    if (!dataSyncListenersInstalled) {
      dataSyncListenersInstalled = true;
      window.addEventListener("focus", function () { window.refreshSharedDataFromSupabase(true); });
      document.addEventListener("visibilitychange", function () {
        if (document.visibilityState === "visible") window.refreshSharedDataFromSupabase(true);
      });
    }
  };

  /* ---- 4: cartelle Dropbox già verificate ---- */
  var origEnsure = window.jobDropboxEnsureStructure;
  if (typeof origEnsure === "function") {
    var ready = new Map();
    window.jobDropboxEnsureStructure = async function (orderId) {
      var o = findItem("orders", orderId);
      var key = o ? jobDropboxBasePath(o) : String(orderId);
      if (ready.has(key)) return ready.get(key);
      var res = await origEnsure(orderId);
      if (res) ready.set(key, res);
      return res;
    };
  }
})();
