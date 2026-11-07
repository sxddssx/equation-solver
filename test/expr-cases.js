/* 算式 / 计算模式用例（Node 与浏览器测试页共用）
 *
 * q      输入的算式
 * val    期望的实数结果（相对误差 1e-9）
 * value  期望的结果文字
 * complex 期望的复数结果 [实部, 虚部]
 * exact  期望给出的分数形式
 * mode   期望的模式：'calc' | 'equation' | 'plot'
 * rad    true 表示按弧度制计算（默认角度制）
 * pre    先跑的几条输入（用来准备 ans 之类的状态）
 * err    期望报错，值是错误信息片段
 */
var EQ_EXPR_CASES = [
  /* ---- 四则运算与优先级 ---- */
  { q: '2+3*4', val: 14 },
  { q: '(2+3)*4', val: 20 },
  { q: '2^10', val: 1024 },
  { q: '2^3^2', val: 512 },
  { q: '-2^2', val: -4 },
  { q: '2^-1', val: 0.5 },
  { q: '2(3+4)', val: 14 },
  { q: '(2+3)(4-1)', val: 15 },
  { q: '10/4', val: 2.5, exact: '5/2' },
  { q: '1/3', val: 1 / 3, exact: '1/3' },
  { q: '1/3+1/6', val: 0.5, exact: '1/2' },
  { q: '0.1+0.2', val: 0.3, exact: '3/10' },
  { q: '1e3', val: 1000 },
  { q: '3.5e-2', val: 0.035 },

  /* ---- 常数与隐式乘法 ---- */
  { q: 'pi', val: Math.PI },
  { q: '2pi', val: 2 * Math.PI },
  { q: 'e', val: Math.E },
  { q: 'pi/π', val: 1 },
  { q: 'sqrt(2)^2', val: 2 },
  { q: '2^0.5', val: Math.SQRT2 },

  /* ---- 函数 ---- */
  { q: 'sqrt(16)', val: 4 },
  { q: 'cbrt(-8)', val: -2 },
  { q: 'abs(-7)', val: 7 },
  { q: 'abs(3+4i)', val: 5 },
  { q: 'exp(0)', val: 1 },
  { q: 'ln(e)', val: 1 },
  { q: 'log(2,8)', val: 3 },
  { q: 'log(1000)', val: 3 },
  { q: 'log10(1000)', val: 3 },
  { q: 'log2(1024)', val: 10 },
  { q: 'floor(-2.5)', val: -3 },
  { q: 'ceil(2.1)', val: 3 },
  { q: 'round(2.5)', val: 3 },
  { q: 'trunc(-2.7)', val: -2 },
  { q: 'sign(-9)', val: -1 },
  { q: 'mod(7,3)', val: 1 },
  { q: 'hypot(3,4)', val: 5 },
  { q: 'min(3,1,2)', val: 1 },
  { q: 'max(3,1,2)', val: 3 },
  { q: 'deg(pi)', val: 180 },
  { q: 'rad(180)', val: Math.PI },

  /* ---- 阶乘、Gamma、排列组合 ---- */
  { q: '5!', val: 120 },
  { q: '0!', val: 1 },
  { q: '10!', val: 3628800 },
  { q: '0.5!', val: 0.8862269254527580 },
  { q: 'gamma(5)', val: 24 },
  { q: 'nCr(5,2)', val: 10 },
  { q: 'nPr(5,2)', val: 20 },
  { q: '5!/(2!*3!)', val: 10 },
  { q: '170!', val: 7.257415615307999e306, tol: 1e-9 },

  /* ---- 复数 ---- */
  { q: 'i^2', val: -1, isComplex: false },
  { q: 'sqrt(-4)', complex: [0, 2], isComplex: true },
  { q: '(3+4i)*(1-2i)', complex: [11, -2], isComplex: true },
  { q: '(3+4i)/(1-2i)', complex: [-1, 2], isComplex: true },
  { q: 'e^(i*pi)', val: -1 },
  { q: '(-8)^(1/3)', complex: [1, Math.sqrt(3)], isComplex: true },

  /* ---- 三角函数：默认角度制 ---- */
  { q: 'sin(30)', val: 0.5 },
  { q: 'cos(60)', val: 0.5 },
  { q: 'tan(45)', val: 1 },
  { q: 'asin(0.5)', val: 30 },
  { q: 'atan(1)', val: 45 },
  { q: 'sin(30)+1/2', val: 1 },
  { q: 'sin(2)', val: 0.0348994967025010, tol: 1e-9 },
  { q: 'sinh(0)', val: 0 },

  /* ---- 三角函数：弧度制 ---- */
  { q: 'sin(pi/2)', rad: true, val: 1 },
  { q: 'cos(pi)', rad: true, val: -1 },
  { q: 'atan(1)', rad: true, val: Math.PI / 4 },

  /* ---- 阶乘与幂的优先级（默认 a^b! = a^(b!)） ---- */
  { q: '2^3!', val: 64 },
  { q: '2^3!', factPower: true, val: 40320 },
  { q: '(2^3)!', val: 40320 },

  /* ---- ans ---- */
  { q: 'ans*2', pre: ['21'], val: 42 },
  { q: 'ans+1', pre: ['2+3'], val: 6 },

  /* ---- 自动分发：方程 / 绘图 ---- */
  { q: '2*3', mode: 'calc', val: 6 },
  { q: 'x^2-4', mode: 'equation' },
  { q: '2x+3=5x-9', mode: 'equation' },
  { q: 'plot x^2-4', mode: 'plot' },

  /* ---- 应当报错 ---- */
  { q: 'sin(', err: '括号' },
  { q: '2++', err: '不完整' },
  { q: 'foo(2)', err: '未知的名称' },
  { q: '1/0', err: '除数' },
  { q: 'ln(0)', err: '大于 0' },
  { q: '(-1)!', err: '负整数' },
  { q: '171!', err: '超出' },
  { q: 'tan(90)', err: '没有定义' },
  { q: 'nCr(3,5)', err: '要求' },
  { q: '你好', err: '字母' },
  { q: '@', err: '无法识别' }
];

if (typeof module === 'object' && module.exports) module.exports = EQ_EXPR_CASES;
else if (typeof globalThis !== 'undefined') globalThis.EQ_EXPR_CASES = EQ_EXPR_CASES;
