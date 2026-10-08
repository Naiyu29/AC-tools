/*
 * AC 工具集 — Firebase 共用模組（瀏覽器專用，不在 Node 測試）
 * 匯出 Firestore / Auth 常用函式，讓各工具只需 import 這一支。
 */
import { initializeApp } from 'https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js';
import {
  getFirestore, collection, addDoc, query, onSnapshot, orderBy, doc, getDoc, setDoc, deleteDoc, updateDoc,
} from 'https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js';
import {
  getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged,
} from 'https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js';

export { collection, addDoc, query, onSnapshot, orderBy, doc, getDoc, setDoc, deleteDoc, updateDoc, signOut, onAuthStateChanged };

export const firebaseConfig = {
  apiKey: 'AIzaSyDZuFavG2_diY8MLKw-DlPJxZEbwIIQ1hM',
  authDomain: 'ac-tool-529aa.firebaseapp.com',
  projectId: 'ac-tool-529aa',
  storageBucket: 'ac-tool-529aa.firebasestorage.app',
  messagingSenderId: '805495795043',
  appId: '1:805495795043:web:1c73ccc07f39d5196c7756',
  measurementId: 'G-W81FRXJ8Q3',
};

/** 初始化 app / Firestore / Auth；失敗時丟出例外，由呼叫端決定如何顯示。 */
export function initFirebase() {
  const app = initializeApp(firebaseConfig);
  return { app, db: getFirestore(app), auth: getAuth(app) };
}

/** Google 彈窗登入；錯誤交給 onError。 */
export function loginWithGoogle(auth, onError) {
  return signInWithPopup(auth, new GoogleAuthProvider()).catch(err => {
    console.error('登入失敗:', err);
    if (onError) onError(err);
  });
}

/**
 * 渲染登入列。各工具按鈕樣式不同，故以 classes 傳入。
 * @param {HTMLElement} bar
 * @param {import('firebase/auth').User|null} user
 * @param {{auth, loginClass:string, logoutClass:string, hint:string, onLoginError?:(e)=>void}} opts
 */
export function renderAuthBar(bar, user, opts) {
  if (!bar) return;
  if (user) {
    bar.innerHTML = `<span class="text-gray-600">已登入：<span class="font-semibold text-gray-800">${user.email || user.displayName || ''}</span></span>
      <button id="logoutBtn" class="${opts.logoutClass}">登出</button>`;
    bar.querySelector('#logoutBtn').addEventListener('click', () => signOut(opts.auth));
  } else {
    bar.innerHTML = `<span class="text-gray-500">${opts.hint}</span>
      <button id="loginBtn" class="${opts.loginClass}">使用 Google 登入</button>`;
    bar.querySelector('#loginBtn').addEventListener('click', () => loginWithGoogle(opts.auth, opts.onLoginError));
  }
}

/** 建立分享快照，回傳 docId。 */
export async function createShare(db, state) {
  const ref = doc(collection(db, 'shares'));
  await setDoc(ref, state);
  return ref.id;
}

/** 讀取分享快照；不存在回傳 null。 */
export async function loadShare(db, id) {
  const snap = await getDoc(doc(db, 'shares', id));
  return snap.exists() ? snap.data() : null;
}

/** 目前頁面的分享短連結。 */
export function shareUrl(id) {
  return location.origin + location.pathname + '#s=' + id;
}
