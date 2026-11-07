/* 测试执行器（Node 命令行与浏览器测试页共用）
 *
 * 三套用例共用这一个文件：
 *   runCases(S, cases)       —— 方程用例（cases.js）
 *   runExprCases(S, cases)   —— 算式 / 计算模式用例（expr-cases.js）
 *   runPlotCases(S, cases)   —— 绘图用例（plot-cases.js）
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.EQ_HARNESS = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  /** 复数 Horner：|a x² + b x + c|，其中 coeffs = [c0, c1, c2, ...] */
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

  function close(a, b, tol) {
    const t = (tol === undefined ? 1e-6 : tol) * Math.max(1, Math.abs(a), Math.abs(b));
    return Math.abs(a - b) <= t;
  }

  /* ---------------- 方程用例 ---------------- */
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

    if (c.reIm) {
      /* 数值根：按实部/虚部分别比对（不比对文字，免得被格式化细节卡住） */
      if (res.roots.length !== c.reIm.length) {
        problems.push('根的个数不符：期望 ' + c.reIm.length + ' 个，实际 ' + res.roots.length + ' 个（' + res.solutionText + '）');
      } else {
        c.reIm.forEach(function (pair, i) {
          const r = res.roots[i];
          if (!close(r.re, pair[0]) || !close(r.im, pair[1], 1e-5)) {
            problems.push('第 ' + (i + 1) + " 个根：期望 " + pair[0] + " + " + pair[1] + "i，实际 " + r.re + " + " + r.im + "i");
          }
        });
      }
    } else {
      const got = res.roots.map(function (r) { return String(r.exact).trim(); });
      const want = (c.roots || []).slice();
      if (got.length !== want.length) {
        problems.push('根的个数不符：期望 [' + want.join('，') + ']，实际 [' + got.join('，') + ']');
      } else {
        for (let i = 0; i < want.length; i++) {
          if (got[i] !== want[i]) problems.push('第 ' + (i + 1) + ' 个根：期望 ' + want[i] + '，实际 ' + got[i]);
        }
      }
    }

    const coeffs = res.plot ? res.plot.coeffs : null;
    if (coeffs && res.plot.kind !== 'constant') {
      res.roots.forEach(function (r, i) {
        if (!isFinite(r.re) || !isFinite(r.im)) { problems.push('第 ' + (i + 1) + ' 个根没有可用的数值'); return; }
        const v = evalPoly(coeffs, r.re, r.im);
        if (!isFinite(v) || v > 1e-6 * Math.max(1, Math.abs(r.re))) {
          problems.push('第 ' + (i + 1) + ' 个根代回标准形式不成立：|f(x)| = ' + v);
        }
      });
    }

    if (c.approx) {
      c.approx.forEach(function (expect, i) {
        const r = res.roots[i];
        if (!r || r.approx === null || r.approx === undefined) { problems.push('第 ' + (i + 1) + ' 个根缺少数值近似'); return; }
        if (!close(r.approx, expect)) problems.push('第 ' + (i + 1) + ' 个根的近似值：期望 ' + expect + '，实际 ' + r.approx);
      });
    }

    /* 讲解措辞断言：contains 必须出现，notContains 不能出现（在所有步骤文字里找） */
    const stepText = (res.steps || []).map(function (s) { return s.title + ' ' + s.lines.join(' '); }).join(' ');
    (c.contains || []).forEach(function (t) {
      if (stepText.indexOf(t) < 0) problems.push('步骤讲解里应该出现「' + t + '」，实际没有');
    });
    (c.notContains || []).forEach(function (t) {
      if (stepText.indexOf(t) >= 0) problems.push('步骤讲解里不应该出现「' + t + '」');
    });
    /* maxSteps 用来防止"讲解啰嗦"回潮（例如已经解好的方程不该再走一遍移项流程） */
    if (c.maxSteps && res.steps.length > c.maxSteps) {
      problems.push('步骤过多：' + res.steps.length + ' 步（期望不超过 ' + c.maxSteps + ' 步）');
    }
    /* 步骤标题里不应该出现重复的推导环节 */
    const titles = (res.steps || []).map(function (s) { return s.title; });
    titles.forEach(function (t, i) {
      if (titles.indexOf(t) !== i) problems.push('步骤标题重复出现：' + t);
    });

    if (!res.steps || res.steps.length < 3) problems.push('步骤太少，讲解不完整');
    return { problems: problems, res: res };
  }

  /* ---------------- 算试用例 ---------------- */
  function checkExprCase(S, c) {
    const problems = [];
    S.setAngleMode(c.rad ? 'rad' : 'deg');
    S.setFactorialMode(!!c.factPower);
    (c.pre || []).forEach(function (q) { S.compute(q); });
    const res = S.compute(c.q);

    if (c.err !== undefined) {
      if (res.ok) problems.push('应当报错，却算出了结果（' + (res.valueText || res.solutionText) + '）');
      else if (c.err && res.error.indexOf(c.err) < 0) problems.push('错误提示不含「' + c.err + '」，实际为：' + res.error);
      return { problems: problems, res: res };
    }
    if (!res.ok) { problems.push('计算失败：' + res.error); return { problems: problems, res: res }; }
    if (c.mode && res.mode !== c.mode) problems.push('模式应为 ' + c.mode + '，实际是 ' + res.mode);
    if (res.mode !== 'calc') {
      if (!c.mode) problems.push('输入 ' + JSON.stringify(c.q) + ' 应当按算式计算，实际模式是 ' + res.mode);
      return { problems: problems, res: res };
    }

    if (c.val !== undefined) {
      if (!isFinite(res.value.re) || !close(res.value.re, c.val, c.tol === undefined ? 1e-9 : c.tol) || Math.abs(res.value.im) > 1e-9) {
        problems.push('结果应为 ' + c.val + '，实际为 ' + res.valueText);
      }
    }
    if (c.value !== undefined) {
      if (res.valueText !== c.value) problems.push('结果文字应为 ' + c.value + '，实际为 ' + res.valueText);
    }
    if (c.complex !== undefined) {
      if (!close(res.value.re, c.complex[0], 1e-9) || !close(res.value.im, c.complex[1], 1e-9)) {
        problems.push('复数结果的实部/虚部应为 ' + c.complex.join(' + ') + 'i，实际为 ' + res.valueText);
      }
    }
    if (c.isComplex === true && !res.complex) problems.push('应当判定为复数结果，实际当成实数');
    if (c.isComplex === false && res.complex) problems.push('应当判定为实数结果，实际当成复数');
    if (c.exact !== undefined && res.exactText !== c.exact) {
      problems.push('分数形式应为 ' + JSON.stringify(c.exact) + '，实际为 ' + JSON.stringify(res.exactText));
    }
    if (c.notExact === true && res.exactText) problems.push('不应给出分数形式，实际给了 ' + res.exactText);
    return { problems: problems, res: res };
  }

  /* ---------------- 绘图用例 ---------------- */
  function checkPlotCase(S, c) {
    const problems = [];
    S.setAngleMode(c.rad ? 'rad' : 'deg');
    const res = S.compute(/^plot\b/i.test(c.q) ? c.q : 'plot ' + c.q);

    if (c.err !== undefined) {
      if (res.ok) problems.push('应当报错，却画出来了');
      else if (c.err && res.error.indexOf(c.err) < 0) problems.push('错误提示不含「' + c.err + '」，实际为：' + res.error);
      return { problems: problems, res: res };
    }
    if (!res.ok) { problems.push('绘图失败：' + res.error); return { problems: problems, res: res }; }
    if (res.mode !== 'plot') { problems.push('应当走绘图模式，实际是 ' + res.mode); return { problems: problems, res: res }; }

    const m = res.model;
    if (c.kind && m.kind !== c.kind) problems.push('函数类型应为 ' + c.kind + '（' + (m.kindLabel || '') + '），实际为 ' + m.kind);
    if (!(m.xMax > m.xMin)) problems.push('x 范围非法：[' + m.xMin + ', ' + m.xMax + ']');
    if (!(m.yMax > m.yMin)) problems.push('y 范围非法：[' + m.yMin + ', ' + m.yMax + ']');
    if (!isFinite(m.xMin) || !isFinite(m.xMax) || !isFinite(m.yMin) || !isFinite(m.yMax)) problems.push('范围里有非有限数');
    if (m.segments.length === 0 && c.segments !== 0) problems.push('没有画出任何曲线段');
    if (c.segments !== undefined && m.segments.length !== c.segments) {
      problems.push('曲线段数应为 ' + c.segments + '，实际 ' + m.segments.length);
    }
    if (c.pole !== undefined) {
      if (c.pole === null) {
        if (m.pole !== null) problems.push('不应有竖直渐近线，实际在 x = ' + m.pole);
      } else if (m.pole === null || !close(m.pole, c.pole, 1e-6)) {
        problems.push('竖直渐近线应在 x = ' + c.pole + '，实际为 ' + m.pole);
      }
    }
    (c.roots || []).forEach(function (want) {
      const hit = m.roots.some(function (r) { return close(r, want, 1e-6); });
      if (!hit) problems.push('交点里应当有 x = ' + want + '，实际是 [' + m.roots.map(function (r) { return +r.toFixed(4); }).join(', ') + ']');
    });
    if (c.noRoots && m.roots.length) problems.push('不应有交点，实际有 ' + m.roots.length + ' 个');
    if (c.xRange) {
      if (m.xMin < c.xRange[0] - 1e-9 || m.xMax > c.xRange[1] + 1e-9) {
        problems.push('x 范围应落在 [' + c.xRange.join(', ') + '] 内，实际是 [' + m.xMin + ', ' + m.xMax + ']');
      }
    }
    if (c.yIncludesZero && !(m.yMin <= 0 && m.yMax >= 0)) {
      problems.push('y 范围应当包含 0，实际是 [' + m.yMin + ', ' + m.yMax + ']');
    }
    if (c.vertex) {
      if (!m.vertex) problems.push('没有算出顶点');
      else if (!close(m.vertex.x, c.vertex[0], 1e-6) || !close(m.vertex.y, c.vertex[1], 1e-6)) {
        problems.push('顶点应为 (' + c.vertex.join(', ') + ')，实际为 (' + m.vertex.x + ', ' + m.vertex.y + ')');
      }
    }
    if (c.maxYAbs !== undefined) {
      if (Math.max(Math.abs(m.yMin), Math.abs(m.yMax)) > c.maxYAbs) {
        problems.push('y 范围太大（' + m.yMin + ' ~ ' + m.yMax + '），说明极点没被裁掉');
      }
    }
    return { problems: problems, res: res };
  }

  /* ---------------- 批量执行 ---------------- */
  function runWith(checker, S, cases) {
    const failures = [];
    const details = [];
    cases.forEach(function (c, i) {
      let out;
      try {
        out = checker(S, c);
      } catch (err) {
        out = { problems: ['测试抛异常：' + (err && err.message ? err.message : err)], res: null };
      }
      details.push({ index: i, q: c.q, problems: out.problems, res: out.res });
      if (out.problems.length) failures.push({ index: i, q: c.q, problems: out.problems });
    });
    return {
      total: cases.length, passed: cases.length - failures.length, failed: failures.length,
      failures: failures, details: details
    };
  }

  function runCases(S, cases) { return runWith(checkCase, S, cases); }
  function runExprCases(S, cases) {
    const r = runWith(checkExprCase, S, cases);
    S.setAngleMode('deg');
    S.setFactorialMode(false);
    return r;
  }
  function runPlotCases(S, cases) {
    const r = runWith(checkPlotCase, S, cases);
    S.setAngleMode('deg');
    return r;
  }

  function formatFailures(result) {
    if (!result.failed) return '';
    return result.failures.map(function (f) {
      return '✗ [' + (f.index + 1) + '] ' + JSON.stringify(f.q) + '\n    ' + f.problems.join('\n    ');
    }).join('\n');
  }

  return {
    checkCase: checkCase, runCases: runCases,
    checkExprCase: checkExprCase, runExprCases: runExprCases,
    checkPlotCase: checkPlotCase, runPlotCases: runPlotCases,
    formatFailures: formatFailures, evalPoly: evalPoly, close: close
  };
});
