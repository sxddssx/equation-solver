// SPDX-License-Identifier: MIT
/* 模块 5/6：求解主逻辑（一次 / 二次）+ 分步讲解 + 代入验算 */
(function (NS) {
  'use strict';
  const Frac = NS.Frac;
  const Error_ = NS.EquationError;
  const P = NS.poly;
  const F = NS.fmt;
  const Q = NS.quad;

  /** 复数 Horner 求值，返回 |f(x)|，用于代入验算 */
  function residual(poly, re, im) {
    let zr = 0, zi = 0;
    for (let k = poly.length - 1; k >= 0; k--) {
      const c = poly[k].toNumber();
      if (!isFinite(c)) return Infinity;
      const nr = zr * re - zi * im + c;
      const ni = zr * im + zi * re;
      zr = nr; zi = ni;
      if (!isFinite(zr) || !isFinite(zi)) return Infinity;
    }
    return Math.hypot(zr, zi);
  }

  function makeRealRoot(f) {
    f = new Frac(f);
    const num = f.toNumber();
    return { exact: F.fmtFrac(f), display: F.fmtFracBoth(f), approx: num, re: num, im: 0, complex: false };
  }

  function factorTerm(r, v) {           // (x - r)
    r = new Frac(r);
    if (r.isZero()) return v;
    return r.n < 0n ? '(' + v + ' + ' + F.fmtFrac(r.abs()) + ')' : '(' + v + ' - ' + F.fmtFrac(r) + ')';
  }

  function factoredForm(a, r1, r2, v) {
    const coef = a.isOne() ? '' : (a.isNegOne() ? '-' : F.fmtFrac(a));
    return coef + factorTerm(r1, v) + factorTerm(r2, v) + ' = 0';
  }

  function squaredForm(a, r, v) {
    const coef = a.isOne() ? '' : (a.isNegOne() ? '-' : F.fmtFrac(a));
    return coef + factorTerm(r, v) + '² = 0';
  }

  /** sqrtForm 结果转文字：s√M/Q（M=1 时就是有理数） */
  function radicalText(sq) {
    if (sq.M === 1n) {
      const f = new Frac(sq.s, sq.Q);
      return F.fmtFracBoth(f);
    }
    const num = (sq.s === 1n ? '' : sq.s.toString()) + '√' + sq.M.toString();
    return sq.Q === 1n ? num : num + '/' + sq.Q;
  }

  function radicalValue(sq) {
    return Number(sq.s) * Math.sqrt(Number(sq.M)) / Number(sq.Q);
  }

  function verifyStep(res, diff, v, stepper) {
    if (!res.roots.length) return;
    const lines = ['把求得的解代回标准形式 ' + res.standard + ' = 0 检验：'];
    let ok = true;
    res.roots.forEach(root => {
      if (!isFinite(root.re) || !isFinite(root.im)) { ok = false; return; }
      const r = residual(diff, root.re, root.im);
      if (!isFinite(r)) { ok = false; return; }
      const shown = r === 0 ? '0' : (r < 1e-9 ? r.toExponential(2) : F.numToStr(r, 8));
      lines.push(root.expr + '  代入左边得 ' + shown + '，约等于 0，成立 ✓');
    });
    if (ok && lines.length > 1) stepper.push('代入验算', lines);
  }

  function buildSolution(parsed, originalText) {
    const left = parsed.left, right = parsed.right, v = parsed.variable;
    const diff = P.pTrim(P.pSub(left, right));      // 移项后的标准形式
    const deg = diff.length - 1;

    const res = {
      ok: true, input: String(originalText).trim(), normalized: parsed.normalized, variable: v,
      left: F.polyToText(left, v), right: F.polyToText(right, v), standard: F.polyToText(diff, v),
      degree: deg, typeName: '', coefficients: {}, delta: null, steps: [], roots: [],
      solutionLines: [], solutionText: '', solutionType: '', hasRealRoots: false, plot: null, error: ''
    };
    let stepNo = 0;
    const stepper = {
      push: function (title, lines) {
        res.steps.push({
          title: NS.CIRCLED[stepNo] + ' ' + title,
          lines: lines.filter(x => x !== undefined && x !== null && x !== '')
        });
        stepNo++;
      }
    };

    const scan = t => String(t).replace(/\s+/g, '').replace(/²/g, '^2').replace(/³/g, '^3');
    const firstStep = [String(originalText).trim().replace(/\s+/g, ' ')];
    if (scan(originalText) !== scan(res.left + '=' + res.right)) {
      // 只有输入里真的带括号，才说是"展开括号"
      const label = /[()]/.test(String(originalText)) ? '展开括号、整理两边：' : '化简两边：';
      firstStep.push(label + res.left + ' = ' + res.right);
    }
    stepper.push('原方程', firstStep);

    // 形如 x = c 的输入：未知数已经单独在等号左边、右边是常数，不需要真的"移项"
    const isolated = deg === 1 && left.length === 2 && left[0].isZero() && left[1].isOne() && right.length === 1;

    if (isolated) {
      // 第一步"化简两边"之后就已经是 x = c 了，后面不必再移项、再套公式
      const c0 = right[0];
      const lines = ['两边化简后，等号左边只剩未知数 ' + v + '，右边是一个常数 ' + F.fmtFrac(c0) + '，',
        '这已经就是「解」的形式（' + v + ' = ' + F.fmtFracBoth(c0) + '），不需要再移项或两边同除。'];
      const rawRight = String(originalText).split('=')[1];
      const rawRightText = rawRight === undefined ? '' : rawRight.trim().replace(/\s+/g, ' ');
      if (rawRightText && rawRightText.replace(/\s+/g, '') !== String(res.right).replace(/\s+/g, '')) {
        lines.push('（右边的 ' + rawRightText + ' 的最简形式是 ' + res.right + '）');
      }
      lines.push('它等价于一元一次方程 ' + res.standard + ' = 0（a = 1，b = ' + F.fmtFrac(c0.neg()) + '）。');
      stepper.push('化简后已经得到解', lines);
    } else if (right.every(f => f.isZero())) {
      stepper.push('合并同类项', ['右边已经是 0，直接合并左边的同类项。', res.standard + ' = 0']);
    } else {
      const rt = right.length > 1 ? '(' + res.right + ')' : res.right;
      stepper.push('移项并合并同类项', [
        '把等号右边的每一项都移到左边（左边 - 右边 = 0）：',
        res.left + ' - ' + rt + ' = 0',
        '合并同类项，得到标准形式：' + res.standard + ' = 0'
      ]);
    }

    if (deg > 2) {
      throw new Error_('化简后未知数的最高次数是 ' + deg + ' 次，本工具只支持一元一次方程（a' + v + ' + b = 0）和一元二次方程（a' + v + '² + b' + v + ' + c = 0）。');
    }

    /* ---------- 0 次：恒等式或矛盾 ---------- */
    if (deg === 0) {
      const c = diff[0];
      if (c.isZero()) {
        res.typeName = '恒等式';
        stepper.push('判断解的情况', ['整理后得到 0 = 0，无论 ' + v + ' 取什么值这个等式都成立。']);
        res.solutionLines = ['任意实数', '（方程是恒等式，解集为全体实数）'];
        res.solutionText = '任意实数（无穷多解）';
        res.solutionType = 'identity';
        stepper.push('结论', ['解集：' + res.solutionText]);
      } else {
        res.typeName = '矛盾方程';
        stepper.push('判断解的情况', ['整理后得到 ' + F.fmtFrac(c) + ' = 0，这是一个不可能成立的等式。']);
        res.solutionLines = ['无解', '（方程矛盾，解集为空集）'];
        res.solutionText = '无解';
        res.solutionType = 'none';
        stepper.push('结论', ['解集：' + res.solutionText]);
      }
      res.coefficients = { a: '0', b: F.fmtFrac(c) };
      res.plot = { kind: 'constant', coeffs: [c.toNumber(), 0, 0], realRoots: [], note: '' };
      return res;
    }

    /* ---------- 1 次：一元一次方程 ---------- */
    if (deg === 1) {
      const a = diff[1], b = diff[0];
      res.typeName = '一元一次方程';
      res.coefficients = { a: F.fmtFrac(a), b: F.fmtFrac(b) };
      const x = b.neg().div(a);
      if (isolated) {
        // 已经解好的方程：不重复"识别类型 / 解方程"，上一步已经说明它就是解
      } else {
        stepper.push('识别方程类型', [
          '未知数 ' + v + ' 的最高次数是 1，所以是一元一次方程，标准形式为 a' + v + ' + b = 0。',
          '其中 a = ' + F.fmtFrac(a) + '（一次项系数），b = ' + F.fmtFrac(b) + '（常数项），且 a ≠ 0。'
        ]);
        const lines = ['移项（常数项移到等号右边）：' + F.coefVar(a, v) + ' = ' + F.fmtFrac(b.neg())];
        if (!a.isOne()) {
          lines.push('方程两边同时除以 ' + F.fmtFrac(a) + '：');
          lines.push(v + ' = ' + F.fmtFrac(b.neg()) + ' ÷ ' + F.fmtFrac(a) + ' = ' + F.fmtFracBoth(x));
        }
        stepper.push('解方程', lines);
      }
      const root = makeRealRoot(x);
      root.expr = v + ' = ' + F.fmtFrac(x);
      res.roots = [root];
      res.hasRealRoots = true;
      res.solutionLines = [v + ' = ' + F.fmtFracBoth(x)];
      res.solutionText = res.solutionLines[0];
      res.solutionType = 'linear';
      verifyStep(res, diff, v, stepper);
      stepper.push('结论', ['方程有唯一解：' + res.solutionText]);
      res.plot = { kind: 'line', coeffs: [b.toNumber(), a.toNumber(), 0], realRoots: [x.toNumber()], note: '' };
      return res;
    }

    /* ---------- 2 次：一元二次方程 ---------- */
    const a = diff[2], b = diff[1], c = diff[0];
    const twoA = a.mul(new Frac(2n));
    const delta = b.mul(b).sub(a.mul(c).mul(new Frac(4n)));
    res.typeName = '一元二次方程';
    res.coefficients = { a: F.fmtFrac(a), b: F.fmtFrac(b), c: F.fmtFrac(c) };
    res.delta = { exact: F.fmtFracBoth(delta), value: delta.toNumber(), sign: delta.sign() };

    const idLines = [
      '未知数 ' + v + ' 的最高次数是 2，所以是一元二次方程，标准形式为 a' + v + '² + b' + v + ' + c = 0。',
      'a = ' + F.fmtFrac(a) + '，b = ' + F.fmtFrac(b) + '，c = ' + F.fmtFrac(c) + '（a ≠ 0）'
    ];
    if (a.sign() < 0) {
      idLines.push('提示：两边同乘 -1 可得等价方程 ' + F.polyToText(P.pScale(diff, new Frac(-1n)), v) + ' = 0（把 a 变正数，代入公式时不易出错）。');
    }
    stepper.push('识别方程类型', idLines);

    stepper.push('计算判别式 Δ', [
      'Δ = b² - 4ac = (' + F.fmtFrac(b) + ')² - 4 × (' + F.fmtFrac(a) + ') × (' + F.fmtFrac(c) + ')',
      'Δ = ' + F.fmtFracBoth(delta),
      delta.sign() > 0 ? '因为 Δ > 0，方程有两个不相等的实数根。'
        : delta.isZero() ? '因为 Δ = 0，方程有两个相等的实数根（二重根）。'
          : '因为 Δ < 0，方程在实数范围内没有解，但在复数范围内有两个共轭虚根。'
    ]);

    if (delta.isZero()) {
      const x = b.neg().div(twoA);
      stepper.push('用求根公式求解', [
        'Δ = 0 时，两个根相等：' + v + ' = -b / (2a)',
        v + ' = ' + F.fmtFrac(b.neg()) + ' / ' + F.fmtFrac(twoA) + ' = ' + F.fmtFracBoth(x),
        '原方程可写成完全平方：' + squaredForm(a, x, v)
      ]);
      const root = makeRealRoot(x);
      root.expr = v + ' = ' + F.fmtFrac(x) + '（二重根）';
      res.roots = [root];
      res.hasRealRoots = true;
      res.solutionLines = [v + ' = ' + F.fmtFracBoth(x) + '（二重根）'];
      res.solutionText = res.solutionLines[0];
      res.solutionType = 'double';
      verifyStep(res, diff, v, stepper);
      stepper.push('结论', ['方程有两个相等的实数根：' + res.solutionText]);
      res.plot = { kind: 'parabola', coeffs: [c.toNumber(), b.toNumber(), a.toNumber()], realRoots: [x.toNumber()], note: '' };
      return res;
    }

    if (delta.sign() > 0) {
      const sq = Q.sqrtForm(delta);
      const pair = Q.radicalPair(a, b, sq.s, sq.M, sq.Q);
      const sqrtNote = '√Δ = ' + radicalText(sq) + (sq.M === 1n ? '（Δ 是完全平方数，可以直接开出来）' : (sq.s === 1n ? '' : '（把根式化简后的结果）'));
      if (pair.M === 1n) {
        const rA = new Frac(pair.A - pair.K, pair.D);
        const rB = new Frac(pair.A + pair.K, pair.D);
        const lo = rA.cmp(rB) <= 0 ? rA : rB;
        const hi = rA.cmp(rB) <= 0 ? rB : rA;
        const sqrtD = new Frac(sq.s, sq.Q);
        stepper.push('用求根公式求解', [
          sqrtNote,
          v + ' = (-b ± √Δ) / (2a) = (' + F.fmtFrac(b.neg()) + ' ± ' + F.fmtFrac(sqrtD) + ') / ' + F.fmtFrac(twoA),
          '所以 ' + v + '₁ = ' + F.fmtFracBoth(lo) + '，' + v + '₂ = ' + F.fmtFracBoth(hi),
          '也可以直接因式分解：' + factoredForm(a, lo, hi, v)
        ]);
        const r1 = makeRealRoot(lo), r2 = makeRealRoot(hi);
        r1.expr = v + '₁ = ' + F.fmtFrac(lo);
        r2.expr = v + '₂ = ' + F.fmtFrac(hi);
        res.roots = [r1, r2];
        res.solutionLines = [v + '₁ = ' + F.fmtFracBoth(lo), v + '₂ = ' + F.fmtFracBoth(hi)];
      } else {
        const e1 = Q.formatRealRadical(pair, -1), e2 = Q.formatRealRadical(pair, +1);
        const n1 = Q.realRadicalNumber(pair, -1), n2 = Q.realRadicalNumber(pair, +1);
        stepper.push('用求根公式求解', [
          sqrtNote,
          v + ' = (-b ± √Δ) / (2a) = (' + F.fmtFrac(b.neg()) + ' ± ' + radicalText(sq) + ') / ' + F.fmtFrac(twoA),
          '整理后：' + v + '₁ = ' + e1 + ' ≈ ' + F.numToStr(n1, 6) + '，' + v + '₂ = ' + e2 + ' ≈ ' + F.numToStr(n2, 6)
        ]);
        const r1 = { exact: e1, display: e1 + ' ≈ ' + F.numToStr(n1, 6), approx: n1, re: n1, im: 0, complex: false, expr: v + '₁ = ' + e1 };
        const r2 = { exact: e2, display: e2 + ' ≈ ' + F.numToStr(n2, 6), approx: n2, re: n2, im: 0, complex: false, expr: v + '₂ = ' + e2 };
        res.roots = [r1, r2];
        res.solutionLines = [v + '₁ = ' + r1.display, v + '₂ = ' + r2.display];
      }
      res.hasRealRoots = true;
      res.solutionType = 'two-roots';
      res.solutionText = res.solutionLines.join('，');
      verifyStep(res, diff, v, stepper);
      stepper.push('结论', ['方程有两个不相等的实数根：' + res.solutionText]);
      res.plot = {
        kind: 'parabola',
        coeffs: [c.toNumber(), b.toNumber(), a.toNumber()],
        realRoots: res.roots.map(r => r.re),
        note: ''
      };
      return res;
    }

    /* Δ < 0：复数根 */
    const sqp = Q.sqrtForm(delta.neg());
    const pair = Q.radicalPair(a, b, sqp.s, sqp.M, sqp.Q);
    const e1 = Q.formatComplex(pair, +1), e2 = Q.formatComplex(pair, -1);
    stepper.push('在复数范围内求解', [
      'Δ = ' + F.fmtFracBoth(delta) + ' < 0，实数范围内没有解。',
      '先算 -Δ = ' + F.fmtFracBoth(delta.neg()) + '，其算术平方根 √(-Δ) = ' + radicalText(sqp),
      '复数范围内用公式：' + v + ' = (-b ± i√(-Δ)) / (2a)，其中 i 是虚数单位（i² = -1）',
      '得到 ' + v + '₁ = ' + e1 + '，' + v + '₂ = ' + e2
    ]);
    const c1 = Q.complexNumber(pair, +1), c2 = Q.complexNumber(pair, -1);
    res.roots = [
      { exact: e1, display: e1, approx: null, re: c1.re, im: c1.im, complex: true, expr: v + '₁ = ' + e1 },
      { exact: e2, display: e2, approx: null, re: c2.re, im: c2.im, complex: true, expr: v + '₂ = ' + e2 }
    ];
    res.solutionLines = [v + '₁ = ' + e1, v + '₂ = ' + e2, '（i 为虚数单位，实数范围内无解）'];
    res.solutionText = v + '₁ = ' + e1 + '，' + v + '₂ = ' + e2;
    res.solutionType = 'complex';
    res.hasRealRoots = false;
    verifyStep(res, diff, v, stepper);
    stepper.push('结论', ['方程没有实数根；复数范围内解集：' + res.solutionText]);
    res.plot = { kind: 'parabola', coeffs: [c.toNumber(), b.toNumber(), a.toNumber()], realRoots: [], note: '与 x 轴没有交点（Δ < 0）' };
    return res;
  }

  NS.buildSolution = buildSolution;
  NS.residual = residual;
})(typeof globalThis !== 'undefined' ? (globalThis.__EqSolver = globalThis.__EqSolver || {}) : this);