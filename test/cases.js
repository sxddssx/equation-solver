/* 测试用例表（Node 与浏览器测试页共用）
 * type: linear 唯一解 | two-roots 两个不等实根 | double 二重根 | complex 复数根
 *       identity 恒等式 | none 无解；err 表示应当报错（值为错误信息片段）
 * roots: 期望的精确解（与界面显示文本一致）
 * approx: 期望的数值近似（由测试独立计算，用于交叉验证）
 */
var EQ_TEST_CASES = [
  /* ---- 一元一次 ---- */
  { q: '2x+3=0', type: 'linear', roots: ['-3/2'], approx: [-1.5] },
  { q: '3x-6=0', type: 'linear', roots: ['2'], approx: [2] },
  { q: '3(x-2)=x+4', type: 'linear', roots: ['5'], approx: [5], contains: ['展开括号、整理两边'] },
  { q: '2(x+3)=4x-1', type: 'linear', roots: ['7/2'], approx: [3.5], contains: ['展开括号、整理两边'] },
  { q: '5=5x', type: 'linear', roots: ['1'], approx: [1], notContains: ['化简后已经得到解'] },
  { q: 'x/2+1=3', type: 'linear', roots: ['4'], approx: [4], contains: ['化简两边'], notContains: ['展开括号'] },
  /* 第一步"化简两边"之后就已经是 x = c：要压缩步骤，不再重复移项/识别类型/解方程 */
  { q: 'x=25/180', type: 'linear', roots: ['5/36'], approx: [0.1388888888888889], maxSteps: 5,
    contains: ['化简两边', '化简后已经得到解', '25/180 的最简形式是 5/36'],
    notContains: ['展开括号', '移项并合并同类项', '两边同时除以', '识别方程类型'] },
  { q: 'x = 5', type: 'linear', roots: ['5'], approx: [5], maxSteps: 5,
    contains: ['化简后已经得到解'], notContains: ['展开括号', '移项并合并同类项', '两边同时除以'] },
  { q: 'x=0.5', type: 'linear', roots: ['1/2'], approx: [0.5], maxSteps: 5,
    contains: ['化简后已经得到解', '0.5 的最简形式是 1/2'], notContains: ['移项并合并同类项'] },
  { q: 'x + 3 - 3 = 7', type: 'linear', roots: ['7'], approx: [7], maxSteps: 5,
    contains: ['化简两边', '化简后已经得到解'], notContains: ['展开括号', '两边同时除以'] },
  { q: '2x=10', type: 'linear', roots: ['5'], approx: [5], notContains: ['化简后已经得到解'] },
  { q: '0.5x+1.5=0', type: 'linear', roots: ['-3'], approx: [-3] },
  { q: '1.2x-3.6=0', type: 'linear', roots: ['3'], approx: [3] },
  { q: '2x+1=3x-1', type: 'linear', roots: ['2'], approx: [2] },
  { q: 'x-(2x-3)=4x-6', type: 'linear', roots: ['9/5'], approx: [1.8] },
  { q: 'x/3=2', type: 'linear', roots: ['6'], approx: [6] },
  { q: '2x=0', type: 'linear', roots: ['0'], approx: [0] },
  { q: '2X+4=0', type: 'linear', roots: ['-2'], approx: [-2] },
  { q: '  2 x + 6 = 0 ', type: 'linear', roots: ['-3'], approx: [-3] },
  { q: '1.5x=3', type: 'linear', roots: ['2'], approx: [2] },
  { q: '5x-2=3x+8', type: 'linear', roots: ['5'], approx: [5] },
  { q: '-2x+7=1-x', type: 'linear', roots: ['6'], approx: [6] },

  /* ---- 一元二次：两个不等实根 ---- */
  { q: 'x^2=4', type: 'two-roots', roots: ['-2', '2'], approx: [-2, 2] },
  { q: 'x²-5x+6=0', type: 'two-roots', roots: ['2', '3'], approx: [2, 3] },
  { q: '2x^2+3x-5=0', type: 'two-roots', roots: ['-5/2', '1'], approx: [-2.5, 1] },
  { q: 'x(x-1)=6', type: 'two-roots', roots: ['-2', '3'], approx: [-2, 3] },
  { q: '3x^2=12', type: 'two-roots', roots: ['-2', '2'], approx: [-2, 2] },
  { q: '(x+1)(x-2)=0', type: 'two-roots', roots: ['-1', '2'], approx: [-1, 2] },
  { q: '(x+1)^2=9', type: 'two-roots', roots: ['-4', '2'], approx: [-4, 2] },
  { q: 'x^2-3x=0', type: 'two-roots', roots: ['0', '3'], approx: [0, 3] },
  { q: '4x²-9=0', type: 'two-roots', roots: ['-3/2', '3/2'], approx: [-1.5, 1.5] },
  { q: 'x²+5x+6=0', type: 'two-roots', roots: ['-3', '-2'], approx: [-3, -2] },
  { q: '2x^2=x^2+4', type: 'two-roots', roots: ['-2', '2'], approx: [-2, 2] },
  { q: 'x^2/2=8', type: 'two-roots', roots: ['-4', '4'], approx: [-4, 4] },
  { q: 'x^2-5x+6', type: 'two-roots', roots: ['2', '3'], approx: [2, 3] },
  { q: 'x²-0.25=0', type: 'two-roots', roots: ['-1/2', '1/2'], approx: [-0.5, 0.5] },
  { q: 'x^2-2x-3=0', type: 'two-roots', roots: ['-1', '3'], approx: [-1, 3] },

  /* ---- 一元二次：无理根（含根式） ---- */
  { q: 'x^2-2=0', type: 'two-roots', roots: ['-√2', '√2'], approx: [-1.4142135623730951, 1.4142135623730951] },
  { q: 'x^2+x-1=0', type: 'two-roots', roots: ['(-1 - √5)/2', '(-1 + √5)/2'], approx: [-1.618033988749895, 0.618033988749895] },
  { q: 'x²-2x-2=0', type: 'two-roots', roots: ['1 - √3', '1 + √3'], approx: [-0.7320508075688772, 2.7320508075688772] },
  { q: '(1/2)x²+x-1=0', type: 'two-roots', roots: ['-1 - √3', '-1 + √3'], approx: [-2.732050807568877, 0.7320508075688772] },
  { q: 'x²+3x+1=0', type: 'two-roots', roots: ['(-3 - √5)/2', '(-3 + √5)/2'], approx: [-2.618033988749895, -0.3819660112501051] },
  { q: 'x²+2x=6', type: 'two-roots', roots: ['-1 - √7', '-1 + √7'], approx: [-3.6457513110645907, 1.6457513110645907] },
  { q: 'x²-4x+1=0', type: 'two-roots', roots: ['2 - √3', '2 + √3'], approx: [0.2679491924311227, 3.7320508075688772] },

  /* ---- 一元二次：二重根 ---- */
  { q: 'x^2-2x+1=0', type: 'double', roots: ['1'], approx: [1] },
  { q: 'x²=0', type: 'double', roots: ['0'], approx: [0] },
  { q: 'x²-6x+9=0', type: 'double', roots: ['3'], approx: [3] },
  { q: '3x²+6x+3=0', type: 'double', roots: ['-1'], approx: [-1] },
  { q: '-x^2+2x-1=0', type: 'double', roots: ['1'], approx: [1] },
  { q: '-2x^2+8x-8=0', type: 'double', roots: ['2'], approx: [2] },
  { q: '(x-1)(x-1)=0', type: 'double', roots: ['1'], approx: [1] },

  /* ---- 一元二次：复数根 ---- */
  { q: 'x^2+1=0', type: 'complex', roots: ['i', '-i'], approx: null },
  { q: 'x²+2x+10=0', type: 'complex', roots: ['-1 + 3i', '-1 - 3i'], approx: null },
  { q: 'x²+x+1=0', type: 'complex', roots: ['(-1/2) + (√3/2)i', '(-1/2) - (√3/2)i'], approx: null },
  { q: 'x²+4x+5=0', type: 'complex', roots: ['-2 + i', '-2 - i'], approx: null },
  { q: 'x²-2x+3=0', type: 'complex', roots: ['1 + √2i', '1 - √2i'], approx: null },
  { q: 'x^2+2x+1=-9', type: 'complex', roots: ['-1 + 3i', '-1 - 3i'], approx: null },

  /* ---- 恒等式 / 无解 ---- */
  { q: 'x+1=x+1', type: 'identity' },
  { q: 'x(x+1)=x²+x', type: 'identity' },
  { q: '0=0', type: 'identity' },
  { q: 'x+2=2+x', type: 'identity' },
  { q: '2(x-1)=2x-2', type: 'identity' },
  { q: '2*3=6', type: 'identity' },
  { q: 'x+1=x+2', type: 'none' },
  { q: '2x+3=2x+5', type: 'none' },
  { q: '3=0', type: 'none' },
  { q: '2*3=7', type: 'none' },

  /* ---- 应当报错 ---- */
  { q: 'x^3=8', err: '只支持一元一次' },
  { q: 'x^4-1=0', err: '只支持一元一次' },
  { q: '1/x=2', err: '分母' },
  { q: 'x+y=1', err: '只支持一个未知数' },
  { q: 'x^2+x=3x^2-x^3', err: '只支持一元一次' },
  { q: '', err: '请先输入' },
  { q: '2x+', err: '不完整' },
  { q: '(x+1=2', err: '括号' },
  { q: 'x^', err: '不完整' },
  { q: '你好', err: '字母' },
  { q: '2x+1=|x|', err: '' }
];

if (typeof module === 'object' && module.exports) module.exports = EQ_TEST_CASES;
else if (typeof globalThis !== 'undefined') globalThis.EQ_TEST_CASES = EQ_TEST_CASES;