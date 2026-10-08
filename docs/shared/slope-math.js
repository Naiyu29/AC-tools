/*
 * AC 工具集 — 縱坡工具共用計算模組（純函式，無 DOM 依賴）
 * 由 AC-縱坡/index.html 匯入；tests/unit 做單元測試。
 */

/**
 * 解析輸入：每行「樁號 高程」兩欄，或只填「高程」（自動補樁號 0,10,20…）。
 * 若任一行有兩個以上數字，即視為「樁號 高程」模式。回傳依樁號排序後的結果。
 */
export function parseElevationInput(raw) {
  const rows = String(raw ?? '').split('\n')
    .map(l => l.trim())
    .filter(l => l !== '')
    .map(l => l.split(/[\s,]+/).map(Number).filter(n => !isNaN(n)));
  const hasPairs = rows.some(r => r.length >= 2);
  const sts = [], els = [];
  if (hasPairs) {
    rows.forEach(r => { if (r.length >= 2) { sts.push(r[0]); els.push(r[1]); } });
  } else {
    rows.forEach((r, i) => { if (r.length >= 1) { sts.push(i * 10); els.push(r[0]); } });
  }
  const order = sts.map((_, i) => i).sort((a, b) => sts[a] - sts[b]);
  return { stations: order.map(i => sts[i]), existingElevations: order.map(i => els[i]) };
}

/** 由樁號＋高程組回輸入框文字（樁號 高程，每行一筆）。 */
export function formatInput(stations, elevations) {
  return stations.map((s, i) => `${s} ${elevations[i]}`).join('\n');
}

/**
 * 平順化演算法：在 [現有+min, 現有+max] 包絡內做 200 回合 0.3/0.4/0.3 加權平滑，
 * 最後整體平移到目標平均厚度再夾回包絡。厚度單位 cm，高程單位 m。
 */
export function calculateSmoothCurve(existing, minThick, maxThick, targetAvg) {
  const n = existing.length;
  if (n === 0) return [];
  const minThickM = minThick / 100;
  const maxThickM = maxThick / 100;
  const targetAvgM = targetAvg / 100;

  let smoothed = existing.map(e => e + targetAvgM);
  for (let iter = 0; iter < 200; iter++) {
    const tmp = [...smoothed];
    if (n > 2) {
      for (let i = 1; i < n - 1; i++) tmp[i] = smoothed[i - 1] * 0.3 + smoothed[i] * 0.4 + smoothed[i + 1] * 0.3;
    }
    smoothed = tmp;
    for (let i = 0; i < n; i++) smoothed[i] = Math.max(existing[i] + minThickM, Math.min(existing[i] + maxThickM, smoothed[i]));
  }
  const currentAvg = smoothed.reduce((s, v, i) => s + (v - existing[i]), 0) / n;
  const offset = targetAvgM - currentAvg;
  smoothed = smoothed.map(v => v + offset);
  for (let i = 0; i < n; i++) smoothed[i] = Math.max(existing[i] + minThickM, Math.min(existing[i] + maxThickM, smoothed[i]));
  return smoothed;
}

/** 三點移動平均（首尾不動）。 */
export function threePointAverage(values) {
  const out = [...values];
  for (let i = 1; i < values.length - 1; i++) out[i] = (values[i - 1] + values[i] + values[i + 1]) / 3;
  return out;
}

/** 平均舖設厚度（cm）。 */
export function averageThicknessCm(existing, proposed) {
  if (!proposed || proposed.length === 0) return 0;
  return proposed.reduce((s, v, i) => s + (v - existing[i]), 0) / proposed.length * 100;
}

/** 表格 CSV 內容（樁號,現有高程,完工高程,鋪設厚度）。 */
export function toCSV(stations, existing, proposed) {
  let csv = '樁號,現有高程(m),完工高程(m),鋪設厚度(cm)\n';
  for (let i = 0; i < stations.length; i++) {
    const t = (proposed[i] - existing[i]) * 100;
    csv += `${stations[i]},${existing[i].toFixed(3)},${proposed[i].toFixed(3)},${t.toFixed(1)}\n`;
  }
  return csv;
}
