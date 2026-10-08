/*
 * AC 工具集 — 地形測量 (DTM) 共用計算模組（純函式，無 DOM 依賴）
 * 由 AC-地形測量/index.html 匯入；tests/unit 做單元測試。
 *
 * 座標慣例：x = 東 (E)、y = 北 (N)、z = 高程。
 */

/**
 * 解析測點文字：每行 `點號 v1 v2 Z`，format='nez' 時 v1=北(y) v2=東(x)；'xyz' 時 v1=東(x) v2=北(y)。
 * 欄數不足 4 或數值無效的行略過。
 */
export function parseSurveyPoints(rawText, format = 'nez') {
  const points = [];
  String(rawText ?? '').trim().split('\n').forEach(line => {
    const parts = line.trim().split(/\s+/);
    if (parts.length < 4) return;
    const id = parts[0];
    const v1 = parseFloat(parts[1]), v2 = parseFloat(parts[2]), z = parseFloat(parts[3]);
    if (isNaN(v1) || isNaN(v2) || isNaN(z)) return;
    const [x, y] = format === 'nez' ? [v2, v1] : [v1, v2];
    points.push({ id, x, y, z });
  });
  return points;
}

/** 點集外框；空集合回傳 null。 */
export function computeBounds(points) {
  if (!points || points.length === 0) return null;
  const xs = points.map(p => p.x), ys = points.map(p => p.y), zs = points.map(p => p.z);
  return {
    minX: Math.min(...xs), maxX: Math.max(...xs),
    minY: Math.min(...ys), maxY: Math.max(...ys),
    minZ: Math.min(...zs), maxZ: Math.max(...zs),
  };
}

/**
 * 反距離加權內插 (IDW)。
 * maskRadius > 0 時：距最近點超過 maskRadius 視為無效；超過 2×maskRadius 的點不參與加權。
 * @returns {{z:number, valid:boolean}}
 */
export function idw(points, targetX, targetY, power = 2, maskRadius = 0) {
  let num = 0, den = 0, minDist = Infinity;
  for (const p of points) {
    const dx = targetX - p.x, dy = targetY - p.y, d = Math.sqrt(dx * dx + dy * dy);
    if (d < minDist) minDist = d;
    if (d < 1e-8) return { z: p.z, valid: true };
    if (maskRadius > 0 && d > maskRadius * 2) continue;
    const w = 1 / Math.pow(d, power); num += w * p.z; den += w;
  }
  if (maskRadius > 0 && minDist > maskRadius) return { z: 0, valid: false };
  if (den === 0) return { z: 0, valid: false };
  return { z: num / den, valid: true };
}

/** 高程 → 色相（藍 240 → 紅 0）HSL 字串。 */
export function elevationColor(z, min, max) {
  let norm = (z - min) / (max - min);
  if (!isFinite(norm)) norm = 0.5;
  norm = Math.max(0, Math.min(1, norm));
  return `hsl(${(1 - norm) * 240}, 100%, 50%)`;
}

/**
 * 解析 AutoCAD LIST 指令輸出的 Polyline 頂點（含凸度／中心點／半徑）。
 * 回傳 [{x, y, bulge, cx?, cy?, radius?}]。
 */
export function parseCADList(text) {
  const regexPoint = /在點\s+X=\s*([\-\d.]+)\s+Y=\s*([\-\d.]+)/;
  const regexBulge = /凸度\s+([\-\d.]+)/;
  const regexCenter = /中心點\s+X=\s*([\-\d.]+)\s+Y=\s*([\-\d.]+)/;
  const regexRadius = /半徑\s+([\-\d.]+)/;
  const vertices = [];
  let cur = {};
  for (const line of String(text ?? '').split('\n')) {
    let m;
    if ((m = line.match(regexPoint))) {
      if (cur.x !== undefined) vertices.push(cur);
      cur = { x: parseFloat(m[1]), y: parseFloat(m[2]), bulge: 0 };
    } else if ((m = line.match(regexBulge))) { cur.bulge = parseFloat(m[1]);
    } else if ((m = line.match(regexCenter))) { cur.cx = parseFloat(m[1]); cur.cy = parseFloat(m[2]);
    } else if ((m = line.match(regexRadius))) { cur.radius = parseFloat(m[1]); }
  }
  if (cur.x !== undefined) vertices.push(cur);
  return vertices;
}

/**
 * 將含凸度的頂點串展成折線（弧段每約 2 m 一點），並附加累計距離 dist。
 * 頂點數 < 2 回傳 []。
 */
export function densifyCenterline(vertices) {
  if (!vertices || vertices.length < 2) return [];
  const pts = [];
  for (let i = 0; i < vertices.length - 1; i++) {
    const p1 = vertices[i], p2 = vertices[i + 1];
    pts.push({ x: p1.x, y: p1.y });
    if (Math.abs(p1.bulge || 0) > 1e-6) {
      if (p1.cx === undefined || p1.radius === undefined) continue;
      const cx = p1.cx, cy = p1.cy, r = p1.radius;
      let ang1 = Math.atan2(p1.y - cy, p1.x - cx), ang2 = Math.atan2(p2.y - cy, p2.x - cx);
      if (p1.bulge < 0) { if (ang2 > ang1) ang2 -= Math.PI * 2; } else { if (ang2 < ang1) ang2 += Math.PI * 2; }
      const steps = Math.ceil(Math.abs(ang2 - ang1) * r / 2.0);
      for (let j = 1; j < steps; j++) {
        const ang = ang1 + (ang2 - ang1) * (j / steps);
        pts.push({ x: cx + r * Math.cos(ang), y: cy + r * Math.sin(ang) });
      }
    }
  }
  const last = vertices[vertices.length - 1];
  pts.push({ x: last.x, y: last.y });
  let total = 0; pts[0].dist = 0;
  for (let i = 1; i < pts.length; i++) {
    total += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
    pts[i].dist = total;
  }
  return pts;
}

