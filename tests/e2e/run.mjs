/*
 * AC 工具集 — Playwright 端到端回歸測試
 *
 *   npm run test:e2e                 離線模式（CDN 以 stubs/ 替身取代，沙箱／CI 可跑）
 *   E2E_LIVE_CDN=1 npm run test:e2e  連真實 CDN（Tailwind／Chart.js／Firebase），截圖較接近實況
 *   E2E_HEADFUL=1                    開視窗觀察
 *
 * 不依賴 @playwright/test，只用 playwright 核心 + 內建 http 伺服器，零安裝。
 * 截圖輸出到 tests/e2e/screenshots/，供改版前後肉眼比對。
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import * as F from './fixtures.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DOCS = path.resolve(__dirname, '../../docs');
const SHOTS = path.join(__dirname, 'screenshots');
const LIVE_CDN = process.env.E2E_LIVE_CDN === '1';

// ---- 載入 playwright（本機 node_modules → 全域安裝路徑） ----
async function loadPlaywright() {
  const candidates = ['playwright', process.env.PLAYWRIGHT_PATH, '/opt/node-tools/node_modules/playwright'].filter(Boolean);
  const require = createRequire(import.meta.url);
  for (const c of candidates) {
    try { return require(c); } catch (e) { /* try next */ }
  }
  throw new Error('找不到 playwright，請 npm i -D playwright 或設定 PLAYWRIGHT_PATH');
}

// ---- 靜態伺服器（docs/ 為根） ----
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml' };
function startServer() {
  return new Promise(resolve => {
    const srv = http.createServer((req, res) => {
      let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
      if (p.endsWith('/')) p += 'index.html';
      const file = path.join(DOCS, p);
      if (!file.startsWith(DOCS) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end('not found'); return; }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
      fs.createReadStream(file).pipe(res);
    });
    srv.listen(0, '127.0.0.1', () => resolve({ srv, base: `http://127.0.0.1:${srv.address().port}` }));
  });
}

