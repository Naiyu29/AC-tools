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
    { folder: 'AC-縱坡',     label: '縱坡' },
    { folder: 'AC-地形測量', label: '地形測量' }
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

  // MUI AppBar 風格樣式（所有 class 加 acnav- 前綴避免衝突）
  var css =
    '.acnav-bar{position:sticky;top:0;left:0;right:0;z-index:9999;display:flex;flex-wrap:wrap;' +
    'align-items:center;gap:4px;padding:0 16px;min-height:56px;background:#1976d2;' +
    'box-shadow:0 2px 4px -1px rgba(0,0,0,.2),0 4px 5px 0 rgba(0,0,0,.14),0 1px 10px 0 rgba(0,0,0,.12);' +
    'font-family:"Roboto","Noto Sans TC",sans-serif;}' +

    '.acnav-title{color:#fff;font-weight:500;font-size:20px;letter-spacing:.0075em;' +
    'margin-right:12px;white-space:nowrap;}' +

    '.acnav-link{color:rgba(255,255,255,.7);text-decoration:none;' +
    'font-size:.875rem;font-weight:500;letter-spacing:.02857em;text-transform:uppercase;' +
    'padding:8px 12px;border-radius:4px;' +
    'transition:background-color .2s cubic-bezier(.4,0,.2,1),color .2s;white-space:nowrap;}' +

    '.acnav-link:hover{background:rgba(255,255,255,.08);color:#fff;}' +

    '.acnav-active{background:rgba(255,255,255,.15);color:#fff;cursor:default;}' +

    '.acnav-home{color:rgba(255,255,255,.7);}' +

    '.acnav-sep{width:1px;height:20px;background:rgba(255,255,255,.2);margin:0 8px;flex-shrink:0;}';

  var style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);

  // 建立選單列
  var bar = document.createElement('nav');
  bar.className = 'acnav-bar';
  var root = location.hostname === 'localhost'
    ? '/'
    : '/AC-tools/';
  var html = '<a class="acnav-link acnav-home" href="' + root + '">🏠 首頁</a>'
           + '<span class="acnav-sep"></span>'
           + '<span class="acnav-title">AC 工具集</span>';
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
