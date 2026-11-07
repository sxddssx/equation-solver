// SPDX-License-Identifier: MIT
/* 界面模块：把计算结果渲染成卡片（解集 / 计算结果 / 函数图像 / 解题步骤） */
(function (NS) {
  'use strict';
  const UIN = NS.ui = NS.ui || {};
  let plotState = null;          // { canvas, model }：窗口尺寸变化时重画用

  function el(tag, cls, text) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined && text !== null) n.textContent = text;
    return n;
  }
  function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); }

  /* 折叠区块的展开状态会记住（下次打开还是你上次的选择） */
  const FOLD_KEY = 'eq-solver-fold-v1';

  function foldStates() {
    try { return JSON.parse(localStorage.getItem(FOLD_KEY)) || {}; } catch (e) { return {}; }
  }
  function foldState(key, def) {
    const s = foldStates();
    return Object.prototype.hasOwnProperty.call(s, key) ? !!s[key] : !!def;
  }
  function saveFold(key, open) {
    try {
      const s = foldStates();
      s[key] = !!open;
      localStorage.setItem(FOLD_KEY, JSON.stringify(s));
    } catch (e) { /* 无 localStorage 时忽略 */ }
  }

  /** 生成一个折叠区块：details > summary(+meta) > .fold-body */
  function makeFold(key, title, defaultOpen, metaText) {
    const details = el('details', 'fold');
    const summary = el('summary');
    summary.appendChild(document.createTextNode(title));
    summary.appendChild(el('span', 'fold-meta', metaText || ''));
    details.appendChild(summary);
    const body = el('div', 'fold-body');
    details.appendChild(body);
    details.open = foldState(key, defaultOpen);
    details.addEventListener('toggle', () => {
      saveFold(key, details.open);
      if (details.open) setTimeout(() => redrawPlot(), 0);   // 展开后画布才有宽度，需要重画
    });
    return { details: details, body: body };
  }

  const TYPE_LABEL = {
    linear: '唯一解', 'two-roots': '两个不相等的实数根', double: '两个相等的实数根（二重根）',
    complex: '复数根（实数范围内无解）', identity: '恒等式 · 无穷多解', none: '无解',
    'high-degree': '高次方程的解'
  };

  function addChip(wrap, k, v) {
    const c = el('span', 'meta-chip');
    c.appendChild(el('b', null, k + '：'));
    c.appendChild(document.createTextNode(' ' + v));
    wrap.appendChild(c);
  }

  function metaChips(res) {
    const wrap = el('div', 'meta');
    addChip(wrap, '类型', res.typeName);
    addChip(wrap, '最高次数', res.degree + ' 次');
    if (res.coefficients.a !== undefined) addChip(wrap, 'a', res.coefficients.a);
    if (res.coefficients.b !== undefined) addChip(wrap, 'b', res.coefficients.b);
    if (res.coefficients.c !== undefined) addChip(wrap, 'c', res.coefficients.c);
    if (res.delta) addChip(wrap, '判别式 Δ', res.delta.exact);
    addChip(wrap, '标准形式', res.standard + ' = 0');
    return wrap;
  }

  /* ---------------- 方程结果 ---------------- */
  function solutionCard(res) {
    const warn = res.solutionType === 'complex' || res.solutionType === 'none';
    const card = el('section', 'card sol-card' + (warn ? ' warn' : ''));
    card.appendChild(el('p', 'sol-title', '解集　·　' + (TYPE_LABEL[res.solutionType] || '')));
    const big = el('div', 'sol-big');
    res.solutionLines.forEach(l => big.appendChild(el('span', 'ln', l)));
    card.appendChild(big);
    if (res.solutionType === 'complex') {
      card.appendChild(el('p', 'sol-sub', 'i 为虚数单位（i² = -1）；若只在实数范围内讨论，则该方程无解。'));
    } else if (res.solutionType === 'identity') {
      card.appendChild(el('p', 'sol-sub', '化简后两边完全相同，任何实数代入都成立。'));
    } else if (res.solutionType === 'none') {
      card.appendChild(el('p', 'sol-sub', '化简后得到矛盾的等式，找不到任何实数满足方程。'));
    } else if (res.solutionType === 'high-degree') {
      card.appendChild(el('p', 'sol-sub', '三次及以上方程先用有理根定理降次，剩下的部分用求根公式或数值迭代求出全部根（带 ≈ 的是数值解）。'));
    }
    card.appendChild(metaChips(res));
    return card;
  }

  /* ---------------- 算式结果 ---------------- */
  function calcCard(res) {
    const card = el('section', 'card calc-card');
    card.appendChild(el('p', 'sol-title', '计算结果'));
    const big = el('div', 'sol-big');
    big.appendChild(el('span', 'ln', '= ' + res.valueText));
    card.appendChild(big);
    if (res.exactText) card.appendChild(el('p', 'sol-sub', '同一个数的分数写法：' + res.exactText));
    if (res.complex) card.appendChild(el('p', 'sol-sub', '结果是复数：i 为虚数单位（i² = -1），实部与虚部分别显示。'));
    const meta = el('div', 'meta');
    if (res.normalized && res.normalized !== res.input) addChip(meta, '规范化', res.normalized);
    addChip(meta, '三角函数单位', res.angleMode === 'deg' ? '角度制（DEG）' : '弧度制（RAD）');
    if (res.complex) addChip(meta, '结果类型', '复数');
    card.appendChild(meta);
    return card;
  }

  /* ---------------- 函数图像 ---------------- */
  /**
   * 图像卡片：画布 + 说明 + x 范围调节
   * @param {object} model NS.plot.build() 的返回值
   * @param {object} opts { key, open, meta }
   */
  function plotCard(model, opts) {
    opts = opts || {};
    const key = opts.key || 'plot';
    const metaText = opts.meta || (model.kindLabel + (model.roots.length ? ' · 与 x 轴有 ' + model.roots.length + ' 个交点' : ''));
    const fold = makeFold(key, '函数图像', opts.open === true, metaText);

    const wrap = el('div', 'plot-wrap');
    const canvas = el('canvas');
    wrap.appendChild(canvas);
    fold.body.appendChild(wrap);

    const note = el('p', 'plot-note', model.note || '');
    fold.body.appendChild(note);

    const row = el('div', 'range-row');
    row.appendChild(document.createTextNode('x 范围'));
    const loInput = el('input', 'num-input');
    loInput.type = 'number';
    loInput.placeholder = '自动';
    loInput.value = String(Math.round(model.xMin * 1000) / 1000);
    const hiInput = el('input', 'num-input');
    hiInput.type = 'number';
    hiInput.placeholder = '自动';
    hiInput.value = String(Math.round(model.xMax * 1000) / 1000);
    const resetBtn = el('button', 'btn small ghost', '自动');
    resetBtn.type = 'button';
    row.appendChild(loInput);
    row.appendChild(document.createTextNode('到'));
    row.appendChild(hiInput);
    row.appendChild(resetBtn);
    row.appendChild(el('span', null, '（y 范围自动适应）'));
    fold.body.appendChild(row);

    function apply(xMin, xMax) {
      const build = { useDegree: model.useDegree, ans: NS.settings.ans };
      if (xMin !== null && xMax !== null) { build.xMin = xMin; build.xMax = xMax; }
      let next;
      try { next = NS.plot.build(model.expr, build); }
      catch (err) { next = { ok: false, error: (err && err.message) || String(err) }; }
      if (!next.ok) { UIN.toast('这个范围画不出来：' + next.error); return; }
      model = next;
      plotState = { canvas: canvas, model: next };
      NS.ui.drawPlot(canvas, next);
      note.textContent = next.note || '';
      loInput.value = String(Math.round(next.xMin * 1000) / 1000);
      hiInput.value = String(Math.round(next.xMax * 1000) / 1000);
    }

    function applyTyped() {
      const a = parseFloat(loInput.value), b = parseFloat(hiInput.value);
      if (!isFinite(a) || !isFinite(b) || b <= a) { UIN.toast('x 的范围要满足：最小值 < 最大值'); return; }
      apply(a, b);
    }
    loInput.addEventListener('change', applyTyped);
    hiInput.addEventListener('change', applyTyped);
    resetBtn.addEventListener('click', () => apply(null, null));

    plotState = { canvas: canvas, model: model };
    return fold.details;
  }

  function stepsCard(res) {
    const fold = makeFold('steps', '解题步骤', false, '共 ' + res.steps.length + ' 步');
    res.steps.forEach(s => {
      const box = el('div', 'step');
      box.appendChild(el('p', 'st', s.title));
      s.lines.forEach(l => box.appendChild(el('div', 'line', l)));
      fold.body.appendChild(box);
    });
    return fold.details;
  }

  function errorCard(msg) {
    const card = el('section', 'card err-card');
    card.appendChild(el('p', 'big', '暂时算不出来：' + msg));
    const ul = el('ul');
    [
      '方程：等号两边都可以有未知数，例如 2x + 3 = 5x - 9、x² - 5x + 6 = 0、x^3 - 8 = 0',
      '算式：只算具体数值，可以含复数与函数，例如 2^10、(3+4i)/(1-2i)、sin(30)、nCr(5,2)',
      '绘图：以 plot 开头，只支持一个变量 x，例如 plot sin(x)、plot 1/x',
      '整式方程里未知数不能出现在分母中，也不能出现在 sin、log 这类函数里',
      '次数最高支持 10 次左右（先用有理根定理降次，再用数值方法求其余根）'
    ].forEach(t => ul.appendChild(el('li', null, t)));
    card.appendChild(ul);
    return card;
  }

  /* ---------------- 总入口 ---------------- */
  function equationPlotCard(res) {
    if (!res.plot || res.plot.kind === 'constant') return null;
    const expr = res.plot.expr || res.standard;
    if (!expr) return null;
    let model;
    try {
      model = NS.plot.build(expr, { useDegree: NS.settings.useDegree, ans: NS.settings.ans });
    } catch (err) { model = { ok: false }; }
    if (!model.ok) return null;
    const meta = res.plot.kind === 'line'
      ? '直线与 x 轴的交点就是方程的根'
      : (res.plot.realRoots && res.plot.realRoots.length ? '曲线与 x 轴的交点就是方程的根' : '曲线与 x 轴没有交点');
    return plotCard(model, { key: 'plot', meta: meta });
  }

  function render(container, res) {
    plotState = null;
    clear(container);
    if (!res || !res.ok) {
      container.appendChild(errorCard((res && res.error) || '未知错误'));
      return;
    }
    if (res.mode === 'calc') {
      container.appendChild(calcCard(res));
      return;
    }
    if (res.mode === 'plot') {
      container.appendChild(plotCard(res.model, { key: 'plotcmd', open: true }));
      redrawPlot();
      return;
    }
    container.appendChild(solutionCard(res));
    const pc = equationPlotCard(res);
    if (pc) {
      container.appendChild(pc);
      redrawPlot();
    }
    container.appendChild(stepsCard(res));
  }

  function redrawPlot() {
    if (plotState && plotState.canvas && plotState.model && document.body.contains(plotState.canvas)) {
      NS.ui.drawPlot(plotState.canvas, plotState.model);
    }
  }

  function toast(msg) {
    const t = document.getElementById('toast');
    if (!t) return;
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toast._timer);
    toast._timer = setTimeout(() => t.classList.remove('show'), 1700);
  }

  NS.ui.render = render;
  NS.ui.redrawPlot = redrawPlot;
  NS.ui.toast = toast;
  NS.ui.clear = clear;
  NS.ui.el = el;
  NS.ui.makeFold = makeFold;
  NS.ui.foldState = foldState;
  NS.ui.saveFold = saveFold;
  NS.ui.plotCard = plotCard;
})(typeof globalThis !== 'undefined' ? (globalThis.__EqSolver = globalThis.__EqSolver || {}) : this);
