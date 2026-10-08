/*
 * AC 工具集 — localStorage 安全存取與跨工具橋接（純函式；storage 可注入以便測試）
 */

/** 斷面分析 → 縱坡 的縱向剖面資料橋接鍵。 */
export const BRIDGE_KEY = 'actool_bridge_zongpo';

/** 各工具的本機暫存鍵。 */
export const LS_KEYS = {
  section: 'actool_sectionAnalysis_v1',
  slope: 'actool_slope_v1',
  dtmAutosave: 'dtm_autosave',
  dtmProjects: 'dtm_projects',
};

function defaultStorage() {
  try { return globalThis.localStorage; } catch (e) { return undefined; }
}

/** 讀 JSON；不存在、解析失敗或隱私模式皆回傳 fallback。 */
export function lsGetJSON(key, fallback = null, storage = defaultStorage()) {
  try {
    if (!storage) return fallback;
    const raw = storage.getItem(key);
    if (raw == null) return fallback;
    return JSON.parse(raw);
  } catch (e) { return fallback; }
}

/** 寫 JSON；成功回傳 true，容量不足或隱私模式回傳 false。 */
export function lsSetJSON(key, value, storage = defaultStorage()) {
  try {
    if (!storage) return false;
    storage.setItem(key, JSON.stringify(value));
    return true;
  } catch (e) { return false; }
}

export function lsRemove(key, storage = defaultStorage()) {
  try { if (storage) storage.removeItem(key); } catch (e) { /* ignore */ }
}

/** 橋接資料格式檢查：stations/elevations 等長且 ≥ 2 點。 */
export function isValidBridgePayload(data) {
  return !!data
    && Array.isArray(data.stations) && Array.isArray(data.elevations)
    && data.stations.length >= 2
    && data.stations.length === data.elevations.length;
}

/** 寫入橋接資料（斷面分析端）。 */
export function writeBridge(payload, storage = defaultStorage()) {
  return lsSetJSON(BRIDGE_KEY, payload, storage);
}

/** 讀取並驗證橋接資料（縱坡端）；無效時自動清除並回傳 null。 */
export function readBridge(storage = defaultStorage()) {
  const data = lsGetJSON(BRIDGE_KEY, null, storage);
  if (!isValidBridgePayload(data)) { lsRemove(BRIDGE_KEY, storage); return null; }
  return data;
}

export function clearBridge(storage = defaultStorage()) { lsRemove(BRIDGE_KEY, storage); }

/** 解析分享用 hash：`#s=<docId>` → { kind:'share', id }；`#data=<b64>` → { kind:'legacy', data }；其他 null。 */
export function parseShareHash(hash) {
  const h = String(hash ?? '').replace(/^#/, '');
  if (h.startsWith('s=')) return { kind: 'share', id: h.slice(2) };
  if (h.startsWith('data=')) return { kind: 'legacy', data: h.slice(5) };
  if (h.startsWith('state=')) return { kind: 'obsolete' };
  return null;
}
