// SPDX-License-Identifier: MIT
/* 模块 4/10：表达式引擎（计算器模式 / 绘图 / 数值求根共用）
 *
 *   + - * / ^ ! 括号、隐式乘法（2x、3(x+1)、2pi）
 *   常数：pi、e、i、ans
 *   函数：sin cos tan asin acos atan / sinh cosh tanh asinh acosh atanh
 *         sqrt cbrt abs exp ln log log10 log2 floor ceil round trunc sign
 *         gamma mod(a,b) nPr(n,r) nCr(n,r) hypot min max deg rad
 *   全部按复数计算（结果落在实轴上时就是实数）；三角函数受「角度制 / 弧度制」影响。
 *
 * 与 20-parser.js（把方程两边化成多项式）是两套解析器：那一边追求精确的
 * 有理数系数，这一边追求「什么都能算」。
 */
(function (NS) {
  'use strict';
  const Error_ = NS.EquationError;
  const C = NS.C;

  const DEG = Math.PI / 180;

  /* ---------------- 规范化 ---------------- */
  /** 在方程解析器的规范化基础上，再处理 π 与 ** 这类写法 */
  function normalize(text) {
    let t = NS.parser.normalizeInput(text);
    t = t.replace(/π/g, 'pi').replace(/\*\*/g, '^');
    return t;
  }

  /* ---------------- 词法 ---------------- */
  function tokenize(src) {
    const out = [];
    let i = 0;
    while (i < src.length) {
      const ch = src[i];
      if (/[0-9]/.test(ch) || (ch === '.' && /[0-9]/.test(src[i + 1] || ''))) {
        let j = i, dot = 0;
        while (j < src.length && (/[0-9]/.test(src[j]) || src[j] === '.')) {
          if (src[j] === '.') dot++;
          j++;
        }
        if (dot > 1) throw new Error_('小数点太多：' + src.slice(i, j));
        if (src[j] === '.') throw new Error_('小数点位置不对：' + src.slice(i, j + 1));
        if (/[eE]/.test(src[j] || '')) {
          let k = j + 1;
          if (/[+-]/.test(src[k] || '')) k++;
          if (/[0-9]/.test(src[k] || '')) {
            while (/[0-9]/.test(src[k] || '')) k++;
            j = k;
          }
        }
        const text = src.slice(i, j);
        const v = parseFloat(text);
        if (!isFinite(v)) throw new Error_('数字太大：' + text);
        out.push({ t: 'num', v: v, text: text });
        i = j;
        continue;
      }
      if (/[A-Za-z_]/.test(ch)) {
        let j = i;
        while (j < src.length && /[A-Za-z0-9_]/.test(src[j])) j++;
        out.push({ t: 'id', v: src.slice(i, j).toLowerCase(), text: src.slice(i, j) });
        i = j;
        continue;
      }
      if ('+-*/^!(),'.indexOf(ch) >= 0) { out.push({ t: ch, text: ch }); i++; continue; }
      if (/[\u4e00-\u9fa5]/.test(ch)) {
        throw new Error_('无法识别的文字「' + ch + '」：请用字母和数学符号');
      }
      throw new Error_('无法识别的符号：' + ch);
    }
    return out;
  }

  /* ---------------- 常数 ---------------- */
  const CONSTANTS = {
    pi: function () { return C.make(Math.PI, 0); },
    e: function () { return C.make(Math.E, 0); },
    i: function () { return C.make(0, 1); },
    tau: function () { return C.make(2 * Math.PI, 0); },
    phi: function () { return C.make((1 + Math.sqrt(5)) / 2, 0); }
  };

  /* ---------------- 函数表 ---------------- */
  /* 值的写法：数字表示恰好这么多个参数，数组表示 [最少, 最多] */
  const FUNCTIONS = {
    sin: 1, cos: 1, tan: 1, asin: 1, acos: 1, atan: 1,
    sinh: 1, cosh: 1, tanh: 1, asinh: 1, acosh: 1, atanh: 1,
    sqrt: 1, cbrt: 1, abs: 1, exp: 1, ln: 1, log10: 1, log2: 1,
    floor: 1, ceil: 1, round: 1, trunc: 1, sign: 1, gamma: 1,
    deg: 1, rad: 1, hypot: 2, mod: 2, ncr: 2, npr: 2,
    log: [1, 2], min: [1, 8], max: [1, 8]
  };
  const DISPLAY_NAME = { ncr: 'nCr', npr: 'nPr' };
  function showName(name) { return DISPLAY_NAME[name] || name; }

  /* ---------------- 语法分析 ---------------- */
  /**
   * 把表达式解析成语法树。
   * @param {string} text 用户输入
   * @param {object} opts { factBindsPower:true 表示 a^b! = (a^b)! }
   */
  function parse(text, opts) {
    opts = opts || {};
    const src = normalize(text);
    if (!src) throw new Error_('请输入一个表达式，例如 2^10 或 sin(30)+1/2');
    const tk = tokenize(src);
    let pos = 0;
    let depth = 0;          // 当前处在几层括号里（用来给出「缺少右括号」的提示）

    const peek = function () { return tk[pos]; };
    const eat = function (t) {
      if (tk[pos] && tk[pos].t === t) { pos++; return true; }
      return false;
    };

    function parseExpr() {
      let node = parseTerm();
      for (;;) {
        if (eat('+')) node = { k: 'add', a: node, b: parseTerm() };
        else if (eat('-')) node = { k: 'sub', a: node, b: parseTerm() };
        else break;
      }
      return node;
    }

    function parseTerm() {
      let node = parseUnary();
      for (;;) {
        const t = peek();
        if (!t) break;
        if (eat('*')) { node = { k: 'mul', a: node, b: parseUnary() }; continue; }
        if (eat('/')) { node = { k: 'div', a: node, b: parseUnary() }; continue; }
        /* 隐式乘法：2x、3(x+1)、2pi、x sin(x) */
        if (t.t === 'num' || t.t === 'id' || t.t === '(') { node = { k: 'mul', a: node, b: parseUnary() }; continue; }
        break;
      }
      return node;
    }

    function parseUnary() {
      if (eat('+')) return parseUnary();
      if (eat('-')) return { k: 'neg', a: parseUnary() };
      return parsePower();
    }

    function parsePower() {
      const base = opts.factBindsPower ? parsePrimary() : parseFactorial();
      if (eat('^')) {
        const exp = opts.factBindsPower ? parseUnaryNoFact() : parseUnary();
        let node = { k: 'pow', a: base, b: exp };
        if (opts.factBindsPower) { while (eat('!')) node = { k: 'fact', a: node }; }
        return node;
      }
      return base;
    }

    function parseUnaryNoFact() {
      if (eat('+')) return parseUnaryNoFact();
      if (eat('-')) return { k: 'neg', a: parseUnaryNoFact() };
      return parsePrimary();
    }

    function parseFactorial() {
      let node = parsePrimary();
      while (eat('!')) node = { k: 'fact', a: node };
      return node;
    }

    function parsePrimary() {
      const t = peek();
      if (!t) {
        if (depth > 0) throw new Error_('括号不匹配：缺少右括号 )');
        throw new Error_('表达式不完整，请检查是否漏写了数字或符号');
      }
      if (t.t === 'num') { pos++; return { k: 'num', v: t.v }; }
      if (t.t === 'id') {
        pos++;
        /* 只有「函数名 + (」才是调用；x(x+1) 这种写法按隐式乘法处理 */
        const isCall = peek() && peek().t === '(' &&
          Object.prototype.hasOwnProperty.call(FUNCTIONS, t.v) &&
          !Object.prototype.hasOwnProperty.call(CONSTANTS, t.v);
        if (isCall) {
          pos++;
          depth++;
          const args = [];
          if (!eat(')')) {
            args.push(parseExpr());
            while (eat(',')) args.push(parseExpr());
            if (!eat(')')) { depth--; throw new Error_('括号不匹配：缺少右括号 )'); }
          }
          depth--;
          return { k: 'call', name: t.v, args: args };
        }
        return { k: 'name', name: t.v };
      }
      if (eat('(')) {
        depth++;
        const inner = parseExpr();
        if (!eat(')')) { depth--; throw new Error_('括号不匹配：缺少右括号 )'); }
        depth--;
        return inner;
      }
      throw new Error_('符号位置不对：' + (t.text || t.t));
    }

    const ast = parseExpr();
    if (pos < tk.length) throw new Error_('多余的内容：' + (tk[pos].text || tk[pos].t));
    return ast;
  }
  /* ---------------- Gamma 与阶乘 ---------------- */
  const LANCZOS = [
    0.99999999999980993, 676.5203681218851, -1259.1392167224028,
    771.32342877765313, -176.61502916214059, 12.507343278686905,
    -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7
  ];

  /** Γ(x)（Lanczos 近似，双精度） */
  function gammaReal(x) {
    if (x < 0.5) {
      const s = Math.sin(Math.PI * x);
      if (s === 0) return NaN;                 // 非正整数：极点
      return Math.PI / (s * gammaReal(1 - x));
    }
    const y = x - 1;
    let a = LANCZOS[0];
    const t = y + 7.5;
    for (let i = 1; i < LANCZOS.length; i++) a += LANCZOS[i] / (y + i);
    return Math.sqrt(2 * Math.PI) * Math.pow(t, y + 0.5) * Math.exp(-t) * a;
  }

  /** 阶乘（整数精确、其余走 Gamma）；只支持实数 */
  function factorial(z, name) {
    const label = name || '阶乘';
    if (!C.isFiniteC(z)) throw new Error_(label + '的结果不是有限数');
    if (!C.isReal(z)) throw new Error_(label + '暂不支持复数参数');
    const x = z.re;
    const nearest = Math.round(x);
    const isInt = Math.abs(x - nearest) < 1e-12;
    if (isInt && x < 0) throw new Error_('负整数没有阶乘（Gamma 函数在该点发散）');
    if (isInt) {
      if (nearest > 170) throw new Error_(label + '结果超出双精度范围（参数大于 170）');
      let r = 1;
      for (let k = 2; k <= nearest; k++) r *= k;
      return C.make(r, 0);
    }
    const g = gammaReal(x + 1);
    if (!isFinite(g)) throw new Error_(label + '（Gamma）结果溢出或无效');
    return C.make(g, 0);
  }

  function needReal(z, name) {
    if (!C.isReal(z)) throw new Error_(showName(name) + ' 只支持实数参数');
    return z.re;
  }

  function fromReal(x) { return C.make(x, 0); }

  /* ---------------- 求值 ---------------- */
  /** 调用一个函数（args 都是复数） */
  function callFunction(name, args, ctx) {
    const arity = FUNCTIONS[name];
    if (arity === undefined) throw new Error_('未知函数：' + showName(name));
    const lo = Array.isArray(arity) ? arity[0] : arity;
    const hi = Array.isArray(arity) ? arity[1] : arity;
    if (args.length < lo || args.length > hi) {
      throw new Error_(showName(name) + ' 需要 ' + (lo === hi ? lo : lo + '~' + hi) + ' 个参数（实际给了 ' + args.length + ' 个）');
    }
    const z = args[0];

    /* 三角与反三角：默认按角度制解释（与参考实现一致） */
    if (name === 'sin' || name === 'cos' || name === 'tan') {
      const arg = (ctx.useDegree && C.isReal(z)) ? fromReal(z.re * DEG) : z;
      return C[name](arg);
    }
    if (name === 'asin' || name === 'acos' || name === 'atan') {
      const r = C[name](z);
      return (ctx.useDegree && C.isReal(r)) ? fromReal(r.re / DEG) : r;
    }
    if (name === 'sinh' || name === 'cosh' || name === 'tanh' ||
        name === 'asinh' || name === 'acosh' || name === 'atanh') {
      return C[name](z);
    }

    switch (name) {
      case 'sqrt':
        return C.sqrt(z);
      case 'cbrt':
        return C.cbrt(z);
      case 'abs':
        return fromReal(C.modulus(z));
      case 'exp':
        return C.expm(z);
      case 'ln': {
        if (C.modulus(z) === 0) throw new Error_('ln 的参数必须大于 0');
        return C.log(z);
      }
      case 'log10': {
        if (C.modulus(z) === 0) throw new Error_('log10 的参数必须大于 0');
        return C.div(C.log(z), fromReal(Math.LN10));
      }
      case 'log2': {
        if (C.modulus(z) === 0) throw new Error_('log2 的参数必须大于 0');
        return C.div(C.log(z), fromReal(Math.LN2));
      }
      case 'log': {
        if (args.length === 1) {
          if (C.modulus(z) === 0) throw new Error_('log 的参数必须大于 0');
          return C.div(C.log(z), fromReal(Math.LN10));
        }
        const base = args[0], value = args[1];
        const lb = C.modulus(base) === 0 ? null : C.log(base);
        if (!lb || C.modulus(lb) === 0) throw new Error_('log 的底数必须大于 0 且不等于 1');
        if (C.modulus(value) === 0) throw new Error_('log 的真数必须大于 0');
        return C.div(C.log(value), lb);
      }
      case 'floor':
        return fromReal(Math.floor(needReal(z, name)));
      case 'ceil':
        return fromReal(Math.ceil(needReal(z, name)));
      case 'round':
        return fromReal(Math.round(needReal(z, name)));
      case 'trunc':
        return fromReal(Math.trunc(needReal(z, name)));
      case 'sign': {
        const x = needReal(z, name);
        return fromReal(x > 0 ? 1 : (x < 0 ? -1 : 0));
      }
      case 'gamma': {
        const x = needReal(z, name);
        const g = gammaReal(x);
        if (!isFinite(g)) throw new Error_('Gamma 在该点溢出或没有定义');
        return fromReal(g);
      }
      case 'mod': {
        const a = needReal(args[0], name), b = needReal(args[1], name);
        if (b === 0) throw new Error_('mod 取余的除数不能为零');
        return fromReal(a % b);
      }
      case 'hypot': {
        const a = needReal(args[0], name), b = needReal(args[1], name);
        return fromReal(Math.hypot(a, b));
      }
      case 'min':
      case 'max': {
        const nums = args.map(function (v) { return needReal(v, name); });
        return fromReal(name === 'min' ? Math.min.apply(null, nums) : Math.max.apply(null, nums));
      }
      case 'deg': {
        return fromReal(needReal(z, name) / DEG);
      }
      case 'rad': {
        return fromReal(needReal(z, name) * DEG);
      }
      case 'npr':
      case 'ncr':
        return permutations(name, args);
      default:
        throw new Error_('未知函数：' + showName(name));
    }
  }

  /** 排列 nPr / 组合 nCr：整数走精确连乘，其余用 Gamma */
  function permutations(name, args) {
    const n = needReal(args[0], name), r = needReal(args[1], name);
    const label = showName(name);
    const nInt = Math.abs(n - Math.round(n)) < 1e-12;
    const rInt = Math.abs(r - Math.round(r)) < 1e-12;
    if (nInt && rInt) {
      if (n < 0 || r < 0) throw new Error_(label + ' 的两个参数都必须是非负整数');
      if (r > n) throw new Error_(label + ' 要求 0 ≤ r ≤ n（这里 n = ' + n + '、r = ' + r + '）');
      const N = Math.round(n), R = Math.round(r);
      if (name === 'npr') {
        let res = 1;
        for (let k = 0; k < R; k++) res *= (N - k);
        if (!isFinite(res)) throw new Error_(label + ' 的结果超出双精度范围');
        return fromReal(res);
      }
      const k = Math.min(R, N - R);
      let res = 1;
      for (let i = 1; i <= k; i++) res = res * (N - k + i) / i;
      if (!isFinite(res)) throw new Error_(label + ' 的结果超出双精度范围');
      return fromReal(Math.round(res));
    }
    const gn = gammaReal(n + 1);
    const gd = name === 'npr' ? gammaReal(n - r + 1) : (gammaReal(r + 1) * gammaReal(n - r + 1));
    const val = gn / gd;
    if (!isFinite(val)) throw new Error_(label + ' 的结果溢出或无效');
    return fromReal(val);
  }

  /** 求值上下文：变量表、角度制、上一次的结果 ans */
  function makeContext(opts) {
    opts = opts || {};
    return {
      vars: opts.vars || {},
      ans: opts.ans === undefined ? null : opts.ans,
      useDegree: opts.useDegree === undefined ? true : !!opts.useDegree
    };
  }

  function resolveName(name, ctx) {
    if (Object.prototype.hasOwnProperty.call(CONSTANTS, name)) return CONSTANTS[name]();
    if (ctx.vars && Object.prototype.hasOwnProperty.call(ctx.vars, name)) {
      const v = ctx.vars[name];
      return (v && typeof v === 'object') ? v : fromReal(v);
    }
    if (name === 'ans') {
      if (!ctx.ans) throw new Error_('还没有可用的 ans：先算出一个结果再引用它');
      return ctx.ans;
    }
    throw new Error_('未知的名称：' + name + '（只认常数 pi、e、i、ans 和函数名）');
  }

  function evaluateAst(node, ctx) {
    switch (node.k) {
      case 'num':
        return fromReal(node.v);
      case 'name':
        return resolveName(node.name, ctx);
      case 'call':
        return callFunction(node.name, node.args.map(function (a) { return evaluateAst(a, ctx); }), ctx);
      case 'add':
        return C.add(evaluateAst(node.a, ctx), evaluateAst(node.b, ctx));
      case 'sub':
        return C.sub(evaluateAst(node.a, ctx), evaluateAst(node.b, ctx));
      case 'mul':
        return C.mul(evaluateAst(node.a, ctx), evaluateAst(node.b, ctx));
      case 'div':
        return C.div(evaluateAst(node.a, ctx), evaluateAst(node.b, ctx));
      case 'pow':
        return C.pow(evaluateAst(node.a, ctx), evaluateAst(node.b, ctx));
      case 'neg':
        return C.neg(evaluateAst(node.a, ctx));
      case 'fact':
        return factorial(evaluateAst(node.a, ctx), '阶乘');
      default:
        throw new Error_('内部错误：未知的表达式节点 ' + node.k);
    }
  }

  /** 收集表达式里用到的变量名（不含常数） */
  function variableNames(node, out) {
    out = out || [];
    switch (node.k) {
      case 'name':
        if (!Object.prototype.hasOwnProperty.call(CONSTANTS, node.name) && node.name !== 'ans' &&
            out.indexOf(node.name) < 0) out.push(node.name);
        break;
      case 'call':
        node.args.forEach(function (a) { variableNames(a, out); });
        break;
      case 'num':
        break;
      default:
        if (node.a) variableNames(node.a, out);
        if (node.b) variableNames(node.b, out);
        break;
    }
    return out;
  }

  /** 文本里是否出现了「函数名(」这种调用（用于给方程模式更友好的提示） */
  function hasFunctionCall(text) {
    const src = normalize(text);
    return Object.keys(FUNCTIONS).some(function (name) {
      return new RegExp('(^|[^a-z0-9_])' + name + '\\s*\\(', 'i').test(src);
    });
  }

  /** 逐个记号扫描：把「常数 / 函数名 / ans / 科学计数法里的 e」以外的单词收集出来 */
  function scanWords(text) {
    const src = normalize(text);
    const words = [];
    let i = 0;
    while (i < src.length) {
      const ch = src[i];
      if (/[0-9.]/.test(ch)) {
        while (i < src.length && /[0-9.]/.test(src[i])) i++;
        if (/[eE]/.test(src[i] || '')) {                 // 科学计数法：1e3、2.5e-4
          let k = i + 1;
          if (/[+-]/.test(src[k] || '')) k++;
          if (/[0-9]/.test(src[k] || '')) {
            i = k;
            while (/[0-9]/.test(src[i] || '')) i++;
          }
        }
        continue;
      }
      if (/[A-Za-z_]/.test(ch)) {
        let j = i;
        while (j < src.length && /[A-Za-z0-9_]/.test(src[j])) j++;
        const word = src.slice(i, j).toLowerCase();
        i = j;
        if (Object.prototype.hasOwnProperty.call(CONSTANTS, word)) continue;
        if (Object.prototype.hasOwnProperty.call(FUNCTIONS, word)) continue;
        if (word === 'ans') continue;
        words.push(word);
        continue;
      }
      i++;
    }
    return words;
  }

  /** 文本里是否含有可能表示未知数的字母（常数与函数名不算） */
  function hasVariable(text) {
    return scanWords(text).length > 0;
  }

  /** 形如 foo、abc 这种「既不是常数也不是函数」的名字（多半是打错了） */
  function unknownWords(text) {
    return scanWords(text).filter(function (w) { return w.length > 1; });
  }

  /** 一次性编译：解析 + 复用语法树 */
  function compile(text, opts) {
    const ast = parse(text, opts);
    return {
      ast: ast,
      normalized: normalize(text),
      variables: variableNames(ast),
      evalWith: function (ctxOpts) {
        return evaluateAst(ast, makeContext(ctxOpts));
      }
    };
  }

  NS.expr = {
    normalize: normalize,
    tokenize: tokenize,
    parse: parse,
    evaluateAst: evaluateAst,
    evaluateText: function (text, opts) {
      return evaluateAst(parse(text, opts), makeContext(opts));
    },
    compile: compile,
    makeContext: makeContext,
    variableNames: variableNames,
    hasVariable: hasVariable,
    unknownWords: unknownWords,
    hasFunctionCall: hasFunctionCall,
    gamma: gammaReal,
    factorial: factorial,
    CONSTANTS: CONSTANTS,
    FUNCTIONS: FUNCTIONS,
    showName: showName
  };
})(typeof globalThis !== 'undefined' ? (globalThis.__EqSolver = globalThis.__EqSolver || {}) : this);
