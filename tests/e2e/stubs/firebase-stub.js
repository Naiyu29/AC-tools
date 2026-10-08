/*
 * e2e 用 Firebase 替身：提供 ../shared/firebase.js 所依賴的最小 API。
 * 以記憶體 Map 模擬 Firestore 集合；auth 永遠未登入。
 * 由 tests/e2e/run.mjs 透過 page.route 把 www.gstatic.com/firebasejs/* 導到這裡。
 */
const store = new Map(); // `${col}/${id}` -> data
let counter = 0;
const listeners = new Map(); // col -> Set<fn>

function notify(col) {
  (listeners.get(col) || []).forEach(fn => fn(snapshotOf(col)));
}
function snapshotOf(col) {
  const docs = [...store.entries()].filter(([k]) => k.startsWith(col + '/')).map(([k, v]) => ({ id: k.split('/')[1], data: () => v }));
  return { empty: docs.length === 0, forEach: fn => docs.forEach(fn), docs };
}

export function initializeApp() { return { name: 'stub' }; }
export function getFirestore() { return { stub: true }; }
export function getAuth() { return { currentUser: null }; }
export class GoogleAuthProvider {}
export function signInWithPopup() { return Promise.reject(new Error('stub: 無網路登入')); }
export function signOut() { return Promise.resolve(); }
export function onAuthStateChanged(auth, cb) { setTimeout(() => cb(null), 0); return () => {}; }

export function collection(db, name) { return { col: name }; }
export function doc(dbOrCol, a, b) {
  if (dbOrCol && dbOrCol.col) return { col: dbOrCol.col, id: 'stub' + (++counter) };
  return { col: a, id: b };
}
export function query(col) { return col; }
export function orderBy() { return null; }
export function onSnapshot(q, cb) {
  if (!listeners.has(q.col)) listeners.set(q.col, new Set());
  listeners.get(q.col).add(cb);
  setTimeout(() => cb(snapshotOf(q.col)), 0);
  return () => listeners.get(q.col).delete(cb);
}
export async function addDoc(col, data) { const id = 'stub' + (++counter); store.set(`${col.col}/${id}`, data); notify(col.col); return { id }; }
export async function setDoc(ref, data) { store.set(`${ref.col}/${ref.id}`, data); notify(ref.col); }
export async function getDoc(ref) { const d = store.get(`${ref.col}/${ref.id}`); return { exists: () => d !== undefined, data: () => d }; }
export async function updateDoc(ref, patch) { store.set(`${ref.col}/${ref.id}`, { ...store.get(`${ref.col}/${ref.id}`), ...patch }); notify(ref.col); }
export async function deleteDoc(ref) { store.delete(`${ref.col}/${ref.id}`); notify(ref.col); }
