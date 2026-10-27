// SPDX-License-Identifier: MIT
/* 模块 3/6：输入规范化 + 分词 + 递归下降解析（把方程两边都变成多项式） */
(function (NS) {
  'use strict';
  const Frac = NS.Frac;
  const Error_ = NS.EquationError;
  const P = NS.poly;

  const SUP = { '⁰': '0', '¹': '1', '²': '2', '³': '3', '⁴': '4', '⁵': '5', '⁶': '6', '⁷': '7', '⁸': '8', '⁹': '9' };
  const CIRCLED = ['①', '②', '③', '④', '⑤', '⑥', '⑦', '⑧', '⑨', '⑩', '⑪', '⑫'];

  /** 把用户输入统一成便于解析的形式（全角、上标、乘号等） */
  function normalizeInput(s) {
    let t = String(s == null ? '' : s);
    t = t.replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹]+/g, m => '^' + m.split('').map(c => SUP[c]).join(''));
    t = t.replace(/[⁺]/g, '+').replace(/[⁻]/g, '-');
    t = t.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
    t = t.replace(/[×✕✖·⋅∙]/g, '*').replace(/[＊]/g, '*');
    t = t.replace(/[÷／]/g, '/');
    t = t.replace(/[−–—－ー]/g, '-').replace(/[＋]/g, '+');
    t = t.replace(/[＾ˆ]/g, '^');
    t = t.replace(/[＝]/g, '=');
    t = t.replace(/[（]/g, '(').replace(/[）]/g, ')');
    t = t.replace(/[．]/g, '.');
    t = t.replace(/[［【]/g, '(').replace(/[］】]/g, ')');
    t = t.replace(/\s+/g, '');
    return t;
  }

  function tokenize(src) {
    const tokens = [];
    let i = 0;
    while (i < src.length) {
      const c = src[i];
      if (/[0-9.]/.test(c)) {
        let j = i, dot = 0;
        while (j < src.length && (/[0-9]/.test(src[j]) || src[j] === '.')) {
          if (src[j] === '.') dot++;
          j++;
        }
        if (dot > 1) throw new Error_('小数点太多：' + src.slice(i, j));
        tokens.push({ t: 'num', v: Frac.parse(src.slice(i, j)) });
        i = j;
        continue;
      }
      if (/[A-Za-z]/.test(c)) { tokens.push({ t: 'id', v: c }); i++; continue; }
      if (c === '+' || c === '-' || c === '*' || c === '/' || c === '^') { tokens.push({ t: 'op', v: c }); i++; continue; }
      if (c === '(') { tokens.push({ t: 'lp' }); i++; continue; }
      if (c === ')') { tokens.push({ t: 'rp' }); i++; continue; }
      if (c === '=') { tokens.push({ t: 'eq' }); i++; continue; }
      if (/[\u4e00-\u9fa5]/.test(c)) {
        throw new Error_('请用字母表示未知数（例如 x），不要使用「' + c + '」');
      }
      throw new Error_('无法识别的符号：' + c);
    }
    return tokens;
  }

  function Parser(tokens) {
    this.tk = tokens;
    this.pos = 0;
    this.variable = null;
  }

  Parser.prototype.peek = function () { return this.tk[this.pos]; };
  Parser.prototype.next = function () { return this.tk[this.pos++]; };
  Parser.prototype.isOp = function (ch) {
    const k = this.peek();
    return !!k && k.t === 'op' && k.v === ch;
  };

  Parser.prototype.expect = function (t) {
    const k = this.next();
    if (!k || k.t !== t) throw new Error_('括号不匹配或表达式不完整');
    return k;
  };

  /** equation := expr [ '=' expr ] */
  Parser.prototype.parseEquation = function () {
    if (!this.tk.length) throw new Error_('请输入一个方程，例如 2x + 3 = 0 或 x² - 5x + 6 = 0');
    const left = this.parseExpr();
    let right = [P.ZERO];
    if (this.peek() && this.peek().t === 'eq') {
      this.next();
      right = this.parseExpr();
    }
    if (this.pos < this.tk.length) throw new Error_('等号后面还有无法解析的内容，请检查运算符和括号');
    if (!this.variable) this.variable = 'x';
    return { left: P.pTrim(left), right: P.pTrim(right), variable: this.variable };
  };

  /** expr := term ( ('+' | '-') term )* */
  Parser.prototype.parseExpr = function () {
    let node = this.parseTerm();
    for (;;) {
      if (this.isOp('+') || this.isOp('-')) {
        const op = this.next().v;
        const rhs = this.parseTerm();
        node = op === '+' ? P.pAdd(node, rhs) : P.pSub(node, rhs);
      } else break;
    }
    return node;
  };

  /** term := unary ( ('*' | '/' | 隐式乘) unary )* */
  Parser.prototype.parseTerm = function () {
    let node = this.parseUnary();
    for (;;) {
      const k = this.peek();
      if (!k) break;
      if (k.t === 'op' && (k.v === '*' || k.v === '/')) {
        this.next();
        const rhs = this.parseUnary();
        node = k.v === '*' ? P.pMul(node, rhs) : P.pDiv(node, rhs);
      } else if (k.t === 'num' || k.t === 'id' || k.t === 'lp') {
        // 隐式乘法：2x、3(x+1)、x(x-1)、(x+1)(x-2)
        node = P.pMul(node, this.parseUnary());
      } else break;
    }
    return node;
  };

  /** unary := ('+' | '-')* power */
  Parser.prototype.parseUnary = function () {
    if (this.isOp('+') || this.isOp('-')) {
      const op = this.next().v;
      const v = this.parseUnary();
      return op === '-' ? P.pNeg(v) : v;
    }
    return this.parsePower();
  };

  /** power := primary [ '^' unary ]，指数必须是 0~20 的整数常数 */
  Parser.prototype.parsePower = function () {
    const base = this.parsePrimary();
    if (this.isOp('^')) {
      this.next();
      const exp = P.pToConstantInt(this.parseUnary());
      return P.pPow(base, exp);
    }
    return base;
  };

  Parser.prototype.parsePrimary = function () {
    const k = this.next();
    if (!k) throw new Error_('表达式不完整，请检查是否漏写了数字或符号');
    if (k.t === 'num') return [k.v];
    if (k.t === 'id') {
      if (!this.variable) this.variable = k.v;
      else if (this.variable.toLowerCase() !== k.v.toLowerCase()) {
        throw new Error_('目前只支持一个未知数（同时出现了 ' + this.variable + ' 和 ' + k.v + '）');
      }
      return [P.ZERO, P.ONE];
    }
    if (k.t === 'lp') {
      const inner = this.parseExpr();
      this.expect('rp');
      return inner;
    }
    throw new Error_('符号位置不对：' + (k.v || k.t));
  };

  /** 对外入口：把一段文本解析成 { left, right, variable } */
  function parseEquationText(text) {
    const normalized = normalizeInput(text);
    const parser = new Parser(tokenize(normalized));
    const r = parser.parseEquation();
    r.normalized = normalized;
    return r;
  }

  NS.parser = { normalizeInput: normalizeInput, tokenize: tokenize, Parser: Parser, parseEquationText: parseEquationText };
  NS.CIRCLED = CIRCLED;
})(typeof globalThis !== 'undefined' ? (globalThis.__EqSolver = globalThis.__EqSolver || {}) : this);