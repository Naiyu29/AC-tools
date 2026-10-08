import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseElevationInput, formatInput, calculateSmoothCurve, threePointAverage, averageThicknessCm, toCSV } from '../../docs/shared/slope-math.js';

const close = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} ≠ ${b}`);

test('parseElevationInput：只有高程時自動補樁號 0,10,20', () => {
  assert.deepEqual(parseElevationInput('1.5\n1.6\n1.7'), { stations: [0, 10, 20], existingElevations: [1.5, 1.6, 1.7] });
});

test('parseElevationInput：樁號 高程 兩欄並依樁號排序，單欄行忽略', () => {
  const r = parseElevationInput('20 1.7\n0, 1.5\n10\t1.6\n9.9');
  assert.deepEqual(r, { stations: [0, 10, 20], existingElevations: [1.5, 1.6, 1.7] });
});

test('formatInput 與 parseElevationInput 互逆', () => {
  const txt = formatInput([0, 10], [1.5, 1.6]);
  assert.equal(txt, '0 1.5\n10 1.6');
  assert.deepEqual(parseElevationInput(txt), { stations: [0, 10], existingElevations: [1.5, 1.6] });
});

test('calculateSmoothCurve：厚度落在 [min,max]，平均接近目標', () => {
  const existing = [1.0, 1.02, 0.98, 1.05, 1.0, 0.97, 1.01, 1.0];
  const out = calculateSmoothCurve(existing, 5, 10, 8);
  assert.equal(out.length, existing.length);
  out.forEach((v, i) => {
    const t = (v - existing[i]) * 100;
    assert.ok(t >= 5 - 1e-9 && t <= 10 + 1e-9, `thickness ${t} out of range`);
  });
  close(averageThicknessCm(existing, out), 8, 0.5);
  assert.deepEqual(calculateSmoothCurve([], 5, 10, 8), []);
});

test('calculateSmoothCurve：平坦路面得到均一厚度', () => {
  const out = calculateSmoothCurve([2, 2, 2, 2], 5, 10, 7);
  out.forEach(v => close(v, 2.07));
});

test('threePointAverage 首尾不動', () => {
  assert.deepEqual(threePointAverage([0, 3, 6, 9]), [0, 3, 6, 9]);
  assert.deepEqual(threePointAverage([0, 9, 0]), [0, 3, 0]);
});

test('toCSV 格式', () => {
  const csv = toCSV([0, 10], [1, 1.1], [1.05, 1.18]);
  assert.equal(csv, '樁號,現有高程(m),完工高程(m),鋪設厚度(cm)\n0,1.000,1.050,5.0\n10,1.100,1.180,8.0\n');
});
