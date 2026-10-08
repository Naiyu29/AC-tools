# AC 工具集

道路工程 AC 刨鋪收方用的三支瀏覽器工具，純靜態站（GitHub Pages 以 `docs/` 為根）。

| 工具 | 路徑 | 用途 |
|------|------|------|
| 斷面分析 | `docs/AC-斷面分析/` | 原地面／刨除後／舖築後三層斷面 → 面積、體積、平均厚度、縱向剖面 |
| 縱坡 | `docs/AC-縱坡/` | 樁號＋高程 → 平順化完工高程、厚度檢核 |
| 地形測量 (DTM) | `docs/AC-地形測量/` | NEZ 測點 IDW 熱圖、CAD 中心線、批量橫斷面 |

`docs/AC-斷面/`、`docs/AC-高差/` 是舊網址的跳轉頁（meta refresh → 斷面分析），保留以免舊書籤失效。

## 程式結構

```
docs/
  nav.js                 共用導覽列（工具清單在此維護）
  shared/
    section-math.js      斷面解析、內插、面積／體積、總表、縱向剖面（純函式）
    slope-math.js        縱坡解析、平順化、CSV（純函式）
    dtm-math.js          測點解析、IDW、CAD 中心線、批量斷面（純函式）
    storage.js           localStorage 安全存取、跨工具橋接鍵、分享 hash 解析
    firebase.js          Firebase 初始化、登入列、分享快照（瀏覽器專用）
  AC-*/index.html        各工具頁面：UI 與事件，以 <script type="module"> 匯入上面的模組
```

原則：**計算放 `shared/`，DOM 留在頁面**。`shared/*-math.js` 與 `storage.js` 沒有瀏覽器依賴，可直接在 Node 測試。

## 測試

```bash
npm test            # 單元測試（node:test，零依賴）
npm run test:e2e    # Playwright 端到端：操作三支工具＋截圖到 tests/e2e/screenshots/
```

e2e 預設為**離線模式**：Tailwind／Chart.js／Firebase 的 CDN 以 `tests/e2e/stubs/` 替身取代，無網路的 CI 或沙箱也能跑。
要用真實 CDN 比對截圖：`E2E_LIVE_CDN=1 npm run test:e2e`。需要 `playwright` 套件（`npm i -D playwright` 或設 `PLAYWRIGHT_PATH`）。

## 輸入格式

見 [`docs/FORMATS.md`](docs/FORMATS.md)（含收方 Excel → AC TOOL 的轉換工具 `tools/shoufang2actool.py`）。
