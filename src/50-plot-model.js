// SPDX-License-Identifier: MIT
/* 模块 9/10：函数绘图模型（与界面无关）
 *
 * 输入一段函数表达式（例如 x^2-4、1/x、sin(x)），输出一个可以直接画出来的模型：
 *   x/y 范围（自动或手动）、采样点、按不连续处分好的折线段、与 x 轴的交点、
 *   顶点、竖直渐近线、刻度、以及函数类型的中文名。
 * 网页（canvas）与命令行（ASCII）共用这一份模型。
 */
(function (NS) {
  'use strict';
  const C = NS.C;
  const F = NS.fmt;
  const P = NS.poly;
  const Frac = NS.Frac;

  const DEFAULT_X = 8;          // 默认横向范围 [-8, 8]（与参考实现一致）
  const KIND_LABEL = {
    constant: '常数函数',
    linear: '一次函数',
    quadratic: '二次函数',
    polynomial: '多项式函数',
    reciprocal: '反比例函数',
    'reciprocal-shifted': '平移反比例函数',
    general: '一般函数'
  };

  /* ---------------- 刻度 ---------------- */
  function niceStep(span, target) {
    const raw = span / Math.max(1, target);
    if (!isFinite(raw) || raw <= 0) return 1;
    const mag = Math.pow(10, Math.floor(Math.log10(raw)));
    const norm = raw / mag;
    const mult = norm <= 1 ? 1 : (norm <= 2 ? 2 : (norm <= 5 ? 5 : 10));
    return mult * mag;
  }

  function ticks(lo, hi, target) {
    const step = niceStep(hi - lo, target || 6);
    const start = Math.ceil(lo / step) * step;
    const out = [];
    for (let v = start; v <= hi + step * 1e-6; v += step) out.push(Math.abs(v) < step * 1e-9 ? 0 : v);
    return out;
  }

  /* ---------------- 多项式识别（精确） ---------------- */
  /** 表达式正好是多项式时拿到精确系数；否则返回 null */
  function polynomialOf(text) {
    try {
      const parsed = NS.parser.parseEquationText(text);
      const p = P.pTrim(P.pSub(parsed.left, parsed.right));
      return {
        coeffs: p,
        degree: p.length - 1,
        numbers: p.map(function (f) { return f.toNumber(); })
      };
    } catch (e) {
      return null;
    }
  }

  /* ---------------- 求值 ---------------- */
  function makeSampler(ast, ctx) {
    return function (x) {
      let z;
      try {
        z = NS.expr.evaluateAst(ast, { vars: { x: { re: x, im: 0 } }, useDegree: ctx.useDegree, ans: ctx.ans });
      } catch (e) {
        return null;
      }
      if (!z || !C.isFiniteC(z) || !C.isReal(z, 1e-9)) return null;
      const y = z.re;
      return isFinite(y) ? y : null;
    };
  }

  function sampleRange(f, xMin, xMax, n) {
    const xs = [], ys = [];
    for (let i = 0; i <= n; i++) {
      const x = xMin + (xMax - xMin) * i / n;
      xs.push(x);
      ys.push(f(x));
    }
    return { xs: xs, ys: ys };
  }

  /* ---------------- 求根 ---------------- */
  function dedupeRoots(list) {
    const out = [];
    list.slice().sort(function (a, b) { return a - b; }).forEach(function (r) {
      if (!isFinite(r)) return;
      const last = out[out.length - 1];
      const tol = 1e-7 * Math.max(1, Math.abs(r));
      if (last === undefined || Math.abs(r - last) > tol) out.push(r);
    });
    return out;
  }

  function bisect(f, lo, hi, flo) {
    for (let i = 0; i < 80; i++) {
      const mid = (lo + hi) / 2;
      const fm = f(mid);
      if (fm === null) return null;
      if (fm === 0) return mid;
      if ((flo < 0) === (fm < 0)) { lo = mid; flo = fm; } else hi = mid;
      if (hi - lo <= 1e-15 * Math.max(1, Math.abs(mid))) break;
    }
    return (lo + hi) / 2;
  }

  /** 在 [xMin, xMax] 上靠符号变化找根（排除极点造成的假变号） */
  function scanRoots(f, xMin, xMax, n, yScale) {
    const found = [];
    const tol = 1e-6 * Math.max(1, yScale || 1);
    let prevX = null, prevY = null;
    for (let i = 0; i <= n; i++) {
      const x = xMin + (xMax - xMin) * i / n;
      const y = f(x);
      if (y !== null) {
        if (y === 0) found.push(x);
        else if (prevY !== null && prevY !== 0 && (prevY < 0) !== (y < 0)) {
          const r = bisect(f, prevX, x, prevY);
          if (r !== null && isFinite(r)) {
            const fr = f(r);
            if (fr !== null && Math.abs(fr) <= tol) found.push(r);
          }
        }
      }
      prevX = x; prevY = y;
    }
    return dedupeRoots(found);
  }

  /** 精确系数已知时的实根（一次/二次解析求解，更高次用数值迭代） */
  function polynomialRoots(poly) {
    const n = poly.numbers;
    const deg = poly.degree;
    if (deg === 1) return [-n[0] / n[1]];
    if (deg === 2) {
      const a = n[2], b = n[1], c = n[0];
      const delta = b * b - 4 * a * c;
      if (delta < 0) return [];
      const sq = Math.sqrt(delta);
      return dedupeRoots([(-b - sq) / (2 * a), (-b + sq) / (2 * a)]);
    }
    const scale = Math.max.apply(null, n.map(Math.abs)) || 1;
    if (scale === 0) return [];
    try {
      return dedupeRoots(NS.polyroots.numericRoots(n)
        .filter(function (z) { return Math.abs(z.im) < 1e-7 * Math.max(1, Math.abs(z.re)); })
        .map(function (z) { return z.re; }));
    } catch (e) {
      return [];
    }
  }

  /* ---------------- 函数类型识别（非多项式） ---------------- */
  /** 解 3×3 线性方程组 M·θ = r（克拉默法则）；奇异时返回 null */
  function solve3(m, r) {
    const det = function (a) {
      return a[0][0] * (a[1][1] * a[2][2] - a[1][2] * a[2][1]) -
             a[0][1] * (a[1][0] * a[2][2] - a[1][2] * a[2][0]) +
             a[0][2] * (a[1][0] * a[2][1] - a[1][1] * a[2][0]);
    };
    const D = det(m);
    if (!isFinite(D) || Math.abs(D) < 1e-12) return null;
    const cols = [0, 1, 2].map(function (col) {
      const copy = m.map(function (row, i) {
        return row.map(function (v, j) { return j === col ? r[i] : v; });
      });
      return det(copy) / D;
    });
    return { a: cols[0], b: cols[1], c: cols[2] };
  }

  /**
   * 判断函数是不是反比例函数（可以带平移）：(x-a)(y-b) = k，也就是 xy = b·x + a·y + c。
   * 用三组「分布最开」的采样点精确解出 a、b、k，再用全部点复核 —— 比最小二乘稳，
   * 因为这种函数在窗口里可能几乎是一条水平线，法方程的系数会严重病态。
   */
  function fitShiftedReciprocal(points) {
    const pts = points.filter(function (p) { return p.y !== null && isFinite(p.y); });
    if (pts.length < 8) return null;
    const byY = pts.slice().sort(function (p, q) { return p.y - q.y; });
    const pick = [0.02, 0.15, 0.5, 0.85, 0.98].map(function (t) {
      return byY[Math.min(byY.length - 1, Math.floor(t * byY.length))];
    });
    const tried = [];
    for (let i = 0; i < pick.length; i++) {
      for (let j = i + 1; j < pick.length; j++) {
        for (let k = j + 1; k < pick.length; k++) {
          const m = [[pick[i].y, pick[i].x, 1], [pick[j].y, pick[j].x, 1], [pick[k].y, pick[k].x, 1]];
          const r = [pick[i].x * pick[i].y, pick[j].x * pick[j].y, pick[k].x * pick[k].y];
          const sol = solve3(m, r);
          if (!sol) continue;
          if (tried.some(function (t) { return Math.abs(t.a - sol.a) < 1e-12 && Math.abs(t.k - (sol.c + sol.a * sol.b)) < 1e-12; })) continue;
          tried.push({ a: sol.a, k: sol.c + sol.a * sol.b });
          const kk = sol.c + sol.a * sol.b;
          let ok = true;
          for (let n = 0; n < pts.length; n++) {
            const den = pts[n].x - sol.a;
            if (!isFinite(den) || Math.abs(den) < 1e-9) { ok = false; break; }
            const pred = kk / den + sol.b;
            const err = Math.abs(pred - pts[n].y) / Math.max(Math.abs(pts[n].y), 1);
            if (!isFinite(err) || err > 1e-6) { ok = false; break; }
          }
          if (ok) return { a: sol.a, b: sol.b, k: kk };
        }
      }
    }
    return null;
  }

  function detectKind(poly, samples) {
    if (poly && poly.degree >= 0) {
      if (poly.degree === 0) return { kind: 'constant', pole: null };
      if (poly.degree === 1) return { kind: 'linear', pole: null };
      if (poly.degree === 2) return { kind: 'quadratic', pole: null };
      return { kind: 'polynomial', pole: null };
    }
    const vals = samples.filter(function (p) { return p.y !== null; });
    if (vals.length > 8) {
      let lo = Infinity, hi = -Infinity;
      vals.forEach(function (p) { lo = Math.min(lo, p.y); hi = Math.max(hi, p.y); });
      if (hi - lo < 1e-9 * Math.max(1, Math.abs(hi))) return { kind: 'constant', pole: null };
      const fit = fitShiftedReciprocal(vals);
      if (fit) {
        const flat = Math.abs(fit.a) <= 1e-9 && Math.abs(fit.b) <= 1e-9;
        return { kind: flat ? 'reciprocal' : 'reciprocal-shifted', pole: flat ? 0 : fit.a };
      }
    }
    return { kind: 'general', pole: null };
  }

  /* ---------------- x 窗口 ---------------- */
  function hasTrig(node) {
    if (!node) return false;
    if (node.k === 'call') {
      if (['sin', 'cos', 'tan'].indexOf(node.name) >= 0) return true;
      return node.args.some(hasTrig);
    }
    if (node.k === 'num' || node.k === 'name') return false;
    return hasTrig(node.a) || hasTrig(node.b);
  }

  function chooseXWindow(poly, sampleForScan, opts, trig) {
    const has = function (a, b) {
      return typeof a === 'number' && typeof b === 'number' && isFinite(a) && isFinite(b) && b > a;
    };
    if (has(opts.xMin, opts.xMax)) return [opts.xMin, opts.xMax];
    if (!poly && trig) {
      /* 三角函数：按当前单位给出一个看得见周期的窗口（角度制 ±360°、弧度制 ±2π） */
      return opts.useDegree ? [-360, 360] : [-2 * Math.PI, 2 * Math.PI];
    }
    if (poly && poly.degree === 1) {
      const root = -poly.numbers[0] / poly.numbers[1];
      if (Math.abs(root) <= DEFAULT_X) return [-DEFAULT_X, DEFAULT_X];
      const pad = Math.max(Math.abs(root) * 0.4, 2);
      return [root - pad, root + pad];
    }
    if (poly && poly.degree === 2) {
      const a = poly.numbers[2], b = poly.numbers[1], c = poly.numbers[0];
      const vertex = -b / (2 * a);
      const delta = b * b - 4 * a * c;
      if (delta >= 0) {
        const sq = Math.sqrt(delta);
        const lo = Math.min((-b - sq) / (2 * a), (-b + sq) / (2 * a));
        const hi = Math.max((-b - sq) / (2 * a), (-b + sq) / (2 * a));
        const pad = Math.max((hi - lo) * 0.55, 1.2);
        return [lo - pad, hi + pad];
      }
      return [vertex - 4, vertex + 4];
    }
    if (poly && poly.degree >= 3) {
      const roots = scanRoots(sampleForScan, -20, 20, 400, 1);
      if (roots.length >= 2) {
        const lo = Math.min.apply(null, roots), hi = Math.max.apply(null, roots);
        const pad = Math.max((hi - lo) * 0.3, 2);
        return [lo - pad, hi + pad];
      }
      if (roots.length === 1) return [roots[0] - 4, roots[0] + 4];
    }
    return [-DEFAULT_X, DEFAULT_X];
  }

  /* ---------------- y 窗口 ---------------- */
  function chooseYWindow(ys, rough, opts) {
    if (typeof opts.yMin === 'number' && typeof opts.yMax === 'number' &&
        isFinite(opts.yMin) && isFinite(opts.yMax) && opts.yMax > opts.yMin) {
      return [opts.yMin, opts.yMax];
    }
    const vals = ys.filter(function (v) { return v !== null && isFinite(v); }).sort(function (a, b) { return a - b; });
    if (!vals.length) return [-10, 10];
    let lo, hi;
    if (rough) {
      /* 有极点 / 有算不出来的点：以中位数为中心，按「中间 96% 的偏离量」取值，
         这样少数爆炸点不会把整个窗口撑坏，也不至于像纯分位数那样把头尾削光。 */
      const med = vals[Math.floor(vals.length / 2)];
      const dev = vals.map(function (v) { return Math.abs(v - med); }).sort(function (a, b) { return a - b; });
      let d = dev[Math.min(dev.length - 1, Math.floor(dev.length * 0.96))];
      if (!(d > 0)) d = Math.max(1, Math.abs(med) * 0.5);
      lo = med - d * 1.4;
      hi = med + d * 1.4;
    } else {
      lo = vals[0];
      hi = vals[vals.length - 1];
      const pad = Math.max((hi - lo) * 0.08, Math.abs(hi) * 1e-9, 1e-9);
      lo -= pad; hi += pad;
    }
    if (!(hi > lo)) {
      const c = (hi + lo) / 2 || 0;
      lo = c - 1; hi = c + 1;
    }
    /* 让 y = 0 尽量留在画面里 */
    if (lo > 0) lo = Math.min(0, lo - (hi - lo) * 0.05);
    if (hi < 0) hi = Math.max(0, hi + (hi - lo) * 0.05);
    return [lo, hi];
  }

  /* ---------------- 折线段（在极点处断开） ---------------- */  function buildSegments(xs, ys, yLo, yHi) {
    const span = yHi - yLo;
    const segs = [];
    let cur = [];
    for (let i = 0; i < xs.length; i++) {
      const y = ys[i];
      if (y === null || !isFinite(y)) {
        if (cur.length > 1) segs.push(cur);
        cur = [];
        continue;
      }
      const prev = cur[cur.length - 1];
      if (prev) {
        const jump = Math.abs(y - prev.y);
        const outside = (y < yLo || y > yHi || prev.y < yLo || prev.y > yHi);
        if (jump > span * 2 && outside) {
          if (cur.length > 1) segs.push(cur);
          cur = [];
        }
      }
      cur.push({ x: xs[i], y: y });
    }
    if (cur.length > 1) segs.push(cur);
    return segs;
  }

  /** 左边或右边一大片「算不出实数值」时（如 √x、ln x），把窗口收到有定义的部分 */
  function trimUndefinedWindow(sampled, xMin, xMax) {
    const n = sampled.ys.length;
    let lo = 0;
    while (lo < n && sampled.ys[lo] === null) lo++;
    let hi = n - 1;
    while (hi >= 0 && sampled.ys[hi] === null) hi--;
    if (lo >= hi) return null;
    if (hi - lo < n * 0.2) return null;
    const changedLo = lo > n * 0.15;
    const changedHi = (n - 1 - hi) > n * 0.15;
    if (!changedLo && !changedHi) return null;
    return [changedLo ? sampled.xs[lo] : xMin, changedHi ? sampled.xs[hi] : xMax];
  }

  /* ---------------- 组装 ---------------- */  /**
   * @param {string} exprText 函数表达式（可带 "y=" 前缀）
   * @param {object} opts { xMin, xMax, yMin, yMax, samples, useDegree, ans, factBindsPower }
   */
  function build(exprText, opts) {
    opts = opts || {};
    let text = String(exprText == null ? '' : exprText).trim();
    if (!text) return { ok: false, error: '请给出要绘制的函数，例如 plot x^2-4 或 plot sin(x)' };
    text = text.replace(/^\s*y\s*=\s*/i, '');
    if (!text) return { ok: false, error: 'plot 后面缺少函数表达式' };

    let ast;
    try {
      ast = NS.expr.parse(text, { factBindsPower: !!opts.factBindsPower });
    } catch (err) {
      return { ok: false, error: '无法解析绘图表达式：' + (err && err.message ? err.message : err) };
    }
    const names = NS.expr.variableNames(ast);
    const extra = names.filter(function (n) { return n !== 'x'; });
    if (extra.length) {
      return { ok: false, error: '绘图只支持一个变量 x（出现了 ' + extra.join('、') + '）' };
    }

    const ctx = { useDegree: opts.useDegree === undefined ? true : !!opts.useDegree, ans: opts.ans || null };
    const f = makeSampler(ast, ctx);
    const poly = polynomialOf(text);
    const N = Math.max(80, Math.min(4000, opts.samples || 600));

    const xWindow = chooseXWindow(poly, f, { xMin: opts.xMin, xMax: opts.xMax, useDegree: ctx.useDegree }, hasTrig(ast));
    let xMin = xWindow[0], xMax = xWindow[1];
    const fixedRange = typeof opts.xMin === 'number' && typeof opts.xMax === 'number' &&
      isFinite(opts.xMin) && isFinite(opts.xMax) && opts.xMax > opts.xMin;

    let sampled = sampleRange(f, xMin, xMax, N);
    if (!fixedRange && !poly) {
      const trimmed = trimUndefinedWindow(sampled, xMin, xMax);
      if (trimmed) {
        xMin = trimmed[0]; xMax = trimmed[1];
        sampled = sampleRange(f, xMin, xMax, N);
      }
    }
    const maxAbs = sampled.ys.reduce(function (m, v) {
      return v === null ? m : Math.max(m, Math.abs(v));
    }, 0);
    if (!isFinite(maxAbs)) return { ok: false, error: '这个函数在给定范围内数值太大，换一个范围试试' };

    const type = detectKind(poly, sampled.xs.map(function (x, i) {
      return { x: x, y: sampled.ys[i] };
    }));
    const pole = type.kind === 'reciprocal' ? 0 : (type.kind === 'reciprocal-shifted' ? type.pole : null);

    /* 有没有「坏点」：算不出实数值的点、或者数值爆炸（暗示极点） */
    const finiteVals = sampled.ys.filter(function (v) { return v !== null && isFinite(v); })
      .map(Math.abs).sort(function (a, b) { return a - b; });
    const medianAbs = finiteVals.length ? finiteVals[Math.floor(finiteVals.length / 2)] : 0;
    const hasBadPoints = sampled.ys.some(function (v) { return v === null; });
    const hasWild = maxAbs > 100 * Math.max(medianAbs, 1e-12) && maxAbs > 1e6;
    const rough = hasBadPoints || pole !== null || hasWild;
    const yWindow = chooseYWindow(sampled.ys, rough, opts);
    const yMin = yWindow[0], yMax = yWindow[1];

    const segments = buildSegments(sampled.xs, sampled.ys, yMin, yMax);

    /* 与 x 轴的交点 */
    const snapZero = function (r) {
      return Math.abs(r) <= 1e-9 * Math.max(1, Math.abs(xMin), Math.abs(xMax)) ? 0 : r;
    };
    let roots;
    if (poly) {
      roots = polynomialRoots(poly).filter(function (r) {
        return r >= xMin - 1e-9 && r <= xMax + 1e-9;
      }).map(snapZero);
    } else {
      roots = scanRoots(f, xMin, xMax, Math.max(600, N), maxAbs).map(snapZero);
    }

    /* 顶点（二次函数） */
    let vertex = null;
    if (poly && poly.degree === 2) {
      const a = poly.numbers[2], b = poly.numbers[1];
      if (a !== 0) {
        const vx = -b / (2 * a);
        const vy = f(vx);
        if (vy !== null) vertex = { x: vx, y: vy };
      }
    }

    const single = !!(poly && poly.degree === 0);
    const kind = single ? 'constant' : type.kind;
    const noteParts = [];
    if (kind === 'reciprocal' || kind === 'reciprocal-shifted') {
      const where = kind === 'reciprocal' ? 'x = 0' : 'x = ' + F.numToStr(type.pole, 4);
      noteParts.push('在 ' + where + ' 附近有竖直渐近线，曲线在那里断开。');
    }
    if (roots.length) {
      noteParts.push('与 x 轴的交点：' + roots.map(function (r) { return 'x = ' + F.numToStr(r, 5); }).join('，') + '。');
    } else if (kind !== 'constant') {
      noteParts.push('在显示范围内与 x 轴没有交点。');
    }

    return {
      ok: true,
      expr: text,
      kind: kind,
      kindLabel: KIND_LABEL[kind] || KIND_LABEL.general,
      degree: poly ? poly.degree : null,
      xMin: xMin, xMax: xMax, yMin: yMin, yMax: yMax,
      samples: sampled,
      segments: segments,
      roots: roots,
      vertex: vertex,
      pole: pole,
      xTicks: ticks(xMin, xMax, 7),
      yTicks: ticks(yMin, yMax, 5),
      useDegree: ctx.useDegree,
      note: noteParts.join('')
    };
  }

  /* ---------------- 命令行 ASCII 绘图 ---------------- */
  /**
   * @param {object} model build() 的结果
   * @param {object} opts { width:41, height:21 }
   */
  function ascii(model, opts) {
    opts = opts || {};
    if (!model || !model.ok) return '无法绘图：' + ((model && model.error) || '未知错误');
    const W = Math.max(21, Math.min(101, opts.width || 61));
    const H = Math.max(9, Math.min(41, opts.height || 21));
    const grid = [];
    for (let r = 0; r < H; r++) grid.push(new Array(W).fill(' '));

    const toCol = function (x) {
      let c = Math.round((x - model.xMin) / (model.xMax - model.xMin) * (W - 1));
      return Math.max(0, Math.min(W - 1, c));
    };
    const toRow = function (y) {
      if (y < model.yMin || y > model.yMax) return -1;
      let r = Math.round((model.yMax - y) / (model.yMax - model.yMin) * (H - 1));
      return Math.max(0, Math.min(H - 1, r));
    };

    let axisRow = toRow(0);
    let axisCol = toCol(0);
    if (axisRow < 0) axisRow = model.yMax > 0 ? H - 1 : 0;
    if (axisCol < 0) axisCol = model.xMax > 0 ? 0 : W - 1;
    for (let c = 0; c < W; c++) grid[axisRow][c] = '-';
    for (let r = 0; r < H; r++) grid[r][axisCol] = '|';
    grid[axisRow][axisCol] = '+';

    /* 竖直渐近线 */
    if (model.pole !== null && model.pole > model.xMin && model.pole < model.xMax) {
      const c = toCol(model.pole);
      for (let r = 0; r < H; r++) if (grid[r][c] === ' ' || grid[r][c] === '-') grid[r][c] = ':';
    }

    model.segments.forEach(function (seg) {
      seg.forEach(function (pt) {
        const r = toRow(pt.y);
        if (r < 0) return;
        const c = toCol(pt.x);
        grid[r][c] = '*';
      });
    });
    model.roots.forEach(function (root) {
      const r = toRow(0);
      const c = toCol(root);
      if (r >= 0) grid[r][c] = 'o';
    });

    grid[axisRow][W - 1] = 'x';
    grid[0][axisCol] = 'y';

    const lines = [];
    lines.push('绘图： y = ' + model.expr + '   [' + model.kindLabel + ']');
    lines.push('x ∈ [' + F.numToStr(model.xMin, 4) + ', ' + F.numToStr(model.xMax, 4) + ']，' +
      'y ∈ [' + F.numToStr(model.yMin, 4) + ', ' + F.numToStr(model.yMax, 4) + ']');
    grid.forEach(function (row) { lines.push(row.join('').replace(/\s+$/, '')); });

    /* x 刻度 */
    const tickLine = new Array(W).fill(' ');
    model.xTicks.forEach(function (t) {
      const c = toCol(t);
      const s = F.numToStr(t, 3);
      let start = c - Math.floor(s.length / 2);
      if (start < 0) start = 0;
      if (start + s.length > W) start = W - s.length;
      for (let i = 0; i < s.length; i++) if (start + i >= 0 && start + i < W) tickLine[start + i] = s[i];
    });
    lines.push(tickLine.join('').replace(/\s+$/, ''));
    lines.push('y 刻度：' + model.yTicks.map(function (t) { return F.numToStr(t, 3); }).join('  '));
    if (model.note) lines.push(model.note);
    return lines.join('\n');
  }

  NS.plot = {
    build: build,
    ascii: ascii,
    ticks: ticks,
    niceStep: niceStep,
    polynomialOf: polynomialOf,
    scanRoots: scanRoots,
    KIND_LABEL: KIND_LABEL
  };
})(typeof globalThis !== 'undefined' ? (globalThis.__EqSolver = globalThis.__EqSolver || {}) : this);
