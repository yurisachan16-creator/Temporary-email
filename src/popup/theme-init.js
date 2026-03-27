// 主题初始化：在 CSS 渲染前同步执行，防止深色模式闪烁（FOUC）
// 作为独立文件加载，符合 MV3 CSP 要求
(function () {
  var t = localStorage.getItem('tm_theme') || 'auto';
  if (t === 'dark' || (t === 'auto' && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
    document.documentElement.setAttribute('data-theme', 'dark');
  }
})();
