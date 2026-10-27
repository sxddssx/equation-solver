/* 测试执行器（Node 命令行与浏览器测试页共用） */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.EQ_HARNESS = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  /** 复数 Horner：|a x² + b x + c|，其中 coeffs = [c0, c1, c2] */
  function evalPoly(coeffs, re, im) {
    let zr = 0, zi = 0;
    for (let k = coeffs.length - 1; k >= 0; k--) {
      const c = coeffs[k];
      const nr = zr * re - zi * im + c;
      const ni = zr * im + zi * re;
      zr = nr; zi = ni;
    }
    return Math.hypot(zr, zi);
  }

  function close(a, b) {
    const tol = 1e-6 * Math.max(1, Math.abs(a), Math.abs(b));
    return Math.abs(a - b) <= tol;
  }

  function checkCase(S, c) {
    const problems = [];
    const res = S.solve(c.q);

    if (c.err !== undefined) {
      if (res.ok) problems.push('应当报错，却求解成功了（' + res.solutionText + '）');
      else if (c.err && res.error.indexOf(c.err) < 0) problems.push('错误提示不含「' + c.err + '」，实际为：' + res.error);
      return { problems: problems, res: res };
    }
    if (!res.ok) { problems.push('求解失败：' + res.error); return { problems: problems, res: res }; }

    if (res.solutionType !== c.type) problems.push('解的类型应为 ' + c.type + '，实际是 ' + res.solutionType);

    const got = res.roots.map(r => String(r.exact).trim());
    const want = (c.roots || []).slice();
    if (got.length !== want.length) {
      problems.push('根的个数不符：期望 [' + want.join('，') + ']，实际 [' + got.join('，') + ']');
    } else {
      for (let i = 0; i < want.length; i++) {
        if (got[i] !== want[i]) problems.push('第 ' + (i + 1) + ' 个根：期望 ' + want[i] + '，实际 ' + got[i]);
      }
    }

    const coeffs = res.plot ? res.plot.coeffs : null;
    if (coeffs && res.plot.kind !== 'constant') {
      res.roots.forEach((r, i) => {
        if (!isFinite(r.re) || !isFinite(r.im)) { problems.push('第 ' + (i + 1) + ' 个根没有可用的数值'); return; }
        const v = evalPoly(coeffs, r.re, r.im);
        if (!isFinite(v) || v > 1e-8) problems.push('第 ' + (i + 1) + ' 个根代回标准形式不成立：|f(x)| = ' + v);
      });
    }

    if (c.approx) {
      c.approx.forEach((expect, i) => {
        const r = res.roots[i];
        if (!r || r.approx === null || r.approx === undefined) { problems.push('第 ' + (i + 1) + ' 个根缺少数值近似'); return; }
        if (!close(r.approx, expect)) problems.push('第 ' + (i + 1) + ' 个根的近似值：期望 ' + expect + '，实际 ' + r.approx);
      });
    }

    // 讲解措辞断言：contains 必须出现，notContains 不能出现（在所有步骤文字里找）
    const stepText = (res.steps || []).map(s => s.title + ' ' + s.lines.join(' ')).join(' ');
    (c.contains || []).forEach(t => {
      if (stepText.indexOf(t) < 0) problems.push('步骤讲解里应该出现「' + t + '」，实际没有');
    });
    (c.notContains || []).forEach(t => {
      if (stepText.indexOf(t) >= 0) problems.push('步骤讲解里不应该出现「' + t + '」');
    });
    // maxSteps 用来防止"讲解啰嗦"回潮（例如已经解好的方程不该再走一遍移项流程）
    if (c.maxSteps && res.steps.length > c.maxSteps) {
      problems.push('步骤过多：' + res.steps.length + ' 步（期望不超过 ' + c.maxSteps + ' 步）');
    }
    // 步骤标题里不应该出现重复的推导环节
    const titles = (res.steps || []).map(s => s.title);
    titles.forEach((t, i) => {
      if (titles.indexOf(t) !== i) problems.push('步骤标题重复出现：' + t);
    });

    if (!res.steps || res.steps.length < 3) problems.push('步骤太少，讲解不完整');
    return { problems: problems, res: res };
  }

  function runCases(S, cases) {
    const failures = [];
    const details = [];
    cases.forEach((c, i) => {
      let out;
      try {
        out = checkCase(S, c);
      } catch (err) {
        out = { problems: ['测试抛异常：' + (err && err.message ? err.message : err)], res: null };
      }
      details.push({ index: i, q: c.q, problems: out.problems, res: out.res });
      if (out.problems.length) failures.push({ index: i, q: c.q, problems: out.problems });
    });
    return { total: cases.length, passed: cases.length - failures.length, failed: failures.length, failures: failures, details: details };
  }

  function formatFailures(result) {
    if (!result.failed) return '';
    return result.failures.map(f =>
      '✗ [' + (f.index + 1) + '] ' + JSON.stringify(f.q) + '\n    ' + f.problems.join('\n    ')
    ).join('\n');
  }

  return { checkCase: checkCase, runCases: runCases, formatFailures: formatFailures, evalPoly: evalPoly };
});