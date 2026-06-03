/* ═══════════════════════════════════════════════════════
   ESSAIS DE FREIN — app.js
   Logique applicative complète :
   - Navigation entre pages
   - Timers (countdown manuel)
   - Horodatages & IndexedDB
   - WakeLock
   - Web Audio API (3 bips montants)
   - Export .doc
   - Service Worker registration
═══════════════════════════════════════════════════════ */

'use strict';

/* ────────────────────────────────────────────────────────
   1. SERVICE WORKER
──────────────────────────────────────────────────────── */
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js')
      .then(reg => console.log('[SW] Registered:', reg.scope))
      .catch(err => console.warn('[SW] Registration failed:', err));
  });
}

/* ────────────────────────────────────────────────────────
   2. INDEXEDDB
──────────────────────────────────────────────────────── */
const DB_NAME = 'EssaisFreinDB';
const DB_VERSION = 1;
const STORE_NAME = 'essais';

let db = null;

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = e => {
      const database = e.target.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        const store = database.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
        store.createIndex('date', 'date', { unique: false });
      }
    };
    req.onsuccess = e => { db = e.target.result; resolve(db); };
    req.onerror = e => reject(e.target.error);
  });
}

function saveEssai(essai) {
  return new Promise((resolve, reject) => {
    if (!db) { reject(new Error('DB not ready')); return; }
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const req = store.add(essai);
    req.onsuccess = e => resolve(e.target.result);
    req.onerror = e => reject(e.target.error);
  });
}

function getAllEssais() {
  return new Promise((resolve, reject) => {
    if (!db) { resolve([]); return; }
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const req = store.getAll();
    req.onsuccess = e => resolve(e.target.result || []);
    req.onerror = e => reject(e.target.error);
  });
}

/* ────────────────────────────────────────────────────────
   3. WEB AUDIO — 3 tonalités montantes bouclées
──────────────────────────────────────────────────────── */
let audioCtx = null;
let alertInterval = null;
let alertActive = false;

function getAudioContext() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  // Resume if suspended (autoplay policy)
  if (audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
  return audioCtx;
}

/**
 * Joue 3 bips montants : 440Hz → 660Hz → 880Hz
 * Chaque bip dure 150ms, séparation 100ms
 */
function playTripleBip() {
  const ctx = getAudioContext();
  const frequencies = [440, 660, 880];
  const now = ctx.currentTime;

  frequencies.forEach((freq, i) => {
    const oscillator = ctx.createOscillator();
    const gainNode = ctx.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(ctx.destination);

    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(freq, now + i * 0.25);

    gainNode.gain.setValueAtTime(0, now + i * 0.25);
    gainNode.gain.linearRampToValueAtTime(0.6, now + i * 0.25 + 0.01);
    gainNode.gain.linearRampToValueAtTime(0, now + i * 0.25 + 0.15);

    oscillator.start(now + i * 0.25);
    oscillator.stop(now + i * 0.25 + 0.2);
  });
}

/**
 * Lance l'alerte : 3 cycles de 3 bips puis s'arrête
 */
function startAlert(blinkerEl) {
  if (alertActive) return;
  alertActive = true;

  let count = 0;
  const totalCycles = 3;

  function cycle() {
    if (count >= totalCycles) {
      stopAlert(blinkerEl);
      return;
    }
    playTripleBip();
    count++;
    if (count < totalCycles) {
      alertInterval = setTimeout(cycle, 1200);
    } else {
      alertInterval = setTimeout(() => stopAlert(blinkerEl), 1200);
    }
  }

  cycle();
  if (blinkerEl) blinkerEl.classList.add('timer-blink');
}

function stopAlert(blinkerEl) {
  alertActive = false;
  if (alertInterval) { clearTimeout(alertInterval); alertInterval = null; }
  if (blinkerEl) blinkerEl.classList.remove('timer-blink');
}

/* ────────────────────────────────────────────────────────
   4. WAKE LOCK
──────────────────────────────────────────────────────── */
let wakeLock = null;

async function requestWakeLock() {
  if (!('wakeLock' in navigator)) return;
  try {
    wakeLock = await navigator.wakeLock.request('screen');
    console.log('[WakeLock] Acquired');
    wakeLock.addEventListener('release', () => {
      console.log('[WakeLock] Released');
      wakeLock = null;
    });
  } catch (err) {
    console.warn('[WakeLock] Error:', err);
  }
}