/** 折線總長（最後一點的 dist）。 */
export function centerlineLength(cl) {
  return cl && cl.length ? cl[cl.length - 1].dist : 0;
}

/** 中心線外框；空陣列回傳 null。 */
export function centerlineBounds(cl) {
  if (!cl || cl.length === 0) return null;
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const p of cl) {
    if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y; if (p.y > maxY) maxY = p.y;
  }
  return { minX, maxX, minY, maxY };
}

/**
 * 點到中心線的垂距（沿前進方向左負右正）。中心線 < 2 點回傳 null。
 */
export function offsetFromCenterline(cl, x, y) {
  if (!cl || cl.length < 2) return null;
  let minDist2 = Infinity, offset = 0;
  for (let i = 0; i < cl.length - 1; i++) {
    const A = cl[i], B = cl[i + 1];
    if (minDist2 !== Infinity) {
      const r = Math.sqrt(minDist2);
      if (x < Math.min(A.x, B.x) - r || x > Math.max(A.x, B.x) + r) continue;
      if (y < Math.min(A.y, B.y) - r || y > Math.max(A.y, B.y) + r) continue;
    }
    const dx = B.x - A.x, dy = B.y - A.y, len2 = dx * dx + dy * dy;
    if (len2 === 0) continue;
    let t = ((x - A.x) * dx + (y - A.y) * dy) / len2;
    t = Math.max(0, Math.min(1, t));
    const px = A.x + t * dx, py = A.y + t * dy;
    const d2 = (x - px) ** 2 + (y - py) ** 2;
    if (d2 < minDist2) {
      minDist2 = d2;
      const cross = dx * (y - A.y) - dy * (x - A.x);
      offset = (cross > 0) ? -Math.sqrt(d2) : Math.sqrt(d2);
    }
  }
  return offset;
}

/** 中心線上距起點 targetDist 的點與切線方位角；超出範圍回傳 null。 */
export function pointAtDistance(cl, targetDist) {
  for (let i = 0; i < cl.length - 1; i++) {
    const p1 = cl[i], p2 = cl[i + 1];
    if (targetDist >= p1.dist && targetDist <= p2.dist) {
      const seg = p2.dist - p1.dist;
      if (seg === 0) return { x: p1.x, y: p1.y, angle: 0 };
      const t = (targetDist - p1.dist) / seg;
      return { x: p1.x + (p2.x - p1.x) * t, y: p1.y + (p2.y - p1.y) * t, angle: Math.atan2(p2.y - p1.y, p2.x - p1.x) };
    }
  }
  return null;
}

/** 樁號格式 `0K+020.00`。 */
export function formatStation(st) {
  return `${Math.floor(st / 1000)}K+${(st % 1000).toFixed(2).padStart(6, '0')}`;
}

/** 批量斷面的樁號序列：起點、對齊 interval 的整數倍、以及終點（若未被整除）。 */
export function batchStations(startStation, interval, totalLength) {
  const out = [startStation];
  let next = Math.ceil(startStation / interval) * interval;
  if (next === startStation) next += interval;
  while (next <= startStation + totalLength) { out.push(next); next += interval; }
  if (out[out.length - 1] < startStation + totalLength - 0.01) out.push(startStation + totalLength);
  return out;
}

/**
 * 依樁號序列在中心線上建立橫斷面端點（左 p1、右 p2）。
 * @returns {{station, p1, p2, name, startOffset, endOffset}[]}
 */
export function buildBatchSections(cl, startStation, interval, widthL, widthR) {
  const total = centerlineLength(cl);
  const sections = [];
  for (const st of batchStations(startStation, interval, total)) {
    const info = pointAtDistance(cl, st - startStation);
    if (!info) continue;
    const nx = -Math.sin(info.angle), ny = Math.cos(info.angle);
    sections.push({
      station: st,
      p1: { x: info.x + nx * widthL, y: info.y + ny * widthL },
      p2: { x: info.x - nx * widthR, y: info.y - ny * widthR },
      name: formatStation(st),
      startOffset: -widthL,
      endOffset: widthR,
    });
  }
  return sections;
}

/**
 * 沿 p1→p2 直線以 IDW 取樣高程剖面（每 0.5 m 一點，10～200 點）。
 * @returns {{offset:number, z:number|null}[]}
 */
export function sampleProfile(points, p1, p2, startOffset, endOffset, power, maskRadius) {
  const total = Math.hypot(p2.x - p1.x, p2.y - p1.y);
  if (total === 0) return [];
  const steps = Math.max(10, Math.min(200, Math.ceil(total / 0.5)));
  const out = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const res = idw(points, p1.x + (p2.x - p1.x) * t, p1.y + (p2.y - p1.y) * t, power, maskRadius);
    out.push({ offset: startOffset + (endOffset - startOffset) * t, z: res.valid ? res.z : null });
  }
  return out;
}
