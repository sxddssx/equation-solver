// SPDX-License-Identifier: MIT
/* 界面模块：事件绑定、历史记录、复制、折叠状态 */
(function (NS) {
  'use strict';
  const UIN = NS.ui;
  const STORE_KEY = 'eq-solver-history-v1';
  let lastRes = null;

  function loadHistory() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      const arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr.slice(0, 12) : [];
    } catch (e) { return []; }
  }
  function saveHistory(arr) {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(arr.slice(0, 12))); } catch (e) { /* 忽略 */ }
  }

  function boot() {
    const input = document.getElementById('eq');
    const solveBtn = document.getElementById('solveBtn');
    const copyBtn = document.getElementById('copyBtn');
    const resultEl = document.getElementById('result');
    const historyCard = document.getElementById('historyCard');
    const historyEl = document.getElementById('history');
    const historyMeta = document.getElementById('historyMeta');
    if (!input || !resultEl) return;

    let history = loadHistory();

    function renderHistory() {
      if (!historyEl) return;
      UIN.clear(historyEl);
      if (historyCard) historyCard.hidden = history.length === 0;
      if (historyMeta) historyMeta.textContent = history.length ? '共 ' + history.length + ' 条' : '';
      history.forEach(q => {
        const chip = UIN.el('button', 'chip', q);
        chip.type = 'button';
        chip.addEventListener('click', () => { input.value = q; doSolve(); });
        historyEl.appendChild(chip);
      });
    }

    function pushHistory(q) {
      const key = q.replace(/\s+/g, '');
      history = [q].concat(history.filter(x => x.replace(/\s+/g, '') !== key)).slice(0, 12);
      saveHistory(history);
      renderHistory();
    }

    function doSolve() {
      const text = input.value;
      const res = NS.solve(text);
      lastRes = res;
      UIN.render(resultEl, res);
      if (res.ok) pushHistory(text.trim().replace(/\s+/g, ' '));
      if (window.innerWidth < 760) {
        resultEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }

    solveBtn.addEventListener('click', doSolve);
    input.addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); doSolve(); }
    });

    if (copyBtn) {
      copyBtn.addEventListener('click', () => {
        if (!lastRes) { UIN.toast('请先求解一个方程'); return; }
        const text = NS.formatReport(lastRes);
        const ok = () => UIN.toast('解答已复制到剪贴板');
        const fail = () => UIN.toast('复制失败，请手动选择文本');
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(text).then(ok, () => fallbackCopy(text) ? ok() : fail());
        } else {
          fallbackCopy(text) ? ok() : fail();
        }
      });
    }

    /* 历史记录也是折叠区块：记住展开状态 */
    if (historyCard) {
      historyCard.open = UIN.foldState('history', false);
      historyCard.addEventListener('toggle', () => UIN.saveFold('history', historyCard.open));
    }

    let rt = null;
    window.addEventListener('resize', () => {
      clearTimeout(rt);
      rt = setTimeout(() => UIN.redrawPlot(), 120);
    });

    renderHistory();
    input.focus();
  }

  function fallbackCopy(text) {
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(ta);
      return ok;
    } catch (e) { return false; }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})(typeof globalThis !== 'undefined' ? (globalThis.__EqSolver = globalThis.__EqSolver || {}) : this);