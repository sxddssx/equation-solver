// SPDX-License-Identifier: MIT
/* 界面模块：把求解结果渲染成卡片（解集 / 图像 / 步骤） */
(function (NS) {
  'use strict';
  const UIN = NS.ui = NS.ui || {};
  let lastPlot = null, lastCanvas = null;

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
      if (key === 'plot') setTimeout(() => redrawPlot(), 0);   // 展开后画布才有宽度，需要重画
    });
    return { details: details, body: body };
  }

  const TYPE_LABEL = {
    linear: '唯一解', 'two-roots': '两个不相等的实数根', double: '两个相等的实数根（二重根）',
    complex: '复数根（实数范围内无解）', identity: '恒等式 · 无穷多解', none: '无解'
  };

  function metaChips(res) {
    const wrap = el('div', 'meta');
    const add = (k, v) => {
      const c = el('span', 'meta-chip');
      c.appendChild(el('b', null, k + '：'));
      c.appendChild(document.createTextNode(' ' + v));
      wrap.appendChild(c);
    };
    add('类型', res.typeName);
    add('最高次数', res.degree + ' 次');
    if (res.coefficients.a !== undefined) add('a', res.coefficients.a);
    if (res.coefficients.b !== undefined) add('b', res.coefficients.b);
    if (res.coefficients.c !== undefined) add('c', res.coefficients.c);
    if (res.delta) add('判别式 Δ', res.delta.exact);
    add('标准形式', res.standard + ' = 0');
    return wrap;
  }

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
    }
    card.appendChild(metaChips(res));
    return card;
  }

  function plotCard(res) {
    if (!res.plot || (res.plot.kind !== 'line' && res.plot.kind !== 'parabola')) return null;
    const meta = res.plot.kind === 'line'
      ? '直线与 x 轴的交点就是方程的根'
      : (res.plot.realRoots && res.plot.realRoots.length ? '抛物线与 x 轴的交点就是方程的根' : '抛物线与 x 轴没有交点');
    const fold = makeFold('plot', '函数图像', false, meta);
    const wrap = el('div', 'plot-wrap');
    const canvas = el('canvas');
    wrap.appendChild(canvas);
    fold.body.appendChild(wrap);
    if (res.plot.note) fold.body.appendChild(el('p', 'plot-note', res.plot.note));
    lastPlot = res.plot; lastCanvas = canvas;
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
      '一元一次方程的一般形式：ax + b = 0，例如 2x + 3 = 5x - 9',
      '一元二次方程的一般形式：ax² + bx + c = 0，例如 x² - 5x + 6 = 0',
      '未知数请用字母表示（一般用 x），同一方程里只能有一个未知数',
      '未知数不要出现在分母里（本工具求解整式方程）',
      '次数最高支持 2 次，3 次及以上暂时不支持'
    ].forEach(t => ul.appendChild(el('li', null, t)));
    card.appendChild(ul);
    return card;
  }

  function render(container, res) {
    clear(container);
    if (!res || !res.ok) {
      container.appendChild(errorCard((res && res.error) || '未知错误'));
      lastPlot = null; lastCanvas = null;
      return;
    }
    container.appendChild(solutionCard(res));
    const pc = plotCard(res);
    if (pc) {
      container.appendChild(pc);
      NS.ui.drawPlot(lastCanvas, lastPlot);
    }
    container.appendChild(stepsCard(res));
  }

  function redrawPlot() {
    if (lastCanvas && lastPlot && document.body.contains(lastCanvas)) {
      NS.ui.drawPlot(lastCanvas, lastPlot);
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
})(typeof globalThis !== 'undefined' ? (globalThis.__EqSolver = globalThis.__EqSolver || {}) : this);