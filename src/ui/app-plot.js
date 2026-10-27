// SPDX-License-Identifier: MIT
/* 界面模块：把方程画成图（直线或抛物线），标出根与顶点 */
(function (NS) {
  'use strict';
  const UIN = NS.ui = NS.ui || {};

  function niceStep(span, target) {
    const raw = span / target;
    const mag = Math.pow(10, Math.floor(Math.log10(raw)));
    const norm = raw / mag;
    const mult = norm <= 1 ? 1 : (norm <= 2 ? 2 : (norm <= 5 ? 5 : 10));
    return mult * mag;
  }

  function ticks(lo, hi, target) {
    const step = niceStep(hi - lo, target || 6);
    const start = Math.ceil(lo / step) * step;
    const out = [];
    for (let v = start; v <= hi + step * 1e-6; v += step) out.push(v);
    return out;
  }

  function drawPlot(canvas, plot) {
    if (!canvas || !plot || plot.kind === 'constant' || plot.kind === 'none') return false;
    const F = NS.fmt;
    const coeffs = plot.coeffs || [0, 0, 0];
    const c0 = coeffs[0] || 0, c1 = coeffs[1] || 0, c2 = coeffs[2] || 0;
    const f = x => c0 + c1 * x + c2 * x * x;

    const roots = (plot.realRoots || []).filter(v => isFinite(v));
    const vertexX = c2 !== 0 ? -c1 / (2 * c2) : null;
    const pivot = vertexX !== null ? vertexX : (roots.length ? roots[0] : 0);

    let lo, hi;
    if (roots.length >= 2) {
      const a = Math.min.apply(null, roots), b = Math.max.apply(null, roots);
      const pad = Math.max((b - a) * 0.55, 1.2);
      lo = a - pad; hi = b + pad;
    } else if (roots.length === 1) {
      lo = pivot - 2.6; hi = pivot + 2.6;
    } else {
      lo = pivot - 4; hi = pivot + 4;
    }
    if (!(isFinite(lo) && isFinite(hi)) || hi - lo < 1e-6) { lo = -5; hi = 5; }

    const N = 400, xs = [], ys = [];
    for (let i = 0; i <= N; i++) {
      const x = lo + (hi - lo) * i / N;
      xs.push(x); ys.push(f(x));
    }
    const finite = ys.filter(v => isFinite(v)).slice().sort((a, b) => a - b);
    let yLo, yHi;
    if (!finite.length) { yLo = -1; yHi = 1; }
    else {
      yLo = finite[Math.floor(finite.length * 0.04)];
      yHi = finite[Math.floor(finite.length * 0.96)];
      if (!isFinite(yLo) || !isFinite(yHi) || yHi - yLo < 1e-9) { yLo -= 1; yHi += 1; }
      const span = yHi - yLo;
      yLo -= span * 0.18; yHi += span * 0.18;
      if (yLo > 0.2) yLo = -span * 0.12;            // 保证能看到 x 轴
      if (yHi < -0.2) yHi = span * 0.12;
    }

    const w = canvas.clientWidth || 640, h = 260;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    const padL = 44, padR = 14, padT = 14, padB = 26;
    const px = x => padL + (x - lo) / (hi - lo) * (w - padL - padR);
    const py = y => h - padB - (y - yLo) / (yHi - yLo) * (h - padT - padB);

    /* 网格 */
    ctx.strokeStyle = 'rgba(255,255,255,.07)';
    ctx.lineWidth = 1;
    ctx.font = '11px Consolas, monospace';
    ctx.fillStyle = '#7b8ba3';
    ticks(lo, hi, 6).forEach(t => {
      if (t < lo || t > hi) return;
      const X = Math.round(px(t)) + .5;
      ctx.beginPath(); ctx.moveTo(X, padT); ctx.lineTo(X, h - padB); ctx.stroke();
      ctx.textAlign = 'center'; ctx.textBaseline = 'top';
      ctx.fillText(F.numToStr(t, 4), X, h - padB + 5);
    });
    ticks(yLo, yHi, 4).forEach(t => {
      if (t < yLo || t > yHi) return;
      const Y = Math.round(py(t)) + .5;
      ctx.beginPath(); ctx.moveTo(padL, Y); ctx.lineTo(w - padR, Y); ctx.stroke();
      ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
      ctx.fillText(F.numToStr(t, 4), padL - 6, Y);
    });

    /* 坐标轴 */
    ctx.strokeStyle = 'rgba(255,255,255,.38)';
    ctx.lineWidth = 1.3;
    if (yLo <= 0 && yHi >= 0) {
      const Y = Math.round(py(0)) + .5;
      ctx.beginPath(); ctx.moveTo(padL, Y); ctx.lineTo(w - padR, Y); ctx.stroke();
    }
    if (lo <= 0 && hi >= 0) {
      const X = Math.round(px(0)) + .5;
      ctx.beginPath(); ctx.moveTo(X, padT); ctx.lineTo(X, h - padB); ctx.stroke();
    }

    /* 曲线 */
    ctx.strokeStyle = '#5aa9ff';
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    let started = false;
    for (let i = 0; i <= N; i++) {
      const y = ys[i];
      if (!isFinite(y) || y < yLo - 1e6 || y > yHi + 1e6) { started = false; continue; }
      const X = px(xs[i]);
      const Y = Math.max(padT - 40, Math.min(h - padB + 40, py(y)));
      if (!started) { ctx.moveTo(X, Y); started = true; } else ctx.lineTo(X, Y);
    }
    ctx.stroke();

    /* 顶点 */
    if (vertexX !== null && isFinite(vertexX)) {
      const vy = f(vertexX);
      if (isFinite(vy) && vy >= yLo - 1 && vy <= yHi + 1) {
        ctx.fillStyle = '#c3b2ff';
        ctx.beginPath(); ctx.arc(px(vertexX), py(vy), 3.4, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#9d8cf0'; ctx.textAlign = 'left'; ctx.textBaseline = 'bottom';
        ctx.fillText('顶点', px(vertexX) + 6, py(vy) - 4);
      }
    }

    /* 根 */
    ctx.fillStyle = '#35d39a';
    roots.forEach((r, i) => {
      const Y = py(0), X = px(r);
      if (Y < padT - 2 || Y > h - padB + 2) return;
      ctx.beginPath(); ctx.arc(X, Y, 5, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#7ff0c4'; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
      ctx.fillText(F.numToStr(r, 4), X, Y - 8);
      ctx.fillStyle = '#35d39a';
    });

    /* 图像说明 */
    ctx.fillStyle = '#93a2b8'; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    ctx.font = '12px Consolas, monospace';
    const eq = 'y = ' + (c2 !== 0 ? F.numToStr(c2, 4) + 'x² + ' : '') + (c1 !== 0 ? F.numToStr(c1, 4) + 'x + ' : '') + F.numToStr(c0, 4);
    ctx.fillText(eq.replace(/\+ -/g, '- '), padL + 4, 6);
    return true;
  }

  UIN.drawPlot = drawPlot;
})(typeof globalThis !== 'undefined' ? (globalThis.__EqSolver = globalThis.__EqSolver || {}) : this);