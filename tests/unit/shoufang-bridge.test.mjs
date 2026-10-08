/*
 * B3 對照驗證：收方 Excel → tools/shoufang2actool.py → AC-tools 實際解析器。
 * 需要 python3 + openpyxl；缺少時跳過（不算失敗）。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseSectionData, collectMileages, computeAreaDetails, computeVolumes, applyThickness } from '../../docs/shared/section-math.js';
import { parseElevationInput } from '../../docs/shared/slope-math.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const py = (...args) => spawnSync('python3', ['-I', ...args], { encoding: 'utf-8' });
const hasPy = py('-c', 'import openpyxl').status === 0;

test('收方 Excel → 轉換器 → 斷面分析／縱坡 解析一致', { skip: !hasPy && 'python3/openpyxl 不可用' }, () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'shoufang-'));
  const xlsx = path.join(tmp, 'sample.xlsx');
  let r = py(path.join(ROOT, 'tests/fixtures/make_shoufang_sample.py'), xlsx);
  assert.equal(r.status, 0, r.stderr);
  const out = path.join(tmp, 'out', '刨除後');
  r = py(path.join(ROOT, 'tools/shoufang2actool.py'), xlsx, '--offsets', path.join(ROOT, 'tools/offsets.example.json'), '--layer', '刨除後', '--out', out);
  assert.equal(r.status, 0, r.stderr + r.stdout);

  // 1. 斷面文字能被斷面分析完整解析，無略過行
  const secText = fs.readFileSync(out + '.斷面.txt', 'utf-8');
  const { dataMap, skipped } = parseSectionData(secText);
  assert.deepEqual(skipped, []);
  assert.deepEqual(collectMileages(dataMap), [60, 40, 20, 0]);
  // 里程 40 有公車彎 → 6 點；其他 5 點；支距含 0 且已排序
  assert.equal(dataMap[40].length, 6);
  assert.equal(dataMap[0].length, 5);
  assert.deepEqual(dataMap[0].map(p => p.x), [-4.5, -2, 0, 1.5, 4.5]);
  // 高程＝測站高程＋後視−讀數：T1 HI=14.560，新路心讀數 1.70 → 12.860
  assert.equal(dataMap[0].find(p => p.x === 0).y, 12.86);
  // 交界重複觀測取平均：里程 40 新路心 (12.940+12.944)/2
  assert.equal(dataMap[40].find(p => p.x === 0).y, 12.942);

  // 2. 餵進體積計算不會壞（以 5 cm 刨除厚度推一層）
  const milled = applyThickness(dataMap, 0.05);
  const details = computeAreaDetails(collectMileages(dataMap), dataMap, milled, {});
  const v = computeVolumes(details, { hasS3: false });
  assert.ok(v.planingVolume > 0);
  assert.ok(Math.abs(v.avgPlaningThickness - 5) < 1e-6);

  // 3. 縱坡文字 → parseElevationInput
  const slope = parseElevationInput(fs.readFileSync(out + '.縱坡.txt', 'utf-8'));
  assert.deepEqual(slope.stations, [0, 20, 40, 60]);
  assert.deepEqual(slope.existingElevations, [12.86, 12.9, 12.942, 12.984]);

  // 4. JSON 匯入檔欄位與斷面分析 importData() 期望一致
  const imp = JSON.parse(fs.readFileSync(out + '.import.json', 'utf-8'));
  assert.deepEqual(Object.keys(imp).sort(), ['c', 'd1', 'd2', 'd3', 'n1', 'n2', 'n3']);
  assert.equal(imp.n2, '刨除後');
  assert.equal(imp.d2, secText.trim());
  assert.equal(imp.c, '-6 -4.5 -2 0 1.5 4.5');

  // 5. report 有交界重複觀測紀錄
  const report = fs.readFileSync(out + '.report.txt', 'utf-8');
  assert.match(report, /里程 40「新路心」重複觀測 2 次/);

  // 6. --merge 三層合一
  const out3 = path.join(tmp, 'out', '舖築後');
  r = py(path.join(ROOT, 'tools/shoufang2actool.py'), xlsx, '--offsets', path.join(ROOT, 'tools/offsets.example.json'), '--layer', '舖築後', '--out', out3);
  assert.equal(r.status, 0, r.stderr);
  const merged = path.join(tmp, 'out', '合併');
  r = py(path.join(ROOT, 'tools/shoufang2actool.py'), '--merge', out + '.import.json', out3 + '.import.json', '--out', merged);
  assert.equal(r.status, 0, r.stderr);
  const m = JSON.parse(fs.readFileSync(merged + '.import.json', 'utf-8'));
  assert.equal(m.n2, '刨除後'); assert.equal(m.n3, '舖築後'); assert.equal(m.d1, '');
  fs.rmSync(tmp, { recursive: true, force: true });
});
