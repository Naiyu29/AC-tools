/* e2e 用 Tailwind 替身：只提供會影響「行為」的少數工具類別，版面美觀不在此驗證。 */
(function () {
  var css = [
    '.hidden{display:none !important}',
    '.flex{display:flex}.grid{display:grid}.block{display:block}',
    '.overflow-x-auto{overflow-x:auto}',
    '.text-center{text-align:center}',
    'body{margin:0;font-family:sans-serif}',
  ].join('');
  var s = document.createElement('style'); s.textContent = css; document.head.appendChild(s);
  window.tailwind = { config: {} };
})();
