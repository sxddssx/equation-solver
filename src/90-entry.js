// SPDX-License-Identifier: MIT
/* 模块 6/6：对外接口 —— solve(方程字符串)、formatReport(纯文本解答) */
(function (NS) {
  'use strict';
  const Error_ = NS.EquationError;

  /**
   * 求解一个一元一次或一元二次方程。
   * @param {string} text 例如 "2x+3=5x-9"、"x²-5x+6=0"
   * @returns {object} 成功：{ ok:true, ... }；失败：{ ok:false, error:'原因' }
   */
  function solve(text) {
    if (text === undefined || text === null || String(text).trim() === '') {
      return { ok: false, error: '请先输入一个方程，例如 2x + 3 = 0 或 x² - 5x + 6 = 0' };
    }
    let parsed;
    try {
      parsed = NS.parser.parseEquationText(text);
    } catch (err) {
      return { ok: false, error: err instanceof Error_ ? err.message : ('无法解析这个方程：' + (err && err.message ? err.message : err)) };
    }
    try {
      return NS.buildSolution(parsed, text);
    } catch (err) {
      return { ok: false, error: err instanceof Error_ ? err.message : ('求解时出错：' + (err && err.message ? err.message : err)) };
    }
  }

  /** 把求解结果整理成纯文本（命令行、复制按钮用） */
  function formatReport(res) {
    if (!res || !res.ok) return '无法求解：' + ((res && res.error) || '未知错误');
    const out = [];
    out.push('原方程：' + res.input);
    out.push('标准形式：' + res.standard + ' = 0');
    out.push('方程类型：' + res.typeName);
    if (res.delta) out.push('判别式：Δ = ' + res.delta.exact);
    res.steps.forEach(s => {
      out.push('');
      out.push('【' + s.title + '】');
      s.lines.forEach(l => out.push('  ' + l));
    });
    out.push('');
    out.push('解集：' + res.solutionText);
    return out.join('\n');
  }

  NS.solve = solve;
  NS.formatReport = formatReport;
  NS.version = '1.0.0';

  /* Node 环境：导出（浏览器里用全局 __EqSolver） */
  if (typeof module === 'object' && module.exports) {
    module.exports = {
      solve: solve,
      formatReport: formatReport,
      parse: NS.parser.parseEquationText,
      normalizeInput: NS.parser.normalizeInput,
      polyToText: NS.fmt.polyToText,
      Frac: NS.Frac,
      EquationError: Error_,
      ns: NS,
      version: NS.version
    };
  }
})(typeof globalThis !== 'undefined' ? (globalThis.__EqSolver = globalThis.__EqSolver || {}) : this);