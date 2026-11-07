// SPDX-License-Identifier: MIT
/* 界面模块：把绘图模型画到 canvas 上（网格、坐标轴、曲线、交点、顶点、渐近线） */
(function (NS) {
  'use strict';
  const UIN = NS.ui = NS.ui || {};
  const F = NS.fmt;

  function niceNum(v, digits) {
    const s = F.numToStr(v, digits || 4);
    return s === '-0' ? '0' : s;
  }

  /**
   * @param {HTMLCanvasElement} canvas
   * @param {object} model NS.plot.build() 的结果
   */
  function drawPlot(canvas, model) {
    if (!canvas || !model || !model.ok) return false;
    const hasCurve = model.segments && model.segments.length > 0;
    const w = canvas.clientWidth || 640;
    const h = canvas.clientHeight || 260;
    const dpr = (typeof window !== 'undefined' && window.devicePixelRatio) || 1;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    const ctx = canvas.getContext('2d');
    if (!ctx) return false;
    if (ctx.setTransform) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    const padL = 48, padR = 18, padT = 18, padB = 28;
    const plotW = Math.max(10, w - padL - padR);
    const plotH = Math.max(10, h - padT - padB);
    const px = function (x) { return padL + (x - model.xMin) / (model.xMax - model.xMin) * plotW; };
    const py = function (y) { return h - padB - (y - model.yMin) / (model.yMax - model.yMin) * plotH; };

    /* 网格与刻度 */
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(255,255,255,.07)';
    ctx.font = '11px Consolas, monospace';
    ctx.fillStyle = '#7b8ba3';
    model.xTicks.forEach(function (t) {
      const X = Math.round(px(t)) + .5;
      ctx.beginPath(); ctx.moveTo(X, padT); ctx.lineTo(X, h - padB); ctx.stroke();
      ctx.textAlign = 'center'; ctx.textBaseline = 'top';
      ctx.fillText(niceNum(t), X, h - padB + 6);
    });
    model.yTicks.forEach(function (t) {
      const Y = Math.round(py(t)) + .5;
      ctx.beginPath(); ctx.moveTo(padL, Y); ctx.lineTo(w - padR, Y); ctx.stroke();
      ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
      ctx.fillText(niceNum(t), padL - 7, Y);
    });

    /* 坐标轴 */
    ctx.strokeStyle = 'rgba(255,255,255,.38)';
    ctx.lineWidth = 1.3;
    if (model.yMin <= 0 && model.yMax >= 0) {
      const Y = Math.round(py(0)) + .5;
      ctx.beginPath(); ctx.moveTo(padL, Y); ctx.lineTo(w - padR, Y); ctx.stroke();
    }
    if (model.xMin <= 0 && model.xMax >= 0) {
      const X = Math.round(px(0)) + .5;
      ctx.beginPath(); ctx.moveTo(X, padT); ctx.lineTo(X, h - padB); ctx.stroke();
    }

    /* 竖直渐近线（虚线） */
    if (model.pole !== null && model.pole !== undefined &&
        model.pole > model.xMin && model.pole < model.xMax) {
      const X = Math.round(px(model.pole)) + .5;
      ctx.save();
      ctx.setLineDash([4, 4]);
      ctx.strokeStyle = 'rgba(255,176,32,.55)';
      ctx.beginPath(); ctx.moveTo(X, padT); ctx.lineTo(X, h - padB); ctx.stroke();
      ctx.restore();
    }

    /* 曲线：裁剪在绘图区内，极值不会画到坐标轴文字上 */
    if (hasCurve) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(padL, padT, plotW, plotH);
      ctx.clip();
      ctx.strokeStyle = '#5aa9ff';
      ctx.lineWidth = 2.2;
      ctx.lineJoin = 'round';
      model.segments.forEach(function (seg) {
        ctx.beginPath();
        seg.forEach(function (pt, i) {
          const X = px(pt.x), Y = py(pt.y);
          if (i === 0) ctx.moveTo(X, Y); else ctx.lineTo(X, Y);
        });
        ctx.stroke();
      });
      ctx.restore();
    }

    /* 顶点 */
    if (model.vertex && isFinite(model.vertex.x) && isFinite(model.vertex.y)) {
      const vx = px(model.vertex.x), vy = py(model.vertex.y);
      ctx.fillStyle = '#c3b2ff';
      ctx.beginPath(); ctx.arc(vx, vy, 3.6, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#9d8cf0'; ctx.textAlign = 'left'; ctx.textBaseline = 'bottom';
      ctx.fillText('顶点', vx + 7, vy - 5);
    }

    /* 与 x 轴的交点 */
    (model.roots || []).forEach(function (r) {
      const X = px(r), Y = py(0);
      if (X < padL - 2 || X > w - padR + 2) return;
      ctx.fillStyle = '#35d39a';
      ctx.beginPath(); ctx.arc(X, Y, 4.6, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#7ff0c4'; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
      ctx.fillText(niceNum(r), X, Y + 7);
    });

    /* 左上角的函数说明 */
    ctx.fillStyle = '#93a2b8';
    ctx.font = '12px Consolas, monospace';
    ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    ctx.fillText('y = ' + model.expr + '   [' + model.kindLabel + ']', padL + 4, padT + 2);
    return true;
  }

  UIN.drawPlot = drawPlot;
  UIN.niceNum = niceNum;
})(typeof globalThis !== 'undefined' ? (globalThis.__EqSolver = globalThis.__EqSolver || {}) : this);
