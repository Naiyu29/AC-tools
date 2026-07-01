/*
 * AC 工具集 — 共用導覽列
 * 用法：在每個工具的 index.html 的 </body> 前加一行：
 *   <script src="../nav.js" defer></script>
 */
(function () {
  var tools = [
    { folder: 'AC-斷面分析', label: '斷面分析' },
    { folder: 'AC-縱坡',     label: '縱坡' },
    { folder: 'AC-地形測量', label: '地形測量' }
  ];

  var segments = decodeURIComponent(location.pathname).split('/').filter(Boolean);
  var currentFolder = '';
  for (var i = segments.length - 1; i >= 0; i--) {
    if (tools.some(function (t) { return t.folder === segments[i]; })) {
      currentFolder = segments[i];
      break;
    }
  }

  var css =
    /* Bar */
    '.acnav-bar{position:sticky;top:0;left:0;right:0;z-index:9999;' +
    'display:flex;align-items:center;gap:4px;padding:0 12px;height:44px;' +
    'background:rgba(17,24,39,.92);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);' +
    'box-shadow:0 1px 4px rgba(0,0,0,.25);' +
    'font-family:"Inter","Noto Sans TC",sans-serif;}' +

    /* Title */
    '.acnav-title{color:#fff;font-weight:600;font-size:14px;letter-spacing:.01em;' +
    'white-space:nowrap;margin-right:6px;}' +

    /* Links wrapper */
    '.acnav-links{display:flex;align-items:center;gap:4px;flex:1;}' +

    /* Individual link */
    '.acnav-link{color:#9ca3af;text-decoration:none;font-size:13px;font-weight:500;' +
    'padding:5px 10px;border-radius:6px;transition:background .15s,color .15s;white-space:nowrap;}' +
    '.acnav-link:hover{background:#1f2937;color:#fff;}' +
    '.acnav-active{background:#1d4ed8;color:#fff !important;cursor:default;}' +
    '.acnav-home{color:#6b7280 !important;}' +
    '.acnav-home:hover{color:#fff !important;}' +

    /* Separator */
    '.acnav-sep{width:1px;height:16px;background:#374151;margin:0 6px;flex-shrink:0;}' +

    /* Hamburger button (hidden on desktop) */
    '.acnav-burger{display:none;margin-left:auto;background:none;border:none;cursor:pointer;' +
    'padding:6px;color:#9ca3af;line-height:0;}' +
    '.acnav-burger:hover{color:#fff;}' +

    /* Mobile dropdown */
    '.acnav-dropdown{display:none;position:absolute;top:44px;left:0;right:0;' +
    'background:rgba(17,24,39,.97);padding:8px 12px 12px;' +
    'box-shadow:0 4px 12px rgba(0,0,0,.3);flex-direction:column;gap:4px;}' +
    '.acnav-dropdown.acnav-open{display:flex;}' +
    '.acnav-dropdown .acnav-link{font-size:15px;padding:10px 12px;border-radius:8px;}' +

    /* Mobile breakpoint */
    '@media(max-width:600px){' +
    '.acnav-links{display:none;}' +
    '.acnav-burger{display:flex;}' +
    '}';

  var style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);

  var root = location.hostname === 'localhost' ? '/' : '/AC-tools/';

  /* Build inline links (desktop) */
  var linksHtml = '<a class="acnav-link acnav-home" href="' + root + '">首頁</a>'
                + '<span class="acnav-sep"></span>';
  tools.forEach(function (t) {
    if (t.folder === currentFolder) {
      linksHtml += '<span class="acnav-link acnav-active">' + t.label + '</span>';
    } else {
      linksHtml += '<a class="acnav-link" href="../' + encodeURIComponent(t.folder) + '/">' + t.label + '</a>';
    }
  });

  /* Build mobile dropdown */
  var dropdownHtml = '<a class="acnav-link acnav-home" href="' + root + '">🏠 首頁</a>';
  tools.forEach(function (t) {
    if (t.folder === currentFolder) {
      dropdownHtml += '<span class="acnav-link acnav-active">' + t.label + '</span>';
    } else {
      dropdownHtml += '<a class="acnav-link" href="../' + encodeURIComponent(t.folder) + '/">' + t.label + '</a>';
    }
  });

  var bar = document.createElement('nav');
  bar.className = 'acnav-bar';
  bar.innerHTML =
    '<span class="acnav-title">🛠️ AC 工具集</span>' +
    '<div class="acnav-links">' + linksHtml + '</div>' +
    '<button class="acnav-burger" aria-label="選單" onclick="this.parentNode.querySelector(\'.acnav-dropdown\').classList.toggle(\'acnav-open\')">' +
    '<svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">' +
    '<rect y="3" width="20" height="2" rx="1"/><rect y="9" width="20" height="2" rx="1"/><rect y="15" width="20" height="2" rx="1"/>' +
    '</svg></button>' +
    '<div class="acnav-dropdown">' + dropdownHtml + '</div>';

  document.body.insertBefore(bar, document.body.firstChild);
})();
