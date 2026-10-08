/*
 * AC 工具集 — 斷面分析共用計算模組（純函式，無 DOM 依賴）
 *
 * 資料模型：
 *   dataMap  = { [里程:number]: Point[] }      一個里程一組斷面
 *   Point    = { x: 支距(m), y: 高程(m) }        依 x 由小到大排序
 *
 * 瀏覽器端由 AC-斷面分析/index.html 以 <script type="module"> 匯入；
 * Node 端由 tests/unit/*.test.mjs 匯入做單元測試。
 */

/** 全形→半形、逗號/Tab→空格，供各工具的文字輸入共用。 */
export function normalizeNumericText(text) {
  return String(text ?? '')
    .replace(/　/g, ' ')
    .replace(/[，、,]/g, ' ')
    .replace(/\t/g, ' ')
    .replace(/[！-～]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
}

/**
 * 解析斷面文字。每行：`里程 高程1 … 高程k 支距1 … 支距k`
 * 判斷規則：從最大的 k 往下找，取「支距區含 0」的切法；都找不到且數值為偶數個時，前半高程、後半支距。
 * 第一個 token 非數字的行（標題）靜默略過；數值不足 3 個或無法切分者記入 skipped。
 * @returns {{ dataMap: Record<number, {x:number,y:number}[]>, skipped: string[] }}
 */
export function parseSectionData(dataString) {
  const dataMap = {};
  const skipped = [];
  if (!dataString || dataString.trim() === '') return { dataMap, skipped };

  const normalized = normalizeNumericText(dataString);

  normalized.trim().split('\n').forEach((line, index) => {
    if (line.trim() === '') return;
    const rawTokens = line.trim().split(/\s+/);
    if (isNaN(rawTokens[0]) || rawTokens[0] === '') return;
    const values = rawTokens.filter(v => v !== '' && !isNaN(v)).map(Number);
    if (values.length < 3) {
      skipped.push(`第 ${index + 1} 行（「${line.trim().substring(0, 30)}」）：數值不足，已略過`);
      return;
    }
    const mileage = values.shift();
    let found = false;
    for (let k = Math.floor(values.length / 2); k >= 1; k--) {
      if (values.length >= k * 2) {
        const dataBlock = values.slice(values.length - k * 2);
        const potentialElevations = dataBlock.slice(0, k);
        const potentialOffsets = dataBlock.slice(k);
        if (potentialOffsets.includes(0)) {
          dataMap[mileage] = Array.from({ length: k }, (_, i) => ({ x: potentialOffsets[i], y: potentialElevations[i] })).sort((a, b) => a.x - b.x);
          found = true;
          break;
        }
      }
    }
    if (!found && values.length % 2 === 0) {
      const k = values.length / 2;
      const elevations = values.slice(0, k);
      const offsets = values.slice(k);
      dataMap[mileage] = Array.from({ length: k }, (_, i) => ({ x: offsets[i], y: elevations[i] })).sort((a, b) => a.x - b.x);
    } else if (!found) {
      skipped.push(`第 ${index + 1} 行（「${line.trim().substring(0, 30)}」）：格式無法辨識，已略過`);
    }
  });
  return { dataMap, skipped };
}

/** 將一組斷面文字反向組回輸入格式（匯出／轉換用）。 */
export function formatSectionData(dataMap) {
  return Object.keys(dataMap).map(Number).sort((a, b) => a - b).map(m => {
    const pts = dataMap[m];
    return [m, ...pts.map(p => p.y), ...pts.map(p => p.x)].join(' ');
  }).join('\n');
}

/** 線性內插；x 超出範圍或點數不足回傳 null。 */
export function interpolate(points, x) {
  if (!points || points.length < 2) return null;
  let p1 = null, p2 = null;
  for (let i = 0; i < points.length - 1; i++) {
    if (points[i].x <= x && points[i + 1].x >= x) { p1 = points[i]; p2 = points[i + 1]; break; }
  }
  if (!p1 || !p2) return null;
  if (p2.x === p1.x) return p1.y;
  return p1.y + (x - p1.x) * (p2.y - p1.y) / (p2.x - p1.x);
}

/** 距 x 最近的量測點；空陣列回傳 null。 */
export function findClosestPoint(points, x) {
  return points && points.length > 0 ? points.reduce((p, c) => (Math.abs(c.x - x) < Math.abs(p.x - x) ? c : p)) : null;
}

/** 斷面寬度（最大支距 − 最小支距）；點數 < 2 回傳 0。 */
export function sectionWidth(points) {
  if (!points || points.length < 2) return 0;
  const xs = points.map(p => p.x);
  return Math.max(...xs) - Math.min(...xs);
}

/**
 * 兩條折線之間的面積（梯形法，含交叉處理）。
 * cutArea：p1 高於 p2 的部分（刨除）；fillArea：p2 高於 p1 的部分（舖築）。
 */
export function calculateSectionArea(p1, p2) {
  let cut = 0, fill = 0;
  if (!p1 || !p2 || p1.length === 0 || p2.length === 0) return { cutArea: 0, fillArea: 0 };
  const allOffsets = [...new Set([...p1.map(p => p.x), ...p2.map(p => p.x)])].sort((a, b) => a - b);
  for (let i = 0; i < allOffsets.length - 1; i++) {
    const x1 = allOffsets[i], x2 = allOffsets[i + 1];
    const y1_s = interpolate(p1, x1), y2_s = interpolate(p2, x1), y1_e = interpolate(p1, x2), y2_e = interpolate(p2, x2);
    if (y1_s === null || y2_s === null || y1_e === null || y2_e === null) continue;
    const h1 = y1_s - y2_s, h2 = y1_e - y2_e, w = x2 - x1;
    if (h1 * h2 >= 0) {
      const a = (h1 + h2) / 2 * w;
      if (a > 0) cut += a; else fill -= a;
    } else {
      const m1 = (y1_e - y1_s) / w, m2 = (y2_e - y2_s) / w;
      if (m1 === m2) continue;
      const iX = x1 + (y2_s - y1_s) / (m1 - m2);
      const a1 = 0.5 * h1 * (iX - x1); if (a1 > 0) cut += a1; else fill -= a1;
      const a2 = 0.5 * h2 * (x2 - iX); if (a2 > 0) cut += a2; else fill -= a2;
    }
  }
  return { cutArea: cut, fillArea: fill };
}

/** 取兩條線的下包絡線（逐支距取較低者），作為舖築量的底。任一邊為空則回傳另一邊。 */
export function createLowerBoundary(p1, p2) {
  if (!p1 || p1.length === 0) return p2 || [];
  if (!p2 || p2.length === 0) return p1 || [];
  const out = [];
  const allOffsets = [...new Set([...p1.map(p => p.x), ...p2.map(p => p.x)])].sort((a, b) => a - b);
  for (const x of allOffsets) {
    const y1 = interpolate(p1, x);
    const y2 = interpolate(p2, x);
    if (y1 !== null && y2 !== null) out.push({ x, y: Math.min(y1, y2) });
    else if (y1 !== null) out.push({ x, y: y1 });
    else if (y2 !== null) out.push({ x, y: y2 });
  }
  return out;
}

/** 由基準斷面整體下移 thicknessM（公尺）推算刨除後斷面。 */
export function applyThickness(baseMap, thicknessM) {
  const out = {};
  for (const mileage in baseMap) {
    if (baseMap[mileage]) out[mileage] = baseMap[mileage].map(p => ({ x: p.x, y: p.y - thicknessM }));
  }
  return out;
}

/** 合併多個 dataMap 的里程，由大到小排序（與頁面選單順序一致）。 */
export function collectMileages(...maps) {
  const set = new Set();
  maps.forEach(m => Object.keys(m || {}).forEach(k => set.add(k)));
  return Array.from(set).map(Number).sort((a, b) => b - a);
}

/**
 * 每個里程的刨除／舖築面積與平均厚度（cm）。
 * @param {number[]} mileages 排序後里程
 */
export function computeAreaDetails(mileages, map1, map2, map3) {
  return mileages.map(m => {
    const p1 = (map1 && map1[m]) || [];
    const p2 = (map2 && map2[m]) || [];
    const p3 = (map3 && map3[m]) || [];
    const planing = calculateSectionArea(p1, p2);
    const lower = createLowerBoundary(p1, p2);
    const paving = calculateSectionArea(lower, p3);
    const planingWidth = sectionWidth(p1);
    const pavingBoundary = (p3 && p3.length > 1) ? p3 : (lower.length > 1 ? lower : []);
    const pavingWidth = sectionWidth(pavingBoundary);
    return {
      mileage: m,
      planingArea: planing.cutArea,
      pavingArea: paving.fillArea,
      avgPlaningThickness: planingWidth > 0 ? (planing.cutArea / planingWidth) * 100 : 0,
      avgPavingThickness: pavingWidth > 0 ? (paving.fillArea / pavingWidth) * 100 : 0,
    };
  });
}

/** 平均斷面積法（相鄰斷面面積平均 × 里程差）求總量。 */
export function computeVolumes(areaDetails, { hasS3 = true } = {}) {
  let planingVolume = 0, pavingVolume = 0;
  for (let i = 0; i < areaDetails.length - 1; i++) {
    const s1 = areaDetails[i], s2 = areaDetails[i + 1];
    const dist = Math.abs(s1.mileage - s2.mileage);
    planingVolume += ((s1.planingArea + s2.planingArea) / 2) * dist;
    if (hasS3) pavingVolume += ((s1.pavingArea + s2.pavingArea) / 2) * dist;
  }
  const n = areaDetails.length || 1;
  return {
    planingVolume,
    pavingVolume,
    avgPlaningThickness: areaDetails.reduce((s, d) => s + d.avgPlaningThickness, 0) / n,
    avgPavingThickness: areaDetails.reduce((s, d) => s + d.avgPavingThickness, 0) / n,
  };
}

/** 沿里程方向在固定支距抽取某層高程 → 縱向剖面點 [{x: 里程, y: 高程}]（里程由小到大）。 */
export function extractProfile(map, mileages, offset) {
  const pts = [];
  mileages.slice().sort((a, b) => a - b).forEach(m => {
    const sec = map && map[m];
    if (!sec || sec.length === 0) return;
    const y = interpolate(sec, offset);
    if (y !== null) pts.push({ x: m, y });
  });
  return pts;
}

/** 把「-5.6 -4.2 0 1.4」這類字串解析成排序後的支距陣列。 */
export function parseOffsetList(text) {
  return String(text ?? '').trim().split(/[\s,]+/).map(Number).filter(n => !isNaN(n) && text.trim() !== '').sort((a, b) => a - b);
}

/**
 * 刨鋪厚度總表（指定支距法）。
 * 支距超出量測範圍時改取最近點，並以 note 標註。
 * @returns {{ headers: string[], rows: {mileage:number, data:{value:number|null, note:string, targetOffset:number}[]}[] }}
 */
export function summaryBySpecificOffsets(mileages, map1, map2, offsets) {
  const headers = offsets.map(o => `支距 ${o.toFixed(2)}`);
  const rows = mileages.map(m => {
    const p1 = (map1 && map1[m]) || [], p2 = (map2 && map2[m]) || [];
    const data = offsets.map(offset => {
      let y1 = interpolate(p1, offset), y2 = interpolate(p2, offset), noteOffset = null;
      if (y1 === null && p1.length > 0) { const c = findClosestPoint(p1, offset); y1 = c.y; noteOffset = c.x; }
      if (y2 === null && p2.length > 0) { const c = findClosestPoint(p2, offset); y2 = c.y; noteOffset = noteOffset || c.x; }
      const diff = (y1 !== null && y2 !== null) ? (y1 - y2) * 100 : null;
      return { value: diff, note: noteOffset !== null ? `(近${noteOffset.toFixed(2)})` : '', targetOffset: offset };
    });
    return { mileage: m, data };
  });
  return { headers, rows };
}

/**
 * 刨鋪厚度總表（等間距法）。direction: 'l2r' | 'r2l'。
 * 每列資料依 targetOffset 由小到大排序；headers 為「點位 1..N」。
 */
export function summaryByInterval(mileages, map1, map2, interval, direction = 'l2r') {
  let maxPoints = 0;
  const rows = mileages.map(m => {
    const p1 = (map1 && map1[m]) || [], p2 = (map2 && map2[m]) || [];
    const localPoints = [...p1, ...p2];
    const data = [];
    if (localPoints.length > 1) {
      const localMin = Math.min(...localPoints.map(p => p.x));
      const localMax = Math.max(...localPoints.map(p => p.x));
      const start = direction === 'l2r' ? localMin : localMax;
      const end = direction === 'l2r' ? localMax : localMin;
      const step = direction === 'l2r' ? interval : -interval;
      const diffAt = (o) => {
        const y1 = interpolate(p1, o), y2 = interpolate(p2, o);
        return (y1 !== null && y2 !== null) ? (y1 - y2) * 100 : null;
      };
      for (let o = start; (step > 0 ? o <= end : o >= end); o += step) data.push({ value: diffAt(o), targetOffset: o });
      const last = data[data.length - 1].targetOffset;
      if ((direction === 'l2r' && last < end) || (direction === 'r2l' && last > end)) data.push({ value: diffAt(end), targetOffset: end });
      data.sort((a, b) => a.targetOffset - b.targetOffset);
    }
    if (data.length > maxPoints) maxPoints = data.length;
    return { mileage: m, data };
  });
  const headers = Array.from({ length: maxPoints }, (_, i) => `點位 ${i + 1}`);
  return { headers, rows };
}

/**
 * 垂直誇大倍率 V 下的座標軸範圍（V＝1 為真實比例）。
 * @param {number[]} xs 所有 x；@param {number[]} ys 所有 y；W/H 繪圖區像素尺寸
 * @returns {{x:[number,number], y:[number,number]}|null}
 */
export function exaggeratedAxisRange(xs, ys, V, W, H) {
  if (!xs || xs.length < 2 || !(V > 0) || W <= 0 || H <= 0) return null;
  let xMin = Math.min(...xs), xMax = Math.max(...xs);
  let yMin = Math.min(...ys), yMax = Math.max(...ys);
  let dx = (xMax - xMin) || 1, dy = (yMax - yMin) || 1;
  xMin -= dx * 0.05; xMax += dx * 0.05; yMin -= dy * 0.1; yMax += dy * 0.1;
  dx = xMax - xMin; dy = yMax - yMin;
  let X0 = xMin, X1 = xMax, Y0 = yMin, Y1 = yMax;
  const needX = V * W * dy / H;
  if (needX >= dx) {
    const cx = (xMin + xMax) / 2; X0 = cx - needX / 2; X1 = cx + needX / 2;
  } else {
    const needY = H * dx / (W * V);
    const cy = (yMin + yMax) / 2; Y0 = cy - needY / 2; Y1 = cy + needY / 2;
  }
  return { x: [X0, X1], y: [Y0, Y1] };
}