// ---- CDN 替身 ----
const stub = name => fs.readFileSync(path.join(__dirname, 'stubs', name), 'utf-8');
async function installRoutes(context) {
  if (LIVE_CDN) return;
  const js = body => ({ status: 200, contentType: 'application/javascript; charset=utf-8', body });
  await context.route(/www\.gstatic\.com\/firebasejs\//, r => r.fulfill(js(stub('firebase-stub.js'))));
  await context.route(/cdn\.tailwindcss\.com/, r => r.fulfill(js(stub('tailwind-stub.js'))));
  await context.route(/cdn\.jsdelivr\.net\/npm\/chart\.js/, r => r.fulfill(js(stub('chart-stub.js'))));
  await context.route(/(chartjs-plugin-|hammerjs)/, r => r.fulfill(js('/* plugin stub */')));
  await context.route(/fonts\.(googleapis|gstatic)\.com/, r => r.fulfill({ status: 200, contentType: 'text/css', body: '' }));
}

// ---- 迷你測試框架 ----
const results = [];
let currentPage = null;
async function t(name, fn) {
  const t0 = Date.now();
  try { await fn(); results.push({ name, ok: true, ms: Date.now() - t0 }); console.log(`  ✓ ${name}`); }
  catch (e) {
    results.push({ name, ok: false, ms: Date.now() - t0, err: e });
    console.log(`  ✗ ${name}\n      ${String(e.message || e).split('\n').join('\n      ')}`);
    if (currentPage) { try { await currentPage.screenshot({ path: path.join(SHOTS, `FAIL-${name.replace(/[^\w一-鿿]+/g, '_')}.png`), fullPage: true }); } catch (_) {} }
  }
}
function expect(cond, msg) { if (!cond) throw new Error(msg || 'expectation failed'); }
function approx(a, b, eps, msg) { if (Math.abs(a - b) > eps) throw new Error(`${msg || ''} 期望 ${b}±${eps}，實得 ${a}`); }
const shot = (page, name) => page.screenshot({ path: path.join(SHOTS, name + '.png'), fullPage: true });

// 收集每頁的 JS 錯誤；測試結束時若有未預期錯誤即失敗
const pageErrors = [];
function watch(page, label) {
  page.on('pageerror', e => pageErrors.push(`[${label}] pageerror: ${e.message}`));
  page.on('console', m => { if (m.type() === 'error') pageErrors.push(`[${label}] console.error: ${m.text()}`); });
  // 404 的本機資源也算錯誤（抓錯 import 路徑）
  page.on('response', r => { if (r.status() === 404 && r.url().startsWith('http://127.0.0.1')) pageErrors.push(`[${label}] 404: ${r.url()}`); });
}

async function main() {
  fs.mkdirSync(SHOTS, { recursive: true });
  const { chromium } = await loadPlaywright();
  const { srv, base } = await startServer();
  const browser = await chromium.launch({ headless: process.env.E2E_HEADFUL !== '1' });
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: 'zh-TW', permissions: ['clipboard-read', 'clipboard-write'] });
  await installRoutes(context);
  const page = await context.newPage(); currentPage = page;
  watch(page, 'main');
  const U = {
    home: base + '/',
    section: base + '/AC-斷面分析/',
    slope: base + '/AC-縱坡/',
    dtm: base + '/AC-地形測量/',
  };

  console.log(`\nAC 工具集 e2e（${LIVE_CDN ? '真實 CDN' : '離線替身'}）  ${base}\n`);

  // ===== 首頁與導覽 =====
  console.log('首頁與導覽列');
  await t('首頁三張工具卡片連結皆可開啟', async () => {
    await page.goto(U.home);
    const hrefs = await page.$$eval('.card a', as => as.map(a => a.getAttribute('href')));
    expect(hrefs.length === 3, `卡片數 ${hrefs.length}`);
    for (const h of hrefs) {
      const r = await page.request.get(U.home + h);
      expect(r.ok(), `${h} → ${r.status()}`);
    }
    await shot(page, '00-home');
  });

  for (const [key, folder, label] of [['section', 'AC-斷面分析', '斷面分析'], ['slope', 'AC-縱坡', '縱坡'], ['dtm', 'AC-地形測量', '地形測量']]) {
    await t(`${label}：nav.js 標出目前工具、首頁連結指向上一層`, async () => {
      await page.goto(U[key]);
      await page.waitForSelector('.acnav-bar');
      const active = await page.textContent('.acnav-active');
      expect(active.trim() === label, `active=${active}`);
      const home = await page.getAttribute('.acnav-links .acnav-home', 'href');
      expect(home === '../', `home href=${home}`);
      const homeRes = await page.request.get(new URL(home, U[key]).href);
      expect(homeRes.ok(), `首頁連結 ${homeRes.status()}`);
      const others = await page.$$eval('.acnav-links a[data-tool]', as => as.map(a => a.getAttribute('href')));
      expect(others.length === 2, `其他工具連結數 ${others.length}`);
      for (const h of others) { const r = await page.request.get(new URL(h, U[key]).href); expect(r.ok(), `${h} → ${r.status()}`); }
    });
  }

  await t('舊網址 AC-斷面／AC-高差 自動跳轉到斷面分析', async () => {
    for (const old of ['AC-斷面', 'AC-高差']) {
      await page.goto(`${base}/${old}/`);
      await page.waitForURL(/AC-%E6%96%B7%E9%9D%A2%E5%88%86%E6%9E%90|AC-斷面分析/, { timeout: 5000 });
    }
  });

  // ===== 斷面分析 =====
  console.log('斷面分析');
  await t('斷面分析：輸入三層資料並分析，結果分頁啟用', async () => {
    await context.clearCookies();
    await page.goto(U.section);
    await page.evaluate(() => localStorage.clear());
    await page.goto(U.section);
    await page.fill('#section1Data', F.GROUND);
    await page.fill('#section2Data', F.MILLED);
    await page.fill('#section3Data', F.PAVED);
    await page.click('#processButton');
    await page.waitForFunction(() => document.querySelector('#tab-bar .tab-btn[data-tab="indiv"]').disabled === false);
    const err = await page.textContent('#error-message');
    expect(err.trim() === '', `錯誤訊息：${err}`);
    const opts = await page.$$eval('#mileageSelector option', os => os.map(o => o.value));
    expect(opts.join(',') === '40,20,0', `里程選單 ${opts}`);
    const active = await page.getAttribute('#tab-bar .tab-btn.active', 'data-tab');
    expect(active === 'indiv', `分析後應切到個別斷面，實得 ${active}`);
    await shot(page, '10-section-indiv');
  });

  await t('斷面分析：個別斷面面積（刨除 0.500 m²、舖築 1.000 m²）', async () => {
    const txt = await page.textContent('#areaDisplay');
    expect(/刨除面積:\s*0\.500/.test(txt), txt);
    expect(/舖築面積:\s*1\.000/.test(txt), txt);
    const rows = await page.$$('#differenceTableContainer tbody tr');
    expect(rows.length === 3, `高程差表列數 ${rows.length}`);
  });

  await t('斷面分析：刨除／舖築量分頁（總刨除 20 m³、總舖築 40 m³）', async () => {
    await page.click('#tab-bar .tab-btn[data-tab="volume"]');
    const txt = await page.textContent('#totalVolumeDisplay');
    expect(/總刨除量:\s*20\.000/.test(txt), txt);
    expect(/總舖築量:\s*40\.000/.test(txt), txt);
    expect(/平均刨除厚度:\s*5\.00/.test(txt), txt);
    expect(/平均舖築厚度:\s*10\.00/.test(txt), txt);
    const rows = await page.$$('#areaTableContainer tbody tr');
    expect(rows.length === 3, `各里程表列數 ${rows.length}`);
    await shot(page, '11-section-volume');
  });

  await t('斷面分析：刨鋪厚度總表（指定支距）每格 5.0 cm', async () => {
    await page.click('#tab-bar .tab-btn[data-tab="thick"]');
    await page.fill('#customOffsets', '-5 0 5');
    await page.click('#summaryButton');
    await page.waitForSelector('#summaryTableContainer table');
    const vals = await page.$$eval('#summaryTableContainer tbody td span.font-medium', ss => ss.map(s => s.textContent.trim()));
    expect(vals.length === 9, `格數 ${vals.length}`);
    vals.forEach(v => approx(parseFloat(v), 5.0, 0.01, '厚度'));
    await shot(page, '12-section-thickness');
  });

  await t('斷面分析：刨鋪厚度總表（等間距 2.5 m）', async () => {
    await page.click('label[for="method-interval"]');   // radio 本體是 .hidden，點它的 label
    await page.fill('#interval-distance', '2.5');
    await page.click('#summaryButton');
    const headers = await page.$$eval('#summaryTableContainer thead th', ths => ths.map(t => t.textContent.trim()));
    expect(headers.length === 6, `欄數 ${headers.length}（里程 + 點位 1~5）`);
  });

  await t('斷面分析：全里程分頁有 3 張圖', async () => {
    await page.click('#tab-bar .tab-btn[data-tab="all"]');
    const n = await page.$$eval('#allMileageChartsContainer canvas', cs => cs.length);
    expect(n === 3, `canvas 數 ${n}`);
    await shot(page, '13-section-all');
  });

  await t('斷面分析：縱向剖面分頁（支距 0、3 個斷面）', async () => {
    await page.click('#tab-bar .tab-btn[data-tab="profile"]');
    await page.waitForFunction(() => /共 3 個斷面/.test(document.querySelector('#profileInfo').textContent));
    await shot(page, '14-section-profile');
  });

  await t('斷面分析：重新整理後保留分析狀態（localStorage）', async () => {
    await page.reload();
    await page.waitForFunction(() => document.querySelector('#tab-bar .tab-btn[data-tab="indiv"]').disabled === false, null, { timeout: 8000 });
    const v = await page.inputValue('#section1Data');
    expect(v === F.GROUND, '原地面資料未保留');
  });

  await t('斷面分析 → 縱坡：送出縱向剖面並在縱坡載入', async () => {
    await page.click('#tab-bar .tab-btn[data-tab="profile"]');
    await page.selectOption('#profileSendLayer', '2');
    await page.click('#profileSendButton');
    await page.waitForURL(/AC-%E7%B8%B1%E5%9D%A1|AC-縱坡/);
    await page.waitForSelector('#bridgeBanner:not(.hidden)');
    const msg = await page.textContent('#bridgeMsg');
    expect(/刨除後/.test(msg) && /共 3 點/.test(msg), msg);
    await page.click('#bridgeLoadBtn');
    const rows = await page.$$('#dataTable tbody tr');
    expect(rows.length === 3, `縱坡表列數 ${rows.length}`);
    const input = await page.inputValue('#dataInput');
    expect(input.startsWith('0 10.03'), `輸入框內容 ${input.split('\n')[0]}`);
    await shot(page, '20-slope-from-bridge');
  });

  // ===== 縱坡 =====
  console.log('縱坡');
  await t('縱坡：樁號＋高程輸入、重算後厚度落在 5~10 cm', async () => {
    await page.goto(U.slope);
    await page.evaluate(() => localStorage.clear());
    await page.goto(U.slope);
    await page.fill('#dataInput', F.SLOPE_INPUT);
    await page.fill('#minThickness', '5');
    await page.fill('#maxThickness', '10');
    await page.fill('#avgThickness', '8');
    await page.click('#recalculateBtn');
    const cells = await page.$$eval('#dataTable tbody .thickness-cell', tds => tds.map(td => parseFloat(td.textContent)));
    expect(cells.length === 6, `列數 ${cells.length}`);
    cells.forEach(v => expect(v >= 4.95 && v <= 10.05, `厚度 ${v} 超出範圍`));
    const info = await page.textContent('#infoText');
    expect(/平均厚度約為/.test(info), info);
    const stations = await page.$$eval('#dataTable tbody tr td:first-child', tds => tds.map(td => td.textContent.trim()));
    expect(stations[0] === '0m' && stations[5] === '50m', `樁號 ${stations}`);
    await shot(page, '21-slope-main');
  });

  await t('縱坡：手改完工高程即時更新厚度；「套用三點平均」可執行', async () => {
    const first = await page.$('#dataTable tbody tr:nth-child(2) .elevation-input');
    const exist = parseFloat(await page.textContent('#dataTable tbody tr:nth-child(2) td:nth-child(2)'));
    await first.fill((exist + 0.07).toFixed(3));
    await first.dispatchEvent('input');
    const th = parseFloat(await page.textContent('#dataTable tbody tr:nth-child(2) .thickness-cell'));
    approx(th, 7.0, 0.05, '手改後厚度');
    await page.click('#applyAvgBtn');
    expect(/三點平均/.test(await page.textContent('#infoText')));
  });

  await t('縱坡：重新整理後還原本機暫存', async () => {
    await page.reload();
    await page.waitForSelector('#dataTable tbody tr');
    const rows = await page.$$('#dataTable tbody tr');
    expect(rows.length === 6, `列數 ${rows.length}`);
  });

  await t('縱坡：只貼高程一欄會自動補樁號 0,10,20…', async () => {
    await page.fill('#dataInput', '1.0\n1.1\n1.2');
    await page.click('#recalculateBtn');
    const stations = await page.$$eval('#dataTable tbody tr td:first-child', tds => tds.map(td => td.textContent.trim()));
    expect(stations.join(',') === '0m,10m,20m', stations.join(','));
  });

  // ===== 地形測量 =====
  console.log('地形測量 (DTM)');
  await t('DTM：貼入 8 點並重繪，點數顯示正確', async () => {
    await page.goto(U.dtm);
    await page.evaluate(() => localStorage.clear());
    await page.goto(U.dtm);
    await page.fill('#inputData', F.DTM_POINTS);
    await page.click('text=重新繪製地圖');
    await page.waitForFunction(() => document.querySelector('#pointCount').textContent === '8');
    await page.waitForFunction(() => document.querySelector('#loading').style.display === 'none', null, { timeout: 8000 });
    const legend = await page.textContent('#legendMin');
    expect(legend === '10.00', `圖例最小值 ${legend}`);
    await shot(page, '30-dtm-map');
  });

  await t('DTM：匯入 CAD 中心線 → 批量生成橫斷面 → 開啟剖面', async () => {
    await page.click('text=匯入/編輯 CAD 中心線');
    await page.fill('#cadInput', F.DTM_CAD);
    await page.click('#cadModal >> text=匯入並繪製');
    await page.waitForFunction(() => /匯入成功/.test(document.querySelector('#genericModalTitle').textContent));
    const msg = await page.textContent('#genericModalMessage');
    expect(/長 22\.36m/.test(msg), msg);
    await page.click('#genericModalConfirm');
    await page.click('text=批量生成橫斷面');
    await page.fill('#batchInterval', '10');
    await page.click('#batchModal >> text=開始生成');
    await page.waitForFunction(() => /生成完畢/.test(document.querySelector('#genericModalTitle').textContent));
    await page.click('#genericModalConfirm');
    const items = await page.$$eval('#stationListContent .station-item', ds => ds.map(d => d.textContent));
    expect(items.join('|') === '0K+000.00|0K+010.00|0K+020.00|0K+022.36', items.join('|'));
    await page.click('#stationListContent .station-item:nth-child(2)');
    await page.waitForFunction(() => document.querySelector('#profilePanel').style.display === 'flex');
    const title = await page.textContent('#profileTitle');
    expect(/0K\+010\.00/.test(title), title);
    await shot(page, '31-dtm-section');
  });

  await t('DTM：所有橫斷面一覽', async () => {
    await page.click('#stationListPanel >> text=全部');
    await page.waitForSelector('#allSectionsModal', { state: 'visible' });
    const n = await page.$$eval('#allSectionsGrid canvas', cs => cs.length);
    expect(n === 4, `斷面卡片數 ${n}`);
    await shot(page, '32-dtm-all-sections');
    await page.click('#allSectionsModal >> text=關閉');
  });

  await t('DTM：另存專案後重新整理仍在專案清單', async () => {
    await page.click('text=另存新專案');
    await page.fill('#genericModalInput', 'e2e專案');
    await page.click('#genericModalConfirm');
    await page.waitForFunction(() => /成功/.test(document.querySelector('#genericModalTitle').textContent));
    await page.click('#genericModalConfirm');
    // 自動存檔有 1.5 秒防抖，等它完成再重新整理
    await page.waitForFunction(() => /已自動存檔/.test(document.querySelector('#autoSaveStatus').textContent), null, { timeout: 5000 });
    const keys = await page.evaluate(() => Object.keys(localStorage));
    expect(keys.includes('dtm_autosave') && keys.includes('dtm_projects'), `localStorage keys=${keys}`);
    await page.reload();
    await page.waitForFunction(() => document.querySelector('#pointCount').textContent === '8');
    await page.click('text=專案管理');
    const names = await page.$$eval('#projectListContainer .project-name', ns => ns.map(n => n.textContent));
    expect(names.includes('e2e專案'), names.join(','));
  });

  await t('DTM：編輯後立刻切換工具，自動存檔不會遺失（pagehide 強制寫入）', async () => {
    await page.fill('#startStation', '123');
    await page.click('.acnav-links a[data-tool="AC-縱坡"]');   // 1.5 秒防抖內就離開
    await page.waitForURL(/AC-%E7%B8%B1%E5%9D%A1|AC-縱坡/);
    await page.goto(U.dtm);
    await page.waitForFunction(() => document.querySelector('#pointCount').textContent === '8');
    const v = await page.inputValue('#startStation');
    expect(v === '123', `起點樁號 ${v}`);
  });

  await t('DTM：手機寬度顯示警告橫幅，桌機不顯示', async () => {
    expect(await page.isHidden('#mobile-warn'), '桌機不應顯示');
    await page.setViewportSize({ width: 390, height: 844 });
    expect(await page.isVisible('#mobile-warn'), '手機應顯示');
    await page.setViewportSize({ width: 1280, height: 900 });
  });

  // ===== 全程 JS 錯誤 =====
  console.log('全程檢查');
  await t('全程無 JS 錯誤、無本機 404', async () => {
    expect(pageErrors.length === 0, pageErrors.join('\n'));
  });

  await browser.close();
  srv.close();

  const fail = results.filter(r => !r.ok);
  console.log(`\n${results.length - fail.length}/${results.length} 通過；截圖：${path.relative(process.cwd(), SHOTS)}/`);
  process.exit(fail.length ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(2); });
