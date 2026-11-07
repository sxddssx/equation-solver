/* 绘图用例（Node 与浏览器测试页共用）
 *
 * q         函数表达式（可以带 plot 前缀，也可以不带）
 * kind      期望识别出的函数类型
 * pole      期望的竖直渐近线位置（null 表示不该有）
 * roots     期望在与 x 轴的交点里出现的值
 * noRoots   期望完全没有交点
 * segments  期望的曲线段数（极点两侧会断开）
 * vertex    期望的顶点 [x, y]（二次函数）
 * xRange    期望 x 范围落在这个区间内
 * yIncludesZero 期望 y 范围包含 0（能看见 x 轴）
 * maxYAbs   期望 y 范围的上界不超过这个值（用来检查极点附近的爆炸值被裁掉了）
 * rad       true 表示按弧度制绘图（默认角度制）
 * err       期望报错，值是错误信息片段
 */
var EQ_PLOT_CASES = [
  /* ---- 多项式 ---- */
  { q: '2x+3', kind: 'linear', roots: [-1.5], yIncludesZero: true, segments: 1 },
  { q: 'x^2-4', kind: 'quadratic', roots: [-2, 2], vertex: [0, -4], yIncludesZero: true, segments: 1 },
  { q: 'x^2+2x+10', kind: 'quadratic', noRoots: true, vertex: [-1, 9], segments: 1 },
  { q: 'x^3-3x', kind: 'polynomial', roots: [-Math.sqrt(3), 0, Math.sqrt(3)], yIncludesZero: true, segments: 1 },
  { q: 'y=2x+1', kind: 'linear', roots: [-0.5] },
  { q: '5', kind: 'constant' },

  /* ---- 反比例函数（含平移、极点） ---- */
  { q: '1/x', kind: 'reciprocal', pole: 0, noRoots: true, segments: 2, maxYAbs: 10 },
  { q: '2/x+1', kind: 'reciprocal-shifted', pole: 0, roots: [-2], segments: 2 },
  { q: '1/(x-1)+2', kind: 'reciprocal-shifted', pole: 1, roots: [0.5], segments: 2, maxYAbs: 30 },

  /* ---- 一般函数 ---- */
  { q: 'sin(x)', kind: 'general', roots: [0], segments: 1, maxYAbs: 3 },
  { q: 'sin(x)', rad: true, kind: 'general', roots: [0, Math.PI], segments: 1, maxYAbs: 3 },
  { q: 'abs(x)', kind: 'general', roots: [0], yIncludesZero: true },
  { q: 'sqrt(x)', kind: 'general', roots: [0], xRange: [0, 8] },
  { q: 'ln(x)', kind: 'general', roots: [1] },
  { q: 'exp(x)', kind: 'general', noRoots: true },
  { q: 'x*sin(x)', kind: 'general', roots: [0] },

  /* ---- 应当报错 ---- */
  { q: 'y^2', err: '只支持一个变量' },
  { q: '', err: '缺少' },
  { q: 'sin(', err: '括号' },
  { q: '2x+1=|x|', err: '无法识别' }
];

if (typeof module === 'object' && module.exports) module.exports = EQ_PLOT_CASES;
else if (typeof globalThis !== 'undefined') globalThis.EQ_PLOT_CASES = EQ_PLOT_CASES;
