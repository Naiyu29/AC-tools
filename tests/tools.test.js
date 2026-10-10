/**
 * AC 工具集計算回歸測試。每一組資料的答案都可以手算，註解寫了怎麼算。
 *
 *   cd tests && npm install && npx playwright install chromium && npm test
 */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { setup, teardown, open } = require('./harness');

test.before(setup);
test.after(teardown);

// ─── 斷面分析 ──────────────────────────────────────────────────
const OFF = [-3, -1.5, 0, 1.5, 3];                               // 寬 6 m
const line = (m, z) => [m, ...OFF.map(() => z), ...OFF].join(' ');
const sec = (ms, z) => ms.map(m => line(m, z)).join('\n');

async function analyse(d1, d2, d3, opts) {
  const t = await open('AC-斷面分析', opts);
  await t.p.evaluate(() => { try { localStorage.clear(); } catch (e) {} });
  await t.p.fill('#section1Data', d1);
  await t.p.fill('#section2Data', d2);
  await t.p.fill('#section3Data', d3);
  await t.p.click('#processButton');
  await t.p.waitForTimeout(300);
  const vol = (await t.p.textContent('#totalVolumeDisplay')).replace(/\s+/g, ' ');
  const err = (await t.p.textContent('#error-message')).trim();
  const rows = await t.p.$$eval('#areaTableContainer tbody tr', trs => trs.map(r => [...r.children].map(c => c.textContent.trim())));
  const num = re => { const m = re.exec(vol); return m ? +m[1] : null; };
  const out = {
    vol, err, rows, errors: t.errors, p: t.p,
    planing: num(/總刨除量: ([\d.]+)/), paving: num(/總舖築量: ([\d.]+)/),
    planingT: num(/平均刨除厚度: ([\d.]+)/), pavingT: num(/平均舖築厚度: ([\d.]+)/),
  };
  out.close = t.close;
  return out;
}

test('斷面分析：基準（原地面 10.00、刨除後 9.95、舖築後 10.02，兩站相距 20 m）', async () => {
  // 刨除面積 0.05×6 = 0.300 m²，量 0.3×20 = 6.000 m³；舖築 0.07×6 = 0.420 m²，量 8.400 m³
  const r = await analyse(sec([100, 120], 10), sec([100, 120], 9.95), sec([100, 120], 10.02));
  assert.equal(r.err, '');
  assert.equal(r.planing, 6.000);
  assert.equal(r.paving, 8.400);
  assert.equal(r.planingT, 5.00);
  assert.equal(r.pavingT, 7.00);
  assert.deepEqual(r.rows.map(x => x[1]), ['0.300', '0.300']);
  assert.deepEqual(r.errors, []);
  await r.close();
});

test('斷面分析：舖築後少測一站時不能把那一站當成 0（以前少算一半）', async () => {
  // 原地面／刨除後在 100、110、120；舖築後只有 100、120 → 舖築量仍是 0.42×20 = 8.400
  const r = await analyse(sec([100, 110, 120], 10), sec([100, 110, 120], 9.95), sec([100, 120], 10.02));
  assert.equal(r.planing, 6.000);
  assert.equal(r.paving, 8.400);
  assert.equal(r.pavingT, 7.00);
  assert.match(r.vol, /里程 110 缺少舖築後斷面/);
  assert.ok(r.rows.some(x => x[0] === '110' && x.includes('缺斷面，不列入')));
  await r.close();
});

test('斷面分析：樁號寫成 0+100、1K+100 也要認得（以前整份被丟掉）', async () => {
  const r = await analyse(sec(['0+100', '0+120'], 10), sec(['0+100', '0+120'], 9.95), sec(['0+100', '0+120'], 10.02));
  assert.equal(r.err, '');
  assert.equal(r.planing, 6.000);
  assert.equal(r.paving, 8.400);
  await r.close();
  const k = await analyse(sec(['1K+100', '1k+120'], 10), sec(['1K+100', '1k+120'], 9.95), '');
  assert.deepEqual(k.rows.map(x => x[0]), ['1120', '1100']);
  assert.equal(k.planing, 6.000);
  await k.close();
});

test('斷面分析：側溝／緣石立面（同一支距兩個高程）不能被拉成斜線（以前多算 8%）', async () => {
  // 支距 3 有立面：頂 10.00（刨除後 9.95）、底 9.80；3～4 兩面相同。刨除 0.05×6 = 0.300 m²
  // 舖築後 10.02 在 -3～3：舖築 0.07×6 = 0.420 m²
  const g = s => `${s} 10 10 10 9.8 9.8 -3 0 3 3 4`;
  const m = s => `${s} 9.95 9.95 9.95 9.8 9.8 -3 0 3 3 4`;
  const pv = s => `${s} 10.02 10.02 10.02 9.8 9.8 -3 0 3 3 4`;
  const r = await analyse([g(100), g(120)].join('\n'), [m(100), m(120)].join('\n'), [pv(100), pv(120)].join('\n'));
  assert.deepEqual(r.rows.map(x => x[1]), ['0.300', '0.300']);
  assert.deepEqual(r.rows.map(x => x[3]), ['0.420', '0.420']);
  assert.equal(r.planing, 6.000);
  assert.equal(r.paving, 8.400);
  await r.close();
});

test('斷面分析：兩斷面交叉時刨除與舖築分開算', async () => {
  // 刨除後從 -3 的 9.90 斜到 3 的 10.10，原地面平 10.00：交點在 0
  // 左半刨除 = ½×0.10×3 = 0.150；右半「刨除後高於原地面」不算刨除
  const r = await analyse(sec([100, 120], 10), [100, 120].map(s => [s, 9.9, 9.95, 10, 10.05, 10.1, ...OFF].join(' ')).join('\n'), '');
  assert.deepEqual(r.rows.map(x => x[1]), ['0.150', '0.150']);
  await r.close();
});

