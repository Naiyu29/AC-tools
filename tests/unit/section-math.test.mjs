import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeNumericText, parseSectionData, formatSectionData, interpolate, findClosestPoint, sectionWidth,
  calculateSectionArea, createLowerBoundary, applyThickness, collectMileages, computeAreaDetails, computeVolumes,
  extractProfile, parseOffsetList, summaryBySpecificOffsets, summaryByInterval, exaggeratedAxisRange,
} from '../../docs/shared/section-math.js';

const close = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} ≠ ${b}`);

test('normalizeNumericText：全形數字、逗號、Tab 轉半形空格', () => {
  assert.equal(normalizeNumericText('１０，２０\t３０　４０'), '10 20 30 40');
});

test('parseSectionData：高程在前、支距在後，依支距排序', () => {
  const { dataMap, skipped } = parseSectionData('100 10.5 10.3 10.6 -3 0 3');
  assert.deepEqual(skipped, []);
  assert.deepEqual(dataMap[100], [{ x: -3, y: 10.5 }, { x: 0, y: 10.3 }, { x: 3, y: 10.6 }]);
});

test('parseSectionData：支距區含 0 時可自動辨識點數（多餘前置欄位被忽略）', () => {
  // 里程 + 多一個雜訊欄位 + 2 高程 + 2 支距（含 0）
  const { dataMap } = parseSectionData('50 999 10.1 10.2 0 1.4');
  assert.deepEqual(dataMap[50], [{ x: 0, y: 10.1 }, { x: 1.4, y: 10.2 }]);
});

test('parseSectionData：標題行靜默略過、數值不足與無法辨識列入 skipped', () => {
  const { dataMap, skipped } = parseSectionData('里程 高程 支距\n10 1.0\n20 1 2 3 4 5\n30 1.0 2.0 -1 1');
  assert.equal(Object.keys(dataMap).length, 1);
  assert.deepEqual(dataMap[30], [{ x: -1, y: 1.0 }, { x: 1, y: 2.0 }]);
  assert.equal(skipped.length, 2);
  assert.match(skipped[0], /數值不足/);
  assert.match(skipped[1], /格式無法辨識/);
});

test('parseSectionData：空字串回傳空結果', () => {
  assert.deepEqual(parseSectionData(''), { dataMap: {}, skipped: [] });
  assert.deepEqual(parseSectionData(null), { dataMap: {}, skipped: [] });
});

test('formatSectionData 與 parseSectionData 互逆', () => {
  const text = '0 10 11 12 -2 0 2\n20 10.5 11.5 12.5 -2 0 2';
  const { dataMap } = parseSectionData(text);
  assert.equal(formatSectionData(dataMap), text);
});

test('interpolate：線性內插、端點、超出範圍', () => {
  const pts = [{ x: 0, y: 0 }, { x: 10, y: 1 }];
  close(interpolate(pts, 5), 0.5);
  close(interpolate(pts, 0), 0);
  close(interpolate(pts, 10), 1);
  assert.equal(interpolate(pts, 11), null);
  assert.equal(interpolate([{ x: 0, y: 1 }], 0), null);
});

test('findClosestPoint / sectionWidth', () => {
  const pts = [{ x: -3, y: 1 }, { x: 0, y: 2 }, { x: 4, y: 3 }];
  assert.deepEqual(findClosestPoint(pts, 3), { x: 4, y: 3 });
  assert.equal(findClosestPoint([], 3), null);
  assert.equal(sectionWidth(pts), 7);
  assert.equal(sectionWidth([{ x: 1, y: 1 }]), 0);
});

test('calculateSectionArea：矩形刨除 5cm × 10m = 0.5 m²', () => {
  const top = [{ x: -5, y: 10.05 }, { x: 5, y: 10.05 }];
  const bot = [{ x: -5, y: 10.00 }, { x: 5, y: 10.00 }];
  const r = calculateSectionArea(top, bot);
  close(r.cutArea, 0.5);
  close(r.fillArea, 0);
  const r2 = calculateSectionArea(bot, top);
  close(r2.cutArea, 0); close(r2.fillArea, 0.5);
});

test('calculateSectionArea：交叉線各半分到 cut 與 fill', () => {
  const a = [{ x: 0, y: 0 }, { x: 10, y: 1 }];
  const b = [{ x: 0, y: 1 }, { x: 10, y: 0 }];
  const r = calculateSectionArea(a, b);
  close(r.cutArea, 2.5); close(r.fillArea, 2.5);
});

test('calculateSectionArea：支距不重疊的部分不計入', () => {
  const a = [{ x: 0, y: 1 }, { x: 10, y: 1 }];
  const b = [{ x: 5, y: 0 }, { x: 15, y: 0 }];
  const r = calculateSectionArea(a, b);
  close(r.cutArea, 5); // 只有 5~10 重疊
});

test('createLowerBoundary：逐支距取低者，單邊缺資料回另一邊', () => {
  const a = [{ x: 0, y: 1 }, { x: 10, y: 0 }];
  const b = [{ x: 0, y: 0 }, { x: 10, y: 1 }];
  assert.deepEqual(createLowerBoundary(a, b), [{ x: 0, y: 0 }, { x: 10, y: 0 }]);
  assert.deepEqual(createLowerBoundary([], b), b);
  assert.deepEqual(createLowerBoundary(a, null), a);
});

test('applyThickness / collectMileages', () => {
  const m = applyThickness({ 10: [{ x: 0, y: 5 }] }, 0.05);
  close(m[10][0].y, 4.95);
  assert.deepEqual(collectMileages({ 10: [] }, { 30: [], 20: [] }, {}), [30, 20, 10]);
});

test('computeAreaDetails + computeVolumes：平均斷面積法', () => {
  const ground = { 0: [{ x: -5, y: 10.05 }, { x: 5, y: 10.05 }], 20: [{ x: -5, y: 10.05 }, { x: 5, y: 10.05 }] };
  const milled = applyThickness(ground, 0.05);
  const paved  = { 0: [{ x: -5, y: 10.10 }, { x: 5, y: 10.10 }], 20: [{ x: -5, y: 10.10 }, { x: 5, y: 10.10 }] };
  const miles = collectMileages(ground, milled, paved);
  const d = computeAreaDetails(miles, ground, milled, paved);
  assert.equal(d.length, 2);
  close(d[0].planingArea, 0.5); close(d[0].avgPlaningThickness, 5);
  close(d[0].pavingArea, 1.0); close(d[0].avgPavingThickness, 10);
  const v = computeVolumes(d, { hasS3: true });
  close(v.planingVolume, 10);   // 0.5 m² × 20 m
  close(v.pavingVolume, 20);    // 1.0 m² × 20 m
  close(v.avgPlaningThickness, 5); close(v.avgPavingThickness, 10);
  assert.equal(computeVolumes(d, { hasS3: false }).pavingVolume, 0);
});

test('extractProfile：沿里程抽固定支距高程，里程由小到大', () => {
  const map = { 20: [{ x: -1, y: 2 }, { x: 1, y: 4 }], 0: [{ x: -1, y: 1 }, { x: 1, y: 3 }], 40: [{ x: 5, y: 9 }, { x: 6, y: 9 }] };
  assert.deepEqual(extractProfile(map, [40, 20, 0], 0), [{ x: 0, y: 2 }, { x: 20, y: 3 }]);
});

test('parseOffsetList', () => {
  assert.deepEqual(parseOffsetList('1.4 -1.4, 0 abc'), [-1.4, 0, 1.4]);
  assert.deepEqual(parseOffsetList(''), []);
});

test('summaryBySpecificOffsets：超出範圍改取最近點並標註', () => {
  const m1 = { 0: [{ x: -2, y: 1.10 }, { x: 2, y: 1.10 }] };
  const m2 = { 0: [{ x: -2, y: 1.05 }, { x: 2, y: 1.05 }] };
  const r = summaryBySpecificOffsets([0], m1, m2, [-3, 0]);
  assert.deepEqual(r.headers, ['支距 -3.00', '支距 0.00']);
  close(r.rows[0].data[0].value, 5); assert.equal(r.rows[0].data[0].note, '(近-2.00)');
  close(r.rows[0].data[1].value, 5); assert.equal(r.rows[0].data[1].note, '');
});

test('summaryByInterval：等間距含終點補點，結果依支距排序', () => {
  const m1 = { 0: [{ x: 0, y: 1.10 }, { x: 5, y: 1.10 }] };
  const m2 = { 0: [{ x: 0, y: 1.00 }, { x: 5, y: 1.00 }] };
  const l2r = summaryByInterval([0], m1, m2, 2, 'l2r');
  assert.deepEqual(l2r.rows[0].data.map(d => d.targetOffset), [0, 2, 4, 5]);
  assert.deepEqual(l2r.headers, ['點位 1', '點位 2', '點位 3', '點位 4']);
  const r2l = summaryByInterval([0], m1, m2, 2, 'r2l');
  assert.deepEqual(r2l.rows[0].data.map(d => d.targetOffset), [0, 1, 3, 5]);
  r2l.rows[0].data.forEach(d => close(d.value, 10));
});

test('exaggeratedAxisRange：V=1 時 x/y 像素比相等', () => {
  const r = exaggeratedAxisRange([0, 10], [0, 1], 1, 400, 200);
  const xr = r.x[1] - r.x[0], yr = r.y[1] - r.y[0];
  close((400 / xr) / (200 / yr), 1, 1e-9);
  assert.equal(exaggeratedAxisRange([0], [0], 1, 400, 200), null);
  assert.equal(exaggeratedAxisRange([0, 1], [0, 1], 0, 400, 200), null);
});