async function releaseWakeLock() {
  if (wakeLock) {
    try { await wakeLock.release(); } catch (e) {}
    wakeLock = null;
  }
}

// Reacquire wake lock on visibility change
document.addEventListener('visibilitychange', async () => {
  if (document.visibilityState === 'visible' && !wakeLock) {
    await requestWakeLock();
  }
});

/* ────────────────────────────────────────────────────────
   5. HORODATAGES SESSION
──────────────────────────────────────────────────────── */
const currentEssai = {
  ts1: null,  // Début essai (bouton Essai de Frein)
  ts2: null,  // Élimination
  ts3: null,  // Étanchéité CG
  ts4: null,  // Essai concluant
  date: null,
};

function formatTimestamp(date) {
  if (!date) return '—';
  const d = date instanceof Date ? date : new Date(date);
  const pad = n => String(n).padStart(2, '0');
  return `${pad(d.getDate())}/${pad(d.getMonth()+1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function stampNow() {
  return new Date();
}

/* ────────────────────────────────────────────────────────
   6. NAVIGATION
──────────────────────────────────────────────────────── */
let currentPageId = 'page-home';
const pageHistory = [];

function showPage(pageId, pushHistory = true) {
  const current = document.getElementById(currentPageId);
  const next = document.getElementById(pageId);
  if (!next || pageId === currentPageId) return;

  if (pushHistory && currentPageId !== 'page-home') {
    pageHistory.push(currentPageId);
  }

  current?.classList.add('leaving');
  setTimeout(() => {
    current?.classList.remove('active', 'leaving');
  }, 300);

  next.classList.add('active');
  currentPageId = pageId;
}

function goBack() {
  if (pageHistory.length > 0) {
    const prev = pageHistory.pop();
    showPage(prev, false);
  } else {
    showPage('page-home', false);
  }
}

/* ────────────────────────────────────────────────────────
   7. TIMER ENGINE
──────────────────────────────────────────────────────── */
class CountdownTimer {
  constructor({ displayEl, durationSelect, defaultSeconds = 360, onExpire, alertEl }) {
    this.displayEl = displayEl;
    this.durationSelect = durationSelect;
    this.defaultSeconds = defaultSeconds;
    this.onExpire = onExpire;
    this.alertEl = alertEl;
    this.remaining = defaultSeconds;
    this.interval = null;
    this.running = false;
    this.render();
  }

  get duration() {
    if (this.durationSelect) {
      return parseInt(this.durationSelect.value, 10) || this.defaultSeconds;
    }
    return this.defaultSeconds;
  }

  render() {
    const m = Math.floor(this.remaining / 60);
    const s = this.remaining % 60;
    this.displayEl.textContent = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }

  start() {
    if (this.running) return;
    this.running = true;
    // Unlock audio context on user interaction
    getAudioContext();
    this.interval = setInterval(() => {
      if (this.remaining > 0) {
        this.remaining--;
        this.render();
      } else {
        this.expire();
      }
    }, 1000);
  }

  expire() {
    this.stop();
    this.remaining = 0;
    this.render();
    if (this.alertEl) this.alertEl.classList.remove('hidden');
    if (this.onExpire) this.onExpire();
  }

  stop() {
    if (this.interval) { clearInterval(this.interval); this.interval = null; }
    this.running = false;
  }

  reset() {
    this.stop();
    this.remaining = this.duration;
    this.render();
    if (this.alertEl) this.alertEl.classList.add('hidden');
    stopAlert(this.displayEl);
  }
}

/* ────────────────────────────────────────────────────────
   8. DEBOUNCE HELPER
──────────────────────────────────────────────────────── */
function debounceButton(btn, ms = 1500) {
  btn.disabled = true;
  setTimeout(() => { btn.disabled = false; }, ms);
}

/* ────────────────────────────────────────────────────────
   9. HISTORIQUE UI
──────────────────────────────────────────────────────── */
async function renderHistory() {
  const list = document.getElementById('history-list');
  list.innerHTML = '';
  let essais;
  try { essais = await getAllEssais(); } catch { essais = []; }

  if (!essais.length) {
    list.innerHTML = '<p class="history-empty">Aucun essai enregistré.</p>';
    return;
  }

  // Newest first
  [...essais].reverse().forEach(e => {
    const card = document.createElement('div');
    card.className = 'history-card';
    card.innerHTML = `
      <div class="history-card-header">
        <span class="history-card-id">ESSAI #${String(e.id).padStart(4, '0')}</span>
        <span class="history-card-date">${formatTimestamp(e.date)}</span>
      </div>
      <div class="history-timestamps">
        <div class="history-ts-row">
          <span class="history-ts-label">TS1 — Début :</span>
          <span class="history-ts-value">${formatTimestamp(e.ts1)}</span>
        </div>
        <div class="history-ts-row">
          <span class="history-ts-label">TS2 — Élimination :</span>
          <span class="history-ts-value">${formatTimestamp(e.ts2)}</span>
        </div>
        <div class="history-ts-row">
          <span class="history-ts-label">TS3 — Étanchéité CG :</span>
          <span class="history-ts-value">${formatTimestamp(e.ts3)}</span>
        </div>
        <div class="history-ts-row">
          <span class="history-ts-label">TS4 — Concluant :</span>
          <span class="history-ts-value">${formatTimestamp(e.ts4)}</span>
        </div>
      </div>
    `;
    list.appendChild(card);
  });
}

/* ────────────────────────────────────────────────────────
   10. EXPORT .DOC (HTML Blob)
──────────────────────────────────────────────────────── */
async function exportDoc() {
  let essais;
  try { essais = await getAllEssais(); } catch { essais = []; }

  if (!essais.length) {
    alert('Aucun essai à exporter.');
    return;
  }

  const rows = [...essais].reverse().map(e => `
    <tr>
      <td style="padding:8px 12px;border:1px solid #ccc;font-family:Courier New;font-weight:bold;color:#1a1a1a;">
        #${String(e.id).padStart(4, '0')}
      </td>
      <td style="padding:8px 12px;border:1px solid #ccc;font-family:Courier New;">${formatTimestamp(e.ts1)}</td>
      <td style="padding:8px 12px;border:1px solid #ccc;font-family:Courier New;">${formatTimestamp(e.ts2)}</td>
      <td style="padding:8px 12px;border:1px solid #ccc;font-family:Courier New;">${formatTimestamp(e.ts3)}</td>
      <td style="padding:8px 12px;border:1px solid #ccc;font-family:Courier New;">${formatTimestamp(e.ts4)}</td>
    </tr>
  `).join('');

  const now = new Date();
  const docContent = `
    <html xmlns:o="urn:schemas-microsoft-com:office:office"
          xmlns:w="urn:schemas-microsoft-com:office:word"
          xmlns="http://www.w3.org/TR/REC-html40">
    <head>
      <meta charset="utf-8"/>
      <title>Historique Essais de Frein</title>
      <!--[if gte mso 9]>
      <xml><w:WordDocument><w:View>Print</w:View></w:WordDocument></xml>
      <![endif]-->
      <style>
        body { font-family: Arial, sans-serif; margin: 2cm; color: #1a1a1a; }
        h1 { font-size: 18pt; color: #1a1a1a; border-bottom: 2px solid #FFD600; padding-bottom: 8px; margin-bottom: 4px; }
        .subtitle { font-size: 10pt; color: #666; margin-bottom: 20px; }
        table { border-collapse: collapse; width: 100%; margin-top: 12px; }
        th { background: #1a1a1a; color: #FFD600; padding: 10px 12px; border: 1px solid #333; font-size: 9pt; text-align: left; }
        td { font-size: 9pt; }
        tr:nth-child(even) td { background: #f9f9f9; }
        .footer { margin-top: 20px; font-size: 8pt; color: #999; }
      </style>
    </head>
    <body>
      <h1>HISTORIQUE — ESSAIS DE FREIN</h1>
      <p class="subtitle">Exporté le ${formatTimestamp(now)} | ${essais.length} essai(s)</p>
      <table>
        <thead>
          <tr>
            <th>ID</th>
            <th>TS1 — Début</th>
            <th>TS2 — Élimination</th>
            <th>TS3 — Étanchéité CG</th>
            <th>TS4 — Concluant</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
      <p class="footer">Généré par l'application Essais de Frein PWA</p>
    </body>
    </html>
  `;

  const blob = new Blob(['\ufeff' + docContent], { type: 'application/msword' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `essais-frein-${now.getFullYear()}${String(now.getMonth()+1).padStart(2,'0')}${String(now.getDate()).padStart(2,'0')}.doc`;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 100);
}

/* ────────────────────────────────────────────────────────
   11. MODAL RETOUR
──────────────────────────────────────────────────────── */
let modalCallback = null;

function showModal(onConfirm) {
  modalCallback = onConfirm;
  document.getElementById('modal-confirm').classList.remove('hidden');
}

function hideModal() {
  document.getElementById('modal-confirm').classList.add('hidden');
  modalCallback = null;
}

document.getElementById('modal-cancel').addEventListener('click', hideModal);
document.getElementById('modal-confirm-btn').addEventListener('click', () => {
  hideModal();
  if (modalCallback) modalCallback();
});

/* ────────────────────────────────────────────────────────
   12. RESET SESSION
──────────────────────────────────────────────────────── */
function resetSession() {
  currentEssai.ts1 = null;
  currentEssai.ts2 = null;
  currentEssai.ts3 = null;
  currentEssai.ts4 = null;
  currentEssai.date = null;

  // Reset timer instances
  if (timerP1) timerP1.reset();
  if (timerP2) timerP2.reset();
  if (timerP3) timerP3.reset();

  // Hide timestamps
  document.querySelectorAll('.timestamp-display').forEach(el => {
    el.classList.add('hidden');
    el.textContent = '';
  });

  // Re-enable action buttons
  ['btn-elimination', 'btn-etancheite', 'btn-conclude'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.disabled = false;
  });

  // Clear page history
  pageHistory.length = 0;
}

/* ────────────────────────────────────────────────────────
   13. INIT TIMERS
──────────────────────────────────────────────────────── */
let timerP1, timerP2, timerP3;

function initTimers() {
  // Page 1
  timerP1 = new CountdownTimer({
    displayEl: document.getElementById('timer-display-1'),
    durationSelect: document.getElementById('duration-p1'),
    defaultSeconds: 360,
    alertEl: document.getElementById('alert-p1'),
    onExpire: () => startAlert(document.getElementById('timer-display-1')),
  });

  // Page 2
  timerP2 = new CountdownTimer({
    displayEl: document.getElementById('timer-display-2'),
    durationSelect: document.getElementById('duration-p2'),
    defaultSeconds: 360,
    alertEl: document.getElementById('alert-p2'),
    onExpire: () => startAlert(document.getElementById('timer-display-2')),
  });

  // Page 3 — fixe 60s
  timerP3 = new CountdownTimer({
    displayEl: document.getElementById('timer-display-3'),
    durationSelect: null,
    defaultSeconds: 60,
    alertEl: null,
    onExpire: () => {},
  });
}

/* ────────────────────────────────────────────────────────
   14. EVENT LISTENERS
──────────────────────────────────────────────────────── */
function bindEvents() {

  /* ── ACCUEIL ─────────────────────────────────────────── */
  document.getElementById('btn-start-test').addEventListener('click', () => {
    // TS1 : Début essai
    currentEssai.ts1 = stampNow();
    currentEssai.date = currentEssai.ts1;
    requestWakeLock();
    showPage('page-1');
  });

  document.getElementById('btn-history').addEventListener('click', async () => {
    await renderHistory();
    showPage('page-history');
  });

  /* ── HISTORIQUE ──────────────────────────────────────── */
  document.getElementById('btn-history-back').addEventListener('click', () => {
    showPage('page-home', false);
  });

  document.getElementById('btn-export').addEventListener('click', () => {
    exportDoc();
  });

  /* ── PAGE 1 ──────────────────────────────────────────── */
  document.getElementById('btn-p1-back').addEventListener('click', () => {
    showModal(() => { resetSession(); releaseWakeLock(); showPage('page-home', false); });
  });

  document.getElementById('btn-p1-skip').addEventListener('click', () => {
    // TS2 auto si pas encore set
    if (!currentEssai.ts2) currentEssai.ts2 = stampNow();
    showPage('page-2');
  });

  document.getElementById('btn-start-p1').addEventListener('click', () => {
    timerP1.reset();
    timerP1.remaining = timerP1.duration;
    timerP1.render();
    timerP1.start();
  });

  document.getElementById('btn-reset-p1').addEventListener('click', () => {
    stopAlert(document.getElementById('timer-display-1'));
    timerP1.reset();
  });

  document.getElementById('btn-elimination').addEventListener('click', function () {
    debounceButton(this);
    currentEssai.ts2 = stampNow();
    const tsEl = document.getElementById('ts-elimination');
    tsEl.textContent = `TS2 : ${formatTimestamp(currentEssai.ts2)}`;
    tsEl.classList.remove('hidden');
    timerP1.stop();
    stopAlert(document.getElementById('timer-display-1'));
    // Navigate to page 2
    setTimeout(() => showPage('page-2'), 600);
  });

  /* ── PAGE 2 ──────────────────────────────────────────── */
  document.getElementById('btn-p2-back').addEventListener('click', () => {
    showPage('page-1');
  });

  document.getElementById('btn-p2-skip').addEventListener('click', () => {
    if (!currentEssai.ts3) currentEssai.ts3 = stampNow();
    showPage('page-3');
  });

  document.getElementById('btn-start-p2').addEventListener('click', () => {
    timerP2.reset();
    timerP2.remaining = timerP2.duration;
    timerP2.render();
    timerP2.start();
  });

  document.getElementById('btn-reset-p2').addEventListener('click', () => {
    stopAlert(document.getElementById('timer-display-2'));
    timerP2.reset();
  });

  document.getElementById('btn-etancheite').addEventListener('click', function () {
    debounceButton(this);
    currentEssai.ts3 = stampNow();
    const tsEl = document.getElementById('ts-etancheite');
    tsEl.textContent = `TS3 : ${formatTimestamp(currentEssai.ts3)}`;
    tsEl.classList.remove('hidden');
    timerP2.stop();
    stopAlert(document.getElementById('timer-display-2'));
    setTimeout(() => showPage('page-3'), 600);
  });

  /* ── PAGE 3 ──────────────────────────────────────────── */
  document.getElementById('btn-p3-back').addEventListener('click', () => {
    showPage('page-2');
  });

  document.getElementById('btn-p3-skip').addEventListener('click', () => {
    if (!currentEssai.ts4) currentEssai.ts4 = stampNow();
    concludeTest();
  });

  document.getElementById('btn-start-p3').addEventListener('click', () => {
    timerP3.reset();
    timerP3.remaining = 60;
    timerP3.render();
    timerP3.start();
  });

  document.getElementById('btn-reset-p3').addEventListener('click', () => {
    timerP3.reset();
  });

  document.getElementById('btn-conclude').addEventListener('click', function () {
    debounceButton(this);
    currentEssai.ts4 = stampNow();
    const tsEl = document.getElementById('ts-conclude');
    tsEl.textContent = `TS4 : ${formatTimestamp(currentEssai.ts4)}`;
    tsEl.classList.remove('hidden');
    timerP3.stop();
    setTimeout(() => concludeTest(), 500);
  });

  /* ── PAGE 4 ──────────────────────────────────────────── */
  document.getElementById('btn-done-home').addEventListener('click', () => {
    resetSession();
    releaseWakeLock();
    showPage('page-home', false);
  });
}

/* ────────────────────────────────────────────────────────
   15. CONCLUDE TEST
──────────────────────────────────────────────────────── */
async function concludeTest() {
  // Save to IndexedDB
  const record = {
    date: currentEssai.date || new Date(),
    ts1: currentEssai.ts1,
    ts2: currentEssai.ts2,
    ts3: currentEssai.ts3,
    ts4: currentEssai.ts4,
  };

  let savedId = null;
  try { savedId = await saveEssai(record); } catch (e) { console.warn('[DB] Save failed:', e); }

  // Update done page info
  const infoLines = [
    `ID : #${savedId ? String(savedId).padStart(4,'0') : '????'}`,
    `TS1 : ${formatTimestamp(record.ts1)}`,
    `TS2 : ${formatTimestamp(record.ts2)}`,
    `TS3 : ${formatTimestamp(record.ts3)}`,
    `TS4 : ${formatTimestamp(record.ts4)}`,
  ].join('\n');

  document.getElementById('done-info').textContent = infoLines;

  showPage('page-4');
  releaseWakeLock();
}

/* ────────────────────────────────────────────────────────
   16. OFFLINE INDICATOR
──────────────────────────────────────────────────────── */
function updateOfflineIndicator() {
  const badge = document.getElementById('offline-indicator');
  if (badge) {
    badge.classList.toggle('hidden', navigator.onLine);
  }
}

window.addEventListener('online', updateOfflineIndicator);
window.addEventListener('offline', updateOfflineIndicator);

/* ────────────────────────────────────────────────────────
   17. BOOTSTRAP
──────────────────────────────────────────────────────── */
(async function init() {
  try {
    await openDB();
    console.log('[DB] IndexedDB ready');
  } catch (e) {
    console.warn('[DB] Could not open IndexedDB:', e);
  }

  initTimers();
  bindEvents();
  updateOfflineIndicator();

  console.log('[APP] Essais de Frein PWA démarrée');
})();
