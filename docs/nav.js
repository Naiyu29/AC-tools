/*
 * AC 工具集 — 共用導覽列
 * 用法：在每個工具的 index.html 的 </body> 前加一行：
 *   <script src="../nav.js" defer></script>
 * 之後若要增減工具或改外觀，只要改這一個檔案，四個工具同步更新。
 */
(function () {
  // 工具清單（陣列順序＝選單顯示順序）。folder 必須和 docs/ 底下的資料夾名稱一致。
  var tools = [
    { folder: 'AC-斷面分析', label: '斷面分析' },
    { folder: 'AC-縱坡',     label: '縱坡' }
  ];

  // 判斷目前開啟的是哪個工具（從網址路徑找出符合的資料夾名稱）
  var segments = decodeURIComponent(location.pathname).split('/').filter(Boolean);
  var currentFolder = '';
  for (var i = segments.length - 1; i >= 0; i--) {
    if (tools.some(function (t) { return t.folder === segments[i]; })) {
      currentFolder = segments[i];
      break;
    }
  }

  // 樣式：所有 class 都加 acnav- 前綴，避免和各工具自己的 CSS 衝突
  var css =
    '.acnav-bar{position:sticky;top:0;left:0;right:0;z-index:9999;display:flex;flex-wrap:wrap;' +
    'align-items:center;gap:6px;padding:8px 14px;background:#1f2937;' +
    'box-shadow:0 2px 6px rgba(0,0,0,.15);font-family:"Inter","Noto Sans TC",sans-serif;}' +
    '.acnav-title{color:#fff;font-weight:700;font-size:15px;margin-right:10px;white-space:nowrap;}' +
    '.acnav-link{color:#d1d5db;text-decoration:none;font-size:14px;font-weight:500;' +
    'padding:6px 14px;border-radius:9999px;transition:background .15s,color .15s;white-space:nowrap;}' +
    '.acnav-link:hover{background:#374151;color:#fff;}' +
    '.acnav-active{background:#3b82f6;color:#fff;cursor:default;}';
  var style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);

  // 建立選單列
  var bar = document.createElement('nav');
  bar.className = 'acnav-bar';
  var html = '<span class="acnav-title">🛠️ AC 工具集</span>';
  tools.forEach(function (t) {
    if (t.folder === currentFolder) {
      html += '<span class="acnav-link acnav-active">' + t.label + '</span>';
    } else {
      html += '<a class="acnav-link" href="../' + encodeURIComponent(t.folder) + '/">' + t.label + '</a>';
    }
  });
  bar.innerHTML = html;
  document.body.insertBefore(bar, document.body.firstChild);
})();