test('斷面分析：連不到 Google 雲端時計算照常（以前整支程式沒反應）', async () => {
  const r = await analyse(sec([100, 120], 10), sec([100, 120], 9.95), sec([100, 120], 10.02), { firebase: 'block' });
  assert.equal(r.planing, 6.000);
  assert.equal(r.paving, 8.400);
  assert.match(await r.p.textContent('#auth-bar'), /雲端未連線/);
  assert.match(await r.p.textContent('#saved-list'), /連不到雲端資料庫/);
  assert.deepEqual(r.errors, []);
  await r.close();
});

test('斷面分析：各結果頁籤與總表不出錯', async () => {
  const ms = [100, 110, 120, 130];
  const f = (d) => ms.map(m => [m, ...OFF.map(x => (10 + m * 0.001 - Math.abs(x) * 0.02 + d).toFixed(3)), ...OFF].join(' ')).join('\n');
  const r = await analyse(f(0), f(-0.05), f(0.03));
  // 30 m × 6 m × 5 cm = 9.000；舖築 8 cm（3 cm 加上刨掉的 5 cm）= 14.400
  assert.equal(r.planing, 9.000);
  assert.equal(r.paving, 14.400);
  for (const tab of ['indiv', 'all', 'thick', 'volume', 'profile']) {
    await r.p.click(`.tab-btn[data-tab="${tab}"]`);
    await r.p.waitForTimeout(150);
  }
  await r.p.click('.tab-btn[data-tab="thick"]');
  await r.p.click('#summaryButton');
  await r.p.waitForTimeout(300);
  const first = await r.p.$$eval('#summaryTableContainer tbody tr', trs => trs.length);
  assert.equal(first, 4);
  assert.deepEqual(r.errors, []);
  await r.close();
});

// ─── 縱坡 ──────────────────────────────────────────────────────
async function slope(text, opts) {
  const t = await open('AC-縱坡', opts);
  await t.p.evaluate(() => { try { localStorage.clear(); } catch (e) {} });
  await t.p.fill('#minThickness', '3');
  await t.p.fill('#maxThickness', '10');
  await t.p.fill('#avgThickness', '5');
  await t.p.fill('#dataInput', text);
  await t.p.click('#recalculateBtn');
  await t.p.waitForTimeout(250);
  const rows = await t.p.$$eval('#dataTable tbody tr', trs => trs.map(r => [...r.children].map(c => (c.querySelector('input')?.value ?? c.textContent).trim())));
  return { t, rows, info: (await t.p.textContent('#infoText')).trim() };
}
const Z = [10, 10.05, 10.02, 9.98, 10.10, 10.06, 10.0];

test('縱坡：厚度都在最小～最大之間，平均等於目標', async () => {
  const { t, rows, info } = await slope(Z.map((v, i) => `${i * 20} ${v}`).join('\n'));
  const th = rows.map(r => +r[4]);
  assert.ok(th.every(x => x >= 3 - 1e-9 && x <= 10 + 1e-9), th.join(','));
  assert.match(info, /平均厚度約為: 5\.00 公分/);
  assert.deepEqual(t.errors, []);
  await t.close();
});

test('縱坡：樁號寫成 0+020、1K+020（以前會被丟掉）；雲端連不上也能算', async () => {
  const a = await slope(Z.map((v, i) => `0+${String(i * 20).padStart(3, '0')} ${v}`).join('\n'));
  assert.deepEqual(a.rows.map(r => r[0]), ['0m', '20m', '40m', '60m', '80m', '100m', '120m']);
  await a.t.close();
  const b = await slope(Z.map((v, i) => `1K+${String(i * 20).padStart(3, '0')} ${v}`).join('\n'), { firebase: 'block' });
  assert.equal(b.rows[0][0], '1000m');
  assert.match(b.info, /平均厚度約為: 5\.00/);
  assert.match(await b.t.p.textContent('#auth-bar'), /雲端未連線/);
  assert.deepEqual(b.t.errors, []);
  await b.t.close();
});

// ─── 地形測量 ──────────────────────────────────────────────────
test('地形測量：空白、Tab、逗號（CSV，可帶點代碼）都讀得進來（以前 CSV 讀到 0 點）', async () => {
  const t = await open('AC-地形測量');
  const pts = [];
  let i = 1;
  for (let n = 0; n <= 40; n += 5) for (let e = 0; e <= 20; e += 5) pts.push([i++, 2705600 + n, 186100 + e, (10 + 0.01 * n + 0.02 * e).toFixed(3)]);
  for (const [sep, tail] of [[' ', ''], ['\t', ''], [',', ''], [',', ',AC']]) {
    await t.p.fill('#inputData', pts.map(r => r.join(sep) + tail).join('\n'));
    await t.p.evaluate(() => app.parseData());
    assert.equal(await t.p.textContent('#pointCount'), '45', JSON.stringify(sep + tail));
  }
  // NEZ：北在前、東在後。測點 (N 2705610, E 186105) 高程 10 + 0.1 + 0.1
  assert.equal(await t.p.evaluate(() => app.calculateIDW(186105, 2705610).z.toFixed(3)), '10.200');
  assert.deepEqual(t.errors, []);
  await t.close();
});

test('地形測量：樁號顯示先四捨五入再進位（以前 1999.999 顯示成 1K+1000.00）', async () => {
  const t = await open('AC-地形測量');
  const s = await t.p.evaluate(() => [0, 120, 1020.5, 1999.999, 2000].map(x => app.formatStation(x)));
  assert.deepEqual(s, ['0K+000.00', '0K+120.00', '1K+020.50', '2K+000.00', '2K+000.00']);
  await t.close();
});
