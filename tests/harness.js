/**
 * 測試用：在本機開一個靜態伺服器提供 docs/，用無頭瀏覽器打開工具頁。
 *
 * 外部 CDN（Chart.js 與外掛）改由 npm 裝好的同版本檔案提供，
 * 測試結果不受網路影響；Firebase 可給假模組（stub）或直接擋掉（block，模擬工地網路連不到 Google）。
 */
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const DOCS = path.resolve(__dirname, '..', 'docs');
const NM = path.join(__dirname, 'node_modules');
const LIB = {
  'cdn.jsdelivr.net/npm/chart.js': NM + '/chart.js/dist/chart.umd.js',
  'chartjs-plugin-datalabels': NM + '/chartjs-plugin-datalabels/dist/chartjs-plugin-datalabels.min.js',
  'chartjs-plugin-annotation': NM + '/chartjs-plugin-annotation/dist/chartjs-plugin-annotation.min.js',
  'hammerjs': NM + '/hammerjs/hammer.min.js',
  'chartjs-plugin-zoom': NM + '/chartjs-plugin-zoom/dist/chartjs-plugin-zoom.min.js',
};
const FB_STUB = `
export const initializeApp=()=>({}), getFirestore=()=>({}), getAuth=()=>({});
export const collection=()=>({}), query=()=>({}), orderBy=()=>({}), doc=()=>({});
export const onSnapshot=(q,cb)=>{ cb({forEach(){}, docs:[], empty:true, size:0}); return ()=>{}; };
export const addDoc=async()=>({id:'x'}), getDoc=async()=>({exists:()=>false}), setDoc=async()=>{}, deleteDoc=async()=>{}, updateDoc=async()=>{};
export class GoogleAuthProvider{}; export const signInWithPopup=async()=>{}, signOut=async()=>{};
export const onAuthStateChanged=(a,cb)=>{ cb(null); return ()=>{}; };`;

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript', '.css': 'text/css' };
function startStatic() {
  return new Promise(resolve => {
    const srv = http.createServer((req, res) => {
      let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
      if (p.endsWith('/')) p += 'index.html';
      const full = path.join(DOCS, p);
      if (!full.startsWith(DOCS) || !fs.existsSync(full)) { res.statusCode = 404; return res.end(); }
      res.setHeader('Content-Type', TYPES[path.extname(full)] || 'application/octet-stream');
      fs.createReadStream(full).pipe(res);
    });
    srv.listen(0, '127.0.0.1', () => resolve({ srv, base: `http://127.0.0.1:${srv.address().port}/` }));
  });
}

let shared = null;
async function setup() {
  const { srv, base } = await startStatic();
  const opts = {};
  // 雲端開發環境的 Chromium 不在 Playwright 預設位置時用這個
  if (fs.existsSync('/opt/pw-browsers/chromium')) opts.executablePath = '/opt/pw-browsers/chromium';
  let browser;
  try { browser = await chromium.launch(opts); }
  catch (e) { browser = await chromium.launch(); }
  shared = { srv, base, browser };
  return shared;
}
async function teardown() { if (shared) { await shared.browser.close(); shared.srv.close(); shared = null; } }

async function open(tool, { firebase = 'stub' } = {}) {
  const ctx = await shared.browser.newContext({ viewport: { width: 1400, height: 1000 } });
  const p = await ctx.newPage();
  const errors = [];
  p.on('pageerror', e => errors.push(e.message));
  p.on('dialog', d => d.accept());
  await p.route(/^https?:\/\/(?!127\.0\.0\.1)/, route => {
    const u = route.request().url();
    for (const [k, f] of Object.entries(LIB)) if (u.includes(k)) return route.fulfill({ path: f, contentType: 'application/javascript' });
    if (u.includes('gstatic.com/firebasejs')) {
      if (firebase === 'block') return route.abort('internetdisconnected');
      return route.fulfill({ body: FB_STUB, contentType: 'application/javascript' });
    }
    if (u.includes('tailwindcss')) return route.fulfill({ body: '', contentType: 'application/javascript' });
    return route.abort();
  });
  await p.goto(shared.base + encodeURI(tool) + '/', { waitUntil: 'load' });
  await p.waitForTimeout(300);
  return { p, errors, close: () => ctx.close() };
}

module.exports = { setup, teardown, open };
