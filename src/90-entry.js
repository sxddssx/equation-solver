// SPDX-License-Identifier: MIT
/* 模块 10/10：对外接口
 *   compute(输入)   —— 自动判断是「方程」「算式」还是「绘图命令」
 *   solve(方程)     —— 一元方程（一次 / 二次 / 高次）
 *   calculate(算式) —— 具体数值（复数、函数、阶乘、排列组合……）
 *   plot(函数)      —— 函数绘图模型
 *   formatReport()  —— 把结果整理成纯文本（命令行、复制按钮）
 *   settings        —— 角度制 / 阶乘优先级 / 上一次的结果 ans
 */
(function (NS) {
  'use strict';
  const Error_ = NS.EquationError;
  const F = NS.fmt;

  const settings = {
    useDegree: true,        /* 三角函数默认按角度制（与参考实现一致） */
    factBindsPower: false,  /* false: a^b! = a^(b!)；true: a^b! = (a^b)! */
    ans: null
  };

  function setAngleMode(mode) {
    settings.useDegree = String(mode).toLowerCase() !== 'rad';
    return settings.useDegree;
  }

  function setFactorialMode(on) {
    settings.factBindsPower = !!on;
    return settings.factBindsPower;
  }

  function rememberAns(z) {
    if (z && isFinite(z.re) && isFinite(z.im)) settings.ans = { re: z.re, im: z.im };
  }

  function messageOf(err, fallback) {
    if (err instanceof Error_) return err.message;
    if (err && err.message) return fallback + err.message;
    return fallback + String(err);
  }

  /* ---------------- 方程 ---------------- */
  /**
   * 求解一个一元整式方程（一次 / 二次，以及三次及以上的有理根 + 数值根）。
   * @param {string} text 例如 "2x+3=5x-9"、"x²-5x+6=0"、"x^3=8"
   */
  function solve(text) {
    if (text === undefined || text === null || String(text).trim() === '') {
      return { ok: false, error: '请先输入一个方程，例如 2x + 3 = 0 或 x² - 5x + 6 = 0' };
    }
    let parsed;
    try {
      parsed = NS.parser.parseEquationText(text);
    } catch (err) {
      if (NS.expr.hasFunctionCall(text)) {
        return {
          ok: false,
          error: '方程里出现了函数（如 sin、log、sqrt），本工具只求解整式方程；' +
            '如果只是想算一个具体数值，去掉未知数直接输入算式即可（例如 sin(30)）'
        };
      }
      const unknown = NS.expr.unknownWords(text);
      if (unknown.length) {
        return {
          ok: false,
          error: '未知的名称：' + unknown[0] +
            '（只认常数 pi、e、i、ans 和函数名；未知数请用单个字母，例如 x）'
        };
      }
      return { ok: false, error: messageOf(err, '无法解析这个方程：') };
    }
    let res;
    try {
      res = NS.buildSolution(parsed, text);
    } catch (err) {
      return { ok: false, error: messageOf(err, '求解时出错：') };
    }
    res.mode = 'equation';
    if (res.roots && res.roots.length && isFinite(res.roots[0].re)) {
      rememberAns({ re: res.roots[0].re, im: res.roots[0].im || 0 });
    }
    return res;
  }

  /* ---------------- 算式 ---------------- */
  /**
   * 计算一个具体数值的算式（可以含复数、函数、阶乘、排列组合）。
   * @param {string} text 例如 "2^10"、"sin(30)+1/2"、"(3+4i)/(1-2i)"
   */
  function calculate(text) {
    const raw = String(text == null ? '' : text).trim();
    if (!raw) return { ok: false, error: '请输入一个算式，例如 2^10、sin(30)+1/2、(3+4i)/(1-2i)' };
    let ast;
    try {
      ast = NS.expr.parse(raw, { factBindsPower: settings.factBindsPower });
    } catch (err) {
      return { ok: false, error: messageOf(err, '无法解析这个算式：') };
    }
    const names = NS.expr.variableNames(ast);
    if (names.length) {
      return {
        ok: false,
        error: '算式里出现了未知数 ' + names.join('、') + '。计算模式只算具体数值：' +
          '含未知数请写成方程（例如 2x+1=0），或者用 plot 画函数图像'
      };
    }
    let value;
    try {
      value = NS.expr.evaluateAst(ast, { vars: {}, useDegree: settings.useDegree, ans: settings.ans });
    } catch (err) {
      return { ok: false, error: messageOf(err, '计算出错：') };
    }
    if (!NS.C.isFiniteC(value)) {
      return { ok: false, error: '结果超出双精度浮点数的范围（溢出或没有定义）' };
    }
    const complex = !NS.C.isReal(value);
    const valueText = F.fmtComplex(value, 12);
    let exactText = '';
    if (!complex) {
      const frac = F.bestFrac(value.re, 100000);
      if (frac && (frac.d !== 1n)) exactText = F.fmtFrac(frac);
    }
    const res = {
      ok: true,
      mode: 'calc',
      input: raw,
      normalized: NS.expr.normalize(raw),
      value: { re: value.re, im: value.im },
      valueText: valueText,
      solutionText: valueText,
      exactText: exactText,
      complex: complex,
      angleMode: settings.useDegree ? 'deg' : 'rad'
    };
    rememberAns(value);
    return res;
  }

  /* ---------------- 绘图 ---------------- */
  /**
   * 建立函数绘图模型（网页用 canvas、命令行用 ASCII 渲染）。
   * @param {string} exprText 例如 "sin(x)"、"1/x"、"x^2-4"
   * @param {object} opts { xMin, xMax, yMin, yMax, samples }
   */
  function plot(exprText, opts) {
    opts = opts || {};
    const merged = {
      useDegree: settings.useDegree,
      ans: settings.ans,
      factBindsPower: settings.factBindsPower,
      xMin: opts.xMin,
      xMax: opts.xMax,
      yMin: opts.yMin,
      yMax: opts.yMax,
      samples: opts.samples
    };
    const model = NS.plot.build(exprText, merged);
    if (!model.ok) return { ok: false, error: model.error };
    return { ok: true, mode: 'plot', input: String(exprText == null ? '' : exprText).trim(), model: model, solutionText: model.note || '' };
  }

  /* ---------------- 自动分发 ---------------- */
  /**
   * 自动判断输入是什么：
   *   含 =                → 解方程（等号两边都可以有未知数）
   *   含未知数但没有 =     → 当成 "… = 0" 解方程（保持老版本的写法）
   *   纯数值算式           → 直接算出一个数
   *   plot <函数>         → 画函数图像
   */
  function compute(text, opts) {
    const raw = String(text == null ? '' : text).trim();
    if (!raw) {
      return { ok: false, error: '请先输入内容：方程（2x+3=5x-9）、算式（sin(30)+1/2）或绘图（plot x^2-4）' };
    }
    const plotCmd = /^plot\b\s*([\s\S]*)$/i.exec(raw);
    if (plotCmd) {
      const rest = plotCmd[1].trim();
      if (!rest) return { ok: false, error: 'plot 后面缺少函数，例如 plot x^2-4 或 plot sin(x)' };
      return plot(rest, opts);
    }
    if (raw.indexOf('=') >= 0) return solve(raw);
    if (NS.expr.hasVariable(raw)) return solve(raw);
    return calculate(raw);
  }

  /* ---------------- 纯文本 ---------------- */
  function formatEquationReport(res) {
    const out = [];
    out.push('原方程：' + res.input);
    out.push('标准形式：' + res.standard + ' = 0');
    out.push('方程类型：' + res.typeName);
    if (res.delta) out.push('判别式：Δ = ' + res.delta.exact);
    res.steps.forEach(function (s) {
      out.push('');
      out.push('【' + s.title + '】');
      s.lines.forEach(function (l) { out.push('  ' + l); });
    });
    out.push('');
    out.push('解集：' + res.solutionText);
    return out.join('\n');
  }

  function formatCalcReport(res) {
    const out = ['算式：' + res.input];
    if (res.normalized !== res.input) out.push('规范化：' + res.normalized);
    out.push('结果：' + res.valueText + (res.exactText ? '（= ' + res.exactText + '）' : ''));
    if (res.complex) out.push('说明：结果是复数（i 为虚数单位，i² = -1）。');
    out.push('三角函数单位：' + (res.angleMode === 'deg' ? '角度制' : '弧度制'));
    return out.join('\n');
  }

  /** 把任意结果整理成纯文本（命令行、复制按钮用） */
  function formatReport(res) {
    if (!res || !res.ok) return '无法计算：' + ((res && res.error) || '未知错误');
    if (res.mode === 'calc') return formatCalcReport(res);
    if (res.mode === 'plot') return NS.plot.ascii(res.model, { width: 61, height: 21 });
    return formatEquationReport(res);
  }

  NS.solve = solve;
  NS.calculate = calculate;
  NS.plotFunction = plot;
  NS.compute = compute;
  NS.formatReport = formatReport;
  NS.settings = settings;
  NS.setAngleMode = setAngleMode;
  NS.setFactorialMode = setFactorialMode;
  NS.version = '2.0.0';

  /* Node 环境：导出（浏览器里用全局 __EqSolver） */
  if (typeof module === 'object' && module.exports) {
    module.exports = {
      solve: solve,
      calculate: calculate,
      plot: plot,
      compute: compute,
      formatReport: formatReport,
      parse: NS.parser.parseEquationText,
      normalizeInput: NS.parser.normalizeInput,
      polyToText: NS.fmt.polyToText,
      expression: NS.expr,
      plotModel: NS.plot.build,
      asciiPlot: NS.plot.ascii,
      settings: settings,
      setAngleMode: setAngleMode,
      setFactorialMode: setFactorialMode,
      Frac: NS.Frac,
      EquationError: Error_,
      ns: NS,
      version: NS.version
    };
  }
})(typeof globalThis !== 'undefined' ? (globalThis.__EqSolver = globalThis.__EqSolver || {}) : this);
