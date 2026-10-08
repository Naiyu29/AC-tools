import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseSurveyPoints, computeBounds, idw, elevationColor, parseCADList, densifyCenterline, centerlineLength,
  centerlineBounds, offsetFromCenterline, pointAtDistance, formatStation, batchStations, buildBatchSections, sampleProfile,
} from '../../docs/shared/dtm-math.js';

const close = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} ≠ ${b}`);

test('parseSurveyPoints：NEZ 與 XYZ 欄位對應', () => {
  const txt = '1\t2705664.491\t186194.696\t12.672\nbad line\n2 1 2';
  const nez = parseSurveyPoints(txt, 'nez');
  assert.deepEqual(nez, [{ id: '1', x: 186194.696, y: 2705664.491, z: 12.672 }]);
  const xyz = parseSurveyPoints(txt, 'xyz');
  assert.deepEqual(xyz, [{ id: '1', x: 2705664.491, y: 186194.696, z: 12.672 }]);
});

test('computeBounds', () => {
  assert.equal(computeBounds([]), null);
  assert.deepEqual(computeBounds([{ x: 0, y: 5, z: 1 }, { x: 2, y: 1, z: 3 }]), { minX: 0, maxX: 2, minY: 1, maxY: 5, minZ: 1, maxZ: 3 });
});

test('idw：命中點直接回傳、對稱點取平均、mask 外無效', () => {
  const pts = [{ x: 0, y: 0, z: 10 }, { x: 10, y: 0, z: 20 }];
  assert.deepEqual(idw(pts, 0, 0), { z: 10, valid: true });
  close(idw(pts, 5, 0).z, 15);
  assert.equal(idw(pts, 100, 0, 2, 20).valid, false);
  assert.equal(idw(pts, 5, 0, 2, 20).valid, true);
  assert.equal(idw([], 5, 0).valid, false);
});

test('elevationColor：低→藍、高→紅', () => {
  assert.equal(elevationColor(0, 0, 10), 'hsl(240, 100%, 50%)');
  assert.equal(elevationColor(10, 0, 10), 'hsl(0, 100%, 50%)');
  assert.equal(elevationColor(5, 5, 5), 'hsl(120, 100%, 50%)'); // 零範圍取中間色
});

test('parseCADList + densifyCenterline：直線段累計距離', () => {
  const v = parseCADList('在點  X=0.000  Y=0.000  Z=    0.000\n在點  X=30.000  Y=40.000  Z=    0.000');
  assert.equal(v.length, 2);
  const cl = densifyCenterline(v);
  assert.equal(cl.length, 2);
  close(centerlineLength(cl), 50);
  assert.deepEqual(centerlineBounds(cl), { minX: 0, maxX: 30, minY: 0, maxY: 40 });
  assert.deepEqual(densifyCenterline([v[0]]), []);
});

test('densifyCenterline：含凸度的弧段會加密', () => {
  // 半圓：從 (10,0) 繞中心 (0,0) 到 (-10,0)，凸度 1（逆時針）
  const v = [{ x: 10, y: 0, bulge: 1, cx: 0, cy: 0, radius: 10 }, { x: -10, y: 0, bulge: 0 }];
  const cl = densifyCenterline(v);
  assert.ok(cl.length > 10);
  cl.forEach(p => close(Math.hypot(p.x, p.y), 10, 1e-6));
  close(centerlineLength(cl), Math.PI * 10, 0.2);
});

test('offsetFromCenterline：左負右正', () => {
  const cl = densifyCenterline([{ x: 0, y: 0, bulge: 0 }, { x: 100, y: 0, bulge: 0 }]); // 向東
  close(offsetFromCenterline(cl, 50, 3), -3);  // 北側＝前進方向左側
  close(offsetFromCenterline(cl, 50, -4), 4);
  assert.equal(offsetFromCenterline([{ x: 0, y: 0 }], 1, 1), null);
});

test('pointAtDistance 與 formatStation', () => {
  const cl = densifyCenterline([{ x: 0, y: 0, bulge: 0 }, { x: 100, y: 0, bulge: 0 }]);
  const p = pointAtDistance(cl, 25);
  close(p.x, 25); close(p.y, 0); close(p.angle, 0);
  assert.equal(pointAtDistance(cl, 101), null);
  assert.equal(formatStation(20), '0K+020.00');
  assert.equal(formatStation(1234.5), '1K+234.50');
});

test('batchStations：起點、對齊間距、終點補上', () => {
  assert.deepEqual(batchStations(0, 20, 50), [0, 20, 40, 50]);
  assert.deepEqual(batchStations(5, 20, 55), [5, 20, 40, 60]);
  assert.deepEqual(batchStations(0, 20, 40), [0, 20, 40]);
});

test('buildBatchSections：左右端點與寬度一致', () => {
  const cl = densifyCenterline([{ x: 0, y: 0, bulge: 0 }, { x: 100, y: 0, bulge: 0 }]);
  const secs = buildBatchSections(cl, 0, 50, 4, 6);
  assert.deepEqual(secs.map(s => s.name), ['0K+000.00', '0K+050.00', '0K+100.00']);
  const s = secs[1];
  close(s.p1.x, 50); close(s.p1.y, 4);   // 左（北）
  close(s.p2.x, 50); close(s.p2.y, -6);  // 右（南）
  assert.equal(s.startOffset, -4); assert.equal(s.endOffset, 6);
});

test('sampleProfile：點數範圍與 offset 線性分布', () => {
  const pts = [{ x: 0, y: 0, z: 10 }, { x: 10, y: 0, z: 20 }];
  const prof = sampleProfile(pts, { x: 0, y: 0 }, { x: 10, y: 0 }, -5, 5, 2, 0);
  assert.equal(prof.length, 21);
  close(prof[0].offset, -5); close(prof[20].offset, 5);
  close(prof[0].z, 10); close(prof[20].z, 20);
  assert.deepEqual(sampleProfile(pts, { x: 1, y: 1 }, { x: 1, y: 1 }, 0, 0, 2, 0), []);
});
