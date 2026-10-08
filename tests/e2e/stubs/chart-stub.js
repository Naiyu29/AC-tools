/*
 * e2e 用 Chart.js 替身：記錄建立的圖表與資料集，並在 canvas 畫出簡單折線以便截圖肉眼比對。
 * 透過 window.__charts 讓測試讀取圖表數量與資料點。
 */
(function () {
  var all = [];
  function Chart(canvas, cfg) {
    this.canvas = canvas; this.config = cfg; this.data = cfg.data || { datasets: [] }; this.options = cfg.options || {};
    this.options.scales = this.options.scales || { x: {}, y: {} };
    this.options.scales.x = this.options.scales.x || {}; this.options.scales.y = this.options.scales.y || {};
    this.chartArea = { left: 40, top: 20, right: (canvas.clientWidth || 600) - 20, bottom: (canvas.clientHeight || 300) - 30 };
    all.push(this); this._draw();
  }
  Chart.prototype._draw = function () {
    var c = this.canvas, ctx = c.getContext && c.getContext('2d'); if (!ctx) return;
    c.width = c.clientWidth || 600; c.height = c.clientHeight || 300;
    ctx.clearRect(0, 0, c.width, c.height); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
    var pts = []; (this.data.datasets || []).forEach(function (ds) { (ds.data || []).forEach(function (p) { if (p && isFinite(p.x) && isFinite(p.y)) pts.push(p); }); });
    var title = this.options.plugins && this.options.plugins.title && this.options.plugins.title.text;
    ctx.fillStyle = '#334155'; ctx.font = '14px sans-serif'; ctx.fillText((title || '') + '  [stub chart]', 10, 16);
    if (pts.length < 2) return;
    var xs = pts.map(function (p) { return p.x; }), ys = pts.map(function (p) { return p.y; });
    var x0 = Math.min.apply(null, xs), x1 = Math.max.apply(null, xs), y0 = Math.min.apply(null, ys), y1 = Math.max.apply(null, ys);
    var A = this.chartArea, W = A.right - A.left, H = A.bottom - A.top;
    var sx = function (x) { return A.left + (x1 === x0 ? 0.5 : (x - x0) / (x1 - x0)) * W; };
    var sy = function (y) { return A.bottom - (y1 === y0 ? 0.5 : (y - y0) / (y1 - y0)) * H; };
    var colors = ['#3b82f6', '#ef4444', '#22c55e', '#f59e0b'];
    (this.data.datasets || []).forEach(function (ds, i) {
      ctx.beginPath(); ctx.strokeStyle = ds.borderColor || colors[i % 4]; ctx.lineWidth = 2;
      (ds.data || []).forEach(function (p, j) { j ? ctx.lineTo(sx(p.x), sy(p.y)) : ctx.moveTo(sx(p.x), sy(p.y)); });
      ctx.stroke();
    });
  };
  Chart.prototype.destroy = function () { var i = all.indexOf(this); if (i >= 0) all.splice(i, 1); };
  Chart.prototype.update = function () { this._draw(); };
  Chart.prototype.resize = function () { this._draw(); };
  Chart.prototype.resetZoom = function () {};
  Chart.register = function () {};
  window.Chart = Chart;
  window.ChartDataLabels = {};
  window.Hammer = function () {};
  window.__charts = all;
})();
