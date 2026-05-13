"use strict";
var CortexEditor = (() => {
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: !0, configurable: !0, writable: !0, value }) : obj[key] = value;
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: !0 });
  }, __copyProps = (to, from, except, desc) => {
    if (from && typeof from == "object" || typeof from == "function")
      for (let key of __getOwnPropNames(from))
        !__hasOwnProp.call(to, key) && key !== except && __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    return to;
  };
  var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: !0 }), mod);
  var __publicField = (obj, key, value) => __defNormalProp(obj, typeof key != "symbol" ? key + "" : key, value);

  // src/browser/index.tsx
  var index_exports = {};
  __export(index_exports, {
    _resetForTesting: () => _resetForTesting,
    bootstrap: () => bootstrap,
    detectTheme: () => detectTheme,
    getThemePreference: () => getThemePreference,
    setThemePreference: () => setThemePreference
  });

  // node_modules/preact/dist/preact.module.js
  var n, l, u, t, i, r, o, e, f, c, s, a, h, p = {}, v = [], y = /acit|ex(?:s|g|n|p|$)|rph|grid|ows|mnc|ntw|ine[ch]|zoo|^ord|itera/i, d = Array.isArray;
  function w(n3, l3) {
    for (var u5 in l3) n3[u5] = l3[u5];
    return n3;
  }
  function g(n3) {
    n3 && n3.parentNode && n3.parentNode.removeChild(n3);
  }
  function _(l3, u5, t4) {
    var i4, r4, o4, e4 = {};
    for (o4 in u5) o4 == "key" ? i4 = u5[o4] : o4 == "ref" ? r4 = u5[o4] : e4[o4] = u5[o4];
    if (arguments.length > 2 && (e4.children = arguments.length > 3 ? n.call(arguments, 2) : t4), typeof l3 == "function" && l3.defaultProps != null) for (o4 in l3.defaultProps) e4[o4] === void 0 && (e4[o4] = l3.defaultProps[o4]);
    return m(l3, e4, i4, r4, null);
  }
  function m(n3, t4, i4, r4, o4) {
    var e4 = { type: n3, props: t4, key: i4, ref: r4, __k: null, __: null, __b: 0, __e: null, __c: null, constructor: void 0, __v: o4 ?? ++u, __i: -1, __u: 0 };
    return o4 == null && l.vnode != null && l.vnode(e4), e4;
  }
  function k(n3) {
    return n3.children;
  }
  function x(n3, l3) {
    this.props = n3, this.context = l3;
  }
  function S(n3, l3) {
    if (l3 == null) return n3.__ ? S(n3.__, n3.__i + 1) : null;
    for (var u5; l3 < n3.__k.length; l3++) if ((u5 = n3.__k[l3]) != null && u5.__e != null) return u5.__e;
    return typeof n3.type == "function" ? S(n3) : null;
  }
  function C(n3) {
    if (n3.__P && n3.__d) {
      var u5 = n3.__v, t4 = u5.__e, i4 = [], r4 = [], o4 = w({}, u5);
      o4.__v = u5.__v + 1, l.vnode && l.vnode(o4), z(n3.__P, o4, u5, n3.__n, n3.__P.namespaceURI, 32 & u5.__u ? [t4] : null, i4, t4 ?? S(u5), !!(32 & u5.__u), r4), o4.__v = u5.__v, o4.__.__k[o4.__i] = o4, V(i4, o4, r4), u5.__e = u5.__ = null, o4.__e != t4 && M(o4);
    }
  }
  function M(n3) {
    if ((n3 = n3.__) != null && n3.__c != null) return n3.__e = n3.__c.base = null, n3.__k.some(function(l3) {
      if (l3 != null && l3.__e != null) return n3.__e = n3.__c.base = l3.__e;
    }), M(n3);
  }
  function $(n3) {
    (!n3.__d && (n3.__d = !0) && i.push(n3) && !I.__r++ || r != l.debounceRendering) && ((r = l.debounceRendering) || o)(I);
  }
  function I() {
    try {
      for (var n3, l3 = 1; i.length; ) i.length > l3 && i.sort(e), n3 = i.shift(), l3 = i.length, C(n3);
    } finally {
      i.length = I.__r = 0;
    }
  }
  function P(n3, l3, u5, t4, i4, r4, o4, e4, f5, c4, s3) {
    var a4, h3, y3, d3, w3, g3, _3, m3 = t4 && t4.__k || v, b = l3.length;
    for (f5 = A(u5, l3, m3, f5, b), a4 = 0; a4 < b; a4++) (y3 = u5.__k[a4]) != null && (h3 = y3.__i != -1 && m3[y3.__i] || p, y3.__i = a4, g3 = z(n3, y3, h3, i4, r4, o4, e4, f5, c4, s3), d3 = y3.__e, y3.ref && h3.ref != y3.ref && (h3.ref && D(h3.ref, null, y3), s3.push(y3.ref, y3.__c || d3, y3)), w3 == null && d3 != null && (w3 = d3), (_3 = !!(4 & y3.__u)) || h3.__k === y3.__k ? f5 = H(y3, f5, n3, _3) : typeof y3.type == "function" && g3 !== void 0 ? f5 = g3 : d3 && (f5 = d3.nextSibling), y3.__u &= -7);
    return u5.__e = w3, f5;
  }
  function A(n3, l3, u5, t4, i4) {
    var r4, o4, e4, f5, c4, s3 = u5.length, a4 = s3, h3 = 0;
    for (n3.__k = new Array(i4), r4 = 0; r4 < i4; r4++) (o4 = l3[r4]) != null && typeof o4 != "boolean" && typeof o4 != "function" ? (typeof o4 == "string" || typeof o4 == "number" || typeof o4 == "bigint" || o4.constructor == String ? o4 = n3.__k[r4] = m(null, o4, null, null, null) : d(o4) ? o4 = n3.__k[r4] = m(k, { children: o4 }, null, null, null) : o4.constructor === void 0 && o4.__b > 0 ? o4 = n3.__k[r4] = m(o4.type, o4.props, o4.key, o4.ref ? o4.ref : null, o4.__v) : n3.__k[r4] = o4, f5 = r4 + h3, o4.__ = n3, o4.__b = n3.__b + 1, e4 = null, (c4 = o4.__i = T(o4, u5, f5, a4)) != -1 && (a4--, (e4 = u5[c4]) && (e4.__u |= 2)), e4 == null || e4.__v == null ? (c4 == -1 && (i4 > s3 ? h3-- : i4 < s3 && h3++), typeof o4.type != "function" && (o4.__u |= 4)) : c4 != f5 && (c4 == f5 - 1 ? h3-- : c4 == f5 + 1 ? h3++ : (c4 > f5 ? h3-- : h3++, o4.__u |= 4))) : n3.__k[r4] = null;
    if (a4) for (r4 = 0; r4 < s3; r4++) (e4 = u5[r4]) != null && (2 & e4.__u) == 0 && (e4.__e == t4 && (t4 = S(e4)), E(e4, e4));
    return t4;
  }
  function H(n3, l3, u5, t4) {
    var i4, r4;
    if (typeof n3.type == "function") {
      for (i4 = n3.__k, r4 = 0; i4 && r4 < i4.length; r4++) i4[r4] && (i4[r4].__ = n3, l3 = H(i4[r4], l3, u5, t4));
      return l3;
    }
    n3.__e != l3 && (t4 && (l3 && n3.type && !l3.parentNode && (l3 = S(n3)), u5.insertBefore(n3.__e, l3 || null)), l3 = n3.__e);
    do
      l3 = l3 && l3.nextSibling;
    while (l3 != null && l3.nodeType == 8);
    return l3;
  }
  function T(n3, l3, u5, t4) {
    var i4, r4, o4, e4 = n3.key, f5 = n3.type, c4 = l3[u5], s3 = c4 != null && (2 & c4.__u) == 0;
    if (c4 === null && e4 == null || s3 && e4 == c4.key && f5 == c4.type) return u5;
    if (t4 > (s3 ? 1 : 0)) {
      for (i4 = u5 - 1, r4 = u5 + 1; i4 >= 0 || r4 < l3.length; ) if ((c4 = l3[o4 = i4 >= 0 ? i4-- : r4++]) != null && (2 & c4.__u) == 0 && e4 == c4.key && f5 == c4.type) return o4;
    }
    return -1;
  }
  function j(n3, l3, u5) {
    l3[0] == "-" ? n3.setProperty(l3, u5 ?? "") : n3[l3] = u5 == null ? "" : typeof u5 != "number" || y.test(l3) ? u5 : u5 + "px";
  }
  function F(n3, l3, u5, t4, i4) {
    var r4, o4;
    n: if (l3 == "style") if (typeof u5 == "string") n3.style.cssText = u5;
    else {
      if (typeof t4 == "string" && (n3.style.cssText = t4 = ""), t4) for (l3 in t4) u5 && l3 in u5 || j(n3.style, l3, "");
      if (u5) for (l3 in u5) t4 && u5[l3] == t4[l3] || j(n3.style, l3, u5[l3]);
    }
    else if (l3[0] == "o" && l3[1] == "n") r4 = l3 != (l3 = l3.replace(f, "$1")), o4 = l3.toLowerCase(), l3 = o4 in n3 || l3 == "onFocusOut" || l3 == "onFocusIn" ? o4.slice(2) : l3.slice(2), n3.l || (n3.l = {}), n3.l[l3 + r4] = u5, u5 ? t4 ? u5.u = t4.u : (u5.u = c, n3.addEventListener(l3, r4 ? a : s, r4)) : n3.removeEventListener(l3, r4 ? a : s, r4);
    else {
      if (i4 == "http://www.w3.org/2000/svg") l3 = l3.replace(/xlink(H|:h)/, "h").replace(/sName$/, "s");
      else if (l3 != "width" && l3 != "height" && l3 != "href" && l3 != "list" && l3 != "form" && l3 != "tabIndex" && l3 != "download" && l3 != "rowSpan" && l3 != "colSpan" && l3 != "role" && l3 != "popover" && l3 in n3) try {
        n3[l3] = u5 ?? "";
        break n;
      } catch {
      }
      typeof u5 == "function" || (u5 == null || u5 === !1 && l3[4] != "-" ? n3.removeAttribute(l3) : n3.setAttribute(l3, l3 == "popover" && u5 == 1 ? "" : u5));
    }
  }
  function O(n3) {
    return function(u5) {
      if (this.l) {
        var t4 = this.l[u5.type + n3];
        if (u5.t == null) u5.t = c++;
        else if (u5.t < t4.u) return;
        return t4(l.event ? l.event(u5) : u5);
      }
    };
  }
  function z(n3, u5, t4, i4, r4, o4, e4, f5, c4, s3) {
    var a4, h3, p3, y3, _3, m3, b, S2, C3, M2, $2, I2, A3, H2, L, T3 = u5.type;
    if (u5.constructor !== void 0) return null;
    128 & t4.__u && (c4 = !!(32 & t4.__u), o4 = [f5 = u5.__e = t4.__e]), (a4 = l.__b) && a4(u5);
    n: if (typeof T3 == "function") try {
      if (S2 = u5.props, C3 = T3.prototype && T3.prototype.render, M2 = (a4 = T3.contextType) && i4[a4.__c], $2 = a4 ? M2 ? M2.props.value : a4.__ : i4, t4.__c ? b = (h3 = u5.__c = t4.__c).__ = h3.__E : (C3 ? u5.__c = h3 = new T3(S2, $2) : (u5.__c = h3 = new x(S2, $2), h3.constructor = T3, h3.render = G), M2 && M2.sub(h3), h3.state || (h3.state = {}), h3.__n = i4, p3 = h3.__d = !0, h3.__h = [], h3._sb = []), C3 && h3.__s == null && (h3.__s = h3.state), C3 && T3.getDerivedStateFromProps != null && (h3.__s == h3.state && (h3.__s = w({}, h3.__s)), w(h3.__s, T3.getDerivedStateFromProps(S2, h3.__s))), y3 = h3.props, _3 = h3.state, h3.__v = u5, p3) C3 && T3.getDerivedStateFromProps == null && h3.componentWillMount != null && h3.componentWillMount(), C3 && h3.componentDidMount != null && h3.__h.push(h3.componentDidMount);
      else {
        if (C3 && T3.getDerivedStateFromProps == null && S2 !== y3 && h3.componentWillReceiveProps != null && h3.componentWillReceiveProps(S2, $2), u5.__v == t4.__v || !h3.__e && h3.shouldComponentUpdate != null && h3.shouldComponentUpdate(S2, h3.__s, $2) === !1) {
          u5.__v != t4.__v && (h3.props = S2, h3.state = h3.__s, h3.__d = !1), u5.__e = t4.__e, u5.__k = t4.__k, u5.__k.some(function(n4) {
            n4 && (n4.__ = u5);
          }), v.push.apply(h3.__h, h3._sb), h3._sb = [], h3.__h.length && e4.push(h3);
          break n;
        }
        h3.componentWillUpdate != null && h3.componentWillUpdate(S2, h3.__s, $2), C3 && h3.componentDidUpdate != null && h3.__h.push(function() {
          h3.componentDidUpdate(y3, _3, m3);
        });
      }
      if (h3.context = $2, h3.props = S2, h3.__P = n3, h3.__e = !1, I2 = l.__r, A3 = 0, C3) h3.state = h3.__s, h3.__d = !1, I2 && I2(u5), a4 = h3.render(h3.props, h3.state, h3.context), v.push.apply(h3.__h, h3._sb), h3._sb = [];
      else do
        h3.__d = !1, I2 && I2(u5), a4 = h3.render(h3.props, h3.state, h3.context), h3.state = h3.__s;
      while (h3.__d && ++A3 < 25);
      h3.state = h3.__s, h3.getChildContext != null && (i4 = w(w({}, i4), h3.getChildContext())), C3 && !p3 && h3.getSnapshotBeforeUpdate != null && (m3 = h3.getSnapshotBeforeUpdate(y3, _3)), H2 = a4 != null && a4.type === k && a4.key == null ? q(a4.props.children) : a4, f5 = P(n3, d(H2) ? H2 : [H2], u5, t4, i4, r4, o4, e4, f5, c4, s3), h3.base = u5.__e, u5.__u &= -161, h3.__h.length && e4.push(h3), b && (h3.__E = h3.__ = null);
    } catch (n4) {
      if (u5.__v = null, c4 || o4 != null) if (n4.then) {
        for (u5.__u |= c4 ? 160 : 128; f5 && f5.nodeType == 8 && f5.nextSibling; ) f5 = f5.nextSibling;
        o4[o4.indexOf(f5)] = null, u5.__e = f5;
      } else {
        for (L = o4.length; L--; ) g(o4[L]);
        N(u5);
      }
      else u5.__e = t4.__e, u5.__k = t4.__k, n4.then || N(u5);
      l.__e(n4, u5, t4);
    }
    else o4 == null && u5.__v == t4.__v ? (u5.__k = t4.__k, u5.__e = t4.__e) : f5 = u5.__e = B(t4.__e, u5, t4, i4, r4, o4, e4, c4, s3);
    return (a4 = l.diffed) && a4(u5), 128 & u5.__u ? void 0 : f5;
  }
  function N(n3) {
    n3 && (n3.__c && (n3.__c.__e = !0), n3.__k && n3.__k.some(N));
  }
  function V(n3, u5, t4) {
    for (var i4 = 0; i4 < t4.length; i4++) D(t4[i4], t4[++i4], t4[++i4]);
    l.__c && l.__c(u5, n3), n3.some(function(u6) {
      try {
        n3 = u6.__h, u6.__h = [], n3.some(function(n4) {
          n4.call(u6);
        });
      } catch (n4) {
        l.__e(n4, u6.__v);
      }
    });
  }
  function q(n3) {
    return typeof n3 != "object" || n3 == null || n3.__b > 0 ? n3 : d(n3) ? n3.map(q) : w({}, n3);
  }
  function B(u5, t4, i4, r4, o4, e4, f5, c4, s3) {
    var a4, h3, v3, y3, w3, _3, m3, b = i4.props || p, k3 = t4.props, x3 = t4.type;
    if (x3 == "svg" ? o4 = "http://www.w3.org/2000/svg" : x3 == "math" ? o4 = "http://www.w3.org/1998/Math/MathML" : o4 || (o4 = "http://www.w3.org/1999/xhtml"), e4 != null) {
      for (a4 = 0; a4 < e4.length; a4++) if ((w3 = e4[a4]) && "setAttribute" in w3 == !!x3 && (x3 ? w3.localName == x3 : w3.nodeType == 3)) {
        u5 = w3, e4[a4] = null;
        break;
      }
    }
    if (u5 == null) {
      if (x3 == null) return document.createTextNode(k3);
      u5 = document.createElementNS(o4, x3, k3.is && k3), c4 && (l.__m && l.__m(t4, e4), c4 = !1), e4 = null;
    }
    if (x3 == null) b === k3 || c4 && u5.data == k3 || (u5.data = k3);
    else {
      if (e4 = e4 && n.call(u5.childNodes), !c4 && e4 != null) for (b = {}, a4 = 0; a4 < u5.attributes.length; a4++) b[(w3 = u5.attributes[a4]).name] = w3.value;
      for (a4 in b) w3 = b[a4], a4 == "dangerouslySetInnerHTML" ? v3 = w3 : a4 == "children" || a4 in k3 || a4 == "value" && "defaultValue" in k3 || a4 == "checked" && "defaultChecked" in k3 || F(u5, a4, null, w3, o4);
      for (a4 in k3) w3 = k3[a4], a4 == "children" ? y3 = w3 : a4 == "dangerouslySetInnerHTML" ? h3 = w3 : a4 == "value" ? _3 = w3 : a4 == "checked" ? m3 = w3 : c4 && typeof w3 != "function" || b[a4] === w3 || F(u5, a4, w3, b[a4], o4);
      if (h3) c4 || v3 && (h3.__html == v3.__html || h3.__html == u5.innerHTML) || (u5.innerHTML = h3.__html), t4.__k = [];
      else if (v3 && (u5.innerHTML = ""), P(t4.type == "template" ? u5.content : u5, d(y3) ? y3 : [y3], t4, i4, r4, x3 == "foreignObject" ? "http://www.w3.org/1999/xhtml" : o4, e4, f5, e4 ? e4[0] : i4.__k && S(i4, 0), c4, s3), e4 != null) for (a4 = e4.length; a4--; ) g(e4[a4]);
      c4 || (a4 = "value", x3 == "progress" && _3 == null ? u5.removeAttribute("value") : _3 != null && (_3 !== u5[a4] || x3 == "progress" && !_3 || x3 == "option" && _3 != b[a4]) && F(u5, a4, _3, b[a4], o4), a4 = "checked", m3 != null && m3 != u5[a4] && F(u5, a4, m3, b[a4], o4));
    }
    return u5;
  }
  function D(n3, u5, t4) {
    try {
      if (typeof n3 == "function") {
        var i4 = typeof n3.__u == "function";
        i4 && n3.__u(), i4 && u5 == null || (n3.__u = n3(u5));
      } else n3.current = u5;
    } catch (n4) {
      l.__e(n4, t4);
    }
  }
  function E(n3, u5, t4) {
    var i4, r4;
    if (l.unmount && l.unmount(n3), (i4 = n3.ref) && (i4.current && i4.current != n3.__e || D(i4, null, u5)), (i4 = n3.__c) != null) {
      if (i4.componentWillUnmount) try {
        i4.componentWillUnmount();
      } catch (n4) {
        l.__e(n4, u5);
      }
      i4.base = i4.__P = null;
    }
    if (i4 = n3.__k) for (r4 = 0; r4 < i4.length; r4++) i4[r4] && E(i4[r4], u5, t4 || typeof n3.type != "function");
    t4 || g(n3.__e), n3.__c = n3.__ = n3.__e = void 0;
  }
  function G(n3, l3, u5) {
    return this.constructor(n3, u5);
  }
  function J(u5, t4, i4) {
    var r4, o4, e4, f5;
    t4 == document && (t4 = document.documentElement), l.__ && l.__(u5, t4), o4 = (r4 = typeof i4 == "function") ? null : i4 && i4.__k || t4.__k, e4 = [], f5 = [], z(t4, u5 = (!r4 && i4 || t4).__k = _(k, null, [u5]), o4 || p, p, t4.namespaceURI, !r4 && i4 ? [i4] : o4 ? null : t4.firstChild ? n.call(t4.childNodes) : null, e4, !r4 && i4 ? i4 : o4 ? o4.__e : t4.firstChild, r4, f5), V(e4, u5, f5);
  }
  function R(n3) {
    function l3(n4) {
      var u5, t4;
      return this.getChildContext || (u5 = /* @__PURE__ */ new Set(), (t4 = {})[l3.__c] = this, this.getChildContext = function() {
        return t4;
      }, this.componentWillUnmount = function() {
        u5 = null;
      }, this.shouldComponentUpdate = function(n5) {
        this.props.value != n5.value && u5.forEach(function(n6) {
          n6.__e = !0, $(n6);
        });
      }, this.sub = function(n5) {
        u5.add(n5);
        var l4 = n5.componentWillUnmount;
        n5.componentWillUnmount = function() {
          u5 && u5.delete(n5), l4 && l4.call(n5);
        };
      }), n4.children;
    }
    return l3.__c = "__cC" + h++, l3.__ = n3, l3.Provider = l3.__l = (l3.Consumer = function(n4, l4) {
      return n4.children(l4);
    }).contextType = l3, l3;
  }
  n = v.slice, l = { __e: function(n3, l3, u5, t4) {
    for (var i4, r4, o4; l3 = l3.__; ) if ((i4 = l3.__c) && !i4.__) try {
      if ((r4 = i4.constructor) && r4.getDerivedStateFromError != null && (i4.setState(r4.getDerivedStateFromError(n3)), o4 = i4.__d), i4.componentDidCatch != null && (i4.componentDidCatch(n3, t4 || {}), o4 = i4.__d), o4) return i4.__E = i4;
    } catch (l4) {
      n3 = l4;
    }
    throw n3;
  } }, u = 0, t = function(n3) {
    return n3 != null && n3.constructor === void 0;
  }, x.prototype.setState = function(n3, l3) {
    var u5;
    u5 = this.__s != null && this.__s != this.state ? this.__s : this.__s = w({}, this.state), typeof n3 == "function" && (n3 = n3(w({}, u5), this.props)), n3 && w(u5, n3), n3 != null && this.__v && (l3 && this._sb.push(l3), $(this));
  }, x.prototype.forceUpdate = function(n3) {
    this.__v && (this.__e = !0, n3 && this.__h.push(n3), $(this));
  }, x.prototype.render = k, i = [], o = typeof Promise == "function" ? Promise.prototype.then.bind(Promise.resolve()) : setTimeout, e = function(n3, l3) {
    return n3.__v.__b - l3.__v.__b;
  }, I.__r = 0, f = /(PointerCapture)$|Capture$/i, c = 0, s = O(!1), a = O(!0), h = 0;

  // node_modules/preact/hooks/dist/hooks.module.js
  var t2, r2, u2, i2, o2 = 0, f2 = [], c2 = l, e2 = c2.__b, a2 = c2.__r, v2 = c2.diffed, l2 = c2.__c, m2 = c2.unmount, s2 = c2.__;
  function p2(n3, t4) {
    c2.__h && c2.__h(r2, n3, o2 || t4), o2 = 0;
    var u5 = r2.__H || (r2.__H = { __: [], __h: [] });
    return n3 >= u5.__.length && u5.__.push({}), u5.__[n3];
  }
  function d2(n3) {
    return o2 = 1, h2(D2, n3);
  }
  function h2(n3, u5, i4) {
    var o4 = p2(t2++, 2);
    if (o4.t = n3, !o4.__c && (o4.__ = [i4 ? i4(u5) : D2(void 0, u5), function(n4) {
      var t4 = o4.__N ? o4.__N[0] : o4.__[0], r4 = o4.t(t4, n4);
      t4 !== r4 && (o4.__N = [r4, o4.__[1]], o4.__c.setState({}));
    }], o4.__c = r2, !r2.__f)) {
      var f5 = function(n4, t4, r4) {
        if (!o4.__c.__H) return !0;
        var u6 = o4.__c.__H.__.filter(function(n5) {
          return n5.__c;
        });
        if (u6.every(function(n5) {
          return !n5.__N;
        })) return !c4 || c4.call(this, n4, t4, r4);
        var i5 = o4.__c.props !== n4;
        return u6.some(function(n5) {
          if (n5.__N) {
            var t5 = n5.__[0];
            n5.__ = n5.__N, n5.__N = void 0, t5 !== n5.__[0] && (i5 = !0);
          }
        }), c4 && c4.call(this, n4, t4, r4) || i5;
      };
      r2.__f = !0;
      var c4 = r2.shouldComponentUpdate, e4 = r2.componentWillUpdate;
      r2.componentWillUpdate = function(n4, t4, r4) {
        if (this.__e) {
          var u6 = c4;
          c4 = void 0, f5(n4, t4, r4), c4 = u6;
        }
        e4 && e4.call(this, n4, t4, r4);
      }, r2.shouldComponentUpdate = f5;
    }
    return o4.__N || o4.__;
  }
  function y2(n3, u5) {
    var i4 = p2(t2++, 3);
    !c2.__s && C2(i4.__H, u5) && (i4.__ = n3, i4.u = u5, r2.__H.__h.push(i4));
  }
  function _2(n3, u5) {
    var i4 = p2(t2++, 4);
    !c2.__s && C2(i4.__H, u5) && (i4.__ = n3, i4.u = u5, r2.__h.push(i4));
  }
  function A2(n3) {
    return o2 = 5, T2(function() {
      return { current: n3 };
    }, []);
  }
  function T2(n3, r4) {
    var u5 = p2(t2++, 7);
    return C2(u5.__H, r4) && (u5.__ = n3(), u5.__H = r4, u5.__h = n3), u5.__;
  }
  function q2(n3, t4) {
    return o2 = 8, T2(function() {
      return n3;
    }, t4);
  }
  function x2(n3) {
    var u5 = r2.context[n3.__c], i4 = p2(t2++, 9);
    return i4.c = n3, u5 ? (i4.__ == null && (i4.__ = !0, u5.sub(r2)), u5.props.value) : n3.__;
  }
  function g2() {
    var n3 = p2(t2++, 11);
    if (!n3.__) {
      for (var u5 = r2.__v; u5 !== null && !u5.__m && u5.__ !== null; ) u5 = u5.__;
      var i4 = u5.__m || (u5.__m = [0, 0]);
      n3.__ = "P" + i4[0] + "-" + i4[1]++;
    }
    return n3.__;
  }
  function j2() {
    for (var n3; n3 = f2.shift(); ) {
      var t4 = n3.__H;
      if (n3.__P && t4) try {
        t4.__h.some(z2), t4.__h.some(B2), t4.__h = [];
      } catch (r4) {
        t4.__h = [], c2.__e(r4, n3.__v);
      }
    }
  }
  c2.__b = function(n3) {
    r2 = null, e2 && e2(n3);
  }, c2.__ = function(n3, t4) {
    n3 && t4.__k && t4.__k.__m && (n3.__m = t4.__k.__m), s2 && s2(n3, t4);
  }, c2.__r = function(n3) {
    a2 && a2(n3), t2 = 0;
    var i4 = (r2 = n3.__c).__H;
    i4 && (u2 === r2 ? (i4.__h = [], r2.__h = [], i4.__.some(function(n4) {
      n4.__N && (n4.__ = n4.__N), n4.u = n4.__N = void 0;
    })) : (i4.__h.some(z2), i4.__h.some(B2), i4.__h = [], t2 = 0)), u2 = r2;
  }, c2.diffed = function(n3) {
    v2 && v2(n3);
    var t4 = n3.__c;
    t4 && t4.__H && (t4.__H.__h.length && (f2.push(t4) !== 1 && i2 === c2.requestAnimationFrame || ((i2 = c2.requestAnimationFrame) || w2)(j2)), t4.__H.__.some(function(n4) {
      n4.u && (n4.__H = n4.u), n4.u = void 0;
    })), u2 = r2 = null;
  }, c2.__c = function(n3, t4) {
    t4.some(function(n4) {
      try {
        n4.__h.some(z2), n4.__h = n4.__h.filter(function(n5) {
          return !n5.__ || B2(n5);
        });
      } catch (r4) {
        t4.some(function(n5) {
          n5.__h && (n5.__h = []);
        }), t4 = [], c2.__e(r4, n4.__v);
      }
    }), l2 && l2(n3, t4);
  }, c2.unmount = function(n3) {
    m2 && m2(n3);
    var t4, r4 = n3.__c;
    r4 && r4.__H && (r4.__H.__.some(function(n4) {
      try {
        z2(n4);
      } catch (n5) {
        t4 = n5;
      }
    }), r4.__H = void 0, t4 && c2.__e(t4, r4.__v));
  };
  var k2 = typeof requestAnimationFrame == "function";
  function w2(n3) {
    var t4, r4 = function() {
      clearTimeout(u5), k2 && cancelAnimationFrame(t4), setTimeout(n3);
    }, u5 = setTimeout(r4, 35);
    k2 && (t4 = requestAnimationFrame(r4));
  }
  function z2(n3) {
    var t4 = r2, u5 = n3.__c;
    typeof u5 == "function" && (n3.__c = void 0, u5()), r2 = t4;
  }
  function B2(n3) {
    var t4 = r2;
    n3.__c = n3.__(), r2 = t4;
  }
  function C2(n3, t4) {
    return !n3 || n3.length !== t4.length || t4.some(function(t5, r4) {
      return t5 !== n3[r4];
    });
  }
  function D2(n3, t4) {
    return typeof t4 == "function" ? t4(n3) : t4;
  }

  // src/browser/css-validation.ts
  var VALID_PROPERTY = /^-{0,2}[a-zA-Z][a-zA-Z0-9-]*$/, VALID_VALUE = /^[a-zA-Z0-9#()\s,.\-_'"/%+*]+$/, REJECT_URL = /url\s*\(/i, REJECT_COMMENT = /\/\*/;

  // src/browser/override-bus.ts
  var bus = new EventTarget();
  function emitOverrideChange() {
    bus.dispatchEvent(new Event("change"));
  }
  function onOverrideChange(cb) {
    return bus.addEventListener("change", cb), () => bus.removeEventListener("change", cb);
  }
  function emitDivergence(detail) {
    bus.dispatchEvent(new CustomEvent("divergence", { detail }));
  }
  function onDivergence(cb) {
    let handler = (e4) => cb(e4.detail);
    return bus.addEventListener("divergence", handler), () => bus.removeEventListener("divergence", handler);
  }

  // src/shared/preview-source.ts
  var PREVIEW_SOURCE_PREFIX = "cortex-preview:";
  function isPreviewSource(source) {
    return source.startsWith(PREVIEW_SOURCE_PREFIX);
  }

  // src/browser/preview-source.ts
  var PREVIEW_SOURCE_ATTR = "data-cortex-preview-id", previewIdCounter = 0, encoder = new TextEncoder(), decoder = new TextDecoder("utf-8", { fatal: !0 });
  function selectorForEditSource(source) {
    return isPreviewSource(source) ? `[${PREVIEW_SOURCE_ATTR}="${CSS.escape(source.slice(PREVIEW_SOURCE_PREFIX.length))}"]` : `[data-cortex-source="${CSS.escape(source)}"]`;
  }
  function getElementEditTarget(el) {
    let source = el.getAttribute("data-cortex-source");
    if (source) return { source, applyMode: "direct" };
    let previewId = ensurePreviewId(el);
    return {
      source: `${PREVIEW_SOURCE_PREFIX}${previewId}`,
      applyMode: "agent-resolve",
      sourceResolutionHint: buildSourceResolutionHint(el)
    };
  }
  function ensurePreviewId(el) {
    let existing = el.getAttribute(PREVIEW_SOURCE_ATTR);
    if (existing) return existing;
    previewIdCounter += 1;
    let previewId = `p${Date.now().toString(36)}-${previewIdCounter.toString(36)}`;
    return el.setAttribute(PREVIEW_SOURCE_ATTR, previewId), previewId;
  }
  function buildSourceResolutionHint(el) {
    let className = clampUtf8(typeof el.className == "string" ? el.className.trim() : ""), id = clampUtf8(el.id.trim()), textPreview = clampUtf8((el.textContent ?? "").trim());
    return {
      tagName: el.tagName.toLowerCase(),
      ...className ? { className } : {},
      ...id ? { id } : {},
      textPreview,
      domSelector: buildDomSelectorHint(el, className, id)
    };
  }
  function buildDomSelectorHint(el, className, id) {
    let tagName = el.tagName.toLowerCase();
    if (id) return clampUtf8(`${tagName}#${CSS.escape(id)}`);
    let testId = el.getAttribute("data-testid"), trimmedTestId = testId ? clampUtf8(testId.trim()) : "";
    if (trimmedTestId) return clampUtf8(`${tagName}[data-testid=${CSS.escape(trimmedTestId)}]`);
    if (className) {
      let firstClass = className.split(/\s+/)[0];
      if (firstClass) return clampUtf8(`${tagName}.${CSS.escape(firstClass)}`);
    }
    return tagName;
  }
  function clampUtf8(value) {
    let bytes = encoder.encode(value);
    if (bytes.length <= 512) return value;
    let minEnd = Math.max(0, 509);
    for (let end = 512; end >= minEnd; end -= 1)
      try {
        return decoder.decode(bytes.subarray(0, end));
      } catch {
      }
    return "";
  }

  // src/browser/override.ts
  var PENDING_EDIT_TTL_MS = 35e3;
  function defaultReadFromForKind(kind) {
    return kind === "jsx-immediate" ? "inline-style" : "computed-style";
  }
  var isTraceEnabled = () => typeof window < "u" && !!window.__CORTEX_DEBUG_OVERRIDES__, trace = (event, payload) => {
    if (!isTraceEnabled()) return;
    let t4 = performance.now().toFixed(1);
    console.log(`[cortex:trace ${t4}ms] ${event}`, payload ?? "");
  }, _CSSOverrideManager = class _CSSOverrideManager {
    constructor() {
      __publicField(this, "styleEl");
      __publicField(this, "overrides", /* @__PURE__ */ new Map());
      __publicField(this, "stateOverrides", /* @__PURE__ */ new Map());
      __publicField(this, "pendingEdits", /* @__PURE__ */ new Map());
      /** Per-(source, property, pseudo) tuples whose pending edits TTL-expired without
       *  `hmr_verified` arriving. Keyed by `priorValuesKey(source, property, pseudo)` so
       *  that two stale properties on the same source each have their own entry — resolving
       *  one (via hmr_verified or remove()) does NOT clear the other.
       *  Populated in `evictStalePendingEdits`. Entries removed in `remove()`,
       *  `clearAll()`, `dispose()`, and `handleHMRVerified(match=true)`.
       *  Listeners (T2/T4) subscribe via `onStale` to surface StagingDriftBanner UI.
       *  Public boundary remains `Set<string>` (source strings) — use `staleSourcesFromEntries()`. */
      __publicField(this, "staleEntries", /* @__PURE__ */ new Set());
      __publicField(this, "staleListeners", /* @__PURE__ */ new Set());
      /** Dirty flag — true when overrides/stateOverrides have changed since the last
       *  successful rebuild(). Defaults to true so the first rebuild always runs
       *  (cold-start: <style> is empty even if maps are empty). Set false at the end
       *  of rebuild(); set true by every mutator that touches the maps. */
      __publicField(this, "isDirty", !0);
      __publicField(this, "priorValues", /* @__PURE__ */ new Map());
      /** setInterval handle for the background stale-eviction sweep. null when no pending edits exist. */
      __publicField(this, "sweepTimerId", null);
      __publicField(this, "rafId", null);
      /** Active retry handles keyed by source+property so rapid re-edits supersede
       *  in-flight retries. `dispose` tears down the observer + interval + timeout atomically. */
      __publicField(this, "verifyRetryObservers", /* @__PURE__ */ new Map());
      /** Reusable off-screen element for canonicalizing CSS value serialization.
       *  Allocated on first use, retained for the manager's lifetime, released in dispose. */
      __publicField(this, "canaryEl", null);
      __publicField(this, "pendingClearAll", !1);
      /** Recently-verified editIds — short-lived dedup cache for at-least-once delivery
       *  from the server. If the server reconnects and replays `hmr_verified` for an
       *  editId we've already handled, we want a silent no-op rather than an unknown-edit
       *  path that could reach into stale state. TTL matches the verifier's 30s. */
      __publicField(this, "recentlyVerified", /* @__PURE__ */ new Map());
      this.styleEl = document.createElement("style"), this.styleEl.setAttribute("data-cortex-override", ""), document.head.appendChild(this.styleEl);
    }
    scheduleRebuild() {
      this.rafId === null && (this.rafId = requestAnimationFrame(() => {
        this.rafId = null, this.rebuild();
      }));
    }
    cancelPendingRebuild() {
      this.rafId !== null && (cancelAnimationFrame(this.rafId), this.rafId = null);
    }
    /** @internal — test seam for verifying dirty-flag short-circuit. Do NOT use in production. */
    get _isDirtyForTesting() {
      return this.isDirty;
    }
    /** Force any pending RAF rebuild to execute synchronously. */
    flush() {
      this.rafId !== null && (this.cancelPendingRebuild(), this.rebuild());
    }
    /** Apply an override (instant preview). Rejects invalid property names or values.
     *  Pass `pseudo` ('::before' | '::after') to target a pseudo-element. */
    set(source, property, value, pseudo) {
      if (!VALID_PROPERTY.test(property)) {
        console.warn("[cortex] Override rejected: invalid property name:", property);
        return;
      }
      if (!VALID_VALUE.test(value) || REJECT_URL.test(value) || REJECT_COMMENT.test(value)) {
        console.warn("[cortex] Override rejected: invalid value for", property, ":", value);
        return;
      }
      let key = `${source}${pseudo ?? ""}`, props = this.overrides.get(key);
      props || (props = /* @__PURE__ */ new Map(), this.overrides.set(key, props)), props.set(property, value), this.recordPriorValue(source, property, pseudo, value), trace("set", { source, property, value, pseudo }), this.isDirty = !0, this.scheduleRebuild();
    }
    /** Ring-buffer the last N values set for this source+property+pseudo key.
     *  Dropped silently when the cap is reached (oldest first). Read back via
     *  `getPriorValues` for divergence diagnostics. */
    recordPriorValue(source, property, pseudo, value) {
      let key = this.priorValuesKey(source, property, pseudo), buf = this.priorValues.get(key);
      if (!buf) {
        this.priorValues.set(key, [value]);
        return;
      }
      buf.push(value), buf.length > _CSSOverrideManager.PRIOR_VALUES_MAX && buf.shift();
    }
    priorValuesKey(source, property, pseudo) {
      return `${source}\0${property}\0${pseudo ?? ""}`;
    }
    /** Project `staleEntries` (tuple keys) to a `Set<string>` of source strings.
     *  Multiple stale properties on the same source collapse to one source entry —
     *  this matches the public listener contract (`onStale` delivers `Set<string>`).
     *  Used by `emitStale`, `getStaleSources`, and the `onStale` delivery. */
    staleSourcesFromEntries() {
      let result = /* @__PURE__ */ new Set();
      for (let key of this.staleEntries) {
        let sep = key.indexOf("\0");
        sep > 0 ? result.add(key.slice(0, sep)) : result.add(key);
      }
      return result;
    }
    /** Snapshot — returns a COPY of the buffer, not the live reference.
     *  Critical for diagnostic-payload immutability: `recordPriorValue` mutates
     *  the underlying array in place via push/shift, so handing out the live
     *  reference would cause already-emitted divergence payloads (and UI state
     *  derived from them) to change retroactively when later `set()` calls fire
     *  on the same key. The `readonly string[]` return type is TypeScript-only
     *  (doesn't prevent runtime mutation by callers with the original ref). */
    getPriorValues(source, property, pseudo) {
      let buf = this.priorValues.get(this.priorValuesKey(source, property, pseudo));
      return buf ? [...buf] : [];
    }
    /** Assemble the diagnostics payload attached to a divergence emission.
     *  Kept separate from the emit sites so the shape stays consistent across
     *  retry-timeout, retry-error, and server-mismatch paths. */
    buildDiagnostics(source, property, pseudo, kind, readFrom, retryStartedAt, errorMessage) {
      return {
        actualReadFrom: readFrom,
        kindUsed: kind,
        priorValues: this.getPriorValues(source, property, pseudo),
        retryDurationMs: retryStartedAt === null ? void 0 : performance.now() - retryStartedAt,
        errorMessage
      };
    }
    /** Remove an override. If property omitted, removes all overrides for source(+pseudo).
     *  Pass `pseudo` to target a pseudo-element override. */
    remove(source, property, pseudo) {
      let key = `${source}${pseudo ?? ""}`;
      if (isTraceEnabled() && trace("remove", { source, property, pseudo, caller: new Error().stack?.split(`
`)[2]?.trim() }), property)
        this.overrides.get(key)?.delete(property), this.overrides.get(key)?.size === 0 && this.overrides.delete(key), this.priorValues.delete(this.priorValuesKey(source, property, pseudo));
      else {
        this.overrides.delete(key);
        let prefix = `${source}\0`, suffix = `\0${pseudo ?? ""}`, toDelete = [];
        for (let pvKey of this.priorValues.keys())
          pvKey.startsWith(prefix) && pvKey.endsWith(suffix) && toDelete.push(pvKey);
        for (let pvKey of toDelete) this.priorValues.delete(pvKey);
      }
      let anyStaleCleared = !1;
      if (property !== void 0)
        this.staleEntries.delete(this.priorValuesKey(source, property, pseudo)) && (anyStaleCleared = !0);
      else {
        let prefix = `${source}\0`, suffix = `\0${pseudo ?? ""}`, toDelete = [];
        for (let key2 of this.staleEntries)
          key2.startsWith(prefix) && key2.endsWith(suffix) && toDelete.push(key2);
        for (let key2 of toDelete) this.staleEntries.delete(key2);
        toDelete.length > 0 && (anyStaleCleared = !0);
      }
      anyStaleCleared && this.emitStale();
      for (let [editId, entry] of this.pendingEdits) {
        let sourceMatches = entry.sources.includes(source), propertyMatches = property === void 0 || entry.property === property, pseudoMatches = entry.pseudo === pseudo;
        sourceMatches && propertyMatches && pseudoMatches && this.pendingEdits.delete(editId);
      }
      this.isDirty = !0, this.cancelPendingRebuild(), this.rebuild();
    }
    /** Schedule a verified override removal after the framework has committed the HMR
     *  update to DOM. Uses double-rAF — one frame for React's scheduler, one for layout.
     *  This replaces the former `deferRemoval`/`awaitInlineStyleThenRemove` pair, which
     *  relied on a MutationObserver + 1s safety timeout and could revert previews when
     *  the MO didn't fire for a given render. */
    scheduleVerifyAndRemove(source, property, expectedValue, pseudo, kind) {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          this.verifyAndRemove(source, property, expectedValue, pseudo, kind);
        });
      });
    }
    /** After the HMR-triggered render has committed, check that the element's actual
     *  value reflects the committed edit. If it does, remove the override (redundant).
     *  If it doesn't, arm a bounded retry (MutationObserver + poll + timeout) so slow
     *  frameworks (React Fast Refresh, Tailwind JIT) have time to catch up. If the
     *  retry window elapses without a match, emit a divergence event and keep the
     *  override — never silently reverts. */
    verifyAndRemove(source, property, expectedValue, pseudo, kind) {
      let currentOverride = this.get(source, property, pseudo);
      if (currentOverride === void 0) {
        trace("verify:already-removed", { source, property });
        return;
      }
      if (currentOverride !== expectedValue) {
        trace("verify:superseded", { source, property, currentOverride, expectedValue });
        return;
      }
      let el = document.querySelector(selectorForEditSource(source));
      if (!el) {
        trace("verify:no-element", { source, property }), this.remove(source, property, pseudo);
        return;
      }
      let { value: actual } = this.readUnderlyingValue(el, property, pseudo, kind);
      if (this.valuesMatch(actual, expectedValue, property)) {
        trace("verify:match", { source, property, expectedValue }), this.remove(source, property, pseudo);
        return;
      }
      trace("verify:retry-arm", { source, property, expectedValue, actual, kind }), this.armVerifyRetry(el, source, property, expectedValue, pseudo, kind);
    }
    /** Arm a bounded retry for verification. Three triggers converge on a single
     *  verify-or-declare-divergence decision:
     *  - MutationObserver on `style` + `class` attributes — fastest signal when the
     *    framework mutates the element directly (React updating inline style or className).
     *  - Polling interval — catches stylesheet-scoped changes (Tailwind JIT regenerating,
     *    CSS Module hot swap) that don't mutate the element's attributes.
     *  - Final timeout — declares divergence if neither of the above matched in time.
     *  All three funnel through the same `tryVerify` closure, which is exception-safe
     *  (throws are logged and terminate the retry rather than silently looping). */
    armVerifyRetry(el, source, property, expectedValue, pseudo, kind) {
      let key = `${source}:${property}${pseudo ?? ""}`;
      this.verifyRetryObservers.get(key)?.dispose();
      let disposed = !1, observer = null, pollId = null, timeoutId = null, retryStartedAt = performance.now(), dispose = () => {
        disposed || (disposed = !0, observer?.disconnect(), pollId !== null && clearInterval(pollId), timeoutId !== null && clearTimeout(timeoutId), this.verifyRetryObservers.delete(key));
      }, tryVerify = (isFinal) => {
        if (!disposed)
          try {
            let currentOverride = this.get(source, property, pseudo);
            if (currentOverride === void 0) {
              trace("verify:retry-removed", { source, property }), dispose();
              return;
            }
            if (currentOverride !== expectedValue) {
              trace("verify:retry-superseded", { source, property }), dispose();
              return;
            }
            let currentEl = document.querySelector(selectorForEditSource(source));
            if (!currentEl) {
              trace("verify:retry-no-element", { source, property }), dispose(), this.remove(source, property, pseudo);
              return;
            }
            let { value: actual, readFrom } = this.readUnderlyingValue(currentEl, property, pseudo, kind);
            if (this.valuesMatch(actual, expectedValue, property)) {
              trace("verify:match-after-retry", { source, property, expectedValue }), dispose(), this.remove(source, property, pseudo);
              return;
            }
            isFinal && (trace("verify:retry-timeout", { source, property, expectedValue, actual }), dispose(), emitDivergence({
              source,
              property,
              expected: expectedValue,
              actual,
              pseudo,
              diagnostics: this.buildDiagnostics(source, property, pseudo, kind, readFrom, retryStartedAt)
            }));
          } catch (err) {
            console.warn("[cortex] override verify retry error:", err), trace("verify:retry-error", { source, property }), dispose(), emitDivergence({
              source,
              property,
              expected: expectedValue,
              actual: "",
              pseudo,
              // Read path unknown (exception aborted the read) — mark with the
              // kind's default path (same mapping as `readUnderlyingValue`) so
              // downstream consumers still see a coherent signal. The caught
              // error is preserved in `errorMessage` so the Debug disclosure
              // distinguishes this from a "stale inline style" divergence.
              diagnostics: this.buildDiagnostics(
                source,
                property,
                pseudo,
                kind,
                defaultReadFromForKind(kind),
                retryStartedAt,
                String(err)
              )
            });
          }
      }, attributeFilter = kind === "jsx-immediate" ? ["style", "class"] : ["style"];
      observer = new MutationObserver(() => tryVerify(!1)), observer.observe(el, { attributes: !0, attributeFilter }), pollId = window.setInterval(() => tryVerify(!1), _CSSOverrideManager.VERIFY_POLL_INTERVAL_MS), timeoutId = window.setTimeout(() => {
        disposed || requestAnimationFrame(() => tryVerify(!0));
      }, _CSSOverrideManager.VERIFY_RETRY_WINDOW_MS), this.verifyRetryObservers.set(key, { dispose });
    }
    disposeVerifyRetryObservers() {
      for (let { dispose } of this.verifyRetryObservers.values())
        dispose();
      this.verifyRetryObservers.clear();
    }
    /** Read the element's underlying value for the given property, excluding our own
     *  override. For jsx-immediate writes (inline style rewriter) the inline style IS
     *  the underlying value — a cheap direct read. For stylesheet-scoped edits (classOp,
     *  CSS Modules, deferred) we briefly detach the override `<style>` so getComputedStyle
     *  reports the real source value. The detach happens at most once per verified edit,
     *  not on every HMR cycle as the former sweep did. */
    readUnderlyingValue(el, property, pseudo, kind) {
      if (kind === "jsx-immediate")
        return {
          value: el.style.getPropertyValue(property).trim(),
          readFrom: "inline-style"
        };
      let parent = this.styleEl.parentNode, nextSibling = this.styleEl.nextSibling;
      parent && parent.removeChild(this.styleEl);
      try {
        return {
          value: getComputedStyle(el, pseudo || void 0).getPropertyValue(property).trim(),
          readFrom: "computed-style"
        };
      } catch (err) {
        return console.warn("[cortex] readUnderlyingValue failed for", property, err), { value: "", readFrom: "computed-style" };
      } finally {
        if (parent)
          try {
            nextSibling && nextSibling.parentNode === parent ? parent.insertBefore(this.styleEl, nextSibling) : parent.appendChild(this.styleEl);
          } catch (err) {
            console.warn("[cortex] override styleEl reparented to document.head after detach:", err), document.head.appendChild(this.styleEl);
          }
      }
    }
    /** Normalized equality for computed-vs-expected comparison. Handles common CSS
     *  serialization differences: whitespace, rounded pixel values, and canonical
     *  color forms. Deliberately tolerant rather than strict — a verified-and-removed
     *  override that the browser represents slightly differently should not leak as
     *  a divergence. */
    valuesMatch(actual, expected, property) {
      let a4 = actual.trim(), b = expected.trim();
      if (a4 === b) return !0;
      if (!a4 || !b) return !1;
      let aNum = parseFloat(a4), bNum = parseFloat(b);
      if (!isNaN(aNum) && !isNaN(bNum)) {
        let aUnit = a4.replace(/^-?[0-9.]+/, "").trim(), bUnit = b.replace(/^-?[0-9.]+/, "").trim();
        if ((aUnit === bUnit || aUnit === "" && bUnit === "px" || aUnit === "px" && bUnit === "") && Math.abs(aNum - bNum) < 0.1) return !0;
      }
      if (property) {
        let canonA = this.canonicalizeCssValue(a4, property), canonB = this.canonicalizeCssValue(b, property);
        if (canonA && canonA === canonB) return !0;
      }
      return !1;
    }
    canonicalizeCssValue(value, property) {
      this.canaryEl || (this.canaryEl = document.createElement("div"), this.canaryEl.setAttribute("data-cortex-canary", ""), this.canaryEl.style.cssText = "all:initial;position:fixed;top:-9999px;left:-9999px;visibility:hidden", document.body.appendChild(this.canaryEl));
      try {
        return this.canaryEl.style.removeProperty(property), this.canaryEl.style.setProperty(property, value), getComputedStyle(this.canaryEl).getPropertyValue(property).trim();
      } catch {
        return "";
      }
    }
    /**
     * Apply state-forced declarations (e.g. from :hover CSSOM inspection).
     * Validates each entry against VALID_PROPERTY/VALID_VALUE/REJECT_URL/REJECT_COMMENT.
     * State overrides are keyed by raw source (no pseudo suffix) — they only
     * merge with element-level rules, not pseudo-element rules.
     */
    setStateOverrides(source, declarations) {
      let validated = /* @__PURE__ */ new Map();
      for (let [prop, val] of declarations)
        VALID_PROPERTY.test(prop) && (!VALID_VALUE.test(val) || REJECT_URL.test(val) || REJECT_COMMENT.test(val) || validated.set(prop, val));
      validated.size > 0 ? this.stateOverrides.set(source, validated) : (declarations.size > 0 && console.warn(`[cortex] setStateOverrides: all ${declarations.size} declarations rejected for source "${source}"`), this.stateOverrides.delete(source)), this.isDirty = !0, this.cancelPendingRebuild(), this.rebuild();
    }
    /**
     * Clear all state-forced overrides. Rebuilds synchronously (not via RAF)
     * to ensure the <style> tag is updated before the next getComputedStyle read.
     */
    clearStateOverrides() {
      this.stateOverrides.clear(), this.isDirty = !0, this.cancelPendingRebuild(), this.rebuild();
    }
    /** Track a pending edit so handleHMRVerified can clear the right override.
     *  For scope='all' edits, pass all shared element sources so all overrides are cleared. */
    trackPendingEdit(editId, sources, property, value, pseudo) {
      let sourceArray = Array.isArray(sources) ? sources : [sources];
      this.evictStalePendingEdits(), trace("trackPendingEdit", { editId, sources: sourceArray, property, value, pseudo });
      for (let [existingId, entry] of this.pendingEdits)
        entry.property === property && entry.pseudo === pseudo && entry.sources.some((s3) => sourceArray.includes(s3)) && this.pendingEdits.delete(existingId);
      for (let source of sourceArray) {
        let retryKey = `${source}:${property}${pseudo ?? ""}`;
        this.verifyRetryObservers.get(retryKey)?.dispose();
      }
      this.pendingEdits.set(editId, { sources: sourceArray, property, value, pseudo, timestamp: Date.now() }), this.armStaleSweep();
    }
    /** Called when the server confirms an edit landed via HMR. Always schedules
     *  verification via double-rAF — the retry mechanism inside verifyAndRemove
     *  handles the timing race whether the browser's vite:afterUpdate lands before
     *  or after this verified signal. Eliminates the `hmrAppliedInCycle` flag that
     *  misfired across rapid consecutive edits (frontend C3 / distsys C3). */
    handleHMRVerified(editId, match, kind) {
      if (this.evictStalePendingEdits(), this.evictRecentlyVerified(), this.recentlyVerified.has(editId)) {
        trace("handleHMRVerified:duplicate", { editId });
        return;
      }
      let pending = this.pendingEdits.get(editId);
      if (trace("handleHMRVerified", { editId, match, kind, hasPending: !!pending }), !pending) return;
      if (this.pendingEdits.delete(editId), this.recentlyVerified.set(editId, Date.now()), !match) {
        for (let source of pending.sources)
          emitDivergence({
            source,
            property: pending.property,
            expected: pending.value,
            actual: "",
            pseudo: pending.pseudo,
            // No DOM read happened — the signal came from the server. Distinct
            // from the retry-timeout case so the card's Debug disclosure can
            // display "server mismatch" rather than "DOM read mismatch".
            diagnostics: this.buildDiagnostics(source, pending.property, pending.pseudo, kind, "server-mismatch", null)
          });
        return;
      }
      let anyStaleCleared = !1;
      for (let source of pending.sources) {
        let currentValue = this.get(source, pending.property, pending.pseudo);
        if (currentValue !== void 0 && currentValue !== pending.value) {
          trace("handleHMRVerified:skip-stale", { source, property: pending.property, currentValue, expected: pending.value });
          continue;
        }
        this.staleEntries.delete(this.priorValuesKey(source, pending.property, pending.pseudo)) && (anyStaleCleared = !0), this.scheduleVerifyAndRemove(source, pending.property, pending.value, pending.pseudo, kind);
      }
      anyStaleCleared && this.emitStale();
    }
    evictRecentlyVerified() {
      let cutoff = Date.now() - _CSSOverrideManager.RECENTLY_VERIFIED_TTL_MS;
      for (let [id, ts] of this.recentlyVerified)
        ts < cutoff && this.recentlyVerified.delete(id);
    }
    /** Queue a clearAll to run when the next HMR update lands in the browser. */
    queueClearAll() {
      this.pendingClearAll = !0;
    }
    /** Called when the browser confirms HMR stylesheet update has been applied
     *  (vite:afterUpdate). Only responsibility now: drain a queued clearAll.
     *  Verifications are scheduled directly from handleHMRVerified — no queue to
     *  drain here, which eliminates the ordering race where vite:afterUpdate's
     *  double-fire and rapid consecutive edits could flip a shared boolean flag
     *  to the wrong value. The retry mechanism inside armVerifyRetry catches any
     *  framework-commit latency. */
    onHMRApplied() {
      trace("onHMRApplied:enter", {
        pendingClearAll: this.pendingClearAll,
        activeOverrideCount: this.overrides.size
      }), this.pendingClearAll && (this.pendingClearAll = !1, this.clearAll());
    }
    /** Start the background sweep interval if there are pending edits and it isn't running.
     *  Idempotent: safe to call after every `trackPendingEdit`. Uses `window.setInterval`
     *  so the return type narrows to `number` in browser context (matches `armVerifyRetry`). */
    armStaleSweep() {
      this.pendingEdits.size > 0 && this.sweepTimerId === null && (this.sweepTimerId = window.setInterval(
        () => this.evictStalePendingEdits(),
        _CSSOverrideManager.STALE_SWEEP_PERIOD_MS
      ));
    }
    /** Stop the background sweep interval and reset the handle to null. */
    disarmStaleSweep() {
      this.sweepTimerId !== null && (clearInterval(this.sweepTimerId), this.sweepTimerId = null);
    }
    /** Drops pending edits whose timestamp is older than `PENDING_EDIT_TTL_MS`.
     *  Evicted sources are recorded in `staleEntries` and emitted via `emitStale`.
     *  Called incidentally from `trackPendingEdit` / `handleHMRVerified`, and
     *  autonomously on the `STALE_SWEEP_PERIOD_MS` timer armed by `armStaleSweep`. */
    evictStalePendingEdits() {
      let now = Date.now(), anyEvicted = !1;
      for (let [id, entry] of this.pendingEdits)
        if (now - entry.timestamp > PENDING_EDIT_TTL_MS) {
          for (let source of entry.sources)
            this.staleEntries.add(this.priorValuesKey(source, entry.property, entry.pseudo));
          this.pendingEdits.delete(id), anyEvicted = !0;
        }
      anyEvicted && (trace("evictStalePendingEdits:stale", { staleEntries: [...this.staleEntries] }), this.emitStale()), this.pendingEdits.size === 0 && this.disarmStaleSweep();
    }
    /** Read the current override value for a source+property. Returns undefined if no override exists.
     *  Used by command creation to capture previousValue before applying a new edit. */
    get(source, property, pseudo) {
      let key = `${source}${pseudo ?? ""}`;
      return this.overrides.get(key)?.get(property);
    }
    /** Return a defensive-copy Map of user overrides for this source.
     *  State overrides are intentionally excluded; they represent forced state
     *  declarations, not user edits. */
    getOverrides(source, pseudo) {
      let key = `${source}${pseudo ?? ""}`, props = this.overrides.get(key);
      return props ? new Map(props) : /* @__PURE__ */ new Map();
    }
    /** Clear all overrides (e.g. on SPA navigation) */
    clearAll() {
      this.disposeVerifyRetryObservers(), this.disarmStaleSweep(), this.recentlyVerified.clear(), this.overrides.clear(), this.stateOverrides.clear(), this.pendingEdits.clear(), this.priorValues.clear(), this.staleEntries.size > 0 && (this.staleEntries.clear(), this.emitStale()), this.isDirty = !0, this.cancelPendingRebuild(), this.rebuild();
    }
    /** Register a listener fired when the stale-source set changes (eviction or clear).
     *  Listener receives a defensive-copy Set of source strings currently considered
     *  stale (override applied, no hmr_verified, TTL elapsed). Returns a dispose fn.
     *  Multiple listeners ALL fire on every change.  */
    onStale(callback) {
      return this.staleListeners.add(callback), () => {
        this.staleListeners.delete(callback);
      };
    }
    /** Return a defensive-copy Set of currently-stale sources. Empty when no stale state.
     *  Caller mutation does NOT affect internal state. */
    getStaleSources() {
      return this.staleSourcesFromEntries();
    }
    /**
     * Public ReadSourceValue-compatible reader that bypasses the cortex override
     * stylesheet. Used by Panel's buffer.reconcile() call (ZF0-1470 T4) so that
     * getComputedStyle returns the SOURCE value rather than cortex's !important
     * override, preventing 100% false-positive divergence during active edits.
     *
     * Delegates to the private `readUnderlyingValue` with `kind=undefined`
     * (computed-style path — correct for HMR reconcile which compares CSS
     * property values regardless of how they were originally set).
     */
    readSourceValue(el, property, pseudo) {
      return this.readUnderlyingValue(el, property, pseudo ?? void 0, void 0).value;
    }
    /** Emit the current stale-source set to all registered listeners.
     *  Iterates a snapshot so a listener that calls dispose() mid-emission
     *  does not cause ConcurrentModification-style bugs. Each listener
     *  receives its own defensive copy so mutations by one listener are
     *  invisible to subsequent listeners. Errors from individual listeners
     *  are isolated — remaining listeners still fire. */
    emitStale() {
      let staleSources = this.staleSourcesFromEntries();
      for (let cb of [...this.staleListeners])
        try {
          cb(new Set(staleSources));
        } catch (err) {
          console.warn("[cortex] Stale listener error:", err instanceof Error ? err.message : err);
        }
      trace("emitStale:fired", { count: this.staleEntries.size });
    }
    /** Remove the <style> element from the DOM */
    dispose() {
      this.disposeVerifyRetryObservers(), this.disarmStaleSweep(), this.recentlyVerified.clear(), this.cancelPendingRebuild(), this.overrides.clear(), this.stateOverrides.clear(), this.pendingEdits.clear(), this.priorValues.clear(), this.staleEntries.size > 0 && (this.staleEntries.clear(), this.emitStale()), this.staleListeners.clear(), this.styleEl.remove(), this.canaryEl && (this.canaryEl.remove(), this.canaryEl = null);
    }
    rebuild() {
      if (!this.isDirty) return;
      let allKeys = /* @__PURE__ */ new Set([...this.overrides.keys(), ...this.stateOverrides.keys()]), rules = [];
      for (let compositeKey2 of allKeys) {
        let pseudoSuffix = compositeKey2.endsWith("::before") ? "::before" : compositeKey2.endsWith("::after") ? "::after" : "", rawSource = pseudoSuffix ? compositeKey2.slice(0, -pseudoSuffix.length) : compositeKey2, userProps = this.overrides.get(compositeKey2), stateProps = pseudoSuffix ? void 0 : this.stateOverrides.get(rawSource), merged = /* @__PURE__ */ new Map();
        if (stateProps) for (let [p3, v3] of stateProps) merged.set(p3, v3);
        if (userProps) for (let [p3, v3] of userProps) merged.set(p3, v3);
        if (merged.size === 0) continue;
        let declarations = Array.from(merged.entries()).map(([prop, val]) => `${prop}: ${val} !important`).join("; "), selector = `${selectorForEditSource(rawSource)}${pseudoSuffix}`;
        rules.push(`${selector} { ${declarations}; }`);
      }
      let newContent = rules.join(`
`);
      this.styleEl.textContent !== newContent && (this.styleEl.textContent = newContent, emitOverrideChange()), this.isDirty = !1;
    }
  };
  /** ZF0-1293: per-key ring buffer of recent `set()` values. When a divergence
   *  fires with an unexplained `actual`, this buffer tells us whether the
   *  user previously set that property to that exact value — the typical
   *  signature of a stale-inline-style / Fast-Refresh-stall scenario.
   *  Bounded at 5 most-recent per key; no growth risk (key-level cap, not global). */
  __publicField(_CSSOverrideManager, "PRIOR_VALUES_MAX", 5), /** How often the background sweep calls `evictStalePendingEdits` — 1/7 of `PENDING_EDIT_TTL_MS`. */
  __publicField(_CSSOverrideManager, "STALE_SWEEP_PERIOD_MS", 5e3), /** Bounded window for re-verification when the double-rAF tick is too early for
   *  the framework to have committed the new value. Covers React Fast Refresh
   *  (20-600ms inline-style commits) and Tailwind JIT regeneration
   *  (50-500ms stylesheet-rule generation on cold starts).
   *  `static` so tests can shrink it without mocking setTimeout. */
  __publicField(_CSSOverrideManager, "VERIFY_RETRY_WINDOW_MS", 750), /** Poll cadence inside the retry window. MutationObserver covers element-attribute
   *  changes (style/class); this poll catches stylesheet-scoped changes (Tailwind JIT,
   *  CSS Module rewrite) that aren't mutations of the selected element itself. */
  __publicField(_CSSOverrideManager, "VERIFY_POLL_INTERVAL_MS", 100), __publicField(_CSSOverrideManager, "RECENTLY_VERIFIED_TTL_MS", 3e4);
  var CSSOverrideManager = _CSSOverrideManager;

  // src/browser/command-stack.ts
  var CommandStack = class {
    constructor(maxDepth = 50) {
      __publicField(this, "undoStack", []);
      __publicField(this, "redoStack", []);
      __publicField(this, "maxDepth");
      this.maxDepth = maxDepth;
    }
    /** Push and execute a command. Clears redo stack. */
    push(command) {
      command.execute(), this.record(command);
    }
    /** Record a command without executing it. Use when the caller already applied
     *  the side-effects (e.g., overrides set during scrub phase). Clears redo stack. */
    record(command) {
      for (this.undoStack.push(command), this.redoStack.length = 0; this.undoStack.length > this.maxDepth; )
        this.undoStack.shift();
    }
    /** Undo the most recent command. Returns the command (for server sync) or null. */
    undo() {
      let cmd = this.undoStack.pop();
      if (!cmd) return null;
      try {
        cmd.undo();
      } catch (err) {
        throw this.undoStack.push(cmd), err;
      }
      return this.redoStack.push(cmd), cmd;
    }
    /** Redo the most recently undone command. Returns the command or null. */
    redo() {
      let cmd = this.redoStack.pop();
      if (!cmd) return null;
      try {
        cmd.execute();
      } catch (err) {
        throw this.redoStack.push(cmd), err;
      }
      return this.undoStack.push(cmd), cmd;
    }
    peekUndo() {
      return this.undoStack[this.undoStack.length - 1] ?? null;
    }
    peekRedo() {
      return this.redoStack[this.redoStack.length - 1] ?? null;
    }
    get canUndo() {
      return this.undoStack.length > 0;
    }
    get canRedo() {
      return this.redoStack.length > 0;
    }
    get undoCount() {
      return this.undoStack.length;
    }
    get redoCount() {
      return this.redoStack.length;
    }
    clear() {
      this.undoStack.length = 0, this.redoStack.length = 0;
    }
  };

  // src/browser/classify-non-editable.ts
  var NON_VISUAL_TAGS = /* @__PURE__ */ new Set(["script", "style", "meta", "head", "title", "link", "noscript", "template"]), DOCUMENT_ROOT_TAGS = /* @__PURE__ */ new Set(["html", "body"]);
  function isNonEditable(el) {
    let tagName = el.tagName.toLowerCase();
    return NON_VISUAL_TAGS.has(tagName) || DOCUMENT_ROOT_TAGS.has(tagName);
  }

  // src/browser/selection.ts
  function isOwnUI(event) {
    return event.composedPath().some(
      (el) => el instanceof HTMLElement && el.hasAttribute("data-cortex-host")
    );
  }
  function initSelection(_shadowRoot, onHover, onSelect) {
    let designMode = !0, interceptClicks = !0;
    function getTargetElement(event) {
      let el = document.elementFromPoint(event.clientX, event.clientY);
      return !el || !(el instanceof HTMLElement) || el.hasAttribute("data-cortex-host") || el.hasAttribute("data-cortex-root") || el === document.documentElement || el === document.body || isNonEditable(el) ? null : el;
    }
    let lastHovered;
    function updateHover(el) {
      el !== lastHovered && (lastHovered = el, onHover(el));
    }
    function handleMouseMove(event) {
      if (designMode) {
        if (isOwnUI(event)) {
          lastHovered !== null && (lastHovered = null, onHover(null));
          return;
        }
        updateHover(getTargetElement(event));
      }
    }
    function handleScroll() {
      designMode && lastHovered != null && (lastHovered = null, onHover(null));
    }
    function handleClick(event) {
      if (!designMode || isOwnUI(event) || !interceptClicks) return;
      event.preventDefault(), event.stopPropagation();
      let el = getTargetElement(event);
      if (!el) {
        onSelect([], "replace");
        return;
      }
      let action;
      event.shiftKey ? action = "add" : event.metaKey || event.ctrlKey ? action = "toggle" : action = "replace", onSelect([el], action);
    }
    return window.addEventListener("mousemove", handleMouseMove, { capture: !0 }), window.addEventListener("click", handleClick, { capture: !0 }), window.addEventListener("scroll", handleScroll, { capture: !0, passive: !0 }), {
      cleanup() {
        window.removeEventListener("mousemove", handleMouseMove, { capture: !0 }), window.removeEventListener("click", handleClick, { capture: !0 }), window.removeEventListener("scroll", handleScroll, { capture: !0 });
      },
      setDesignMode(enabled) {
        designMode = enabled;
      },
      setInterceptClicks(enabled) {
        interceptClicks = enabled;
      }
    };
  }

  // src/browser/cortex-app-reducer.ts
  var initialCortexAppReducerState = {
    active: !1,
    swatches: void 0,
    textComponents: void 0,
    colorChips: void 0,
    spacingTokens: void 0,
    capabilitySystems: [],
    activityCount: 0,
    editErrors: /* @__PURE__ */ new Map(),
    annotations: /* @__PURE__ */ new Map(),
    agentConnected: !1,
    activityEntries: []
  };
  function applySelectionUpdate(prev, elements, action) {
    if (action === "replace")
      return elements.length === prev.length && elements.every((el, i4) => el === prev[i4]) ? prev : elements;
    if (action === "add") {
      let next2 = [...prev], changed = !1;
      for (let el of elements)
        next2.includes(el) || (next2.push(el), changed = !0);
      return changed ? next2 : prev;
    }
    let next = [...prev];
    for (let el of elements) {
      let idx = next.indexOf(el);
      idx >= 0 ? next.splice(idx, 1) : next.push(el);
    }
    return next;
  }
  function cortexAppReducer(state, action) {
    switch (action.type) {
      // -----------------------------------------------------------------------
      case "cortex":
        return state.active ? { state, effects: [] } : { state: { ...state, active: !0 }, effects: [] };
      // -----------------------------------------------------------------------
      case "cortex-close":
        return state.active ? { state: { ...state, active: !1 }, effects: [{ type: "invoke_exit" }] } : { state, effects: [{ type: "invoke_exit" }] };
      // -----------------------------------------------------------------------
      case "cortex-toggle":
        return cortexAppReducer(state, action.active ? { type: "cortex" } : { type: "cortex-close" });
      // -----------------------------------------------------------------------
      case "capabilities": {
        let filtered = action.systems.filter((s3) => s3.status !== "supported");
        return { state: { ...state, capabilitySystems: filtered }, effects: [] };
      }
      // -----------------------------------------------------------------------
      case "hello":
        return {
          state: {
            ...state,
            swatches: action.swatches ?? [],
            textComponents: action.textComponents ?? [],
            colorChips: action.colorChips ?? [],
            spacingTokens: action.spacingTokens ?? []
          },
          effects: []
        };
      // -----------------------------------------------------------------------
      case "edit_status": {
        if (action.status === "done") {
          if (action.dispatch) {
            let { source, property } = action.dispatch, key = `${source}\0${property}`, nextErrors = state.editErrors;
            return nextErrors.has(key) && (nextErrors = new Map(nextErrors), nextErrors.delete(key)), {
              state: {
                ...state,
                activityCount: state.activityCount + 1,
                editErrors: nextErrors
              },
              effects: []
            };
          }
          return {
            state: { ...state, activityCount: state.activityCount + 1 },
            effects: []
          };
        }
        if (action.dispatch) {
          let { source, property, value } = action.dispatch, key = `${source}\0${property}`, nextErrors = new Map(state.editErrors);
          return nextErrors.set(key, {
            source,
            property,
            value,
            reason: action.reason ?? "Unknown error"
          }), { state: { ...state, editErrors: nextErrors }, effects: [] };
        }
        return {
          state,
          effects: [
            {
              type: "log_warning",
              message: `[cortex] edit_status:failed for untracked editId ${action.editId}: ${action.reason ?? "Unknown"}`
            }
          ]
        };
      }
      // -----------------------------------------------------------------------
      case "hmr_verified":
        return {
          state,
          effects: [
            {
              type: "apply_hmr_verified",
              editId: action.editId,
              match: action.match,
              kind: action.kind
            }
          ]
        };
      // -----------------------------------------------------------------------
      case "undo_sync_status":
      case "redo_sync_status": {
        if (action.status === "done")
          return { state, effects: [] };
        let effects = [
          {
            type: "log_warning",
            message: `[cortex] Server ${action.type === "undo_sync_status" ? "undo" : "redo"} sync failed: ${action.reason}`
          }
        ];
        return (action.reason_code === "stale" || action.reason_code === "write_failed") && effects.push({ type: "send", message: { type: "clear_server_undo" } }), { state, effects };
      }
      // -----------------------------------------------------------------------
      case "annotation-created": {
        let nextAnnotations = new Map(state.annotations);
        return nextAnnotations.set(action.annotation.id, action.annotation), { state: { ...state, annotations: nextAnnotations }, effects: [] };
      }
      // -----------------------------------------------------------------------
      case "annotation-updated": {
        let nextAnnotations = new Map(state.annotations);
        nextAnnotations.set(action.annotation.id, action.annotation);
        let nextErrors = state.editErrors, ann = action.annotation;
        if (ann.kind === "fix-request" && (ann.status === "resolved" || ann.status === "dismissed") && ann.fixMeta) {
          let key = `${ann.elementSource}\0${ann.fixMeta.property}`;
          nextErrors.has(key) && (nextErrors = new Map(nextErrors), nextErrors.delete(key));
        }
        return {
          state: { ...state, annotations: nextAnnotations, editErrors: nextErrors },
          effects: []
        };
      }
      // -----------------------------------------------------------------------
      case "agent-status":
        return state.agentConnected === action.connected ? { state, effects: [] } : { state: { ...state, agentConnected: action.connected }, effects: [] };
      // -----------------------------------------------------------------------
      case "activity-entry": {
        let prev = state.activityEntries, nextEntries = prev.length >= 200 ? [...prev.slice(-199), action.entry] : [...prev, action.entry];
        return {
          state: {
            ...state,
            activityEntries: nextEntries,
            activityCount: state.activityCount + 1
          },
          effects: []
        };
      }
      // -----------------------------------------------------------------------
      case "divergence": {
        let d3 = action.diagnostic, key = `${d3.source}\0${d3.property}\0${d3.pseudo ?? ""}`, nextErrors = new Map(state.editErrors);
        return nextErrors.set(key, {
          source: d3.source,
          property: d3.property,
          value: d3.expected,
          reason: `Preview shows "${d3.expected}" but the saved file renders "${d3.actual || "(empty)"}". The edit may not have propagated.`,
          diagnostics: d3.diagnostics
        }), { state: { ...state, editErrors: nextErrors }, effects: [] };
      }
      // -----------------------------------------------------------------------
      default: {
        let _exhaustive = action;
        throw new Error(`Unhandled cortex-app-reducer action: ${JSON.stringify(_exhaustive)}`);
      }
    }
  }

  // src/browser/selection-source-expand.ts
  function expandSharedSource(elements) {
    if (elements.length === 0) return elements;
    let result = [], seen = /* @__PURE__ */ new Set(), seenSources = /* @__PURE__ */ new Set();
    for (let el of elements) {
      if (seen.has(el)) continue;
      let source = el.getAttribute("data-cortex-source");
      if (!source) {
        seen.add(el), result.push(el);
        continue;
      }
      if (seenSources.has(source)) continue;
      seenSources.add(source), seen.add(el), result.push(el);
      let escaped;
      try {
        escaped = typeof CSS < "u" && CSS.escape ? CSS.escape(source) : source.replace(/(["\\])/g, "\\$1");
      } catch {
        escaped = source.replace(/(["\\])/g, "\\$1");
      }
      let matches;
      try {
        matches = document.querySelectorAll(`[data-cortex-source="${escaped}"]`);
      } catch {
        continue;
      }
      for (let m3 of matches)
        seen.has(m3) || (seen.add(m3), result.push(m3));
    }
    return result;
  }

  // node_modules/tinykeys/dist/tinykeys.module.js
  var t3 = ["Shift", "Meta", "Alt", "Control"], e3 = typeof navigator == "object" ? navigator.platform : "", n2 = /Mac|iPod|iPhone|iPad/.test(e3), o3 = n2 ? "Meta" : "Control", r3 = e3 === "Win32" ? ["Control", "Alt"] : n2 ? ["Alt"] : [];
  function i3(t4, e4) {
    return typeof t4.getModifierState == "function" && (t4.getModifierState(e4) || r3.includes(e4) && t4.getModifierState("AltGraph"));
  }
  function a3(t4) {
    return t4.trim().split(" ").map(function(t5) {
      var e4 = t5.split(/\b\+/), n3 = e4.pop(), r4 = n3.match(/^\((.+)\)$/);
      return r4 && (n3 = new RegExp("^" + r4[1] + "$")), [e4 = e4.map(function(t6) {
        return t6 === "$mod" ? o3 : t6;
      }), n3];
    });
  }
  function u3(e4, n3) {
    var o4 = n3[0], r4 = n3[1];
    return !((r4 instanceof RegExp ? !r4.test(e4.key) && !r4.test(e4.code) : r4.toUpperCase() !== e4.key.toUpperCase() && r4 !== e4.code) || o4.find(function(t4) {
      return !i3(e4, t4);
    }) || t3.find(function(t4) {
      return !o4.includes(t4) && r4 !== t4 && i3(e4, t4);
    }));
  }
  function c3(t4, e4) {
    var n3;
    e4 === void 0 && (e4 = {});
    var o4 = (n3 = e4.timeout) != null ? n3 : 1e3, r4 = Object.keys(t4).map(function(e5) {
      return [a3(e5), t4[e5]];
    }), c4 = /* @__PURE__ */ new Map(), f5 = null;
    return function(t5) {
      t5 instanceof KeyboardEvent && (r4.forEach(function(e5) {
        var n4 = e5[0], o5 = e5[1], r5 = c4.get(n4) || n4;
        u3(t5, r5[0]) ? r5.length > 1 ? c4.set(n4, r5.slice(1)) : (c4.delete(n4), o5(t5)) : i3(t5, t5.key) || c4.delete(n4);
      }), f5 && clearTimeout(f5), f5 = setTimeout(c4.clear.bind(c4), o4));
    };
  }
  function f3(t4, e4, n3) {
    var o4 = n3 === void 0 ? {} : n3, r4 = o4.event, i4 = r4 === void 0 ? "keydown" : r4, a4 = o4.capture, u5 = c3(e4, { timeout: o4.timeout });
    return t4.addEventListener(i4, u5, a4), function() {
      t4.removeEventListener(i4, u5, a4);
    };
  }

  // src/browser/focus-utils.ts
  var cortexHost = null, cortexShadowRoot = null;
  function _setCortexHost(host, shadow) {
    cortexHost = host, cortexShadowRoot = shadow;
  }
  function getDeepActiveElement() {
    let el = document.activeElement;
    for (el === cortexHost && cortexShadowRoot?.activeElement && (el = cortexShadowRoot.activeElement); el?.shadowRoot?.activeElement; )
      el = el.shadowRoot.activeElement;
    return el;
  }
  function isInputFocused() {
    let el = getDeepActiveElement();
    if (!(el instanceof HTMLElement)) return !1;
    let tag = el.tagName.toLowerCase();
    if (tag === "textarea" || tag === "select" || tag === "input" || el.isContentEditable) return !0;
    let role = el.getAttribute("role");
    return role === "textbox" || role === "searchbox";
  }
  function isCortexUIFocused() {
    if (!cortexHost) return !1;
    let el = document.activeElement;
    if (!el) return !1;
    if (el === cortexHost) return !0;
    let root = el.getRootNode();
    for (; root instanceof ShadowRoot; ) {
      if (root.host === cortexHost) return !0;
      root = root.host.getRootNode();
    }
    return !1;
  }
  function isRealEvent(e4) {
    return e4.isTrusted === !0;
  }

  // src/browser/state-detector.ts
  var STATE_PSEUDOS = ["hover", "focus", "active"], STATE_REGEX = {
    hover: /:hover(?![\w-])/g,
    focus: /:focus(?![\w-])/g,
    active: /:active(?![\w-])/g
  }, STATE_INCLUDES = {
    hover: /:hover(?![\w-])/,
    focus: /:focus(?![\w-])/,
    active: /:active(?![\w-])/
  };
  function detectStates(element) {
    let result = {
      hover: /* @__PURE__ */ new Map(),
      focus: /* @__PURE__ */ new Map(),
      active: /* @__PURE__ */ new Map()
    };
    for (let sheet of document.styleSheets) {
      let rules;
      try {
        rules = sheet.cssRules;
      } catch {
        continue;
      }
      collectFromRules(rules, element, result);
    }
    return result;
  }
  function collectFromRules(rules, element, result) {
    for (let rule of rules)
      rule instanceof CSSStyleRule ? (processStyleRule(rule, element, result), rule.cssRules && rule.cssRules.length > 0 && collectFromRules(rule.cssRules, element, result)) : (rule instanceof CSSMediaRule || rule instanceof CSSSupportsRule || typeof CSSLayerBlockRule < "u" && rule instanceof CSSLayerBlockRule || // Fallback: recurse into any grouping rule with a cssRules property
      // (covers CSSLayerBlockRule in environments where the global isn't defined)
      !(rule instanceof CSSStyleRule) && "cssRules" in rule && rule.cssRules instanceof CSSRuleList) && collectFromRules(rule.cssRules, element, result);
  }
  function resolveNestingSelector(rule) {
    let parts = [], current = rule.parentRule;
    for (; current instanceof CSSStyleRule; )
      parts.unshift(current.selectorText), current = current.parentRule;
    if (parts.length === 0) return null;
    let resolved = parts[0];
    for (let i4 = 1; i4 < parts.length; i4++)
      resolved = parts[i4].replaceAll("&", resolved);
    return resolved;
  }
  function processStyleRule(rule, element, result) {
    let selectors = rule.selectorText.split(",").map((s3) => s3.trim());
    for (let selector of selectors)
      if (!(selector.includes("::before") || selector.includes("::after")))
        for (let state of STATE_PSEUDOS) {
          if (!STATE_INCLUDES[state].test(selector)) continue;
          let baseSelector = selector.replace(STATE_REGEX[state], "").trim();
          if (!baseSelector) continue;
          if (baseSelector.includes("&")) {
            let parentSelector = resolveNestingSelector(rule);
            if (!parentSelector) continue;
            let resolved = baseSelector.replaceAll("&", parentSelector);
            try {
              if (!element.matches(resolved)) continue;
            } catch {
              continue;
            }
          } else
            try {
              if (!element.matches(baseSelector)) continue;
            } catch {
              continue;
            }
          let style = rule.style;
          for (let i4 = 0; i4 < style.length; i4++) {
            let prop = style[i4], val = style.getPropertyValue(prop).trim();
            !prop || !val || val !== "initial" && VALID_PROPERTY.test(prop) && (!VALID_VALUE.test(val) || REJECT_URL.test(val) || REJECT_COMMENT.test(val) || result[state].set(prop, val));
          }
        }
  }

  // src/browser/label.ts
  function parseCortexSource(el) {
    let source = el.getAttribute("data-cortex-source");
    if (!source) return null;
    let lastColon = source.lastIndexOf(":"), secondLastColon = source.lastIndexOf(":", lastColon - 1), filePath, line;
    if (secondLastColon > 0) {
      let candidateLine = source.slice(secondLastColon + 1, lastColon), candidateCol = source.slice(lastColon + 1);
      /^\d+$/.test(candidateLine) && /^\d+$/.test(candidateCol) ? (filePath = source.slice(0, secondLastColon), line = candidateLine) : lastColon > 0 && /^\d+$/.test(source.slice(lastColon + 1)) ? (filePath = source.slice(0, lastColon), line = source.slice(lastColon + 1)) : (filePath = source, line = "");
    } else lastColon > 0 && /^\d+$/.test(source.slice(lastColon + 1)) ? (filePath = source.slice(0, lastColon), line = source.slice(lastColon + 1)) : (filePath = source, line = "");
    let fileName = filePath.split(/[/\\]/).pop() ?? filePath, baseName = fileName.replace(/\.\w+$/, "");
    return { componentName: /^[A-Z]/.test(baseName) ? baseName : null, fileName, line, filePath };
  }
  function encodeFilePath(filePath) {
    return filePath.split(/([/\\])/).map(
      (seg, i4) => seg === "/" || seg === "\\" || i4 === 0 && /^[A-Za-z]:$/.test(seg) ? seg : encodeURIComponent(seg)
    ).join("");
  }
  function isNodeModulesPath(filePath) {
    return filePath.includes("/node_modules/") || filePath.startsWith("node_modules/");
  }
  function isLibraryComponent(el) {
    let info = parseCortexSource(el);
    return info ? isNodeModulesPath(info.filePath) : !1;
  }
  function findUserAncestor(el) {
    let current = el.parentElement;
    for (; current; ) {
      let source = parseCortexSource(current);
      if (source && !isNodeModulesPath(source.filePath))
        return { source, element: current };
      current = current.parentElement;
    }
    return null;
  }
  function getTreeLabel(el) {
    let tag = el.tagName.toLowerCase(), cls = typeof el.className == "string" ? el.className : el.getAttribute("class") ?? "";
    return cls.trim() ? `${tag}.${cls.trim().split(/\s+/)[0]}` : tag;
  }
  function getLabel(el) {
    let info = parseCortexSource(el);
    if (info?.componentName) return info.componentName;
    let tag = el.tagName.toLowerCase(), cls = el.className;
    return typeof cls == "string" && cls.trim() ? `${tag}.${cls.trim().split(/\s+/)[0]}` : tag;
  }
  function getSelectionLabel(el) {
    let info = parseCortexSource(el);
    if (!info) {
      let tag = el.tagName.toLowerCase(), cls = el.className;
      return typeof cls == "string" && cls.trim() ? `${tag}.${cls.trim().split(/\s+/)[0]}` : tag;
    }
    let { componentName, fileName, line } = info;
    return componentName && line ? `${componentName} \u2014 ${fileName}:${line}` : componentName ? `${componentName} \u2014 ${fileName}` : line ? `${fileName}:${line}` : fileName;
  }

  // src/browser/transform-bus.ts
  var bus2 = new EventTarget();
  function emitTransformUpdate() {
    bus2.dispatchEvent(new Event("update"));
  }
  function onTransformUpdate(cb) {
    return bus2.addEventListener("update", cb), () => bus2.removeEventListener("update", cb);
  }

  // node_modules/preact/jsx-runtime/dist/jsxRuntime.module.js
  var f4 = 0;
  function u4(e4, t4, n3, o4, i4, u5) {
    t4 || (t4 = {});
    var a4, c4, p3 = t4;
    if ("ref" in p3) for (c4 in p3 = {}, t4) c4 == "ref" ? a4 = t4[c4] : p3[c4] = t4[c4];
    var l3 = { type: e4, props: p3, key: n3, ref: a4, __k: null, __: null, __b: 0, __e: null, __c: null, constructor: void 0, __v: --f4, __i: -1, __u: 0, __source: i4, __self: u5 };
    if (typeof e4 == "function" && (a4 = e4.defaultProps)) for (c4 in a4) p3[c4] === void 0 && (p3[c4] = a4[c4]);
    return l.vnode && l.vnode(l3), l3;
  }

  // src/browser/components/HoverOverlay.tsx
  function HoverOverlay({ element }) {
    let cachedElementRef = A2(null), cachedBorderRadiusRef = A2("0px"), [, forceRender] = d2(0);
    if (y2(() => {
      if (element)
        return onTransformUpdate(() => forceRender((c4) => c4 + 1));
    }, [element]), !element) return null;
    let r4 = element.getBoundingClientRect();
    element !== cachedElementRef.current && (cachedElementRef.current = element, cachedBorderRadiusRef.current = getComputedStyle(element).borderRadius || "0px");
    let label = getLabel(element), labelAbove = r4.top > 30;
    return /* @__PURE__ */ u4(
      "div",
      {
        class: "cortex-hover-overlay",
        style: {
          transform: `translate(${r4.left}px, ${r4.top}px)`,
          width: `${r4.width}px`,
          height: `${r4.height}px`,
          borderRadius: cachedBorderRadiusRef.current
        },
        children: /* @__PURE__ */ u4("span", { class: `cortex-label ${labelAbove ? "cortex-label--above" : "cortex-label--below"}`, children: label })
      }
    );
  }

  // src/browser/components/SelectionOverlay.tsx
  function SelectionOverlay({ element, availableStates, activeState, onStateChange, overlaysVisible = !0, hmrAppliedVersion = 0 }) {
    let overlayRef = A2(null), lensRef = A2(null), labelRef = A2(null), cachedLensWRef = A2(120), cachedLensHRef = A2(24), lensNeedsMeasureRef = A2(!0);
    if (y2(() => {
      lensNeedsMeasureRef.current = !0;
    }, [availableStates]), y2(() => {
      if (!element || !overlayRef.current) return;
      let rafId = 0, idleFrames = 0, prevTransform = "", prevWidth = "", prevHeight = "", prevBorderRadius = "", stableDoc = null, prevDoc = null, lastChangeTime = 0, scrollCooldownUntil = 0, STABLE_THRESHOLD_MS = 400, SHIFT_THRESHOLD_PX = 50, SCROLL_COOLDOWN_MS = 1e3;
      function update() {
        if (!element || !overlayRef.current || !element.isConnected) return;
        let r4 = element.getBoundingClientRect(), transform = `translate(${r4.left}px, ${r4.top}px)`, width = `${r4.width}px`, height = `${r4.height}px`, el = overlayRef.current, changed = transform !== prevTransform || width !== prevWidth || height !== prevHeight, sizeChanged = width !== prevWidth || height !== prevHeight;
        if (transform !== prevTransform && (el.style.transform = transform, prevTransform = transform), width !== prevWidth && (el.style.width = width, prevWidth = width), height !== prevHeight && (el.style.height = height, prevHeight = height), changed ? idleFrames = 0 : idleFrames++, sizeChanged || prevBorderRadius === "") {
          let br = getComputedStyle(element).borderRadius || "0px";
          br !== prevBorderRadius && (el.style.borderRadius = br, prevBorderRadius = br);
        }
        let labelH = 20, gap = 8, isLabelBelow = window.innerHeight - r4.bottom > labelH + gap;
        if (labelRef.current) {
          let cls = isLabelBelow ? "cortex-label cortex-label--below" : "cortex-label cortex-label--above";
          labelRef.current.className !== cls && (labelRef.current.className = cls);
        }
        if (lensRef.current) {
          if (lensNeedsMeasureRef.current) {
            let measuredW = lensRef.current.offsetWidth, measuredH = lensRef.current.offsetHeight;
            measuredW > 0 && (cachedLensWRef.current = measuredW, cachedLensHRef.current = measuredH || 24, lensNeedsMeasureRef.current = !1);
          }
          let lensW = cachedLensWRef.current, lensH = cachedLensHRef.current;
          lensW <= 0 ? lensRef.current.style.visibility = "hidden" : lensRef.current.style.visibility = "visible";
          let isAbove = r4.top > lensH + gap, lensTop;
          isAbove ? lensTop = isLabelBelow ? r4.top - lensH - gap : r4.top - labelH - gap - lensH - 4 : lensTop = r4.bottom + labelH + gap + 4;
          let lensLeft = r4.left + r4.width / 2 - lensW / 2, clampedLeft = Math.max(4, Math.min(lensLeft, window.innerWidth - 4 - lensW));
          lensRef.current.style.transform = `translate(${clampedLeft}px, ${lensTop}px)`;
        }
        let docTop = r4.top + window.scrollY, docLeft = r4.left + window.scrollX;
        if (stableDoc === null) {
          stableDoc = { top: docTop, left: docLeft }, prevDoc = { top: docTop, left: docLeft }, rafId = requestAnimationFrame(update);
          return;
        }
        if (performance.now() < scrollCooldownUntil) {
          stableDoc = { top: docTop, left: docLeft }, prevDoc = { top: docTop, left: docLeft }, rafId = requestAnimationFrame(update);
          return;
        }
        let dTop = docTop - prevDoc.top, dLeft = docLeft - prevDoc.left;
        if ((Math.abs(dTop) > 2 || Math.abs(dLeft) > 2) && (lastChangeTime = performance.now()), prevDoc = { top: docTop, left: docLeft }, performance.now() - lastChangeTime > STABLE_THRESHOLD_MS && lastChangeTime > 0) {
          let totalShift = Math.hypot(
            docTop - stableDoc.top,
            docLeft - stableDoc.left
          ), offScreen = r4.top < 0 || r4.bottom > window.innerHeight || r4.left < 0 || r4.right > window.innerWidth;
          totalShift > SHIFT_THRESHOLD_PX && offScreen && (element.scrollIntoView({ behavior: "smooth", block: "nearest" }), scrollCooldownUntil = performance.now() + SCROLL_COOLDOWN_MS), stableDoc = { top: docTop, left: docLeft }, lastChangeTime = 0;
        }
        if (idleFrames >= 3) {
          rafId = 0;
          return;
        }
        rafId = requestAnimationFrame(update);
      }
      function restartLoop() {
        rafId || (idleFrames = 0, rafId = requestAnimationFrame(update));
      }
      update();
      function handleTransformUpdate() {
        rafId && (cancelAnimationFrame(rafId), rafId = 0), idleFrames = 0, update();
      }
      let unsubTransform = onTransformUpdate(handleTransformUpdate), unsubOverride = onOverrideChange(restartLoop);
      return window.addEventListener("scroll", restartLoop, { capture: !0, passive: !0 }), window.addEventListener("resize", restartLoop), () => {
        cancelAnimationFrame(rafId), unsubTransform(), unsubOverride(), window.removeEventListener("scroll", restartLoop, { capture: !0 }), window.removeEventListener("resize", restartLoop);
      };
    }, [element, hmrAppliedVersion]), !element) return null;
    let label = getSelectionLabel(element), showLens = !!(availableStates && (availableStates.hover.size > 0 || availableStates.focus.size > 0 || availableStates.active.size > 0)), stateButtons = [];
    return showLens && (stateButtons.push({ label: "Default", state: "default" }), availableStates.hover.size > 0 && stateButtons.push({ label: ":hover", state: "hover" }), availableStates.focus.size > 0 && stateButtons.push({ label: ":focus", state: "focus" }), availableStates.active.size > 0 && stateButtons.push({ label: ":active", state: "active" })), /* @__PURE__ */ u4(
      "div",
      {
        ref: overlayRef,
        class: "cortex-selection-overlay",
        style: {
          // width/height intentionally omitted — set by the RAF position-tracking loop
          // at lines 73-75. Including them here causes Preact re-renders to overwrite
          // RAF-set values with 0, producing a one-frame flash.
          visibility: overlaysVisible ? "visible" : "hidden"
        },
        children: [
          /* @__PURE__ */ u4("span", { ref: labelRef, class: "cortex-label cortex-label--below", children: label }),
          showLens && /* @__PURE__ */ u4(
            "div",
            {
              ref: lensRef,
              class: "cortex-state-lens",
              style: { position: "fixed", left: 0, top: 0 },
              children: stateButtons.map(({ label: btnLabel, state }) => /* @__PURE__ */ u4(
                "button",
                {
                  class: `cortex-state-lens__btn${activeState === state ? " cortex-state-lens__btn--active" : ""}`,
                  onClick: () => onStateChange?.(state),
                  children: btnLabel
                },
                state
              ))
            }
          )
        ]
      }
    );
  }

  // src/browser/components/SecondarySelectionOverlay.tsx
  function SecondarySelectionOverlay({
    element,
    overlaysVisible = !0,
    hmrAppliedVersion = 0
  }) {
    let overlayRef = A2(null);
    return y2(() => {
      if (!overlayRef.current) return;
      let rafId = 0, idleFrames = 0, prevTransform = "", prevWidth = "", prevHeight = "", prevBorderRadius = "";
      function update() {
        if (!overlayRef.current) return;
        if (!element.isConnected) {
          overlayRef.current.style.visibility = "hidden";
          return;
        }
        let r4 = element.getBoundingClientRect(), transform = `translate(${r4.left}px, ${r4.top}px)`, width = `${r4.width}px`, height = `${r4.height}px`, el = overlayRef.current, changed = transform !== prevTransform || width !== prevWidth || height !== prevHeight, sizeChanged = width !== prevWidth || height !== prevHeight;
        if (transform !== prevTransform && (el.style.transform = transform, prevTransform = transform), width !== prevWidth && (el.style.width = width, prevWidth = width), height !== prevHeight && (el.style.height = height, prevHeight = height), sizeChanged || prevBorderRadius === "") {
          let br = getComputedStyle(element).borderRadius || "0px";
          br !== prevBorderRadius && (el.style.borderRadius = br, prevBorderRadius = br);
        }
        if (changed ? idleFrames = 0 : idleFrames++, idleFrames >= 3) {
          rafId = 0;
          return;
        }
        rafId = requestAnimationFrame(update);
      }
      function restartLoop() {
        rafId || (idleFrames = 0, rafId = requestAnimationFrame(update));
      }
      update();
      function handleTransformUpdate() {
        rafId && (cancelAnimationFrame(rafId), rafId = 0), idleFrames = 0, update();
      }
      let unsubTransform = onTransformUpdate(handleTransformUpdate), unsubOverride = onOverrideChange(restartLoop);
      return window.addEventListener("scroll", restartLoop, { capture: !0, passive: !0 }), window.addEventListener("resize", restartLoop), () => {
        cancelAnimationFrame(rafId), unsubTransform(), unsubOverride(), window.removeEventListener("scroll", restartLoop, { capture: !0 }), window.removeEventListener("resize", restartLoop);
      };
    }, [element, hmrAppliedVersion]), /* @__PURE__ */ u4(
      "div",
      {
        ref: overlayRef,
        class: "cortex-selection-overlay cortex-selection-overlay--secondary",
        style: { visibility: overlaysVisible ? "visible" : "hidden" }
      }
    );
  }

  // src/browser/uuid.ts
  function generateId() {
    if (typeof crypto < "u" && typeof crypto.randomUUID == "function")
      try {
        return crypto.randomUUID();
      } catch {
      }
    return `cortex-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  }

  // src/browser/edit-command.ts
  var BaseEditCommand = class {
    constructor(init) {
      __publicField(this, "editId");
      __publicField(this, "changes");
      __publicField(this, "overrideManager");
      this.editId = init.editId ?? generateId(), this.changes = init.changes, this.overrideManager = init.overrideManager;
    }
    /** Revert each change: previousValue === '' removes the override;
     *  otherwise restores the prior value. Same logic for both subclasses
     *  because undo reads the captured previousValue, not the forward value. */
    undo() {
      for (let c4 of this.changes)
        c4.previousValue === "" ? this.overrideManager.remove(c4.source, c4.property, c4.pseudo) : this.overrideManager.set(c4.source, c4.property, c4.previousValue, c4.pseudo);
    }
  }, PropertyEditCommand = class extends BaseEditCommand {
    constructor(init) {
      super(init);
      // Staged in the browser-side buffer post-pivot; no server-side undo entry
      // exists until Apply (ZF0-1452) flushes the buffer to Claude Code.
      __publicField(this, "hasServerEntry", !1);
      __publicField(this, "pendingEdits");
      __publicField(this, "bufferOps");
      this.pendingEdits = init.pendingEdits ?? [], this.bufferOps = init.bufferOps ?? null;
    }
    execute() {
      for (let c4 of this.changes)
        this.overrideManager.set(c4.source, c4.property, c4.value, c4.pseudo);
      if (this.bufferOps && this.pendingEdits.length > 0)
        for (let edit of this.pendingEdits) this.bufferOps.append(edit);
    }
    undo() {
      super.undo(), this.bufferOps && this.pendingEdits.length > 0 && this.bufferOps.remove(this.pendingEdits.map((e4) => e4.intentId));
    }
  }, CompoundEditCommand = class extends BaseEditCommand {
    constructor() {
      super(...arguments);
      // classOp dispatches at Panel.tsx still channel.send to the server, so the
      // server has a corresponding UndoFileChange entry that {type:'undo'} can pop.
      __publicField(this, "hasServerEntry", !0);
    }
    execute() {
      for (let c4 of this.changes)
        c4.value === "" ? this.overrideManager.remove(c4.source, c4.property, c4.pseudo) : this.overrideManager.set(c4.source, c4.property, c4.value, c4.pseudo);
    }
  };

  // src/browser/persistence.ts
  var PREFIX = typeof location < "u" ? `cortex:${location.port || "0"}:` : "cortex:0:";
  function get(key, fallback, validate) {
    let fullKey = PREFIX + key, raw = (() => {
      try {
        return localStorage.getItem(fullKey);
      } catch {
        return null;
      }
    })();
    if (raw === null) return fallback;
    try {
      let parsed = JSON.parse(raw);
      if (!validate(parsed)) {
        console.warn(`[cortex] localStorage entry ${key} failed schema validation \u2014 discarding`);
        try {
          localStorage.removeItem(fullKey);
        } catch {
        }
        return fallback;
      }
      return parsed;
    } catch (err) {
      console.warn(`[cortex] localStorage entry ${key} could not be parsed \u2014 discarding`, err);
      try {
        localStorage.removeItem(fullKey);
      } catch {
      }
      return fallback;
    }
  }
  function set(key, value) {
    try {
      return localStorage.setItem(PREFIX + key, JSON.stringify(value)), !0;
    } catch (err) {
      return console.warn(`[cortex] localStorage set failed for ${key}`, err instanceof Error ? err.message : err), !1;
    }
  }
  function clear() {
    let toRemove = [];
    for (let i4 = 0; i4 < localStorage.length; i4++) {
      let k3 = localStorage.key(i4);
      k3?.startsWith(PREFIX) && toRemove.push(k3);
    }
    toRemove.forEach((k3) => localStorage.removeItem(k3));
  }
  var cortexStorage = { get, set, clear };
  function isValidPosition(v3) {
    return typeof v3 == "object" && v3 !== null && "x" in v3 && "y" in v3 && typeof v3.x == "number" && Number.isFinite(v3.x) && typeof v3.y == "number" && Number.isFinite(v3.y);
  }

  // src/browser/hooks/useSnapToEdge.ts
  var PANEL_WIDTH = 320, PANEL_MAX_HEIGHT = 460, PANEL_MARGIN = 12, SNAP_DURATION = 350, SNAP_THRESHOLD = 80;
  function clamp(value, min2, max2) {
    return !Number.isFinite(value) || max2 < min2 ? min2 : Math.max(min2, Math.min(max2, value));
  }
  function getPanelBounds() {
    let availableX = window.innerWidth - PANEL_WIDTH, availableY = window.innerHeight - PANEL_MAX_HEIGHT, minX = availableX <= 0 ? 0 : Math.min(PANEL_MARGIN, availableX), minY = availableY <= 0 ? 0 : Math.min(PANEL_MARGIN, availableY), maxX = availableX <= 0 ? 0 : Math.max(minX, availableX - PANEL_MARGIN), maxY = availableY <= 0 ? 0 : Math.max(minY, availableY - PANEL_MARGIN);
    return { minX, maxX, minY, maxY };
  }
  function normalizePosition(position) {
    let { minX, maxX, minY, maxY } = getPanelBounds();
    return {
      x: clamp(position.x, minX, maxX),
      y: clamp(position.y, minY, maxY)
    };
  }
  function snapToEdge(position) {
    let { minX, maxX, minY, maxY } = getPanelBounds(), freeY = clamp(position.y, minY, maxY), distLeft = position.x - minX, distRight = maxX - position.x, x3;
    return distLeft <= SNAP_THRESHOLD ? x3 = minX : distRight <= SNAP_THRESHOLD ? x3 = maxX : x3 = clamp(position.x, minX, maxX), { x: x3, y: freeY };
  }
  function getInitialPosition() {
    if (typeof window > "u") return { x: 0, y: 0 };
    let defaultPos = {
      x: Math.max(0, window.innerWidth - PANEL_WIDTH - PANEL_MARGIN),
      y: PANEL_MARGIN
    };
    return normalizePosition(cortexStorage.get("panel-position", defaultPos, isValidPosition));
  }
  function useSnapToEdge() {
    let [position, setPositionState] = d2(getInitialPosition), [isSnapping, setIsSnapping] = d2(!1), snapTimerRef = A2(null), positionRef = A2(position), setPosition = q2((pos) => {
      let clamped = normalizePosition(pos);
      positionRef.current = clamped, setPositionState(clamped);
    }, []), snap = q2(() => {
      let snapped = snapToEdge(positionRef.current);
      positionRef.current = snapped, setPositionState(snapped), setIsSnapping(!0), cortexStorage.set("panel-position", snapped), snapTimerRef.current && clearTimeout(snapTimerRef.current), snapTimerRef.current = setTimeout(() => {
        snapTimerRef.current = null, setIsSnapping(!1);
      }, SNAP_DURATION);
    }, []);
    y2(() => {
      function handleResize() {
        setPositionState((prev) => {
          let { minX, maxX, minY, maxY } = getPanelBounds(), y3 = clamp(prev.y, minY, maxY), next = { x: Math.abs(prev.x - minX) <= Math.abs(prev.x - maxX) ? minX : maxX, y: y3 };
          return positionRef.current = next, next;
        });
      }
      return window.addEventListener("resize", handleResize), () => window.removeEventListener("resize", handleResize);
    }, []);
    let recheckOverlap = q2((elementRect) => {
      let pos = positionRef.current, panelRight = pos.x + PANEL_WIDTH, panelBottom = pos.y + PANEL_MAX_HEIGHT;
      if (!(panelRight < elementRect.left || pos.x > elementRect.right || panelBottom < elementRect.top || pos.y > elementRect.bottom)) {
        let viewportCenter = window.innerWidth / 2, targetX = pos.x < viewportCenter ? window.innerWidth - PANEL_WIDTH - PANEL_MARGIN : PANEL_MARGIN;
        positionRef.current = { x: targetX, y: pos.y }, snap();
      }
    }, [snap]);
    return y2(() => () => {
      snapTimerRef.current && clearTimeout(snapTimerRef.current);
    }, []), { position, isSnapping, setPosition, snap, recheckOverlap };
  }

  // src/browser/format-shortcut.ts
  var isMac = typeof navigator < "u" && /Mac|iPod|iPhone|iPad/.test(navigator.platform), MODIFIER_DISPLAY = isMac ? { $mod: "\u2318", Shift: "\u21E7", Alt: "\u2325" } : { $mod: "Ctrl", Shift: "Shift", Alt: "Alt" }, KEY_DISPLAY = {
    Period: ".",
    Comma: ",",
    Slash: "/",
    Minus: "-",
    Equal: "="
  };
  function formatShortcut(binding) {
    return binding.split("+").map((p3) => MODIFIER_DISPLAY[p3] ?? KEY_DISPLAY[p3] ?? p3.replace("Key", "")).join(isMac ? "" : "+");
  }

  // src/browser/class-extractor.ts
  var STATIC_CLASSES = {
    // display
    block: "display",
    flex: "display",
    grid: "display",
    inline: "display",
    "inline-flex": "display",
    "inline-grid": "display",
    "inline-block": "display",
    hidden: "display",
    // visibility
    visible: "visibility",
    invisible: "visibility",
    // flex-direction
    "flex-row": "flex-direction",
    "flex-row-reverse": "flex-direction",
    "flex-col": "flex-direction",
    "flex-col-reverse": "flex-direction",
    // justify-content
    "justify-start": "justify-content",
    "justify-center": "justify-content",
    "justify-end": "justify-content",
    "justify-between": "justify-content",
    "justify-around": "justify-content",
    "justify-evenly": "justify-content",
    // align-items
    "items-start": "align-items",
    "items-center": "align-items",
    "items-end": "align-items",
    "items-stretch": "align-items",
    "items-baseline": "align-items",
    // text-align
    "text-left": "text-align",
    "text-center": "text-align",
    "text-right": "text-align",
    "text-justify": "text-align",
    // border-style
    "border-solid": "border-style",
    "border-dashed": "border-style",
    "border-dotted": "border-style",
    "border-double": "border-style",
    "border-none": "border-style",
    // overflow
    "overflow-visible": "overflow",
    "overflow-hidden": "overflow",
    "overflow-scroll": "overflow",
    "overflow-auto": "overflow",
    // cursor
    "cursor-auto": "cursor",
    "cursor-default": "cursor",
    "cursor-pointer": "cursor",
    "cursor-text": "cursor",
    "cursor-move": "cursor",
    "cursor-grab": "cursor",
    "cursor-not-allowed": "cursor",
    "cursor-crosshair": "cursor",
    "cursor-none": "cursor"
  }, PREFIX_RULES = [
    // Spacing — unambiguous prefixes
    { prefix: "pt-", property: "padding-top" },
    { prefix: "pr-", property: "padding-right" },
    { prefix: "pb-", property: "padding-bottom" },
    { prefix: "pl-", property: "padding-left" },
    { prefix: "mt-", property: "margin-top" },
    { prefix: "mr-", property: "margin-right" },
    { prefix: "mb-", property: "margin-bottom" },
    { prefix: "ml-", property: "margin-left" },
    { prefix: "gap-x-", property: "column-gap" },
    { prefix: "gap-y-", property: "row-gap" },
    { prefix: "gap-", property: "gap" },
    { prefix: "w-", property: "width" },
    { prefix: "h-", property: "height" },
    { prefix: "min-w-", property: "min-width" },
    { prefix: "min-h-", property: "min-height" },
    { prefix: "max-w-", property: "max-width" },
    { prefix: "max-h-", property: "max-height" },
    // Shorthand padding/margin — EXCLUDED from direct class path.
    // Replacing px-4 with pl-N silently drops padding-right. Let the
    // legacy resolver path handle shorthands safely.
    // (px-, py-, p-, mx-, my-, m- are NOT listed here)
    // Colors — unambiguous prefixes
    // NOTE: bg-clip-*, bg-opacity-*, bg-gradient-*, bg-no-repeat, etc. are
    // handled by the exclusion set in extractUtilities, not here.
    { prefix: "bg-", property: "background-color", isColor: !0 },
    // Typography — font- is handled by resolveAmbiguous (not here) because
    // font-sans/font-mono are font-family, not font-weight.
    { prefix: "leading-", property: "line-height" },
    // Border radius — longest-first, individual corners only
    { prefix: "rounded-tl-", property: "border-top-left-radius" },
    { prefix: "rounded-tr-", property: "border-top-right-radius" },
    { prefix: "rounded-br-", property: "border-bottom-right-radius" },
    { prefix: "rounded-bl-", property: "border-bottom-left-radius" },
    // Opacity
    { prefix: "opacity-", property: "opacity" },
    // Effects
    { prefix: "shadow-", property: "box-shadow" },
    { prefix: "backdrop-blur-", property: "backdrop-filter" },
    { prefix: "blur-", property: "filter" }
  ], BG_NON_COLOR_PREFIXES = [
    "bg-opacity",
    "bg-clip",
    "bg-gradient",
    "bg-no-repeat",
    "bg-repeat",
    "bg-cover",
    "bg-contain",
    "bg-center",
    "bg-bottom",
    "bg-top",
    "bg-left",
    "bg-right",
    "bg-fixed",
    "bg-local",
    "bg-scroll",
    "bg-origin",
    "bg-blend",
    "bg-none"
  ], BORDER_NON_STYLE_PREFIXES = [
    "border-opacity",
    "border-collapse",
    "border-separate",
    "border-spacing",
    "border-x-",
    "border-y-"
  ], FONT_SIZE_KEYS = /* @__PURE__ */ new Set([
    "xs",
    "sm",
    "base",
    "lg",
    "xl",
    "2xl",
    "3xl",
    "4xl",
    "5xl",
    "6xl",
    "7xl",
    "8xl",
    "9xl"
  ]), FONT_WEIGHT_KEYS = /* @__PURE__ */ new Set([
    "thin",
    "extralight",
    "light",
    "normal",
    "medium",
    "semibold",
    "bold",
    "extrabold",
    "black"
  ]);
  function resolveAmbiguous(token) {
    if (token.startsWith("text-")) {
      let suffix = token.slice(5);
      return FONT_SIZE_KEYS.has(suffix) ? { property: "font-size", className: token } : suffix === "left" || suffix === "center" || suffix === "right" || suffix === "justify" ? null : { property: "color", className: token };
    }
    if (token.startsWith("border-") && !token.startsWith("border-t-") && !token.startsWith("border-b-") && !token.startsWith("border-l-") && !token.startsWith("border-r-")) {
      let suffix = token.slice(7);
      return STATIC_CLASSES[token] || BORDER_NON_STYLE_PREFIXES.some((p3) => token.startsWith(p3)) ? null : /^\d+$/.test(suffix) ? { property: "border-width", className: token } : { property: "border-color", className: token };
    }
    if (token.startsWith("font-")) {
      let suffix = token.slice(5);
      return FONT_WEIGHT_KEYS.has(suffix) ? { property: "font-weight", className: token } : null;
    }
    return token === "rounded" ? { property: "border-radius", className: token } : token.startsWith("rounded-") && !token.startsWith("rounded-t-") && !token.startsWith("rounded-b-") && !token.startsWith("rounded-l-") && !token.startsWith("rounded-r-") && !token.startsWith("rounded-tl-") && !token.startsWith("rounded-tr-") && !token.startsWith("rounded-bl-") && !token.startsWith("rounded-br-") ? { property: "border-radius", className: token } : token === "blur" ? { property: "filter", className: token } : token === "shadow" ? { property: "box-shadow", className: token } : token === "border" ? { property: "border-width", className: token } : null;
  }
  function extractUtilities(className) {
    let result = /* @__PURE__ */ new Map(), tokens = className.split(/\s+/).filter(Boolean);
    for (let token of tokens) {
      if (token.includes(":")) continue;
      let staticProp = STATIC_CLASSES[token];
      if (staticProp && !result.has(staticProp)) {
        result.set(staticProp, token);
        continue;
      }
      let matched = !1;
      for (let rule of PREFIX_RULES)
        if (!(!token.startsWith(rule.prefix) || result.has(rule.property)) && !(rule.prefix === "bg-" && BG_NON_COLOR_PREFIXES.some((p3) => token.startsWith(p3)))) {
          result.set(rule.property, token), matched = !0;
          break;
        }
      if (matched) continue;
      let ambig = resolveAmbiguous(token);
      ambig && !result.has(ambig.property) && result.set(ambig.property, ambig.className);
    }
    return result;
  }

  // src/browser/theme.ts
  var THEME_STORAGE_KEY = "cortex-theme-preference", _onPreferenceChange = null;
  function _registerPreferenceChangeHandler(handler) {
    _onPreferenceChange = handler;
  }
  function _clearPreferenceChangeHandler() {
    _onPreferenceChange = null;
  }
  function getThemePreference() {
    try {
      let stored = localStorage.getItem(THEME_STORAGE_KEY);
      if (stored === "light" || stored === "dark" || stored === "system") return stored;
    } catch {
    }
    return "system";
  }
  function setThemePreference(pref) {
    try {
      localStorage.setItem(THEME_STORAGE_KEY, pref);
    } catch {
    }
    _onPreferenceChange?.();
  }

  // src/browser/popover-stack.ts
  var stack = [];
  function registerPopoverDismiss(dismiss) {
    return stack.push(dismiss), () => {
      let idx = stack.lastIndexOf(dismiss);
      idx >= 0 && stack.splice(idx, 1);
    };
  }
  function dismissTopmostPopover() {
    let top = stack[stack.length - 1];
    return top ? (stack.pop(), top(), !0) : !1;
  }
  function hasOpenPopover() {
    return stack.length > 0;
  }

  // src/browser/components/icons.tsx
  var BASE_SVG_PROPS = {
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    "stroke-width": 2,
    "stroke-linecap": "round",
    "stroke-linejoin": "round"
  };
  function svgProps(size2, cls) {
    return {
      ...BASE_SVG_PROPS,
      width: size2,
      height: size2,
      class: cls,
      "aria-hidden": "true"
    };
  }
  function Eye({ size: size2 = 16, class: cls } = {}) {
    return /* @__PURE__ */ u4("svg", { ...svgProps(size2, cls), children: [
      /* @__PURE__ */ u4("path", { d: "M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0" }),
      /* @__PURE__ */ u4("circle", { cx: "12", cy: "12", r: "3" })
    ] });
  }
  function EyeOff({ size: size2 = 16, class: cls } = {}) {
    return /* @__PURE__ */ u4("svg", { ...svgProps(size2, cls), children: [
      /* @__PURE__ */ u4("path", { d: "M10.733 5.076a10.744 10.744 0 0 1 11.205 6.575 1 1 0 0 1 0 .696 10.747 10.747 0 0 1-1.444 2.49" }),
      /* @__PURE__ */ u4("path", { d: "M14.084 14.158a3 3 0 0 1-4.242-4.242" }),
      /* @__PURE__ */ u4("path", { d: "M17.479 17.499a10.75 10.75 0 0 1-15.417-5.151 1 1 0 0 1 0-.696 10.75 10.75 0 0 1 4.446-5.143" }),
      /* @__PURE__ */ u4("path", { d: "m2 2 20 20" })
    ] });
  }
  function EyeClosed({ size: size2 = 16, class: cls } = {}) {
    return /* @__PURE__ */ u4("svg", { ...svgProps(size2, cls), children: [
      /* @__PURE__ */ u4("path", { d: "m15 18-.722-3.25" }),
      /* @__PURE__ */ u4("path", { d: "M2 8a10.645 10.645 0 0 0 20 0" }),
      /* @__PURE__ */ u4("path", { d: "m20 15-1.726-2.05" }),
      /* @__PURE__ */ u4("path", { d: "m4 15 1.726-2.05" }),
      /* @__PURE__ */ u4("path", { d: "m9 18 .722-3.25" })
    ] });
  }
  function Eclipse({ size: size2 = 16, class: cls } = {}) {
    return /* @__PURE__ */ u4("svg", { ...svgProps(size2, cls), children: [
      /* @__PURE__ */ u4("circle", { cx: "12", cy: "12", r: "10" }),
      /* @__PURE__ */ u4("path", { d: "M12 2a7 7 0 1 0 10 10" })
    ] });
  }
  function CornerTopLeft({ size: size2 = 16, class: cls } = {}) {
    return /* @__PURE__ */ u4("svg", { ...svgProps(size2, cls), children: /* @__PURE__ */ u4("path", { d: "M8 3H5a2 2 0 0 0-2 2v3" }) });
  }
  function CornerTopRight({ size: size2 = 16, class: cls } = {}) {
    return /* @__PURE__ */ u4("svg", { ...svgProps(size2, cls), children: /* @__PURE__ */ u4("path", { d: "M21 8V5a2 2 0 0 0-2-2h-3" }) });
  }
  function CornerBottomRight({ size: size2 = 16, class: cls } = {}) {
    return /* @__PURE__ */ u4("svg", { ...svgProps(size2, cls), children: /* @__PURE__ */ u4("path", { d: "M16 21h3a2 2 0 0 0 2-2v-3" }) });
  }
  function CornerBottomLeft({ size: size2 = 16, class: cls } = {}) {
    return /* @__PURE__ */ u4("svg", { ...svgProps(size2, cls), children: /* @__PURE__ */ u4("path", { d: "M3 16v3a2 2 0 0 0 2 2h3" }) });
  }
  function SquareDashed({ size: size2 = 16, class: cls } = {}) {
    return /* @__PURE__ */ u4("svg", { ...svgProps(size2, cls), children: [
      /* @__PURE__ */ u4("path", { d: "M5 3a2 2 0 0 0-2 2" }),
      /* @__PURE__ */ u4("path", { d: "M19 3a2 2 0 0 1 2 2" }),
      /* @__PURE__ */ u4("path", { d: "M21 19a2 2 0 0 1-2 2" }),
      /* @__PURE__ */ u4("path", { d: "M5 21a2 2 0 0 1-2-2" }),
      /* @__PURE__ */ u4("path", { d: "M9 3h1" }),
      /* @__PURE__ */ u4("path", { d: "M9 21h1" }),
      /* @__PURE__ */ u4("path", { d: "M14 3h1" }),
      /* @__PURE__ */ u4("path", { d: "M14 21h1" }),
      /* @__PURE__ */ u4("path", { d: "M3 9v1" }),
      /* @__PURE__ */ u4("path", { d: "M21 9v1" }),
      /* @__PURE__ */ u4("path", { d: "M3 14v1" }),
      /* @__PURE__ */ u4("path", { d: "M21 14v1" })
    ] });
  }
  function SquareSideTop({ size: size2 = 16, class: cls } = {}) {
    return /* @__PURE__ */ u4("svg", { ...svgProps(size2, cls), children: [
      /* @__PURE__ */ u4("path", { d: "M5 3a2 2 0 0 0-2 2" }),
      /* @__PURE__ */ u4("path", { d: "M19 3a2 2 0 0 1 2 2" }),
      /* @__PURE__ */ u4("path", { d: "M21 19a2 2 0 0 1-2 2" }),
      /* @__PURE__ */ u4("path", { d: "M5 21a2 2 0 0 1-2-2" }),
      /* @__PURE__ */ u4("path", { d: "M5 3h14" }),
      /* @__PURE__ */ u4("path", { d: "M9 21h1" }),
      /* @__PURE__ */ u4("path", { d: "M14 21h1" }),
      /* @__PURE__ */ u4("path", { d: "M3 9v1" }),
      /* @__PURE__ */ u4("path", { d: "M21 9v1" }),
      /* @__PURE__ */ u4("path", { d: "M3 14v1" }),
      /* @__PURE__ */ u4("path", { d: "M21 14v1" })
    ] });
  }
  function SquareSideRight({ size: size2 = 16, class: cls } = {}) {
    return /* @__PURE__ */ u4("svg", { ...svgProps(size2, cls), children: [
      /* @__PURE__ */ u4("path", { d: "M5 3a2 2 0 0 0-2 2" }),
      /* @__PURE__ */ u4("path", { d: "M19 3a2 2 0 0 1 2 2" }),
      /* @__PURE__ */ u4("path", { d: "M21 19a2 2 0 0 1-2 2" }),
      /* @__PURE__ */ u4("path", { d: "M5 21a2 2 0 0 1-2-2" }),
      /* @__PURE__ */ u4("path", { d: "M21 5v14" }),
      /* @__PURE__ */ u4("path", { d: "M9 3h1" }),
      /* @__PURE__ */ u4("path", { d: "M14 3h1" }),
      /* @__PURE__ */ u4("path", { d: "M9 21h1" }),
      /* @__PURE__ */ u4("path", { d: "M14 21h1" }),
      /* @__PURE__ */ u4("path", { d: "M3 9v1" }),
      /* @__PURE__ */ u4("path", { d: "M3 14v1" })
    ] });
  }
  function SquareSideBottom({ size: size2 = 16, class: cls } = {}) {
    return /* @__PURE__ */ u4("svg", { ...svgProps(size2, cls), children: [
      /* @__PURE__ */ u4("path", { d: "M5 3a2 2 0 0 0-2 2" }),
      /* @__PURE__ */ u4("path", { d: "M19 3a2 2 0 0 1 2 2" }),
      /* @__PURE__ */ u4("path", { d: "M21 19a2 2 0 0 1-2 2" }),
      /* @__PURE__ */ u4("path", { d: "M5 21a2 2 0 0 1-2-2" }),
      /* @__PURE__ */ u4("path", { d: "M5 21h14" }),
      /* @__PURE__ */ u4("path", { d: "M9 3h1" }),
      /* @__PURE__ */ u4("path", { d: "M14 3h1" }),
      /* @__PURE__ */ u4("path", { d: "M3 9v1" }),
      /* @__PURE__ */ u4("path", { d: "M21 9v1" }),
      /* @__PURE__ */ u4("path", { d: "M3 14v1" }),
      /* @__PURE__ */ u4("path", { d: "M21 14v1" })
    ] });
  }
  function SquareSideLeft({ size: size2 = 16, class: cls } = {}) {
    return /* @__PURE__ */ u4("svg", { ...svgProps(size2, cls), children: [
      /* @__PURE__ */ u4("path", { d: "M5 3a2 2 0 0 0-2 2" }),
      /* @__PURE__ */ u4("path", { d: "M19 3a2 2 0 0 1 2 2" }),
      /* @__PURE__ */ u4("path", { d: "M21 19a2 2 0 0 1-2 2" }),
      /* @__PURE__ */ u4("path", { d: "M5 21a2 2 0 0 1-2-2" }),
      /* @__PURE__ */ u4("path", { d: "M3 5v14" }),
      /* @__PURE__ */ u4("path", { d: "M9 3h1" }),
      /* @__PURE__ */ u4("path", { d: "M14 3h1" }),
      /* @__PURE__ */ u4("path", { d: "M9 21h1" }),
      /* @__PURE__ */ u4("path", { d: "M14 21h1" }),
      /* @__PURE__ */ u4("path", { d: "M21 9v1" }),
      /* @__PURE__ */ u4("path", { d: "M21 14v1" })
    ] });
  }
  function Square({ size: size2 = 16, class: cls } = {}) {
    return /* @__PURE__ */ u4("svg", { ...svgProps(size2, cls), children: /* @__PURE__ */ u4("rect", { width: "18", height: "18", x: "3", y: "3", rx: "2" }) });
  }
  function MoveDiagonal({ size: size2 = 16, class: cls } = {}) {
    return /* @__PURE__ */ u4("svg", { ...svgProps(size2, cls), children: [
      /* @__PURE__ */ u4("path", { d: "M11 19H5v-6" }),
      /* @__PURE__ */ u4("path", { d: "M13 5h6v6" }),
      /* @__PURE__ */ u4("path", { d: "M19 5 5 19" })
    ] });
  }
  function Maximize({ size: size2 = 16, class: cls } = {}) {
    return /* @__PURE__ */ u4("svg", { ...svgProps(size2, cls), children: [
      /* @__PURE__ */ u4("path", { d: "M8 3H5a2 2 0 0 0-2 2v3" }),
      /* @__PURE__ */ u4("path", { d: "M21 8V5a2 2 0 0 0-2-2h-3" }),
      /* @__PURE__ */ u4("path", { d: "M3 16v3a2 2 0 0 0 2 2h3" }),
      /* @__PURE__ */ u4("path", { d: "M16 21h3a2 2 0 0 0 2-2v-3" })
    ] });
  }
  function Pin({ size: size2 = 16, class: cls } = {}) {
    return /* @__PURE__ */ u4("svg", { ...svgProps(size2, cls), children: [
      /* @__PURE__ */ u4("path", { d: "M12 17v5" }),
      /* @__PURE__ */ u4("path", { d: "M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z" })
    ] });
  }
  function Paperclip({ size: size2 = 16, class: cls } = {}) {
    return /* @__PURE__ */ u4("svg", { ...svgProps(size2, cls), children: /* @__PURE__ */ u4("path", { d: "m16 6-8.414 8.586a2 2 0 0 0 2.829 2.829l8.414-8.586a4 4 0 1 0-5.657-5.657l-8.379 8.551a6 6 0 1 0 8.485 8.485l8.379-8.551" }) });
  }
  function AlignHorizontalJustifyStart({ size: size2 = 16, class: cls } = {}) {
    return /* @__PURE__ */ u4("svg", { ...svgProps(size2, cls), children: [
      /* @__PURE__ */ u4("rect", { width: "6", height: "14", x: "6", y: "5", rx: "2" }),
      /* @__PURE__ */ u4("rect", { width: "6", height: "10", x: "16", y: "7", rx: "2" }),
      /* @__PURE__ */ u4("path", { d: "M2 2v20" })
    ] });
  }
  function AlignHorizontalJustifyCenter({ size: size2 = 16, class: cls } = {}) {
    return /* @__PURE__ */ u4("svg", { ...svgProps(size2, cls), children: [
      /* @__PURE__ */ u4("rect", { width: "6", height: "14", x: "2", y: "5", rx: "2" }),
      /* @__PURE__ */ u4("rect", { width: "6", height: "10", x: "16", y: "7", rx: "2" }),
      /* @__PURE__ */ u4("path", { d: "M12 2v20" })
    ] });
  }
  function AlignHorizontalJustifyEnd({ size: size2 = 16, class: cls } = {}) {
    return /* @__PURE__ */ u4("svg", { ...svgProps(size2, cls), children: [
      /* @__PURE__ */ u4("rect", { width: "6", height: "14", x: "2", y: "5", rx: "2" }),
      /* @__PURE__ */ u4("rect", { width: "6", height: "10", x: "12", y: "7", rx: "2" }),
      /* @__PURE__ */ u4("path", { d: "M22 2v20" })
    ] });
  }
  function AlignVerticalJustifyStart({ size: size2 = 16, class: cls } = {}) {
    return /* @__PURE__ */ u4("svg", { ...svgProps(size2, cls), children: [
      /* @__PURE__ */ u4("rect", { width: "14", height: "6", x: "5", y: "16", rx: "2" }),
      /* @__PURE__ */ u4("rect", { width: "10", height: "6", x: "7", y: "6", rx: "2" }),
      /* @__PURE__ */ u4("path", { d: "M2 2h20" })
    ] });
  }
  function AlignVerticalJustifyCenter({ size: size2 = 16, class: cls } = {}) {
    return /* @__PURE__ */ u4("svg", { ...svgProps(size2, cls), children: [
      /* @__PURE__ */ u4("rect", { width: "14", height: "6", x: "5", y: "16", rx: "2" }),
      /* @__PURE__ */ u4("rect", { width: "10", height: "6", x: "7", y: "2", rx: "2" }),
      /* @__PURE__ */ u4("path", { d: "M2 12h20" })
    ] });
  }
  function AlignVerticalJustifyEnd({ size: size2 = 16, class: cls } = {}) {
    return /* @__PURE__ */ u4("svg", { ...svgProps(size2, cls), children: [
      /* @__PURE__ */ u4("rect", { width: "14", height: "6", x: "5", y: "12", rx: "2" }),
      /* @__PURE__ */ u4("rect", { width: "10", height: "6", x: "7", y: "2", rx: "2" }),
      /* @__PURE__ */ u4("path", { d: "M2 22h20" })
    ] });
  }
  function RotateCw({ size: size2 = 16, class: cls } = {}) {
    return /* @__PURE__ */ u4("svg", { ...svgProps(size2, cls), children: [
      /* @__PURE__ */ u4("path", { d: "M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8" }),
      /* @__PURE__ */ u4("path", { d: "M21 3v5h-5" })
    ] });
  }
  function FlipHorizontal({ size: size2 = 16, class: cls } = {}) {
    return /* @__PURE__ */ u4("svg", { ...svgProps(size2, cls), children: [
      /* @__PURE__ */ u4("path", { d: "M8 3H5a2 2 0 0 0-2 2v14c0 1.1.9 2 2 2h3" }),
      /* @__PURE__ */ u4("path", { d: "M16 3h3a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-3" }),
      /* @__PURE__ */ u4("path", { d: "M12 20v2" }),
      /* @__PURE__ */ u4("path", { d: "M12 14v2" }),
      /* @__PURE__ */ u4("path", { d: "M12 8v2" }),
      /* @__PURE__ */ u4("path", { d: "M12 2v2" })
    ] });
  }
  function FlipVertical({ size: size2 = 16, class: cls } = {}) {
    return /* @__PURE__ */ u4("svg", { ...svgProps(size2, cls), children: [
      /* @__PURE__ */ u4("path", { d: "M21 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v3" }),
      /* @__PURE__ */ u4("path", { d: "M21 16v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-3" }),
      /* @__PURE__ */ u4("path", { d: "M4 12H2" }),
      /* @__PURE__ */ u4("path", { d: "M10 12H8" }),
      /* @__PURE__ */ u4("path", { d: "M16 12h-2" }),
      /* @__PURE__ */ u4("path", { d: "M22 12h-2" })
    ] });
  }
  function ArrowRight({ size: size2 = 16, class: cls } = {}) {
    return /* @__PURE__ */ u4("svg", { ...svgProps(size2, cls), children: [
      /* @__PURE__ */ u4("path", { d: "M5 12h14" }),
      /* @__PURE__ */ u4("path", { d: "m12 5 7 7-7 7" })
    ] });
  }
  function ArrowLeft({ size: size2 = 16, class: cls } = {}) {
    return /* @__PURE__ */ u4("svg", { ...svgProps(size2, cls), children: [
      /* @__PURE__ */ u4("path", { d: "m12 19-7-7 7-7" }),
      /* @__PURE__ */ u4("path", { d: "M19 12H5" })
    ] });
  }
  function ArrowDown({ size: size2 = 16, class: cls } = {}) {
    return /* @__PURE__ */ u4("svg", { ...svgProps(size2, cls), children: [
      /* @__PURE__ */ u4("path", { d: "M12 5v14" }),
      /* @__PURE__ */ u4("path", { d: "m19 12-7 7-7-7" })
    ] });
  }
  function ArrowUp({ size: size2 = 16, class: cls } = {}) {
    return /* @__PURE__ */ u4("svg", { ...svgProps(size2, cls), children: [
      /* @__PURE__ */ u4("path", { d: "m5 12 7-7 7 7" }),
      /* @__PURE__ */ u4("path", { d: "M12 19V5" })
    ] });
  }
  function ArrowLeftRight({ size: size2 = 16, class: cls } = {}) {
    return /* @__PURE__ */ u4("svg", { ...svgProps(size2, cls), children: [
      /* @__PURE__ */ u4("path", { d: "M8 3 4 7l4 4" }),
      /* @__PURE__ */ u4("path", { d: "M4 7h16" }),
      /* @__PURE__ */ u4("path", { d: "m16 21 4-4-4-4" }),
      /* @__PURE__ */ u4("path", { d: "M20 17H4" })
    ] });
  }
  function ArrowUpDown({ size: size2 = 16, class: cls } = {}) {
    return /* @__PURE__ */ u4("svg", { ...svgProps(size2, cls), children: [
      /* @__PURE__ */ u4("path", { d: "m21 16-4 4-4-4" }),
      /* @__PURE__ */ u4("path", { d: "M17 20V4" }),
      /* @__PURE__ */ u4("path", { d: "m3 8 4-4 4 4" }),
      /* @__PURE__ */ u4("path", { d: "M7 4v16" })
    ] });
  }
  function Unlink({ size: size2 = 16, class: cls } = {}) {
    return /* @__PURE__ */ u4("svg", { ...svgProps(size2, cls), children: [
      /* @__PURE__ */ u4("path", { d: "m18.84 12.25 1.72-1.71h-.02a5.004 5.004 0 0 0-.12-7.07 5.006 5.006 0 0 0-6.95 0l-1.72 1.71" }),
      /* @__PURE__ */ u4("path", { d: "m5.17 11.75-1.71 1.71a5.004 5.004 0 0 0 .12 7.07 5.006 5.006 0 0 0 6.95 0l1.71-1.71" }),
      /* @__PURE__ */ u4("line", { x1: "8", x2: "8", y1: "2", y2: "5" }),
      /* @__PURE__ */ u4("line", { x1: "2", x2: "5", y1: "8", y2: "8" }),
      /* @__PURE__ */ u4("line", { x1: "16", x2: "16", y1: "19", y2: "22" }),
      /* @__PURE__ */ u4("line", { x1: "19", x2: "22", y1: "16", y2: "16" })
    ] });
  }
  function Plus({ size: size2 = 16, class: cls } = {}) {
    return /* @__PURE__ */ u4("svg", { ...svgProps(size2, cls), children: [
      /* @__PURE__ */ u4("path", { d: "M5 12h14" }),
      /* @__PURE__ */ u4("path", { d: "M12 5v14" })
    ] });
  }
  function Minus({ size: size2 = 16, class: cls } = {}) {
    return /* @__PURE__ */ u4("svg", { ...svgProps(size2, cls), children: /* @__PURE__ */ u4("path", { d: "M5 12h14" }) });
  }
  function X({ size: size2 = 16, class: cls } = {}) {
    return /* @__PURE__ */ u4("svg", { ...svgProps(size2, cls), children: [
      /* @__PURE__ */ u4("path", { d: "M18 6 6 18" }),
      /* @__PURE__ */ u4("path", { d: "m6 6 12 12" })
    ] });
  }
  function Check({ size: size2 = 16, class: cls } = {}) {
    return /* @__PURE__ */ u4("svg", { ...svgProps(size2, cls), children: /* @__PURE__ */ u4("path", { d: "M20 6 9 17l-5-5" }) });
  }
  function ChevronDown({ size: size2 = 16, class: cls } = {}) {
    return /* @__PURE__ */ u4("svg", { ...svgProps(size2, cls), children: /* @__PURE__ */ u4("path", { d: "m6 9 6 6 6-6" }) });
  }
  function ChevronUp({ size: size2 = 16, class: cls } = {}) {
    return /* @__PURE__ */ u4("svg", { ...svgProps(size2, cls), children: /* @__PURE__ */ u4("path", { d: "m18 15-6-6-6 6" }) });
  }
  function ChevronRight({ size: size2 = 16, class: cls } = {}) {
    return /* @__PURE__ */ u4("svg", { ...svgProps(size2, cls), children: /* @__PURE__ */ u4("path", { d: "m9 18 6-6-6-6" }) });
  }
  function BoxShadow({ size: size2 = 16, class: cls } = {}) {
    return /* @__PURE__ */ u4("svg", { ...svgProps(size2, cls), children: [
      /* @__PURE__ */ u4("rect", { x: "7", y: "6", width: "14", height: "12", rx: "2", "stroke-width": "1.5" }),
      /* @__PURE__ */ u4("rect", { x: "3", y: "2", width: "14", height: "12", rx: "2" })
    ] });
  }
  function AlignLeft({ size: size2 = 16, class: cls } = {}) {
    return /* @__PURE__ */ u4("svg", { ...svgProps(size2, cls), children: [
      /* @__PURE__ */ u4("path", { d: "M21 5H3" }),
      /* @__PURE__ */ u4("path", { d: "M15 12H3" }),
      /* @__PURE__ */ u4("path", { d: "M17 19H3" })
    ] });
  }
  function AlignCenter({ size: size2 = 16, class: cls } = {}) {
    return /* @__PURE__ */ u4("svg", { ...svgProps(size2, cls), children: [
      /* @__PURE__ */ u4("path", { d: "M21 5H3" }),
      /* @__PURE__ */ u4("path", { d: "M17 12H7" }),
      /* @__PURE__ */ u4("path", { d: "M19 19H5" })
    ] });
  }
  function AlignRight({ size: size2 = 16, class: cls } = {}) {
    return /* @__PURE__ */ u4("svg", { ...svgProps(size2, cls), children: [
      /* @__PURE__ */ u4("path", { d: "M21 5H3" }),
      /* @__PURE__ */ u4("path", { d: "M21 12H9" }),
      /* @__PURE__ */ u4("path", { d: "M21 19H7" })
    ] });
  }
  function Lock({ size: size2 = 16, class: cls } = {}) {
    return /* @__PURE__ */ u4("svg", { ...svgProps(size2, cls), children: [
      /* @__PURE__ */ u4("rect", { width: "18", height: "11", x: "3", y: "11", rx: "2", ry: "2" }),
      /* @__PURE__ */ u4("path", { d: "M7 11V7a5 5 0 0 1 10 0v4" })
    ] });
  }
  function LockOpen({ size: size2 = 16, class: cls } = {}) {
    return /* @__PURE__ */ u4("svg", { ...svgProps(size2, cls), children: [
      /* @__PURE__ */ u4("rect", { width: "18", height: "11", x: "3", y: "11", rx: "2", ry: "2" }),
      /* @__PURE__ */ u4("path", { d: "M7 11V7a5 5 0 0 1 9.9-1" })
    ] });
  }
  function GripVertical({ size: size2 = 16, class: cls } = {}) {
    return /* @__PURE__ */ u4("svg", { ...svgProps(size2, cls), children: [
      /* @__PURE__ */ u4("circle", { cx: "9", cy: "12", r: "1" }),
      /* @__PURE__ */ u4("circle", { cx: "9", cy: "5", r: "1" }),
      /* @__PURE__ */ u4("circle", { cx: "9", cy: "19", r: "1" }),
      /* @__PURE__ */ u4("circle", { cx: "15", cy: "12", r: "1" }),
      /* @__PURE__ */ u4("circle", { cx: "15", cy: "5", r: "1" }),
      /* @__PURE__ */ u4("circle", { cx: "15", cy: "19", r: "1" })
    ] });
  }
  function MousePointer2({ size: size2 = 16, class: cls } = {}) {
    return /* @__PURE__ */ u4("svg", { ...svgProps(size2, cls), children: /* @__PURE__ */ u4("path", { d: "M4.037 4.688a.495.495 0 0 1 .651-.651l16 6.5a.5.5 0 0 1-.063.947l-6.124 1.58a2 2 0 0 0-1.438 1.435l-1.579 6.126a.5.5 0 0 1-.947.063z" }) });
  }
  function MessageSquare({ size: size2 = 16, class: cls } = {}) {
    return /* @__PURE__ */ u4("svg", { ...svgProps(size2, cls), children: /* @__PURE__ */ u4("path", { d: "M22 17a2 2 0 0 1-2 2H6.828a2 2 0 0 0-1.414.586l-2.202 2.202A.71.71 0 0 1 2 21.286V5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2z" }) });
  }
  function Sun({ size: size2 = 16, class: cls } = {}) {
    return /* @__PURE__ */ u4("svg", { ...svgProps(size2, cls), children: [
      /* @__PURE__ */ u4("circle", { cx: "12", cy: "12", r: "4" }),
      /* @__PURE__ */ u4("path", { d: "M12 2v2" }),
      /* @__PURE__ */ u4("path", { d: "M12 20v2" }),
      /* @__PURE__ */ u4("path", { d: "m4.93 4.93 1.41 1.41" }),
      /* @__PURE__ */ u4("path", { d: "m17.66 17.66 1.41 1.41" }),
      /* @__PURE__ */ u4("path", { d: "M2 12h2" }),
      /* @__PURE__ */ u4("path", { d: "M20 12h2" }),
      /* @__PURE__ */ u4("path", { d: "m6.34 17.66-1.41 1.41" }),
      /* @__PURE__ */ u4("path", { d: "m19.07 4.93-1.41 1.41" })
    ] });
  }
  function Moon({ size: size2 = 16, class: cls } = {}) {
    return /* @__PURE__ */ u4("svg", { ...svgProps(size2, cls), children: /* @__PURE__ */ u4("path", { d: "M20.985 12.486a9 9 0 1 1-9.473-9.472c.405-.022.617.46.402.803a6 6 0 0 0 8.268 8.268c.344-.215.825-.004.803.401" }) });
  }
  function Monitor({ size: size2 = 16, class: cls } = {}) {
    return /* @__PURE__ */ u4("svg", { ...svgProps(size2, cls), children: [
      /* @__PURE__ */ u4("rect", { width: "20", height: "14", x: "2", y: "3", rx: "2" }),
      /* @__PURE__ */ u4("line", { x1: "8", x2: "16", y1: "21", y2: "21" }),
      /* @__PURE__ */ u4("line", { x1: "12", x2: "12", y1: "17", y2: "21" })
    ] });
  }
  function TriangleAlert({ size: size2 = 16, class: cls } = {}) {
    return /* @__PURE__ */ u4("svg", { ...svgProps(size2, cls), children: [
      /* @__PURE__ */ u4("path", { d: "m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3" }),
      /* @__PURE__ */ u4("path", { d: "M12 9v4" }),
      /* @__PURE__ */ u4("path", { d: "M12 17h.01" })
    ] });
  }
  function Baseline({ size: size2 = 16, class: cls } = {}) {
    return /* @__PURE__ */ u4("svg", { ...svgProps(size2, cls), children: [
      /* @__PURE__ */ u4("path", { d: "M4 20h16" }),
      /* @__PURE__ */ u4("path", { d: "m6 16 6-12 6 12" }),
      /* @__PURE__ */ u4("path", { d: "M8 12h8" })
    ] });
  }
  function Type({ size: size2 = 16, class: cls } = {}) {
    return /* @__PURE__ */ u4("svg", { ...svgProps(size2, cls), children: [
      /* @__PURE__ */ u4("path", { d: "M12 4v16" }),
      /* @__PURE__ */ u4("path", { d: "M4 7V5a1 1 0 0 1 1-1h14a1 1 0 0 1 1 1v2" }),
      /* @__PURE__ */ u4("path", { d: "M9 20h6" })
    ] });
  }
  function LineHeightIcon({ size: size2 = 16, class: cls } = {}) {
    return /* @__PURE__ */ u4("svg", { ...svgProps(size2, cls), children: [
      /* @__PURE__ */ u4("path", { d: "M4 5h16" }),
      /* @__PURE__ */ u4("path", { d: "M4 19h16" }),
      /* @__PURE__ */ u4("path", { d: "M8 16 L12 7 L16 16" }),
      /* @__PURE__ */ u4("path", { d: "M9.5 13 H14.5" })
    ] });
  }
  function LetterSpacingIcon({ size: size2 = 16, class: cls } = {}) {
    return /* @__PURE__ */ u4("svg", { ...svgProps(size2, cls), children: [
      /* @__PURE__ */ u4("path", { d: "M4 5 V 19" }),
      /* @__PURE__ */ u4("path", { d: "M20 5 V 19" }),
      /* @__PURE__ */ u4("path", { d: "M8 17 L12 8 L16 17" }),
      /* @__PURE__ */ u4("path", { d: "M9.5 14 H14.5" })
    ] });
  }
  function SwatchBook({ size: size2 = 16, class: cls } = {}) {
    return /* @__PURE__ */ u4("svg", { ...svgProps(size2, cls), children: [
      /* @__PURE__ */ u4("path", { d: "M11 17a4 4 0 0 1-8 0V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2z" }),
      /* @__PURE__ */ u4("path", { d: "M16.7 13H19a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2H7" }),
      /* @__PURE__ */ u4("path", { d: "M10.9 7.114l1.515-1.515a2 2 0 0 1 2.828 0l2.829 2.829a2 2 0 0 1 0 2.828l-7.071 7.071" }),
      /* @__PURE__ */ u4("path", { d: "M7 17h.01" })
    ] });
  }
  function ArrowUpFromLine({ size: size2 = 16, class: cls } = {}) {
    return /* @__PURE__ */ u4("svg", { ...svgProps(size2, cls), children: [
      /* @__PURE__ */ u4("path", { d: "m18 9-6-6-6 6" }),
      /* @__PURE__ */ u4("path", { d: "M12 3v14" }),
      /* @__PURE__ */ u4("path", { d: "M5 21h14" })
    ] });
  }
  function AlignCenterVertical({ size: size2 = 16, class: cls } = {}) {
    return /* @__PURE__ */ u4("svg", { ...svgProps(size2, cls), children: [
      /* @__PURE__ */ u4("path", { d: "M12 2v20" }),
      /* @__PURE__ */ u4("path", { d: "M8 10H4a2 2 0 0 1-2-2V6c0-1.1.9-2 2-2h4" }),
      /* @__PURE__ */ u4("path", { d: "M16 10h4a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-4" }),
      /* @__PURE__ */ u4("path", { d: "M8 20H7a2 2 0 0 1-2-2v-2c0-1.1.9-2 2-2h1" }),
      /* @__PURE__ */ u4("path", { d: "M16 14h1a2 2 0 0 1 2 2v2a2 2 0 0 1-2 2h-1" })
    ] });
  }
  function ArrowDownToLine({ size: size2 = 16, class: cls } = {}) {
    return /* @__PURE__ */ u4("svg", { ...svgProps(size2, cls), children: [
      /* @__PURE__ */ u4("path", { d: "M12 17V3" }),
      /* @__PURE__ */ u4("path", { d: "m6 11 6 6 6-6" }),
      /* @__PURE__ */ u4("path", { d: "M19 21H5" })
    ] });
  }

  // src/browser/components/PanelHeader.tsx
  var THEME_OPTIONS = [
    {
      value: "light",
      label: "Light",
      title: "Light theme",
      icon: Sun
    },
    {
      value: "dark",
      label: "Dark",
      title: "Dark theme",
      icon: Moon
    },
    {
      value: "system",
      label: "System",
      title: "Match system theme",
      icon: Monitor
    }
  ];
  function ThemeDropdown({
    value,
    onChange
  }) {
    let [open, setOpen] = d2(!1), rootRef = A2(null), triggerRef = A2(null), optionRefs = A2(/* @__PURE__ */ new Map()), selected = THEME_OPTIONS.find((option) => option.value === value) ?? THEME_OPTIONS[2], SelectedIcon = selected.icon, close = q2(() => setOpen(!1), []), focusSelectedOption = q2(() => {
      let fallback = THEME_OPTIONS[0] ? optionRefs.current.get(THEME_OPTIONS[0].value) : null;
      (optionRefs.current.get(selected.value) ?? fallback)?.focus();
    }, [selected.value]), handleSelect = q2(
      (next) => {
        onChange(next), close(), triggerRef.current?.focus();
      },
      [onChange, close]
    );
    y2(() => {
      if (open)
        return registerPopoverDismiss(close);
    }, [open, close]), _2(() => {
      open && focusSelectedOption();
    }, [open, focusSelectedOption]), y2(() => {
      if (!open) return;
      let root = rootRef.current;
      if (!root) return;
      let handleFocusOut = (event) => {
        let next = event.relatedTarget;
        next instanceof Node && root.contains(next) || close();
      };
      return root.addEventListener("focusout", handleFocusOut), () => root.removeEventListener("focusout", handleFocusOut);
    }, [open, close]);
    let handleTriggerKeyDown = q2(
      (event) => {
        event.key === "ArrowDown" || event.key === "Enter" || event.key === " " ? (event.preventDefault(), event.stopPropagation(), open ? focusSelectedOption() : setOpen(!0)) : event.key === "Escape" && open && (event.preventDefault(), event.stopPropagation(), close());
      },
      [open, close, focusSelectedOption]
    ), handleMenuKeyDown = q2(
      (event) => {
        if (event.key === "Escape") {
          event.preventDefault(), event.stopPropagation(), close(), triggerRef.current?.focus();
          return;
        }
        let currentIndex = THEME_OPTIONS.findIndex((option) => optionRefs.current.get(option.value) === document.activeElement);
        if (!(currentIndex < 0) && (event.key === "ArrowDown" || event.key === "ArrowUp" || event.key === "Home" || event.key === "End")) {
          event.preventDefault(), event.stopPropagation();
          let nextIndex = currentIndex;
          event.key === "ArrowDown" && (nextIndex = Math.min(currentIndex + 1, THEME_OPTIONS.length - 1)), event.key === "ArrowUp" && (nextIndex = Math.max(currentIndex - 1, 0)), event.key === "Home" && (nextIndex = 0), event.key === "End" && (nextIndex = THEME_OPTIONS.length - 1), optionRefs.current.get(THEME_OPTIONS[nextIndex].value)?.focus();
        }
      },
      [close]
    );
    return /* @__PURE__ */ u4("div", { ref: rootRef, class: "cortex-theme-dropdown", children: [
      /* @__PURE__ */ u4(
        "button",
        {
          ref: triggerRef,
          type: "button",
          class: "cortex-theme-dropdown__trigger",
          "data-action": "theme",
          "data-tooltip": selected.title,
          "aria-label": `Theme: ${selected.label}`,
          "aria-haspopup": "menu",
          "aria-expanded": open ? "true" : "false",
          onClick: () => setOpen((v3) => !v3),
          onKeyDown: handleTriggerKeyDown,
          children: [
            /* @__PURE__ */ u4(SelectedIcon, { size: 12 }),
            /* @__PURE__ */ u4(ChevronDown, { size: 10 })
          ]
        }
      ),
      open && /* @__PURE__ */ u4(k, { children: [
        /* @__PURE__ */ u4(
          "div",
          {
            class: "cortex-theme-dropdown__backdrop",
            "aria-hidden": "true",
            onClick: () => setOpen(!1)
          }
        ),
        /* @__PURE__ */ u4(
          "div",
          {
            class: "cortex-theme-dropdown__menu",
            role: "menu",
            "aria-label": "Theme",
            onKeyDown: handleMenuKeyDown,
            children: THEME_OPTIONS.map((option) => {
              let OptionIcon = option.icon;
              return /* @__PURE__ */ u4(
                "button",
                {
                  type: "button",
                  class: `cortex-theme-dropdown__option${option.value === value ? " cortex-theme-dropdown__option--selected" : ""}`,
                  "data-theme-option": option.value,
                  role: "menuitemradio",
                  "aria-checked": option.value === value ? "true" : "false",
                  ref: (node) => {
                    node ? optionRefs.current.set(option.value, node) : optionRefs.current.delete(option.value);
                  },
                  onClick: () => handleSelect(option.value),
                  children: [
                    /* @__PURE__ */ u4("span", { class: "cortex-theme-dropdown__option-icon", children: /* @__PURE__ */ u4(OptionIcon, { size: 12 }) }),
                    /* @__PURE__ */ u4("span", { class: "cortex-theme-dropdown__option-label", children: option.label }),
                    option.value === value && /* @__PURE__ */ u4(Check, { size: 12 })
                  ]
                },
                option.value
              );
            })
          }
        )
      ] })
    ] });
  }
  function PanelHeader({
    tagName,
    componentName,
    sourceFile,
    sourceLine,
    filePath,
    onClose,
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onPointerCancel,
    hasBefore,
    hasAfter,
    activePseudo = "element",
    onPseudoChange,
    isLibrary,
    ancestorSource,
    ancestorLine,
    bufferSize,
    onApply,
    onApplyError
  }) {
    let [delivering, setDelivering] = d2(!1), [pendingClaude, setPendingClaude] = d2(!1), mountedRef = A2(!0);
    _2(() => () => {
      mountedRef.current = !1;
    }, []), y2(() => {
      bufferSize === 0 && pendingClaude && setPendingClaude(!1);
    }, [bufferSize, pendingClaude]);
    let handleApply = () => {
      if (delivering) return;
      setDelivering(!0);
      let promise;
      try {
        promise = onApply();
      } catch (err) {
        mountedRef.current && setDelivering(!1), onApplyError?.(err);
        return;
      }
      promise.then(
        () => {
          mountedRef.current && (setDelivering(!1), setPendingClaude(!0));
        },
        (err) => {
          mountedRef.current && setDelivering(!1), onApplyError?.(err);
        }
      );
    }, displaySource = isLibrary && ancestorSource ? ancestorSource : sourceFile, displayLine = isLibrary && ancestorSource ? ancestorLine ?? null : sourceLine, sourceText = displaySource ? displayLine ? `${displaySource}:${displayLine}` : displaySource : null, sourceHref = filePath ? `vscode://file/${encodeFilePath(filePath)}${sourceLine ? `:${sourceLine}` : ""}` : null, displayTag = isLibrary && ancestorSource ? `<${tagName}>` : componentName ?? `<${tagName}>`, [themePref, setThemePref] = d2(getThemePreference()), handleThemeChange = (pref) => {
      setThemePref(pref), setThemePreference(pref);
    }, showPseudoTabs = hasBefore || hasAfter;
    return /* @__PURE__ */ u4(
      "div",
      {
        class: "cortex-panel-header",
        onPointerDown,
        onPointerMove,
        onPointerUp,
        onPointerCancel,
        children: [
          /* @__PURE__ */ u4("div", { class: "cortex-panel-header__info", children: [
            /* @__PURE__ */ u4("span", { class: "cortex-panel-header__tag", children: displayTag }),
            sourceText && sourceHref && /* @__PURE__ */ u4(
              "a",
              {
                class: "cortex-panel-header__source",
                href: sourceHref,
                "data-tooltip": `Open in editor: ${sourceText}`,
                children: sourceText
              }
            ),
            isLibrary && /* @__PURE__ */ u4("span", { class: "cortex-panel-header__library", children: "(library)" })
          ] }),
          /* @__PURE__ */ u4("div", { class: "cortex-panel-header__actions", children: [
            /* @__PURE__ */ u4(ThemeDropdown, { value: themePref, onChange: handleThemeChange }),
            bufferSize > 0 && !pendingClaude && /* @__PURE__ */ u4(
              "button",
              {
                class: "cortex-panel-header__btn cortex-panel-header__btn--apply",
                "data-action": "apply",
                "data-tooltip": delivering ? "Sending staged edits to Claude\u2026" : `Apply ${bufferSize} staged edit${bufferSize === 1 ? "" : "s"}`,
                "aria-label": delivering ? "Delivering staged edits" : `Apply ${bufferSize} staged edit${bufferSize === 1 ? "" : "s"}`,
                "aria-busy": delivering ? "true" : void 0,
                disabled: delivering,
                onClick: handleApply,
                children: delivering ? "Delivering\u2026" : `Apply (${bufferSize})`
              }
            ),
            /* @__PURE__ */ u4(
              "button",
              {
                class: "cortex-panel-header__btn cortex-panel-header__btn--close",
                "data-action": "close",
                "data-tooltip": "Close panel",
                "aria-label": "Close panel",
                onClick: onClose,
                children: /* @__PURE__ */ u4(X, { size: 14 })
              }
            )
          ] }),
          showPseudoTabs && /* @__PURE__ */ u4(
            "div",
            {
              class: "cortex-pseudo-tabs",
              role: "tablist",
              "aria-label": "Element pseudo-elements",
              onKeyDown: (e4) => {
                if (e4.key !== "ArrowLeft" && e4.key !== "ArrowRight") return;
                e4.preventDefault();
                let tabs = ["element"];
                hasBefore && tabs.push("::before"), hasAfter && tabs.push("::after");
                let idx = tabs.indexOf(activePseudo), nextIdx = e4.key === "ArrowRight" ? (idx + 1) % tabs.length : (idx - 1 + tabs.length) % tabs.length, next = tabs[nextIdx];
                next && onPseudoChange?.(next), e4.currentTarget.querySelector(`[data-pseudo="${next}"]`)?.focus();
              },
              children: [
                /* @__PURE__ */ u4(
                  "button",
                  {
                    class: `cortex-pseudo-tab${activePseudo === "element" ? " cortex-pseudo-tab--active" : ""}`,
                    role: "tab",
                    "aria-selected": activePseudo === "element",
                    tabIndex: activePseudo === "element" ? 0 : -1,
                    "data-action": "pseudo-element",
                    "data-pseudo": "element",
                    onClick: () => onPseudoChange?.("element"),
                    children: "element"
                  }
                ),
                hasBefore && /* @__PURE__ */ u4(
                  "button",
                  {
                    class: `cortex-pseudo-tab${activePseudo === "::before" ? " cortex-pseudo-tab--active" : ""}`,
                    role: "tab",
                    "aria-selected": activePseudo === "::before",
                    tabIndex: activePseudo === "::before" ? 0 : -1,
                    "data-action": "pseudo-before",
                    "data-pseudo": "::before",
                    onClick: () => onPseudoChange?.("::before"),
                    children: "::before"
                  }
                ),
                hasAfter && /* @__PURE__ */ u4(
                  "button",
                  {
                    class: `cortex-pseudo-tab${activePseudo === "::after" ? " cortex-pseudo-tab--active" : ""}`,
                    role: "tab",
                    "aria-selected": activePseudo === "::after",
                    tabIndex: activePseudo === "::after" ? 0 : -1,
                    "data-action": "pseudo-after",
                    "data-pseudo": "::after",
                    onClick: () => onPseudoChange?.("::after"),
                    children: "::after"
                  }
                )
              ]
            }
          )
        ]
      }
    );
  }

  // src/browser/components/LayerTree.tsx
  function buildScopedTree(element) {
    if (!element || !element.isConnected || !document.body.contains(element)) return null;
    let ancestors = [], current = element;
    for (; current && current !== document.body; )
      ancestors.unshift(current), current = current.parentElement;
    function leafNode(c4, depth) {
      let childCount = Array.from(c4.children).filter((ch) => ch instanceof HTMLElement).length;
      return { element: c4, label: getTreeLabel(c4), depth, selected: !1, expanded: !1, hasChildren: childCount > 0, children: [] };
    }
    function buildNode(el, depth, isOnPath) {
      let isSelected = el === element, pathChild = ancestors[depth], children = [];
      isSelected ? children = Array.from(el.children).filter((c4) => c4 instanceof HTMLElement).map((c4) => leafNode(c4, depth + 1)) : isOnPath && pathChild && (children = Array.from(el.children).filter((c4) => c4 instanceof HTMLElement).map((c4) => c4 === pathChild ? buildNode(c4, depth + 1, !0) : leafNode(c4, depth + 1)));
      let childCount = Array.from(el.children).filter((c4) => c4 instanceof HTMLElement).length;
      return {
        element: el,
        label: getTreeLabel(el),
        depth,
        selected: isSelected,
        expanded: isSelected || isOnPath,
        hasChildren: childCount > 0,
        children
      };
    }
    return buildNode(document.body, 0, !0);
  }
  function TreeNodeRow({ node, onSelectElement }) {
    let [collapsed, setCollapsed] = d2(!1), hasChildren = node.hasChildren, showChildren = node.children.length > 0 && node.expanded && !collapsed;
    return /* @__PURE__ */ u4(k, { children: [
      /* @__PURE__ */ u4(
        "div",
        {
          class: `cortex-layer-node${node.selected ? " cortex-layer-node--selected" : ""}`,
          style: { paddingLeft: `${node.depth * 12 + 8}px` },
          onClick: (e4) => {
            e4.stopPropagation(), onSelectElement(node.element, e4);
          },
          children: [
            hasChildren ? /* @__PURE__ */ u4(
              "span",
              {
                class: `cortex-layer-chevron${showChildren ? " cortex-layer-chevron--expanded" : ""}`,
                onClick: (e4) => {
                  e4.stopPropagation(), node.expanded ? setCollapsed((c4) => !c4) : onSelectElement(node.element);
                },
                children: /* @__PURE__ */ u4(ChevronRight, { size: 8 })
              }
            ) : /* @__PURE__ */ u4("span", { class: "cortex-layer-chevron-spacer" }),
            /* @__PURE__ */ u4("span", { class: "cortex-layer-label", children: node.label })
          ]
        }
      ),
      showChildren && node.children.map((child, i4) => /* @__PURE__ */ u4(TreeNodeRow, { node: child, onSelectElement }, `${child.depth}-${i4}`))
    ] });
  }
  var DEFAULT_LAYER_HEIGHT = 160, MIN_LAYER_HEIGHT = 60;
  function LayerTree({ element, onSelectElement, height, hmrAppliedVersion = 0 }) {
    let tree = T2(() => buildScopedTree(element), [element, hmrAppliedVersion]);
    return tree ? /* @__PURE__ */ u4("div", { class: "cortex-layer-tree", style: { height: `${height}px` }, children: /* @__PURE__ */ u4("div", { class: "cortex-layer-tree__scroll", children: /* @__PURE__ */ u4(TreeNodeRow, { node: tree, onSelectElement }, element) }) }) : null;
  }

  // src/browser/components/sections/ElementTree.tsx
  function ElementTree({ element, onSelectElements, height, hmrAppliedVersion }) {
    return /* @__PURE__ */ u4("div", { class: "cortex-element-tree", children: /* @__PURE__ */ u4(
      LayerTree,
      {
        element,
        onSelectElement: (el, ev) => {
          let action = ev?.shiftKey ? "add" : ev?.metaKey || ev?.ctrlKey ? "toggle" : "replace";
          onSelectElements([el], action);
        },
        height,
        hmrAppliedVersion
      }
    ) });
  }

  // src/browser/components/sections/types.ts
  function isDimmed(dimmedProperties, ...props) {
    return dimmedProperties ? props.some((p3) => dimmedProperties.has(p3)) : !1;
  }

  // src/browser/components/controls/SegmentedControl.tsx
  function SegmentedControl({
    options,
    value,
    onChange,
    size: size2 = "md",
    mixed,
    disabled,
    disabledTooltip
  }) {
    let trackRef = A2(null), indicatorRef = A2(null);
    y2(() => {
      let track = trackRef.current, indicator = indicatorRef.current;
      if (!track || !indicator) return;
      if (disabled || mixed) {
        indicator.style.width = "0", indicator.style.opacity = "0";
        return;
      }
      let activeBtn = track.querySelector(`[data-value="${CSS.escape(value)}"]`);
      activeBtn ? (indicator.style.transform = `translateX(${activeBtn.offsetLeft}px)`, indicator.style.width = `${activeBtn.offsetWidth}px`, indicator.style.opacity = "1") : (indicator.style.width = "0", indicator.style.opacity = "0");
    }, [value, mixed, disabled]);
    let handleClick = q2(
      (optValue) => {
        disabled || (mixed || optValue !== value) && onChange(optValue);
      },
      [disabled, mixed, value, onChange]
    ), hasActiveOption = options.some((opt) => opt.value === value), handleKeyDown = q2(
      (e4) => {
        let targetValue = e4.target?.getAttribute("data-value");
        if (disabled) return;
        let focusedIdx = targetValue ? options.findIndex((o4) => o4.value === targetValue) : -1, idx = mixed || !hasActiveOption ? focusedIdx >= 0 ? focusedIdx : 0 : options.findIndex((o4) => o4.value === value);
        if (idx === -1) return;
        let next = -1;
        e4.key === "ArrowRight" || e4.key === "ArrowDown" ? (e4.preventDefault(), next = (idx + 1) % options.length) : (e4.key === "ArrowLeft" || e4.key === "ArrowUp") && (e4.preventDefault(), next = (idx - 1 + options.length) % options.length);
        let target = next >= 0 ? options[next] : void 0;
        target && onChange(target.value);
      },
      [disabled, options, value, mixed, hasActiveOption, onChange]
    );
    return /* @__PURE__ */ u4(
      "div",
      {
        ref: trackRef,
        class: `cortex-segmented${size2 === "sm" ? " cortex-segmented--sm" : ""}${mixed ? " cortex-segmented--mixed" : ""}${disabled ? " cortex-segmented--disabled" : ""}`,
        role: "radiogroup",
        "aria-disabled": disabled ? "true" : void 0,
        onKeyDown: handleKeyDown,
        children: [
          /* @__PURE__ */ u4("div", { ref: indicatorRef, class: "cortex-segmented__indicator" }),
          mixed && /* @__PURE__ */ u4("span", { class: "cortex-segmented__mixed-label", children: "Mixed" }),
          options.map((opt, index) => {
            let isActive = !mixed && opt.value === value;
            return /* @__PURE__ */ u4(
              "button",
              {
                class: `cortex-segmented__option${isActive ? " cortex-segmented__option--active" : ""}`,
                type: "button",
                role: "radio",
                "aria-checked": isActive ? "true" : "false",
                tabIndex: disabled || mixed || !hasActiveOption ? index === 0 ? 0 : -1 : isActive ? 0 : -1,
                "aria-disabled": disabled ? "true" : void 0,
                "aria-label": opt.label ? void 0 : opt.title,
                "data-tooltip": disabled ? disabledTooltip ?? opt.title : opt.title,
                "data-value": opt.value,
                onClick: () => handleClick(opt.value),
                children: [
                  opt.icon && /* @__PURE__ */ u4("span", { class: "cortex-segmented__icon", children: opt.icon }),
                  opt.label && /* @__PURE__ */ u4("span", { class: "cortex-segmented__label", children: opt.label })
                ]
              },
              opt.value
            );
          })
        ]
      }
    );
  }

  // src/browser/tokens/family.ts
  var SPACING_PATTERN = /^--(spacing|sp|gap|space)-\S*$/;
  function matchesSpacingPattern(name) {
    return SPACING_PATTERN.test(name);
  }

  // src/browser/tokens/TokenContext.ts
  var SpacingTokensContext = R([]);

  // node_modules/@floating-ui/utils/dist/floating-ui.utils.mjs
  var min = Math.min, max = Math.max, round = Math.round, floor = Math.floor, createCoords = (v3) => ({
    x: v3,
    y: v3
  }), oppositeSideMap = {
    left: "right",
    right: "left",
    bottom: "top",
    top: "bottom"
  };
  function clamp2(start, value, end) {
    return max(start, min(value, end));
  }
  function evaluate(value, param) {
    return typeof value == "function" ? value(param) : value;
  }
  function getSide(placement) {
    return placement.split("-")[0];
  }
  function getAlignment(placement) {
    return placement.split("-")[1];
  }
  function getOppositeAxis(axis) {
    return axis === "x" ? "y" : "x";
  }
  function getAxisLength(axis) {
    return axis === "y" ? "height" : "width";
  }
  function getSideAxis(placement) {
    let firstChar = placement[0];
    return firstChar === "t" || firstChar === "b" ? "y" : "x";
  }
  function getAlignmentAxis(placement) {
    return getOppositeAxis(getSideAxis(placement));
  }
  function getAlignmentSides(placement, rects, rtl) {
    rtl === void 0 && (rtl = !1);
    let alignment = getAlignment(placement), alignmentAxis = getAlignmentAxis(placement), length = getAxisLength(alignmentAxis), mainAlignmentSide = alignmentAxis === "x" ? alignment === (rtl ? "end" : "start") ? "right" : "left" : alignment === "start" ? "bottom" : "top";
    return rects.reference[length] > rects.floating[length] && (mainAlignmentSide = getOppositePlacement(mainAlignmentSide)), [mainAlignmentSide, getOppositePlacement(mainAlignmentSide)];
  }
  function getExpandedPlacements(placement) {
    let oppositePlacement = getOppositePlacement(placement);
    return [getOppositeAlignmentPlacement(placement), oppositePlacement, getOppositeAlignmentPlacement(oppositePlacement)];
  }
  function getOppositeAlignmentPlacement(placement) {
    return placement.includes("start") ? placement.replace("start", "end") : placement.replace("end", "start");
  }
  var lrPlacement = ["left", "right"], rlPlacement = ["right", "left"], tbPlacement = ["top", "bottom"], btPlacement = ["bottom", "top"];
  function getSideList(side, isStart, rtl) {
    switch (side) {
      case "top":
      case "bottom":
        return rtl ? isStart ? rlPlacement : lrPlacement : isStart ? lrPlacement : rlPlacement;
      case "left":
      case "right":
        return isStart ? tbPlacement : btPlacement;
      default:
        return [];
    }
  }
  function getOppositeAxisPlacements(placement, flipAlignment, direction, rtl) {
    let alignment = getAlignment(placement), list = getSideList(getSide(placement), direction === "start", rtl);
    return alignment && (list = list.map((side) => side + "-" + alignment), flipAlignment && (list = list.concat(list.map(getOppositeAlignmentPlacement)))), list;
  }
  function getOppositePlacement(placement) {
    let side = getSide(placement);
    return oppositeSideMap[side] + placement.slice(side.length);
  }
  function expandPaddingObject(padding) {
    return {
      top: 0,
      right: 0,
      bottom: 0,
      left: 0,
      ...padding
    };
  }
  function getPaddingObject(padding) {
    return typeof padding != "number" ? expandPaddingObject(padding) : {
      top: padding,
      right: padding,
      bottom: padding,
      left: padding
    };
  }
  function rectToClientRect(rect) {
    let {
      x: x3,
      y: y3,
      width,
      height
    } = rect;
    return {
      width,
      height,
      top: y3,
      left: x3,
      right: x3 + width,
      bottom: y3 + height,
      x: x3,
      y: y3
    };
  }

  // node_modules/@floating-ui/core/dist/floating-ui.core.mjs
  function computeCoordsFromPlacement(_ref, placement, rtl) {
    let {
      reference,
      floating
    } = _ref, sideAxis = getSideAxis(placement), alignmentAxis = getAlignmentAxis(placement), alignLength = getAxisLength(alignmentAxis), side = getSide(placement), isVertical = sideAxis === "y", commonX = reference.x + reference.width / 2 - floating.width / 2, commonY = reference.y + reference.height / 2 - floating.height / 2, commonAlign = reference[alignLength] / 2 - floating[alignLength] / 2, coords;
    switch (side) {
      case "top":
        coords = {
          x: commonX,
          y: reference.y - floating.height
        };
        break;
      case "bottom":
        coords = {
          x: commonX,
          y: reference.y + reference.height
        };
        break;
      case "right":
        coords = {
          x: reference.x + reference.width,
          y: commonY
        };
        break;
      case "left":
        coords = {
          x: reference.x - floating.width,
          y: commonY
        };
        break;
      default:
        coords = {
          x: reference.x,
          y: reference.y
        };
    }
    switch (getAlignment(placement)) {
      case "start":
        coords[alignmentAxis] -= commonAlign * (rtl && isVertical ? -1 : 1);
        break;
      case "end":
        coords[alignmentAxis] += commonAlign * (rtl && isVertical ? -1 : 1);
        break;
    }
    return coords;
  }
  async function detectOverflow(state, options) {
    var _await$platform$isEle;
    options === void 0 && (options = {});
    let {
      x: x3,
      y: y3,
      platform: platform2,
      rects,
      elements,
      strategy
    } = state, {
      boundary = "clippingAncestors",
      rootBoundary = "viewport",
      elementContext = "floating",
      altBoundary = !1,
      padding = 0
    } = evaluate(options, state), paddingObject = getPaddingObject(padding), element = elements[altBoundary ? elementContext === "floating" ? "reference" : "floating" : elementContext], clippingClientRect = rectToClientRect(await platform2.getClippingRect({
      element: (_await$platform$isEle = await (platform2.isElement == null ? void 0 : platform2.isElement(element))) == null || _await$platform$isEle ? element : element.contextElement || await (platform2.getDocumentElement == null ? void 0 : platform2.getDocumentElement(elements.floating)),
      boundary,
      rootBoundary,
      strategy
    })), rect = elementContext === "floating" ? {
      x: x3,
      y: y3,
      width: rects.floating.width,
      height: rects.floating.height
    } : rects.reference, offsetParent = await (platform2.getOffsetParent == null ? void 0 : platform2.getOffsetParent(elements.floating)), offsetScale = await (platform2.isElement == null ? void 0 : platform2.isElement(offsetParent)) ? await (platform2.getScale == null ? void 0 : platform2.getScale(offsetParent)) || {
      x: 1,
      y: 1
    } : {
      x: 1,
      y: 1
    }, elementClientRect = rectToClientRect(platform2.convertOffsetParentRelativeRectToViewportRelativeRect ? await platform2.convertOffsetParentRelativeRectToViewportRelativeRect({
      elements,
      rect,
      offsetParent,
      strategy
    }) : rect);
    return {
      top: (clippingClientRect.top - elementClientRect.top + paddingObject.top) / offsetScale.y,
      bottom: (elementClientRect.bottom - clippingClientRect.bottom + paddingObject.bottom) / offsetScale.y,
      left: (clippingClientRect.left - elementClientRect.left + paddingObject.left) / offsetScale.x,
      right: (elementClientRect.right - clippingClientRect.right + paddingObject.right) / offsetScale.x
    };
  }
  var MAX_RESET_COUNT = 50, computePosition = async (reference, floating, config) => {
    let {
      placement = "bottom",
      strategy = "absolute",
      middleware = [],
      platform: platform2
    } = config, platformWithDetectOverflow = platform2.detectOverflow ? platform2 : {
      ...platform2,
      detectOverflow
    }, rtl = await (platform2.isRTL == null ? void 0 : platform2.isRTL(floating)), rects = await platform2.getElementRects({
      reference,
      floating,
      strategy
    }), {
      x: x3,
      y: y3
    } = computeCoordsFromPlacement(rects, placement, rtl), statefulPlacement = placement, resetCount = 0, middlewareData = {};
    for (let i4 = 0; i4 < middleware.length; i4++) {
      let currentMiddleware = middleware[i4];
      if (!currentMiddleware)
        continue;
      let {
        name,
        fn
      } = currentMiddleware, {
        x: nextX,
        y: nextY,
        data,
        reset
      } = await fn({
        x: x3,
        y: y3,
        initialPlacement: placement,
        placement: statefulPlacement,
        strategy,
        middlewareData,
        rects,
        platform: platformWithDetectOverflow,
        elements: {
          reference,
          floating
        }
      });
      x3 = nextX ?? x3, y3 = nextY ?? y3, middlewareData[name] = {
        ...middlewareData[name],
        ...data
      }, reset && resetCount < MAX_RESET_COUNT && (resetCount++, typeof reset == "object" && (reset.placement && (statefulPlacement = reset.placement), reset.rects && (rects = reset.rects === !0 ? await platform2.getElementRects({
        reference,
        floating,
        strategy
      }) : reset.rects), {
        x: x3,
        y: y3
      } = computeCoordsFromPlacement(rects, statefulPlacement, rtl)), i4 = -1);
    }
    return {
      x: x3,
      y: y3,
      placement: statefulPlacement,
      strategy,
      middlewareData
    };
  };
  var flip = function(options) {
    return options === void 0 && (options = {}), {
      name: "flip",
      options,
      async fn(state) {
        var _middlewareData$arrow, _middlewareData$flip;
        let {
          placement,
          middlewareData,
          rects,
          initialPlacement,
          platform: platform2,
          elements
        } = state, {
          mainAxis: checkMainAxis = !0,
          crossAxis: checkCrossAxis = !0,
          fallbackPlacements: specifiedFallbackPlacements,
          fallbackStrategy = "bestFit",
          fallbackAxisSideDirection = "none",
          flipAlignment = !0,
          ...detectOverflowOptions
        } = evaluate(options, state);
        if ((_middlewareData$arrow = middlewareData.arrow) != null && _middlewareData$arrow.alignmentOffset)
          return {};
        let side = getSide(placement), initialSideAxis = getSideAxis(initialPlacement), isBasePlacement = getSide(initialPlacement) === initialPlacement, rtl = await (platform2.isRTL == null ? void 0 : platform2.isRTL(elements.floating)), fallbackPlacements = specifiedFallbackPlacements || (isBasePlacement || !flipAlignment ? [getOppositePlacement(initialPlacement)] : getExpandedPlacements(initialPlacement)), hasFallbackAxisSideDirection = fallbackAxisSideDirection !== "none";
        !specifiedFallbackPlacements && hasFallbackAxisSideDirection && fallbackPlacements.push(...getOppositeAxisPlacements(initialPlacement, flipAlignment, fallbackAxisSideDirection, rtl));
        let placements2 = [initialPlacement, ...fallbackPlacements], overflow = await platform2.detectOverflow(state, detectOverflowOptions), overflows = [], overflowsData = ((_middlewareData$flip = middlewareData.flip) == null ? void 0 : _middlewareData$flip.overflows) || [];
        if (checkMainAxis && overflows.push(overflow[side]), checkCrossAxis) {
          let sides2 = getAlignmentSides(placement, rects, rtl);
          overflows.push(overflow[sides2[0]], overflow[sides2[1]]);
        }
        if (overflowsData = [...overflowsData, {
          placement,
          overflows
        }], !overflows.every((side2) => side2 <= 0)) {
          var _middlewareData$flip2, _overflowsData$filter;
          let nextIndex = (((_middlewareData$flip2 = middlewareData.flip) == null ? void 0 : _middlewareData$flip2.index) || 0) + 1, nextPlacement = placements2[nextIndex];
          if (nextPlacement && (!(checkCrossAxis === "alignment" ? initialSideAxis !== getSideAxis(nextPlacement) : !1) || // We leave the current main axis only if every placement on that axis
          // overflows the main axis.
          overflowsData.every((d3) => getSideAxis(d3.placement) === initialSideAxis ? d3.overflows[0] > 0 : !0)))
            return {
              data: {
                index: nextIndex,
                overflows: overflowsData
              },
              reset: {
                placement: nextPlacement
              }
            };
          let resetPlacement = (_overflowsData$filter = overflowsData.filter((d3) => d3.overflows[0] <= 0).sort((a4, b) => a4.overflows[1] - b.overflows[1])[0]) == null ? void 0 : _overflowsData$filter.placement;
          if (!resetPlacement)
            switch (fallbackStrategy) {
              case "bestFit": {
                var _overflowsData$filter2;
                let placement2 = (_overflowsData$filter2 = overflowsData.filter((d3) => {
                  if (hasFallbackAxisSideDirection) {
                    let currentSideAxis = getSideAxis(d3.placement);
                    return currentSideAxis === initialSideAxis || // Create a bias to the `y` side axis due to horizontal
                    // reading directions favoring greater width.
                    currentSideAxis === "y";
                  }
                  return !0;
                }).map((d3) => [d3.placement, d3.overflows.filter((overflow2) => overflow2 > 0).reduce((acc, overflow2) => acc + overflow2, 0)]).sort((a4, b) => a4[1] - b[1])[0]) == null ? void 0 : _overflowsData$filter2[0];
                placement2 && (resetPlacement = placement2);
                break;
              }
              case "initialPlacement":
                resetPlacement = initialPlacement;
                break;
            }
          if (placement !== resetPlacement)
            return {
              reset: {
                placement: resetPlacement
              }
            };
        }
        return {};
      }
    };
  };
  var originSides = /* @__PURE__ */ new Set(["left", "top"]);
  async function convertValueToCoords(state, options) {
    let {
      placement,
      platform: platform2,
      elements
    } = state, rtl = await (platform2.isRTL == null ? void 0 : platform2.isRTL(elements.floating)), side = getSide(placement), alignment = getAlignment(placement), isVertical = getSideAxis(placement) === "y", mainAxisMulti = originSides.has(side) ? -1 : 1, crossAxisMulti = rtl && isVertical ? -1 : 1, rawValue = evaluate(options, state), {
      mainAxis,
      crossAxis,
      alignmentAxis
    } = typeof rawValue == "number" ? {
      mainAxis: rawValue,
      crossAxis: 0,
      alignmentAxis: null
    } : {
      mainAxis: rawValue.mainAxis || 0,
      crossAxis: rawValue.crossAxis || 0,
      alignmentAxis: rawValue.alignmentAxis
    };
    return alignment && typeof alignmentAxis == "number" && (crossAxis = alignment === "end" ? alignmentAxis * -1 : alignmentAxis), isVertical ? {
      x: crossAxis * crossAxisMulti,
      y: mainAxis * mainAxisMulti
    } : {
      x: mainAxis * mainAxisMulti,
      y: crossAxis * crossAxisMulti
    };
  }
  var offset = function(options) {
    return options === void 0 && (options = 0), {
      name: "offset",
      options,
      async fn(state) {
        var _middlewareData$offse, _middlewareData$arrow;
        let {
          x: x3,
          y: y3,
          placement,
          middlewareData
        } = state, diffCoords = await convertValueToCoords(state, options);
        return placement === ((_middlewareData$offse = middlewareData.offset) == null ? void 0 : _middlewareData$offse.placement) && (_middlewareData$arrow = middlewareData.arrow) != null && _middlewareData$arrow.alignmentOffset ? {} : {
          x: x3 + diffCoords.x,
          y: y3 + diffCoords.y,
          data: {
            ...diffCoords,
            placement
          }
        };
      }
    };
  }, shift = function(options) {
    return options === void 0 && (options = {}), {
      name: "shift",
      options,
      async fn(state) {
        let {
          x: x3,
          y: y3,
          placement,
          platform: platform2
        } = state, {
          mainAxis: checkMainAxis = !0,
          crossAxis: checkCrossAxis = !1,
          limiter = {
            fn: (_ref) => {
              let {
                x: x4,
                y: y4
              } = _ref;
              return {
                x: x4,
                y: y4
              };
            }
          },
          ...detectOverflowOptions
        } = evaluate(options, state), coords = {
          x: x3,
          y: y3
        }, overflow = await platform2.detectOverflow(state, detectOverflowOptions), crossAxis = getSideAxis(getSide(placement)), mainAxis = getOppositeAxis(crossAxis), mainAxisCoord = coords[mainAxis], crossAxisCoord = coords[crossAxis];
        if (checkMainAxis) {
          let minSide = mainAxis === "y" ? "top" : "left", maxSide = mainAxis === "y" ? "bottom" : "right", min2 = mainAxisCoord + overflow[minSide], max2 = mainAxisCoord - overflow[maxSide];
          mainAxisCoord = clamp2(min2, mainAxisCoord, max2);
        }
        if (checkCrossAxis) {
          let minSide = crossAxis === "y" ? "top" : "left", maxSide = crossAxis === "y" ? "bottom" : "right", min2 = crossAxisCoord + overflow[minSide], max2 = crossAxisCoord - overflow[maxSide];
          crossAxisCoord = clamp2(min2, crossAxisCoord, max2);
        }
        let limitedCoords = limiter.fn({
          ...state,
          [mainAxis]: mainAxisCoord,
          [crossAxis]: crossAxisCoord
        });
        return {
          ...limitedCoords,
          data: {
            x: limitedCoords.x - x3,
            y: limitedCoords.y - y3,
            enabled: {
              [mainAxis]: checkMainAxis,
              [crossAxis]: checkCrossAxis
            }
          }
        };
      }
    };
  };

  // node_modules/@floating-ui/utils/dist/floating-ui.utils.dom.mjs
  function hasWindow() {
    return typeof window < "u";
  }
  function getNodeName(node) {
    return isNode(node) ? (node.nodeName || "").toLowerCase() : "#document";
  }
  function getWindow(node) {
    var _node$ownerDocument;
    return (node == null || (_node$ownerDocument = node.ownerDocument) == null ? void 0 : _node$ownerDocument.defaultView) || window;
  }
  function getDocumentElement(node) {
    var _ref;
    return (_ref = (isNode(node) ? node.ownerDocument : node.document) || window.document) == null ? void 0 : _ref.documentElement;
  }
  function isNode(value) {
    return hasWindow() ? value instanceof Node || value instanceof getWindow(value).Node : !1;
  }
  function isElement(value) {
    return hasWindow() ? value instanceof Element || value instanceof getWindow(value).Element : !1;
  }
  function isHTMLElement(value) {
    return hasWindow() ? value instanceof HTMLElement || value instanceof getWindow(value).HTMLElement : !1;
  }
  function isShadowRoot(value) {
    return !hasWindow() || typeof ShadowRoot > "u" ? !1 : value instanceof ShadowRoot || value instanceof getWindow(value).ShadowRoot;
  }
  function isOverflowElement(element) {
    let {
      overflow,
      overflowX,
      overflowY,
      display
    } = getComputedStyle2(element);
    return /auto|scroll|overlay|hidden|clip/.test(overflow + overflowY + overflowX) && display !== "inline" && display !== "contents";
  }
  function isTableElement(element) {
    return /^(table|td|th)$/.test(getNodeName(element));
  }
  function isTopLayer(element) {
    try {
      if (element.matches(":popover-open"))
        return !0;
    } catch {
    }
    try {
      return element.matches(":modal");
    } catch {
      return !1;
    }
  }
  var willChangeRe = /transform|translate|scale|rotate|perspective|filter/, containRe = /paint|layout|strict|content/, isNotNone = (value) => !!value && value !== "none", isWebKitValue;
  function isContainingBlock(elementOrCss) {
    let css = isElement(elementOrCss) ? getComputedStyle2(elementOrCss) : elementOrCss;
    return isNotNone(css.transform) || isNotNone(css.translate) || isNotNone(css.scale) || isNotNone(css.rotate) || isNotNone(css.perspective) || !isWebKit() && (isNotNone(css.backdropFilter) || isNotNone(css.filter)) || willChangeRe.test(css.willChange || "") || containRe.test(css.contain || "");
  }
  function getContainingBlock(element) {
    let currentNode = getParentNode(element);
    for (; isHTMLElement(currentNode) && !isLastTraversableNode(currentNode); ) {
      if (isContainingBlock(currentNode))
        return currentNode;
      if (isTopLayer(currentNode))
        return null;
      currentNode = getParentNode(currentNode);
    }
    return null;
  }
  function isWebKit() {
    return isWebKitValue == null && (isWebKitValue = typeof CSS < "u" && CSS.supports && CSS.supports("-webkit-backdrop-filter", "none")), isWebKitValue;
  }
  function isLastTraversableNode(node) {
    return /^(html|body|#document)$/.test(getNodeName(node));
  }
  function getComputedStyle2(element) {
    return getWindow(element).getComputedStyle(element);
  }
  function getNodeScroll(element) {
    return isElement(element) ? {
      scrollLeft: element.scrollLeft,
      scrollTop: element.scrollTop
    } : {
      scrollLeft: element.scrollX,
      scrollTop: element.scrollY
    };
  }
  function getParentNode(node) {
    if (getNodeName(node) === "html")
      return node;
    let result = (
      // Step into the shadow DOM of the parent of a slotted node.
      node.assignedSlot || // DOM Element detected.
      node.parentNode || // ShadowRoot detected.
      isShadowRoot(node) && node.host || // Fallback.
      getDocumentElement(node)
    );
    return isShadowRoot(result) ? result.host : result;
  }
  function getNearestOverflowAncestor(node) {
    let parentNode = getParentNode(node);
    return isLastTraversableNode(parentNode) ? node.ownerDocument ? node.ownerDocument.body : node.body : isHTMLElement(parentNode) && isOverflowElement(parentNode) ? parentNode : getNearestOverflowAncestor(parentNode);
  }
  function getOverflowAncestors(node, list, traverseIframes) {
    var _node$ownerDocument2;
    list === void 0 && (list = []), traverseIframes === void 0 && (traverseIframes = !0);
    let scrollableAncestor = getNearestOverflowAncestor(node), isBody = scrollableAncestor === ((_node$ownerDocument2 = node.ownerDocument) == null ? void 0 : _node$ownerDocument2.body), win = getWindow(scrollableAncestor);
    if (isBody) {
      let frameElement = getFrameElement(win);
      return list.concat(win, win.visualViewport || [], isOverflowElement(scrollableAncestor) ? scrollableAncestor : [], frameElement && traverseIframes ? getOverflowAncestors(frameElement) : []);
    } else
      return list.concat(scrollableAncestor, getOverflowAncestors(scrollableAncestor, [], traverseIframes));
  }
  function getFrameElement(win) {
    return win.parent && Object.getPrototypeOf(win.parent) ? win.frameElement : null;
  }

  // node_modules/@floating-ui/dom/dist/floating-ui.dom.mjs
  function getCssDimensions(element) {
    let css = getComputedStyle2(element), width = parseFloat(css.width) || 0, height = parseFloat(css.height) || 0, hasOffset = isHTMLElement(element), offsetWidth = hasOffset ? element.offsetWidth : width, offsetHeight = hasOffset ? element.offsetHeight : height, shouldFallback = round(width) !== offsetWidth || round(height) !== offsetHeight;
    return shouldFallback && (width = offsetWidth, height = offsetHeight), {
      width,
      height,
      $: shouldFallback
    };
  }
  function unwrapElement(element) {
    return isElement(element) ? element : element.contextElement;
  }
  function getScale(element) {
    let domElement = unwrapElement(element);
    if (!isHTMLElement(domElement))
      return createCoords(1);
    let rect = domElement.getBoundingClientRect(), {
      width,
      height,
      $: $2
    } = getCssDimensions(domElement), x3 = ($2 ? round(rect.width) : rect.width) / width, y3 = ($2 ? round(rect.height) : rect.height) / height;
    return (!x3 || !Number.isFinite(x3)) && (x3 = 1), (!y3 || !Number.isFinite(y3)) && (y3 = 1), {
      x: x3,
      y: y3
    };
  }
  var noOffsets = /* @__PURE__ */ createCoords(0);
  function getVisualOffsets(element) {
    let win = getWindow(element);
    return !isWebKit() || !win.visualViewport ? noOffsets : {
      x: win.visualViewport.offsetLeft,
      y: win.visualViewport.offsetTop
    };
  }
  function shouldAddVisualOffsets(element, isFixed, floatingOffsetParent) {
    return isFixed === void 0 && (isFixed = !1), !floatingOffsetParent || isFixed && floatingOffsetParent !== getWindow(element) ? !1 : isFixed;
  }
  function getBoundingClientRect(element, includeScale, isFixedStrategy, offsetParent) {
    includeScale === void 0 && (includeScale = !1), isFixedStrategy === void 0 && (isFixedStrategy = !1);
    let clientRect = element.getBoundingClientRect(), domElement = unwrapElement(element), scale = createCoords(1);
    includeScale && (offsetParent ? isElement(offsetParent) && (scale = getScale(offsetParent)) : scale = getScale(element));
    let visualOffsets = shouldAddVisualOffsets(domElement, isFixedStrategy, offsetParent) ? getVisualOffsets(domElement) : createCoords(0), x3 = (clientRect.left + visualOffsets.x) / scale.x, y3 = (clientRect.top + visualOffsets.y) / scale.y, width = clientRect.width / scale.x, height = clientRect.height / scale.y;
    if (domElement) {
      let win = getWindow(domElement), offsetWin = offsetParent && isElement(offsetParent) ? getWindow(offsetParent) : offsetParent, currentWin = win, currentIFrame = getFrameElement(currentWin);
      for (; currentIFrame && offsetParent && offsetWin !== currentWin; ) {
        let iframeScale = getScale(currentIFrame), iframeRect = currentIFrame.getBoundingClientRect(), css = getComputedStyle2(currentIFrame), left = iframeRect.left + (currentIFrame.clientLeft + parseFloat(css.paddingLeft)) * iframeScale.x, top = iframeRect.top + (currentIFrame.clientTop + parseFloat(css.paddingTop)) * iframeScale.y;
        x3 *= iframeScale.x, y3 *= iframeScale.y, width *= iframeScale.x, height *= iframeScale.y, x3 += left, y3 += top, currentWin = getWindow(currentIFrame), currentIFrame = getFrameElement(currentWin);
      }
    }
    return rectToClientRect({
      width,
      height,
      x: x3,
      y: y3
    });
  }
  function getWindowScrollBarX(element, rect) {
    let leftScroll = getNodeScroll(element).scrollLeft;
    return rect ? rect.left + leftScroll : getBoundingClientRect(getDocumentElement(element)).left + leftScroll;
  }
  function getHTMLOffset(documentElement, scroll) {
    let htmlRect = documentElement.getBoundingClientRect(), x3 = htmlRect.left + scroll.scrollLeft - getWindowScrollBarX(documentElement, htmlRect), y3 = htmlRect.top + scroll.scrollTop;
    return {
      x: x3,
      y: y3
    };
  }
  function convertOffsetParentRelativeRectToViewportRelativeRect(_ref) {
    let {
      elements,
      rect,
      offsetParent,
      strategy
    } = _ref, isFixed = strategy === "fixed", documentElement = getDocumentElement(offsetParent), topLayer = elements ? isTopLayer(elements.floating) : !1;
    if (offsetParent === documentElement || topLayer && isFixed)
      return rect;
    let scroll = {
      scrollLeft: 0,
      scrollTop: 0
    }, scale = createCoords(1), offsets = createCoords(0), isOffsetParentAnElement = isHTMLElement(offsetParent);
    if ((isOffsetParentAnElement || !isOffsetParentAnElement && !isFixed) && ((getNodeName(offsetParent) !== "body" || isOverflowElement(documentElement)) && (scroll = getNodeScroll(offsetParent)), isOffsetParentAnElement)) {
      let offsetRect = getBoundingClientRect(offsetParent);
      scale = getScale(offsetParent), offsets.x = offsetRect.x + offsetParent.clientLeft, offsets.y = offsetRect.y + offsetParent.clientTop;
    }
    let htmlOffset = documentElement && !isOffsetParentAnElement && !isFixed ? getHTMLOffset(documentElement, scroll) : createCoords(0);
    return {
      width: rect.width * scale.x,
      height: rect.height * scale.y,
      x: rect.x * scale.x - scroll.scrollLeft * scale.x + offsets.x + htmlOffset.x,
      y: rect.y * scale.y - scroll.scrollTop * scale.y + offsets.y + htmlOffset.y
    };
  }
  function getClientRects(element) {
    return Array.from(element.getClientRects());
  }
  function getDocumentRect(element) {
    let html = getDocumentElement(element), scroll = getNodeScroll(element), body = element.ownerDocument.body, width = max(html.scrollWidth, html.clientWidth, body.scrollWidth, body.clientWidth), height = max(html.scrollHeight, html.clientHeight, body.scrollHeight, body.clientHeight), x3 = -scroll.scrollLeft + getWindowScrollBarX(element), y3 = -scroll.scrollTop;
    return getComputedStyle2(body).direction === "rtl" && (x3 += max(html.clientWidth, body.clientWidth) - width), {
      width,
      height,
      x: x3,
      y: y3
    };
  }
  var SCROLLBAR_MAX = 25;
  function getViewportRect(element, strategy) {
    let win = getWindow(element), html = getDocumentElement(element), visualViewport = win.visualViewport, width = html.clientWidth, height = html.clientHeight, x3 = 0, y3 = 0;
    if (visualViewport) {
      width = visualViewport.width, height = visualViewport.height;
      let visualViewportBased = isWebKit();
      (!visualViewportBased || visualViewportBased && strategy === "fixed") && (x3 = visualViewport.offsetLeft, y3 = visualViewport.offsetTop);
    }
    let windowScrollbarX = getWindowScrollBarX(html);
    if (windowScrollbarX <= 0) {
      let doc = html.ownerDocument, body = doc.body, bodyStyles = getComputedStyle(body), bodyMarginInline = doc.compatMode === "CSS1Compat" && parseFloat(bodyStyles.marginLeft) + parseFloat(bodyStyles.marginRight) || 0, clippingStableScrollbarWidth = Math.abs(html.clientWidth - body.clientWidth - bodyMarginInline);
      clippingStableScrollbarWidth <= SCROLLBAR_MAX && (width -= clippingStableScrollbarWidth);
    } else windowScrollbarX <= SCROLLBAR_MAX && (width += windowScrollbarX);
    return {
      width,
      height,
      x: x3,
      y: y3
    };
  }
  function getInnerBoundingClientRect(element, strategy) {
    let clientRect = getBoundingClientRect(element, !0, strategy === "fixed"), top = clientRect.top + element.clientTop, left = clientRect.left + element.clientLeft, scale = isHTMLElement(element) ? getScale(element) : createCoords(1), width = element.clientWidth * scale.x, height = element.clientHeight * scale.y, x3 = left * scale.x, y3 = top * scale.y;
    return {
      width,
      height,
      x: x3,
      y: y3
    };
  }
  function getClientRectFromClippingAncestor(element, clippingAncestor, strategy) {
    let rect;
    if (clippingAncestor === "viewport")
      rect = getViewportRect(element, strategy);
    else if (clippingAncestor === "document")
      rect = getDocumentRect(getDocumentElement(element));
    else if (isElement(clippingAncestor))
      rect = getInnerBoundingClientRect(clippingAncestor, strategy);
    else {
      let visualOffsets = getVisualOffsets(element);
      rect = {
        x: clippingAncestor.x - visualOffsets.x,
        y: clippingAncestor.y - visualOffsets.y,
        width: clippingAncestor.width,
        height: clippingAncestor.height
      };
    }
    return rectToClientRect(rect);
  }
  function hasFixedPositionAncestor(element, stopNode) {
    let parentNode = getParentNode(element);
    return parentNode === stopNode || !isElement(parentNode) || isLastTraversableNode(parentNode) ? !1 : getComputedStyle2(parentNode).position === "fixed" || hasFixedPositionAncestor(parentNode, stopNode);
  }
  function getClippingElementAncestors(element, cache2) {
    let cachedResult = cache2.get(element);
    if (cachedResult)
      return cachedResult;
    let result = getOverflowAncestors(element, [], !1).filter((el) => isElement(el) && getNodeName(el) !== "body"), currentContainingBlockComputedStyle = null, elementIsFixed = getComputedStyle2(element).position === "fixed", currentNode = elementIsFixed ? getParentNode(element) : element;
    for (; isElement(currentNode) && !isLastTraversableNode(currentNode); ) {
      let computedStyle = getComputedStyle2(currentNode), currentNodeIsContaining = isContainingBlock(currentNode);
      !currentNodeIsContaining && computedStyle.position === "fixed" && (currentContainingBlockComputedStyle = null), (elementIsFixed ? !currentNodeIsContaining && !currentContainingBlockComputedStyle : !currentNodeIsContaining && computedStyle.position === "static" && !!currentContainingBlockComputedStyle && (currentContainingBlockComputedStyle.position === "absolute" || currentContainingBlockComputedStyle.position === "fixed") || isOverflowElement(currentNode) && !currentNodeIsContaining && hasFixedPositionAncestor(element, currentNode)) ? result = result.filter((ancestor) => ancestor !== currentNode) : currentContainingBlockComputedStyle = computedStyle, currentNode = getParentNode(currentNode);
    }
    return cache2.set(element, result), result;
  }
  function getClippingRect(_ref) {
    let {
      element,
      boundary,
      rootBoundary,
      strategy
    } = _ref, clippingAncestors = [...boundary === "clippingAncestors" ? isTopLayer(element) ? [] : getClippingElementAncestors(element, this._c) : [].concat(boundary), rootBoundary], firstRect = getClientRectFromClippingAncestor(element, clippingAncestors[0], strategy), top = firstRect.top, right = firstRect.right, bottom = firstRect.bottom, left = firstRect.left;
    for (let i4 = 1; i4 < clippingAncestors.length; i4++) {
      let rect = getClientRectFromClippingAncestor(element, clippingAncestors[i4], strategy);
      top = max(rect.top, top), right = min(rect.right, right), bottom = min(rect.bottom, bottom), left = max(rect.left, left);
    }
    return {
      width: right - left,
      height: bottom - top,
      x: left,
      y: top
    };
  }
  function getDimensions(element) {
    let {
      width,
      height
    } = getCssDimensions(element);
    return {
      width,
      height
    };
  }
  function getRectRelativeToOffsetParent(element, offsetParent, strategy) {
    let isOffsetParentAnElement = isHTMLElement(offsetParent), documentElement = getDocumentElement(offsetParent), isFixed = strategy === "fixed", rect = getBoundingClientRect(element, !0, isFixed, offsetParent), scroll = {
      scrollLeft: 0,
      scrollTop: 0
    }, offsets = createCoords(0);
    function setLeftRTLScrollbarOffset() {
      offsets.x = getWindowScrollBarX(documentElement);
    }
    if (isOffsetParentAnElement || !isOffsetParentAnElement && !isFixed)
      if ((getNodeName(offsetParent) !== "body" || isOverflowElement(documentElement)) && (scroll = getNodeScroll(offsetParent)), isOffsetParentAnElement) {
        let offsetRect = getBoundingClientRect(offsetParent, !0, isFixed, offsetParent);
        offsets.x = offsetRect.x + offsetParent.clientLeft, offsets.y = offsetRect.y + offsetParent.clientTop;
      } else documentElement && setLeftRTLScrollbarOffset();
    isFixed && !isOffsetParentAnElement && documentElement && setLeftRTLScrollbarOffset();
    let htmlOffset = documentElement && !isOffsetParentAnElement && !isFixed ? getHTMLOffset(documentElement, scroll) : createCoords(0), x3 = rect.left + scroll.scrollLeft - offsets.x - htmlOffset.x, y3 = rect.top + scroll.scrollTop - offsets.y - htmlOffset.y;
    return {
      x: x3,
      y: y3,
      width: rect.width,
      height: rect.height
    };
  }
  function isStaticPositioned(element) {
    return getComputedStyle2(element).position === "static";
  }
  function getTrueOffsetParent(element, polyfill) {
    if (!isHTMLElement(element) || getComputedStyle2(element).position === "fixed")
      return null;
    if (polyfill)
      return polyfill(element);
    let rawOffsetParent = element.offsetParent;
    return getDocumentElement(element) === rawOffsetParent && (rawOffsetParent = rawOffsetParent.ownerDocument.body), rawOffsetParent;
  }
  function getOffsetParent(element, polyfill) {
    let win = getWindow(element);
    if (isTopLayer(element))
      return win;
    if (!isHTMLElement(element)) {
      let svgOffsetParent = getParentNode(element);
      for (; svgOffsetParent && !isLastTraversableNode(svgOffsetParent); ) {
        if (isElement(svgOffsetParent) && !isStaticPositioned(svgOffsetParent))
          return svgOffsetParent;
        svgOffsetParent = getParentNode(svgOffsetParent);
      }
      return win;
    }
    let offsetParent = getTrueOffsetParent(element, polyfill);
    for (; offsetParent && isTableElement(offsetParent) && isStaticPositioned(offsetParent); )
      offsetParent = getTrueOffsetParent(offsetParent, polyfill);
    return offsetParent && isLastTraversableNode(offsetParent) && isStaticPositioned(offsetParent) && !isContainingBlock(offsetParent) ? win : offsetParent || getContainingBlock(element) || win;
  }
  var getElementRects = async function(data) {
    let getOffsetParentFn = this.getOffsetParent || getOffsetParent, getDimensionsFn = this.getDimensions, floatingDimensions = await getDimensionsFn(data.floating);
    return {
      reference: getRectRelativeToOffsetParent(data.reference, await getOffsetParentFn(data.floating), data.strategy),
      floating: {
        x: 0,
        y: 0,
        width: floatingDimensions.width,
        height: floatingDimensions.height
      }
    };
  };
  function isRTL(element) {
    return getComputedStyle2(element).direction === "rtl";
  }
  var platform = {
    convertOffsetParentRelativeRectToViewportRelativeRect,
    getDocumentElement,
    getClippingRect,
    getOffsetParent,
    getElementRects,
    getClientRects,
    getDimensions,
    getScale,
    isElement,
    isRTL
  };
  function rectsAreEqual(a4, b) {
    return a4.x === b.x && a4.y === b.y && a4.width === b.width && a4.height === b.height;
  }
  function observeMove(element, onMove) {
    let io = null, timeoutId, root = getDocumentElement(element);
    function cleanup() {
      var _io;
      clearTimeout(timeoutId), (_io = io) == null || _io.disconnect(), io = null;
    }
    function refresh(skip, threshold) {
      skip === void 0 && (skip = !1), threshold === void 0 && (threshold = 1), cleanup();
      let elementRectForRootMargin = element.getBoundingClientRect(), {
        left,
        top,
        width,
        height
      } = elementRectForRootMargin;
      if (skip || onMove(), !width || !height)
        return;
      let insetTop = floor(top), insetRight = floor(root.clientWidth - (left + width)), insetBottom = floor(root.clientHeight - (top + height)), insetLeft = floor(left), options = {
        rootMargin: -insetTop + "px " + -insetRight + "px " + -insetBottom + "px " + -insetLeft + "px",
        threshold: max(0, min(1, threshold)) || 1
      }, isFirstUpdate = !0;
      function handleObserve(entries) {
        let ratio = entries[0].intersectionRatio;
        if (ratio !== threshold) {
          if (!isFirstUpdate)
            return refresh();
          ratio ? refresh(!1, ratio) : timeoutId = setTimeout(() => {
            refresh(!1, 1e-7);
          }, 1e3);
        }
        ratio === 1 && !rectsAreEqual(elementRectForRootMargin, element.getBoundingClientRect()) && refresh(), isFirstUpdate = !1;
      }
      try {
        io = new IntersectionObserver(handleObserve, {
          ...options,
          // Handle <iframe>s
          root: root.ownerDocument
        });
      } catch {
        io = new IntersectionObserver(handleObserve, options);
      }
      io.observe(element);
    }
    return refresh(!0), cleanup;
  }
  function autoUpdate(reference, floating, update, options) {
    options === void 0 && (options = {});
    let {
      ancestorScroll = !0,
      ancestorResize = !0,
      elementResize = typeof ResizeObserver == "function",
      layoutShift = typeof IntersectionObserver == "function",
      animationFrame = !1
    } = options, referenceEl = unwrapElement(reference), ancestors = ancestorScroll || ancestorResize ? [...referenceEl ? getOverflowAncestors(referenceEl) : [], ...floating ? getOverflowAncestors(floating) : []] : [];
    ancestors.forEach((ancestor) => {
      ancestorScroll && ancestor.addEventListener("scroll", update, {
        passive: !0
      }), ancestorResize && ancestor.addEventListener("resize", update);
    });
    let cleanupIo = referenceEl && layoutShift ? observeMove(referenceEl, update) : null, reobserveFrame = -1, resizeObserver = null;
    elementResize && (resizeObserver = new ResizeObserver((_ref) => {
      let [firstEntry] = _ref;
      firstEntry && firstEntry.target === referenceEl && resizeObserver && floating && (resizeObserver.unobserve(floating), cancelAnimationFrame(reobserveFrame), reobserveFrame = requestAnimationFrame(() => {
        var _resizeObserver;
        (_resizeObserver = resizeObserver) == null || _resizeObserver.observe(floating);
      })), update();
    }), referenceEl && !animationFrame && resizeObserver.observe(referenceEl), floating && resizeObserver.observe(floating));
    let frameId, prevRefRect = animationFrame ? getBoundingClientRect(reference) : null;
    animationFrame && frameLoop();
    function frameLoop() {
      let nextRefRect = getBoundingClientRect(reference);
      prevRefRect && !rectsAreEqual(prevRefRect, nextRefRect) && update(), prevRefRect = nextRefRect, frameId = requestAnimationFrame(frameLoop);
    }
    return update(), () => {
      var _resizeObserver2;
      ancestors.forEach((ancestor) => {
        ancestorScroll && ancestor.removeEventListener("scroll", update), ancestorResize && ancestor.removeEventListener("resize", update);
      }), cleanupIo?.(), (_resizeObserver2 = resizeObserver) == null || _resizeObserver2.disconnect(), resizeObserver = null, animationFrame && cancelAnimationFrame(frameId);
    };
  }
  var offset2 = offset;
  var shift2 = shift, flip2 = flip;
  var computePosition2 = (reference, floating, options) => {
    let cache2 = /* @__PURE__ */ new Map(), mergedOptions = {
      platform,
      ...options
    }, platformWithCache = {
      ...mergedOptions.platform,
      _c: cache2
    };
    return computePosition(reference, floating, {
      ...mergedOptions,
      platform: platformWithCache
    });
  };

  // src/browser/hooks/useOutsideDismiss.ts
  function useOutsideDismiss(ref, onDismiss, triggerRefs) {
    let onDismissRef = A2(onDismiss);
    y2(() => {
      onDismissRef.current = onDismiss;
    }, [onDismiss]);
    let triggerRefsBox = A2(triggerRefs);
    y2(() => {
      triggerRefsBox.current = triggerRefs;
    }, [triggerRefs]), y2(() => registerPopoverDismiss(() => onDismissRef.current()), []), y2(() => {
      let node = ref.current;
      if (!node) return;
      let roots = [], hosts = [], cursor = node;
      for (; ; ) {
        let root = cursor.getRootNode();
        if (!(root instanceof ShadowRoot)) {
          roots.push(document);
          break;
        }
        roots.push(root), hosts.push(root.host), cursor = root.host;
      }
      let ownRoot = roots[0], handleMousedown = (e4) => {
        let current = ref.current;
        if (!current) return;
        let path = e4.composedPath();
        if (path.includes(current)) return;
        if (e4.currentTarget !== ownRoot) {
          for (let h3 of hosts)
            if (path.includes(h3)) return;
        }
        let triggers = triggerRefsBox.current;
        if (triggers)
          for (let t4 of triggers) {
            let el = t4.current;
            if (el && path.includes(el)) return;
          }
        onDismissRef.current();
      }, handleKeydown = (e4) => {
        e4.key === "Escape" && !e4.defaultPrevented && onDismissRef.current();
      };
      for (let r4 of roots) r4.addEventListener("mousedown", handleMousedown);
      return document.addEventListener("keydown", handleKeydown), () => {
        for (let r4 of roots) r4.removeEventListener("mousedown", handleMousedown);
        document.removeEventListener("keydown", handleKeydown);
      };
    }, [ref]);
  }

  // src/browser/components/controls/TokenPresetPopover.tsx
  function TokenPresetPopover({
    anchorRef,
    tokens,
    onPick,
    onDismiss
  }) {
    let popoverRef = A2(null), sortedTokens = T2(
      () => [...tokens].sort((a4, b) => a4.valuePx - b.valuePx),
      [tokens]
    );
    return useOutsideDismiss(popoverRef, onDismiss, [anchorRef]), y2(() => {
      let anchor = anchorRef.current, popover = popoverRef.current;
      if (!anchor || !popover) return;
      let cancelled = !1, cleanupAutoUpdate = autoUpdate(anchor, popover, () => {
        computePosition2(anchor, popover, {
          placement: "bottom-start",
          middleware: [flip2(), shift2()]
        }).then(({ x: x3, y: y3 }) => {
          !cancelled && popoverRef.current && (popoverRef.current.style.left = `${x3}px`, popoverRef.current.style.top = `${y3}px`);
        }).catch((err) => {
          if (cancelled) return;
          console.warn("[cortex] TokenPresetPopover positioning failed:", err instanceof Error ? err.message : err);
          let rect = anchor.getBoundingClientRect();
          popoverRef.current && (popoverRef.current.style.left = `${rect.left}px`, popoverRef.current.style.top = `${rect.bottom}px`);
        });
      });
      return () => {
        cancelled = !0;
        try {
          cleanupAutoUpdate();
        } catch (err) {
          console.warn("[cortex] TokenPresetPopover autoUpdate cleanup failed:", err instanceof Error ? err.message : err);
        }
      };
    }, [anchorRef]), /* @__PURE__ */ u4(
      "div",
      {
        ref: popoverRef,
        class: "cortex-token-preset-popover",
        style: { position: "fixed" },
        children: sortedTokens.length === 0 ? /* @__PURE__ */ u4("div", { class: "cortex-token-preset-popover__empty-state", children: [
          /* @__PURE__ */ u4("span", { class: "cortex-token-preset-popover__empty-state-title", children: "No design tokens detected" }),
          /* @__PURE__ */ u4("span", { class: "cortex-token-preset-popover__empty-state-hint", children: [
            "Add ",
            /* @__PURE__ */ u4("code", { children: "--spacing-*" }),
            " to your CSS or configure Tailwind."
          ] })
        ] }) : /* @__PURE__ */ u4("div", { class: "cortex-token-preset-popover__list", children: sortedTokens.map((token) => /* @__PURE__ */ u4(
          "button",
          {
            type: "button",
            class: "cortex-token-preset-popover__list-row",
            onMouseDown: (e4) => e4.preventDefault(),
            onClick: () => onPick({ name: token.name, valuePx: token.valuePx, source: token.source }),
            children: [
              /* @__PURE__ */ u4("span", { class: "cortex-token-preset-popover__list-name", children: token.name }),
              /* @__PURE__ */ u4("span", { class: "cortex-token-preset-popover__list-value", children: [
                token.valuePx,
                "px"
              ] })
            ]
          },
          token.name
        )) })
      }
    );
  }

  // src/browser/components/controls/NumericInput.tsx
  function getStep(e4) {
    return e4.shiftKey ? 10 : e4.altKey ? 0.1 : 1;
  }
  function roundTenth(n3) {
    return Math.round(n3 * 10) / 10;
  }
  function NumericInput({
    value,
    unit,
    label,
    prefix,
    tooltip,
    min: min2,
    disabled,
    onChange,
    onScrub,
    onScrubEnd,
    overridden,
    stale,
    mixed,
    tokenFamily
  }) {
    let allSpacingTokens = x2(SpacingTokensContext), showPopover = tokenFamily === "spacing", filteredTokens = T2(
      () => showPopover ? allSpacingTokens.filter((t4) => matchesSpacingPattern(t4.name)) : [],
      [allSpacingTokens, showPopover]
    ), [localValue, setLocalValue] = d2(String(value)), [isEditing, setIsEditing] = d2(!1), [hasExplicitMixedValue, setHasExplicitMixedValue] = d2(!1), [isScrubbing, setIsScrubbing] = d2(!1), [scrubBadge, setScrubBadge] = d2(null), [popoverOpen, setPopoverOpen] = d2(!1), hostRef = A2(null), inputRef = A2(null), localValueRef = A2(String(value)), scrubStartX = A2(0), scrubStartValue = A2(0), scrubCleanupRef = A2(null), userTypedRef = A2(!1);
    y2(() => () => {
      scrubCleanupRef.current?.();
    }, []), localValueRef.current = localValue, y2(() => {
      if (!disabled) return;
      scrubCleanupRef.current?.(), userTypedRef.current = !1, setIsEditing(!1), setIsScrubbing(!1), setPopoverOpen(!1);
      let next = String(value);
      localValueRef.current = next, setLocalValue(next);
    }, [disabled, value]), y2(() => {
      isEditing || (setLocalValue(String(value)), setHasExplicitMixedValue(!1));
    }, [value, isEditing]);
    let clampValue = q2((v3) => min2 !== void 0 ? Math.max(min2, v3) : v3, [min2]), getStepBaseValue = q2(() => {
      let draftValue = parseFloat(localValueRef.current);
      return isNaN(draftValue) ? mixed ? NaN : value : draftValue;
    }, [mixed, value]), syncSteppedValue = q2((next) => {
      let str = String(next);
      localValueRef.current = str, setLocalValue(str), inputRef.current && (inputRef.current.value = str), mixed && setHasExplicitMixedValue(!0), userTypedRef.current = !1;
    }, [mixed]), handleKeyDown = q2((e4) => {
      if (disabled) {
        e4.preventDefault();
        return;
      }
      if (e4.key === "ArrowUp" || e4.key === "ArrowDown") {
        let baseValue = getStepBaseValue();
        if (isNaN(baseValue)) return;
        e4.preventDefault();
        let step = getStep(e4), delta = e4.key === "ArrowUp" ? step : -step, next = clampValue(roundTenth(baseValue + delta));
        onChange(next), syncSteppedValue(next);
      } else if (e4.key === "Enter") {
        e4.preventDefault();
        let parsed = parseFloat(localValueRef.current);
        isNaN(parsed) || onChange(clampValue(parsed)), userTypedRef.current = !1, setHasExplicitMixedValue(!1), setIsEditing(!1), inputRef.current?.blur();
      } else e4.key === "Escape" && (setLocalValue(String(value)), setHasExplicitMixedValue(!1), setIsEditing(!1), inputRef.current?.blur());
    }, [disabled, value, onChange, clampValue, getStepBaseValue, syncSteppedValue]), beginEditing = q2((focusInput = !1) => {
      disabled || (userTypedRef.current = !1, mixed && (localValueRef.current = "", setLocalValue(""), setHasExplicitMixedValue(!1), inputRef.current && (inputRef.current.value = "")), setIsEditing(!0), focusInput && inputRef.current?.focus(), inputRef.current?.select(), showPopover && setPopoverOpen(!0));
    }, [disabled, mixed, showPopover]), handleFocus = q2(() => {
      beginEditing();
    }, [beginEditing]), handleBlur = q2(() => {
      if (setIsEditing(!1), setHasExplicitMixedValue(!1), setPopoverOpen(!1), disabled) {
        userTypedRef.current = !1;
        let reverted = mixed ? "" : String(value);
        localValueRef.current = reverted, setLocalValue(reverted), inputRef.current && (inputRef.current.value = reverted);
        return;
      }
      let parsed = parseFloat(localValueRef.current);
      if (isNaN(parsed)) {
        let reverted = mixed ? "" : String(value);
        localValueRef.current = reverted, setLocalValue(reverted), inputRef.current && (inputRef.current.value = reverted);
      } else {
        let clamped = clampValue(parsed);
        userTypedRef.current && (mixed || clamped !== value) && onChange(clamped);
        let str = String(clamped);
        localValueRef.current = str, setLocalValue(str);
      }
      userTypedRef.current = !1;
    }, [disabled, value, onChange, clampValue, mixed]), handleInput = q2((e4) => {
      if (disabled) return;
      userTypedRef.current = !0;
      let v3 = e4.target.value;
      localValueRef.current = v3, setLocalValue(v3), mixed && setHasExplicitMixedValue(v3.trim() !== "");
    }, [disabled, mixed]), handleWheel = q2((e4) => {
      if (disabled || inputRef.current?.getRootNode()?.activeElement !== inputRef.current) return;
      let baseValue = getStepBaseValue();
      if (isNaN(baseValue)) return;
      e4.preventDefault();
      let step = getStep(e4), delta = e4.deltaY < 0 ? step : -step, next = clampValue(roundTenth(baseValue + delta));
      onChange(next), syncSteppedValue(next);
    }, [disabled, onChange, clampValue, getStepBaseValue, syncSteppedValue]), handleScrubDown = q2((e4) => {
      if (disabled || isEditing) return;
      if (mixed) {
        let target2 = e4.currentTarget;
        try {
          target2.setPointerCapture(e4.pointerId);
        } catch {
        }
        let cleanup2 = () => {
          scrubCleanupRef.current = null, target2.removeEventListener("pointerup", handleMixedUp), target2.removeEventListener("pointercancel", handleMixedCancel);
        }, handleMixedUp = (ue) => {
          try {
            target2.releasePointerCapture(ue.pointerId);
          } catch {
          }
          cleanup2(), beginEditing(!0);
        }, handleMixedCancel = () => {
          cleanup2();
        };
        target2.addEventListener("pointerup", handleMixedUp), target2.addEventListener("pointercancel", handleMixedCancel), scrubCleanupRef.current = cleanup2;
        return;
      }
      scrubStartX.current = e4.clientX, scrubStartValue.current = value;
      let target = e4.currentTarget;
      try {
        target.setPointerCapture(e4.pointerId);
      } catch {
      }
      setIsScrubbing(!0), setScrubBadge(null);
      let hasMoved = !1, targetLeft = target.getBoundingClientRect().left, handleMove = (me) => {
        let delta = me.clientX - scrubStartX.current;
        if (!hasMoved && Math.abs(delta) < 2) return;
        hasMoved = !0;
        let next = clampValue(roundTenth(scrubStartValue.current + delta));
        localValueRef.current = String(next), setLocalValue(String(next)), setScrubBadge({ value: next, x: Math.max(0, me.clientX - targetLeft) }), onScrub?.(next);
      }, cleanup = () => {
        scrubCleanupRef.current = null, setIsScrubbing(!1), setScrubBadge(null), target.removeEventListener("pointermove", handleMove), target.removeEventListener("pointerup", handleUp), target.removeEventListener("pointercancel", handleCancel);
      }, handleUp = (ue) => {
        try {
          target.releasePointerCapture(ue.pointerId);
        } catch {
        }
        if (!hasMoved) {
          inputRef.current?.focus(), cleanup();
          return;
        }
        let delta = ue.clientX - scrubStartX.current, next = clampValue(roundTenth(scrubStartValue.current + delta));
        onScrubEnd ? onScrubEnd(next) : onChange(next), cleanup();
      }, handleCancel = () => {
        cleanup();
      };
      target.addEventListener("pointermove", handleMove), target.addEventListener("pointerup", handleUp), target.addEventListener("pointercancel", handleCancel), scrubCleanupRef.current = cleanup;
    }, [disabled, isEditing, mixed, beginEditing, value, onChange, onScrub, onScrubEnd, clampValue]), handlePopoverPick = q2((chosen) => {
      let clamped = clampValue(chosen.valuePx);
      onChange(clamped);
      let next = String(clamped);
      localValueRef.current = next, setLocalValue(next), setIsEditing(!1), userTypedRef.current = !1, setPopoverOpen(!1), setHasExplicitMixedValue(!1);
    }, [onChange, clampValue]), handlePopoverDismiss = q2(() => {
      setPopoverOpen(!1);
    }, []), effectiveTooltip = stale ? "Edit saved but HMR didn't apply \u2014 refresh to verify" : tooltip, fallbackAccessibleLabel = label ?? (typeof prefix == "string" ? prefix : void 0), disabledAccessibleLabel = disabled ? effectiveTooltip ?? fallbackAccessibleLabel ?? "Disabled numeric input" : void 0;
    return /* @__PURE__ */ u4(
      "div",
      {
        ref: hostRef,
        class: [
          "cortex-numeric-input",
          isScrubbing && "cortex-numeric-input--scrubbing",
          stale && "cortex-numeric-input--stale",
          overridden && !stale && "cortex-numeric-input--overridden",
          mixed && "cortex-numeric-input--mixed"
        ].filter(Boolean).join(" "),
        onPointerDown: disabled ? void 0 : handleScrubDown,
        "data-tooltip": effectiveTooltip,
        "data-tooltip-placement": effectiveTooltip ? "top-start" : void 0,
        "aria-disabled": disabled ? "true" : void 0,
        "aria-label": disabledAccessibleLabel,
        role: disabled ? "group" : void 0,
        tabIndex: disabled ? 0 : void 0,
        children: [
          prefix !== void 0 ? /* @__PURE__ */ u4("span", { class: "cortex-numeric-input__prefix", children: prefix }) : label && /* @__PURE__ */ u4("span", { class: "cortex-numeric-input__label", children: label }),
          /* @__PURE__ */ u4(
            "input",
            {
              ref: inputRef,
              class: "cortex-numeric-input__value",
              type: "text",
              inputMode: "numeric",
              size: 4,
              "aria-label": effectiveTooltip ?? fallbackAccessibleLabel,
              value: mixed && (!isEditing || !hasExplicitMixedValue) ? "" : localValue,
              placeholder: mixed ? "Mixed" : void 0,
              disabled,
              tabIndex: disabled ? -1 : void 0,
              onInput: handleInput,
              onKeyDown: handleKeyDown,
              onFocus: handleFocus,
              onBlur: handleBlur,
              onWheel: handleWheel
            }
          ),
          unit && /* @__PURE__ */ u4("span", { class: "cortex-numeric-input__unit", children: unit }),
          scrubBadge && /* @__PURE__ */ u4(
            "span",
            {
              class: "cortex-numeric-input__scrub-badge",
              style: { left: `${scrubBadge.x}px` },
              "aria-hidden": "true",
              children: [
                scrubBadge.value,
                unit ?? ""
              ]
            }
          ),
          popoverOpen && /* @__PURE__ */ u4(
            TokenPresetPopover,
            {
              anchorRef: hostRef,
              tokens: filteredTokens,
              onPick: handlePopoverPick,
              onDismiss: handlePopoverDismiss
            }
          )
        ]
      }
    );
  }

  // src/browser/components/controls/AlignmentGrid.tsx
  var ALIGN_VALUES = ["flex-start", "center", "flex-end"], JUSTIFY_VALUES = ["flex-start", "center", "flex-end"], DISTRIBUTE_OPTIONS = [
    { value: "space-between", label: "Space Between" },
    { value: "space-around", label: "Space Around" },
    { value: "space-evenly", label: "Space Evenly" }
  ], CELL_LABELS = [
    ["Top left", "Top center", "Top right"],
    ["Center left", "Center", "Center right"],
    ["Bottom left", "Bottom center", "Bottom right"]
  ];
  function alignForRow(row) {
    return ALIGN_VALUES[row] ?? "flex-start";
  }
  function justifyForCol(col) {
    return JUSTIFY_VALUES[col] ?? "flex-start";
  }
  function cellLabel(row, col) {
    return CELL_LABELS[row]?.[col] ?? "Alignment cell";
  }
  function getVirtualCellFromEvent(event) {
    let rect = event.currentTarget.getBoundingClientRect(), col = Math.max(
      0,
      Math.min(2, Math.floor((event.clientX - rect.left) / (rect.width || 1) * 3))
    );
    return { row: Math.max(
      0,
      Math.min(2, Math.floor((event.clientY - rect.top) / (rect.height || 1) * 3))
    ), col };
  }
  var DISTRIBUTION_VALUES = /* @__PURE__ */ new Set(["space-between", "space-around", "space-evenly"]), MAIN_SPAN_VALUES = /* @__PURE__ */ new Set(["stretch"]), SPAN_VALUES = /* @__PURE__ */ new Set(["stretch", "baseline"]);
  function getIndicatorMode(justifyValue, alignValue) {
    let col = JUSTIFY_VALUES.indexOf(justifyValue), row = ALIGN_VALUES.indexOf(alignValue), spansMainAxis = DISTRIBUTION_VALUES.has(justifyValue) || MAIN_SPAN_VALUES.has(justifyValue), spansCrossAxis = SPAN_VALUES.has(alignValue);
    return col >= 0 && row >= 0 ? { type: "point", row, col } : spansMainAxis && row >= 0 ? { type: "row", row } : spansCrossAxis && col >= 0 ? { type: "col", col } : spansMainAxis && alignValue === "baseline" ? { type: "row", row: 0 } : spansMainAxis && spansCrossAxis ? { type: "full" } : spansMainAxis ? { type: "row", row: 1 } : spansCrossAxis ? { type: "col", col: 1 } : { type: "none" };
  }
  function AlignmentGrid({
    justifyValue,
    alignValue,
    onJustify,
    onAlign,
    onDistribute,
    label = "Alignment grid"
  }) {
    let [overlay, setOverlay] = d2(null), gridRef = A2(null);
    y2(() => {
      if (!overlay) return;
      let handler = (ev) => {
        let target = ev.target;
        gridRef.current && target && gridRef.current.contains(target) || setOverlay(null);
      };
      return document.addEventListener("mousedown", handler, !0), () => {
        document.removeEventListener("mousedown", handler, !0);
      };
    }, [overlay]);
    let handleCellClick = q2(
      (event, row, col) => {
        overlay || event.detail > 1 || (onJustify(justifyForCol(col)), onAlign(alignForRow(row)));
      },
      [overlay, onJustify, onAlign]
    ), handleCellDblClick = q2(
      (row, col) => {
        setOverlay((prev) => prev === null ? { axis: "row", index: row } : prev.axis === "row" ? { axis: "col", index: col } : { axis: "row", index: row });
      },
      []
    ), handleDistributeClick = q2(
      (value) => {
        if (!overlay) return;
        let axis = overlay.axis === "row" ? "cross" : "main";
        onDistribute?.(axis, value), setOverlay(null);
      },
      [overlay, onDistribute]
    ), handleSpanClick = q2(
      (event, spanAxis, fixedIndex) => {
        if (event.detail > 1) return;
        let { row, col } = getVirtualCellFromEvent(event);
        spanAxis === "row" ? (onJustify(justifyForCol(col)), onAlign(alignForRow(fixedIndex))) : (onJustify(justifyForCol(fixedIndex)), onAlign(alignForRow(row)));
      },
      [onJustify, onAlign]
    ), handleSpanDblClick = q2(
      (event, spanAxis, fixedIndex) => {
        let virtualCell = getVirtualCellFromEvent(event), row = spanAxis === "row" ? fixedIndex : virtualCell.row, col = spanAxis === "col" ? fixedIndex : virtualCell.col;
        setOverlay((prev) => prev === null ? { axis: "row", index: row } : prev.axis === "row" ? { axis: "col", index: col } : { axis: "row", index: row });
      },
      []
    ), indicatorMode = getIndicatorMode(justifyValue, alignValue), usesMainAxisStretch = MAIN_SPAN_VALUES.has(justifyValue), fullSpanLabel = usesMainAxisStretch || alignValue === "stretch" ? "Full alignment span indicator" : "Full distribution indicator", rowSpanLabel = usesMainAxisStretch ? "Main-axis span indicator" : "Distribution indicator", rowBaselineLabel = usesMainAxisStretch ? "Baseline main-axis span indicator" : "Baseline distribution indicator", showDistributionEdgeMarks = justifyValue === "space-around" || justifyValue === "space-evenly";
    function renderCell(row, col) {
      let active = indicatorMode.type === "point" && indicatorMode.row === row && indicatorMode.col === col, classes = [
        "cortex-alignment-grid__cell",
        active && "cortex-alignment-grid__cell--active"
      ].filter(Boolean).join(" ");
      return /* @__PURE__ */ u4(
        "button",
        {
          type: "button",
          class: classes,
          role: "gridcell",
          "aria-label": cellLabel(row, col),
          "aria-selected": active ? "true" : "false",
          style: { gridRow: row + 1, gridColumn: col + 1 },
          onClick: (event) => handleCellClick(event, row, col),
          onDblClick: () => handleCellDblClick(row, col),
          "data-row": row,
          "data-col": col,
          children: /* @__PURE__ */ u4("span", { class: "cortex-alignment-grid__cell__dot", "aria-hidden": "true" })
        },
        `cell-${row}-${col}`
      );
    }
    function renderOverlayButton(opt, axis) {
      let ariaAxis = axis === "row" ? "cross axis" : "main axis";
      return /* @__PURE__ */ u4(
        "button",
        {
          type: "button",
          class: "cortex-alignment-grid__distribute-btn",
          "aria-label": `${opt.label} ${ariaAxis}`,
          onClick: () => handleDistributeClick(opt.value),
          children: opt.label
        },
        `dist-${axis}-${opt.value}`
      );
    }
    let cells = [];
    for (let row = 0; row < 3; row++)
      for (let col = 0; col < 3; col++) {
        if (overlay) {
          if (overlay.axis === "row" && row === overlay.index || overlay.axis === "col" && col === overlay.index) continue;
        } else if (indicatorMode.type === "full" || indicatorMode.type === "row" && row === indicatorMode.row || indicatorMode.type === "col" && col === indicatorMode.col) continue;
        cells.push(renderCell(row, col));
      }
    return /* @__PURE__ */ u4(
      "div",
      {
        ref: gridRef,
        class: "cortex-alignment-grid",
        role: "grid",
        "aria-label": label,
        children: [
          cells,
          !overlay && indicatorMode.type === "full" && /* @__PURE__ */ u4(
            "button",
            {
              type: "button",
              class: "cortex-alignment-grid__span cortex-alignment-grid__span--full",
              "aria-label": fullSpanLabel,
              style: { gridRow: "1 / -1", gridColumn: "1 / -1" },
              onClick: (e4) => {
                if (e4.detail > 1) return;
                let { row, col } = getVirtualCellFromEvent(e4);
                onJustify(justifyForCol(col)), onAlign(alignForRow(row));
              },
              onDblClick: (e4) => {
                let { row, col } = getVirtualCellFromEvent(e4);
                setOverlay((prev) => prev === null ? { axis: "row", index: row } : prev.axis === "row" ? { axis: "col", index: col } : { axis: "row", index: row });
              },
              children: [
                showDistributionEdgeMarks && /* @__PURE__ */ u4("span", { class: "cortex-alignment-grid__span-dot cortex-alignment-grid__span-dot--left", "aria-hidden": "true" }),
                /* @__PURE__ */ u4("span", { class: "cortex-alignment-grid__span-bar" }),
                /* @__PURE__ */ u4("span", { class: "cortex-alignment-grid__span-bar" }),
                /* @__PURE__ */ u4("span", { class: "cortex-alignment-grid__span-bar" }),
                showDistributionEdgeMarks && /* @__PURE__ */ u4("span", { class: "cortex-alignment-grid__span-dot cortex-alignment-grid__span-dot--right", "aria-hidden": "true" })
              ]
            }
          ),
          !overlay && indicatorMode.type === "row" && alignValue !== "baseline" && /* @__PURE__ */ u4(
            "button",
            {
              type: "button",
              class: "cortex-alignment-grid__span cortex-alignment-grid__span--row",
              "aria-label": rowSpanLabel,
              style: { gridRow: `${indicatorMode.row + 1}`, gridColumn: "1 / -1" },
              onClick: (e4) => handleSpanClick(e4, "row", indicatorMode.row),
              onDblClick: (e4) => handleSpanDblClick(e4, "row", indicatorMode.row),
              children: [
                /* @__PURE__ */ u4("span", { class: "cortex-alignment-grid__span-bar" }),
                /* @__PURE__ */ u4("span", { class: "cortex-alignment-grid__span-bar" }),
                /* @__PURE__ */ u4("span", { class: "cortex-alignment-grid__span-bar" })
              ]
            }
          ),
          !overlay && indicatorMode.type === "row" && alignValue === "baseline" && /* @__PURE__ */ u4(
            "button",
            {
              type: "button",
              class: "cortex-alignment-grid__span cortex-alignment-grid__span--row cortex-alignment-grid__span--row-baseline",
              "aria-label": rowBaselineLabel,
              style: { gridRow: `${indicatorMode.row + 1}`, gridColumn: "1 / -1" },
              onClick: (e4) => handleSpanClick(e4, "row", indicatorMode.row),
              onDblClick: (e4) => handleSpanDblClick(e4, "row", indicatorMode.row),
              children: [
                showDistributionEdgeMarks && /* @__PURE__ */ u4("span", { class: "cortex-alignment-grid__span-baseline-tick", "aria-hidden": "true" }),
                /* @__PURE__ */ u4(Baseline, { class: "cortex-alignment-grid__span-icon" }),
                /* @__PURE__ */ u4("span", { class: "cortex-alignment-grid__span-baseline-line", "aria-hidden": "true" }),
                showDistributionEdgeMarks && /* @__PURE__ */ u4("span", { class: "cortex-alignment-grid__span-baseline-tick", "aria-hidden": "true" })
              ]
            }
          ),
          !overlay && indicatorMode.type === "col" && alignValue !== "baseline" && /* @__PURE__ */ u4(
            "button",
            {
              type: "button",
              class: "cortex-alignment-grid__span cortex-alignment-grid__span--col",
              "aria-label": "Stretch indicator",
              style: { gridColumn: `${indicatorMode.col + 1}`, gridRow: "1 / -1" },
              onClick: (e4) => handleSpanClick(e4, "col", indicatorMode.col),
              onDblClick: (e4) => handleSpanDblClick(e4, "col", indicatorMode.col),
              children: [
                /* @__PURE__ */ u4("span", { class: "cortex-alignment-grid__span-bar" }),
                /* @__PURE__ */ u4("span", { class: "cortex-alignment-grid__span-bar" }),
                /* @__PURE__ */ u4("span", { class: "cortex-alignment-grid__span-bar" })
              ]
            }
          ),
          !overlay && indicatorMode.type === "col" && alignValue === "baseline" && /* @__PURE__ */ u4(
            "button",
            {
              type: "button",
              class: "cortex-alignment-grid__span cortex-alignment-grid__span--col-baseline",
              "aria-label": "Baseline indicator",
              style: { gridColumn: `${indicatorMode.col + 1}`, gridRow: "1 / -1" },
              onClick: (e4) => handleSpanClick(e4, "col", indicatorMode.col),
              onDblClick: (e4) => handleSpanDblClick(e4, "col", indicatorMode.col),
              children: [
                /* @__PURE__ */ u4("span", { class: "cortex-alignment-grid__cell__dot", "aria-hidden": "true" }),
                /* @__PURE__ */ u4(Baseline, { class: "cortex-alignment-grid__span-icon" }),
                /* @__PURE__ */ u4("span", { class: "cortex-alignment-grid__cell__dot", "aria-hidden": "true" })
              ]
            }
          ),
          overlay?.axis === "row" && /* @__PURE__ */ u4(
            "div",
            {
              class: "cortex-alignment-grid__overlay cortex-alignment-grid__overlay--row",
              role: "group",
              "aria-label": "Cross-axis distribution",
              style: {
                gridRow: `${overlay.index + 1} / ${overlay.index + 2}`,
                gridColumn: "1 / -1"
              },
              children: DISTRIBUTE_OPTIONS.map((opt) => renderOverlayButton(opt, "row"))
            }
          ),
          overlay?.axis === "col" && /* @__PURE__ */ u4(
            "div",
            {
              class: "cortex-alignment-grid__overlay cortex-alignment-grid__overlay--col",
              role: "group",
              "aria-label": "Main-axis distribution",
              style: {
                gridColumn: `${overlay.index + 1} / ${overlay.index + 2}`,
                gridRow: "1 / -1"
              },
              children: DISTRIBUTE_OPTIONS.map((opt) => renderOverlayButton(opt, "col"))
            }
          )
        ]
      }
    );
  }

  // src/browser/components/controls/XYDropdown.tsx
  function findIndex(options, value) {
    let i4 = options.findIndex((o4) => o4.value === value);
    return i4 === -1 ? 0 : i4;
  }
  function XYDropdown({
    options,
    value,
    onChange,
    ariaLabel,
    axisLabel,
    tooltip,
    id,
    disabled = !1
  }) {
    let [isOpen, setIsOpen] = d2(!1), [highlightIdx, setHighlightIdx] = d2(() => findIndex(options, value)), triggerRef = A2(null), popoverRef = A2(null), effectivelyDisabled = disabled || options.length === 0, selected = options[findIndex(options, value)] ?? options[0], activeId = isOpen && options[highlightIdx] ? `cortex-xy-opt-${options[highlightIdx].value}` : void 0;
    y2(() => {
      if (!isOpen || !triggerRef.current || !popoverRef.current) return;
      let cancelled = !1, trigger = triggerRef.current, popover = popoverRef.current;
      return popover.style.width = `${Math.max(trigger.offsetWidth, 160)}px`, computePosition2(trigger, popover, {
        placement: "bottom-start",
        middleware: [flip2(), shift2()]
      }).then(({ x: x3, y: y3 }) => {
        !cancelled && popoverRef.current && (popoverRef.current.style.left = `${x3}px`, popoverRef.current.style.top = `${y3}px`);
      }).catch((err) => {
        if (!cancelled) {
          console.warn("[cortex] XYDropdown positioning failed:", err instanceof Error ? err.message : err);
          let rect = trigger.getBoundingClientRect();
          popoverRef.current && (popoverRef.current.style.left = `${rect.left}px`, popoverRef.current.style.top = `${rect.bottom}px`);
        }
      }), () => {
        cancelled = !0;
      };
    }, [isOpen]), y2(() => {
      isOpen || setHighlightIdx(findIndex(options, value));
    }, [value, isOpen, options]);
    let open = q2(() => {
      effectivelyDisabled || (setHighlightIdx(findIndex(options, value)), setIsOpen(!0));
    }, [effectivelyDisabled, options, value]), close = q2(() => {
      setIsOpen(!1), triggerRef.current?.focus();
    }, []), select = q2(
      (optValue) => {
        onChange(optValue), setIsOpen(!1), triggerRef.current?.focus();
      },
      [onChange]
    ), handleTriggerClick = q2(() => {
      effectivelyDisabled || (isOpen ? close() : open());
    }, [effectivelyDisabled, isOpen, open, close]), handleKeyDown = q2(
      (e4) => {
        if (isOpen) {
          if (e4.key === "Escape")
            e4.preventDefault(), close();
          else if (e4.key === "ArrowDown")
            e4.preventDefault(), setHighlightIdx((i4) => (i4 + 1) % options.length);
          else if (e4.key === "ArrowUp")
            e4.preventDefault(), setHighlightIdx((i4) => (i4 - 1 + options.length) % options.length);
          else if (e4.key === "Home")
            e4.preventDefault(), setHighlightIdx(0);
          else if (e4.key === "End")
            e4.preventDefault(), setHighlightIdx(options.length - 1);
          else if (e4.key === "Enter" || e4.key === " ") {
            e4.preventDefault();
            let opt = options[highlightIdx];
            opt && select(opt.value);
          }
        }
      },
      [isOpen, close, highlightIdx, options, select]
    );
    return /* @__PURE__ */ u4("div", { class: "cortex-xy-dropdown", children: [
      /* @__PURE__ */ u4(
        "button",
        {
          ref: triggerRef,
          class: "cortex-xy-dropdown__trigger",
          type: "button",
          role: "combobox",
          "aria-haspopup": "listbox",
          "aria-expanded": isOpen ? "true" : "false",
          "aria-activedescendant": activeId,
          "aria-label": `${axisLabel} \u2014 ${ariaLabel}`,
          "data-tooltip": tooltip,
          disabled: effectivelyDisabled,
          id,
          onClick: handleTriggerClick,
          onKeyDown: handleKeyDown,
          children: [
            /* @__PURE__ */ u4("span", { class: "cortex-xy-dropdown__trigger-axis", "aria-hidden": "true", children: axisLabel }),
            /* @__PURE__ */ u4("span", { class: "cortex-xy-dropdown__trigger-label", children: selected?.label ?? "\u2014" }),
            /* @__PURE__ */ u4(
              "span",
              {
                class: `cortex-xy-dropdown__chevron${isOpen ? " cortex-xy-dropdown__chevron--open" : ""}`,
                "aria-hidden": "true",
                children: /* @__PURE__ */ u4(ChevronDown, { size: 14 })
              }
            )
          ]
        }
      ),
      isOpen && /* @__PURE__ */ u4(k, { children: [
        /* @__PURE__ */ u4("div", { class: "cortex-xy-dropdown__backdrop", onClick: close }),
        /* @__PURE__ */ u4(
          "div",
          {
            ref: popoverRef,
            class: "cortex-xy-dropdown__popover",
            style: { position: "fixed" },
            children: [
              /* @__PURE__ */ u4(
                "div",
                {
                  class: "cortex-xy-dropdown__list",
                  role: "listbox",
                  "aria-label": ariaLabel,
                  children: options.map((opt, i4) => {
                    let isSelected = opt.value === value, isHighlighted = i4 === highlightIdx;
                    return /* @__PURE__ */ u4(
                      "div",
                      {
                        id: `cortex-xy-opt-${opt.value}`,
                        class: [
                          "cortex-xy-dropdown__option",
                          isHighlighted && "cortex-xy-dropdown__option--highlighted",
                          isSelected && "cortex-xy-dropdown__option--selected"
                        ].filter(Boolean).join(" "),
                        role: "option",
                        "aria-selected": isSelected ? "true" : "false",
                        onClick: () => select(opt.value),
                        onMouseEnter: () => setHighlightIdx(i4),
                        children: [
                          opt.icon && /* @__PURE__ */ u4("span", { class: "cortex-xy-dropdown__option-icon", "aria-hidden": "true", children: opt.icon }),
                          /* @__PURE__ */ u4("span", { class: "cortex-xy-dropdown__option-label", children: opt.label }),
                          isSelected && /* @__PURE__ */ u4("span", { class: "cortex-xy-dropdown__option-check", "aria-hidden": "true", children: /* @__PURE__ */ u4(Check, { size: 14 }) })
                        ]
                      },
                      opt.value
                    );
                  })
                }
              ),
              options[highlightIdx]?.hint && /* @__PURE__ */ u4("div", { class: "cortex-xy-dropdown__hint", "aria-live": "polite", children: options[highlightIdx].hint })
            ]
          }
        )
      ] })
    ] });
  }

  // src/browser/components/controls/ExpandableOptions.tsx
  function ExpandableOptions({
    label,
    defaultOpen = !1,
    children
  }) {
    let [isOpen, setIsOpen] = d2(defaultOpen), bodyId = g2(), handleToggle = q2(() => {
      setIsOpen((v3) => !v3);
    }, []);
    return /* @__PURE__ */ u4(
      "div",
      {
        class: [
          "cortex-expandable-options",
          isOpen && "cortex-expandable-options--open"
        ].filter(Boolean).join(" "),
        "aria-expanded": isOpen ? "true" : "false",
        children: [
          /* @__PURE__ */ u4(
            "button",
            {
              type: "button",
              class: "cortex-expandable-options__trigger",
              "aria-expanded": isOpen ? "true" : "false",
              "aria-controls": bodyId,
              onClick: handleToggle,
              children: [
                /* @__PURE__ */ u4(
                  "span",
                  {
                    class: [
                      "cortex-expandable-options__chevron",
                      isOpen && "cortex-expandable-options__chevron--open"
                    ].filter(Boolean).join(" "),
                    "aria-hidden": "true",
                    children: /* @__PURE__ */ u4(ChevronRight, { size: 12 })
                  }
                ),
                /* @__PURE__ */ u4("span", { class: "cortex-expandable-options__label", children: label })
              ]
            }
          ),
          /* @__PURE__ */ u4(
            "div",
            {
              id: bodyId,
              class: "cortex-expandable-options__body",
              "aria-hidden": isOpen ? "false" : "true",
              inert: !isOpen || void 0,
              children: /* @__PURE__ */ u4("div", { class: "cortex-expandable-options__inner", children })
            }
          )
        ]
      }
    );
  }

  // src/browser/alignment-router.ts
  var TYPOGRAPHY_VERTICAL_DISABLED_TOOLTIP = "Set Height or Min H in Layout before aligning text vertically.", TYPOGRAPHY_VERTICAL_UNSUPPORTED_DISPLAY_TOOLTIP = "Use Layout controls for this display type, or switch Display to Block/Flex.", NO_HEIGHT_REASON = Object.freeze({
    code: "no-height",
    tooltip: TYPOGRAPHY_VERTICAL_DISABLED_TOOLTIP
  }), UNSUPPORTED_DISPLAY_REASON = Object.freeze({
    code: "unsupported-display",
    tooltip: TYPOGRAPHY_VERTICAL_UNSUPPORTED_DISPLAY_TOOLTIP
  }), ABSOLUTE_LINE_HEIGHT_WARNING_THRESHOLD = 10, warnedAboutAbsoluteTypographyLineHeight = !1;
  function isColumnDirection(direction) {
    return direction === "column" || direction === "column-reverse";
  }
  function isRowReverseDirection(direction) {
    return direction === "row-reverse";
  }
  function isColumnReverseDirection(direction) {
    return direction === "column-reverse";
  }
  function flipFlexEdge(value) {
    return value === "flex-start" ? "flex-end" : value === "flex-end" ? "flex-start" : value;
  }
  function flexAxisToCssProperty(role, direction) {
    let column = isColumnDirection(direction);
    return typeof role == "string" ? role === "x" ? column ? "align-items" : "justify-content" : column ? "justify-content" : "align-items" : role.distribute === "main" ? "justify-content" : "align-content";
  }
  function typographyLayoutContext(display, flexDirection) {
    return display === "flex" || display === "inline-flex" ? isColumnDirection(flexDirection) ? "flex-column" : "flex-row" : display === "" || display === "block" ? "block" : "unsupported";
  }
  function parsePositivePx(value) {
    let n3 = Number.parseFloat(value);
    return Number.isFinite(n3) && n3 > 0 ? n3 : 0;
  }
  function lineHeightPx(context) {
    return context.lineHeight > ABSOLUTE_LINE_HEIGHT_WARNING_THRESHOLD ? (warnedAboutAbsoluteTypographyLineHeight || (console.warn(
      `[cortex] TypographyAlignmentContext.lineHeight should be a unitless multiplier; received ${context.lineHeight}. Treating it as CSS pixels for vertical alignment.`
    ), warnedAboutAbsoluteTypographyLineHeight = !0), Math.max(1, context.lineHeight)) : Math.max(1, context.fontSize * context.lineHeight);
  }
  function typographyVerticalAlignDisabledReason(context) {
    let layout = typographyLayoutContext(context.display, context.flexDirection);
    if (layout === "unsupported") return UNSUPPORTED_DISPLAY_REASON;
    if (layout !== "block") return null;
    let contentHeight = lineHeightPx(context);
    return parsePositivePx(context.minHeight) > contentHeight + 1 || parsePositivePx(context.height) > contentHeight + 1 ? null : NO_HEIGHT_REASON;
  }
  function horizontalToFlex(value, flexDirection) {
    let aligned = value === "right" || value === "flex-end" ? "flex-end" : value === "center" ? "center" : "flex-start";
    return isRowReverseDirection(flexDirection) ? flipFlexEdge(aligned) : aligned;
  }
  function verticalToFlex(value, flexDirection) {
    let aligned = value === "flex-end" ? "flex-end" : value === "flex-start" ? "flex-start" : value === "center" ? "center" : "";
    return aligned ? isColumnReverseDirection(flexDirection) ? flipFlexEdge(aligned) : aligned : "";
  }
  function flexToHorizontal(value, flexDirection) {
    return value === "flex-start" ? isRowReverseDirection(flexDirection) ? "right" : "left" : value === "flex-end" ? isRowReverseDirection(flexDirection) ? "left" : "right" : value === "start" || value === "left" ? "left" : value === "end" || value === "right" ? "right" : value === "center" ? "center" : "";
  }
  function flexToVertical(value, flexDirection) {
    return value === "flex-end" ? isColumnReverseDirection(flexDirection) ? "flex-start" : "flex-end" : value === "flex-start" ? isColumnReverseDirection(flexDirection) ? "flex-end" : "flex-start" : value === "end" ? "flex-end" : value === "center" ? "center" : value === "start" ? "flex-start" : "";
  }
  function resolveTypographyAlignmentEdits({
    context,
    axis,
    value
  }) {
    let layout = typographyLayoutContext(context.display, context.flexDirection);
    if (axis === "horizontal")
      return layout === "block" || layout === "unsupported" ? { disabledReason: null, edits: [{ property: "text-align", value: value === "right" || value === "flex-end" ? "right" : value === "center" ? "center" : "left" }] } : {
        disabledReason: null,
        edits: [{
          property: layout === "flex-column" ? "align-items" : "justify-content",
          value: horizontalToFlex(value, context.flexDirection)
        }]
      };
    let vertical = verticalToFlex(value, context.flexDirection);
    if (!vertical) return { disabledReason: null, edits: [] };
    if (layout === "unsupported")
      return { disabledReason: UNSUPPORTED_DISPLAY_REASON, edits: [] };
    if (layout === "block") {
      let disabledReason = typographyVerticalAlignDisabledReason(context);
      return disabledReason ? { disabledReason, edits: [] } : {
        disabledReason: null,
        edits: [
          { property: "display", value: "flex" },
          { property: "flex-direction", value: "column" },
          { property: "justify-content", value: vertical }
        ]
      };
    }
    return {
      disabledReason: null,
      edits: [{
        property: layout === "flex-column" ? "justify-content" : "align-items",
        value: vertical
      }]
    };
  }

  // src/browser/components/sections/FlexControls.tsx
  var DIRECTION_OPTIONS = [
    { value: "row", icon: /* @__PURE__ */ u4(ArrowRight, { size: 14 }), title: "Row" },
    { value: "row-reverse", icon: /* @__PURE__ */ u4(ArrowLeft, { size: 14 }), title: "Row reverse" },
    { value: "column", icon: /* @__PURE__ */ u4(ArrowDown, { size: 14 }), title: "Column" },
    { value: "column-reverse", icon: /* @__PURE__ */ u4(ArrowUp, { size: 14 }), title: "Column reverse" }
  ], WRAP_OPTIONS = [
    { value: "nowrap", label: "No wrap", title: "No wrap" },
    { value: "wrap", label: "Wrap", title: "Wrap" },
    { value: "wrap-reverse", label: "Reverse", title: "Wrap reverse" }
  ], X_OPTIONS = [
    { value: "flex-start", label: "Left", hint: "Align children to the left of the row." },
    { value: "center", label: "Center", hint: "Center children along the main axis." },
    { value: "flex-end", label: "Right", hint: "Align children to the right of the row." },
    { value: "space-between", label: "Space Between", hint: "Distribute children with equal space between them." },
    { value: "space-around", label: "Space Around", hint: "Distribute children with equal space around them." }
  ], Y_OPTIONS = [
    { value: "flex-start", label: "Top", hint: "Align children to the top of the cross axis." },
    { value: "center", label: "Center", hint: "Center children along the cross axis." },
    { value: "flex-end", label: "Bottom", hint: "Align children to the bottom of the cross axis." },
    { value: "stretch", label: "Stretch", hint: "Stretch children to fill the cross axis." },
    { value: "baseline", label: "Baseline", hint: "Align children along their text baseline." }
  ];
  function FlexControls({
    values,
    onChange,
    onScrub,
    onScrubEnd,
    dimmedProperties,
    mixedProperties
  }) {
    let { flexDirection, justifyContent, alignItems, rowGap, columnGap, flexWrap } = values, column = isColumnDirection(flexDirection), directionMixed = mixedProperties?.has("flex-direction") === !0, [gapLocked, setGapLocked] = d2(!0), toggleGapLock = q2(() => setGapLocked((p3) => !p3), []), handleDirection = q2(
      (v3) => onChange({ property: "flex-direction", value: v3 }),
      [onChange]
    ), gridJustifyValue = column ? alignItems : justifyContent, gridAlignValue = column ? justifyContent : alignItems, handleGridJustify = q2(
      (v3) => {
        directionMixed || onChange({
          property: flexAxisToCssProperty("x", flexDirection),
          value: v3
        });
      },
      [onChange, flexDirection, directionMixed]
    ), handleGridAlign = q2(
      (v3) => {
        directionMixed || onChange({
          property: flexAxisToCssProperty("y", flexDirection),
          value: v3
        });
      },
      [onChange, flexDirection, directionMixed]
    ), handleGridDistribute = q2(
      (axis, v3) => {
        directionMixed || onChange({
          property: flexAxisToCssProperty({ distribute: axis }, flexDirection),
          value: v3
        });
      },
      [onChange, flexDirection, directionMixed]
    ), xProperty = flexAxisToCssProperty("x", flexDirection), yProperty = flexAxisToCssProperty("y", flexDirection), xValue = column ? alignItems : justifyContent, yValue = column ? justifyContent : alignItems, handleX = q2(
      (v3) => {
        directionMixed || onChange({ property: xProperty, value: v3 });
      },
      [onChange, xProperty, directionMixed]
    ), handleY = q2(
      (v3) => {
        directionMixed || onChange({ property: yProperty, value: v3 });
      },
      [onChange, yProperty, directionMixed]
    ), handleGapChange = q2(
      (v3) => {
        onChange({ property: "row-gap", value: `${v3}px` }), onChange({ property: "column-gap", value: `${v3}px` });
      },
      [onChange]
    ), handleGapScrub = q2(
      (v3) => {
        onScrub && (onScrub({ property: "row-gap", value: `${v3}px` }), onScrub({ property: "column-gap", value: `${v3}px` }));
      },
      [onScrub]
    ), handleGapScrubEnd = q2(
      (v3) => {
        onScrubEnd && (onScrubEnd({ property: "row-gap", value: `${v3}px` }), onScrubEnd({ property: "column-gap", value: `${v3}px` }));
      },
      [onScrubEnd]
    ), handleColumnGapChange = q2(
      (v3) => onChange({ property: "column-gap", value: `${v3}px` }),
      [onChange]
    ), handleColumnGapScrub = q2(
      (v3) => {
        onScrub && onScrub({ property: "column-gap", value: `${v3}px` });
      },
      [onScrub]
    ), handleColumnGapScrubEnd = q2(
      (v3) => {
        onScrubEnd && onScrubEnd({ property: "column-gap", value: `${v3}px` });
      },
      [onScrubEnd]
    ), handleRowGapChange = q2(
      (v3) => onChange({ property: "row-gap", value: `${v3}px` }),
      [onChange]
    ), handleRowGapScrub = q2(
      (v3) => {
        onScrub && onScrub({ property: "row-gap", value: `${v3}px` });
      },
      [onScrub]
    ), handleRowGapScrubEnd = q2(
      (v3) => {
        onScrubEnd && onScrubEnd({ property: "row-gap", value: `${v3}px` });
      },
      [onScrubEnd]
    ), gapValue = rowGap, gapMixed = mixedProperties?.has("row-gap") || mixedProperties?.has("column-gap"), handleWrap = q2(
      (v3) => onChange({ property: "flex-wrap", value: v3 }),
      [onChange]
    );
    return /* @__PURE__ */ u4("div", { class: "cortex-flex-controls", children: [
      /* @__PURE__ */ u4("div", { class: `cortex-flex-controls__direction${isDimmed(dimmedProperties, "flex-direction") ? " cortex-control--dimmed" : ""}`, children: /* @__PURE__ */ u4(
        SegmentedControl,
        {
          options: DIRECTION_OPTIONS,
          value: flexDirection,
          onChange: handleDirection,
          mixed: directionMixed
        }
      ) }),
      /* @__PURE__ */ u4("div", { class: `cortex-flex-controls__align${isDimmed(dimmedProperties, "justify-content", "align-items", "align-content") ? " cortex-control--dimmed" : ""}`, children: [
        /* @__PURE__ */ u4(
          AlignmentGrid,
          {
            justifyValue: gridJustifyValue,
            alignValue: gridAlignValue,
            onJustify: handleGridJustify,
            onAlign: handleGridAlign,
            onDistribute: handleGridDistribute,
            label: "Flex alignment grid"
          }
        ),
        /* @__PURE__ */ u4("div", { class: "cortex-flex-controls__xy", children: [
          /* @__PURE__ */ u4("div", { "data-xy-axis": "x", class: "cortex-flex-controls__xy-field", children: /* @__PURE__ */ u4(
            XYDropdown,
            {
              options: X_OPTIONS,
              value: xValue,
              onChange: handleX,
              ariaLabel: "X alignment",
              axisLabel: "X",
              tooltip: xProperty,
              disabled: directionMixed
            }
          ) }),
          /* @__PURE__ */ u4("div", { "data-xy-axis": "y", class: "cortex-flex-controls__xy-field", children: /* @__PURE__ */ u4(
            XYDropdown,
            {
              options: Y_OPTIONS,
              value: yValue,
              onChange: handleY,
              ariaLabel: "Y alignment",
              axisLabel: "Y",
              tooltip: yProperty,
              disabled: directionMixed
            }
          ) })
        ] })
      ] }),
      /* @__PURE__ */ u4("div", { class: `cortex-flex-controls__gap${isDimmed(dimmedProperties, "row-gap", "column-gap") ? " cortex-control--dimmed" : ""}`, children: [
        gapLocked ? /* @__PURE__ */ u4(
          NumericInput,
          {
            value: gapValue,
            unit: "px",
            prefix: "Gap",
            tooltip: "Gap (row-gap + column-gap)",
            min: 0,
            mixed: gapMixed,
            tokenFamily: "spacing",
            onChange: handleGapChange,
            onScrub: handleGapScrub,
            onScrubEnd: handleGapScrubEnd
          }
        ) : /* @__PURE__ */ u4(k, { children: [
          /* @__PURE__ */ u4(
            NumericInput,
            {
              value: columnGap,
              unit: "px",
              prefix: "Cols",
              tooltip: "Column gap",
              min: 0,
              mixed: mixedProperties?.has("column-gap"),
              tokenFamily: "spacing",
              onChange: handleColumnGapChange,
              onScrub: handleColumnGapScrub,
              onScrubEnd: handleColumnGapScrubEnd
            }
          ),
          /* @__PURE__ */ u4(
            NumericInput,
            {
              value: rowGap,
              unit: "px",
              prefix: "Rows",
              tooltip: "Row gap",
              min: 0,
              mixed: mixedProperties?.has("row-gap"),
              tokenFamily: "spacing",
              onChange: handleRowGapChange,
              onScrub: handleRowGapScrub,
              onScrubEnd: handleRowGapScrubEnd
            }
          )
        ] }),
        /* @__PURE__ */ u4(
          "button",
          {
            class: `cortex-lock-btn${gapLocked ? " cortex-lock-btn--active" : ""}`,
            type: "button",
            "aria-pressed": gapLocked ? "true" : "false",
            "aria-label": gapLocked ? "Unlock gap axes" : "Lock gap axes",
            "data-tooltip": gapLocked ? "Unlock gap axes" : "Lock gap axes",
            onClick: toggleGapLock,
            children: gapLocked ? /* @__PURE__ */ u4(Lock, { size: 14 }) : /* @__PURE__ */ u4(LockOpen, { size: 14 })
          }
        )
      ] }),
      /* @__PURE__ */ u4(ExpandableOptions, { label: "More options", children: /* @__PURE__ */ u4("div", { class: `cortex-flex-controls__wrap${isDimmed(dimmedProperties, "flex-wrap") ? " cortex-control--dimmed" : ""}`, children: /* @__PURE__ */ u4(
        SegmentedControl,
        {
          options: WRAP_OPTIONS,
          value: flexWrap,
          onChange: handleWrap,
          mixed: mixedProperties?.has("flex-wrap")
        }
      ) }) })
    ] });
  }

  // src/browser/components/sections/GridControls.tsx
  var GRID_COUNT_REQUIRES_SIMPLE_TOOLTIP = "Grid count requires repeat(N, 1fr)", SIMPLE_RE = /^\s*repeat\(\s*(\d+)\s*,\s*1fr\s*\)\s*$/, RESPONSIVE_RE = /^\s*repeat\(\s*(auto-fit|auto-fill)\s*,\s*minmax\(\s*(\d+)px\s*,\s*1fr\s*\)\s*\)\s*$/;
  function parseGridTemplate(template) {
    let simple = SIMPLE_RE.exec(template);
    if (simple)
      return { tier: "simple", count: parseInt(simple[1], 10) };
    let responsive = RESPONSIVE_RE.exec(template);
    return responsive ? {
      tier: "responsive",
      autoMode: responsive[1],
      minWidth: parseInt(responsive[2], 10)
    } : { tier: "complex", raw: template };
  }
  function flexAlignToGridAlign(value) {
    return value === "flex-start" ? "start" : value === "flex-end" ? "end" : value;
  }
  function gridAlignToFlexAlign(value) {
    return value === "start" ? "flex-start" : value === "end" ? "flex-end" : value;
  }
  var DIRECTION_OPTIONS2 = [
    { value: "row", icon: /* @__PURE__ */ u4(ArrowRight, { size: 14 }), title: "Row" },
    { value: "column", icon: /* @__PURE__ */ u4(ArrowDown, { size: 14 }), title: "Column" }
  ], GRID_X_OPTIONS = [
    { value: "start", label: "Left", hint: "Align items to the left of their grid cell." },
    { value: "center", label: "Center", hint: "Center items horizontally in their grid cell." },
    { value: "end", label: "Right", hint: "Align items to the right of their grid cell." },
    { value: "stretch", label: "Stretch", hint: "Stretch items to fill the grid cell width." }
  ], GRID_Y_OPTIONS = [
    { value: "start", label: "Top", hint: "Align items to the top of their grid cell." },
    { value: "center", label: "Center", hint: "Center items vertically in their grid cell." },
    { value: "end", label: "Bottom", hint: "Align items to the bottom of their grid cell." },
    { value: "stretch", label: "Stretch", hint: "Stretch items to fill the grid cell height." },
    { value: "baseline", label: "Baseline", hint: "Align items along their text baseline." }
  ];
  function GridControls({
    values,
    onChange,
    onScrub,
    onScrubEnd,
    dimmedProperties,
    mixedProperties
  }) {
    let {
      gridTemplateColumns,
      gridTemplateRows,
      gridAutoFlow,
      justifyItems,
      alignItems,
      rowGap,
      columnGap
    } = values, cols = T2(() => parseGridTemplate(gridTemplateColumns), [gridTemplateColumns]), rows = T2(() => parseGridTemplate(gridTemplateRows), [gridTemplateRows]), colsCountEditable = cols.tier === "simple", rowsCountEditable = rows.tier === "simple", [gapLocked, setGapLocked] = d2(!0), toggleGapLock = q2(() => setGapLocked((p3) => !p3), []), handleDirection = q2(
      (v3) => onChange({ property: "grid-auto-flow", value: v3 }),
      [onChange]
    ), handleGridJustify = q2(
      (v3) => onChange({ property: "justify-items", value: flexAlignToGridAlign(v3) }),
      [onChange]
    ), handleGridAlign = q2(
      (v3) => onChange({ property: "align-items", value: flexAlignToGridAlign(v3) }),
      [onChange]
    ), handleGridDistribute = q2(
      (axis, v3) => {
        onChange({ property: axis === "main" ? "justify-content" : "align-content", value: v3 });
      },
      [onChange]
    ), handleX = q2(
      (v3) => onChange({ property: "justify-items", value: v3 }),
      [onChange]
    ), handleY = q2(
      (v3) => onChange({ property: "align-items", value: v3 }),
      [onChange]
    ), handleColsCountChange = q2(
      (v3) => {
        cols.tier === "simple" && onChange({
          property: "grid-template-columns",
          value: `repeat(${v3}, 1fr)`
        });
      },
      [onChange, cols.tier]
    ), handleRowsCountChange = q2(
      (v3) => {
        rows.tier === "simple" && onChange({
          property: "grid-template-rows",
          value: `repeat(${v3}, 1fr)`
        });
      },
      [onChange, rows.tier]
    ), handleMinWidthChange = q2(
      (v3) => {
        cols.tier === "responsive" && onChange({
          property: "grid-template-columns",
          value: `repeat(${cols.autoMode}, minmax(${v3}px, 1fr))`
        });
      },
      [onChange, cols]
    ), handleGapChange = q2(
      (v3) => {
        onChange({ property: "row-gap", value: `${v3}px` }), onChange({ property: "column-gap", value: `${v3}px` });
      },
      [onChange]
    ), handleGapScrub = q2(
      (v3) => {
        onScrub && (onScrub({ property: "row-gap", value: `${v3}px` }), onScrub({ property: "column-gap", value: `${v3}px` }));
      },
      [onScrub]
    ), handleGapScrubEnd = q2(
      (v3) => {
        onScrubEnd && (onScrubEnd({ property: "row-gap", value: `${v3}px` }), onScrubEnd({ property: "column-gap", value: `${v3}px` }));
      },
      [onScrubEnd]
    ), handleColumnGapChange = q2(
      (v3) => onChange({ property: "column-gap", value: `${v3}px` }),
      [onChange]
    ), handleColumnGapScrub = q2(
      (v3) => {
        onScrub && onScrub({ property: "column-gap", value: `${v3}px` });
      },
      [onScrub]
    ), handleColumnGapScrubEnd = q2(
      (v3) => {
        onScrubEnd && onScrubEnd({ property: "column-gap", value: `${v3}px` });
      },
      [onScrubEnd]
    ), handleRowGapChange = q2(
      (v3) => onChange({ property: "row-gap", value: `${v3}px` }),
      [onChange]
    ), handleRowGapScrub = q2(
      (v3) => {
        onScrub && onScrub({ property: "row-gap", value: `${v3}px` });
      },
      [onScrub]
    ), handleRowGapScrubEnd = q2(
      (v3) => {
        onScrubEnd && onScrubEnd({ property: "row-gap", value: `${v3}px` });
      },
      [onScrubEnd]
    );
    return /* @__PURE__ */ u4("div", { class: "cortex-grid-controls", children: [
      /* @__PURE__ */ u4("div", { class: `cortex-grid-controls__template${isDimmed(dimmedProperties, "grid-template-columns", "grid-template-rows", "grid-auto-flow") ? " cortex-control--dimmed" : ""}`, children: [
        /* @__PURE__ */ u4("div", { class: "cortex-grid-controls__cols", children: /* @__PURE__ */ u4(
          NumericInput,
          {
            value: "count" in cols ? cols.count : 1,
            label: "Cols",
            tooltip: colsCountEditable ? "Columns (repeat count)" : GRID_COUNT_REQUIRES_SIMPLE_TOOLTIP,
            min: 1,
            disabled: !colsCountEditable,
            mixed: mixedProperties?.has("grid-template-columns"),
            onChange: handleColsCountChange
          }
        ) }),
        /* @__PURE__ */ u4("div", { class: "cortex-grid-controls__rows", children: /* @__PURE__ */ u4(
          NumericInput,
          {
            value: "count" in rows ? rows.count : 1,
            label: "Rows",
            tooltip: rowsCountEditable ? "Rows (repeat count)" : GRID_COUNT_REQUIRES_SIMPLE_TOOLTIP,
            min: 1,
            disabled: !rowsCountEditable,
            mixed: mixedProperties?.has("grid-template-rows"),
            onChange: handleRowsCountChange
          }
        ) }),
        /* @__PURE__ */ u4(
          SegmentedControl,
          {
            options: DIRECTION_OPTIONS2,
            value: gridAutoFlow,
            onChange: handleDirection,
            mixed: mixedProperties?.has("grid-auto-flow")
          }
        )
      ] }),
      /* @__PURE__ */ u4("div", { class: `cortex-grid-controls__align${isDimmed(dimmedProperties, "justify-items", "align-items", "justify-content", "align-content") ? " cortex-control--dimmed" : ""}`, children: [
        /* @__PURE__ */ u4(
          AlignmentGrid,
          {
            justifyValue: gridAlignToFlexAlign(justifyItems),
            alignValue: gridAlignToFlexAlign(alignItems),
            onJustify: handleGridJustify,
            onAlign: handleGridAlign,
            onDistribute: handleGridDistribute,
            label: "Grid alignment grid"
          }
        ),
        /* @__PURE__ */ u4("div", { class: "cortex-grid-controls__xy", children: [
          /* @__PURE__ */ u4("div", { "data-xy-axis": "x", class: "cortex-grid-controls__xy-field", children: /* @__PURE__ */ u4(
            XYDropdown,
            {
              options: GRID_X_OPTIONS,
              value: justifyItems,
              onChange: handleX,
              ariaLabel: "X alignment",
              axisLabel: "X",
              tooltip: "justify-items"
            }
          ) }),
          /* @__PURE__ */ u4("div", { "data-xy-axis": "y", class: "cortex-grid-controls__xy-field", children: /* @__PURE__ */ u4(
            XYDropdown,
            {
              options: GRID_Y_OPTIONS,
              value: alignItems,
              onChange: handleY,
              ariaLabel: "Y alignment",
              axisLabel: "Y",
              tooltip: "align-items"
            }
          ) })
        ] })
      ] }),
      /* @__PURE__ */ u4("div", { class: `cortex-grid-controls__gap${isDimmed(dimmedProperties, "row-gap", "column-gap") ? " cortex-control--dimmed" : ""}`, children: [
        gapLocked ? /* @__PURE__ */ u4(
          NumericInput,
          {
            value: rowGap,
            unit: "px",
            prefix: "Gap",
            tooltip: "Gap (row-gap + column-gap)",
            min: 0,
            mixed: mixedProperties?.has("row-gap") || mixedProperties?.has("column-gap"),
            tokenFamily: "spacing",
            onChange: handleGapChange,
            onScrub: handleGapScrub,
            onScrubEnd: handleGapScrubEnd
          }
        ) : /* @__PURE__ */ u4(k, { children: [
          /* @__PURE__ */ u4(
            NumericInput,
            {
              value: columnGap,
              unit: "px",
              prefix: "Cols",
              tooltip: "Column gap",
              min: 0,
              mixed: mixedProperties?.has("column-gap"),
              tokenFamily: "spacing",
              onChange: handleColumnGapChange,
              onScrub: handleColumnGapScrub,
              onScrubEnd: handleColumnGapScrubEnd
            }
          ),
          /* @__PURE__ */ u4(
            NumericInput,
            {
              value: rowGap,
              unit: "px",
              prefix: "Rows",
              tooltip: "Row gap",
              min: 0,
              mixed: mixedProperties?.has("row-gap"),
              tokenFamily: "spacing",
              onChange: handleRowGapChange,
              onScrub: handleRowGapScrub,
              onScrubEnd: handleRowGapScrubEnd
            }
          )
        ] }),
        /* @__PURE__ */ u4(
          "button",
          {
            class: `cortex-lock-btn${gapLocked ? " cortex-lock-btn--active" : ""}`,
            type: "button",
            "aria-pressed": gapLocked ? "true" : "false",
            "aria-label": gapLocked ? "Unlock gap axes" : "Lock gap axes",
            "data-tooltip": gapLocked ? "Unlock gap axes" : "Lock gap axes",
            onClick: toggleGapLock,
            children: gapLocked ? /* @__PURE__ */ u4(Lock, { size: 14 }) : /* @__PURE__ */ u4(LockOpen, { size: 14 })
          }
        )
      ] })
    ] });
  }

  // src/browser/components/controls/SizingDropdown.tsx
  var MODE_LABELS = {
    fixed: "px",
    fit: "fit",
    fill: "fill"
  }, MODE_DISPLAY = {
    fixed: "Fixed (px)",
    fit: "Fit contents",
    fill: "Fill container"
  }, MODES = ["fixed", "fit", "fill"];
  function SizingDropdown({
    mode,
    minEnabled,
    maxEnabled,
    onModeChange,
    onToggleMin,
    onToggleMax,
    dimension = "Width"
  }) {
    let [isOpen, setIsOpen] = d2(!1), triggerRef = A2(null), menuRef = A2(null);
    y2(() => {
      if (!isOpen || !triggerRef.current || !menuRef.current) return;
      let cancelled = !1, trigger = triggerRef.current, menu = menuRef.current;
      return menu.style.width = `${Math.max(trigger.offsetWidth, 140)}px`, computePosition2(trigger, menu, {
        placement: "bottom-start",
        middleware: [flip2(), shift2()]
      }).then(({ x: x3, y: y3 }) => {
        !cancelled && menuRef.current && (menuRef.current.style.left = `${x3}px`, menuRef.current.style.top = `${y3}px`);
      }).catch(() => {
        if (!cancelled && triggerRef.current && menuRef.current) {
          let rect = trigger.getBoundingClientRect();
          menuRef.current.style.left = `${rect.left}px`, menuRef.current.style.top = `${rect.bottom}px`;
        }
      }), () => {
        cancelled = !0;
      };
    }, [isOpen]);
    let open = q2(() => {
      setIsOpen(!0);
    }, []), close = q2(() => {
      setIsOpen(!1);
    }, []), handleModeClick = q2(
      (m3) => {
        onModeChange(m3), close();
      },
      [onModeChange, close]
    ), handleKeyDown = q2(
      (e4) => {
        e4.key === "Escape" && (e4.preventDefault(), close());
      },
      [close]
    );
    return /* @__PURE__ */ u4("div", { class: "cortex-sizing", children: [
      /* @__PURE__ */ u4(
        "button",
        {
          ref: triggerRef,
          class: "cortex-sizing-trigger",
          type: "button",
          "aria-haspopup": "menu",
          "aria-expanded": isOpen ? "true" : "false",
          onClick: isOpen ? close : open,
          children: [
            /* @__PURE__ */ u4("span", { class: "cortex-sizing-trigger__label", children: MODE_LABELS[mode] }),
            /* @__PURE__ */ u4("span", { class: `cortex-sizing-trigger__chevron${isOpen ? " cortex-sizing-trigger__chevron--open" : ""}`, children: /* @__PURE__ */ u4(ChevronDown, { size: 10 }) })
          ]
        }
      ),
      isOpen && /* @__PURE__ */ u4(k, { children: [
        /* @__PURE__ */ u4("div", { class: "cortex-sizing-backdrop", onClick: close }),
        /* @__PURE__ */ u4(
          "div",
          {
            ref: menuRef,
            class: "cortex-sizing-menu",
            role: "menu",
            style: { position: "fixed" },
            onKeyDown: handleKeyDown,
            children: [
              MODES.map((m3) => /* @__PURE__ */ u4(
                "div",
                {
                  class: [
                    "cortex-sizing-menu__item",
                    m3 === mode && "cortex-sizing-menu__item--active"
                  ].filter(Boolean).join(" "),
                  role: "menuitemradio",
                  "aria-checked": m3 === mode ? "true" : "false",
                  "data-value": m3,
                  onClick: () => handleModeClick(m3),
                  children: [
                    /* @__PURE__ */ u4("span", { class: `cortex-sizing-menu__radio${m3 === mode ? " cortex-sizing-menu__radio--active" : ""}` }),
                    MODE_DISPLAY[m3]
                  ]
                },
                m3
              )),
              /* @__PURE__ */ u4("div", { class: "cortex-sizing-menu__separator" }),
              /* @__PURE__ */ u4(
                "div",
                {
                  class: [
                    "cortex-sizing-menu__item",
                    "cortex-sizing-menu__item--toggle",
                    minEnabled && "cortex-sizing-menu__item--checked"
                  ].filter(Boolean).join(" "),
                  role: "menuitemcheckbox",
                  "aria-checked": minEnabled ? "true" : "false",
                  "data-action": "toggle-min",
                  onClick: onToggleMin,
                  children: [
                    /* @__PURE__ */ u4("span", { class: "cortex-sizing-menu__indicator", children: minEnabled && /* @__PURE__ */ u4(Check, { size: 12 }) }),
                    "Add Min ",
                    dimension
                  ]
                }
              ),
              /* @__PURE__ */ u4(
                "div",
                {
                  class: [
                    "cortex-sizing-menu__item",
                    "cortex-sizing-menu__item--toggle",
                    maxEnabled && "cortex-sizing-menu__item--checked"
                  ].filter(Boolean).join(" "),
                  role: "menuitemcheckbox",
                  "aria-checked": maxEnabled ? "true" : "false",
                  "data-action": "toggle-max",
                  onClick: onToggleMax,
                  children: [
                    /* @__PURE__ */ u4("span", { class: "cortex-sizing-menu__indicator", children: maxEnabled && /* @__PURE__ */ u4(Check, { size: 12 }) }),
                    "Add Max ",
                    dimension
                  ]
                }
              )
            ]
          }
        )
      ] })
    ] });
  }

  // src/browser/components/sections/SizingControls.tsx
  var DIMENSION_REQUIRES_FIXED_TOOLTIP = "Switch to Fixed (px) to edit dimensions", ASPECT_LOCK_REQUIRES_FIXED_TOOLTIP = "Aspect lock requires fixed dimensions";
  function deriveSizingMode(value) {
    return value === "fit-content" ? "fit" : value === "100%" ? "fill" : "fixed";
  }
  function isMinEnabled(value) {
    let num = parseFloat(value);
    return !isNaN(num) && num > 0;
  }
  function isMaxEnabled(value) {
    return value !== "none" && value !== "";
  }
  function SizingControls({
    values,
    onChange,
    onScrub,
    onScrubEnd,
    dimmedProperties,
    mixedProperties,
    stale
  }) {
    let [aspectLocked, setAspectLocked] = d2(!1), widthMode = deriveSizingMode(values.width), heightMode = deriveSizingMode(values.height), minWidthEnabled = isMinEnabled(values.minWidth), maxWidthEnabled = isMaxEnabled(values.maxWidth), minHeightEnabled = isMinEnabled(values.minHeight), maxHeightEnabled = isMaxEnabled(values.maxHeight), widthNum = parseFloat(values.width), heightNum = parseFloat(values.height), isAutoWidth = isNaN(widthNum), isAutoHeight = isNaN(heightNum), canLockAspect = widthMode === "fixed" && heightMode === "fixed", widthDisabled = widthMode !== "fixed", heightDisabled = heightMode !== "fixed", lockUiActive = canLockAspect && aspectLocked;
    y2(() => {
      canLockAspect || setAspectLocked(!1);
    }, [canLockAspect]);
    let aspectRatio = canLockAspect && !isAutoWidth && !isAutoHeight && heightNum > 0 ? widthNum / heightNum : 1, handleWidthChange = q2(
      (v3) => {
        widthDisabled || (onChange({ property: "width", value: `${v3}px` }), aspectLocked && canLockAspect && aspectRatio > 0 && onChange({ property: "height", value: `${Math.round(v3 / aspectRatio)}px` }));
      },
      [onChange, widthDisabled, aspectLocked, canLockAspect, aspectRatio]
    ), handleWidthScrub = q2(
      (v3) => {
        widthDisabled || (onScrub && onScrub({ property: "width", value: `${v3}px` }), aspectLocked && canLockAspect && aspectRatio > 0 && onScrub && onScrub({ property: "height", value: `${Math.round(v3 / aspectRatio)}px` }));
      },
      [onScrub, widthDisabled, aspectLocked, canLockAspect, aspectRatio]
    ), handleWidthScrubEnd = q2(
      (v3) => {
        widthDisabled || (onScrubEnd && onScrubEnd({ property: "width", value: `${v3}px` }), aspectLocked && canLockAspect && aspectRatio > 0 && onScrubEnd && onScrubEnd({ property: "height", value: `${Math.round(v3 / aspectRatio)}px` }));
      },
      [onScrubEnd, widthDisabled, aspectLocked, canLockAspect, aspectRatio]
    ), handleHeightChange = q2(
      (v3) => {
        heightDisabled || (onChange({ property: "height", value: `${v3}px` }), aspectLocked && canLockAspect && aspectRatio > 0 && onChange({ property: "width", value: `${Math.round(v3 * aspectRatio)}px` }));
      },
      [onChange, heightDisabled, aspectLocked, canLockAspect, aspectRatio]
    ), handleHeightScrub = q2(
      (v3) => {
        heightDisabled || (onScrub && onScrub({ property: "height", value: `${v3}px` }), aspectLocked && canLockAspect && aspectRatio > 0 && onScrub && onScrub({ property: "width", value: `${Math.round(v3 * aspectRatio)}px` }));
      },
      [onScrub, heightDisabled, aspectLocked, canLockAspect, aspectRatio]
    ), handleHeightScrubEnd = q2(
      (v3) => {
        heightDisabled || (onScrubEnd && onScrubEnd({ property: "height", value: `${v3}px` }), aspectLocked && canLockAspect && aspectRatio > 0 && onScrubEnd && onScrubEnd({ property: "width", value: `${Math.round(v3 * aspectRatio)}px` }));
      },
      [onScrubEnd, heightDisabled, aspectLocked, canLockAspect, aspectRatio]
    ), handleToggleLock = q2(() => {
      canLockAspect && setAspectLocked((v3) => !v3);
    }, [canLockAspect]), handleWidthModeChange = q2((mode) => {
      onChange(mode === "fit" ? { property: "width", value: "fit-content" } : mode === "fill" ? { property: "width", value: "100%" } : { property: "width", value: `${isAutoWidth ? 0 : widthNum}px` });
    }, [onChange, isAutoWidth, widthNum]), handleHeightModeChange = q2((mode) => {
      onChange(mode === "fit" ? { property: "height", value: "fit-content" } : mode === "fill" ? { property: "height", value: "100%" } : { property: "height", value: `${isAutoHeight ? 0 : heightNum}px` });
    }, [onChange, isAutoHeight, heightNum]), handleMinWidthChange = q2(
      (v3) => onChange({ property: "min-width", value: `${v3}px` }),
      [onChange]
    ), handleMaxWidthChange = q2(
      (v3) => onChange({ property: "max-width", value: `${v3}px` }),
      [onChange]
    ), handleMinHeightChange = q2(
      (v3) => onChange({ property: "min-height", value: `${v3}px` }),
      [onChange]
    ), handleMaxHeightChange = q2(
      (v3) => onChange({ property: "max-height", value: `${v3}px` }),
      [onChange]
    ), handleToggleMinWidth = q2(() => {
      onChange(minWidthEnabled ? { property: "min-width", value: "0px" } : { property: "min-width", value: "1px" });
    }, [onChange, minWidthEnabled]), handleToggleMaxWidth = q2(() => {
      onChange(maxWidthEnabled ? { property: "max-width", value: "none" } : { property: "max-width", value: "9999px" });
    }, [onChange, maxWidthEnabled]), handleToggleMinHeight = q2(() => {
      onChange(minHeightEnabled ? { property: "min-height", value: "0px" } : { property: "min-height", value: "1px" });
    }, [onChange, minHeightEnabled]), handleToggleMaxHeight = q2(() => {
      onChange(maxHeightEnabled ? { property: "max-height", value: "none" } : { property: "max-height", value: "9999px" });
    }, [onChange, maxHeightEnabled]), isClipped = values.overflow === "hidden", handleClipToggle = q2(() => {
      onChange({ property: "overflow", value: isClipped ? "visible" : "hidden" });
    }, [onChange, isClipped]), isBorderBox = values.boxSizing === "border-box", handleBoxSizingToggle = q2(() => {
      onChange({ property: "box-sizing", value: isBorderBox ? "content-box" : "border-box" });
    }, [onChange, isBorderBox]);
    return /* @__PURE__ */ u4("div", { class: "cortex-sizing-controls", "data-testid": "sizing-controls", children: [
      /* @__PURE__ */ u4("span", { class: "cortex-subsection-label", children: "Size" }),
      /* @__PURE__ */ u4("div", { class: "cortex-layout-section__sizing", children: [
        /* @__PURE__ */ u4("div", { class: `cortex-layout-section__sizing-field${isDimmed(dimmedProperties, "width", "min-width", "max-width") ? " cortex-control--dimmed" : ""}`, children: [
          /* @__PURE__ */ u4(
            NumericInput,
            {
              value: isAutoWidth ? 0 : widthNum,
              label: "W",
              tooltip: widthDisabled ? DIMENSION_REQUIRES_FIXED_TOOLTIP : "Width",
              min: 0,
              disabled: widthDisabled,
              mixed: mixedProperties?.has("width"),
              stale,
              onChange: handleWidthChange,
              onScrub: handleWidthScrub,
              onScrubEnd: handleWidthScrubEnd
            }
          ),
          /* @__PURE__ */ u4(
            SizingDropdown,
            {
              mode: widthMode,
              minEnabled: minWidthEnabled,
              maxEnabled: maxWidthEnabled,
              onModeChange: handleWidthModeChange,
              onToggleMin: handleToggleMinWidth,
              onToggleMax: handleToggleMaxWidth,
              dimension: "Width"
            }
          )
        ] }),
        /* @__PURE__ */ u4("div", { class: `cortex-layout-section__sizing-field${isDimmed(dimmedProperties, "height", "min-height", "max-height") ? " cortex-control--dimmed" : ""}`, children: [
          /* @__PURE__ */ u4(
            NumericInput,
            {
              value: isAutoHeight ? 0 : heightNum,
              label: "H",
              tooltip: heightDisabled ? DIMENSION_REQUIRES_FIXED_TOOLTIP : "Height",
              min: 0,
              disabled: heightDisabled,
              mixed: mixedProperties?.has("height"),
              stale,
              onChange: handleHeightChange,
              onScrub: handleHeightScrub,
              onScrubEnd: handleHeightScrubEnd
            }
          ),
          /* @__PURE__ */ u4(
            SizingDropdown,
            {
              mode: heightMode,
              minEnabled: minHeightEnabled,
              maxEnabled: maxHeightEnabled,
              onModeChange: handleHeightModeChange,
              onToggleMin: handleToggleMinHeight,
              onToggleMax: handleToggleMaxHeight,
              dimension: "Height"
            }
          )
        ] }),
        /* @__PURE__ */ u4(
          "button",
          {
            type: "button",
            class: `cortex-lock-btn${lockUiActive ? " cortex-lock-btn--active" : ""}${canLockAspect ? "" : " cortex-lock-btn--disabled"}`,
            "aria-pressed": lockUiActive ? "true" : "false",
            "aria-disabled": canLockAspect ? void 0 : "true",
            "aria-label": lockUiActive ? "Unlock aspect ratio" : "Lock aspect ratio",
            "data-tooltip": canLockAspect ? lockUiActive ? "Unlock aspect ratio" : "Lock aspect ratio" : ASPECT_LOCK_REQUIRES_FIXED_TOOLTIP,
            onClick: handleToggleLock,
            children: lockUiActive ? /* @__PURE__ */ u4(Lock, { size: 14 }) : /* @__PURE__ */ u4(LockOpen, { size: 14 })
          }
        )
      ] }),
      (minWidthEnabled || maxWidthEnabled || minHeightEnabled || maxHeightEnabled) && /* @__PURE__ */ u4("div", { class: "cortex-layout-section__minmax", children: [
        minWidthEnabled && /* @__PURE__ */ u4("div", { class: "cortex-layout-section__minmax-field", children: [
          /* @__PURE__ */ u4(
            NumericInput,
            {
              value: parseFloat(values.minWidth) || 0,
              unit: "px",
              label: "Min",
              tooltip: "Min Width",
              min: 0,
              mixed: mixedProperties?.has("min-width"),
              stale,
              onChange: handleMinWidthChange
            }
          ),
          /* @__PURE__ */ u4(
            "button",
            {
              class: "cortex-layout-section__minmax-dismiss",
              type: "button",
              "data-tooltip": "Remove Min Width",
              "aria-label": "Remove Min Width",
              onClick: handleToggleMinWidth,
              children: /* @__PURE__ */ u4(X, { size: 14 })
            }
          )
        ] }),
        maxWidthEnabled && /* @__PURE__ */ u4("div", { class: "cortex-layout-section__minmax-field", children: [
          /* @__PURE__ */ u4(
            NumericInput,
            {
              value: values.maxWidth === "none" ? 0 : parseFloat(values.maxWidth) || 0,
              unit: "px",
              label: "Max",
              tooltip: "Max Width",
              min: 0,
              mixed: mixedProperties?.has("max-width"),
              stale,
              onChange: handleMaxWidthChange
            }
          ),
          /* @__PURE__ */ u4(
            "button",
            {
              class: "cortex-layout-section__minmax-dismiss",
              type: "button",
              "data-tooltip": "Remove Max Width",
              "aria-label": "Remove Max Width",
              onClick: handleToggleMaxWidth,
              children: /* @__PURE__ */ u4(X, { size: 14 })
            }
          )
        ] }),
        minHeightEnabled && /* @__PURE__ */ u4("div", { class: "cortex-layout-section__minmax-field", children: [
          /* @__PURE__ */ u4(
            NumericInput,
            {
              value: parseFloat(values.minHeight) || 0,
              unit: "px",
              label: "Min",
              tooltip: "Min Height",
              min: 0,
              mixed: mixedProperties?.has("min-height"),
              stale,
              onChange: handleMinHeightChange
            }
          ),
          /* @__PURE__ */ u4(
            "button",
            {
              class: "cortex-layout-section__minmax-dismiss",
              type: "button",
              "data-tooltip": "Remove Min Height",
              "aria-label": "Remove Min Height",
              onClick: handleToggleMinHeight,
              children: /* @__PURE__ */ u4(X, { size: 14 })
            }
          )
        ] }),
        maxHeightEnabled && /* @__PURE__ */ u4("div", { class: "cortex-layout-section__minmax-field", children: [
          /* @__PURE__ */ u4(
            NumericInput,
            {
              value: values.maxHeight === "none" ? 0 : parseFloat(values.maxHeight) || 0,
              unit: "px",
              label: "Max",
              tooltip: "Max Height",
              min: 0,
              mixed: mixedProperties?.has("max-height"),
              stale,
              onChange: handleMaxHeightChange
            }
          ),
          /* @__PURE__ */ u4(
            "button",
            {
              class: "cortex-layout-section__minmax-dismiss",
              type: "button",
              "data-tooltip": "Remove Max Height",
              "aria-label": "Remove Max Height",
              onClick: handleToggleMaxHeight,
              children: /* @__PURE__ */ u4(X, { size: 14 })
            }
          )
        ] })
      ] }),
      /* @__PURE__ */ u4("div", { class: `cortex-sizing-controls__toggles${isDimmed(dimmedProperties, "overflow", "box-sizing") ? " cortex-control--dimmed" : ""}`, children: [
        /* @__PURE__ */ u4(
          "label",
          {
            class: "cortex-checkbox",
            role: "checkbox",
            "aria-checked": isClipped ? "true" : "false",
            "data-tooltip": "Clip content (overflow: hidden)",
            onClick: handleClipToggle,
            children: [
              /* @__PURE__ */ u4("span", { class: `cortex-checkbox__box${isClipped ? " cortex-checkbox__box--checked" : ""}`, children: isClipped && /* @__PURE__ */ u4(Check, { size: 12 }) }),
              /* @__PURE__ */ u4("span", { class: "cortex-checkbox__label", children: "Clip content" })
            ]
          }
        ),
        /* @__PURE__ */ u4(
          "label",
          {
            class: "cortex-checkbox",
            role: "checkbox",
            "aria-checked": isBorderBox ? "true" : "false",
            "data-tooltip": "Border box sizing",
            onClick: handleBoxSizingToggle,
            children: [
              /* @__PURE__ */ u4("span", { class: `cortex-checkbox__box${isBorderBox ? " cortex-checkbox__box--checked" : ""}`, children: isBorderBox && /* @__PURE__ */ u4(Check, { size: 12 }) }),
              /* @__PURE__ */ u4("span", { class: "cortex-checkbox__label", children: "Border box" })
            ]
          }
        )
      ] })
    ] });
  }

  // src/browser/components/sections/SpacingControls.tsx
  function SpacingRow({
    short,
    values,
    prefix,
    allowNegative,
    locked,
    onToggleLock,
    onChange,
    onScrub,
    onScrubEnd,
    dimmed,
    mixedProperties,
    stale
  }) {
    let fireChange = q2(
      (cb, sides2, value) => {
        if (!cb) return;
        let formatted = `${value}px`;
        for (let side of sides2) cb({ property: `${prefix}-${side}`, value: formatted });
      },
      [prefix]
    ), handleHorizontalChange = q2(
      (v3) => {
        fireChange(onChange, ["left", "right"], v3), locked && fireChange(onChange, ["top", "bottom"], v3);
      },
      [onChange, locked, fireChange]
    ), handleHorizontalScrub = q2(
      (v3) => {
        fireChange(onScrub, ["left", "right"], v3), locked && fireChange(onScrub, ["top", "bottom"], v3);
      },
      [onScrub, locked, fireChange]
    ), handleHorizontalScrubEnd = q2(
      (v3) => {
        fireChange(onScrubEnd, ["left", "right"], v3), locked && fireChange(onScrubEnd, ["top", "bottom"], v3);
      },
      [onScrubEnd, locked, fireChange]
    ), handleVerticalChange = q2(
      (v3) => {
        fireChange(onChange, ["top", "bottom"], v3), locked && fireChange(onChange, ["left", "right"], v3);
      },
      [onChange, locked, fireChange]
    ), handleVerticalScrub = q2(
      (v3) => {
        fireChange(onScrub, ["top", "bottom"], v3), locked && fireChange(onScrub, ["left", "right"], v3);
      },
      [onScrub, locked, fireChange]
    ), handleVerticalScrubEnd = q2(
      (v3) => {
        fireChange(onScrubEnd, ["top", "bottom"], v3), locked && fireChange(onScrubEnd, ["left", "right"], v3);
      },
      [onScrubEnd, locked, fireChange]
    ), horizontal = values.left, vertical = values.top, horizontalDiverges = values.left !== values.right, verticalDiverges = values.top !== values.bottom;
    return /* @__PURE__ */ u4("div", { class: `cortex-spacing-row${dimmed ? " cortex-control--dimmed" : ""}`, "data-section": prefix, children: /* @__PURE__ */ u4("div", { class: "cortex-spacing-row__inputs", children: [
      /* @__PURE__ */ u4(
        NumericInput,
        {
          value: horizontal,
          unit: "px",
          prefix: /* @__PURE__ */ u4(k, { children: [
            /* @__PURE__ */ u4("span", { children: short }),
            /* @__PURE__ */ u4(ArrowLeftRight, { size: 12 })
          ] }),
          tooltip: `Horizontal ${prefix}`,
          min: allowNegative ? void 0 : 0,
          mixed: horizontalDiverges || mixedProperties?.has(`${prefix}-left`) || mixedProperties?.has(`${prefix}-right`),
          stale,
          tokenFamily: "spacing",
          onChange: handleHorizontalChange,
          onScrub: handleHorizontalScrub,
          onScrubEnd: handleHorizontalScrubEnd
        }
      ),
      /* @__PURE__ */ u4(
        "button",
        {
          class: `cortex-lock-btn${locked ? " cortex-lock-btn--active" : ""}`,
          type: "button",
          "aria-pressed": locked ? "true" : "false",
          "aria-label": locked ? "Unlock axes" : "Lock axes",
          "data-tooltip": locked ? "Unlock axes" : "Lock axes",
          onClick: onToggleLock,
          children: locked ? /* @__PURE__ */ u4(Lock, { size: 14 }) : /* @__PURE__ */ u4(LockOpen, { size: 14 })
        }
      ),
      /* @__PURE__ */ u4(
        NumericInput,
        {
          value: vertical,
          unit: "px",
          prefix: /* @__PURE__ */ u4(k, { children: [
            /* @__PURE__ */ u4("span", { children: short }),
            /* @__PURE__ */ u4(ArrowUpDown, { size: 12 })
          ] }),
          tooltip: `Vertical ${prefix}`,
          min: allowNegative ? void 0 : 0,
          mixed: verticalDiverges || mixedProperties?.has(`${prefix}-top`) || mixedProperties?.has(`${prefix}-bottom`),
          stale,
          tokenFamily: "spacing",
          onChange: handleVerticalChange,
          onScrub: handleVerticalScrub,
          onScrubEnd: handleVerticalScrubEnd
        }
      )
    ] }) });
  }
  function SpacingControls({
    padding,
    margin,
    onChange,
    onScrub,
    onScrubEnd,
    dimmedProperties,
    mixedProperties,
    stale
  }) {
    let [paddingLocked, setPaddingLocked] = d2(!1), [marginLocked, setMarginLocked] = d2(!1), togglePaddingLock = q2(() => setPaddingLocked((p3) => !p3), []), toggleMarginLock = q2(() => setMarginLocked((p3) => !p3), []);
    return /* @__PURE__ */ u4("div", { class: "cortex-spacing-controls", "data-testid": "spacing-controls", "data-section-id": "spacing", children: [
      /* @__PURE__ */ u4("span", { class: "cortex-subsection-label", children: "Spacing" }),
      /* @__PURE__ */ u4(
        SpacingRow,
        {
          short: "P",
          values: padding,
          prefix: "padding",
          allowNegative: !1,
          locked: paddingLocked,
          onToggleLock: togglePaddingLock,
          onChange,
          onScrub,
          onScrubEnd,
          dimmed: isDimmed(dimmedProperties, "padding-top", "padding-right", "padding-bottom", "padding-left"),
          mixedProperties,
          stale
        }
      ),
      /* @__PURE__ */ u4(
        SpacingRow,
        {
          short: "M",
          values: margin,
          prefix: "margin",
          allowNegative: !0,
          locked: marginLocked,
          onToggleLock: toggleMarginLock,
          onChange,
          onScrub,
          onScrubEnd,
          dimmed: isDimmed(dimmedProperties, "margin-top", "margin-right", "margin-bottom", "margin-left"),
          mixedProperties,
          stale
        }
      )
    ] });
  }

  // src/browser/components/sections/LayoutSection.tsx
  function normalizeDisplay(display) {
    return display === "inline-flex" ? "flex" : display === "inline-grid" ? "grid" : display === "inline-block" ? "block" : display;
  }
  function parseLayoutValues(cs) {
    return {
      display: normalizeDisplay(cs.display ?? "block"),
      visibility: cs.visibility ?? "visible",
      flexDirection: cs.flexDirection || "row",
      justifyContent: cs.justifyContent || "flex-start",
      alignItems: cs.alignItems || "stretch",
      rowGap: parseFloat(cs.rowGap || "0") || 0,
      columnGap: parseFloat(cs.columnGap || "0") || 0,
      flexWrap: cs.flexWrap || "nowrap",
      gridTemplateColumns: cs.gridTemplateColumns || "none",
      gridTemplateRows: cs.gridTemplateRows || "none",
      gridAutoFlow: cs.gridAutoFlow || "row",
      justifyItems: cs.justifyItems || "stretch",
      width: cs.width ?? "auto",
      height: cs.height ?? "auto",
      minWidth: cs.minWidth ?? "0px",
      maxWidth: cs.maxWidth ?? "none",
      minHeight: cs.minHeight ?? "0px",
      maxHeight: cs.maxHeight ?? "none",
      overflow: cs.overflow ?? "visible",
      boxSizing: cs.boxSizing ?? "content-box"
    };
  }
  var DISPLAY_OPTIONS = [
    { value: "block", label: "block" },
    { value: "flex", label: "flex" },
    { value: "grid", label: "grid" },
    { value: "inline", label: "inline" },
    { value: "none", label: "none" }
  ];
  function LayoutSection({
    values,
    onChange,
    onScrub,
    onScrubEnd,
    dimmedProperties,
    mixedProperties,
    spacing,
    onSpacingChange,
    onSpacingScrub,
    onSpacingScrubEnd,
    stale
  }) {
    let isFlex = values.display === "flex", isGrid = values.display === "grid", isNone = values.display === "none", handleDisplayChange = q2(
      (v3) => onChange({ property: "display", value: v3 }),
      [onChange]
    ), handleFlexChange = onChange, handleFlexScrub = onScrub, handleFlexScrubEnd = onScrubEnd, handleGridChange = onChange, handleGridScrub = onScrub, handleGridScrubEnd = onScrubEnd, flexValues = {
      flexDirection: values.flexDirection,
      justifyContent: values.justifyContent,
      alignItems: values.alignItems,
      rowGap: values.rowGap,
      columnGap: values.columnGap,
      flexWrap: values.flexWrap
    }, gridValues = {
      gridTemplateColumns: values.gridTemplateColumns,
      gridTemplateRows: values.gridTemplateRows,
      gridAutoFlow: values.gridAutoFlow,
      justifyItems: values.justifyItems,
      alignItems: values.alignItems,
      rowGap: values.rowGap,
      columnGap: values.columnGap
    };
    return /* @__PURE__ */ u4("div", { class: "cortex-layout-section", "data-section-id": "layout", children: [
      /* @__PURE__ */ u4("div", { class: `cortex-layout-section__group${isDimmed(dimmedProperties, "display") ? " cortex-control--dimmed" : ""}`, children: /* @__PURE__ */ u4(
        SegmentedControl,
        {
          options: DISPLAY_OPTIONS,
          value: values.display,
          onChange: handleDisplayChange,
          mixed: mixedProperties?.has("display")
        }
      ) }),
      isFlex && /* @__PURE__ */ u4("div", { class: "cortex-layout-section__group cortex-layout-section__reveal", children: /* @__PURE__ */ u4(
        FlexControls,
        {
          values: flexValues,
          onChange: handleFlexChange,
          onScrub: handleFlexScrub,
          onScrubEnd: handleFlexScrubEnd,
          dimmedProperties,
          mixedProperties
        }
      ) }),
      isGrid && /* @__PURE__ */ u4("div", { class: "cortex-layout-section__group cortex-layout-section__reveal", children: /* @__PURE__ */ u4(
        GridControls,
        {
          values: gridValues,
          onChange: handleGridChange,
          onScrub: handleGridScrub,
          onScrubEnd: handleGridScrubEnd,
          dimmedProperties,
          mixedProperties
        }
      ) }),
      !isNone && /* @__PURE__ */ u4("div", { class: "cortex-layout-section__group", children: /* @__PURE__ */ u4(
        SizingControls,
        {
          values: {
            width: values.width,
            height: values.height,
            minWidth: values.minWidth,
            maxWidth: values.maxWidth,
            minHeight: values.minHeight,
            maxHeight: values.maxHeight,
            overflow: values.overflow,
            boxSizing: values.boxSizing
          },
          onChange,
          onScrub,
          onScrubEnd,
          dimmedProperties,
          mixedProperties,
          stale
        }
      ) }),
      !isNone && spacing && onSpacingChange && /* @__PURE__ */ u4("div", { class: "cortex-layout-section__group", children: /* @__PURE__ */ u4(
        SpacingControls,
        {
          padding: spacing.padding,
          margin: spacing.margin,
          onChange: onSpacingChange,
          onScrub: onSpacingScrub,
          onScrubEnd: onSpacingScrubEnd,
          dimmedProperties,
          mixedProperties,
          stale
        }
      ) })
    ] });
  }

  // src/browser/components/controls/Dropdown.tsx
  function Dropdown({
    options,
    value,
    onChange,
    placeholder = "Select...",
    mixed
  }) {
    let [isOpen, setIsOpen] = d2(!1), [filter, setFilter] = d2(""), [highlightIdx, setHighlightIdx] = d2(0), triggerRef = A2(null), popoverRef = A2(null), filterRef = A2(null), dropdownId = g2(), selected = options.find((o4) => o4.value === value), selectedLabel = selected?.label ?? "", displayLabel = mixed ? "Mixed" : selectedLabel || placeholder, selectedTooltip = mixed ? "Mixed values" : selected?.tooltip, listboxId = `${dropdownId}-listbox`, filtered = T2(() => {
      if (!filter) return options;
      let lc = filter.toLowerCase();
      return options.filter((o4) => o4.label.toLowerCase().includes(lc));
    }, [options, filter]), activeOptionId = filtered[highlightIdx] ? `${dropdownId}-option-${highlightIdx}` : void 0;
    y2(() => {
      if (!isOpen || !triggerRef.current || !popoverRef.current) return;
      let cancelled = !1, trigger = triggerRef.current, popover = popoverRef.current;
      return popover.style.width = `${trigger.offsetWidth}px`, computePosition2(trigger, popover, {
        placement: "bottom-start",
        middleware: [flip2(), shift2()]
      }).then(({ x: x3, y: y3 }) => {
        !cancelled && popoverRef.current && (popoverRef.current.style.left = `${x3}px`, popoverRef.current.style.top = `${y3}px`);
      }).catch((err) => {
        if (!cancelled) {
          console.warn("[cortex] Dropdown positioning failed:", err instanceof Error ? err.message : err);
          let rect = trigger.getBoundingClientRect();
          popoverRef.current && (popoverRef.current.style.left = `${rect.left}px`, popoverRef.current.style.top = `${rect.bottom}px`);
        }
      }), () => {
        cancelled = !0;
      };
    }, [isOpen]), y2(() => {
      isOpen && (filterRef.current?.focus(), setHighlightIdx(0));
    }, [isOpen]);
    let open = q2(() => {
      setFilter(""), setIsOpen(!0);
    }, []), close = q2(() => {
      setIsOpen(!1), setFilter("");
    }, []), select = q2(
      (optValue) => {
        onChange(optValue), close();
      },
      [onChange, close]
    ), handleFilterInput = q2((e4) => {
      setFilter(e4.target.value), setHighlightIdx(0);
    }, []), handleKeyDown = q2(
      (e4) => {
        e4.key === "Escape" ? (e4.preventDefault(), close()) : e4.key === "ArrowDown" ? (e4.preventDefault(), filtered.length > 0 && setHighlightIdx((i4) => Math.min(i4 + 1, filtered.length - 1))) : e4.key === "ArrowUp" ? (e4.preventDefault(), filtered.length > 0 && setHighlightIdx((i4) => Math.max(i4 - 1, 0))) : e4.key === "Enter" && (e4.preventDefault(), filtered[highlightIdx] && select(filtered[highlightIdx].value));
      },
      [close, select, filtered, highlightIdx]
    );
    return /* @__PURE__ */ u4("div", { class: `cortex-dropdown${mixed ? " cortex-dropdown--mixed" : ""}`, children: [
      /* @__PURE__ */ u4(
        "button",
        {
          ref: triggerRef,
          class: "cortex-dropdown__trigger",
          type: "button",
          role: "combobox",
          "aria-expanded": isOpen ? "true" : "false",
          "aria-haspopup": "listbox",
          "data-tooltip": selectedTooltip,
          onClick: isOpen ? close : open,
          children: [
            /* @__PURE__ */ u4("span", { class: "cortex-dropdown__value", children: displayLabel }),
            /* @__PURE__ */ u4("span", { class: `cortex-dropdown__chevron${isOpen ? " cortex-dropdown__chevron--open" : ""}`, children: /* @__PURE__ */ u4(ChevronDown, { size: 12 }) })
          ]
        }
      ),
      isOpen && /* @__PURE__ */ u4(k, { children: [
        /* @__PURE__ */ u4("div", { class: "cortex-dropdown__backdrop", onClick: close }),
        /* @__PURE__ */ u4(
          "div",
          {
            ref: popoverRef,
            class: "cortex-dropdown__popover",
            style: { position: "fixed" },
            children: [
              /* @__PURE__ */ u4(
                "input",
                {
                  ref: filterRef,
                  class: "cortex-dropdown__filter",
                  type: "text",
                  role: "combobox",
                  "aria-autocomplete": "list",
                  "aria-controls": listboxId,
                  "aria-activedescendant": activeOptionId,
                  value: filter,
                  onInput: handleFilterInput,
                  onKeyDown: handleKeyDown,
                  placeholder: "Filter..."
                }
              ),
              /* @__PURE__ */ u4("div", { class: "cortex-dropdown__list", role: "listbox", id: listboxId, children: filtered.length === 0 ? /* @__PURE__ */ u4("div", { class: "cortex-dropdown__empty", children: "No matches" }) : filtered.map((opt, i4) => /* @__PURE__ */ u4(
                "div",
                {
                  id: `${dropdownId}-option-${i4}`,
                  class: [
                    "cortex-dropdown__option",
                    i4 === highlightIdx && "cortex-dropdown__option--active",
                    !mixed && opt.value === value && "cortex-dropdown__option--selected"
                  ].filter(Boolean).join(" "),
                  role: "option",
                  "aria-selected": !mixed && opt.value === value ? "true" : "false",
                  "data-tooltip": opt.tooltip,
                  onClick: () => select(opt.value),
                  children: opt.label
                },
                opt.value
              )) })
            ]
          }
        )
      ] })
    ] });
  }

  // node_modules/vanilla-colorful/lib/utils/math.js
  var clamp3 = (number, min2 = 0, max2 = 1) => number > max2 ? max2 : number < min2 ? min2 : number, round2 = (number, digits = 0, base = Math.pow(10, digits)) => Math.round(base * number) / base;

  // node_modules/vanilla-colorful/lib/utils/convert.js
  var angleUnits = {
    grad: 360 / 400,
    turn: 360,
    rad: 360 / (Math.PI * 2)
  }, hexToHsva = (hex) => rgbaToHsva(hexToRgba(hex)), hexToRgba = (hex) => (hex[0] === "#" && (hex = hex.substring(1)), hex.length < 6 ? {
    r: parseInt(hex[0] + hex[0], 16),
    g: parseInt(hex[1] + hex[1], 16),
    b: parseInt(hex[2] + hex[2], 16),
    a: hex.length === 4 ? round2(parseInt(hex[3] + hex[3], 16) / 255, 2) : 1
  } : {
    r: parseInt(hex.substring(0, 2), 16),
    g: parseInt(hex.substring(2, 4), 16),
    b: parseInt(hex.substring(4, 6), 16),
    a: hex.length === 8 ? round2(parseInt(hex.substring(6, 8), 16) / 255, 2) : 1
  });
  var hsvaToHex = (hsva) => rgbaToHex(hsvaToRgba(hsva)), hsvaToHsla = ({ h: h3, s: s3, v: v3, a: a4 }) => {
    let hh = (200 - s3) * v3 / 100;
    return {
      h: round2(h3),
      s: round2(hh > 0 && hh < 200 ? s3 * v3 / 100 / (hh <= 100 ? hh : 200 - hh) * 100 : 0),
      l: round2(hh / 2),
      a: round2(a4, 2)
    };
  };
  var hsvaToHslString = (hsva) => {
    let { h: h3, s: s3, l: l3 } = hsvaToHsla(hsva);
    return `hsl(${h3}, ${s3}%, ${l3}%)`;
  };
  var hsvaToRgba = ({ h: h3, s: s3, v: v3, a: a4 }) => {
    h3 = h3 / 360 * 6, s3 = s3 / 100, v3 = v3 / 100;
    let hh = Math.floor(h3), b = v3 * (1 - s3), c4 = v3 * (1 - (h3 - hh) * s3), d3 = v3 * (1 - (1 - h3 + hh) * s3), module = hh % 6;
    return {
      r: round2([v3, c4, b, b, d3, v3][module] * 255),
      g: round2([d3, v3, v3, c4, b, b][module] * 255),
      b: round2([b, b, d3, v3, v3, c4][module] * 255),
      a: round2(a4, 2)
    };
  };
  var format = (number) => {
    let hex = number.toString(16);
    return hex.length < 2 ? "0" + hex : hex;
  }, rgbaToHex = ({ r: r4, g: g3, b, a: a4 }) => {
    let alphaHex = a4 < 1 ? format(round2(a4 * 255)) : "";
    return "#" + format(r4) + format(g3) + format(b) + alphaHex;
  }, rgbaToHsva = ({ r: r4, g: g3, b, a: a4 }) => {
    let max2 = Math.max(r4, g3, b), delta = max2 - Math.min(r4, g3, b), hh = delta ? max2 === r4 ? (g3 - b) / delta : max2 === g3 ? 2 + (b - r4) / delta : 4 + (r4 - g3) / delta : 0;
    return {
      h: round2(60 * (hh < 0 ? hh + 6 : hh)),
      s: round2(max2 ? delta / max2 * 100 : 0),
      v: round2(max2 / 255 * 100),
      a: a4
    };
  };

  // node_modules/vanilla-colorful/lib/utils/compare.js
  var equalColorObjects = (first, second) => {
    if (first === second)
      return !0;
    for (let prop in first)
      if (first[prop] !== second[prop])
        return !1;
    return !0;
  };
  var equalHex = (first, second) => first.toLowerCase() === second.toLowerCase() ? !0 : equalColorObjects(hexToRgba(first), hexToRgba(second));

  // node_modules/vanilla-colorful/lib/utils/dom.js
  var cache = {}, tpl = (html) => {
    let template = cache[html];
    return template || (template = document.createElement("template"), template.innerHTML = html, cache[html] = template), template;
  }, fire = (target, type, detail) => {
    target.dispatchEvent(new CustomEvent(type, {
      bubbles: !0,
      detail
    }));
  };

  // node_modules/vanilla-colorful/lib/components/slider.js
  var hasTouched = !1, isTouch = (e4) => "touches" in e4, isValid = (event) => hasTouched && !isTouch(event) ? !1 : (hasTouched || (hasTouched = isTouch(event)), !0), pointerMove = (target, event) => {
    let pointer = isTouch(event) ? event.touches[0] : event, rect = target.el.getBoundingClientRect();
    fire(target.el, "move", target.getMove({
      x: clamp3((pointer.pageX - (rect.left + window.pageXOffset)) / rect.width),
      y: clamp3((pointer.pageY - (rect.top + window.pageYOffset)) / rect.height)
    }));
  }, keyMove = (target, event) => {
    let keyCode = event.keyCode;
    keyCode > 40 || target.xy && keyCode < 37 || keyCode < 33 || (event.preventDefault(), fire(target.el, "move", target.getMove({
      x: keyCode === 39 ? 0.01 : keyCode === 37 ? -0.01 : keyCode === 34 ? 0.05 : keyCode === 33 ? -0.05 : keyCode === 35 ? 1 : keyCode === 36 ? -1 : 0,
      y: keyCode === 40 ? 0.01 : keyCode === 38 ? -0.01 : 0
    }, !0)));
  }, Slider = class {
    constructor(root, part, aria, xy) {
      let template = tpl(`<div role="slider" tabindex="0" part="${part}" ${aria}><div part="${part}-pointer"></div></div>`);
      root.appendChild(template.content.cloneNode(!0));
      let el = root.querySelector(`[part=${part}]`);
      el.addEventListener("mousedown", this), el.addEventListener("touchstart", this), el.addEventListener("keydown", this), this.el = el, this.xy = xy, this.nodes = [el.firstChild, el];
    }
    set dragging(state) {
      let toggleEvent = state ? document.addEventListener : document.removeEventListener;
      toggleEvent(hasTouched ? "touchmove" : "mousemove", this), toggleEvent(hasTouched ? "touchend" : "mouseup", this);
    }
    handleEvent(event) {
      switch (event.type) {
        case "mousedown":
        case "touchstart":
          if (event.preventDefault(), !isValid(event) || !hasTouched && event.button != 0)
            return;
          this.el.focus(), pointerMove(this, event), this.dragging = !0;
          break;
        case "mousemove":
        case "touchmove":
          event.preventDefault(), pointerMove(this, event);
          break;
        case "mouseup":
        case "touchend":
          this.dragging = !1;
          break;
        case "keydown":
          keyMove(this, event);
          break;
      }
    }
    style(styles) {
      styles.forEach((style, i4) => {
        for (let p3 in style)
          this.nodes[i4].style.setProperty(p3, style[p3]);
      });
    }
  };

  // node_modules/vanilla-colorful/lib/components/hue.js
  var Hue = class extends Slider {
    constructor(root) {
      super(root, "hue", 'aria-label="Hue" aria-valuemin="0" aria-valuemax="360"', !1);
    }
    update({ h: h3 }) {
      this.h = h3, this.style([
        {
          left: `${h3 / 360 * 100}%`,
          color: hsvaToHslString({ h: h3, s: 100, v: 100, a: 1 })
        }
      ]), this.el.setAttribute("aria-valuenow", `${round2(h3)}`);
    }
    getMove(offset3, key) {
      return { h: key ? clamp3(this.h + offset3.x * 360, 0, 360) : 360 * offset3.x };
    }
  };

  // node_modules/vanilla-colorful/lib/components/saturation.js
  var Saturation = class extends Slider {
    constructor(root) {
      super(root, "saturation", 'aria-label="Color"', !0);
    }
    update(hsva) {
      this.hsva = hsva, this.style([
        {
          top: `${100 - hsva.v}%`,
          left: `${hsva.s}%`,
          color: hsvaToHslString(hsva)
        },
        {
          "background-color": hsvaToHslString({ h: hsva.h, s: 100, v: 100, a: 1 })
        }
      ]), this.el.setAttribute("aria-valuetext", `Saturation ${round2(hsva.s)}%, Brightness ${round2(hsva.v)}%`);
    }
    getMove(offset3, key) {
      return {
        s: key ? clamp3(this.hsva.s + offset3.x * 100, 0, 100) : offset3.x * 100,
        v: key ? clamp3(this.hsva.v - offset3.y * 100, 0, 100) : Math.round(100 - offset3.y * 100)
      };
    }
  };

  // node_modules/vanilla-colorful/lib/styles/color-picker.js
  var color_picker_default = ':host{display:flex;flex-direction:column;position:relative;width:200px;height:200px;user-select:none;-webkit-user-select:none;cursor:default}:host([hidden]){display:none!important}[role=slider]{position:relative;touch-action:none;user-select:none;-webkit-user-select:none;outline:0}[role=slider]:last-child{border-radius:0 0 8px 8px}[part$=pointer]{position:absolute;z-index:1;box-sizing:border-box;width:28px;height:28px;display:flex;place-content:center center;transform:translate(-50%,-50%);background-color:#fff;border:2px solid #fff;border-radius:50%;box-shadow:0 2px 4px rgba(0,0,0,.2)}[part$=pointer]::after{content:"";width:100%;height:100%;border-radius:inherit;background-color:currentColor}[role=slider]:focus [part$=pointer]{transform:translate(-50%,-50%) scale(1.1)}';

  // node_modules/vanilla-colorful/lib/styles/hue.js
  var hue_default = "[part=hue]{flex:0 0 24px;background:linear-gradient(to right,red 0,#ff0 17%,#0f0 33%,#0ff 50%,#00f 67%,#f0f 83%,red 100%)}[part=hue-pointer]{top:50%;z-index:2}";

  // node_modules/vanilla-colorful/lib/styles/saturation.js
  var saturation_default = "[part=saturation]{flex-grow:1;border-color:transparent;border-bottom:12px solid #000;border-radius:8px 8px 0 0;background-image:linear-gradient(to top,#000,transparent),linear-gradient(to right,#fff,rgba(255,255,255,0));box-shadow:inset 0 0 0 1px rgba(0,0,0,.05)}[part=saturation-pointer]{z-index:3}";

  // node_modules/vanilla-colorful/lib/components/color-picker.js
  var $isSame = /* @__PURE__ */ Symbol("same"), $color = /* @__PURE__ */ Symbol("color"), $hsva = /* @__PURE__ */ Symbol("hsva"), $update = /* @__PURE__ */ Symbol("update"), $parts = /* @__PURE__ */ Symbol("parts"), $css = /* @__PURE__ */ Symbol("css"), $sliders = /* @__PURE__ */ Symbol("sliders"), ColorPicker = class extends HTMLElement {
    static get observedAttributes() {
      return ["color"];
    }
    get [$css]() {
      return [color_picker_default, hue_default, saturation_default];
    }
    get [$sliders]() {
      return [Saturation, Hue];
    }
    get color() {
      return this[$color];
    }
    set color(newColor) {
      if (!this[$isSame](newColor)) {
        let newHsva = this.colorModel.toHsva(newColor);
        this[$update](newHsva), this[$color] = newColor;
      }
    }
    constructor() {
      super();
      let template = tpl(`<style>${this[$css].join("")}</style>`), root = this.attachShadow({ mode: "open" });
      root.appendChild(template.content.cloneNode(!0)), root.addEventListener("move", this), this[$parts] = this[$sliders].map((slider) => new slider(root));
    }
    connectedCallback() {
      if (this.hasOwnProperty("color")) {
        let value = this.color;
        delete this.color, this.color = value;
      } else this.color || (this.color = this.colorModel.defaultColor);
    }
    attributeChangedCallback(_attr, _oldVal, newVal) {
      let color = this.colorModel.fromAttr(newVal);
      this[$isSame](color) || (this.color = color);
    }
    handleEvent(event) {
      let oldHsva = this[$hsva], newHsva = { ...oldHsva, ...event.detail };
      this[$update](newHsva);
      let newColor;
      !equalColorObjects(newHsva, oldHsva) && !this[$isSame](newColor = this.colorModel.fromHsva(newHsva)) && (this[$color] = newColor, fire(this, "color-changed", { value: newColor }));
    }
    [$isSame](color) {
      return this.color && this.colorModel.equal(color, this.color);
    }
    [$update](hsva) {
      this[$hsva] = hsva, this[$parts].forEach((part) => part.update(hsva));
    }
  };

  // node_modules/vanilla-colorful/lib/entrypoints/hex.js
  var colorModel = {
    defaultColor: "#000",
    toHsva: hexToHsva,
    fromHsva: ({ h: h3, s: s3, v: v3 }) => hsvaToHex({ h: h3, s: s3, v: v3, a: 1 }),
    equal: equalHex,
    fromAttr: (color) => color
  }, HexBase = class extends ColorPicker {
    get colorModel() {
      return colorModel;
    }
  };

  // node_modules/vanilla-colorful/hex-color-picker.js
  var HexColorPicker = class extends HexBase {
  };
  customElements.define("hex-color-picker", HexColorPicker);

  // src/browser/components/controls/ColorPicker.tsx
  var HEX_REGEX = /^#[0-9a-fA-F]{6}$/, SWATCHES = [
    "#ef4444",
    "#f97316",
    "#f59e0b",
    "#eab308",
    "#84cc16",
    "#22c55e",
    "#14b8a6",
    "#06b6d4",
    "#3b82f6",
    "#6366f1",
    "#8b5cf6",
    "#a855f7",
    "#d946ef",
    "#ec4899",
    "#f43f5e",
    "#000000",
    "#374151",
    "#6b7280",
    "#9ca3af",
    "#d1d5db",
    "#e5e7eb",
    "#f3f4f6",
    "#f9fafb",
    "#ffffff"
  ];
  function ColorPicker2({
    color,
    onChange,
    onScrub,
    onScrubEnd,
    onClose,
    anchor,
    alpha = 100,
    onAlphaChange,
    swatches: swatchesProp
  }) {
    let displaySwatches = swatchesProp ?? SWATCHES, popoverRef = A2(null), pickerRef = A2(null), [editingHex, setEditingHex] = d2(null), [liveHex, setLiveHex] = d2(null), editingHexRef = A2(null), displayedHex = editingHex !== null ? editingHex : liveHex ?? color;
    y2(() => {
      if (!popoverRef.current) return;
      let cancelled = !1;
      return computePosition2(anchor, popoverRef.current, {
        placement: "bottom-start",
        middleware: [flip2(), shift2({ padding: 8 })]
      }).then(({ x: x3, y: y3 }) => {
        !cancelled && popoverRef.current && (popoverRef.current.style.left = `${x3}px`, popoverRef.current.style.top = `${y3}px`);
      }).catch((err) => {
        cancelled || console.warn(
          "[cortex] ColorPicker positioning failed:",
          err instanceof Error ? err.message : err
        );
      }), () => {
        cancelled = !0;
      };
    }, [anchor]), y2(() => {
      let picker = pickerRef.current;
      picker && (picker.color = color, setLiveHex(null));
    }, [color]);
    let onChangeRef = A2(onChange);
    onChangeRef.current = onChange;
    let onScrubRef = A2(onScrub);
    onScrubRef.current = onScrub;
    let onScrubEndRef = A2(onScrubEnd);
    onScrubEndRef.current = onScrubEnd;
    let isDraggingRef = A2(!1), dragValueRef = A2(null);
    y2(() => {
      let picker = pickerRef.current;
      if (!picker) return;
      let doc = picker.ownerDocument, handleColorChanged = (e4) => {
        let detail = e4.detail;
        if (detail && typeof detail.value == "string" && HEX_REGEX.test(detail.value)) {
          let hasScrubHandler = !!onScrubRef.current || !!onScrubEndRef.current;
          if (isDraggingRef.current && hasScrubHandler) {
            dragValueRef.current = detail.value, setLiveHex(detail.value);
            let scrub = onScrubRef.current;
            scrub && scrub(detail.value);
          } else
            setLiveHex(null), onChangeRef.current(detail.value);
        }
      }, beginDrag = () => {
        isDraggingRef.current || (isDraggingRef.current = !0, dragValueRef.current = null);
      }, endDrag = () => {
        if (!isDraggingRef.current) return;
        isDraggingRef.current = !1;
        let latest = dragValueRef.current;
        dragValueRef.current = null, latest !== null && (onScrubEndRef.current ?? onChangeRef.current)(latest);
      }, cancelDrag = () => {
        endDrag();
      };
      return picker.addEventListener("color-changed", handleColorChanged), picker.addEventListener("pointerdown", beginDrag, !0), picker.addEventListener("mousedown", beginDrag, !0), picker.addEventListener("touchstart", beginDrag, !0), doc.addEventListener("pointerup", endDrag), doc.addEventListener("mouseup", endDrag), doc.addEventListener("touchend", endDrag), doc.addEventListener("pointercancel", cancelDrag), doc.addEventListener("touchcancel", cancelDrag), () => {
        picker.removeEventListener("color-changed", handleColorChanged), picker.removeEventListener("pointerdown", beginDrag, !0), picker.removeEventListener("mousedown", beginDrag, !0), picker.removeEventListener("touchstart", beginDrag, !0), doc.removeEventListener("pointerup", endDrag), doc.removeEventListener("mouseup", endDrag), doc.removeEventListener("touchend", endDrag), doc.removeEventListener("pointercancel", cancelDrag), doc.removeEventListener("touchcancel", cancelDrag);
      };
    }, []);
    let handleHexFocus = q2(() => {
      editingHexRef.current = color, setEditingHex(color);
    }, [color]), handleHexInput = q2((e4) => {
      let v3 = e4.target.value;
      editingHexRef.current = v3, setEditingHex(v3);
    }, []), handleHexBlur = q2(() => {
      let current = editingHexRef.current;
      current !== null && HEX_REGEX.test(current) && current.toLowerCase() !== color.toLowerCase() && onChange(current), editingHexRef.current = null, setEditingHex(null);
    }, [onChange, color]), handleSwatchClick = q2(
      (hex) => {
        onChange(hex);
      },
      [onChange]
    );
    return /* @__PURE__ */ u4(k, { children: [
      /* @__PURE__ */ u4("div", { class: "cortex-color-picker__backdrop", onClick: onClose }),
      /* @__PURE__ */ u4(
        "div",
        {
          ref: popoverRef,
          class: "cortex-color-picker__popover",
          style: { position: "fixed" },
          children: [
            /* @__PURE__ */ u4("hex-color-picker", { ref: pickerRef }),
            /* @__PURE__ */ u4("div", { class: "cortex-color-picker__inputs", children: [
              /* @__PURE__ */ u4("div", { class: "cortex-color-picker__hex-row", children: [
                /* @__PURE__ */ u4("span", { class: "cortex-color-picker__label", children: "Hex" }),
                /* @__PURE__ */ u4(
                  "input",
                  {
                    class: "cortex-color-picker__hex-input",
                    type: "text",
                    value: displayedHex,
                    onFocus: handleHexFocus,
                    onInput: handleHexInput,
                    onBlur: handleHexBlur
                  }
                )
              ] }),
              onAlphaChange && /* @__PURE__ */ u4("div", { class: "cortex-color-picker__alpha-row", children: [
                /* @__PURE__ */ u4("span", { class: "cortex-color-picker__label", children: "Alpha" }),
                /* @__PURE__ */ u4(
                  "input",
                  {
                    class: "cortex-color-picker__alpha-input",
                    type: "number",
                    min: 0,
                    max: 100,
                    value: alpha,
                    onInput: (e4) => {
                      let val = parseInt(e4.target.value, 10);
                      isNaN(val) || onAlphaChange(Math.max(0, Math.min(100, val)));
                    }
                  }
                ),
                /* @__PURE__ */ u4("span", { class: "cortex-color-picker__unit", children: "%" })
              ] })
            ] }),
            /* @__PURE__ */ u4("div", { class: "cortex-color-picker__swatches", children: displaySwatches.map((hex, idx) => /* @__PURE__ */ u4(
              "button",
              {
                class: `cortex-color-picker__swatch${hex === color ? " cortex-color-picker__swatch--active" : ""}`,
                style: { backgroundColor: hex },
                onClick: () => handleSwatchClick(hex),
                type: "button",
                "aria-label": `Set color to ${hex}`
              },
              `${hex}-${idx}`
            )) })
          ]
        }
      )
    ] });
  }

  // src/core/oklch.ts
  function srgbGamma(v3) {
    return v3 <= 31308e-7 ? 12.92 * v3 : 1.055 * Math.pow(v3, 1 / 2.4) - 0.055;
  }
  function oklabToLinearSRGB(L, a4, b) {
    let l_ = L + 0.3963377774 * a4 + 0.2158037573 * b, m_ = L - 0.1055613458 * a4 - 0.0638541728 * b, s_ = L - 0.0894841775 * a4 - 1.291485548 * b, lc = l_ * l_ * l_, mc = m_ * m_ * m_, sc = s_ * s_ * s_;
    return [
      4.0767416621 * lc - 3.3077115913 * mc + 0.2309699292 * sc,
      -1.2684380046 * lc + 2.6097574011 * mc - 0.3413193965 * sc,
      -0.0041960863 * lc - 0.7034186147 * mc + 1.707614701 * sc
    ];
  }
  function isInGamut(r4, g3, b) {
    return r4 >= -1e-6 && r4 <= 1 + 1e-6 && g3 >= -1e-6 && g3 <= 1 + 1e-6 && b >= -1e-6 && b <= 1 + 1e-6;
  }
  function oklchToHex(oklchStr) {
    let m3 = oklchStr.match(/oklch\(\s*([\d.]+|none)(%?)\s+([\d.]+|none)\s+(-?[\d.]+|none)(?:\s*\/\s*[\d.]+%?)?\s*\)/);
    if (!m3) return null;
    let L = m3[1] === "none" ? 0 : parseFloat(m3[1]);
    m3[2] === "%" && (L /= 100);
    let C3 = m3[3] === "none" ? 0 : parseFloat(m3[3]), H2 = m3[4] === "none" ? 0 : parseFloat(m3[4]);
    if (Number.isNaN(L) || Number.isNaN(C3) || Number.isNaN(H2)) return null;
    let hRad = H2 * Math.PI / 180, cosH = Math.cos(hRad), sinH = Math.sin(hRad), [rl, gl, bl] = oklabToLinearSRGB(L, C3 * cosH, C3 * sinH);
    if (!isInGamut(rl, gl, bl)) {
      let lo = 0, hi = C3;
      for (let i4 = 0; i4 < 20; i4++) {
        let mid = (lo + hi) / 2, [r22, g22, b2] = oklabToLinearSRGB(L, mid * cosH, mid * sinH);
        isInGamut(r22, g22, b2) ? (lo = mid, rl = r22, gl = g22, bl = b2) : hi = mid;
      }
    }
    let r4 = Math.round(srgbGamma(Math.max(0, Math.min(1, rl))) * 255), g3 = Math.round(srgbGamma(Math.max(0, Math.min(1, gl))) * 255), bv = Math.round(srgbGamma(Math.max(0, Math.min(1, bl))) * 255);
    return `#${((1 << 24) + (r4 << 16) + (g3 << 8) + bv).toString(16).slice(1)}`;
  }

  // src/browser/components/controls/ColorInput.tsx
  var HEX_REGEX2 = /^#[0-9a-fA-F]{6}$/, NAMED_COLOR_HEX = {
    black: "#000000",
    blue: "#0000ff",
    cyan: "#00ffff",
    fuchsia: "#ff00ff",
    gray: "#808080",
    green: "#008000",
    grey: "#808080",
    lime: "#00ff00",
    magenta: "#ff00ff",
    maroon: "#800000",
    navy: "#000080",
    olive: "#808000",
    orange: "#ffa500",
    purple: "#800080",
    rebeccapurple: "#663399",
    red: "#ff0000",
    silver: "#c0c0c0",
    teal: "#008080",
    white: "#ffffff",
    yellow: "#ffff00"
  }, CSS_COLOR_KEYWORDS_REQUIRING_CONTEXT = /* @__PURE__ */ new Set([
    "currentcolor",
    "inherit",
    "initial",
    "revert",
    "revert-layer",
    "unset"
  ]), CSS_NUMBER_PATTERN = "-?(?:\\d+(?:\\.\\d+)?|\\.\\d+)", CSS_ALPHA_REGEX = new RegExp(`^(${CSS_NUMBER_PATTERN})(%)?$`), RGB_COLOR_REGEX = new RegExp(
    `^rgba?\\(\\s*(${CSS_NUMBER_PATTERN})(?:\\s*,\\s*|\\s+)(${CSS_NUMBER_PATTERN})(?:\\s*,\\s*|\\s+)(${CSS_NUMBER_PATTERN})(?:\\s*(?:,|/)\\s*(${CSS_NUMBER_PATTERN}%?))?\\s*\\)$`,
    "i"
  ), HSL_COLOR_REGEX = new RegExp(
    `^hsla?\\(\\s*(${CSS_NUMBER_PATTERN})(?:\\s*,\\s*|\\s+)(${CSS_NUMBER_PATTERN})%(?:\\s*,\\s*|\\s+)(${CSS_NUMBER_PATTERN})%(?:\\s*(?:,|/)\\s*(${CSS_NUMBER_PATTERN}%?))?\\s*\\)$`,
    "i"
  ), OKLCH_ALPHA_REGEX = new RegExp(`/\\s*(${CSS_NUMBER_PATTERN}%?)\\s*\\)$`, "i"), OKLCH_HAS_ALPHA_REGEX = /\/\s*[^)]+\s*\)$/i;
  function editableColor(hex, alpha = 100, alphaWasExplicit = !1) {
    return { hex, alpha, alphaWasExplicit };
  }
  function parseCssAlpha(alpha) {
    let match = alpha.trim().match(CSS_ALPHA_REGEX);
    if (!match) return null;
    let parsed = Number(match[1]);
    if (!Number.isFinite(parsed)) return null;
    let normalized = match[2] === "%" ? parsed / 100 : parsed;
    return Math.round(Math.min(1, Math.max(0, normalized)) * 100);
  }
  function parseEditableColor(color) {
    let trimmed = color.trim(), lower = trimmed.toLowerCase();
    if (lower === "transparent") return editableColor("#000000", 0, !0);
    if (HEX_REGEX2.test(trimmed)) return editableColor(trimmed.toLowerCase());
    let hex8 = trimmed.match(/^#([0-9a-fA-F]{6})([0-9a-fA-F]{2})$/);
    if (hex8)
      return editableColor(
        `#${hex8[1].toLowerCase()}`,
        Math.round(parseInt(hex8[2], 16) / 255 * 100),
        !0
      );
    let short = trimmed.match(/^#([0-9a-fA-F])([0-9a-fA-F])([0-9a-fA-F])$/);
    if (short)
      return editableColor(
        `#${short[1]}${short[1]}${short[2]}${short[2]}${short[3]}${short[3]}`.toLowerCase()
      );
    let rgbMatch = trimmed.match(RGB_COLOR_REGEX);
    if (rgbMatch) {
      let r4 = Math.round(Math.min(255, Math.max(0, parseFloat(rgbMatch[1])))), g3 = Math.round(Math.min(255, Math.max(0, parseFloat(rgbMatch[2])))), b = Math.round(Math.min(255, Math.max(0, parseFloat(rgbMatch[3])))), alpha = rgbMatch[4] === void 0 ? 100 : parseCssAlpha(rgbMatch[4]);
      return alpha === null ? null : editableColor(
        `#${((1 << 24) + (r4 << 16) + (g3 << 8) + b).toString(16).slice(1)}`,
        alpha,
        rgbMatch[4] !== void 0
      );
    }
    let hslMatch = trimmed.match(HSL_COLOR_REGEX);
    if (hslMatch) {
      let h3 = (parseFloat(hslMatch[1]) % 360 + 360) % 360 / 360, s3 = Math.min(1, Math.max(0, parseFloat(hslMatch[2]) / 100)), l3 = Math.min(1, Math.max(0, parseFloat(hslMatch[3]) / 100)), [r4, g3, b] = hslToRgb(h3, s3, l3), alpha = hslMatch[4] === void 0 ? 100 : parseCssAlpha(hslMatch[4]);
      return alpha === null ? null : editableColor(
        `#${((1 << 24) + (r4 << 16) + (g3 << 8) + b).toString(16).slice(1)}`,
        alpha,
        hslMatch[4] !== void 0
      );
    }
    if (lower.startsWith("oklch(")) {
      let hex = oklchToHex(trimmed);
      if (!hex) return null;
      let alphaMatch = trimmed.match(OKLCH_ALPHA_REGEX);
      if (OKLCH_HAS_ALPHA_REGEX.test(trimmed) && !alphaMatch) return null;
      let alpha = alphaMatch ? parseCssAlpha(alphaMatch[1]) : 100;
      return alpha === null ? null : editableColor(
        hex,
        alpha,
        alphaMatch !== null
      );
    }
    let namedHex = NAMED_COLOR_HEX[lower];
    if (namedHex) return editableColor(namedHex);
    if (CSS_COLOR_KEYWORDS_REQUIRING_CONTEXT.has(lower))
      return null;
    if (typeof document < "u" && document.body && typeof getComputedStyle < "u") {
      let probe = document.createElement("span");
      if (probe.style.color = lower, probe.style.color) {
        document.body.appendChild(probe);
        let computed = getComputedStyle(probe).color;
        if (probe.remove(), computed && computed.toLowerCase() !== lower)
          return parseEditableColor(computed);
      }
    }
    return null;
  }
  function hslToRgb(h3, s3, l3) {
    if (s3 === 0) {
      let v3 = Math.round(l3 * 255);
      return [v3, v3, v3];
    }
    let q3 = l3 < 0.5 ? l3 * (1 + s3) : l3 + s3 - l3 * s3, p3 = 2 * l3 - q3, hueToRgb = (t4) => (t4 < 0 && (t4 += 1), t4 > 1 && (t4 -= 1), t4 < 1 / 6 ? p3 + (q3 - p3) * 6 * t4 : t4 < 1 / 2 ? q3 : t4 < 2 / 3 ? p3 + (q3 - p3) * (2 / 3 - t4) * 6 : p3);
    return [
      Math.round(hueToRgb(h3 + 1 / 3) * 255),
      Math.round(hueToRgb(h3) * 255),
      Math.round(hueToRgb(h3 - 1 / 3) * 255)
    ];
  }
  function parseColor(color) {
    let trimmed = color.trim(), parsed = parseEditableColor(trimmed);
    return parsed ? { hex: parsed.hex, alpha: parsed.alpha } : { hex: "#000000", alpha: 100 };
  }
  function formatColor(hex, alpha) {
    if (alpha >= 100) return hex;
    let r4 = parseInt(hex.slice(1, 3), 16), g3 = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r4}, ${g3}, ${b}, ${Math.round(alpha) / 100})`;
  }
  function ColorInput({
    value,
    onChange,
    onScrub,
    onScrubEnd,
    alpha: alphaProp,
    onAlphaChange,
    swatches,
    mixed,
    trailing
  }) {
    let parsed = parseColor(value), hexColor = parsed.hex, currentAlpha = alphaProp ?? parsed.alpha, [editingHex, setEditingHex] = d2(null), editingHexRef = A2(null), displayedHex = editingHex !== null ? editingHex : hexColor, [pickerOpen, setPickerOpen] = d2(!1), swatchRef = A2(null), alphaRef = A2(currentAlpha);
    alphaRef.current = currentAlpha;
    let emitColor = q2((hex, a4, options) => {
      let nextAlpha = Math.round(Math.max(0, Math.min(100, a4)));
      options?.syncAlpha && (options.forceSyncAlpha || nextAlpha !== alphaRef.current) && onAlphaChange?.(nextAlpha), (options?.target ?? onChange)(formatColor(hex, nextAlpha));
    }, [onChange, onAlphaChange]), handleHexInput = q2((e4) => {
      let v3 = e4.target.value;
      editingHexRef.current = v3, setEditingHex(v3);
    }, []), handleHexFocus = q2(() => {
      let next = mixed ? "" : hexColor;
      editingHexRef.current = next, setEditingHex(next);
    }, [hexColor, mixed]), handleHexBlur = q2(() => {
      let current = editingHexRef.current, parsedColor = current !== null && current.trim() !== "" ? parseEditableColor(current) : null;
      if (parsedColor) {
        let nextAlpha = parsedColor.alphaWasExplicit ? parsedColor.alpha : mixed ? 100 : alphaRef.current, next = formatColor(parsedColor.hex, nextAlpha), previous = formatColor(hexColor, alphaRef.current);
        (mixed || next.toLowerCase() !== previous.toLowerCase()) && emitColor(parsedColor.hex, nextAlpha, {
          syncAlpha: parsedColor.alphaWasExplicit || mixed,
          forceSyncAlpha: mixed
        });
      }
      editingHexRef.current = null, setEditingHex(null);
    }, [emitColor, hexColor, mixed]), handleSwatchClick = q2(() => {
      setPickerOpen(!0);
    }, []), handlePickerClose = q2(() => {
      setPickerOpen(!1);
    }, []), handlePickerChange = q2((hex) => {
      emitColor(hex, alphaRef.current);
    }, [emitColor]), handlePickerScrub = q2((hex) => {
      emitColor(hex, alphaRef.current, { target: onScrub });
    }, [emitColor, onScrub]), handlePickerScrubEnd = q2((hex) => {
      emitColor(hex, alphaRef.current, { target: onScrubEnd });
    }, [emitColor, onScrubEnd]), handleAlphaChange = q2((a4) => {
      onAlphaChange?.(Math.round(Math.max(0, Math.min(100, a4))));
    }, [onAlphaChange]);
    return /* @__PURE__ */ u4("div", { class: `cortex-color-input${mixed ? " cortex-color-input--mixed" : ""}`, ref: swatchRef, children: [
      /* @__PURE__ */ u4(
        "button",
        {
          type: "button",
          class: "cortex-color-input__swatch",
          style: mixed ? void 0 : { backgroundColor: value },
          onClick: handleSwatchClick,
          "aria-label": "Open color picker"
        }
      ),
      /* @__PURE__ */ u4(
        "input",
        {
          class: "cortex-color-input__hex",
          type: "text",
          "aria-label": "Color value",
          size: 9,
          value: mixed && editingHex === null ? "" : displayedHex,
          placeholder: mixed ? "Mixed" : void 0,
          onInput: handleHexInput,
          onFocus: handleHexFocus,
          onBlur: handleHexBlur
        }
      ),
      onAlphaChange && /* @__PURE__ */ u4("div", { class: "cortex-color-input__opacity", children: /* @__PURE__ */ u4(
        NumericInput,
        {
          value: currentAlpha,
          unit: "%",
          prefix: /* @__PURE__ */ u4(Eclipse, { size: 14 }),
          tooltip: "Opacity",
          min: 0,
          onChange: handleAlphaChange,
          mixed
        }
      ) }),
      trailing,
      pickerOpen && swatchRef.current && /* @__PURE__ */ u4(
        ColorPicker2,
        {
          color: hexColor,
          onChange: handlePickerChange,
          onScrub: onScrub ? handlePickerScrub : void 0,
          onScrubEnd: onScrubEnd ? handlePickerScrubEnd : void 0,
          onClose: handlePickerClose,
          anchor: swatchRef.current,
          alpha: onAlphaChange ? currentAlpha : void 0,
          onAlphaChange: onAlphaChange ? handleAlphaChange : void 0,
          swatches
        }
      )
    ] });
  }

  // src/browser/components/controls/TokenChip.tsx
  function TokenChip({
    tokenName,
    swatch,
    onBodyClick,
    onUnlink,
    ariaLabel,
    bodyRef
  }) {
    let swatchEl = swatch === void 0 ? null : swatch.kind === "color" ? /* @__PURE__ */ u4("span", { class: "cortex-token-chip__swatch", style: { backgroundColor: swatch.value } }) : /* @__PURE__ */ u4("span", { class: "cortex-token-chip__swatch cortex-token-chip__swatch--pattern" }), bodyChildren = /* @__PURE__ */ u4(k, { children: [
      swatchEl,
      /* @__PURE__ */ u4("span", { class: "cortex-token-chip__name", children: tokenName })
    ] });
    return /* @__PURE__ */ u4("span", { class: "cortex-token-chip", children: [
      onBodyClick ? /* @__PURE__ */ u4(
        "button",
        {
          ref: bodyRef,
          type: "button",
          class: "cortex-token-chip__body",
          onClick: onBodyClick,
          "aria-label": ariaLabel ?? tokenName,
          children: bodyChildren
        }
      ) : /* @__PURE__ */ u4("span", { class: "cortex-token-chip__body", children: bodyChildren }),
      onUnlink && /* @__PURE__ */ u4(
        "button",
        {
          type: "button",
          class: "cortex-token-chip__unlink",
          "aria-label": "Detach token",
          onClick: onUnlink,
          children: /* @__PURE__ */ u4(Unlink, { size: 14 })
        }
      )
    ] });
  }
  var NAMED_COLORS = /* @__PURE__ */ new Set([
    "aliceblue",
    "antiquewhite",
    "aqua",
    "aquamarine",
    "azure",
    "beige",
    "bisque",
    "black",
    "blanchedalmond",
    "blue",
    "blueviolet",
    "brown",
    "burlywood",
    "cadetblue",
    "chartreuse",
    "chocolate",
    "coral",
    "cornflowerblue",
    "cornsilk",
    "crimson",
    "cyan",
    "darkblue",
    "darkcyan",
    "darkgoldenrod",
    "darkgray",
    "darkgreen",
    "darkgrey",
    "darkkhaki",
    "darkmagenta",
    "darkolivegreen",
    "darkorange",
    "darkorchid",
    "darkred",
    "darksalmon",
    "darkseagreen",
    "darkslateblue",
    "darkslategray",
    "darkslategrey",
    "darkturquoise",
    "darkviolet",
    "deeppink",
    "deepskyblue",
    "dimgray",
    "dimgrey",
    "dodgerblue",
    "firebrick",
    "floralwhite",
    "forestgreen",
    "fuchsia",
    "gainsboro",
    "ghostwhite",
    "gold",
    "goldenrod",
    "gray",
    "green",
    "greenyellow",
    "grey",
    "honeydew",
    "hotpink",
    "indianred",
    "indigo",
    "ivory",
    "khaki",
    "lavender",
    "lavenderblush",
    "lawngreen",
    "lemonchiffon",
    "lightblue",
    "lightcoral",
    "lightcyan",
    "lightgoldenrodyellow",
    "lightgray",
    "lightgreen",
    "lightgrey",
    "lightpink",
    "lightsalmon",
    "lightseagreen",
    "lightskyblue",
    "lightslategray",
    "lightslategrey",
    "lightsteelblue",
    "lightyellow",
    "lime",
    "limegreen",
    "linen",
    "magenta",
    "maroon",
    "mediumaquamarine",
    "mediumblue",
    "mediumorchid",
    "mediumpurple",
    "mediumseagreen",
    "mediumslateblue",
    "mediumspringgreen",
    "mediumturquoise",
    "mediumvioletred",
    "midnightblue",
    "mintcream",
    "mistyrose",
    "moccasin",
    "navajowhite",
    "navy",
    "oldlace",
    "olive",
    "olivedrab",
    "orange",
    "orangered",
    "orchid",
    "palegoldenrod",
    "palegreen",
    "paleturquoise",
    "palevioletred",
    "papayawhip",
    "peachpuff",
    "peru",
    "pink",
    "plum",
    "powderblue",
    "purple",
    "rebeccapurple",
    "red",
    "rosybrown",
    "royalblue",
    "saddlebrown",
    "salmon",
    "sandybrown",
    "seagreen",
    "seashell",
    "sienna",
    "silver",
    "skyblue",
    "slateblue",
    "slategray",
    "slategrey",
    "snow",
    "springgreen",
    "steelblue",
    "tan",
    "teal",
    "thistle",
    "tomato",
    "turquoise",
    "violet",
    "wheat",
    "white",
    "whitesmoke",
    "yellow",
    "yellowgreen"
  ]), COLOR_RE = /^(#[\da-f]{3,8}|rgba?\s*\(|hsla?\s*\(|transparent|currentcolor|var\s*\(--)/i;
  function isColorLike(value) {
    let trimmed = value.trim().toLowerCase();
    return COLOR_RE.test(trimmed) || NAMED_COLORS.has(trimmed);
  }

  // src/browser/components/controls/TextComponentPill.tsx
  function TextComponentPill({
    tokenName,
    onSwap,
    onUnlink,
    bodyRef
  }) {
    return /* @__PURE__ */ u4(
      TokenChip,
      {
        tokenName,
        onBodyClick: onSwap,
        onUnlink,
        ariaLabel: `Swap text component (currently ${tokenName})`,
        bodyRef
      }
    );
  }

  // src/browser/components/controls/ColorChipPill.tsx
  function ColorChipPill({
    tokenName,
    hex,
    onSwap,
    onUnlink,
    bodyRef
  }) {
    return /* @__PURE__ */ u4(
      TokenChip,
      {
        tokenName,
        swatch: { kind: "color", value: hex },
        onBodyClick: onSwap,
        onUnlink,
        ariaLabel: `Swap color chip (currently ${tokenName})`,
        bodyRef
      }
    );
  }

  // src/browser/components/controls/TextComponentPicker.tsx
  function TextComponentPicker({
    components,
    currentName,
    onPick,
    onDismiss,
    triggerRefs
  }) {
    let ref = A2(null);
    return useOutsideDismiss(ref, onDismiss, triggerRefs), components.length === 0 ? /* @__PURE__ */ u4("div", { ref, class: "cortex-text-component-picker cortex-text-component-picker--empty", children: /* @__PURE__ */ u4("span", { children: "No text components defined in @theme" }) }) : /* @__PURE__ */ u4("div", { ref, class: "cortex-text-component-picker", role: "listbox", children: components.map((c4) => /* @__PURE__ */ u4(
      "button",
      {
        type: "button",
        role: "option",
        "aria-selected": c4.name === currentName,
        class: `cortex-text-component-picker__option${c4.name === currentName ? " cortex-text-component-picker__option--active" : ""}`,
        onClick: () => onPick(c4),
        children: [
          /* @__PURE__ */ u4("span", { class: "cortex-text-component-picker__name", children: c4.name }),
          /* @__PURE__ */ u4("span", { class: "cortex-text-component-picker__meta", children: [
            c4.fontSize,
            " / ",
            c4.fontWeight
          ] })
        ]
      },
      c4.name
    )) });
  }

  // src/browser/components/controls/ColorChipPicker.tsx
  function ColorChipPicker({
    chips,
    currentName,
    onPick,
    onDismiss,
    triggerRefs
  }) {
    let ref = A2(null);
    if (useOutsideDismiss(ref, onDismiss, triggerRefs), chips.length === 0)
      return /* @__PURE__ */ u4("div", { ref, class: "cortex-color-chip-picker cortex-color-chip-picker--empty", children: /* @__PURE__ */ u4("span", { children: "No color chips defined in @theme" }) });
    let pageChips = chips.filter((c4) => c4.source === "page"), themeChips = chips.filter((c4) => c4.source !== "page"), showGroups = pageChips.length > 0 && themeChips.length > 0, renderOption = (c4) => /* @__PURE__ */ u4(
      "button",
      {
        type: "button",
        role: "option",
        "aria-selected": c4.name === currentName,
        class: `cortex-color-chip-picker__option${c4.name === currentName ? " cortex-color-chip-picker__option--active" : ""}`,
        onClick: () => onPick(c4),
        children: [
          /* @__PURE__ */ u4(
            "span",
            {
              class: "cortex-color-chip-picker__swatch",
              style: { backgroundColor: c4.hex },
              "aria-hidden": "true"
            }
          ),
          /* @__PURE__ */ u4("span", { class: "cortex-color-chip-picker__name", children: c4.name }),
          /* @__PURE__ */ u4("span", { class: "cortex-color-chip-picker__hex", children: c4.hex })
        ]
      },
      c4.name
    );
    return /* @__PURE__ */ u4("div", { ref, class: "cortex-color-chip-picker", role: "listbox", children: showGroups ? /* @__PURE__ */ u4(k, { children: [
      /* @__PURE__ */ u4("div", { class: "cortex-color-chip-picker__group-label", role: "presentation", children: "On this page" }),
      pageChips.map(renderOption),
      /* @__PURE__ */ u4("div", { class: "cortex-color-chip-picker__divider", role: "presentation" }),
      /* @__PURE__ */ u4("div", { class: "cortex-color-chip-picker__group-label", role: "presentation", children: "Theme colors" }),
      themeChips.map(renderOption)
    ] }) : chips.map(renderOption) });
  }

  // src/browser/token-detector.ts
  function detectTextComponent(className, bundles) {
    if (bundles.length === 0) return null;
    let bundleByName = new Map(bundles.map((b) => [b.name, b])), tokens = className.split(/\s+/).filter(Boolean);
    for (let token of tokens) {
      if (!token.startsWith("text-")) continue;
      let name = token.slice(5), bundle = bundleByName.get(name);
      if (bundle) return bundle;
    }
    return null;
  }
  function detectColorChip(className, chips) {
    if (chips.length === 0) return null;
    let chipByName = new Map(chips.map((c4) => [c4.name, c4])), tokens = className.split(/\s+/).filter(Boolean);
    for (let token of tokens) {
      if (!token.startsWith("text-")) continue;
      let name = token.slice(5), chip = chipByName.get(name);
      if (chip) return chip;
    }
    return null;
  }

  // src/browser/components/sections/TypographySection.tsx
  function parseTypographyValues(cs) {
    let fontSize = parseFloat(cs.fontSize) || 16, display = cs.display ?? "", flexDir = cs.flexDirection ?? "", lineHeight = cs.lineHeight === "normal" ? 1.5 : Math.round((parseFloat(cs.lineHeight) / fontSize || 1.5) * 100) / 100, justifyContent = cs.justifyContent || "flex-start", alignItems = cs.alignItems || "stretch", layout = typographyLayoutContext(display, flexDir), textAlign = layout === "flex-column" ? flexToHorizontal(alignItems, flexDir) : layout === "flex-row" ? flexToHorizontal(justifyContent, flexDir) : flexToHorizontal(cs.textAlign ?? "left", flexDir), verticalAlign = layout === "flex-column" ? flexToVertical(justifyContent, flexDir) : layout === "flex-row" ? flexToVertical(alignItems, flexDir) : "", height = cs.height ?? "auto", minHeight = cs.minHeight ?? "0px", verticalAlignDisabledReason = typographyVerticalAlignDisabledReason({
      display,
      flexDirection: flexDir,
      height,
      minHeight,
      fontSize,
      lineHeight
    });
    return {
      fontFamily: cs.fontFamily ?? "",
      fontSize,
      fontWeight: cs.fontWeight ?? "400",
      lineHeight,
      letterSpacing: cs.letterSpacing === "normal" ? 0 : Math.round((parseFloat(cs.letterSpacing) || 0) * 100) / 100,
      textAlign,
      verticalAlign,
      display,
      flexDirection: flexDir,
      justifyContent,
      alignItems,
      height,
      minHeight,
      canAlignVertically: verticalAlignDisabledReason === null,
      verticalAlignDisabledReason,
      color: cs.color ?? "rgb(0, 0, 0)"
    };
  }
  function getWeightsForFamily(family) {
    if (!document.fonts?.[Symbol.iterator]) return ["400"];
    let weights = /* @__PURE__ */ new Set();
    for (let face of document.fonts) {
      let f5 = face;
      if (stripCSSQuotes(f5.family) === family) {
        let w3 = f5.weight;
        if (w3.includes(" ")) {
          let parts = w3.split(" ").map(Number), min2 = parts[0] ?? 400, max2 = parts[1] ?? 400;
          for (let std of [100, 200, 300, 400, 500, 600, 700, 800, 900])
            std >= min2 && std <= max2 && weights.add(String(std));
        } else
          weights.add(w3);
      }
    }
    return weights.size > 0 ? [...weights].sort((a4, b) => Number(a4) - Number(b)) : ["100", "200", "300", "400", "500", "600", "700", "800", "900"];
  }
  var WEIGHT_LABELS = {
    100: "Thin",
    200: "Extra Light",
    300: "Light",
    400: "Regular",
    500: "Medium",
    600: "Semibold",
    700: "Bold",
    800: "Extra Bold",
    900: "Black"
  }, HORIZONTAL_ALIGN_OPTIONS = [
    { value: "left", icon: /* @__PURE__ */ u4(AlignLeft, { size: 14 }), title: "Left" },
    { value: "center", icon: /* @__PURE__ */ u4(AlignCenter, { size: 14 }), title: "Center" },
    { value: "right", icon: /* @__PURE__ */ u4(AlignRight, { size: 14 }), title: "Right" }
  ], VERTICAL_ALIGN_OPTIONS = [
    { value: "flex-start", icon: /* @__PURE__ */ u4(ArrowUpFromLine, { size: 14 }), title: "Top" },
    { value: "center", icon: /* @__PURE__ */ u4(AlignCenterVertical, { size: 14 }), title: "Middle" },
    { value: "flex-end", icon: /* @__PURE__ */ u4(ArrowDownToLine, { size: 14 }), title: "Bottom" }
  ];
  function stripCSSQuotes(s3) {
    return s3.replace(/^["']|["']$/g, "");
  }
  function quoteFontFamily(family) {
    let stripped = stripCSSQuotes(family);
    return /\s/.test(stripped) ? `"${stripped}"` : stripped;
  }
  var TYPOGRAPHY_LINKED_PROPERTIES = [
    "font-family",
    "font-weight",
    "font-size",
    "line-height",
    "letter-spacing"
  ], COLOR_LINKED_PROPERTIES = ["color"];
  function buildUnlinkTypography(values) {
    let valueFor = {
      "font-family": quoteFontFamily(values.fontFamily.split(",")[0]?.trim() ?? values.fontFamily),
      "font-weight": values.fontWeight,
      "font-size": `${values.fontSize}px`,
      "line-height": String(values.lineHeight),
      "letter-spacing": `${values.letterSpacing}px`
    };
    return TYPOGRAPHY_LINKED_PROPERTIES.map((property) => ({ property, value: valueFor[property] }));
  }
  function buildUnlinkColor(values) {
    let valueFor = {
      color: values.color
    };
    return COLOR_LINKED_PROPERTIES.map((property) => ({ property, value: valueFor[property] }));
  }
  function TypographySection({
    values,
    availableWeights,
    className,
    onChange,
    onScrub,
    onScrubEnd,
    swatches,
    colorChips,
    textComponents,
    dimmedProperties,
    mixedProperties
  }) {
    let [pickerOpen, setPickerOpen] = d2(null), bundle = T2(
      () => detectTextComponent(className, textComponents ?? []),
      [className, textComponents]
    ), chip = T2(() => detectColorChip(className, colorChips ?? []), [className, colorChips]), typographyLinked = bundle !== null, colorLinked = chip !== null, layoutContext = typographyLayoutContext(values.display, values.flexDirection), horizontalMixed = layoutContext === "flex-column" ? mixedProperties?.has("align-items") : layoutContext === "flex-row" ? mixedProperties?.has("justify-content") : mixedProperties?.has("text-align"), verticalMixed = layoutContext === "flex-column" ? mixedProperties?.has("justify-content") : layoutContext === "flex-row" ? mixedProperties?.has("align-items") : !1, weightOptions = T2(() => {
      let opts = availableWeights.map((w3) => ({
        value: w3,
        label: WEIGHT_LABELS[w3] ?? w3,
        tooltip: WEIGHT_LABELS[w3] ? `font-weight: ${w3}` : void 0
      }));
      return availableWeights.includes(values.fontWeight) || opts.push({
        value: values.fontWeight,
        label: WEIGHT_LABELS[values.fontWeight] ?? values.fontWeight,
        tooltip: WEIGHT_LABELS[values.fontWeight] ? `font-weight: ${values.fontWeight}` : void 0
      }), opts;
    }, [availableWeights, values.fontWeight]), fontFamilyOptions = T2(() => {
      let family = stripCSSQuotes(values.fontFamily.split(",")[0]?.trim() ?? "");
      return [{ value: family, label: family }];
    }, [values.fontFamily]), colorParsed = parseColor(values.color), makePropHandler = q2(
      (property, format2 = (v3) => String(v3)) => (v3) => onChange({ property, value: format2(v3) }),
      [onChange]
    ), makeScrubHandler = q2(
      (callback, property, format2 = (v3) => String(v3)) => (v3) => {
        callback && callback({ property, value: format2(v3) });
      },
      []
    ), handleFamilyChange = T2(() => makePropHandler("font-family"), [makePropHandler]), handleWeightChange = T2(() => makePropHandler("font-weight"), [makePropHandler]), handleFontSizeChange = T2(
      () => makePropHandler("font-size", (v3) => `${v3}px`),
      [makePropHandler]
    ), handleFontSizeScrub = T2(
      () => makeScrubHandler(onScrub, "font-size", (v3) => `${v3}px`),
      [makeScrubHandler, onScrub]
    ), handleFontSizeScrubEnd = T2(
      () => makeScrubHandler(onScrubEnd, "font-size", (v3) => `${v3}px`),
      [makeScrubHandler, onScrubEnd]
    ), handleLineHeightChange = T2(
      () => makePropHandler("line-height"),
      [makePropHandler]
    ), handleLineHeightScrub = T2(
      () => makeScrubHandler(onScrub, "line-height"),
      [makeScrubHandler, onScrub]
    ), handleLineHeightScrubEnd = T2(
      () => makeScrubHandler(onScrubEnd, "line-height"),
      [makeScrubHandler, onScrubEnd]
    ), handleLetterSpacingChange = T2(
      () => makePropHandler("letter-spacing", (v3) => `${v3}px`),
      [makePropHandler]
    ), handleLetterSpacingScrub = T2(
      () => makeScrubHandler(onScrub, "letter-spacing", (v3) => `${v3}px`),
      [makeScrubHandler, onScrub]
    ), handleLetterSpacingScrubEnd = T2(
      () => makeScrubHandler(onScrubEnd, "letter-spacing", (v3) => `${v3}px`),
      [makeScrubHandler, onScrubEnd]
    ), handleHorizontalAlignChange = T2(
      () => (v3) => {
        v3 !== "left" && v3 !== "center" && v3 !== "right" || onChange({ kind: "typography-align", axis: "horizontal", value: v3 });
      },
      [onChange]
    ), handleColorChange = T2(() => makePropHandler("color"), [makePropHandler]), handleColorScrub = T2(
      () => makeScrubHandler(onScrub, "color"),
      [makeScrubHandler, onScrub]
    ), handleColorScrubEnd = T2(
      () => makeScrubHandler(onScrubEnd, "color"),
      [makeScrubHandler, onScrubEnd]
    ), handleColorAlphaChange = q2(
      (alpha) => onChange({ property: "color", value: formatColor(colorParsed.hex, alpha) }),
      [onChange, colorParsed.hex]
    ), handleVerticalAlignChange = q2(
      (v3) => {
        v3 !== "flex-start" && v3 !== "center" && v3 !== "flex-end" || values.canAlignVertically && onChange({ kind: "typography-align", axis: "vertical", value: v3 });
      },
      [onChange, values.canAlignVertically]
    ), typographyTriggerPillRef = A2(null), typographyTriggerTButtonRef = A2(null), colorTriggerPillRef = A2(null), colorTriggerSwatchButtonRef = A2(null), typographyTriggerRefs = T2(
      () => [typographyTriggerPillRef, typographyTriggerTButtonRef],
      []
    ), colorTriggerRefs = T2(
      () => [colorTriggerPillRef, colorTriggerSwatchButtonRef],
      []
    ), handleTypographyOpenPicker = q2(
      () => setPickerOpen((prev) => prev === "text" ? null : "text"),
      []
    ), handleTypographyClosePicker = q2(() => setPickerOpen(null), []), handleTypographyUnlink = q2(() => {
      bundle && onChange({
        kind: "unlink-text-component",
        removeClass: `text-${bundle.name}`,
        inline: buildUnlinkTypography(values)
      });
    }, [bundle, onChange, values]), handleTypographyPick = q2(
      (picked) => {
        onChange({
          kind: "link-text-component",
          component: picked,
          removeClass: bundle ? `text-${bundle.name}` : void 0
        }), setPickerOpen(null);
      },
      [bundle, onChange]
    ), handleColorOpenPicker = q2(
      () => setPickerOpen((prev) => prev === "color" ? null : "color"),
      []
    ), handleColorClosePicker = q2(() => setPickerOpen(null), []), handleColorUnlink = q2(() => {
      chip && onChange({
        kind: "unlink-color-chip",
        removeClass: `text-${chip.name}`,
        inline: buildUnlinkColor(values)
      });
    }, [chip, onChange, values]), handleColorPick = q2(
      (picked) => {
        onChange({
          kind: "link-color-chip",
          chip: picked,
          removeClass: chip ? `text-${chip.name}` : void 0
        }), setPickerOpen(null);
      },
      [chip, onChange]
    );
    return /* @__PURE__ */ u4("div", { class: "cortex-typography-section", "data-section-id": "type", children: [
      typographyLinked ? /* @__PURE__ */ u4("div", { class: "cortex-typography-section__row", children: [
        /* @__PURE__ */ u4(
          TextComponentPill,
          {
            tokenName: bundle.name,
            onSwap: handleTypographyOpenPicker,
            onUnlink: handleTypographyUnlink,
            bodyRef: typographyTriggerPillRef
          }
        ),
        pickerOpen === "text" && /* @__PURE__ */ u4(
          TextComponentPicker,
          {
            components: textComponents ?? [],
            currentName: bundle.name,
            onPick: handleTypographyPick,
            onDismiss: handleTypographyClosePicker,
            triggerRefs: typographyTriggerRefs
          }
        )
      ] }) : /* @__PURE__ */ u4(k, { children: [
        /* @__PURE__ */ u4(
          "div",
          {
            class: `cortex-typography-section__row cortex-typography-section__row--with-t${isDimmed(dimmedProperties, "font-family") ? " cortex-control--dimmed" : ""}`,
            children: [
              /* @__PURE__ */ u4(
                Dropdown,
                {
                  options: fontFamilyOptions,
                  value: fontFamilyOptions[0]?.value ?? "",
                  onChange: handleFamilyChange,
                  mixed: mixedProperties?.has("font-family")
                }
              ),
              /* @__PURE__ */ u4(
                "button",
                {
                  ref: typographyTriggerTButtonRef,
                  type: "button",
                  class: "cortex-typography-section__t-button",
                  onClick: handleTypographyOpenPicker,
                  "aria-label": "Link to text component",
                  children: /* @__PURE__ */ u4(Type, { size: 16 })
                }
              ),
              pickerOpen === "text" && /* @__PURE__ */ u4(
                TextComponentPicker,
                {
                  components: textComponents ?? [],
                  currentName: null,
                  onPick: handleTypographyPick,
                  onDismiss: handleTypographyClosePicker,
                  triggerRefs: typographyTriggerRefs
                }
              )
            ]
          }
        ),
        /* @__PURE__ */ u4(
          "div",
          {
            class: `cortex-typography-section__row${isDimmed(dimmedProperties, "font-weight", "font-size") ? " cortex-control--dimmed" : ""}`,
            children: [
              /* @__PURE__ */ u4("div", { class: "cortex-typography-section__field", children: /* @__PURE__ */ u4(
                Dropdown,
                {
                  options: weightOptions,
                  value: values.fontWeight,
                  onChange: handleWeightChange,
                  mixed: mixedProperties?.has("font-weight")
                }
              ) }),
              /* @__PURE__ */ u4("div", { class: "cortex-typography-section__field", children: /* @__PURE__ */ u4(
                NumericInput,
                {
                  value: values.fontSize,
                  unit: "px",
                  tooltip: "Font Size",
                  min: 1,
                  mixed: mixedProperties?.has("font-size"),
                  onChange: handleFontSizeChange,
                  onScrub: handleFontSizeScrub,
                  onScrubEnd: handleFontSizeScrubEnd
                }
              ) })
            ]
          }
        ),
        /* @__PURE__ */ u4(
          "div",
          {
            class: `cortex-typography-section__row${isDimmed(dimmedProperties, "line-height", "letter-spacing") ? " cortex-control--dimmed" : ""}`,
            children: [
              /* @__PURE__ */ u4("div", { class: "cortex-typography-section__field", children: /* @__PURE__ */ u4(
                NumericInput,
                {
                  value: values.lineHeight,
                  prefix: /* @__PURE__ */ u4(LineHeightIcon, { size: 12 }),
                  tooltip: "Line Height",
                  mixed: mixedProperties?.has("line-height"),
                  onChange: handleLineHeightChange,
                  onScrub: handleLineHeightScrub,
                  onScrubEnd: handleLineHeightScrubEnd
                }
              ) }),
              /* @__PURE__ */ u4("div", { class: "cortex-typography-section__field", children: /* @__PURE__ */ u4(
                NumericInput,
                {
                  value: values.letterSpacing,
                  unit: "px",
                  prefix: /* @__PURE__ */ u4(LetterSpacingIcon, { size: 12 }),
                  tooltip: "Letter Spacing",
                  mixed: mixedProperties?.has("letter-spacing"),
                  onChange: handleLetterSpacingChange,
                  onScrub: handleLetterSpacingScrub,
                  onScrubEnd: handleLetterSpacingScrubEnd
                }
              ) })
            ]
          }
        )
      ] }),
      colorLinked ? /* @__PURE__ */ u4("div", { class: "cortex-typography-section__row", children: [
        /* @__PURE__ */ u4(
          ColorChipPill,
          {
            tokenName: `text-${chip.name}`,
            hex: chip.hex,
            onSwap: handleColorOpenPicker,
            onUnlink: handleColorUnlink,
            bodyRef: colorTriggerPillRef
          }
        ),
        pickerOpen === "color" && /* @__PURE__ */ u4(
          ColorChipPicker,
          {
            chips: colorChips ?? [],
            currentName: chip.name,
            onPick: handleColorPick,
            onDismiss: handleColorClosePicker,
            triggerRefs: colorTriggerRefs
          }
        )
      ] }) : /* @__PURE__ */ u4(
        "div",
        {
          class: `cortex-typography-section__row cortex-typography-section__row--with-swatch${isDimmed(dimmedProperties, "color") ? " cortex-control--dimmed" : ""}`,
          children: [
            /* @__PURE__ */ u4(
              ColorInput,
              {
                value: values.color,
                onChange: handleColorChange,
                onScrub: onScrub ? handleColorScrub : void 0,
                onScrubEnd: onScrubEnd ? handleColorScrubEnd : void 0,
                alpha: colorParsed.alpha,
                onAlphaChange: handleColorAlphaChange,
                swatches,
                mixed: mixedProperties?.has("color")
              }
            ),
            /* @__PURE__ */ u4(
              "button",
              {
                ref: colorTriggerSwatchButtonRef,
                type: "button",
                class: "cortex-typography-section__swatchbook-button",
                onClick: handleColorOpenPicker,
                "aria-label": "Link to color chip",
                children: /* @__PURE__ */ u4(SwatchBook, { size: 16 })
              }
            ),
            pickerOpen === "color" && /* @__PURE__ */ u4(
              ColorChipPicker,
              {
                chips: colorChips ?? [],
                currentName: null,
                onPick: handleColorPick,
                onDismiss: handleColorClosePicker,
                triggerRefs: colorTriggerRefs
              }
            )
          ]
        }
      ),
      /* @__PURE__ */ u4("div", { class: "cortex-typography-section__align-row", children: [
        /* @__PURE__ */ u4(
          SegmentedControl,
          {
            options: HORIZONTAL_ALIGN_OPTIONS,
            value: values.textAlign,
            onChange: handleHorizontalAlignChange,
            size: "sm",
            mixed: horizontalMixed
          }
        ),
        /* @__PURE__ */ u4(
          SegmentedControl,
          {
            options: VERTICAL_ALIGN_OPTIONS,
            value: values.verticalAlign,
            onChange: handleVerticalAlignChange,
            size: "sm",
            mixed: verticalMixed,
            disabled: !values.canAlignVertically,
            disabledTooltip: values.verticalAlignDisabledReason?.tooltip ?? TYPOGRAPHY_VERTICAL_DISABLED_TOOLTIP
          }
        )
      ] })
    ] });
  }

  // src/browser/components/sections/fill-utils.ts
  function parseFillValues(cs) {
    return {
      backgroundColor: cs.backgroundColor ?? "rgba(0, 0, 0, 0)",
      backgroundImage: cs.backgroundImage ?? "none"
    };
  }
  function summarizeFill(values) {
    let bgImg = values.backgroundImage;
    if (bgImg && bgImg !== "none")
      return parseLinearGradient(bgImg) ? "Gradient" : "Image";
    let { hex, alpha } = parseColor(values.backgroundColor);
    return alpha === 0 ? "transparent" : alpha < 100 ? `${hex} ${alpha}%` : hex;
  }
  function parseLinearGradient(css) {
    if (!css.startsWith("linear-gradient(")) return null;
    let inner = css.slice(16, -1), parts = [], depth = 0, start = 0;
    for (let i4 = 0; i4 < inner.length; i4++)
      inner[i4] === "(" ? depth++ : inner[i4] === ")" ? depth-- : inner[i4] === "," && depth === 0 && (parts.push(inner.slice(start, i4).trim()), start = i4 + 1);
    if (parts.push(inner.slice(start).trim()), parts.length < 2) return null;
    let angle = 180, stopStart = 0, angleMatch = parts[0].match(/^(-?[\d.]+)deg$/), dirMatch = parts[0].match(/^to\s+(top|bottom|left|right)(?:\s+(top|bottom|left|right))?$/);
    if (angleMatch)
      angle = parseFloat(angleMatch[1]), stopStart = 1;
    else if (dirMatch) {
      let primary = dirMatch[1], secondary = dirMatch[2];
      if (!secondary)
        angle = { top: 0, right: 90, bottom: 180, left: 270 }[primary] ?? 180;
      else {
        let pair = /* @__PURE__ */ new Set([primary, secondary]);
        if (pair.has("top") && pair.has("right")) angle = 45;
        else if (pair.has("bottom") && pair.has("right")) angle = 135;
        else if (pair.has("bottom") && pair.has("left")) angle = 225;
        else if (pair.has("top") && pair.has("left")) angle = 315;
        else return null;
      }
      stopStart = 1;
    }
    let stops = [];
    for (let i4 = stopStart; i4 < parts.length; i4++) {
      let part = parts[i4], posMatch = part.match(/([\d.]+)%\s*$/), position = posMatch ? parseFloat(posMatch[1]) : (i4 - stopStart) / Math.max(1, parts.length - stopStart - 1) * 100, color = posMatch ? part.slice(0, part.length - posMatch[0].length).trim() : part.trim();
      stops.push({ color, position });
    }
    return stops.length >= 2 ? { angle, stops } : null;
  }

  // src/browser/components/controls/IconButton.tsx
  function IconButton({
    icon,
    ariaLabel,
    tooltip,
    active,
    onClick,
    disabled
  }) {
    return /* @__PURE__ */ u4(
      "button",
      {
        type: "button",
        class: `cortex-icon-button${active ? " cortex-icon-button--active" : ""}`,
        "aria-label": ariaLabel,
        "aria-pressed": active !== void 0 ? active ? "true" : "false" : void 0,
        "data-tooltip": tooltip,
        disabled,
        onClick,
        children: icon
      }
    );
  }

  // src/browser/components/sections/BorderSection.tsx
  function parseBorderValues(cs) {
    let color = cs.borderColor ?? "rgb(0, 0, 0)", alphaMatch = color.match(/rgba\(\s*[\d.]+\s*,\s*[\d.]+\s*,\s*[\d.]+\s*,\s*([\d.]+)\s*\)/), alpha = alphaMatch?.[1] ? Math.round(parseFloat(alphaMatch[1]) * 100) : 100, style = cs.borderStyle ?? "none";
    return {
      borderWidth: parseFloat(cs.borderWidth) || 0,
      borderTopWidth: parseFloat(cs.borderTopWidth) || 0,
      borderRightWidth: parseFloat(cs.borderRightWidth) || 0,
      borderBottomWidth: parseFloat(cs.borderBottomWidth) || 0,
      borderLeftWidth: parseFloat(cs.borderLeftWidth) || 0,
      borderStyle: style,
      borderColor: color,
      borderOpacity: alpha,
      // `visible` is the RENDER bit — whether the border actually paints —
      // not the existence bit. `hidden` and `none` both paint nothing; the
      // eye toggle uses `hidden` so the border stays present (and the section
      // stays open) while invisible. Existence is owned by `borderWidth` and
      // surfaced to the panel via `summarizeBorder`.
      visible: style !== "none" && style !== "hidden"
    };
  }
  function summarizeBorder(values) {
    return values.borderStyle === "hidden" ? "hidden" : values.borderWidth === 0 ? "none" : `${values.borderWidth}px ${values.borderStyle}`;
  }
  function BorderSection({
    values,
    borderToken,
    onChange,
    onScrub,
    onScrubEnd,
    onRemove,
    swatches,
    colorChips,
    dimmedProperties,
    mixedProperties
  }) {
    let [perSideOpen, setPerSideOpen] = d2(!1), [pickerOpen, setPickerOpen] = d2(!1), tokenBodyRef = A2(null), tokenButtonRef = A2(null), parsed = T2(() => parseColor(values.borderColor), [values.borderColor]), borderTokenName = borderToken?.startsWith("border-") ? borderToken.slice(7) : null, borderRemoveClass = borderToken?.startsWith("border-") ? borderToken : void 0, handleColorChange = q2(
      (hex) => onChange({ property: "border-color", value: hex }),
      [onChange]
    ), handleColorScrub = q2(
      (hex) => onScrub?.({ property: "border-color", value: hex }),
      [onScrub]
    ), handleColorScrubEnd = q2(
      (hex) => onScrubEnd?.({ property: "border-color", value: hex }),
      [onScrubEnd]
    ), handleUnlink = q2(() => {
      borderRemoveClass !== void 0 && onChange({
        kind: "unlink-border-token",
        removeClass: borderRemoveClass,
        inline: [{ property: "border-color", value: values.borderColor }]
      });
    }, [onChange, values.borderColor, borderRemoveClass]), handleOpenPicker = q2(() => {
      setPickerOpen((open) => !open);
    }, []), handleClosePicker = q2(() => {
      setPickerOpen(!1);
    }, []), handlePickToken = q2(
      (chip) => {
        onChange({
          kind: "link-border-token",
          chip,
          removeClass: borderRemoveClass
        }), setPickerOpen(!1);
      },
      [onChange, borderRemoveClass]
    ), handleAlphaChange = q2(
      (alpha) => {
        onChange({ property: "border-color", value: formatColor(parsed.hex, alpha) });
      },
      [onChange, parsed.hex]
    ), handleVisibilityToggle = q2(() => {
      values.visible ? (onChange({ property: "border-width", value: `${values.borderWidth}px` }), onChange({ property: "border-top-width", value: `${values.borderTopWidth}px` }), onChange({ property: "border-right-width", value: `${values.borderRightWidth}px` }), onChange({ property: "border-bottom-width", value: `${values.borderBottomWidth}px` }), onChange({ property: "border-left-width", value: `${values.borderLeftWidth}px` }), onChange({ property: "border-style", value: "hidden" })) : onChange({ property: "border-style", value: "solid" });
    }, [
      onChange,
      values.visible,
      values.borderWidth,
      values.borderTopWidth,
      values.borderRightWidth,
      values.borderBottomWidth,
      values.borderLeftWidth
    ]), handleWidthChange = q2(
      (v3) => {
        let val = `${v3}px`;
        onChange({ property: "border-width", value: val }), onChange({ property: "border-top-width", value: val }), onChange({ property: "border-right-width", value: val }), onChange({ property: "border-bottom-width", value: val }), onChange({ property: "border-left-width", value: val });
      },
      [onChange]
    ), handleWidthScrub = q2(
      (v3) => {
        if (!onScrub) return;
        let val = `${v3}px`;
        onScrub({ property: "border-width", value: val }), onScrub({ property: "border-top-width", value: val }), onScrub({ property: "border-right-width", value: val }), onScrub({ property: "border-bottom-width", value: val }), onScrub({ property: "border-left-width", value: val });
      },
      [onScrub]
    ), handleWidthScrubEnd = q2(
      (v3) => {
        if (!onScrubEnd) return;
        let val = `${v3}px`;
        onScrubEnd({ property: "border-width", value: val }), onScrubEnd({ property: "border-top-width", value: val }), onScrubEnd({ property: "border-right-width", value: val }), onScrubEnd({ property: "border-bottom-width", value: val }), onScrubEnd({ property: "border-left-width", value: val });
      },
      [onScrubEnd]
    ), handlePerSideToggle = q2(() => {
      setPerSideOpen((v3) => !v3);
    }, []), handleTopWidth = q2(
      (v3) => onChange({ property: "border-top-width", value: `${v3}px` }),
      [onChange]
    ), handleRightWidth = q2(
      (v3) => onChange({ property: "border-right-width", value: `${v3}px` }),
      [onChange]
    ), handleBottomWidth = q2(
      (v3) => onChange({ property: "border-bottom-width", value: `${v3}px` }),
      [onChange]
    ), handleLeftWidth = q2(
      (v3) => onChange({ property: "border-left-width", value: `${v3}px` }),
      [onChange]
    ), handleTopWidthScrub = q2(
      (v3) => {
        onScrub && onScrub({ property: "border-top-width", value: `${v3}px` });
      },
      [onScrub]
    ), handleRightWidthScrub = q2(
      (v3) => {
        onScrub && onScrub({ property: "border-right-width", value: `${v3}px` });
      },
      [onScrub]
    ), handleBottomWidthScrub = q2(
      (v3) => {
        onScrub && onScrub({ property: "border-bottom-width", value: `${v3}px` });
      },
      [onScrub]
    ), handleLeftWidthScrub = q2(
      (v3) => {
        onScrub && onScrub({ property: "border-left-width", value: `${v3}px` });
      },
      [onScrub]
    ), handleTopWidthScrubEnd = q2(
      (v3) => {
        onScrubEnd && onScrubEnd({ property: "border-top-width", value: `${v3}px` });
      },
      [onScrubEnd]
    ), handleRightWidthScrubEnd = q2(
      (v3) => {
        onScrubEnd && onScrubEnd({ property: "border-right-width", value: `${v3}px` });
      },
      [onScrubEnd]
    ), handleBottomWidthScrubEnd = q2(
      (v3) => {
        onScrubEnd && onScrubEnd({ property: "border-bottom-width", value: `${v3}px` });
      },
      [onScrubEnd]
    ), handleLeftWidthScrubEnd = q2(
      (v3) => {
        onScrubEnd && onScrubEnd({ property: "border-left-width", value: `${v3}px` });
      },
      [onScrubEnd]
    );
    return /* @__PURE__ */ u4("div", { class: "cortex-border-section", "data-section-id": "border", children: [
      /* @__PURE__ */ u4("div", { class: `cortex-border-section__color-row${isDimmed(dimmedProperties, "border-color") ? " cortex-control--dimmed" : ""}`, children: (() => {
        let eyeButton = /* @__PURE__ */ u4(
          IconButton,
          {
            icon: values.visible ? /* @__PURE__ */ u4(Eye, { size: 14 }) : /* @__PURE__ */ u4(EyeClosed, { size: 14 }),
            ariaLabel: values.visible ? "Hide border" : "Show border",
            tooltip: values.visible ? "Hide border" : "Show border",
            onClick: handleVisibilityToggle
          }
        ), removeButton = onRemove ? /* @__PURE__ */ u4(
          IconButton,
          {
            icon: /* @__PURE__ */ u4(Minus, { size: 14 }),
            ariaLabel: "Remove border",
            tooltip: "Remove border",
            onClick: onRemove
          }
        ) : null, tokenButton = /* @__PURE__ */ u4(
          "button",
          {
            ref: tokenButtonRef,
            type: "button",
            class: "cortex-icon-button",
            "aria-label": "Link to color chip",
            "data-tooltip": "Link to color chip",
            onClick: handleOpenPicker,
            children: /* @__PURE__ */ u4(SwatchBook, { size: 14 })
          }
        ), picker = pickerOpen ? /* @__PURE__ */ u4(
          ColorChipPicker,
          {
            chips: colorChips ?? [],
            currentName: borderTokenName,
            onPick: handlePickToken,
            onDismiss: handleClosePicker,
            triggerRefs: [tokenBodyRef, tokenButtonRef]
          }
        ) : null, trailing = /* @__PURE__ */ u4(k, { children: [
          eyeButton,
          removeButton
        ] });
        return borderToken !== null ? /* @__PURE__ */ u4("div", { class: "cortex-border-section__token-row", children: [
          /* @__PURE__ */ u4(
            TokenChip,
            {
              tokenName: borderToken,
              swatch: isColorLike(values.borderColor) ? { kind: "color", value: values.borderColor } : { kind: "pattern" },
              onBodyClick: handleOpenPicker,
              onUnlink: handleUnlink,
              ariaLabel: `Swap color chip (currently ${borderToken})`,
              bodyRef: tokenBodyRef
            }
          ),
          trailing,
          picker
        ] }) : /* @__PURE__ */ u4("div", { class: "cortex-border-section__token-row cortex-border-section__token-row--raw", children: [
          /* @__PURE__ */ u4(
            ColorInput,
            {
              value: values.borderColor,
              onChange: handleColorChange,
              onScrub: onScrub ? handleColorScrub : void 0,
              onScrubEnd: onScrubEnd ? handleColorScrubEnd : void 0,
              alpha: values.borderOpacity,
              onAlphaChange: handleAlphaChange,
              swatches,
              mixed: mixedProperties?.has("border-color"),
              trailing: /* @__PURE__ */ u4(k, { children: [
                tokenButton,
                trailing
              ] })
            }
          ),
          picker
        ] });
      })() }),
      /* @__PURE__ */ u4("div", { class: `cortex-border-section__width-row${isDimmed(dimmedProperties, "border-width", "border-top-width", "border-right-width", "border-bottom-width", "border-left-width") ? " cortex-control--dimmed" : ""}`, children: [
        /* @__PURE__ */ u4(
          NumericInput,
          {
            value: values.borderWidth,
            unit: "px",
            prefix: /* @__PURE__ */ u4(SquareDashed, { size: 14 }),
            tooltip: "Border Width",
            min: 0,
            mixed: mixedProperties?.has("border-width") || values.borderTopWidth !== values.borderRightWidth || values.borderTopWidth !== values.borderBottomWidth || values.borderTopWidth !== values.borderLeftWidth,
            onChange: handleWidthChange,
            onScrub: handleWidthScrub,
            onScrubEnd: handleWidthScrubEnd
          }
        ),
        /* @__PURE__ */ u4(
          IconButton,
          {
            icon: /* @__PURE__ */ u4(SquareDashed, { size: 14 }),
            ariaLabel: perSideOpen ? "Collapse per-side widths" : "Expand per-side widths",
            tooltip: perSideOpen ? "Collapse per-side widths" : "Expand per-side widths",
            active: perSideOpen,
            onClick: handlePerSideToggle
          }
        )
      ] }),
      perSideOpen && /* @__PURE__ */ u4("div", { class: "cortex-border-section__per-side", children: [
        /* @__PURE__ */ u4(
          NumericInput,
          {
            value: values.borderTopWidth,
            unit: "px",
            prefix: /* @__PURE__ */ u4(SquareSideTop, { size: 14 }),
            tooltip: "Border Top Width",
            min: 0,
            mixed: mixedProperties?.has("border-top-width"),
            onChange: handleTopWidth,
            onScrub: handleTopWidthScrub,
            onScrubEnd: handleTopWidthScrubEnd
          }
        ),
        /* @__PURE__ */ u4(
          NumericInput,
          {
            value: values.borderRightWidth,
            unit: "px",
            prefix: /* @__PURE__ */ u4(SquareSideRight, { size: 14 }),
            tooltip: "Border Right Width",
            min: 0,
            mixed: mixedProperties?.has("border-right-width"),
            onChange: handleRightWidth,
            onScrub: handleRightWidthScrub,
            onScrubEnd: handleRightWidthScrubEnd
          }
        ),
        /* @__PURE__ */ u4(
          NumericInput,
          {
            value: values.borderBottomWidth,
            unit: "px",
            prefix: /* @__PURE__ */ u4(SquareSideBottom, { size: 14 }),
            tooltip: "Border Bottom Width",
            min: 0,
            mixed: mixedProperties?.has("border-bottom-width"),
            onChange: handleBottomWidth,
            onScrub: handleBottomWidthScrub,
            onScrubEnd: handleBottomWidthScrubEnd
          }
        ),
        /* @__PURE__ */ u4(
          NumericInput,
          {
            value: values.borderLeftWidth,
            unit: "px",
            prefix: /* @__PURE__ */ u4(SquareSideLeft, { size: 14 }),
            tooltip: "Border Left Width",
            min: 0,
            mixed: mixedProperties?.has("border-left-width"),
            onChange: handleLeftWidth,
            onScrub: handleLeftWidthScrub,
            onScrubEnd: handleLeftWidthScrubEnd
          }
        )
      ] })
    ] });
  }

  // src/core/shadow-utils.ts
  function splitShadows(value) {
    let parts = [], depth = 0, start = 0;
    for (let i4 = 0; i4 < value.length; i4++)
      value[i4] === "(" ? depth++ : value[i4] === ")" ? depth-- : value[i4] === "," && depth === 0 && (parts.push(value.slice(start, i4).trim()), start = i4 + 1);
    return parts.push(value.slice(start).trim()), parts.filter(Boolean);
  }
  function parseSingleShadow(raw) {
    let s3 = raw.trim(), inset = /\binset\b/i.test(s3);
    inset && (s3 = s3.replace(/\binset\b/i, "").trim());
    let COLOR_PATTERN = /#[0-9a-fA-F]{3,8}|rgba?\([^)]*\)/, colorEndMatch = s3.match(new RegExp(`(${COLOR_PATTERN.source})\\s*$`)), color = "rgba(0, 0, 0, 0.1)";
    if (colorEndMatch && colorEndMatch.index !== void 0)
      color = colorEndMatch[1] ?? color, s3 = s3.slice(0, colorEndMatch.index).trim();
    else {
      let colorStartMatch = s3.match(new RegExp(`^(${COLOR_PATTERN.source})\\s+`));
      colorStartMatch && (color = colorStartMatch[1] ?? color, s3 = s3.slice(colorStartMatch[0].length).trim());
    }
    let nums = s3.match(/-?[\d.]+/g)?.map(Number) ?? [];
    return {
      inset,
      x: nums[0] ?? 0,
      y: nums[1] ?? 0,
      blur: nums[2] ?? 0,
      spread: nums[3] ?? 0,
      color
    };
  }
  function parseBoxShadow(value) {
    let trimmed = value.trim();
    return trimmed === "none" || trimmed === "" ? [] : splitShadows(trimmed).map(parseSingleShadow);
  }
  function serializeBoxShadow(shadows) {
    return shadows.length === 0 ? "none" : shadows.map((s3) => {
      let parts = [];
      return s3.inset && parts.push("inset"), parts.push(`${s3.x}px`, `${s3.y}px`, `${s3.blur}px`, `${s3.spread}px`, s3.color), parts.join(" ");
    }).join(", ");
  }

  // src/browser/components/sections/EffectsSection.tsx
  function parseBlurValue(filter) {
    let m3 = filter.match(/blur\(([\d.]+)px\)/);
    return m3?.[1] ? parseFloat(m3[1]) : 0;
  }
  function replaceBlurInFilter(existing, newBlur) {
    let withoutBlur = (!existing || existing === "none" ? "" : existing).replace(/blur\([^)]*\)/g, "").replace(/\s{2,}/g, " ").trim();
    return newBlur === 0 ? withoutBlur || "none" : withoutBlur ? `${withoutBlur} blur(${newBlur}px)` : `blur(${newBlur}px)`;
  }
  function parseEffectsValues(cs) {
    return {
      boxShadow: cs.boxShadow ?? "none",
      blur: parseBlurValue(cs.filter ?? ""),
      backdropBlur: parseBlurValue(
        cs.backdropFilter ?? cs.webkitBackdropFilter ?? ""
      ),
      filterRaw: cs.filter ?? "",
      backdropFilterRaw: cs.backdropFilter ?? cs.webkitBackdropFilter ?? ""
    };
  }
  function addShadow(currentBoxShadow) {
    let shadows = parseBoxShadow(currentBoxShadow);
    return serializeBoxShadow([...shadows, { ...DEFAULT_SHADOW }]);
  }
  var DEFAULT_SHADOW = {
    inset: !1,
    x: 0,
    y: 2,
    blur: 8,
    spread: 0,
    color: "rgba(0, 0, 0, 0.1)"
  }, SHADOW_TYPE_OPTIONS = [
    { value: "drop", label: "Drop shadow" },
    { value: "inset", label: "Inner shadow" }
  ], ZEROED_SHADOW = {
    x: 0,
    y: 0,
    blur: 0,
    spread: 0
  };
  function isShadowEnabled(s3) {
    return s3.x !== 0 || s3.y !== 0 || s3.blur !== 0 || s3.spread !== 0;
  }
  function EffectsSection({
    values,
    onChange,
    onScrub,
    onScrubEnd,
    swatches,
    dimmedProperties,
    mixedProperties
  }) {
    let [expandedKey, setExpandedKey] = d2(null), stashRef = A2(/* @__PURE__ */ new Map()), shadows = T2(() => parseBoxShadow(values.boxShadow).map((s3, i4) => ({ ...s3, _key: i4 })), [values.boxShadow]), emitChange = q2(
      (updated) => {
        onChange({ property: "box-shadow", value: serializeBoxShadow(updated) });
      },
      [onChange]
    ), handleRemove = q2(
      (index) => {
        let shifted = /* @__PURE__ */ new Map();
        for (let [key, val] of stashRef.current)
          key < index ? shifted.set(key, val) : key > index && shifted.set(key - 1, val);
        stashRef.current = shifted, setExpandedKey((prev) => prev === null || prev === index ? null : prev > index ? prev - 1 : prev);
        let updated = shadows.filter((_3, i4) => i4 !== index);
        emitChange(updated);
      },
      [shadows, emitChange]
    ), handleFieldChange = q2(
      (index, field, value) => {
        let updated = shadows.map(
          (s3, i4) => i4 === index ? { ...s3, [field]: value } : s3
        );
        emitChange(updated);
      },
      [shadows, emitChange]
    ), handleFieldScrub = q2(
      (index, field, value) => {
        if (!onScrub) return;
        let updated = shadows.map(
          (s3, i4) => i4 === index ? { ...s3, [field]: value } : s3
        );
        onScrub({ property: "box-shadow", value: serializeBoxShadow(updated) });
      },
      [shadows, onScrub]
    ), handleFieldScrubEnd = q2(
      (index, field, value) => {
        if (!onScrubEnd) return;
        let updated = shadows.map(
          (s3, i4) => i4 === index ? { ...s3, [field]: value } : s3
        );
        onScrubEnd({ property: "box-shadow", value: serializeBoxShadow(updated) });
      },
      [shadows, onScrubEnd]
    ), handleTypeChange = q2(
      (index, type) => {
        handleFieldChange(index, "inset", type === "inset");
      },
      [handleFieldChange]
    ), handleEyeToggle = q2(
      (index) => {
        let shadow = shadows[index];
        if (!shadow) return;
        if (isShadowEnabled(shadow)) {
          stashRef.current.set(shadow._key, {
            x: shadow.x,
            y: shadow.y,
            blur: shadow.blur,
            spread: shadow.spread
          });
          let updated = shadows.map(
            (s3, i4) => i4 === index ? { ...s3, ...ZEROED_SHADOW } : s3
          );
          emitChange(updated);
        } else {
          let restore = stashRef.current.get(shadow._key) ?? { x: DEFAULT_SHADOW.x, y: DEFAULT_SHADOW.y, blur: DEFAULT_SHADOW.blur, spread: DEFAULT_SHADOW.spread };
          stashRef.current.delete(shadow._key);
          let updated = shadows.map(
            (s3, i4) => i4 === index ? { ...s3, ...restore } : s3
          );
          emitChange(updated);
        }
      },
      [shadows, emitChange]
    ), toggleExpand = q2((key) => {
      setExpandedKey((prev) => prev === key ? null : key);
    }, []), handleBlurChange = q2(
      (v3) => onChange({ property: "filter", value: replaceBlurInFilter(values.filterRaw, v3) }),
      [onChange, values.filterRaw]
    ), handleBlurScrub = q2(
      (v3) => {
        onScrub && onScrub({ property: "filter", value: replaceBlurInFilter(values.filterRaw, v3) });
      },
      [onScrub, values.filterRaw]
    ), handleBlurScrubEnd = q2(
      (v3) => {
        onScrubEnd && onScrubEnd({ property: "filter", value: replaceBlurInFilter(values.filterRaw, v3) });
      },
      [onScrubEnd, values.filterRaw]
    ), handleBackdropBlurChange = q2(
      (v3) => onChange({ property: "backdrop-filter", value: replaceBlurInFilter(values.backdropFilterRaw, v3) }),
      [onChange, values.backdropFilterRaw]
    ), handleBackdropBlurScrub = q2(
      (v3) => {
        onScrub && onScrub({ property: "backdrop-filter", value: replaceBlurInFilter(values.backdropFilterRaw, v3) });
      },
      [onScrub, values.backdropFilterRaw]
    ), handleBackdropBlurScrubEnd = q2(
      (v3) => {
        onScrubEnd && onScrubEnd({ property: "backdrop-filter", value: replaceBlurInFilter(values.backdropFilterRaw, v3) });
      },
      [onScrubEnd, values.backdropFilterRaw]
    );
    return /* @__PURE__ */ u4("div", { class: "cortex-effects-section", "data-section-id": "effects", children: [
      /* @__PURE__ */ u4("div", { class: `cortex-effects-section__shadows${isDimmed(dimmedProperties, "box-shadow") ? " cortex-control--dimmed" : ""}`, children: shadows.map((shadow, index) => {
        let isExpanded = expandedKey === shadow._key, enabled = isShadowEnabled(shadow);
        return /* @__PURE__ */ u4("div", { class: "cortex-effects-section__row", "data-expanded": String(isExpanded), children: [
          /* @__PURE__ */ u4("div", { class: "cortex-effects-section__row-header", children: [
            /* @__PURE__ */ u4(
              "button",
              {
                class: "cortex-effects-section__expand-btn",
                type: "button",
                "aria-label": isExpanded ? "Collapse shadow controls" : "Expand shadow controls",
                "aria-expanded": isExpanded,
                onClick: () => toggleExpand(shadow._key),
                children: /* @__PURE__ */ u4(BoxShadow, { size: 14 })
              }
            ),
            /* @__PURE__ */ u4("div", { class: "cortex-effects-section__type", children: /* @__PURE__ */ u4(
              Dropdown,
              {
                options: SHADOW_TYPE_OPTIONS,
                value: shadow.inset ? "inset" : "drop",
                onChange: (v3) => handleTypeChange(index, v3)
              }
            ) }),
            /* @__PURE__ */ u4(
              IconButton,
              {
                icon: enabled ? /* @__PURE__ */ u4(Eye, { size: 14 }) : /* @__PURE__ */ u4(EyeClosed, { size: 14 }),
                ariaLabel: enabled ? "Disable shadow" : "Enable shadow",
                tooltip: enabled ? "Disable shadow" : "Enable shadow",
                onClick: () => handleEyeToggle(index)
              }
            ),
            /* @__PURE__ */ u4(
              IconButton,
              {
                icon: /* @__PURE__ */ u4(Minus, { size: 14 }),
                ariaLabel: "Remove shadow",
                tooltip: "Remove shadow",
                onClick: () => handleRemove(index)
              }
            )
          ] }),
          isExpanded && /* @__PURE__ */ u4("div", { class: "cortex-effects-section__detail", children: [
            /* @__PURE__ */ u4("div", { class: "cortex-effects-section__grid", children: [
              /* @__PURE__ */ u4(
                NumericInput,
                {
                  value: shadow.x,
                  unit: "px",
                  label: "X",
                  tooltip: "Horizontal offset",
                  mixed: mixedProperties?.has("box-shadow"),
                  onChange: (v3) => handleFieldChange(index, "x", v3)
                }
              ),
              /* @__PURE__ */ u4(
                NumericInput,
                {
                  value: shadow.y,
                  unit: "px",
                  label: "Y",
                  tooltip: "Vertical offset",
                  mixed: mixedProperties?.has("box-shadow"),
                  onChange: (v3) => handleFieldChange(index, "y", v3)
                }
              ),
              /* @__PURE__ */ u4(
                NumericInput,
                {
                  value: shadow.blur,
                  unit: "px",
                  label: "B",
                  tooltip: "Blur radius",
                  min: 0,
                  mixed: mixedProperties?.has("box-shadow"),
                  onChange: (v3) => handleFieldChange(index, "blur", v3)
                }
              ),
              /* @__PURE__ */ u4(
                NumericInput,
                {
                  value: shadow.spread,
                  unit: "px",
                  label: "S",
                  tooltip: "Spread radius",
                  mixed: mixedProperties?.has("box-shadow"),
                  onChange: (v3) => handleFieldChange(index, "spread", v3)
                }
              )
            ] }),
            /* @__PURE__ */ u4(
              ColorInput,
              {
                value: shadow.color,
                onChange: (hex) => handleFieldChange(index, "color", hex),
                onScrub: onScrub ? (hex) => handleFieldScrub(index, "color", hex) : void 0,
                onScrubEnd: onScrubEnd ? (hex) => handleFieldScrubEnd(index, "color", hex) : void 0,
                swatches,
                mixed: mixedProperties?.has("box-shadow")
              }
            )
          ] })
        ] }, shadow._key);
      }) }),
      /* @__PURE__ */ u4("div", { class: "cortex-effects-section__blur-controls", children: [
        /* @__PURE__ */ u4("div", { class: isDimmed(dimmedProperties, "filter") ? "cortex-control--dimmed" : void 0, children: /* @__PURE__ */ u4(
          NumericInput,
          {
            value: values.blur,
            unit: "px",
            label: "BL",
            tooltip: "Blur",
            min: 0,
            mixed: mixedProperties?.has("filter"),
            onChange: handleBlurChange,
            onScrub: handleBlurScrub,
            onScrubEnd: handleBlurScrubEnd
          }
        ) }),
        /* @__PURE__ */ u4("div", { class: isDimmed(dimmedProperties, "backdrop-filter") ? "cortex-control--dimmed" : void 0, children: /* @__PURE__ */ u4(
          NumericInput,
          {
            value: values.backdropBlur,
            unit: "px",
            label: "BG",
            tooltip: "Background Blur",
            min: 0,
            mixed: mixedProperties?.has("backdrop-filter"),
            onChange: handleBackdropBlurChange,
            onScrub: handleBackdropBlurScrub,
            onScrubEnd: handleBackdropBlurScrubEnd
          }
        ) })
      ] })
    ] });
  }

  // src/browser/components/controls/PositionDropdown.tsx
  var POSITION_OPTIONS = [
    {
      value: "static",
      label: "Static",
      icon: /* @__PURE__ */ u4(Square, { size: 14 }),
      description: "Static \u2014 default position; element follows document flow"
    },
    {
      value: "relative",
      label: "Relative",
      icon: /* @__PURE__ */ u4(MoveDiagonal, { size: 14 }),
      description: "Relative \u2014 positioned relative to its normal position"
    },
    {
      value: "absolute",
      label: "Absolute",
      icon: /* @__PURE__ */ u4(Maximize, { size: 14 }),
      description: "Absolute \u2014 positioned relative to nearest positioned ancestor"
    },
    {
      value: "fixed",
      label: "Fixed",
      icon: /* @__PURE__ */ u4(Pin, { size: 14 }),
      description: "Fixed \u2014 positioned relative to the viewport"
    },
    {
      value: "sticky",
      label: "Sticky",
      icon: /* @__PURE__ */ u4(Paperclip, { size: 14 }),
      description: "Sticky \u2014 sticks to container edge when scrolling"
    }
  ];
  function findIndex2(value) {
    let i4 = POSITION_OPTIONS.findIndex((o4) => o4.value === value);
    return i4 === -1 ? 0 : i4;
  }
  function optionAt(idx) {
    return POSITION_OPTIONS[idx] ?? POSITION_OPTIONS[0];
  }
  function PositionDropdown({
    value,
    onChange,
    disabled = !1
  }) {
    let [isOpen, setIsOpen] = d2(!1), [highlightIdx, setHighlightIdx] = d2(findIndex2(value)), [hoverIdx, setHoverIdx] = d2(null), triggerRef = A2(null), popoverRef = A2(null), selected = optionAt(findIndex2(value)), describedOption = optionAt(hoverIdx ?? highlightIdx), activeId = isOpen ? `cortex-position-opt-${optionAt(highlightIdx).value}` : void 0;
    y2(() => {
      if (!isOpen || !triggerRef.current || !popoverRef.current) return;
      let cancelled = !1, trigger = triggerRef.current, popover = popoverRef.current;
      return popover.style.width = `${trigger.offsetWidth}px`, computePosition2(trigger, popover, {
        placement: "bottom-start",
        middleware: [flip2(), shift2()]
      }).then(({ x: x3, y: y3 }) => {
        !cancelled && popoverRef.current && (popoverRef.current.style.left = `${x3}px`, popoverRef.current.style.top = `${y3}px`);
      }).catch((err) => {
        if (!cancelled) {
          console.warn("[cortex] PositionDropdown positioning failed:", err instanceof Error ? err.message : err);
          let rect = trigger.getBoundingClientRect();
          popoverRef.current && (popoverRef.current.style.left = `${rect.left}px`, popoverRef.current.style.top = `${rect.bottom}px`);
        }
      }), () => {
        cancelled = !0;
      };
    }, [isOpen]), y2(() => {
      isOpen || setHighlightIdx(findIndex2(value));
    }, [value, isOpen]);
    let open = q2(() => {
      disabled || (setHighlightIdx(findIndex2(value)), setHoverIdx(null), setIsOpen(!0));
    }, [disabled, value]), close = q2(() => {
      setIsOpen(!1), setHoverIdx(null), triggerRef.current?.focus();
    }, []), select = q2(
      (optValue) => {
        onChange(optValue), setIsOpen(!1), setHoverIdx(null), triggerRef.current?.focus();
      },
      [onChange]
    ), handleTriggerClick = q2(() => {
      disabled || (isOpen ? close() : open());
    }, [disabled, isOpen, open, close]), handleKeyDown = q2(
      (e4) => {
        isOpen && (e4.key === "Escape" ? (e4.preventDefault(), close()) : e4.key === "ArrowDown" ? (e4.preventDefault(), setHighlightIdx((i4) => (i4 + 1) % POSITION_OPTIONS.length), setHoverIdx(null)) : e4.key === "ArrowUp" ? (e4.preventDefault(), setHighlightIdx((i4) => (i4 - 1 + POSITION_OPTIONS.length) % POSITION_OPTIONS.length), setHoverIdx(null)) : e4.key === "Home" ? (e4.preventDefault(), setHighlightIdx(0), setHoverIdx(null)) : e4.key === "End" ? (e4.preventDefault(), setHighlightIdx(POSITION_OPTIONS.length - 1), setHoverIdx(null)) : (e4.key === "Enter" || e4.key === " ") && (e4.preventDefault(), select(optionAt(highlightIdx).value)));
      },
      [isOpen, close, highlightIdx, select]
    );
    return /* @__PURE__ */ u4("div", { class: "cortex-position-dropdown", children: [
      /* @__PURE__ */ u4(
        "button",
        {
          ref: triggerRef,
          class: "cortex-position-dropdown__trigger",
          type: "button",
          role: "combobox",
          "aria-haspopup": "listbox",
          "aria-expanded": isOpen ? "true" : "false",
          "aria-activedescendant": activeId,
          disabled,
          onClick: handleTriggerClick,
          onKeyDown: handleKeyDown,
          children: [
            /* @__PURE__ */ u4("span", { class: "cortex-position-dropdown__trigger-icon", "aria-hidden": "true", children: selected.icon }),
            /* @__PURE__ */ u4("span", { class: "cortex-position-dropdown__trigger-label", children: selected.label }),
            /* @__PURE__ */ u4(
              "span",
              {
                class: `cortex-position-dropdown__chevron${isOpen ? " cortex-position-dropdown__chevron--open" : ""}`,
                "aria-hidden": "true",
                children: /* @__PURE__ */ u4(ChevronDown, { size: 14 })
              }
            )
          ]
        }
      ),
      isOpen && /* @__PURE__ */ u4(k, { children: [
        /* @__PURE__ */ u4("div", { class: "cortex-position-dropdown__backdrop", onClick: close }),
        /* @__PURE__ */ u4(
          "div",
          {
            ref: popoverRef,
            class: "cortex-position-dropdown__popover",
            style: { position: "fixed" },
            children: [
              /* @__PURE__ */ u4(
                "div",
                {
                  class: "cortex-position-dropdown__list",
                  role: "listbox",
                  "aria-label": "Position mode",
                  children: POSITION_OPTIONS.map((opt, i4) => {
                    let isSelected = opt.value === value, isHighlighted = i4 === highlightIdx;
                    return /* @__PURE__ */ u4(
                      "div",
                      {
                        id: `cortex-position-opt-${opt.value}`,
                        class: [
                          "cortex-position-dropdown__option",
                          isHighlighted && "cortex-position-dropdown__option--highlighted",
                          isSelected && "cortex-position-dropdown__option--selected"
                        ].filter(Boolean).join(" "),
                        role: "option",
                        "aria-selected": isSelected ? "true" : "false",
                        onClick: () => select(opt.value),
                        onMouseEnter: () => {
                          setHoverIdx(i4), setHighlightIdx(i4);
                        },
                        onMouseLeave: () => setHoverIdx(null),
                        children: [
                          /* @__PURE__ */ u4("span", { class: "cortex-position-dropdown__option-icon", "aria-hidden": "true", children: opt.icon }),
                          /* @__PURE__ */ u4("span", { class: "cortex-position-dropdown__option-label", children: opt.label }),
                          isSelected && /* @__PURE__ */ u4("span", { class: "cortex-position-dropdown__option-check", "aria-hidden": "true", children: /* @__PURE__ */ u4(Check, { size: 14 }) })
                        ]
                      },
                      opt.value
                    );
                  })
                }
              ),
              /* @__PURE__ */ u4("div", { class: "cortex-position-dropdown__description", children: describedOption.description })
            ]
          }
        )
      ] })
    ] });
  }

  // src/browser/components/sections/PositionSection.tsx
  var STATIC_POSITION_TOOLTIP = "Switch to relative, absolute, fixed, or sticky to edit position";
  function parsePositionValues(cs) {
    let scale = cs.scale ?? "none", scaleX = "1", scaleY = "1";
    if (scale !== "none") {
      let parts = scale.split(/\s+/);
      scaleX = parts[0] ?? "1", scaleY = parts[1] ?? parts[0] ?? "1";
    }
    return {
      position: cs.position ?? "static",
      left: cs.left ?? "auto",
      top: cs.top ?? "auto",
      zIndex: cs.zIndex ?? "auto",
      rotate: cs.rotate ?? "none",
      scaleX,
      scaleY,
      justifySelf: cs.justifySelf ?? "auto",
      alignSelf: cs.alignSelf ?? "auto"
    };
  }
  function SelfAlignmentBlock({
    onChange
  }) {
    let setJustify = q2(
      (value) => onChange({ property: "justify-self", value }),
      [onChange]
    ), setAlign = q2(
      (value) => onChange({ property: "align-self", value }),
      [onChange]
    );
    return /* @__PURE__ */ u4("div", { class: "cortex-position-section__self-align", children: [
      /* @__PURE__ */ u4("div", { class: "cortex-position-section__btn-group", role: "group", "aria-label": "Justify self", children: [
        /* @__PURE__ */ u4(IconButton, { icon: /* @__PURE__ */ u4(AlignHorizontalJustifyStart, { size: 14 }), ariaLabel: "Justify self start", tooltip: "Justify self \xB7 start", onClick: () => setJustify("start") }),
        /* @__PURE__ */ u4(IconButton, { icon: /* @__PURE__ */ u4(AlignHorizontalJustifyCenter, { size: 14 }), ariaLabel: "Justify self center", tooltip: "Justify self \xB7 center", onClick: () => setJustify("center") }),
        /* @__PURE__ */ u4(IconButton, { icon: /* @__PURE__ */ u4(AlignHorizontalJustifyEnd, { size: 14 }), ariaLabel: "Justify self end", tooltip: "Justify self \xB7 end", onClick: () => setJustify("end") })
      ] }),
      /* @__PURE__ */ u4("div", { class: "cortex-position-section__btn-group", role: "group", "aria-label": "Align self", children: [
        /* @__PURE__ */ u4(IconButton, { icon: /* @__PURE__ */ u4(AlignVerticalJustifyStart, { size: 14 }), ariaLabel: "Align self start", tooltip: "Align self \xB7 start", onClick: () => setAlign("start") }),
        /* @__PURE__ */ u4(IconButton, { icon: /* @__PURE__ */ u4(AlignVerticalJustifyCenter, { size: 14 }), ariaLabel: "Align self center", tooltip: "Align self \xB7 center", onClick: () => setAlign("center") }),
        /* @__PURE__ */ u4(IconButton, { icon: /* @__PURE__ */ u4(AlignVerticalJustifyEnd, { size: 14 }), ariaLabel: "Align self end", tooltip: "Align self \xB7 end", onClick: () => setAlign("end") })
      ] })
    ] });
  }
  function PositionSection({
    values,
    onChange,
    onScrub,
    onScrubEnd,
    dimmedProperties,
    stale
  }) {
    let isStatic = values.position === "static", handlePositionMode = q2(
      (v3) => onChange({ property: "position", value: v3 }),
      [onChange]
    ), handleXChange = q2(
      (v3) => onChange({ property: "left", value: `${v3}px` }),
      [onChange]
    ), handleYChange = q2(
      (v3) => onChange({ property: "top", value: `${v3}px` }),
      [onChange]
    ), handleZChange = q2(
      (v3) => onChange({ property: "z-index", value: `${v3}` }),
      [onChange]
    ), handleXScrub = q2(
      (v3) => onScrub?.({ property: "left", value: `${v3}px` }),
      [onScrub]
    ), handleYScrub = q2(
      (v3) => onScrub?.({ property: "top", value: `${v3}px` }),
      [onScrub]
    ), handleXScrubEnd = q2(
      (v3) => onScrubEnd?.({ property: "left", value: `${v3}px` }),
      [onScrubEnd]
    ), handleYScrubEnd = q2(
      (v3) => onScrubEnd?.({ property: "top", value: `${v3}px` }),
      [onScrubEnd]
    ), rotateNum = values.rotate === "none" ? 0 : parseFloat(values.rotate), isFlippedH = parseFloat(values.scaleX) < 0, isFlippedV = parseFloat(values.scaleY) < 0, handleRotateChange = q2(
      (v3) => onChange({ property: "rotate", value: `${v3}deg` }),
      [onChange]
    ), handleRotateScrub = q2(
      (v3) => {
        onScrub && onScrub({ property: "rotate", value: `${v3}deg` });
      },
      [onScrub]
    ), handleRotateScrubEnd = q2(
      (v3) => {
        onScrubEnd && onScrubEnd({ property: "rotate", value: `${v3}deg` });
      },
      [onScrubEnd]
    ), handleFlipH = q2(() => {
      let parsed = parseFloat(values.scaleX), magnitude = Number.isNaN(parsed) ? 1 : Math.abs(parsed), newX = isFlippedH ? magnitude : -magnitude;
      onChange({ property: "scale", value: `${newX} ${values.scaleY}` });
    }, [isFlippedH, values.scaleX, values.scaleY, onChange]), handleFlipV = q2(() => {
      let parsed = parseFloat(values.scaleY), magnitude = Number.isNaN(parsed) ? 1 : Math.abs(parsed), newY = isFlippedV ? magnitude : -magnitude;
      onChange({ property: "scale", value: `${values.scaleX} ${newY}` });
    }, [isFlippedV, values.scaleX, values.scaleY, onChange]), leftNum = parseFloat(values.left), topNum = parseFloat(values.top), xValue = isStatic || isNaN(leftNum) ? 0 : leftNum, yValue = isStatic || isNaN(topNum) ? 0 : topNum, zValue = parseFloat(values.zIndex) || 0, isSticky = values.position === "sticky", isFixed = values.position === "fixed", xTooltip = isSticky ? "Stick at left" : isFixed ? "Left from viewport" : "Left offset", yTooltip = isSticky ? "Stick at top" : isFixed ? "Top from viewport" : "Top offset";
    return /* @__PURE__ */ u4("div", { class: "cortex-position-section", "data-section-id": "position", children: [
      /* @__PURE__ */ u4("div", { class: "cortex-position-section__group", children: /* @__PURE__ */ u4(
        PositionDropdown,
        {
          value: values.position,
          onChange: handlePositionMode
        }
      ) }),
      /* @__PURE__ */ u4(SelfAlignmentBlock, { onChange }),
      /* @__PURE__ */ u4(
        "div",
        {
          class: `cortex-position-section__xy-row${isStatic ? " cortex-position-section__xy-row--disabled" : ""}${isDimmed(dimmedProperties, "left", "top") ? " cortex-control--dimmed" : ""}`,
          "data-tooltip": isStatic ? STATIC_POSITION_TOOLTIP : void 0,
          children: [
            /* @__PURE__ */ u4(NumericInput, { value: xValue, unit: isStatic ? "auto" : "px", prefix: "X", tooltip: isStatic ? STATIC_POSITION_TOOLTIP : xTooltip, disabled: isStatic, tokenFamily: "spacing", onChange: handleXChange, onScrub: handleXScrub, onScrubEnd: handleXScrubEnd, stale }),
            /* @__PURE__ */ u4(NumericInput, { value: yValue, unit: isStatic ? "auto" : "px", prefix: "Y", tooltip: isStatic ? STATIC_POSITION_TOOLTIP : yTooltip, disabled: isStatic, tokenFamily: "spacing", onChange: handleYChange, onScrub: handleYScrub, onScrubEnd: handleYScrubEnd, stale }),
            /* @__PURE__ */ u4(NumericInput, { value: zValue, prefix: "Z", tooltip: "Z-index", onChange: handleZChange, stale })
          ]
        }
      ),
      /* @__PURE__ */ u4("div", { class: `cortex-position-section__rotate-row${isDimmed(dimmedProperties, "rotate", "scale") ? " cortex-control--dimmed" : ""}`, children: [
        /* @__PURE__ */ u4(
          NumericInput,
          {
            value: rotateNum,
            unit: "deg",
            prefix: /* @__PURE__ */ u4(RotateCw, { size: 12 }),
            tooltip: "Rotation",
            onChange: handleRotateChange,
            onScrub: handleRotateScrub,
            onScrubEnd: handleRotateScrubEnd,
            stale
          }
        ),
        /* @__PURE__ */ u4(
          IconButton,
          {
            icon: /* @__PURE__ */ u4(FlipHorizontal, { size: 14 }),
            ariaLabel: "Flip horizontal",
            tooltip: "Flip horizontal",
            active: isFlippedH,
            onClick: handleFlipH
          }
        ),
        /* @__PURE__ */ u4(
          IconButton,
          {
            icon: /* @__PURE__ */ u4(FlipVertical, { size: 14 }),
            ariaLabel: "Flip vertical",
            tooltip: "Flip vertical",
            active: isFlippedV,
            onClick: handleFlipV
          }
        )
      ] })
    ] });
  }

  // src/browser/components/sections/AppearanceSection.tsx
  function toNumber(raw) {
    let n3 = parseFloat(raw ?? "");
    return Number.isFinite(n3) ? n3 : 0;
  }
  function parseAppearanceValues(cs) {
    let rawOpacity = parseFloat(cs.opacity ?? ""), opacityUnit = Number.isFinite(rawOpacity) ? rawOpacity : 1;
    return {
      opacity: Math.round(opacityUnit * 100),
      visibility: cs.visibility || "visible",
      borderRadius: toNumber(cs.borderRadius),
      borderTopLeftRadius: toNumber(cs.borderTopLeftRadius),
      borderTopRightRadius: toNumber(cs.borderTopRightRadius),
      borderBottomRightRadius: toNumber(cs.borderBottomRightRadius),
      borderBottomLeftRadius: toNumber(cs.borderBottomLeftRadius)
    };
  }
  function AppearanceSection({
    values,
    onChange,
    onScrub,
    onScrubEnd,
    dimmedProperties,
    mixedProperties,
    resetKey
  }) {
    let [perCorner, setPerCorner] = d2(!1), prevResetKeyRef = A2(resetKey);
    y2(() => {
      prevResetKeyRef.current !== resetKey && (prevResetKeyRef.current = resetKey, setPerCorner(!1));
    }, [resetKey]);
    let toCssOpacity = (v3) => String(Math.max(0, Math.min(100, v3)) / 100), handleOpacityChange = q2(
      (v3) => onChange({ property: "opacity", value: toCssOpacity(v3) }),
      [onChange]
    ), handleOpacityScrub = q2(
      (v3) => {
        onScrub && onScrub({ property: "opacity", value: toCssOpacity(v3) });
      },
      [onScrub]
    ), handleOpacityScrubEnd = q2(
      (v3) => {
        onScrubEnd && onScrubEnd({ property: "opacity", value: toCssOpacity(v3) });
      },
      [onScrubEnd]
    ), handleRadiusChange = q2(
      (v3) => onChange({ property: "border-radius", value: `${v3}px` }),
      [onChange]
    ), handleRadiusScrub = q2(
      (v3) => {
        onScrub && onScrub({ property: "border-radius", value: `${v3}px` });
      },
      [onScrub]
    ), handleRadiusScrubEnd = q2(
      (v3) => {
        onScrubEnd && onScrubEnd({ property: "border-radius", value: `${v3}px` });
      },
      [onScrubEnd]
    ), cornerHandlers = (property) => ({
      onChange: (v3) => onChange({ property, value: `${v3}px` }),
      onScrub: onScrub ? (v3) => onScrub({ property, value: `${v3}px` }) : void 0,
      onScrubEnd: onScrubEnd ? (v3) => onScrubEnd({ property, value: `${v3}px` }) : void 0
    }), handleToggleCorners = q2(() => setPerCorner((v3) => !v3), []), handleToggleVisibility = q2(() => {
      onChange({
        property: "visibility",
        value: values.visibility === "hidden" ? "visible" : "hidden"
      });
    }, [onChange, values.visibility]), isHidden = values.visibility === "hidden", opacityDimmed = isDimmed(dimmedProperties, "opacity"), visibilityDimmed = isDimmed(dimmedProperties, "visibility"), anyRadiusDimmed = isDimmed(
      dimmedProperties,
      "border-radius",
      "border-top-left-radius",
      "border-top-right-radius",
      "border-bottom-left-radius",
      "border-bottom-right-radius"
    ), uniformRadiusMixed = values.borderTopLeftRadius !== values.borderTopRightRadius || values.borderTopRightRadius !== values.borderBottomRightRadius || values.borderBottomRightRadius !== values.borderBottomLeftRadius || mixedProperties?.has("border-top-left-radius") === !0 || mixedProperties?.has("border-top-right-radius") === !0 || mixedProperties?.has("border-bottom-left-radius") === !0 || mixedProperties?.has("border-bottom-right-radius") === !0;
    return /* @__PURE__ */ u4("div", { class: "cortex-appearance-section", "data-section-id": "appearance", children: [
      /* @__PURE__ */ u4("div", { class: "cortex-appearance-section__row", children: [
        /* @__PURE__ */ u4("span", { class: `cortex-appearance-section__item${opacityDimmed ? " cortex-control--dimmed" : ""}`, children: /* @__PURE__ */ u4(
          NumericInput,
          {
            value: values.opacity,
            unit: "%",
            prefix: /* @__PURE__ */ u4(Eclipse, { size: 14 }),
            tooltip: "Opacity",
            min: 0,
            mixed: mixedProperties?.has("opacity"),
            onChange: handleOpacityChange,
            onScrub: handleOpacityScrub,
            onScrubEnd: handleOpacityScrubEnd
          }
        ) }),
        !perCorner && /* @__PURE__ */ u4("span", { class: `cortex-appearance-section__item${anyRadiusDimmed ? " cortex-control--dimmed" : ""}`, children: /* @__PURE__ */ u4(
          NumericInput,
          {
            value: values.borderRadius,
            unit: "px",
            prefix: /* @__PURE__ */ u4(Square, { size: 14 }),
            tooltip: "Corner Radius",
            min: 0,
            mixed: uniformRadiusMixed,
            onChange: handleRadiusChange,
            onScrub: handleRadiusScrub,
            onScrubEnd: handleRadiusScrubEnd
          }
        ) }),
        /* @__PURE__ */ u4(
          "button",
          {
            class: [
              "cortex-appearance-section__corner-toggle",
              perCorner && "cortex-appearance-section__corner-toggle--active",
              anyRadiusDimmed && "cortex-control--dimmed"
            ].filter(Boolean).join(" "),
            type: "button",
            "aria-pressed": perCorner ? "true" : "false",
            "aria-label": perCorner ? "Uniform radius" : "Per-corner radius",
            "data-tooltip": perCorner ? "Uniform radius" : "Per-corner radius",
            onClick: handleToggleCorners,
            children: /* @__PURE__ */ u4(Maximize, { size: 14 })
          }
        ),
        /* @__PURE__ */ u4(
          "button",
          {
            type: "button",
            class: [
              "cortex-appearance-section__visibility-toggle",
              isHidden && "cortex-appearance-section__visibility-toggle--hidden",
              visibilityDimmed && "cortex-control--dimmed"
            ].filter(Boolean).join(" "),
            "aria-pressed": isHidden ? "true" : "false",
            "aria-label": isHidden ? "Show element" : "Hide element",
            "data-tooltip": isHidden ? "Show element" : "Hide element",
            onClick: handleToggleVisibility,
            children: isHidden ? /* @__PURE__ */ u4(EyeClosed, { size: 16 }) : /* @__PURE__ */ u4(Eye, { size: 16 })
          }
        )
      ] }),
      perCorner && /* @__PURE__ */ u4("div", { class: "cortex-appearance-section__corners", children: [
        /* @__PURE__ */ u4(
          NumericInput,
          {
            value: values.borderTopLeftRadius,
            unit: "px",
            prefix: /* @__PURE__ */ u4(CornerTopLeft, { size: 14 }),
            tooltip: "Top Left Radius",
            min: 0,
            mixed: mixedProperties?.has("border-top-left-radius"),
            ...cornerHandlers("border-top-left-radius")
          }
        ),
        /* @__PURE__ */ u4(
          NumericInput,
          {
            value: values.borderTopRightRadius,
            unit: "px",
            prefix: /* @__PURE__ */ u4(CornerTopRight, { size: 14 }),
            tooltip: "Top Right Radius",
            min: 0,
            mixed: mixedProperties?.has("border-top-right-radius"),
            ...cornerHandlers("border-top-right-radius")
          }
        ),
        /* @__PURE__ */ u4(
          NumericInput,
          {
            value: values.borderBottomLeftRadius,
            unit: "px",
            prefix: /* @__PURE__ */ u4(CornerBottomLeft, { size: 14 }),
            tooltip: "Bottom Left Radius",
            min: 0,
            mixed: mixedProperties?.has("border-bottom-left-radius"),
            ...cornerHandlers("border-bottom-left-radius")
          }
        ),
        /* @__PURE__ */ u4(
          NumericInput,
          {
            value: values.borderBottomRightRadius,
            unit: "px",
            prefix: /* @__PURE__ */ u4(CornerBottomRight, { size: 14 }),
            tooltip: "Bottom Right Radius",
            min: 0,
            mixed: mixedProperties?.has("border-bottom-right-radius"),
            ...cornerHandlers("border-bottom-right-radius")
          }
        )
      ] })
    ] });
  }

  // src/browser/shared-class-detector.ts
  function parseCssMappingBrowser(raw) {
    let extMatch = raw.match(/\.module\.(css|scss|less|sass)/);
    if (!extMatch) return null;
    let delimIdx = raw.indexOf(":", extMatch.index + extMatch[0].length);
    if (delimIdx === -1) return null;
    let cssPath = raw.slice(0, delimIdx), selectors = raw.slice(delimIdx + 1).split(",").map((s3) => s3.trim()).filter(Boolean);
    return selectors.length === 0 ? null : { cssFilePath: cssPath, selectors };
  }
  function detectSharedClasses(element) {
    let raw = element.getAttribute("data-cortex-css");
    if (!raw) return null;
    let parsed = parseCssMappingBrowser(raw);
    if (!parsed) return null;
    let allAnnotated = document.querySelectorAll("[data-cortex-css]"), best = null;
    for (let selector of parsed.selectors) {
      let matches = [];
      for (let candidate of allAnnotated) {
        let candidateRaw = candidate.getAttribute("data-cortex-css");
        if (!candidateRaw) continue;
        let candidateParsed = parseCssMappingBrowser(candidateRaw);
        candidateParsed && candidateParsed.cssFilePath === parsed.cssFilePath && candidateParsed.selectors.includes(selector) && matches.push(candidate);
      }
      matches.length > 1 && (best === null || matches.length > best.count) && (best = {
        selector,
        cssFilePath: parsed.cssFilePath,
        elements: matches,
        count: matches.length
      });
    }
    return best;
  }

  // src/browser/selection-metadata.ts
  var isHTMLElement2 = (el) => el instanceof HTMLElement;
  function captureSelectionMetadata(el) {
    let source = el.getAttribute("data-cortex-source"), contentHash = (el.textContent ?? "").trim(), inShadowRoot = el.getRootNode() instanceof ShadowRoot;
    if (!source)
      return { source: null, index: -1, contentHash, inShadowRoot };
    let index = findSourceMatches(source, inShadowRoot).indexOf(el);
    return { source, index, contentHash, inShadowRoot };
  }
  function findSourceMatches(source, inShadowRoot) {
    try {
      let selector = `[data-cortex-source="${CSS.escape(source)}"]`, flat = Array.from(document.querySelectorAll(selector)).filter(isHTMLElement2);
      return flat.length === 0 && inShadowRoot ? deepQuerySelectorAll(selector) : flat;
    } catch (err) {
      return console.warn("[cortex] findSourceMatches selector error", { source, err }), [];
    }
  }
  function deepQuerySelectorAll(selector, root = document) {
    let matches = [];
    for (let el of root.querySelectorAll(selector))
      isHTMLElement2(el) && matches.push(el);
    for (let el of root.querySelectorAll("*"))
      el.shadowRoot && matches.push(...deepQuerySelectorAll(selector, el.shadowRoot));
    return matches;
  }
  function deepQueryAllElements(selector, root = document) {
    let matches = [];
    for (let el of root.querySelectorAll(selector))
      matches.push(el);
    for (let el of root.querySelectorAll("*"))
      el.shadowRoot && matches.push(...deepQueryAllElements(selector, el.shadowRoot));
    return matches;
  }
  function reResolveSelection(meta) {
    if (!meta.source) return null;
    let matches = findSourceMatches(meta.source, meta.inShadowRoot);
    if (matches.length === 0) return null;
    let atIndex = meta.index >= 0 ? matches[meta.index] ?? null : null;
    if (!atIndex) return null;
    if (atIndex.textContent?.trim() === meta.contentHash) return atIndex;
    if (meta.contentHash !== "") {
      let candidates = [];
      for (let i4 = 0; i4 < matches.length; i4++)
        matches[i4]?.textContent?.trim() === meta.contentHash && candidates.push(i4);
      if (candidates.length > 0) {
        let nearest = candidates.reduce(
          (best, idx) => Math.abs(idx - meta.index) < Math.abs(best - meta.index) ? idx : best
        );
        return matches[nearest] ?? null;
      }
    }
    return atIndex;
  }
  function shouldRefreshOnHMR(files, element) {
    return element ? !files || files.length === 0 ? !0 : hmrFilesAffectElement(files, element) : !1;
  }
  function stripLineCol(src) {
    return src.replace(/:\d+:\d+$/, "");
  }
  var CSS_EXT = /\.(css|scss|sass|less|styl|stylus)$/i, VIRTUAL_MODULE = /^(\0|@id\/|@fs\/|@vite\/|virtual:)/, DEFAULT_ANCESTOR_DEPTH = 20;
  function hmrFilesAffectElement(files, element, maxDepth = DEFAULT_ANCESTOR_DEPTH) {
    let normalized = files.map((p3) => p3.replace(/^\/+/, "").split("?")[0] ?? "");
    if (normalized.some((f5) => CSS_EXT.test(f5) || VIRTUAL_MODULE.test(f5))) return !0;
    let normalizedFiles = new Set(normalized), current = element, depth = 0;
    for (; current && depth < maxDepth; ) {
      let src = current.getAttribute("data-cortex-source");
      if (src) {
        let file = stripLineCol(src);
        if (file && normalizedFiles.has(file)) return !0;
      }
      let parentEl = current.parentElement;
      if (parentEl)
        current = parentEl;
      else {
        let root = current.getRootNode();
        current = root instanceof ShadowRoot ? root.host : null;
      }
      depth++;
    }
    return !1;
  }

  // src/browser/shared-source-detector.ts
  function detectSharedSource(el) {
    let source = el.getAttribute("data-cortex-source");
    if (!source) return null;
    let escaped;
    try {
      escaped = typeof CSS < "u" && CSS.escape ? CSS.escape(source) : source.replace(/(["\\])/g, "\\$1");
    } catch {
      escaped = source.replace(/(["\\])/g, "\\$1");
    }
    let selector = `[data-cortex-source="${escaped}"]`, flat;
    try {
      flat = deepQueryAllElements(selector);
    } catch {
      return null;
    }
    return flat.length <= 1 ? null : {
      source,
      elements: flat,
      count: flat.length
    };
  }

  // src/browser/components/EditErrorCard.tsx
  function isDebugEnabled() {
    return typeof window > "u" ? !1 : window.__CORTEX_DEBUG_OVERRIDES__ === !0;
  }
  function EditErrorCard({ errors, elementSource, agentConnected, onDismiss, onAskAI }) {
    let [askingAI, setAskingAI] = d2(/* @__PURE__ */ new Set()), askingAITimeouts = A2(/* @__PURE__ */ new Map()), markAsking = q2((key) => {
      setAskingAI((prev) => new Set(prev).add(key));
      let existing = askingAITimeouts.current.get(key);
      existing && clearTimeout(existing), askingAITimeouts.current.set(key, setTimeout(() => {
        setAskingAI((prev) => {
          let next = new Set(prev);
          return next.delete(key), next;
        }), askingAITimeouts.current.delete(key);
      }, 15e3));
    }, []), elementErrors = T2(
      () => Array.from(errors.entries()).filter(([, err]) => err.source === elementSource),
      [errors, elementSource]
    );
    return elementErrors.length === 0 ? null : /* @__PURE__ */ u4("div", { class: "cortex-error-cards", children: elementErrors.map(([key, err]) => /* @__PURE__ */ u4("div", { class: "cortex-error-card", children: [
      /* @__PURE__ */ u4("div", { class: "cortex-error-card__header", children: [
        /* @__PURE__ */ u4(TriangleAlert, { size: 12, class: "cortex-error-card__icon" }),
        /* @__PURE__ */ u4("span", { class: "cortex-error-card__property", children: [
          err.property,
          " edit failed"
        ] })
      ] }),
      /* @__PURE__ */ u4("div", { class: "cortex-error-card__reason", children: err.reason }),
      isDebugEnabled() && err.diagnostics && /* @__PURE__ */ u4(DebugDisclosure, { diagnostics: err.diagnostics }),
      /* @__PURE__ */ u4("div", { class: "cortex-error-card__actions", children: [
        /* @__PURE__ */ u4(
          "button",
          {
            type: "button",
            class: "cortex-error-card__btn",
            "data-action": "dismiss",
            onClick: () => onDismiss(key),
            children: "Dismiss"
          }
        ),
        /* @__PURE__ */ u4(
          "button",
          {
            type: "button",
            class: "cortex-error-card__btn cortex-error-card__btn--primary",
            "data-action": "ask-ai",
            disabled: !agentConnected || askingAI.has(key),
            title: agentConnected ? void 0 : "Connect Claude Code to auto-fix",
            onClick: () => {
              markAsking(key), onAskAI(err);
            },
            children: askingAI.has(key) ? "Requesting fix..." : "Ask AI"
          }
        )
      ] })
    ] }, key)) });
  }
  function DebugDisclosure({ diagnostics }) {
    let { actualReadFrom, kindUsed, priorValues, retryDurationMs, errorMessage } = diagnostics;
    return /* @__PURE__ */ u4("details", { class: "cortex-error-card__debug", children: [
      /* @__PURE__ */ u4("summary", { class: "cortex-error-card__debug-summary", children: "Debug" }),
      /* @__PURE__ */ u4("dl", { class: "cortex-error-card__debug-grid", children: [
        /* @__PURE__ */ u4("dt", { children: "actual read from" }),
        /* @__PURE__ */ u4("dd", { children: actualReadFrom }),
        /* @__PURE__ */ u4("dt", { children: "kind" }),
        /* @__PURE__ */ u4("dd", { children: kindUsed ?? "(none)" }),
        /* @__PURE__ */ u4("dt", { children: "prior values" }),
        /* @__PURE__ */ u4("dd", { children: priorValues.length === 0 ? "(none)" : priorValues.join(" \u2192 ") }),
        /* @__PURE__ */ u4("dt", { children: "retry duration" }),
        /* @__PURE__ */ u4("dd", { children: retryDurationMs === void 0 ? "(n/a)" : `${retryDurationMs.toFixed(0)}ms` }),
        errorMessage !== void 0 && /* @__PURE__ */ u4(k, { children: [
          /* @__PURE__ */ u4("dt", { children: "read error" }),
          /* @__PURE__ */ u4("dd", { children: errorMessage })
        ] })
      ] })
    ] });
  }

  // src/browser/components/SectionGroup.tsx
  function SectionGroup({ label, groupId, children, headerAction }) {
    let titleId = `cortex-section-title-${groupId}`;
    return /* @__PURE__ */ u4("div", { class: "cortex-section-group", "data-group": groupId, role: "group", "aria-labelledby": titleId, children: [
      /* @__PURE__ */ u4("div", { class: "cortex-section-group__header", children: [
        /* @__PURE__ */ u4("span", { id: titleId, class: "cortex-section-group__title", children: label }),
        headerAction && /* @__PURE__ */ u4("div", { class: "cortex-section-group__header-action", children: headerAction })
      ] }),
      /* @__PURE__ */ u4("div", { class: "cortex-section-group__content", children })
    ] });
  }

  // src/browser/components/sections/BackgroundSection.tsx
  function BackgroundSection({
    backgroundColor,
    backgroundToken,
    onChange,
    onScrub,
    onScrubEnd,
    onRemove,
    swatches,
    colorChips,
    dimmedProperties,
    mixedProperties
  }) {
    let [pickerOpen, setPickerOpen] = d2(!1), tokenBodyRef = A2(null), tokenButtonRef = A2(null), parsed = T2(() => parseColor(backgroundColor), [backgroundColor]), backgroundTokenName = backgroundToken?.startsWith("bg-") ? backgroundToken.slice(3) : null, backgroundRemoveClass = backgroundToken?.startsWith("bg-") ? backgroundToken : void 0, handleUnlink = q2(() => {
      backgroundRemoveClass !== void 0 && onChange({
        kind: "unlink-background-token",
        removeClass: backgroundRemoveClass,
        inline: [{ property: "background-color", value: backgroundColor }]
      });
    }, [onChange, backgroundColor, backgroundRemoveClass]), handleOpenPicker = q2(() => {
      setPickerOpen((open) => !open);
    }, []), handleClosePicker = q2(() => {
      setPickerOpen(!1);
    }, []), handlePickToken = q2(
      (chip) => {
        onChange({
          kind: "link-background-token",
          chip,
          removeClass: backgroundRemoveClass
        }), setPickerOpen(!1);
      },
      [onChange, backgroundRemoveClass]
    ), handleColorChange = q2(
      (color) => onChange({ property: "background-color", value: color }),
      [onChange]
    ), handleColorScrub = q2(
      (color) => onScrub?.({ property: "background-color", value: color }),
      [onScrub]
    ), handleColorScrubEnd = q2(
      (color) => onScrubEnd?.({ property: "background-color", value: color }),
      [onScrubEnd]
    ), handleAlphaChange = q2(
      (alpha) => {
        onChange({ property: "background-color", value: formatColor(parsed.hex, alpha) });
      },
      [onChange, parsed.hex]
    ), removeButton = onRemove ? /* @__PURE__ */ u4(
      IconButton,
      {
        icon: /* @__PURE__ */ u4(Minus, { size: 14 }),
        ariaLabel: "Remove background",
        tooltip: "Remove background",
        onClick: onRemove
      }
    ) : null, tokenButton = /* @__PURE__ */ u4(
      "button",
      {
        ref: tokenButtonRef,
        type: "button",
        class: "cortex-icon-button",
        "aria-label": "Link to color chip",
        "data-tooltip": "Link to color chip",
        onClick: handleOpenPicker,
        children: /* @__PURE__ */ u4(SwatchBook, { size: 14 })
      }
    ), picker = pickerOpen ? /* @__PURE__ */ u4(
      ColorChipPicker,
      {
        chips: colorChips ?? [],
        currentName: backgroundTokenName,
        onPick: handlePickToken,
        onDismiss: handleClosePicker,
        triggerRefs: [tokenBodyRef, tokenButtonRef]
      }
    ) : null;
    return /* @__PURE__ */ u4("div", { class: `cortex-background-section${isDimmed(dimmedProperties, "background-color") ? " cortex-control--dimmed" : ""}`, "data-section-id": "background", children: backgroundToken !== null ? /* @__PURE__ */ u4("div", { class: "cortex-background-section__row", children: [
      /* @__PURE__ */ u4(
        TokenChip,
        {
          tokenName: backgroundToken,
          swatch: isColorLike(backgroundColor) ? { kind: "color", value: backgroundColor } : { kind: "pattern" },
          onBodyClick: handleOpenPicker,
          onUnlink: handleUnlink,
          ariaLabel: `Swap color chip (currently ${backgroundToken})`,
          bodyRef: tokenBodyRef
        }
      ),
      removeButton,
      picker
    ] }) : /* @__PURE__ */ u4("div", { class: "cortex-background-section__row cortex-background-section__row--raw", children: [
      /* @__PURE__ */ u4(
        ColorInput,
        {
          value: backgroundColor,
          onChange: handleColorChange,
          onScrub: onScrub ? handleColorScrub : void 0,
          onScrubEnd: onScrubEnd ? handleColorScrubEnd : void 0,
          alpha: parsed.alpha,
          onAlphaChange: handleAlphaChange,
          swatches,
          mixed: mixedProperties?.has("background-color"),
          trailing: /* @__PURE__ */ u4(k, { children: [
            tokenButton,
            removeButton
          ] })
        }
      ),
      picker
    ] }) });
  }

  // src/browser/components/sections/spacing-utils.ts
  var ALL_DIMMING_PROPERTIES = [
    "display",
    "visibility",
    "flex-direction",
    "flex-wrap",
    "justify-content",
    "align-items",
    "align-content",
    "justify-items",
    "justify-self",
    "align-self",
    "width",
    "height",
    "padding-top",
    "padding-right",
    "padding-bottom",
    "padding-left",
    "margin-top",
    "margin-right",
    "margin-bottom",
    "margin-left",
    "row-gap",
    "column-gap",
    "grid-template-columns",
    "grid-template-rows",
    "grid-auto-flow",
    "font-family",
    "font-size",
    "font-weight",
    "line-height",
    "letter-spacing",
    "color",
    "text-align",
    "background-color",
    "background-image",
    "border-width",
    "border-style",
    "border-color",
    "border-radius",
    "border-top-width",
    "border-right-width",
    "border-bottom-width",
    "border-left-width",
    "border-top-left-radius",
    "border-top-right-radius",
    "border-bottom-left-radius",
    "border-bottom-right-radius",
    "box-shadow",
    "opacity",
    "overflow",
    "box-sizing",
    "cursor",
    "filter",
    "backdrop-filter",
    "position",
    "left",
    "top",
    "z-index",
    "rotate",
    "scale",
    "min-width",
    "max-width",
    "min-height",
    "max-height"
  ];
  function parseSpacingValues(cs) {
    return {
      padding: {
        top: parseFloat(cs.paddingTop) || 0,
        right: parseFloat(cs.paddingRight) || 0,
        bottom: parseFloat(cs.paddingBottom) || 0,
        left: parseFloat(cs.paddingLeft) || 0
      },
      margin: {
        top: parseFloat(cs.marginTop) || 0,
        right: parseFloat(cs.marginRight) || 0,
        bottom: parseFloat(cs.marginBottom) || 0,
        left: parseFloat(cs.marginLeft) || 0
      },
      gap: {
        row: parseFloat(cs.rowGap) || 0,
        column: parseFloat(cs.columnGap) || 0
      },
      boxSizing: cs.boxSizing || "content-box"
    };
  }

  // src/browser/components/panel-style-snapshot.ts
  function computePanelStyleSnapshot(input) {
    let { element, activePseudo, activeState, sharedInfo, editScope, overrideManager, defaultStyles } = input;
    if (!element)
      return {
        computedStyles: {
          spacing: parseSpacingValues({}),
          layout: parseLayoutValues({}),
          typography: parseTypographyValues({}),
          fill: parseFillValues({}),
          border: parseBorderValues({}),
          effects: parseEffectsValues({}),
          position: parsePositionValues({}),
          appearance: parseAppearanceValues({})
        },
        dimmedProperties: void 0,
        mixedProperties: void 0
      };
    let pseudo = activePseudo !== "element" ? activePseudo : void 0, cs = getComputedStyle(element, pseudo), source = element.getAttribute("data-cortex-source") ?? "", layout = parseLayoutValues(cs), widthOverride = overrideManager.get(source, "width", pseudo), heightOverride = overrideManager.get(source, "height", pseudo);
    widthOverride !== void 0 && (layout.width = widthOverride), heightOverride !== void 0 && (layout.height = heightOverride);
    let parsed = {
      spacing: parseSpacingValues(cs),
      layout,
      typography: parseTypographyValues(cs),
      fill: parseFillValues(cs),
      border: parseBorderValues(cs),
      effects: parseEffectsValues(cs),
      position: parsePositionValues(cs),
      appearance: parseAppearanceValues(cs)
    };
    for (let [property, field] of [
      ["border-width", "borderWidth"],
      ["border-top-width", "borderTopWidth"],
      ["border-right-width", "borderRightWidth"],
      ["border-bottom-width", "borderBottomWidth"],
      ["border-left-width", "borderLeftWidth"]
    ]) {
      let raw = overrideManager.get(source, property, pseudo);
      raw !== void 0 && (parsed.border[field] = parseFloat(raw) || 0);
    }
    let dimmed;
    if (activeState !== "default" && defaultStyles) {
      dimmed = /* @__PURE__ */ new Set();
      let defaultCs = pseudo ? getComputedStyle(element) : cs;
      if (typeof defaultCs.getPropertyValue == "function")
        for (let prop of ALL_DIMMING_PROPERTIES)
          defaultCs.getPropertyValue(prop) !== defaultStyles[prop] && dimmed.add(prop);
    }
    let mixed;
    if (sharedInfo && editScope === "all") {
      mixed = /* @__PURE__ */ new Set();
      for (let sibling of sharedInfo.elements) {
        if (sibling === element) continue;
        let siblingCs = getComputedStyle(sibling, pseudo);
        for (let prop of ALL_DIMMING_PROPERTIES)
          mixed.has(prop) || cs.getPropertyValue(prop) !== siblingCs.getPropertyValue(prop) && mixed.add(prop);
      }
      mixed.size === 0 && (mixed = void 0);
    }
    return { computedStyles: parsed, dimmedProperties: dimmed, mixedProperties: mixed };
  }

  // src/browser/hooks/useEditStagingBuffer.ts
  var MAX_ENTRIES = 500, DEBOUNCE_MS = 150, STORAGE_KEY = "staging-buffer", encoder2 = new TextEncoder(), SOURCE_SHAPE = /^[^"]+:\d+:\d+$/;
  function isPendingEdit(v3) {
    if (typeof v3 != "object" || v3 === null) return !1;
    let o4 = v3;
    if (typeof o4.intentId != "string" || typeof o4.source != "string" || typeof o4.property != "string" || typeof o4.value != "string" || typeof o4.previousValue != "string" || typeof o4.timestamp != "number")
      return !1;
    let hasPreviewSource = isPreviewSource(o4.source);
    if (encoder2.encode(o4.source).length > 1024 || !SOURCE_SHAPE.test(o4.source) && !hasPreviewSource || o4.pseudo !== void 0 && o4.pseudo !== "::before" && o4.pseudo !== "::after" || o4.scope !== void 0 && o4.scope !== "instance" && o4.scope !== "all" || o4.applyMode !== void 0 && o4.applyMode !== "direct" && o4.applyMode !== "agent-resolve" || (o4.applyMode === "agent-resolve" || hasPreviewSource) && o4.sourceResolutionHint === void 0) return !1;
    if (o4.sourceResolutionHint !== void 0) {
      if (typeof o4.sourceResolutionHint != "object" || o4.sourceResolutionHint === null) return !1;
      let hint = o4.sourceResolutionHint;
      if (!isSourceHintField(hint.tagName, { required: !0 }) || !isSourceHintField(hint.textPreview) || !isSourceHintField(hint.domSelector, { required: !0 }) || hint.className !== void 0 && !isSourceHintField(hint.className) || hint.id !== void 0 && !isSourceHintField(hint.id)) return !1;
    }
    return !(o4.instanceSources !== void 0 && (!Array.isArray(o4.instanceSources) || !o4.instanceSources.every((s3) => typeof s3 == "string")));
  }
  function isSourceHintField(value, options) {
    return typeof value != "string" || options?.required && value.length === 0 ? !1 : encoder2.encode(value).length <= 512;
  }
  function isUnknownArray(v3) {
    return Array.isArray(v3);
  }
  function compositeKey(edit) {
    return `${edit.source}\0${edit.property}\0${edit.pseudo ?? ""}`;
  }
  function defaultReadSourceValue(el, property, pseudo) {
    let inlineValue = pseudo ? "" : el.style?.getPropertyValue(property).trim() ?? "";
    return inlineValue !== "" ? inlineValue : getComputedStyle(el, pseudo ?? void 0).getPropertyValue(property).trim();
  }
  function useEditStagingBuffer(emitter) {
    let bufferRef = A2(/* @__PURE__ */ new Map()), debounceTimerRef = A2(null), initRef = A2(!1), emitterRef = A2(emitter);
    emitterRef.current = emitter;
    let [version, bumpVersion] = d2(0), bumpRef = A2(() => bumpVersion((v3) => v3 + 1));
    if (!initRef.current) {
      initRef.current = !0;
      let stored = cortexStorage.get(STORAGE_KEY, [], isUnknownArray), dropped = 0;
      for (let entry of stored)
        isPendingEdit(entry) ? bufferRef.current.set(compositeKey(entry), entry) : dropped++;
      dropped > 0 && console.warn(
        `[cortex] Staging buffer rehydrated with ${bufferRef.current.size} valid entries; ${dropped} dropped (schema mismatch)`
      ), bufferRef.current.size > 0 && emitter && emitter.syncFullState(Array.from(bufferRef.current.values()));
    }
    let persistFailedRef = A2(!1), persistNow = q2(() => {
      let ok = cortexStorage.set(STORAGE_KEY, Array.from(bufferRef.current.values()));
      !ok && !persistFailedRef.current ? (persistFailedRef.current = !0, console.warn(
        "[cortex] Staging buffer persistence failed (localStorage quota or private mode); pending edits live only in memory and will be lost on reload."
      )) : ok && persistFailedRef.current && (persistFailedRef.current = !1);
    }, []), schedulePersist = q2(() => {
      debounceTimerRef.current !== null && clearTimeout(debounceTimerRef.current), debounceTimerRef.current = setTimeout(() => {
        debounceTimerRef.current = null, persistNow();
      }, DEBOUNCE_MS);
    }, [persistNow]), flush = q2(() => {
      debounceTimerRef.current !== null && (clearTimeout(debounceTimerRef.current), debounceTimerRef.current = null, persistNow());
    }, [persistNow]);
    _2(() => () => {
      flush();
    }, [flush]);
    let append = q2((edit) => {
      let key = compositeKey(edit);
      bufferRef.current.has(key) && bufferRef.current.delete(key), bufferRef.current.set(key, edit);
      let evictedIntentId = null;
      if (bufferRef.current.size > MAX_ENTRIES) {
        let oldest = bufferRef.current.entries().next();
        if (!oldest.done) {
          let [firstKey, evicted] = oldest.value;
          bufferRef.current.delete(firstKey), evictedIntentId = evicted.intentId, console.warn(
            "[cortex] Staging buffer evicted oldest intent (max 500):",
            evicted.source,
            evicted.property
          );
        }
      }
      emitterRef.current?.syncAdd(edit), evictedIntentId !== null && emitterRef.current?.syncRemove([evictedIntentId]), bumpRef.current(), schedulePersist();
    }, [schedulePersist]), remove = q2((intentIds) => {
      let idSet = new Set(intentIds), toDeleteKeys = [];
      for (let [key, edit] of bufferRef.current.entries())
        idSet.has(edit.intentId) && toDeleteKeys.push(key);
      for (let key of toDeleteKeys)
        bufferRef.current.delete(key);
      emitterRef.current?.syncRemove(intentIds), toDeleteKeys.length > 0 && bumpRef.current(), schedulePersist();
    }, [schedulePersist]), list = q2(() => Array.from(bufferRef.current.values()), []), clear2 = q2(() => {
      bufferRef.current.clear(), debounceTimerRef.current !== null && (clearTimeout(debounceTimerRef.current), debounceTimerRef.current = null), emitterRef.current?.syncClear(), bumpRef.current(), persistNow();
    }, [persistNow]), size2 = q2(() => bufferRef.current.size, []), reconcile = q2((changedFiles, readSourceValue = defaultReadSourceValue) => {
      if (changedFiles.length === 0) return { divergent: [] };
      let changedSet = new Set(changedFiles), divergent = [], elBySource = null;
      for (let edit of bufferRef.current.values()) {
        if (!changedSet.has(stripLineCol(edit.source))) continue;
        if (elBySource === null) {
          elBySource = /* @__PURE__ */ new Map();
          for (let el2 of deepQuerySelectorAll("[data-cortex-source]")) {
            let s3 = el2.getAttribute("data-cortex-source");
            s3 !== null && !elBySource.has(s3) && elBySource.set(s3, el2);
          }
        }
        let el = elBySource.get(edit.source);
        if (!el) {
          divergent.push(edit);
          continue;
        }
        let pseudo = edit.pseudo ?? null;
        readSourceValue(el, edit.property, pseudo).trim() !== edit.previousValue.trim() && divergent.push(edit);
      }
      return { divergent };
    }, []), handleRef = A2({
      append,
      remove,
      list,
      clear: clear2,
      size: size2,
      reconcile
    });
    return T2(() => ({ ...handleRef.current, version }), [version]);
  }
  function createPanelSyncEmitter(channel) {
    return {
      syncAdd: (edit) => channel.send({ type: "staged-edit-add", edit, token: "" }),
      syncRemove: (intentIds) => channel.send({ type: "staged-edit-remove", intentIds: [...intentIds], token: "" }),
      syncClear: () => channel.send({ type: "staged-edit-clear", token: "" }),
      syncFullState: (edits) => channel.send({ type: "staged-edits-sync", edits: [...edits], token: "" })
    };
  }

  // src/browser/components/StagingDriftBanner.tsx
  function StagingDriftBanner({
    intentDriftCount,
    staleOverrideCount,
    onIntentRefresh,
    onStaleRefresh,
    onDismiss
  }) {
    let [dismissed, setDismissed] = d2(!1), prevIntentRef = A2(intentDriftCount), prevStaleRef = A2(staleOverrideCount);
    _2(() => {
      (intentDriftCount > prevIntentRef.current || staleOverrideCount > prevStaleRef.current) && setDismissed(!1), prevIntentRef.current = intentDriftCount, prevStaleRef.current = staleOverrideCount;
    }, [intentDriftCount, staleOverrideCount]);
    let hasIntent = intentDriftCount > 0, hasStale = staleOverrideCount > 0;
    return !hasIntent && !hasStale || dismissed ? null : /* @__PURE__ */ u4(
      "div",
      {
        class: "cortex-drift-banner",
        role: "status",
        "aria-live": "polite",
        children: [
          /* @__PURE__ */ u4("div", { class: "cortex-drift-banner__body", children: [
            hasIntent && /* @__PURE__ */ u4("div", { class: "cortex-drift-banner__row", "data-row": "intent", "data-count": intentDriftCount, children: [
              /* @__PURE__ */ u4("div", { class: "cortex-drift-banner__copy", children: [
                /* @__PURE__ */ u4("span", { class: "cortex-drift-banner__title", children: [
                  intentDriftCount,
                  " staged edit(s) may be affected by external changes"
                ] }),
                /* @__PURE__ */ u4("span", { class: "cortex-drift-banner__desc", children: "Source code in some files has changed since you staged these edits. Review what's different." })
              ] }),
              /* @__PURE__ */ u4(
                "button",
                {
                  type: "button",
                  class: "cortex-drift-banner__btn",
                  "data-action": "intent-refresh",
                  "aria-label": "Refresh staged edits",
                  onClick: onIntentRefresh,
                  children: "Refresh"
                }
              )
            ] }),
            hasStale && /* @__PURE__ */ u4(
              "div",
              {
                class: `cortex-drift-banner__row${hasIntent ? " cortex-drift-banner__row--bordered" : ""}`,
                "data-row": "stale",
                "data-count": staleOverrideCount,
                children: [
                  /* @__PURE__ */ u4("div", { class: "cortex-drift-banner__copy", children: [
                    /* @__PURE__ */ u4("span", { class: "cortex-drift-banner__title", children: [
                      staleOverrideCount,
                      " edit(s) saved but HMR didn't apply"
                    ] }),
                    /* @__PURE__ */ u4("span", { class: "cortex-drift-banner__desc", children: "Try refreshing the page to see the actual file state." })
                  ] }),
                  /* @__PURE__ */ u4(
                    "button",
                    {
                      type: "button",
                      class: "cortex-drift-banner__btn",
                      "data-action": "stale-refresh",
                      "aria-label": "Refresh page to see file state",
                      onClick: onStaleRefresh,
                      children: "Refresh"
                    }
                  )
                ]
              }
            )
          ] }),
          /* @__PURE__ */ u4(
            "button",
            {
              type: "button",
              class: "cortex-drift-banner__dismiss",
              "data-action": "dismiss",
              "aria-label": "Dismiss",
              onClick: () => {
                setDismissed(!0), onDismiss();
              },
              children: /* @__PURE__ */ u4(X, { size: 14 })
            }
          )
        ]
      }
    );
  }

  // src/browser/components/Panel.tsx
  function connectionStatusText(status) {
    switch (status.status) {
      case "reconnecting":
        return `Reconnecting\u2026 (${status.retryCount}/${status.maxRetries})`;
      case "disconnected":
        return "Disconnected \u2014 edits won\u2019t save to files";
      case "reconnected":
        return "Reconnected";
      case "connected":
        return "";
      default:
        return status;
    }
  }
  function ConnectionStatusFooter({ status }) {
    return !status || status.status === "connected" ? /* @__PURE__ */ u4("div", { class: "cortex-connection-status cortex-connection-status--hidden", role: "status", "aria-live": "polite", "aria-atomic": "true" }) : /* @__PURE__ */ u4(
      "div",
      {
        class: `cortex-connection-status cortex-connection-status--${status.status}`,
        role: "status",
        "aria-live": "polite",
        "aria-atomic": "true",
        children: [
          /* @__PURE__ */ u4("span", { class: "cortex-connection-status__dot", "aria-hidden": "true" }),
          /* @__PURE__ */ u4("span", { class: "cortex-connection-status__text", children: connectionStatusText(status) })
        ]
      }
    );
  }
  var HIGHLIGHT_ATTR = "data-cortex-blast-radius";
  function pendingEditTargetFields(target) {
    return target.applyMode === "direct" ? {} : {
      applyMode: target.applyMode,
      sourceResolutionHint: target.sourceResolutionHint
    };
  }
  function editSourcesForElements(elements) {
    return elements.map((el) => getElementEditTarget(el).source);
  }
  function ensureBlastRadiusStyle() {
    if (document.head.querySelector("[data-cortex-blast-radius-style]")) return;
    let style = document.createElement("style");
    style.setAttribute("data-cortex-blast-radius-style", ""), style.textContent = `[${HIGHLIGHT_ATTR}] { outline: 2px dashed #f97316 !important; outline-offset: 2px !important; }`, document.head.appendChild(style);
  }
  var highlightFrame = 0, clearFrame = 0;
  function highlightSharedElements(info, selected) {
    ensureBlastRadiusStyle(), cancelAnimationFrame(clearFrame), cancelAnimationFrame(highlightFrame), highlightFrame = requestAnimationFrame(() => {
      for (let el of info.elements)
        el !== selected && el.isConnected && el.setAttribute(HIGHLIGHT_ATTR, "");
    });
  }
  function clearHighlights() {
    cancelAnimationFrame(highlightFrame), cancelAnimationFrame(clearFrame), clearFrame = requestAnimationFrame(() => {
      for (let el of deepQueryAllElements(`[${HIGHLIGHT_ATTR}]`))
        el.removeAttribute(HIGHLIGHT_ATTR);
    });
  }
  function removeBlastRadiusStyle() {
    document.head.querySelector("[data-cortex-blast-radius-style]")?.remove();
  }
  var TYPOGRAPHY_ELEMENTS = /* @__PURE__ */ new Set(["INPUT", "TEXTAREA", "SELECT"]), MULTI_SELECT_WATCHED_PROPERTIES = [
    "color",
    "background-color",
    "font-family",
    "font-size",
    "font-weight",
    "line-height",
    "letter-spacing",
    "padding",
    "margin",
    "border-radius",
    "box-shadow",
    "opacity",
    "display",
    "flex-direction",
    "gap"
  ];
  function hasTypographyContent(element) {
    return TYPOGRAPHY_ELEMENTS.has(element.tagName) ? !0 : (element.textContent ?? "").trim() !== "";
  }
  function Panel({
    selectedElements,
    overrideManager,
    onClose,
    onSelectElement,
    swatches,
    textComponents,
    colorChips,
    spacingTokens,
    activeState = "default",
    hasBefore = !1,
    hasAfter = !1,
    hoverEnabled = !0,
    onToggleHover,
    position,
    isSnapping,
    panelPointerDown,
    panelPointerMove,
    panelPointerUp,
    panelPointerCancel,
    commandStack,
    flushCommitRef,
    undoInProgressRef,
    channel,
    agentConnected,
    connectionStatus,
    editErrors,
    onEditDispatch,
    onDismissError,
    onSelectElements,
    hmrAppliedVersion,
    hmrEventVersion = 0,
    hmrChangedFiles = [],
    staleOverrideCount = 0,
    staleSources,
    stageEditRef,
    commitEditRef,
    bufferListRef
  }) {
    let element = selectedElements[0] ?? null, [isEntering, setIsEntering] = d2(!0), bodyRef = A2(null), prevElementRef = A2(null), scrubPreviousRef = A2(/* @__PURE__ */ new Map()), lastCommitValueRef = A2(/* @__PURE__ */ new Map()), commitPendingRef = A2(!1), syncEmitterRef = A2(null);
    syncEmitterRef.current === null && channel && (syncEmitterRef.current = createPanelSyncEmitter(channel));
    let resolvedSpacingTokens = spacingTokens ?? [], buffer = useEditStagingBuffer(syncEmitterRef.current ?? void 0);
    y2(() => {
      if (channel)
        return channel.onMessage((msg) => {
          if (msg.type === "staged-edits-discard") {
            let ids = msg.intentIds;
            buffer.remove(ids);
          }
        });
    }, [channel, buffer]);
    let [intentDriftCount, setIntentDriftCount] = d2(0), [applyError, setApplyError] = d2(null), onApply = q2(async () => {
      if (!channel)
        throw new Error("No cortex channel available \u2014 Apply not delivered. Reload the page or check that the cortex MCP is connected.");
      setApplyError(null), await channel.sendAndAck({ type: "staged-edits-ready", count: buffer.size() });
    }, [channel, buffer]), handleApplyError = q2((err) => {
      setApplyError(err instanceof Error ? err.message : "Apply failed");
    }, []);
    y2(() => {
      if (hmrChangedFiles.length === 0) {
        setIntentDriftCount(0);
        return;
      }
      let result = buffer.reconcile(
        hmrChangedFiles,
        overrideManager.readSourceValue.bind(overrideManager)
      );
      setIntentDriftCount(result.divergent.length);
    }, [hmrEventVersion, buffer.version]);
    let [activePseudo, setActivePseudo] = d2("element"), [sharedInfo, setSharedInfo] = d2(null), [editScope, setEditScope] = d2("instance"), [sharedSourceInfo, setSharedSourceInfo] = d2(null), [layerHeight, setLayerHeight] = d2(DEFAULT_LAYER_HEIGHT), layerResizeRef = A2({ dragging: !1, startY: 0, startH: 0 }), handleLayerResizeDown = q2((e4) => {
      layerResizeRef.current = { dragging: !0, startY: e4.clientY, startH: layerHeight }, e4.currentTarget.setPointerCapture(e4.pointerId);
    }, [layerHeight]), handleLayerResizeMove = q2((e4) => {
      let r4 = layerResizeRef.current;
      if (!r4.dragging) return;
      let maxH = Math.floor(window.innerHeight * 0.5);
      setLayerHeight(Math.max(MIN_LAYER_HEIGHT, Math.min(maxH, r4.startH + (e4.clientY - r4.startY))));
    }, []), handleLayerResizeUp = q2((e4) => {
      if (layerResizeRef.current.dragging) {
        layerResizeRef.current.dragging = !1;
        try {
          e4.currentTarget.releasePointerCapture(e4.pointerId);
        } catch {
        }
      }
    }, []), defaultStylesRef = A2(null);
    y2(() => {
      if (!element) {
        defaultStylesRef.current = null;
        return;
      }
      let cs = getComputedStyle(element), snapshot = {};
      for (let prop of ALL_DIMMING_PROPERTIES)
        snapshot[prop] = typeof cs.getPropertyValue == "function" ? cs.getPropertyValue(prop) : "";
      defaultStylesRef.current = snapshot, setStyleVersion((v3) => v3 + 1);
    }, [element]), y2(() => {
      let timer = setTimeout(() => setIsEntering(!1), 250);
      return () => clearTimeout(timer);
    }, []), y2(() => {
      prevElementRef.current && prevElementRef.current !== element && setActivePseudo("element"), prevElementRef.current = element, scrubPreviousRef.current.clear(), lastCommitValueRef.current.clear();
    }, [element]), y2(() => {
      scrubPreviousRef.current.clear(), lastCommitValueRef.current.clear();
    }, [activePseudo]), y2(() => () => {
      clearHighlights(), removeBlastRadiusStyle();
    }, []), y2(() => {
      clearHighlights(), setEditScope("instance");
    }, [element]), y2(() => {
      if (element)
        try {
          setSharedInfo(detectSharedClasses(element));
        } catch (err) {
          err instanceof DOMException && err.name === "SecurityError" || console.warn("[cortex] detectSharedClasses unexpected error", err), setSharedInfo(null);
        }
      else
        setSharedInfo(null);
    }, [element, hmrAppliedVersion]), y2(() => {
      if (element)
        try {
          setSharedSourceInfo(detectSharedSource(element));
        } catch (err) {
          err instanceof DOMException && err.name === "SecurityError" || console.warn("[cortex] detectSharedSource unexpected error", err), setSharedSourceInfo(null);
        }
      else
        setSharedSourceInfo(null);
    }, [element, hmrAppliedVersion]);
    let [styleVersion, setStyleVersion] = d2(0);
    y2(() => onOverrideChange(() => setStyleVersion((v3) => v3 + 1)), []), y2(() => {
      if (!element) return;
      let pending = !1, bump = () => {
        pending || (pending = !0, queueMicrotask(() => {
          pending = !1, setStyleVersion((v3) => v3 + 1);
        }));
      }, observer = new MutationObserver(bump);
      return observer.observe(element, { attributes: !0, attributeFilter: ["class", "style"] }), () => observer.disconnect();
    }, [element]);
    let { computedStyles, dimmedProperties, mixedProperties: scopeMixedProperties } = T2(
      () => computePanelStyleSnapshot({
        element,
        activePseudo,
        activeState,
        sharedInfo,
        editScope,
        overrideManager,
        defaultStyles: defaultStylesRef.current
      }),
      [element, styleVersion, hmrAppliedVersion, activeState, activePseudo, sharedInfo, editScope]
    ), multiSelectMixed = T2(() => {
      let live = selectedElements.filter((el) => el.isConnected);
      if (live.length <= 1) return /* @__PURE__ */ new Set();
      let mixed = /* @__PURE__ */ new Set();
      for (let prop of MULTI_SELECT_WATCHED_PROPERTIES) {
        let firstVal = null;
        for (let el of live) {
          let v3 = getComputedStyle(el).getPropertyValue(prop).trim();
          if (firstVal === null) firstVal = v3;
          else if (v3 !== firstVal) {
            mixed.add(prop);
            break;
          }
        }
      }
      return mixed;
    }, [selectedElements, hmrAppliedVersion, styleVersion, activeState, activePseudo]), mixedProperties = T2(() => multiSelectMixed.size === 0 && !scopeMixedProperties || multiSelectMixed.size === 0 ? scopeMixedProperties : scopeMixedProperties ? /* @__PURE__ */ new Set([...scopeMixedProperties, ...multiSelectMixed]) : multiSelectMixed, [multiSelectMixed, scopeMixedProperties]), availableWeights = T2(
      () => {
        let family = computedStyles.typography.fontFamily ?? "";
        return getWeightsForFamily(stripCSSQuotes(family.split(",")[0]?.trim() ?? ""));
      },
      [computedStyles.typography.fontFamily]
    ), rawClassName = T2(() => element ? typeof element.className == "string" ? element.className : element.getAttribute("class") ?? "" : "", [element, styleVersion]), extractedUtilities = T2(
      () => extractUtilities(rawClassName),
      [rawClassName]
    ), typographyClassName = rawClassName, SEP = "\0", commitScrub = q2(() => {
      if (undoInProgressRef?.current) {
        scrubPreviousRef.current.clear();
        return;
      }
      if (!element || scrubPreviousRef.current.size === 0) return;
      let primaryTarget = getElementEditTarget(element), source = primaryTarget.source, changes = [];
      for (let [key, previousValue] of scrubPreviousRef.current) {
        let [s3, p3, ps] = key.split(SEP), parsedPseudo = ps || void 0, currentValue = overrideManager.get(s3, p3, parsedPseudo) ?? "";
        currentValue !== previousValue && changes.push({
          source: s3,
          property: p3,
          value: currentValue,
          previousValue,
          pseudo: parsedPseudo
        });
      }
      let isMultiSelect = selectedElements.length > 1, isShared = !!sharedInfo && editScope === "all", pendingEdits;
      if (isMultiSelect) {
        pendingEdits = [];
        let seenSources = /* @__PURE__ */ new Set();
        for (let el of selectedElements) {
          let elTarget = getElementEditTarget(el), elSource = elTarget.source;
          if (seenSources.has(elSource)) continue;
          seenSources.add(elSource);
          let perElementInstanceSources;
          if (isShared)
            try {
              let shared = detectSharedClasses(el);
              perElementInstanceSources = shared ? editSourcesForElements(shared.elements) : void 0;
            } catch (err) {
              console.warn("[cortex] detectSharedClasses threw during multi-select fan-out", err), perElementInstanceSources = void 0;
            }
          for (let c4 of changes)
            c4.source === elSource && pendingEdits.push({
              intentId: generateId(),
              source: elSource,
              property: c4.property,
              value: c4.value,
              previousValue: c4.previousValue,
              // Use the change's own pseudo, not the closure-scoped `activePseudo`.
              pseudo: c4.pseudo,
              scope: isShared ? "all" : "instance",
              instanceSources: perElementInstanceSources,
              ...pendingEditTargetFields(elTarget),
              timestamp: Date.now()
            });
        }
      } else {
        let editedProps = changes.filter((c4) => c4.source === source), instanceSources = isShared ? editSourcesForElements(sharedInfo.elements) : void 0;
        pendingEdits = editedProps.map((c4) => ({
          intentId: generateId(),
          source,
          property: c4.property,
          value: c4.value,
          previousValue: c4.previousValue,
          // Use the change's own pseudo, not the closure-scoped `activePseudo`.
          // They're equal today via a useEffect that clears scrubPreviousRef on
          // pseudo change, but that invariant is action-at-a-distance — local
          // truth (`c.pseudo`) is always correct.
          pseudo: c4.pseudo,
          // PendingEdit.scope mirrors the server's CortexEdit.scope contract
          // ('instance' | 'all'); editScope already uses the same shape.
          scope: editScope,
          instanceSources,
          ...pendingEditTargetFields(primaryTarget),
          timestamp: Date.now()
        }));
      }
      if (changes.length > 0) {
        if (commandStack) {
          let cmd = new PropertyEditCommand({
            changes,
            overrideManager,
            pendingEdits,
            bufferOps: buffer
          });
          commandStack.record(cmd);
        } else
          console.warn("[cortex] Edit committed without undo stack \u2014 this edit cannot be undone");
        for (let c4 of changes)
          lastCommitValueRef.current.set(`${c4.source}${SEP}${c4.property}${SEP}${c4.pseudo ?? ""}`, c4.value);
      }
      overrideManager.flush(), setStyleVersion((v3) => v3 + 1), scrubPreviousRef.current.clear();
      for (let edit of pendingEdits)
        buffer.append(edit), onDismissError?.(`${edit.source}${SEP}${edit.property}`);
    }, [selectedElements, element, overrideManager, buffer, sharedInfo, editScope, commandStack, onDismissError]);
    y2(() => {
      if (flushCommitRef)
        return flushCommitRef.current = () => {
          commitPendingRef.current && (commitPendingRef.current = !1, commitScrub());
        }, () => {
          flushCommitRef.current = null;
        };
    }, [flushCommitRef, commitScrub]), y2(() => {
      if (stageEditRef)
        return stageEditRef.current = (source, property, value) => {
          let intentId = `test-${generateId()}`;
          return buffer.append({
            intentId,
            source,
            property,
            value,
            previousValue: "",
            timestamp: Date.now()
          }), intentId;
        }, () => {
          stageEditRef.current = null;
        };
    }, [stageEditRef, buffer]);
    let applyOverride = q2((property, value, commitRender) => {
      if (undoInProgressRef?.current || !element) return;
      let source = getElementEditTarget(element).source, pseudo = activePseudo !== "element" ? activePseudo : void 0, prevKey = `${source}${SEP}${property}${SEP}${pseudo ?? ""}`;
      if (commitRender && lastCommitValueRef.current.get(prevKey) === value) {
        if (overrideManager.get(source, property, pseudo) === value) {
          scrubPreviousRef.current.delete(prevKey);
          return;
        }
        lastCommitValueRef.current.delete(prevKey);
      }
      if (!scrubPreviousRef.current.has(prevKey)) {
        let existing = overrideManager.get(source, property, pseudo);
        if (existing !== void 0)
          scrubPreviousRef.current.set(prevKey, existing);
        else {
          let computed = getComputedStyle(element, pseudo ?? null).getPropertyValue(property).trim();
          scrubPreviousRef.current.set(prevKey, computed || "");
        }
      }
      let fanOutTargets = (() => {
        let isMulti = selectedElements.length > 1, isAll = sharedInfo && editScope === "all";
        if (isMulti && isAll) {
          let seen = /* @__PURE__ */ new Set();
          for (let sel of selectedElements) {
            seen.has(sel) || seen.add(sel);
            try {
              let shared = detectSharedClasses(sel);
              if (shared) for (let sib of shared.elements) seen.add(sib);
            } catch {
            }
          }
          return Array.from(seen);
        }
        return isMulti ? selectedElements : isAll ? sharedInfo.elements : element ? [element] : [];
      })();
      for (let el of fanOutTargets) {
        let elSource = getElementEditTarget(el).source, elPrevKey = `${elSource}${SEP}${property}${SEP}${pseudo ?? ""}`;
        if (!scrubPreviousRef.current.has(elPrevKey)) {
          let elExisting = overrideManager.get(elSource, property, pseudo);
          if (elExisting !== void 0)
            scrubPreviousRef.current.set(elPrevKey, elExisting);
          else {
            let computed = getComputedStyle(el, pseudo ?? null).getPropertyValue(property).trim();
            scrubPreviousRef.current.set(elPrevKey, computed || "");
          }
        }
        overrideManager.set(elSource, property, value, pseudo);
      }
      commitRender && (commitPendingRef.current || (commitPendingRef.current = !0, queueMicrotask(() => {
        commitPendingRef.current = !1, commitScrub();
      })));
    }, [selectedElements, element, overrideManager, activePseudo, sharedInfo, editScope, commitScrub]), handleCommit = q2((c4) => applyOverride(c4.property, c4.value, !0), [applyOverride]), handleScrub = q2((c4) => applyOverride(c4.property, c4.value, !1), [applyOverride]);
    y2(() => {
      if (commitEditRef)
        return commitEditRef.current = (property, value) => new Promise((resolve) => {
          applyOverride(property, value, !1), applyOverride(property, value, !0), queueMicrotask(resolve);
        }), () => {
          commitEditRef.current = null;
        };
    }, [commitEditRef, applyOverride]), y2(() => {
      if (bufferListRef)
        return bufferListRef.current = {
          list: () => buffer.list(),
          size: () => buffer.size()
        }, () => {
          bufferListRef.current = null;
        };
    }, [bufferListRef, buffer]);
    let formatCompoundDescription = (opts) => {
      let parts = [];
      return opts.remove && parts.push(`-${opts.remove}`), opts.add && parts.push(`+${opts.add}`), opts.inlineSets?.length && parts.push(`set(${opts.inlineSets.length})`), opts.inlineRemoves?.length && parts.push(`rm(${opts.inlineRemoves.length})`), parts.join(" ");
    }, applyClassChange = q2(
      (opts) => {
        if (!element || !channel) return;
        let source = element.getAttribute("data-cortex-source");
        if (!source || !opts.remove && !opts.add) return;
        flushCommitRef?.current?.();
        let pseudo = activePseudo !== "element" ? activePseudo : void 0, editId = generateId(), changes = [];
        if (opts.inlineSets)
          for (let s3 of opts.inlineSets) {
            let previousValue = overrideManager.get(source, s3.property, pseudo) ?? "";
            changes.push({ source, property: s3.property, value: s3.value, previousValue, pseudo }), overrideManager.set(source, s3.property, s3.value, pseudo), overrideManager.trackPendingEdit(editId, source, s3.property, s3.value, pseudo);
          }
        if (opts.inlineRemoves)
          for (let r4 of opts.inlineRemoves) {
            let previousValue = overrideManager.get(source, r4.property, pseudo) ?? "";
            overrideManager.remove(source, r4.property, pseudo), previousValue !== "" && changes.push({ source, property: r4.property, value: "", previousValue, pseudo });
          }
        if (commandStack) {
          let cmd = new CompoundEditCommand({ changes, overrideManager, editId });
          commandStack.record(cmd);
        } else
          console.warn("[cortex] Compound edit committed without undo stack \u2014 this edit cannot be undone");
        onEditDispatch?.(editId, source, "__class__", formatCompoundDescription(opts)), channel.send({
          type: "edit",
          editId,
          source,
          property: "",
          value: "",
          elementSelector: element.tagName.toLowerCase(),
          classOp: opts.remove && opts.add ? { kind: "swap", remove: opts.remove, add: opts.add } : opts.add ? { kind: "add", add: opts.add } : opts.remove ? { kind: "remove", remove: opts.remove } : void 0,
          ...opts.inlineSets && opts.inlineSets.length > 0 ? { inlineSets: opts.inlineSets } : {},
          ...opts.inlineRemoves && opts.inlineRemoves.length > 0 ? { inlineRemoves: opts.inlineRemoves } : {}
        });
      },
      [element, channel, onEditDispatch, overrideManager, activePseudo, commandStack]
    ), handleTypographyChange = q2(
      (change) => {
        if ("property" in change) {
          applyOverride(change.property, change.value, !0);
          return;
        }
        let clearLinkedOverrides = (properties) => {
          if (!element) return;
          let source = element.getAttribute("data-cortex-source");
          if (!source) return;
          let pseudo = activePseudo !== "element" ? activePseudo : void 0;
          for (let property of properties)
            overrideManager.remove(source, property, pseudo);
        };
        switch (change.kind) {
          case "link-text-component": {
            clearLinkedOverrides(TYPOGRAPHY_LINKED_PROPERTIES), applyClassChange({
              remove: change.removeClass,
              add: `text-${change.component.name}`,
              inlineRemoves: TYPOGRAPHY_LINKED_PROPERTIES.map((property) => ({ property }))
            });
            return;
          }
          case "unlink-text-component": {
            applyClassChange({
              remove: change.removeClass,
              inlineSets: change.inline
            });
            return;
          }
          case "link-color-chip": {
            clearLinkedOverrides(COLOR_LINKED_PROPERTIES), applyClassChange({
              remove: change.removeClass,
              add: `text-${change.chip.name}`,
              inlineRemoves: COLOR_LINKED_PROPERTIES.map((property) => ({ property }))
            });
            return;
          }
          case "unlink-color-chip": {
            applyClassChange({
              remove: change.removeClass,
              inlineSets: change.inline
            });
            return;
          }
          case "typography-align": {
            let result = resolveTypographyAlignmentEdits({
              context: computedStyles.typography,
              axis: change.axis,
              value: change.value
            });
            result.edits.forEach((edit, index) => {
              applyOverride(edit.property, edit.value, index === result.edits.length - 1);
            });
            return;
          }
          default:
            console.error("[cortex] Unhandled TypographyChange kind:", change);
        }
      },
      [applyOverride, applyClassChange, computedStyles.typography]
    ), handleBackgroundChange = q2(
      (change) => {
        if ("property" in change) {
          applyOverride(change.property, change.value, !0);
          return;
        }
        switch (change.kind) {
          case "link-background-token":
            applyClassChange({
              remove: change.removeClass,
              add: `bg-${change.chip.name}`,
              inlineRemoves: [{ property: "background-color" }]
            });
            return;
          case "unlink-background-token":
            applyClassChange({
              remove: change.removeClass,
              inlineSets: change.inline
            });
            return;
          default:
            console.error("[cortex] Unhandled BackgroundChange kind:", change);
        }
      },
      [applyOverride, applyClassChange]
    ), handleBorderChange = q2(
      (change) => {
        if ("property" in change) {
          applyOverride(change.property, change.value, !0);
          return;
        }
        switch (change.kind) {
          case "link-border-token":
            applyClassChange({
              remove: change.removeClass,
              add: `border-${change.chip.name}`,
              inlineRemoves: [{ property: "border-color" }]
            });
            return;
          case "unlink-border-token":
            applyClassChange({
              remove: change.removeClass,
              inlineSets: change.inline
            });
            return;
          default:
            console.error("[cortex] Unhandled BorderChange kind:", change);
        }
      },
      [applyOverride, applyClassChange]
    ), fillHasValue = T2(() => summarizeFill(computedStyles.fill), [computedStyles.fill]) !== "transparent", borderHasValue = T2(() => summarizeBorder(computedStyles.border), [computedStyles.border]) !== "none", handleFillAdd = q2(() => {
      applyOverride("background-color", "#ffffff", !0);
    }, [applyOverride]), handleFillRemove = q2(() => {
      applyOverride("background-color", "transparent", !0);
    }, [applyOverride]), setBorderWidths = q2((width) => {
      applyOverride("border-width", width, !1), applyOverride("border-top-width", width, !1), applyOverride("border-right-width", width, !1), applyOverride("border-bottom-width", width, !1), applyOverride("border-left-width", width, !1);
    }, [applyOverride]), handleBorderAdd = q2(() => {
      setBorderWidths("1px"), applyOverride("border-style", "solid", !1), applyOverride("border-color", "#000000", !1), commitScrub();
    }, [setBorderWidths, applyOverride, commitScrub]), handleBorderRemove = q2(() => {
      setBorderWidths("0px"), commitScrub();
    }, [setBorderWidths, commitScrub]), handleShadowAdd = q2(() => {
      applyOverride("box-shadow", addShadow(computedStyles.effects.boxShadow), !0);
    }, [computedStyles.effects.boxShadow, applyOverride]), handleSelectParent = q2(() => {
      element && element.parentElement && element.parentElement !== document.documentElement && onSelectElement(element.parentElement);
    }, [element, onSelectElement]), handleSelectChild = q2(() => {
      if (!element) return;
      let firstChild = element.children[0];
      firstChild instanceof HTMLElement && onSelectElement(firstChild);
    }, [element, onSelectElement]), panelClasses = [
      "cortex-panel",
      isEntering && "cortex-panel--entering",
      isSnapping && "cortex-panel--snapping"
    ].filter(Boolean).join(" ");
    if (!element)
      return /* @__PURE__ */ u4(
        "div",
        {
          class: panelClasses,
          style: { transform: `translate(${position.x}px, ${position.y}px)`, width: `${PANEL_WIDTH}px` },
          children: [
            /* @__PURE__ */ u4(
              PanelHeader,
              {
                tagName: "",
                componentName: "Cortex",
                sourceFile: null,
                sourceLine: null,
                filePath: null,
                onClose,
                onPointerDown: panelPointerDown,
                onPointerMove: panelPointerMove,
                onPointerUp: panelPointerUp,
                onPointerCancel: panelPointerCancel,
                bufferSize: buffer.size(),
                onApply,
                onApplyError: handleApplyError
              }
            ),
            /* @__PURE__ */ u4("div", { class: "cortex-panel__body", children: [
              applyError && /* @__PURE__ */ u4("div", { class: "cortex-apply-error", role: "alert", children: [
                /* @__PURE__ */ u4("span", { children: applyError }),
                /* @__PURE__ */ u4(
                  "button",
                  {
                    type: "button",
                    onClick: () => setApplyError(null),
                    class: "cortex-apply-error__dismiss",
                    "aria-label": "Dismiss apply error",
                    children: /* @__PURE__ */ u4(X, { size: 14 })
                  }
                )
              ] }),
              /* @__PURE__ */ u4(
                StagingDriftBanner,
                {
                  intentDriftCount,
                  staleOverrideCount,
                  onIntentRefresh: () => {
                    if (hmrChangedFiles.length > 0) {
                      let result = buffer.reconcile(
                        hmrChangedFiles,
                        overrideManager.readSourceValue.bind(overrideManager)
                      );
                      setIntentDriftCount(result.divergent.length);
                    }
                  },
                  onStaleRefresh: () => window.location.reload(),
                  onDismiss: () => {
                  }
                }
              ),
              /* @__PURE__ */ u4("div", { class: "cortex-panel__empty", children: [
                /* @__PURE__ */ u4("p", { class: "cortex-panel__empty-action", children: "Click any element to start editing" }),
                /* @__PURE__ */ u4("p", { class: "cortex-panel__empty-hint", children: "Changes write to your source files" }),
                /* @__PURE__ */ u4("p", { class: "cortex-panel__empty-shortcut", children: [
                  formatShortcut("$mod+Shift+Period"),
                  " to toggle"
                ] })
              ] })
            ] }),
            /* @__PURE__ */ u4(ConnectionStatusFooter, { status: connectionStatus })
          ]
        }
      );
    let sourceInfo = parseCortexSource(element), tagName = element.tagName.toLowerCase(), componentName = sourceInfo?.componentName ?? null, sourceFile = sourceInfo?.fileName ?? null, sourceLine = sourceInfo?.line ?? null, filePath = sourceInfo?.filePath ?? null, isLibrary = isLibraryComponent(element), ancestor = isLibrary ? findUserAncestor(element) : null, hasParent = element.parentElement !== null && element.parentElement !== document.documentElement, hasChildren = element.children.length > 0, showTypography = hasTypographyContent(element), showPosition = !(sharedInfo && editScope === "all"), elementSource = element.getAttribute("data-cortex-source") ?? "", elementSourceIsStale = elementSource !== "" && (staleSources?.has(elementSource) ?? !1);
    return /* @__PURE__ */ u4(SpacingTokensContext.Provider, { value: resolvedSpacingTokens, children: /* @__PURE__ */ u4(
      "div",
      {
        class: panelClasses,
        style: {
          transform: `translate(${position.x}px, ${position.y}px)`,
          width: `${PANEL_WIDTH}px`
        },
        children: [
          /* @__PURE__ */ u4(
            PanelHeader,
            {
              tagName,
              componentName,
              sourceFile,
              sourceLine,
              filePath,
              onClose,
              onPointerDown: panelPointerDown,
              onPointerMove: panelPointerMove,
              onPointerUp: panelPointerUp,
              onPointerCancel: panelPointerCancel,
              hasBefore,
              hasAfter,
              activePseudo,
              onPseudoChange: setActivePseudo,
              isLibrary,
              ancestorSource: ancestor?.source.fileName ?? null,
              ancestorLine: ancestor?.source.line ?? null,
              bufferSize: buffer.size(),
              onApply,
              onApplyError: handleApplyError
            }
          ),
          editErrors && element?.getAttribute("data-cortex-source") && /* @__PURE__ */ u4(
            EditErrorCard,
            {
              errors: editErrors,
              elementSource: element.getAttribute("data-cortex-source"),
              agentConnected: agentConnected ?? !1,
              onDismiss: (key) => onDismissError?.(key),
              onAskAI: (error) => {
                if (!channel) {
                  console.warn("[cortex] Cannot send fix request: no channel");
                  return;
                }
                channel.send({
                  type: "comment",
                  kind: "fix-request",
                  fixMeta: { property: error.property, value: error.value, reason: error.reason },
                  elementSource: error.source,
                  text: `${error.property} edit failed: ${error.reason}`
                });
              }
            }
          ),
          sharedInfo && /* @__PURE__ */ u4("div", { class: "cortex-panel__scope", children: [
            /* @__PURE__ */ u4("span", { class: "cortex-panel__scope-label", children: [
              "Shared by ",
              sharedInfo.count,
              " elements"
            ] }),
            /* @__PURE__ */ u4(
              "div",
              {
                class: "cortex-panel__scope-toggle",
                role: "radiogroup",
                "aria-label": "Editing scope",
                onKeyDown: (e4) => {
                  if (e4.key === "ArrowLeft" || e4.key === "ArrowRight") {
                    e4.preventDefault();
                    let next = editScope === "instance" ? "all" : "instance";
                    setEditScope(next), next === "all" ? highlightSharedElements(sharedInfo, element) : clearHighlights();
                  }
                },
                children: [
                  /* @__PURE__ */ u4(
                    "button",
                    {
                      type: "button",
                      class: `cortex-panel__scope-btn ${editScope === "instance" ? "cortex-panel__scope-btn--active" : ""}`,
                      role: "radio",
                      "aria-checked": editScope === "instance",
                      tabIndex: editScope === "instance" ? 0 : -1,
                      onClick: () => {
                        setEditScope("instance"), clearHighlights();
                      },
                      children: "This element"
                    }
                  ),
                  /* @__PURE__ */ u4(
                    "button",
                    {
                      type: "button",
                      class: `cortex-panel__scope-btn ${editScope === "all" ? "cortex-panel__scope-btn--active" : ""}`,
                      role: "radio",
                      "aria-checked": editScope === "all",
                      tabIndex: editScope === "all" ? 0 : -1,
                      onClick: () => {
                        setEditScope("all"), highlightSharedElements(sharedInfo, element);
                      },
                      onMouseEnter: () => {
                        editScope !== "all" && highlightSharedElements(sharedInfo, element);
                      },
                      onMouseLeave: () => {
                        editScope !== "all" && clearHighlights();
                      },
                      children: "All"
                    }
                  )
                ]
              }
            )
          ] }),
          sharedSourceInfo && !sharedInfo && /* @__PURE__ */ u4(
            "div",
            {
              class: "cortex-panel__scope cortex-panel__scope--source-only",
              onMouseEnter: () => highlightSharedElements(sharedSourceInfo, element),
              onMouseLeave: () => clearHighlights(),
              children: /* @__PURE__ */ u4("span", { class: "cortex-panel__scope-label", children: [
                "Used by ",
                sharedSourceInfo.count,
                " elements"
              ] })
            }
          ),
          /* @__PURE__ */ u4("div", { class: "cortex-panel__body", ref: bodyRef, children: [
            applyError && /* @__PURE__ */ u4("div", { class: "cortex-apply-error", role: "alert", children: [
              /* @__PURE__ */ u4("span", { children: applyError }),
              /* @__PURE__ */ u4(
                "button",
                {
                  type: "button",
                  onClick: () => setApplyError(null),
                  class: "cortex-apply-error__dismiss",
                  "aria-label": "Dismiss apply error",
                  children: /* @__PURE__ */ u4(X, { size: 14 })
                }
              )
            ] }),
            /* @__PURE__ */ u4(
              StagingDriftBanner,
              {
                intentDriftCount,
                staleOverrideCount,
                onIntentRefresh: () => {
                  if (hmrChangedFiles.length > 0) {
                    let result = buffer.reconcile(
                      hmrChangedFiles,
                      overrideManager.readSourceValue.bind(overrideManager)
                    );
                    setIntentDriftCount(result.divergent.length);
                  }
                },
                onStaleRefresh: () => window.location.reload(),
                onDismiss: () => {
                }
              }
            ),
            /* @__PURE__ */ u4(
              SectionGroup,
              {
                label: "Elements",
                groupId: "elements",
                headerAction: /* @__PURE__ */ u4("div", { class: "cortex-elements-header-actions", role: "group", "aria-label": "Element navigation and overlay controls", children: [
                  /* @__PURE__ */ u4(
                    "button",
                    {
                      type: "button",
                      class: "cortex-elements-header-actions__btn",
                      "data-action": "parent",
                      disabled: !hasParent,
                      "data-tooltip": "Select parent element",
                      "aria-label": "Select parent element",
                      onClick: handleSelectParent,
                      children: /* @__PURE__ */ u4(ChevronUp, { size: 14 })
                    }
                  ),
                  /* @__PURE__ */ u4(
                    "button",
                    {
                      type: "button",
                      class: "cortex-elements-header-actions__btn",
                      "data-action": "child",
                      disabled: !hasChildren,
                      "data-tooltip": "Select child element",
                      "aria-label": "Select child element",
                      onClick: handleSelectChild,
                      children: /* @__PURE__ */ u4(ChevronDown, { size: 14 })
                    }
                  ),
                  /* @__PURE__ */ u4(
                    "button",
                    {
                      type: "button",
                      class: `cortex-elements-header-actions__btn${hoverEnabled ? "" : " cortex-elements-header-actions__btn--toggled-off"}`,
                      "data-action": "toggle-hover",
                      disabled: !onToggleHover,
                      "data-tooltip": hoverEnabled ? "Hide hover overlay" : "Show hover overlay",
                      "aria-label": hoverEnabled ? "Hide hover overlay" : "Show hover overlay",
                      "aria-pressed": hoverEnabled ? "true" : "false",
                      onClick: () => onToggleHover?.(),
                      children: hoverEnabled ? /* @__PURE__ */ u4(Eye, { size: 14 }) : /* @__PURE__ */ u4(EyeOff, { size: 14 })
                    }
                  )
                ] }),
                children: /* @__PURE__ */ u4(
                  ElementTree,
                  {
                    element,
                    onSelectElements: onSelectElements ?? ((els, _action) => onSelectElement(els[0] ?? null)),
                    height: layerHeight,
                    hmrAppliedVersion
                  }
                )
              }
            ),
            /* @__PURE__ */ u4(
              "div",
              {
                class: "cortex-section-resize",
                onPointerDown: handleLayerResizeDown,
                onPointerMove: handleLayerResizeMove,
                onPointerUp: handleLayerResizeUp,
                onPointerCancel: handleLayerResizeUp
              }
            ),
            showPosition && /* @__PURE__ */ u4(SectionGroup, { label: "Position", groupId: "position", children: /* @__PURE__ */ u4(
              PositionSection,
              {
                values: computedStyles.position,
                onChange: handleCommit,
                onScrub: handleScrub,
                onScrubEnd: handleCommit,
                dimmedProperties,
                stale: elementSourceIsStale
              }
            ) }),
            /* @__PURE__ */ u4(SectionGroup, { label: "Layout", groupId: "layout", children: /* @__PURE__ */ u4(
              LayoutSection,
              {
                values: computedStyles.layout,
                onChange: handleCommit,
                onScrub: handleScrub,
                onScrubEnd: handleCommit,
                dimmedProperties,
                mixedProperties,
                spacing: { padding: computedStyles.spacing.padding, margin: computedStyles.spacing.margin },
                onSpacingChange: handleCommit,
                onSpacingScrub: handleScrub,
                onSpacingScrubEnd: handleCommit,
                stale: elementSourceIsStale
              }
            ) }),
            showTypography && /* @__PURE__ */ u4(SectionGroup, { label: "Typography", groupId: "typography", children: /* @__PURE__ */ u4(
              TypographySection,
              {
                values: computedStyles.typography,
                availableWeights,
                className: typographyClassName,
                onChange: handleTypographyChange,
                onScrub: handleScrub,
                onScrubEnd: handleCommit,
                swatches,
                textComponents,
                colorChips,
                dimmedProperties,
                mixedProperties
              }
            ) }),
            /* @__PURE__ */ u4(SectionGroup, { label: "Appearance", groupId: "appearance", children: /* @__PURE__ */ u4(
              AppearanceSection,
              {
                values: computedStyles.appearance,
                onChange: handleCommit,
                onScrub: handleScrub,
                onScrubEnd: handleCommit,
                dimmedProperties,
                mixedProperties,
                resetKey: `${element.tagName}|${element.id}|${element.getAttribute("data-cortex-source") ?? ""}`
              }
            ) }),
            /* @__PURE__ */ u4(
              SectionGroup,
              {
                label: "Background",
                groupId: "background",
                headerAction: fillHasValue ? void 0 : /* @__PURE__ */ u4(IconButton, { icon: /* @__PURE__ */ u4(Plus, { size: 14 }), ariaLabel: "Add background", tooltip: "Add background color", onClick: handleFillAdd }),
                children: fillHasValue && /* @__PURE__ */ u4(
                  BackgroundSection,
                  {
                    backgroundColor: computedStyles.fill.backgroundColor,
                    backgroundToken: extractedUtilities.get("background-color") ?? null,
                    onChange: handleBackgroundChange,
                    onScrub: handleScrub,
                    onScrubEnd: handleCommit,
                    onRemove: handleFillRemove,
                    swatches,
                    colorChips,
                    dimmedProperties,
                    mixedProperties
                  }
                )
              }
            ),
            /* @__PURE__ */ u4(
              SectionGroup,
              {
                label: "Border",
                groupId: "border",
                headerAction: borderHasValue ? void 0 : /* @__PURE__ */ u4(IconButton, { icon: /* @__PURE__ */ u4(Plus, { size: 14 }), ariaLabel: "Add border", tooltip: "Add border", onClick: handleBorderAdd }),
                children: borderHasValue && /* @__PURE__ */ u4(
                  BorderSection,
                  {
                    values: computedStyles.border,
                    borderToken: extractedUtilities.get("border-color") ?? null,
                    onChange: handleBorderChange,
                    onScrub: handleScrub,
                    onScrubEnd: handleCommit,
                    onRemove: handleBorderRemove,
                    swatches,
                    colorChips,
                    dimmedProperties,
                    mixedProperties
                  }
                )
              }
            ),
            /* @__PURE__ */ u4(
              SectionGroup,
              {
                label: "Effects",
                groupId: "effects",
                headerAction: /* @__PURE__ */ u4(IconButton, { icon: /* @__PURE__ */ u4(Plus, { size: 14 }), ariaLabel: "Add effect", tooltip: "Add shadow effect", onClick: handleShadowAdd }),
                children: /* @__PURE__ */ u4(
                  EffectsSection,
                  {
                    values: computedStyles.effects,
                    onChange: handleCommit,
                    onScrub: handleScrub,
                    onScrubEnd: handleCommit,
                    swatches,
                    dimmedProperties,
                    mixedProperties
                  }
                )
              }
            )
          ] }),
          /* @__PURE__ */ u4(ConnectionStatusFooter, { status: connectionStatus })
        ]
      }
    ) });
  }

  // src/browser/hooks/useDrag.ts
  var INTERACTIVE_SELECTOR = 'button, a, input, select, textarea, [role="button"]';
  function useDrag({ onDrag, onDragEnd }) {
    let draggingRef = A2(!1), offsetRef = A2({ x: 0, y: 0 }), lastPosRef = A2({ x: 0, y: 0 }), handlePointerDown = q2((e4) => {
      if (e4.target.closest(INTERACTIVE_SELECTOR)) return;
      let el = e4.currentTarget, rect = el.getBoundingClientRect();
      offsetRef.current = {
        x: e4.clientX - rect.left,
        y: e4.clientY - rect.top
      }, draggingRef.current = !0;
      try {
        el.setPointerCapture(e4.pointerId);
      } catch {
      }
    }, []), handlePointerMove = q2((e4) => {
      if (!draggingRef.current) return;
      let x3 = e4.clientX - offsetRef.current.x, y3 = e4.clientY - offsetRef.current.y;
      lastPosRef.current = { x: x3, y: y3 }, onDrag(x3, y3);
    }, [onDrag]), handlePointerUp = q2((e4) => {
      if (draggingRef.current) {
        draggingRef.current = !1;
        try {
          e4.currentTarget.releasePointerCapture(e4.pointerId);
        } catch {
        }
        onDragEnd?.(lastPosRef.current.x, lastPosRef.current.y);
      }
    }, [onDragEnd]), handlePointerCancel = q2((e4) => {
      if (draggingRef.current) {
        draggingRef.current = !1;
        try {
          e4.currentTarget.releasePointerCapture(e4.pointerId);
        } catch {
        }
        onDragEnd?.(lastPosRef.current.x, lastPosRef.current.y);
      }
    }, [onDragEnd]);
    return { handlePointerDown, handlePointerMove, handlePointerUp, handlePointerCancel };
  }

  // src/browser/hooks/useToolbarDock.ts
  var TOOLBAR_THICKNESS = 40, TOOLBAR_LENGTH = 176, TOOLBAR_MARGIN = 16, SNAP_DURATION2 = 300, VALID_EDGES = /* @__PURE__ */ new Set(["top", "bottom", "left", "right"]);
  function isValidEdge(v3) {
    return typeof v3 == "string" && VALID_EDGES.has(v3);
  }
  function isHorizontalEdge(edge) {
    return edge === "top" || edge === "bottom";
  }
  function clamp4(value, min2, max2) {
    return Math.max(min2, Math.min(max2, value));
  }
  function computePosition3(edge, offset3) {
    let vw = window.innerWidth, vh = window.innerHeight, maxX = Math.max(TOOLBAR_MARGIN, vw - TOOLBAR_LENGTH - TOOLBAR_MARGIN), maxY = Math.max(TOOLBAR_MARGIN, vh - TOOLBAR_LENGTH - TOOLBAR_MARGIN);
    return edge === "top" ? { x: clamp4(offset3, TOOLBAR_MARGIN, maxX), y: TOOLBAR_MARGIN } : edge === "bottom" ? { x: clamp4(offset3, TOOLBAR_MARGIN, maxX), y: Math.max(TOOLBAR_MARGIN, vh - TOOLBAR_THICKNESS - TOOLBAR_MARGIN) } : edge === "left" ? { x: TOOLBAR_MARGIN, y: clamp4(offset3, TOOLBAR_MARGIN, maxY) } : { x: Math.max(TOOLBAR_MARGIN, vw - TOOLBAR_THICKNESS - TOOLBAR_MARGIN), y: clamp4(offset3, TOOLBAR_MARGIN, maxY) };
  }
  function getDefaultPosition() {
    if (typeof window > "u") return { position: { x: 0, y: 0 }, edge: "bottom" };
    let storedEdge = cortexStorage.get("toolbar-edge", null, (v3) => isValidEdge(v3)), storedPos = cortexStorage.get("toolbar-position", null, (v3) => isValidPosition(v3));
    if (storedEdge !== null && storedPos !== null)
      return { position: computePosition3(storedEdge, storedEdge === "top" || storedEdge === "bottom" ? storedPos.x : storedPos.y), edge: storedEdge };
    let edge = "bottom", offset3 = (window.innerWidth - TOOLBAR_LENGTH) / 2;
    return { position: computePosition3(edge, offset3), edge };
  }
  function findNearestEdge(pos, currentEdge) {
    let vw = window.innerWidth, vh = window.innerHeight, horiz = isHorizontalEdge(currentEdge), w3 = horiz ? TOOLBAR_LENGTH : TOOLBAR_THICKNESS, h3 = horiz ? TOOLBAR_THICKNESS : TOOLBAR_LENGTH, cx = pos.x + w3 / 2, cy = pos.y + h3 / 2, distances = [
      { edge: "top", dist: cy, offset: pos.x },
      { edge: "bottom", dist: vh - cy, offset: pos.x },
      { edge: "left", dist: cx, offset: pos.y },
      { edge: "right", dist: vw - cx, offset: pos.y }
    ];
    distances.sort((a4, b) => a4.dist - b.dist);
    let nearest = distances[0];
    return { edge: nearest.edge, offset: nearest.offset };
  }
  function useToolbarDock() {
    let initRef = A2(null);
    initRef.current || (initRef.current = getDefaultPosition());
    let [position, setPositionState] = d2(initRef.current.position), [edge, setEdge] = d2(initRef.current.edge), [isSnapping, setIsSnapping] = d2(!1), positionRef = A2(initRef.current.position), edgeRef = A2(initRef.current.edge), snapTimerRef = A2(null), setPosition = q2((pos) => {
      positionRef.current = pos, setPositionState(pos);
    }, []), snap = q2(() => {
      let { edge: newEdge, offset: offset3 } = findNearestEdge(positionRef.current, edgeRef.current), newPos = computePosition3(newEdge, offset3);
      positionRef.current = newPos, edgeRef.current = newEdge, setPositionState(newPos), setEdge(newEdge), setIsSnapping(!0), cortexStorage.set("toolbar-position", newPos), cortexStorage.set("toolbar-edge", newEdge), snapTimerRef.current && clearTimeout(snapTimerRef.current), snapTimerRef.current = setTimeout(() => {
        snapTimerRef.current = null, setIsSnapping(!1);
      }, SNAP_DURATION2);
    }, []);
    return y2(() => {
      function handleResize() {
        let currentEdge = edgeRef.current, centered = isHorizontalEdge(currentEdge) ? (window.innerWidth - TOOLBAR_LENGTH) / 2 : (window.innerHeight - TOOLBAR_LENGTH) / 2, newPos = computePosition3(currentEdge, centered);
        positionRef.current = newPos, setPositionState(newPos);
      }
      return window.addEventListener("resize", handleResize), () => window.removeEventListener("resize", handleResize);
    }, []), y2(() => () => {
      snapTimerRef.current && clearTimeout(snapTimerRef.current);
    }, []), {
      position,
      edge,
      isHorizontal: isHorizontalEdge(edge),
      isSnapping,
      setPosition,
      snap
    };
  }

  // src/browser/components/Toolbar.tsx
  function Toolbar({
    activityCount,
    onClose,
    commentMode,
    onCommentMode,
    onActivityToggle
  }) {
    let { position, isHorizontal, isSnapping, setPosition, snap } = useToolbarDock(), { handlePointerDown: dragPointerDown, handlePointerMove, handlePointerUp, handlePointerCancel } = useDrag({
      onDrag(x3, y3) {
        setPosition({ x: x3, y: y3 });
      },
      onDragEnd() {
        snap();
      }
    }), handlePointerDown = q2((e4) => {
      e4.target.closest(".cortex-toolbar__grip") && dragPointerDown(e4);
    }, [dragPointerDown]), modesRef = A2(null), [indicatorTransform, setIndicatorTransform] = d2("translateX(0)");
    y2(() => {
      let container = modesRef.current;
      if (!container) return;
      let btn = container.querySelectorAll(".cortex-toolbar__mode")[commentMode ? 1 : 0];
      btn && setIndicatorTransform(`translateX(${btn.offsetLeft}px)`);
    }, [commentMode]);
    let classes = [
      "cortex-toolbar",
      isHorizontal ? "cortex-toolbar--horizontal" : "cortex-toolbar--vertical",
      isSnapping && "cortex-toolbar--snapping"
    ].filter(Boolean).join(" "), tooltipPlacement = isHorizontal ? void 0 : "right";
    return /* @__PURE__ */ u4(
      "div",
      {
        class: classes,
        style: {
          transform: `translate(${position.x}px, ${position.y}px)`
        },
        onPointerDown: handlePointerDown,
        onPointerMove: handlePointerMove,
        onPointerUp: handlePointerUp,
        onPointerCancel: handlePointerCancel,
        children: [
          /* @__PURE__ */ u4("div", { class: "cortex-toolbar__grip", role: "presentation", children: /* @__PURE__ */ u4(GripVertical, { size: 16 }) }),
          activityCount > 0 && /* @__PURE__ */ u4(
            "button",
            {
              type: "button",
              class: "cortex-toolbar__badge",
              onClick: onActivityToggle,
              "aria-label": `${activityCount} ${activityCount === 1 ? "change" : "changes"}`,
              "data-tooltip": `${activityCount} ${activityCount === 1 ? "change" : "changes"}`,
              "data-tooltip-placement": tooltipPlacement,
              children: activityCount
            }
          ),
          /* @__PURE__ */ u4("div", { class: "cortex-toolbar__modes", ref: modesRef, role: "radiogroup", "aria-label": "Editor mode", children: [
            /* @__PURE__ */ u4("div", { class: "cortex-toolbar__modes-indicator", style: { transform: indicatorTransform } }),
            /* @__PURE__ */ u4(
              "button",
              {
                type: "button",
                class: `cortex-toolbar__mode${commentMode ? "" : " cortex-toolbar__mode--active"}`,
                role: "radio",
                "aria-checked": commentMode ? "false" : "true",
                "aria-label": "Select mode",
                "data-mode": "select",
                "data-tooltip": `Select (${formatShortcut("v")})`,
                "data-tooltip-placement": tooltipPlacement,
                onClick: commentMode ? onCommentMode : void 0,
                children: /* @__PURE__ */ u4(MousePointer2, { size: 16 })
              }
            ),
            /* @__PURE__ */ u4(
              "button",
              {
                type: "button",
                class: `cortex-toolbar__mode${commentMode ? " cortex-toolbar__mode--active" : ""}`,
                role: "radio",
                "aria-checked": commentMode ? "true" : "false",
                "aria-label": "Comment mode",
                "data-mode": "comment",
                "data-tooltip": `Comment (${formatShortcut("c")})`,
                "data-tooltip-placement": tooltipPlacement,
                onClick: commentMode ? void 0 : onCommentMode,
                children: /* @__PURE__ */ u4(MessageSquare, { size: 16 })
              }
            )
          ] }),
          /* @__PURE__ */ u4("div", { class: "cortex-toolbar__divider" }),
          /* @__PURE__ */ u4(
            "button",
            {
              type: "button",
              class: "cortex-toolbar__btn cortex-toolbar__btn--close",
              "data-action": "close",
              onClick: onClose,
              "aria-label": "Close Cortex",
              "data-tooltip": "Close Cortex",
              "data-tooltip-placement": tooltipPlacement,
              children: /* @__PURE__ */ u4(X, { size: 16 })
            }
          )
        ]
      }
    );
  }

  // src/browser/components/CommentThread.tsx
  function CommentThread({ annotation, onReply }) {
    let [replyText, setReplyText] = d2(""), handleReplyKeyDown = q2((e4) => {
      e4.key === "Enter" && replyText.trim() && (onReply(annotation.id, replyText.trim()), setReplyText(""));
    }, [replyText, onReply, annotation.id]), statusClass = `cortex-thread__status--${annotation.status}`;
    return /* @__PURE__ */ u4("div", { class: "cortex-thread", children: [
      /* @__PURE__ */ u4("div", { class: "cortex-thread__header", children: [
        /* @__PURE__ */ u4("span", { class: `cortex-thread__status ${statusClass}`, children: [
          annotation.status === "pending" && "\u25CB",
          annotation.status === "acknowledged" && "\u25C9",
          annotation.status === "resolved" && "\u2713",
          annotation.status === "dismissed" && "\u2717"
        ] }),
        /* @__PURE__ */ u4("span", { class: "cortex-thread__text", children: annotation.text })
      ] }),
      annotation.status === "acknowledged" && /* @__PURE__ */ u4("div", { class: "cortex-thread__working", children: "Working..." }),
      annotation.resolution && /* @__PURE__ */ u4("div", { class: "cortex-thread__resolution", children: [
        "Applied: ",
        annotation.resolution.summary
      ] }),
      annotation.dismissReason && /* @__PURE__ */ u4("div", { class: "cortex-thread__dismiss-reason", children: [
        "Dismissed: ",
        annotation.dismissReason
      ] }),
      annotation.thread.length > 0 && /* @__PURE__ */ u4("div", { class: "cortex-thread__messages", children: annotation.thread.map((msg) => /* @__PURE__ */ u4("div", { class: `cortex-thread__message cortex-thread__message--${msg.from}`, children: msg.text }, msg.id)) }),
      (annotation.status === "pending" || annotation.status === "acknowledged") && /* @__PURE__ */ u4(
        "input",
        {
          type: "text",
          class: "cortex-thread__reply",
          placeholder: "Reply...",
          value: replyText,
          onInput: (e4) => setReplyText(e4.target.value),
          onKeyDown: handleReplyKeyDown
        }
      )
    ] });
  }

  // src/browser/components/CommentPin.tsx
  function sourceSelector(source) {
    return `[data-cortex-source="${CSS.escape(source)}"]`;
  }
  function CommentPin({ annotations, commentMode, channel, onReply }) {
    let [selectedPinId, setSelectedPinId] = d2(null), [pinTarget, setPinTarget] = d2(null), [pinInputPos, setPinInputPos] = d2({ x: 0, y: 0 }), [pinText, setPinText] = d2(""), [positions, setPositions] = d2(/* @__PURE__ */ new Map());
    y2(() => {
      if (annotations.length === 0) {
        setPositions(/* @__PURE__ */ new Map());
        return;
      }
      function updatePositions() {
        let newPositions = /* @__PURE__ */ new Map();
        for (let ann of annotations) {
          if (!ann.pinPosition) continue;
          let el = document.querySelector(sourceSelector(ann.elementSource));
          if (!el) continue;
          let rect = el.getBoundingClientRect();
          rect.width === 0 || rect.height === 0 || newPositions.set(ann.id, {
            x: rect.left + ann.pinPosition.x * rect.width,
            y: rect.top + ann.pinPosition.y * rect.height
          });
        }
        setPositions(newPositions);
      }
      updatePositions();
      let handleScroll = () => requestAnimationFrame(updatePositions), handleResize = () => requestAnimationFrame(updatePositions);
      return window.addEventListener("scroll", handleScroll, !0), window.addEventListener("resize", handleResize), () => {
        window.removeEventListener("scroll", handleScroll, !0), window.removeEventListener("resize", handleResize);
      };
    }, [annotations]), y2(() => {
      if (!pinTarget) return;
      let INPUT_W = 200, INPUT_H = 32, PANEL_W = PANEL_WIDTH + 20, GAP = 8;
      function reposition() {
        let el = document.querySelector(sourceSelector(pinTarget.elementSource));
        if (!el) return;
        let rect = el.getBoundingClientRect(), vw = window.innerWidth, vh = window.innerHeight, x3 = rect.left + (rect.width - INPUT_W) / 2, y3 = rect.bottom + GAP;
        rect.bottom < 0 && (y3 = GAP), rect.top > vh && (y3 = vh - INPUT_H - GAP), x3 = Math.max(GAP, Math.min(x3, vw - INPUT_W - PANEL_W - GAP)), y3 = Math.max(GAP, Math.min(y3, vh - INPUT_H - GAP)), setPinInputPos({ x: x3, y: y3 });
      }
      reposition();
      let onScroll = () => requestAnimationFrame(reposition), onResize = () => requestAnimationFrame(reposition);
      return window.addEventListener("scroll", onScroll, !0), window.addEventListener("resize", onResize), () => {
        window.removeEventListener("scroll", onScroll, !0), window.removeEventListener("resize", onResize);
      };
    }, [pinTarget]), y2(() => {
      if (!commentMode) {
        setPinTarget(null), document.body.style.cursor = "";
        return;
      }
      document.body.style.cursor = "crosshair";
      function handleClick(e4) {
        let target = e4.target;
        if (!target || target.closest("[data-cortex-host]")) return;
        let source = target.getAttribute("data-cortex-source") || target.closest("[data-cortex-source]")?.getAttribute("data-cortex-source");
        if (!source) return;
        let el = document.querySelector(sourceSelector(source));
        if (!el) return;
        let rect = el.getBoundingClientRect();
        rect.width === 0 || rect.height === 0 || (e4.preventDefault(), e4.stopPropagation(), setPinTarget({ clickX: e4.clientX, clickY: e4.clientY, elementSource: source }));
      }
      return window.addEventListener("click", handleClick, !0), () => {
        window.removeEventListener("click", handleClick, !0), document.body.style.cursor = "";
      };
    }, [commentMode]);
    let handlePinSubmit = q2((e4) => {
      if (e4.key !== "Enter" || !pinText.trim() || !pinTarget) return;
      let el = document.querySelector(sourceSelector(pinTarget.elementSource));
      if (!el) return;
      let rect = el.getBoundingClientRect();
      rect.width === 0 || rect.height === 0 || (channel.send({
        type: "comment",
        elementSource: pinTarget.elementSource,
        text: pinText.trim(),
        pinPosition: {
          x: (pinTarget.clickX - rect.left) / rect.width,
          y: (pinTarget.clickY - rect.top) / rect.height
        }
      }), setPinText(""), setPinTarget(null));
    }, [pinText, pinTarget, channel]), pinnedAnnotations = annotations.filter((a4) => a4.pinPosition), selectedAnnotation = selectedPinId ? annotations.find((a4) => a4.id === selectedPinId) : null;
    return /* @__PURE__ */ u4(k, { children: [
      commentMode && /* @__PURE__ */ u4("div", { class: "cortex-pin--mode" }),
      pinnedAnnotations.map((ann) => {
        let pos = positions.get(ann.id);
        return pos ? /* @__PURE__ */ u4(
          "div",
          {
            class: "cortex-pin",
            style: { left: `${pos.x - 6}px`, top: `${pos.y - 6}px` },
            onClick: () => setSelectedPinId(selectedPinId === ann.id ? null : ann.id)
          },
          ann.id
        ) : null;
      }),
      selectedAnnotation && /* @__PURE__ */ u4("div", { class: "cortex-pin__thread", style: {
        left: `${(positions.get(selectedAnnotation.id)?.x ?? 0) + 16}px`,
        top: `${(positions.get(selectedAnnotation.id)?.y ?? 0) - 6}px`
      }, children: /* @__PURE__ */ u4(CommentThread, { annotation: selectedAnnotation, onReply }) }),
      pinTarget && /* @__PURE__ */ u4("div", { class: "cortex-pin__input", style: { left: `${pinInputPos.x}px`, top: `${pinInputPos.y}px` }, children: /* @__PURE__ */ u4(
        "input",
        {
          type: "text",
          class: "cortex-pin__input-field",
          placeholder: "Add comment...",
          value: pinText,
          onInput: (e4) => setPinText(e4.target.value),
          onKeyDown: handlePinSubmit,
          autoFocus: !0
        }
      ) })
    ] });
  }

  // src/browser/components/ActivityLog.tsx
  function formatTime(timestamp) {
    let d3 = new Date(timestamp);
    return `${d3.getHours().toString().padStart(2, "0")}:${d3.getMinutes().toString().padStart(2, "0")}`;
  }
  function entryIcon(type) {
    switch (type) {
      case "edit":
        return "\u270E";
      case "comment":
        return "\u{1F4AC}";
      case "status-change":
        return "\u2192";
      default:
        return "\u2022";
    }
  }
  function ActivityLog({ entries, visible, onClose }) {
    if (!visible) return null;
    let display = entries.slice(-100).reverse();
    return /* @__PURE__ */ u4("div", { class: "cortex-activity-log", children: [
      /* @__PURE__ */ u4("div", { class: "cortex-activity-log__header", children: [
        /* @__PURE__ */ u4("span", { children: "Activity" }),
        /* @__PURE__ */ u4("button", { type: "button", class: "cortex-activity-log__close", onClick: onClose, children: "\u2715" })
      ] }),
      /* @__PURE__ */ u4("div", { class: "cortex-activity-log__list", children: [
        display.length === 0 && /* @__PURE__ */ u4("div", { class: "cortex-activity-log__empty", children: "No activity yet" }),
        display.map((entry) => /* @__PURE__ */ u4("div", { class: "cortex-activity-log__entry", children: [
          /* @__PURE__ */ u4("span", { class: "cortex-activity-log__icon", children: entryIcon(entry.type) }),
          /* @__PURE__ */ u4("span", { class: "cortex-activity-log__desc", children: entry.description }),
          /* @__PURE__ */ u4("span", { class: "cortex-activity-log__time", children: formatTime(entry.timestamp) })
        ] }, entry.id))
      ] })
    ] });
  }

  // src/browser/components/ErrorToast.tsx
  function ErrorToast({ channel }) {
    let [toasts, setToasts] = d2([]), timers = A2(/* @__PURE__ */ new Map());
    function addToast(t4, autoDismissMs) {
      let id = Math.random().toString(36).slice(2);
      if (setToasts((prev) => [...prev, { ...t4, id }]), autoDismissMs) {
        let timer = setTimeout(() => removeToast(id), autoDismissMs);
        timers.current.set(id, timer);
      }
    }
    function removeToast(id) {
      setToasts((prev) => prev.filter((t4) => t4.id !== id));
      let timer = timers.current.get(id);
      timer && (clearTimeout(timer), timers.current.delete(id));
    }
    return y2(() => channel.onMessage((msg) => {
      if ((msg.type === "undo_sync_status" || msg.type === "redo_sync_status") && msg.status === "failed" && msg.reason_code !== "empty_stack") {
        let label = msg.type === "undo_sync_status" ? "Undo" : "Redo";
        addToast({ message: msg.reason ?? `${label} sync failed`, type: "error" }, 5e3);
      }
    }), [channel]), y2(() => () => {
      for (let t4 of timers.current.values()) clearTimeout(t4);
    }, []), toasts.length === 0 ? null : /* @__PURE__ */ u4("div", { role: "alert", "aria-live": "assertive", style: { padding: "8px", pointerEvents: "auto" }, children: toasts.map((toast) => /* @__PURE__ */ u4(
      "div",
      {
        "data-toast": toast.type,
        style: {
          padding: "8px 12px",
          marginBottom: "4px",
          borderRadius: "4px",
          fontSize: "12px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          background: toast.type === "error" ? "#fee2e2" : "#dcfce7",
          color: toast.type === "error" ? "#991b1b" : "#166534",
          border: `1px solid ${toast.type === "error" ? "#fca5a5" : "#86efac"}`
        },
        children: [
          /* @__PURE__ */ u4("span", { children: toast.message }),
          /* @__PURE__ */ u4(
            "button",
            {
              onClick: () => removeToast(toast.id),
              style: { background: "none", border: "none", cursor: "pointer", color: "inherit", fontSize: "14px", padding: "0 0 0 8px" },
              "aria-label": "Dismiss",
              children: "x"
            }
          )
        ]
      },
      toast.id
    )) });
  }

  // src/browser/components/CapabilityBanner.tsx
  function CapabilityBanner({ systems }) {
    let [dismissed, setDismissed] = d2(!1);
    return dismissed || systems.length === 0 ? null : /* @__PURE__ */ u4(
      "div",
      {
        role: "status",
        "aria-live": "polite",
        style: {
          padding: "8px",
          pointerEvents: "auto"
        },
        children: /* @__PURE__ */ u4(
          "div",
          {
            style: {
              padding: "10px 12px",
              borderRadius: "4px",
              fontSize: "12px",
              lineHeight: "1.4",
              background: "#eff6ff",
              color: "#1e40af",
              border: "1px solid #93c5fd",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "flex-start",
              gap: "8px"
            },
            children: [
              /* @__PURE__ */ u4("div", { children: systems.map((sys) => /* @__PURE__ */ u4("div", { style: { marginBottom: systems.length > 1 ? "4px" : 0 }, children: [
                /* @__PURE__ */ u4("strong", { children: sys.name }),
                sys.reason ? `: ${sys.reason}` : sys.status === "preview-only" ? ": visual preview active \u2014 file writes not yet available." : sys.status === "ai-required" ? ": editing requires Claude Code." : ""
              ] }, sys.name)) }),
              /* @__PURE__ */ u4(
                "button",
                {
                  onClick: () => setDismissed(!0),
                  style: {
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    color: "#1e40af",
                    fontSize: "14px",
                    padding: "0",
                    flexShrink: 0
                  },
                  "aria-label": "Dismiss capability notice",
                  children: "x"
                }
              )
            ]
          }
        )
      }
    );
  }

  // src/browser/components/NoAnnotationsBanner.tsx
  var SETUP_DOCS_URL = "https://github.com/zerofog/cortex#setup";
  function hasAnnotation() {
    return document.querySelector("[data-cortex-source]") !== null;
  }
  function NoAnnotationsBanner() {
    let [dismissed, setDismissed] = d2(!1), [hidden, setHidden] = d2(() => hasAnnotation()), bannerRef = A2(null);
    return y2(() => {
      if (hidden || dismissed) return;
      let observer = new MutationObserver(() => {
        hasAnnotation() && setHidden(!0);
      });
      return observer.observe(document.body, { childList: !0, subtree: !0 }), () => observer.disconnect();
    }, [hidden, dismissed]), y2(() => {
      if (hidden || dismissed) return;
      let banner = bannerRef.current;
      if (!banner) return;
      let root = document.documentElement, prevPadding = root.style.paddingTop, prevTransition = root.style.transition, prevHeightVar = root.style.getPropertyValue("--cx-banner-height"), prevTransformVar = root.style.getPropertyValue("--cx-banner-transform"), px = `${banner.getBoundingClientRect().height}px`;
      return root.style.transition = "padding-top 200ms ease-out", root.style.paddingTop = px, root.style.setProperty("--cx-banner-height", px), root.style.setProperty("--cx-banner-transform", `translateY(${px})`), () => {
        root.style.paddingTop = prevPadding, root.style.transition = prevTransition, prevHeightVar ? root.style.setProperty("--cx-banner-height", prevHeightVar) : root.style.removeProperty("--cx-banner-height"), prevTransformVar ? root.style.setProperty("--cx-banner-transform", prevTransformVar) : root.style.removeProperty("--cx-banner-transform");
      };
    }, [hidden, dismissed]), hidden || dismissed ? null : /* @__PURE__ */ u4(
      "div",
      {
        ref: bannerRef,
        "data-banner-id": "no-annotations",
        class: "cortex-no-annotations-banner",
        role: "alert",
        "aria-live": "assertive",
        children: [
          /* @__PURE__ */ u4("div", { class: "cortex-no-annotations-banner__body", children: [
            /* @__PURE__ */ u4("span", { class: "cortex-no-annotations-banner__title", children: "No editable elements detected" }),
            /* @__PURE__ */ u4("span", { class: "cortex-no-annotations-banner__desc", children: [
              "Cortex needs the Vite plugin to add source annotations to your components.",
              " ",
              /* @__PURE__ */ u4(
                "a",
                {
                  href: SETUP_DOCS_URL,
                  target: "_blank",
                  rel: "noopener noreferrer",
                  class: "cortex-no-annotations-banner__link",
                  children: "Setup guide"
                }
              )
            ] })
          ] }),
          /* @__PURE__ */ u4(
            "button",
            {
              type: "button",
              class: "cortex-no-annotations-banner__dismiss",
              "aria-label": "Dismiss",
              onClick: (e4) => {
                e4.stopPropagation(), setDismissed(!0);
              },
              children: /* @__PURE__ */ u4(X, { size: 14 })
            }
          )
        ]
      }
    );
  }

  // src/browser/components/TooltipLayer.tsx
  var TOOLTIP_ID = "cortex-tooltip", DEFAULT_DELAY_MS = 200, TOOLTIP_OFFSET_PX = 6, DEFAULT_PLACEMENT = "top", VALID_PLACEMENTS = [
    "top",
    "top-start",
    "top-end",
    "right",
    "right-start",
    "right-end",
    "bottom",
    "bottom-start",
    "bottom-end",
    "left",
    "left-start",
    "left-end"
  ];
  function isElement2(value) {
    return value instanceof Element;
  }
  function isDisabledTooltipTarget(target) {
    return target.getAttribute("aria-disabled") === "true" ? !0 : "disabled" in target && !!target.disabled;
  }
  function resolveTooltipTarget(target) {
    let element = isElement2(target) ? target : target instanceof Node && isElement2(target.parentElement) ? target.parentElement : null;
    for (; element; ) {
      if (element instanceof HTMLElement && element.hasAttribute("data-tooltip") && element.dataset.tooltip?.trim() && !isDisabledTooltipTarget(element))
        return element;
      element = element.parentElement;
    }
    return null;
  }
  function isPlacement(value) {
    return value !== void 0 && VALID_PLACEMENTS.includes(value);
  }
  function readPlacement(anchor) {
    let placement = anchor.dataset.tooltipPlacement;
    return isPlacement(placement) ? placement : DEFAULT_PLACEMENT;
  }
  function removeDescribedByToken(anchor) {
    let current = anchor.getAttribute("aria-describedby");
    if (!current) return;
    let next = current.split(/\s+/).filter((token) => token && token !== TOOLTIP_ID);
    next.length > 0 ? anchor.setAttribute("aria-describedby", next.join(" ")) : anchor.removeAttribute("aria-describedby");
  }
  function getFallbackPosition(anchor, floating, placement) {
    let rect = anchor.getBoundingClientRect(), floatingWidth = floating.offsetWidth, floatingHeight = floating.offsetHeight, [side, alignment] = placement.split("-"), left, top;
    return side === "top" || side === "bottom" ? (alignment === "start" ? left = rect.left : alignment === "end" ? left = rect.right - floatingWidth : left = rect.left + (rect.width - floatingWidth) / 2, top = side === "bottom" ? rect.bottom + TOOLTIP_OFFSET_PX : rect.top - floatingHeight - TOOLTIP_OFFSET_PX) : (left = side === "right" ? rect.right + TOOLTIP_OFFSET_PX : rect.left - floatingWidth - TOOLTIP_OFFSET_PX, alignment === "start" ? top = rect.top : alignment === "end" ? top = rect.bottom - floatingHeight : top = rect.top + (rect.height - floatingHeight) / 2), { left, top };
  }
  function TooltipLayer({ shadowRoot: shadowRoot2, delayMs = DEFAULT_DELAY_MS }) {
    let [tooltip, setTooltip] = d2(null), tooltipRef = A2(null), showTimerRef = A2(null), activeAnchorRef = A2(null), activeTriggerRef = A2(null);
    return y2(() => {
      activeAnchorRef.current = tooltip?.anchor ?? null, activeTriggerRef.current = tooltip?.trigger ?? null;
    }, [tooltip]), y2(() => {
      if (!tooltip) return;
      let describedElement = tooltip.describedElement, tokens = describedElement.getAttribute("aria-describedby")?.split(/\s+/).filter(Boolean) ?? [];
      return tokens.includes(TOOLTIP_ID) || describedElement.setAttribute("aria-describedby", [...tokens, TOOLTIP_ID].join(" ")), () => removeDescribedByToken(describedElement);
    }, [tooltip]), y2(() => {
      if (!tooltip) return;
      let floating = tooltipRef.current;
      if (!floating) return;
      let cancelled = !1, update = () => {
        computePosition2(tooltip.anchor, floating, {
          strategy: "fixed",
          placement: tooltip.placement,
          middleware: [offset2(TOOLTIP_OFFSET_PX), flip2(), shift2({ padding: TOOLTIP_OFFSET_PX })]
        }).then(({ x: x3, y: y3 }) => {
          cancelled || (floating.style.left = `${x3}px`, floating.style.top = `${y3}px`);
        }).catch((err) => {
          if (cancelled) return;
          console.warn("[cortex] Tooltip positioning failed:", err instanceof Error ? err.message : err);
          let { left, top } = getFallbackPosition(tooltip.anchor, floating, tooltip.placement);
          floating.style.left = `${left}px`, floating.style.top = `${top}px`;
        });
      }, cleanupAutoUpdate = autoUpdate(tooltip.anchor, floating, update);
      return () => {
        cancelled = !0;
        try {
          cleanupAutoUpdate();
        } catch (err) {
          console.warn("[cortex] Tooltip autoUpdate cleanup failed:", err instanceof Error ? err.message : err);
        }
      };
    }, [tooltip]), y2(() => {
      let clearShowTimer = () => {
        showTimerRef.current && (clearTimeout(showTimerRef.current), showTimerRef.current = null);
      }, hide2 = () => {
        clearShowTimer(), activeAnchorRef.current = null, activeTriggerRef.current = null, setTooltip(null);
      }, scheduleShow = (anchor, describedElement, trigger) => {
        let text = anchor.dataset.tooltip?.trim();
        if (!text) {
          hide2();
          return;
        }
        if (activeAnchorRef.current === anchor) {
          clearShowTimer(), setTooltip((current) => current && current.anchor === anchor ? { anchor, describedElement, text, placement: readPlacement(anchor), trigger } : current);
          return;
        }
        clearShowTimer(), showTimerRef.current = setTimeout(() => {
          showTimerRef.current = null, setTooltip({ anchor, describedElement, text, placement: readPlacement(anchor), trigger });
        }, delayMs);
      }, handlePointerOver = (event) => {
        let anchor = resolveTooltipTarget(event.target);
        if (!anchor || !shadowRoot2.contains(anchor)) {
          activeTriggerRef.current === "pointer" && hide2();
          return;
        }
        scheduleShow(anchor, anchor, "pointer");
      }, handlePointerOut = (event) => {
        if (activeTriggerRef.current === "focus") return;
        let anchor = activeAnchorRef.current ?? resolveTooltipTarget(event.target);
        if (!anchor) {
          hide2();
          return;
        }
        let relatedTarget = event.relatedTarget;
        isElement2(relatedTarget) && anchor.contains(relatedTarget) || hide2();
      }, handleFocusIn = (event) => {
        let anchor = resolveTooltipTarget(event.target);
        if (!anchor || !shadowRoot2.contains(anchor)) return;
        let describedElement = event.target instanceof HTMLElement ? event.target : anchor;
        scheduleShow(anchor, describedElement, "focus");
      }, handleFocusOut = (event) => {
        let anchor = activeAnchorRef.current ?? resolveTooltipTarget(event.target);
        if (!anchor) {
          hide2();
          return;
        }
        let relatedTarget = event.relatedTarget, nextFocused = isElement2(relatedTarget) ? relatedTarget : shadowRoot2.activeElement;
        isElement2(nextFocused) && nextFocused !== event.target && anchor.contains(nextFocused) || hide2();
      }, handlePointerDown = () => hide2(), handleKeyDown = (event) => {
        event.key === "Escape" && hide2();
      };
      return shadowRoot2.addEventListener("pointerover", handlePointerOver), shadowRoot2.addEventListener("pointerout", handlePointerOut), shadowRoot2.addEventListener("focusin", handleFocusIn), shadowRoot2.addEventListener("focusout", handleFocusOut), shadowRoot2.addEventListener("pointerdown", handlePointerDown, { capture: !0 }), shadowRoot2.addEventListener("keydown", handleKeyDown, { capture: !0 }), () => {
        clearShowTimer(), shadowRoot2.removeEventListener("pointerover", handlePointerOver), shadowRoot2.removeEventListener("pointerout", handlePointerOut), shadowRoot2.removeEventListener("focusin", handleFocusIn), shadowRoot2.removeEventListener("focusout", handleFocusOut), shadowRoot2.removeEventListener("pointerdown", handlePointerDown, { capture: !0 }), shadowRoot2.removeEventListener("keydown", handleKeyDown, { capture: !0 });
      };
    }, [delayMs, shadowRoot2]), tooltip ? /* @__PURE__ */ u4(
      "div",
      {
        ref: tooltipRef,
        id: TOOLTIP_ID,
        class: "cortex-tooltip",
        role: "tooltip",
        style: { position: "fixed" },
        children: tooltip.text
      }
    ) : null;
  }

  // src/browser/hooks/useCanvasZoom.ts
  var MIN_ZOOM = 0.75, MAX_ZOOM = 1, ZOOM_STEP = 0.05, CANVAS_MIN_MARGIN = 48, FRICTION = 0.75, STOP_THRESHOLD = 0.1, LINE_HEIGHT = 40;
  function normalizeDelta(e4) {
    let mult = e4.deltaMode === 1 ? LINE_HEIGHT : e4.deltaMode === 2 ? window.innerHeight : 1;
    return { dx: e4.deltaX * mult, dy: e4.deltaY * mult };
  }
  function clamp5(v3, min2, max2) {
    return Math.max(min2, Math.min(max2, v3));
  }
  function stepMomentum(state, dt, bounds) {
    let cappedDt = Math.min(dt, 2.9999400011999757), friction = Math.pow(FRICTION, cappedDt), vx = state.velocity.x * friction, vy = state.velocity.y * friction, px = state.pan.x + vx, py = state.pan.y + vy, clampedPx = clamp5(px, bounds.minX, bounds.maxX), clampedPy = clamp5(py, bounds.minY, bounds.maxY);
    return clampedPx !== px && (vx = 0), clampedPy !== py && (vy = 0), px = clampedPx, py = clampedPy, {
      state: { pan: { x: px, y: py }, velocity: { x: vx, y: vy } },
      shouldStop: Math.abs(vx) + Math.abs(vy) < STOP_THRESHOLD
    };
  }
  function computePanStep(pan, delta, bounds) {
    let targetX = pan.x - delta.dx, targetY = pan.y - delta.dy, clampedX = clamp5(targetX, bounds.minX, bounds.maxX), clampedY = clamp5(targetY, bounds.minY, bounds.maxY);
    return {
      pan: { x: clampedX, y: clampedY },
      clampedX: clampedX !== targetX,
      clampedY: clampedY !== targetY
    };
  }
  function useCanvasZoom(enabled) {
    let [scale, setScale] = d2(() => 0.85), scaleRef = A2(scale);
    scaleRef.current = scale;
    let spaceHeldRef = A2(!1), panRef = A2({ x: 0, y: 0 }), panStartRef = A2(null), vpRef = A2({ w: window.innerWidth, h: window.innerHeight }), momentumRafRef = A2(0);
    function cancelMomentum() {
      momentumRafRef.current && (cancelAnimationFrame(momentumRafRef.current), momentumRafRef.current = 0);
    }
    function clampPan() {
      let vpW = vpRef.current.w, vpH = vpRef.current.h, topMargin = Math.max(CANVAS_MIN_MARGIN, (vpH - cachedBodyH.current) / 2), maxX = (cachedBodyW.current + vpW) / 2, prevX = panRef.current.x, prevY = panRef.current.y;
      return panRef.current.x = clamp5(panRef.current.x, -maxX, maxX), panRef.current.y = clamp5(panRef.current.y, -(cachedBodyH.current + topMargin), vpH - topMargin), { clampedX: panRef.current.x !== prevX, clampedY: panRef.current.y !== prevY };
    }
    let wasEnabledRef = A2(!1), savedTransformRef = A2(""), savedOriginRef = A2(""), savedBoxShadowRef = A2(""), savedHtmlBgRef = A2(""), savedOverflowRef = A2("");
    function restoreSavedStyles() {
      wasEnabledRef.current && (document.body.style.transform = savedTransformRef.current, document.body.style.transformOrigin = savedOriginRef.current, document.body.style.boxShadow = savedBoxShadowRef.current, document.documentElement.style.backgroundColor = savedHtmlBgRef.current, document.documentElement.style.overflow = savedOverflowRef.current, wasEnabledRef.current = !1);
    }
    let cachedBodyH = A2(0), cachedBodyW = A2(0);
    function updateCachedDimensions(s3) {
      cachedBodyH.current = document.body.scrollHeight * s3, cachedBodyW.current = document.body.scrollWidth * s3;
    }
    function getArtboardColor() {
      let bg = getComputedStyle(document.body).backgroundColor;
      (bg === "transparent" || bg === "rgba(0, 0, 0, 0)") && (bg = getComputedStyle(document.documentElement).backgroundColor);
      let match = bg.match(/(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
      return match ? (0.299 * Number(match[1]) + 0.587 * Number(match[2]) + 0.114 * Number(match[3])) / 255 > 0.5 ? "#e5e5e5" : "#2a2a2a" : "#e5e5e5";
    }
    function applyStaticStyles() {
      document.body.style.transformOrigin = "50% 0", document.body.style.boxShadow = "0 0 0 1px rgba(0,0,0,0.06), 0 2px 16px rgba(0,0,0,0.1)", document.documentElement.style.overflow = "hidden", document.documentElement.style.backgroundColor = getArtboardColor();
    }
    function applyTransformPosition(s3) {
      let { x: x3, y: y3 } = panRef.current, vpH = vpRef.current.h, topMargin = Math.max(CANVAS_MIN_MARGIN, (vpH - cachedBodyH.current) / 2);
      document.body.style.transform = `translate(${x3}px, ${y3 + topMargin}px) scale(${s3})`, emitTransformUpdate();
    }
    return _2(() => (enabled && !wasEnabledRef.current ? (savedTransformRef.current = document.body.style.transform, savedOriginRef.current = document.body.style.transformOrigin, savedBoxShadowRef.current = document.body.style.boxShadow, savedHtmlBgRef.current = document.documentElement.style.backgroundColor, savedOverflowRef.current = document.documentElement.style.overflow, wasEnabledRef.current = !0, panRef.current = { x: 0, y: 0 }, applyStaticStyles()) : enabled || restoreSavedStyles(), () => {
      enabled && restoreSavedStyles();
    }), [enabled]), _2(() => {
      enabled && (updateCachedDimensions(scale), applyTransformPosition(scale));
    }, [enabled, scale]), y2(() => {
      if (!enabled) return;
      function handleResize() {
        vpRef.current = { w: window.innerWidth, h: window.innerHeight }, updateCachedDimensions(scaleRef.current), applyTransformPosition(scaleRef.current);
      }
      return window.addEventListener("resize", handleResize), () => window.removeEventListener("resize", handleResize);
    }, [enabled]), y2(() => {
      if (!enabled) return;
      let velocity = { x: 0, y: 0 }, lastTs = 0, disposed = !1;
      function currentBounds() {
        let vpW = vpRef.current.w, vpH = vpRef.current.h, topMargin = Math.max(CANVAS_MIN_MARGIN, (vpH - cachedBodyH.current) / 2), maxX = (cachedBodyW.current + vpW) / 2;
        return {
          minX: -maxX,
          maxX,
          minY: -(cachedBodyH.current + topMargin),
          maxY: vpH - topMargin
        };
      }
      function coastLoop(ts) {
        if (disposed) return;
        let dt = (ts - lastTs) / 16.667;
        lastTs = ts;
        let r4 = stepMomentum({ pan: panRef.current, velocity }, dt, currentBounds());
        if (panRef.current = r4.state.pan, velocity = r4.state.velocity, applyTransformPosition(scaleRef.current), r4.shouldStop) {
          momentumRafRef.current = 0;
          return;
        }
        momentumRafRef.current = requestAnimationFrame(coastLoop);
      }
      function handleWheel(e4) {
        if (e4.preventDefault(), cancelMomentum(), e4.metaKey || e4.ctrlKey) {
          let delta = e4.deltaY > 0 ? -ZOOM_STEP : ZOOM_STEP;
          setScale((s3) => clamp5(s3 + delta, MIN_ZOOM, MAX_ZOOM));
        } else {
          let { dx, dy } = normalizeDelta(e4), wheel = computePanStep(panRef.current, { dx, dy }, currentBounds());
          panRef.current = wheel.pan, applyTransformPosition(scaleRef.current), velocity.x = wheel.clampedX ? 0 : -dx, velocity.y = wheel.clampedY ? 0 : -dy, lastTs = performance.now(), momentumRafRef.current = requestAnimationFrame(coastLoop);
        }
      }
      return window.addEventListener("wheel", handleWheel, { passive: !1 }), () => {
        disposed = !0, cancelMomentum(), window.removeEventListener("wheel", handleWheel);
      };
    }, [enabled]), y2(() => {
      if (!enabled) return;
      let savedCursor = "";
      function handleKeyDown(e4) {
        e4.code === "Space" && !spaceHeldRef.current && !isInputFocused() && (spaceHeldRef.current = !0, savedCursor = document.body.style.cursor, document.body.style.cursor = "grab", e4.preventDefault());
      }
      function handleKeyUp(e4) {
        e4.code === "Space" && (spaceHeldRef.current = !1, panStartRef.current = null, document.body.style.cursor = savedCursor);
      }
      function handlePointerDown(e4) {
        if (spaceHeldRef.current) {
          if (isOwnUI(e4)) return;
          cancelMomentum(), panStartRef.current = {
            x: e4.clientX,
            y: e4.clientY,
            panX: panRef.current.x,
            panY: panRef.current.y
          }, document.body.style.cursor = "grabbing", e4.preventDefault();
        }
      }
      function handlePointerMove(e4) {
        if (!panStartRef.current) return;
        let dx = e4.clientX - panStartRef.current.x, dy = e4.clientY - panStartRef.current.y;
        panRef.current = {
          x: panStartRef.current.panX + dx,
          y: panStartRef.current.panY + dy
        }, clampPan(), applyTransformPosition(scaleRef.current);
      }
      function handlePointerUp() {
        panStartRef.current && spaceHeldRef.current && (document.body.style.cursor = "grab"), panStartRef.current = null;
      }
      return window.addEventListener("keydown", handleKeyDown), window.addEventListener("keyup", handleKeyUp), window.addEventListener("pointerdown", handlePointerDown), window.addEventListener("pointermove", handlePointerMove), window.addEventListener("pointerup", handlePointerUp), window.addEventListener("pointercancel", handlePointerUp), () => {
        window.removeEventListener("keydown", handleKeyDown), window.removeEventListener("keyup", handleKeyUp), window.removeEventListener("pointerdown", handlePointerDown), window.removeEventListener("pointermove", handlePointerMove), window.removeEventListener("pointerup", handlePointerUp), window.removeEventListener("pointercancel", handlePointerUp), document.body.style.cursor = savedCursor, spaceHeldRef.current = !1, panStartRef.current = null;
      };
    }, [enabled]), { scale };
  }

  // src/browser/page-color-chips.ts
  var COLOR_UTILITY_PREFIXES = [
    "bg-",
    "text-",
    "border-",
    "ring-offset-",
    "ring-",
    "outline-",
    "decoration-",
    "caret-",
    "accent-",
    "fill-",
    "stroke-"
  ], BG_NON_COLOR_PREFIXES2 = [
    "bg-opacity",
    "bg-clip",
    "bg-gradient",
    "bg-no-repeat",
    "bg-repeat",
    "bg-cover",
    "bg-contain",
    "bg-center",
    "bg-bottom",
    "bg-top",
    "bg-left",
    "bg-right",
    "bg-fixed",
    "bg-local",
    "bg-scroll",
    "bg-origin",
    "bg-blend",
    "bg-none"
  ], INACTIVE_STATE_VARIANTS = /* @__PURE__ */ new Set([
    "active",
    "autofill",
    "checked",
    "disabled",
    "empty",
    "enabled",
    "even",
    "first",
    "focus",
    "focus-visible",
    "focus-within",
    "hover",
    "in-range",
    "indeterminate",
    "invalid",
    "last",
    "only",
    "open",
    "optional",
    "out-of-range",
    "odd",
    "placeholder-shown",
    "read-only",
    "required",
    "target",
    "valid",
    "visited"
  ]), MEDIA_VARIANT_QUERIES = {
    sm: "(min-width: 40rem)",
    md: "(min-width: 48rem)",
    lg: "(min-width: 64rem)",
    xl: "(min-width: 80rem)",
    "2xl": "(min-width: 96rem)",
    portrait: "(orientation: portrait)",
    landscape: "(orientation: landscape)",
    "motion-safe": "(prefers-reduced-motion: no-preference)",
    "motion-reduce": "(prefers-reduced-motion: reduce)",
    "contrast-more": "(prefers-contrast: more)",
    "contrast-less": "(prefers-contrast: less)",
    print: "print"
  };
  function markPageColorChips(chips, root = document) {
    if (chips.length === 0) return [];
    let usedColorNames = collectPageColorNames(root), usedHexes = /* @__PURE__ */ new Set();
    for (let chip of chips)
      [chip.name, ...chip.aliases ?? []].some((name) => usedColorNames.has(name)) && usedHexes.add(chip.hex);
    return chips.map((chip) => ({
      ...chip,
      source: usedHexes.has(chip.hex) ? "page" : "theme"
    }));
  }
  function collectPageColorNames(root = document) {
    let doc = root instanceof Document ? root : root.ownerDocument ?? document, scope = root instanceof Document ? root.body ?? root.documentElement : root, used = /* @__PURE__ */ new Set();
    for (let element of elementsInScope(scope)) {
      if (element.closest("[data-cortex-host]")) continue;
      let className = typeof element.className == "string" ? element.className : "";
      for (let token of className.split(/\s+/)) {
        let name = colorNameFromUtility(token, doc);
        name && used.add(name);
      }
    }
    return used;
  }
  function elementsInScope(scope) {
    let elements = [...scope.querySelectorAll("*")];
    return scope instanceof Element && elements.unshift(scope), elements;
  }
  function colorNameFromUtility(token, doc) {
    let base = activeBaseToken(token, doc);
    if (!base) return null;
    for (let prefix of COLOR_UTILITY_PREFIXES) {
      if (!base.startsWith(prefix)) continue;
      if (prefix === "bg-" && BG_NON_COLOR_PREFIXES2.some((excluded) => base.startsWith(excluded)))
        return null;
      let suffix = base.slice(prefix.length);
      return suffix && (suffix.split("/")[0] ?? "") || null;
    }
    return null;
  }
  function activeBaseToken(token, doc) {
    let segments = splitVariantSegments(token), base = segments[segments.length - 1] ?? "", variants = segments.slice(0, -1);
    for (let variant of variants)
      if (!variantAppliesNow(variant, doc)) return null;
    return base;
  }
  function splitVariantSegments(token) {
    let segments = [], bracketDepth = 0, start = 0;
    for (let i4 = 0; i4 < token.length; i4++) {
      let ch = token[i4];
      ch === "[" ? bracketDepth++ : ch === "]" ? bracketDepth = Math.max(0, bracketDepth - 1) : ch === ":" && bracketDepth === 0 && (segments.push(token.slice(start, i4)), start = i4 + 1);
    }
    return segments.push(token.slice(start)), segments;
  }
  function variantAppliesNow(variant, doc) {
    if (variant === "dark") return doc.documentElement.classList.contains("dark");
    if (variant === "light") return doc.documentElement.classList.contains("light");
    if (INACTIVE_STATE_VARIANTS.has(variant) || variant.startsWith("group-") || variant.startsWith("peer-")) return !1;
    let query = MEDIA_VARIANT_QUERIES[variant];
    return query ? doc.defaultView?.matchMedia?.(query).matches ?? !1 : !1;
  }

  // src/browser/components/CortexApp.tsx
  function sameColorChipSources(prev, next) {
    if (!prev || prev.length !== next.length) return !1;
    for (let i4 = 0; i4 < next.length; i4++) {
      let a4 = prev[i4], b = next[i4];
      if (!a4 || !b || a4.name !== b.name || a4.hex !== b.hex || a4.source !== b.source) return !1;
    }
    return !0;
  }
  function isCortexHostMutation(record) {
    return !!(record.target instanceof Element ? record.target : record.target.parentElement)?.closest("[data-cortex-host]");
  }
  function CortexApp({ channel, shadowRoot: shadowRoot2, initialActive }) {
    let [hoveredElement, setHoveredElement] = d2(null), [selectedElements, setSelectedElementsState] = d2([]), selectedElement = selectedElements[0] ?? null, [hmrAppliedVersion, setHmrAppliedVersion] = d2(0), [hmrEventVersion, setHmrEventVersion] = d2(0), [swatches, setSwatches] = d2(void 0), [textComponents, setTextComponents] = d2(void 0), [colorChips, setColorChips] = d2(void 0), colorChipThemeRef = A2(void 0), [spacingTokens, setSpacingTokens] = d2(void 0), [activeState, setActiveState] = d2("default"), [availableStates, setAvailableStates] = d2(void 0), [hasBefore, setHasBefore] = d2(!1), [hasAfter, setHasAfter] = d2(!1), [hoverEnabled, setHoverEnabled] = d2(!0), overrideRef = A2(null), commandStackRef = A2(null), flushCommitRef = A2(null), undoInProgressRef = A2(!1), undoGenRef = A2(0), [annotations, setAnnotations] = d2(/* @__PURE__ */ new Map()), [agentConnected, setAgentConnected] = d2(!1), [connectionStatus, setConnectionStatus] = d2({ status: "connected" }), [activityEntries, setActivityEntries] = d2([]), [staleOverrideCount, setStaleOverrideCount] = d2(0), [staleSources, setStaleSources] = d2(/* @__PURE__ */ new Set()), [hmrChangedFiles, setHmrChangedFiles] = d2([]), [commentMode, setCommentMode] = d2(!1), [showActivity, setShowActivity] = d2(!1), [capabilitySystems, setCapabilitySystems] = d2([]), editDispatchRef = A2(/* @__PURE__ */ new Map()), [editErrors, setEditErrors] = d2(/* @__PURE__ */ new Map()), clearEditError = q2((key) => {
      if (setEditErrors((prev) => {
        if (!prev.has(key)) return prev;
        let next = new Map(prev);
        return next.delete(key), next;
      }), reducerStateRef.current.editErrors.has(key)) {
        let nextErrors = new Map(reducerStateRef.current.editErrors);
        nextErrors.delete(key), reducerStateRef.current = { ...reducerStateRef.current, editErrors: nextErrors };
      }
    }, []), commentModeRef = A2(!1);
    commentModeRef.current = commentMode;
    let [activityCount, setActivityCount] = d2(0), [active, setActive] = d2(initialActive ?? !1), selectionRef = A2(null), selectedElementRef = A2(null);
    selectedElementRef.current = selectedElement;
    let selectionMetadataRef = A2([]), hmrAppliedVersionRef = A2(0), handleExitRef = A2(null), editDispatchHandlerRef = A2(null), stageEditRef = A2(null), commitEditRef = A2(null), bufferListRef = A2(null), dispatchRef = A2(null), reducerStateRef = A2({
      ...initialCortexAppReducerState,
      active: initialActive ?? !1
    });
    y2(() => {
    }, []);
    let refreshPageColorChips = q2(() => {
      let chips = colorChipThemeRef.current;
      if (!chips) return;
      let next = markPageColorChips(chips);
      setColorChips((prev) => sameColorChipSources(prev, next) ? prev : next);
    }, []), { position: panelPosition, isSnapping: panelSnapping, setPosition: setPanelPosition, snap: panelSnap } = useSnapToEdge(), { handlePointerDown: panelPointerDown, handlePointerMove: panelPointerMove, handlePointerUp: panelPointerUp, handlePointerCancel: panelPointerCancel } = useDrag({
      onDrag(x3, y3) {
        setPanelPosition({ x: x3, y: y3 });
      },
      onDragEnd() {
        panelSnap();
      }
    });
    useCanvasZoom(!1);
    let setSelection = q2((elements, action = "replace") => {
      let expanded = expandSharedSource(elements);
      setSelectedElementsState((prev) => {
        let next = applySelectionUpdate(prev, expanded, action);
        return next !== prev && (selectionMetadataRef.current = next.map((el) => captureSelectionMetadata(el))), next;
      });
    }, []), setSelectionWithMetadata = q2((el) => {
      setSelection(el ? [el] : [], "replace");
    }, [setSelection]);
    y2(() => {
      let disposed = !1, overrideManager = new CSSOverrideManager();
      overrideRef.current = overrideManager;
      let commandStack = new CommandStack();
      commandStackRef.current = commandStack;
      let disposeStale = overrideManager.onStale((staleSet) => {
        setStaleOverrideCount(staleSet.size), setStaleSources(new Set(staleSet));
      }), selectionHandle = initSelection(
        shadowRoot2,
        setHoveredElement,
        setSelection
      ), debugFlag = !!window.__CORTEX_DEBUG_OVERRIDES__;
      selectionHandle.setDesignMode(!1), selectionRef.current = selectionHandle;
      let applyReducerState = (next, prev) => {
        next.active !== prev.active && setActive(next.active), next.swatches !== prev.swatches && setSwatches(next.swatches), next.textComponents !== prev.textComponents && setTextComponents(next.textComponents), next.colorChips !== prev.colorChips && (colorChipThemeRef.current = next.colorChips, setColorChips(next.colorChips ? markPageColorChips(next.colorChips) : next.colorChips)), next.spacingTokens !== prev.spacingTokens && setSpacingTokens(next.spacingTokens), next.capabilitySystems !== prev.capabilitySystems && setCapabilitySystems(next.capabilitySystems), next.activityCount !== prev.activityCount && setActivityCount(next.activityCount), next.editErrors !== prev.editErrors && setEditErrors(next.editErrors), next.annotations !== prev.annotations && setAnnotations(next.annotations), next.agentConnected !== prev.agentConnected && setAgentConnected(next.agentConnected), next.activityEntries !== prev.activityEntries && setActivityEntries(next.activityEntries);
      }, runEffect = (effect) => {
        if (!disposed)
          switch (effect.type) {
            case "send":
              channel.send(effect.message);
              return;
            case "log_warning":
              console.warn(effect.message);
              return;
            case "invoke_exit":
              handleExitRef.current?.();
              return;
            case "apply_hmr_verified":
              overrideRef.current?.handleHMRVerified(effect.editId, effect.match, effect.kind);
              return;
            default: {
              let _exhaustive = effect;
              throw new Error(`Unhandled cortex-app effect: ${JSON.stringify(_exhaustive)}`);
            }
          }
      }, dispatch = (action) => {
        if (disposed) return;
        let prev = reducerStateRef.current, { state: next, effects } = cortexAppReducer(prev, action);
        next !== prev && (reducerStateRef.current = next, applyReducerState(next, prev));
        for (let effect of effects)
          try {
            runEffect(effect);
          } catch (err) {
            console.warn("[cortex] runEffect failed", err);
          }
      };
      dispatchRef.current = dispatch;
      let popDispatchEntry = (editId) => {
        let entry = editDispatchRef.current.get(editId);
        return entry && editDispatchRef.current.delete(editId), entry;
      }, unsubscribe = channel.onMessage((msg) => {
        if (msg.type === "edit_status") {
          msg.status === "done" ? dispatch({ type: "edit_status", status: "done", editId: msg.editId, dispatch: popDispatchEntry(msg.editId) }) : msg.status === "failed" && dispatch({ type: "edit_status", status: "failed", editId: msg.editId, reason: msg.reason, dispatch: popDispatchEntry(msg.editId) });
          return;
        }
        if (msg.type === "hmr-applied") {
          overrideRef.current?.onHMRApplied();
          let rawFiles = msg.files, files = Array.isArray(rawFiles) && rawFiles.every((f5) => typeof f5 == "string") ? rawFiles : void 0;
          setHmrEventVersion((v3) => v3 + 1);
          let shouldRefresh = shouldRefreshOnHMR(files, selectedElementRef.current);
          shouldRefresh && setHmrAppliedVersion((v3) => v3 + 1), setHmrChangedFiles(files ?? []);
          let attemptRefreshPageColorChips = () => {
            disposed || refreshPageColorChips();
          };
          attemptRefreshPageColorChips(), requestAnimationFrame(() => requestAnimationFrame(attemptRefreshPageColorChips)), setTimeout(attemptRefreshPageColorChips, 100), setTimeout(attemptRefreshPageColorChips, 250);
          let attemptReResolve = () => {
            if (!disposed)
              try {
                let current = selectedElementRef.current, meta = selectionMetadataRef.current[0] ?? null;
                if (!current || !meta) return;
                let resolved = reResolveSelection(meta);
                if (resolved !== current) {
                  setSelectionWithMetadata(resolved);
                  return;
                }
                if (resolved) {
                  let newMeta = captureSelectionMetadata(resolved), indexShifted = newMeta.index !== meta.index, updatedMeta = [...selectionMetadataRef.current];
                  updatedMeta[0] = newMeta, selectionMetadataRef.current = updatedMeta, indexShifted && setHmrAppliedVersion((v3) => v3 + 1);
                }
              } catch (err) {
                console.warn("[cortex] reResolveSelection failed", err), setSelectionWithMetadata(null);
              }
          };
          shouldRefresh && (attemptReResolve(), requestAnimationFrame(() => requestAnimationFrame(attemptReResolve)), setTimeout(attemptReResolve, 100), setTimeout(attemptReResolve, 250));
          return;
        }
        msg.type !== "error" && msg.type !== "staged-edits-discard" && msg.type !== "staged-edits-acked" && dispatch(msg);
      });
      channel.send({ type: "init", sessionId: window.__CORTEX_SESSION_ID__ });
      let wasDisconnected = !1, reconnectedTimer, unsubStatus = channel.onConnectionChange((state) => {
        state.status === "connected" && wasDisconnected ? (setConnectionStatus({ status: "reconnected" }), reconnectedTimer !== void 0 && clearTimeout(reconnectedTimer), reconnectedTimer = setTimeout(() => {
          setConnectionStatus({ status: "connected" }), reconnectedTimer = void 0;
        }, 2e3), wasDisconnected = !1) : ((state.status === "reconnecting" || state.status === "disconnected") && (wasDisconnected = !0), setConnectionStatus(state), reconnectedTimer !== void 0 && (clearTimeout(reconnectedTimer), reconnectedTimer = void 0));
      }), unsubDivergence = onDivergence((d3) => dispatch({ type: "divergence", diagnostic: d3 }));
      return () => {
        disposed = !0, unsubscribe(), unsubStatus(), unsubDivergence(), disposeStale(), reconnectedTimer !== void 0 && clearTimeout(reconnectedTimer), selectionHandle.cleanup(), selectionRef.current = null, overrideManager.dispose(), overrideRef.current = null, commandStack.clear(), commandStackRef.current = null, dispatchRef.current = null;
      };
    }, [channel, shadowRoot2]), y2(() => {
      let raf = null, scheduleRefresh = () => {
        raf === null && (raf = requestAnimationFrame(() => {
          raf = null, refreshPageColorChips();
        }));
      }, handleMutations = (records) => {
        records.some((record) => !isCortexHostMutation(record)) && scheduleRefresh();
      }, observer = new MutationObserver(handleMutations);
      return observer.observe(document.documentElement, { attributes: !0, attributeFilter: ["class"] }), document.body && observer.observe(document.body, {
        attributes: !0,
        attributeFilter: ["class"],
        childList: !0,
        subtree: !0
      }), () => {
        observer.disconnect(), raf !== null && cancelAnimationFrame(raf);
      };
    }, [refreshPageColorChips]), y2(() => {
      if (overrideRef.current?.clearStateOverrides(), !selectedElement) {
        setAvailableStates(void 0), setActiveState("default"), setHasBefore(!1), setHasAfter(!1);
        return;
      }
      let states = detectStates(selectedElement);
      setAvailableStates(states), setActiveState("default");
      let beforeContent = getComputedStyle(selectedElement, "::before").content, afterContent = getComputedStyle(selectedElement, "::after").content;
      setHasBefore(beforeContent !== "none" && beforeContent !== ""), setHasAfter(afterContent !== "none" && afterContent !== "");
      let rect = selectedElement.getBoundingClientRect();
      (rect.top < 0 || rect.bottom > window.innerHeight || rect.left < 0 || rect.right > window.innerWidth) && selectedElement.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }, [selectedElement]);
    let handleStateChange = q2((state) => {
      let manager = overrideRef.current;
      if (!(!manager || !selectedElement)) {
        if (state === "default")
          manager.clearStateOverrides(), setActiveState(state);
        else if (availableStates) {
          let declarations = availableStates[state];
          if (declarations.size > 0) {
            let source = selectedElement.getAttribute("data-cortex-source");
            source ? (manager.setStateOverrides(source, declarations), setActiveState(state)) : console.warn("[cortex] Cannot force state: element missing data-cortex-source");
          }
        }
      }
    }, [selectedElement, availableStates]), handleCommentMode = q2(() => setCommentMode((m3) => !m3), []), handleActivityToggle = q2(() => {
      setShowActivity((prev) => (prev || (setActivityCount(0), reducerStateRef.current = { ...reducerStateRef.current, activityCount: 0 }), !prev));
    }, []), handleCommentReply = q2((annotationId, text) => {
      channel.send({ type: "comment-reply", annotationId, text });
    }, [channel]), handleSelectElement = q2(
      (el) => setSelectionWithMetadata(el),
      [setSelectionWithMetadata]
    ), handleToggleHover = q2(() => setHoverEnabled((v3) => !v3), []), handleEditDispatch = q2((editId, source, property, value) => {
      let map = editDispatchRef.current;
      if (map.size >= 500) {
        let firstKey = map.keys().next().value;
        firstKey && map.delete(firstKey);
      }
      map.set(editId, { source, property, value }), clearEditError(`${source}\0${property}`);
    }, [clearEditError]);
    editDispatchHandlerRef.current = handleEditDispatch;
    let handleDismissError = clearEditError, handleExit = q2(() => {
      setCommentMode(!1), setSelectionWithMetadata(null), setActive(!1), reducerStateRef.current = { ...reducerStateRef.current, active: !1 }, channel.send({ type: "cortex-closed" });
    }, [channel, setSelectionWithMetadata]);
    handleExitRef.current = handleExit;
    let handleClose = q2(() => {
      if (dispatchRef.current) {
        dispatchRef.current({ type: "cortex-close" });
        return;
      }
      handleExit();
    }, [handleExit]);
    return y2(() => {
      if (!active) return;
      function handleEscape(e4) {
        if (isRealEvent(e4) && e4.key === "Escape") {
          if (isCortexUIFocused() && !hasOpenPopover()) {
            let focused = getDeepActiveElement();
            if (focused instanceof HTMLElement) {
              let tag = focused.tagName.toLowerCase();
              if (tag === "input" || tag === "textarea" || tag === "select" || focused.isContentEditable) {
                focused.blur(), e4.stopPropagation(), e4.preventDefault();
                return;
              }
            }
          }
          if (!(isInputFocused() && !isCortexUIFocused())) {
            if (commentModeRef.current) {
              setCommentMode(!1), e4.stopPropagation(), e4.preventDefault();
              return;
            }
            if (dismissTopmostPopover()) {
              e4.stopPropagation(), e4.preventDefault();
              return;
            }
            if (selectedElementRef.current) {
              setSelectionWithMetadata(null), e4.stopPropagation(), e4.preventDefault();
              return;
            }
          }
        }
      }
      return window.addEventListener("keydown", handleEscape, { capture: !0 }), () => window.removeEventListener("keydown", handleEscape, { capture: !0 });
    }, [active]), y2(() => {
      if (!active) return;
      function guardSingleKey(handler) {
        return (e4) => {
          isRealEvent(e4) && (isInputFocused() || isCortexUIFocused() || handler());
        };
      }
      function guardModifier(handler) {
        return (e4) => {
          isRealEvent(e4) && (isInputFocused() && !isCortexUIFocused() || (e4.preventDefault(), handler()));
        };
      }
      return f3(window, {
        v: guardSingleKey(() => setCommentMode(!1)),
        c: guardSingleKey(() => setCommentMode((m3) => !m3)),
        "$mod+z": guardModifier(() => {
          if (isCortexUIFocused()) {
            let activeEl = getDeepActiveElement();
            activeEl instanceof HTMLElement && activeEl.blur();
          }
          flushCommitRef.current?.(), undoInProgressRef.current = !0;
          let gen = ++undoGenRef.current;
          setTimeout(() => setTimeout(() => {
            undoGenRef.current === gen && (undoInProgressRef.current = !1);
          }));
          try {
            let cmd = commandStackRef.current?.undo();
            cmd && (overrideRef.current?.flush(), cmd.hasServerEntry && channel.send({ type: "undo" }));
          } catch (err) {
            console.error("[cortex] Undo failed:", err);
          }
        }),
        "$mod+Shift+z": guardModifier(() => {
          if (isCortexUIFocused()) {
            let activeEl = getDeepActiveElement();
            activeEl instanceof HTMLElement && activeEl.blur();
          }
          flushCommitRef.current?.(), undoInProgressRef.current = !0;
          let gen = ++undoGenRef.current;
          setTimeout(() => setTimeout(() => {
            undoGenRef.current === gen && (undoInProgressRef.current = !1);
          }));
          try {
            let cmd = commandStackRef.current?.redo();
            cmd && (overrideRef.current?.flush(), cmd.hasServerEntry && channel.send({ type: "redo" }));
          } catch (err) {
            console.error("[cortex] Redo failed:", err);
          }
        })
      });
    }, [active, channel]), y2(() => {
      selectionRef.current?.setDesignMode(active), active ? document.documentElement.setAttribute("data-cortex-active", "") : document.documentElement.removeAttribute("data-cortex-active");
    }, [active]), active ? /* @__PURE__ */ u4(k, { children: [
      /* @__PURE__ */ u4("div", { style: { position: "absolute", top: 0, left: 0, right: 0, zIndex: 9998, pointerEvents: "none", display: "flex", flexDirection: "column" }, children: [
        /* @__PURE__ */ u4(NoAnnotationsBanner, {}),
        /* @__PURE__ */ u4(CapabilityBanner, { systems: capabilitySystems }),
        /* @__PURE__ */ u4(ErrorToast, { channel })
      ] }),
      /* @__PURE__ */ u4(TooltipLayer, { shadowRoot: shadowRoot2 }),
      /* @__PURE__ */ u4("div", { style: { transform: "var(--cx-banner-transform, none)", transition: "transform 200ms ease-out" }, children: [
        /* @__PURE__ */ u4(HoverOverlay, { element: hoverEnabled ? hoveredElement : null }),
        /* @__PURE__ */ u4(
          SelectionOverlay,
          {
            element: selectedElement,
            availableStates,
            activeState,
            onStateChange: handleStateChange,
            overlaysVisible: hoverEnabled,
            hmrAppliedVersion
          }
        ),
        selectedElements.slice(1).map((el, idx) => /* @__PURE__ */ u4(
          SecondarySelectionOverlay,
          {
            element: el,
            overlaysVisible: hoverEnabled,
            hmrAppliedVersion
          },
          idx
        )),
        overrideRef.current && /* @__PURE__ */ u4(
          Panel,
          {
            selectedElements,
            overrideManager: overrideRef.current,
            commandStack: commandStackRef.current,
            flushCommitRef,
            stageEditRef: void 0,
            commitEditRef: void 0,
            bufferListRef: void 0,
            undoInProgressRef,
            onClose: handleClose,
            onSelectElement: handleSelectElement,
            onSelectElements: setSelection,
            swatches,
            textComponents,
            colorChips,
            spacingTokens,
            activeState,
            hasBefore,
            hasAfter,
            hoverEnabled,
            onToggleHover: handleToggleHover,
            position: panelPosition,
            isSnapping: panelSnapping,
            panelPointerDown,
            panelPointerMove,
            panelPointerUp,
            panelPointerCancel,
            channel,
            agentConnected,
            connectionStatus,
            editErrors,
            onEditDispatch: handleEditDispatch,
            onDismissError: handleDismissError,
            hmrAppliedVersion,
            hmrEventVersion,
            hmrChangedFiles,
            staleOverrideCount,
            staleSources
          }
        ),
        /* @__PURE__ */ u4(
          Toolbar,
          {
            activityCount,
            onClose: handleClose,
            commentMode,
            onCommentMode: handleCommentMode,
            onActivityToggle: handleActivityToggle
          }
        ),
        /* @__PURE__ */ u4(
          CommentPin,
          {
            annotations: [...annotations.values()],
            commentMode,
            channel,
            onReply: handleCommentReply
          }
        ),
        /* @__PURE__ */ u4(
          ActivityLog,
          {
            entries: activityEntries,
            visible: showActivity,
            onClose: handleActivityToggle
          }
        )
      ] })
    ] }) : null;
  }

  // src/browser/channel.ts
  var MAX_QUEUE_SIZE = 100;
  function composeRequestWithId(msg, requestId) {
    return { ...msg, requestId, token: "" };
  }
  function matchesRequestId(serverMsg, requestId) {
    return "requestId" in serverMsg && serverMsg.requestId === requestId;
  }
  var SEND_AND_ACK_DEFAULT_TIMEOUT_MS = 1e4;
  function sendAndAckImpl(msg, options, sendFn, onMessageFn, onConnectionChangeFn) {
    let timeoutMs = options?.timeoutMs ?? SEND_AND_ACK_DEFAULT_TIMEOUT_MS, requestId = generateId(), composed = composeRequestWithId(msg, requestId);
    return new Promise((resolve, reject) => {
      let settled = !1, unsubMessage = onMessageFn((serverMsg) => {
        matchesRequestId(serverMsg, requestId) && (settled || (settled = !0, cleanup(), resolve(serverMsg)));
      }), timer = setTimeout(() => {
        settled || (settled = !0, cleanup(), reject(new Error(`sendAndAck timeout after ${timeoutMs}ms`)));
      }, timeoutMs), unsubConnection = onConnectionChangeFn((state) => {
        state.status === "disconnected" && (settled || (settled = !0, cleanup(), reject(new Error("sendAndAck failed: channel disconnected"))));
      });
      function cleanup() {
        clearTimeout(timer), unsubMessage(), unsubConnection();
      }
      sendFn(composed);
    });
  }
  function createViteChannel() {
    let handlers = [], capturedSend = window.__cortex_send__, capturedToken = window.__CORTEX_TOKEN__;
    delete window.__cortex_send__, delete window.__CORTEX_TOKEN__, Object.defineProperty(window, "__cortex_channel__", {
      value: Object.freeze({
        handleServerMessage(data) {
          for (let h3 of [...handlers])
            try {
              h3(data);
            } catch (err) {
              console.warn("[cortex] Message handler error:", err instanceof Error ? err.message : err);
            }
        }
      }),
      writable: !1,
      configurable: !0
      // configurable so dispose() can clean up
    });
    let channel = {
      send(msg) {
        capturedSend?.({ ...msg, token: capturedToken });
      },
      onMessage(handler) {
        return handlers.push(handler), () => {
          let idx = handlers.indexOf(handler);
          idx >= 0 && handlers.splice(idx, 1);
        };
      },
      onConnectionChange(_handler) {
        return () => {
        };
      },
      sendAndAck(msg, options) {
        return sendAndAckImpl(
          msg,
          options,
          (m3) => channel.send(m3),
          (h3) => channel.onMessage(h3),
          // Vite channel has no connection lifecycle — pass no-op so disconnect
          // rejection path is a dead branch. Timeout is the only rejection path.
          () => () => {
          }
        );
      },
      get connected() {
        return typeof capturedSend == "function";
      },
      dispose() {
        handlers.length = 0, delete window.__cortex_channel__;
      }
    };
    return channel;
  }
  function createWebSocketChannel(options) {
    let port = window.__cortex_ws_port__ ?? 24678, defaultProtocol = location.protocol === "https:" ? "wss:" : "ws:", url = options?.url ?? `${defaultProtocol}//${location.hostname}:${port}/cortex`, maxRetries = options?.maxRetries ?? 5, capturedToken = window.__CORTEX_TOKEN__;
    delete window.__CORTEX_TOKEN__;
    let handlers = [], statusHandlers = [], queue = [], ws = null, connected = !1, retryCount = 0, reconnectTimer = null, disposed = !1;
    function fireStatus(state) {
      for (let h3 of [...statusHandlers])
        try {
          h3(state);
        } catch (err) {
          console.warn("[cortex] Connection status handler error:", err instanceof Error ? err.message : err);
        }
    }
    function connect() {
      if (!disposed) {
        try {
          ws = new WebSocket(url);
        } catch (err) {
          if (console.warn("[cortex] WebSocket connection failed:", err instanceof Error ? err.message : err), retryCount < maxRetries) {
            let delay = Math.min(1e3 * 2 ** retryCount, 3e4);
            retryCount++, fireStatus({ status: "reconnecting", retryCount, maxRetries }), reconnectTimer = setTimeout(connect, delay);
          } else
            queue.length = 0, fireStatus({ status: "disconnected" });
          return;
        }
        ws.onopen = () => {
          for (connected = !0, retryCount = 0, fireStatus({ status: "connected" }); queue.length > 0; ) {
            let msg = queue.shift();
            ws.send(JSON.stringify({ ...msg, token: capturedToken }));
          }
        }, ws.onmessage = (event) => {
          let data;
          try {
            data = JSON.parse(event.data);
          } catch {
            return;
          }
          for (let h3 of [...handlers])
            try {
              h3(data);
            } catch (err) {
              console.warn("[cortex] Message handler error:", err instanceof Error ? err.message : err);
            }
        }, ws.onclose = () => {
          if (connected = !1, !disposed)
            if (retryCount < maxRetries) {
              let delay = Math.min(1e3 * 2 ** retryCount, 3e4);
              retryCount++, fireStatus({ status: "reconnecting", retryCount, maxRetries }), reconnectTimer = setTimeout(connect, delay);
            } else
              queue.length = 0, fireStatus({ status: "disconnected" }), console.warn(
                `[cortex] WebSocket disconnected after ${maxRetries} retries. Edits will not be saved until the page is refreshed. URL: ${url}`
              );
        }, ws.onerror = () => {
        };
      }
    }
    connect();
    let wsChannel = {
      send(msg) {
        disposed || (connected && ws?.readyState === WebSocket.OPEN ? ws.send(JSON.stringify({ ...msg, token: capturedToken })) : (queue.length >= MAX_QUEUE_SIZE && queue.shift(), queue.push(msg)));
      },
      onMessage(handler) {
        return handlers.push(handler), () => {
          let idx = handlers.indexOf(handler);
          idx >= 0 && handlers.splice(idx, 1);
        };
      },
      onConnectionChange(handler) {
        return statusHandlers.push(handler), () => {
          let idx = statusHandlers.indexOf(handler);
          idx >= 0 && statusHandlers.splice(idx, 1);
        };
      },
      sendAndAck(msg, options2) {
        return sendAndAckImpl(
          msg,
          options2,
          (m3) => wsChannel.send(m3),
          (h3) => wsChannel.onMessage(h3),
          // WebSocket channel exposes full connection lifecycle — reject on disconnect.
          (h3) => wsChannel.onConnectionChange(h3)
        );
      },
      get connected() {
        return connected;
      },
      dispose() {
        disposed = !0, reconnectTimer !== null && (clearTimeout(reconnectTimer), reconnectTimer = null), ws && (ws.onopen = ws.onmessage = ws.onclose = ws.onerror = null, ws.close(), ws = null), connected = !1, handlers.length = 0, statusHandlers.length = 0, queue.length = 0;
      }
    };
    return wsChannel;
  }

  // src/browser/styles.css
  var styles_default = `/* Cortex overlay styles \u2014 injected into Shadow DOM, fully isolated */
/* Note: backdrop-filter intentionally avoided \u2014 causes full-page re-composite on every HMR repaint */

/* \u2500\u2500 Design tokens \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */

:host {
  /* Shadow DOM isolation \u2014 reset every inherited property from the host app.
     CSS custom properties inherit through the shadow boundary, and any style
     the host app sets on its tree (color, font, line-height, box-sizing, \u2026)
     would otherwise leak in and corrupt panel rendering. \`all: initial\`
     closes the leak; every inherited property we rely on must be re-asserted
     below. See ZF0-1179 / 2026-04-10 architecture review. */
  all: initial;

  /* Re-assert box-sizing so it cascades to every descendant via the
     universal box-sizing: inherit rule below. */
  box-sizing: border-box;

  /* Explicit block display. \`all: initial\` resets :host to \`display: inline\`.
     Today the host element has inline \`position: fixed\`, and CSS spec blockifies
     fixed-positioned elements to \`display: block\` at computed time \u2014 so layout
     currently works. But that's implicit and load-bearing: if a future refactor
     changes the host element's position, the panel would silently become inline.
     Defense-in-depth: declare \`display: block\` so the panel's layout doesn't
     depend on an invisible CSS spec rule. */
  display: block;

  /* Typography \u2014 Geist Sans with system fallback (reset by \`all: initial\`) */
  font-family: 'Geist', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;

  /* Re-assert font-size and line-height so every descendant inherits a
     sensible default. Without this, \`all: initial\` leaves :host at UA
     initial \`font-size: medium\` (~16px) and \`line-height: normal\`, and
     any future top-level container that forgets to set font-size explicitly
     would render text at 16px in contexts where 10\u201313px is expected. The
     architecture reviewer flagged this as silently load-bearing on every
     panel container \u2014 explicit seeding here closes the gap. */
  font-size: var(--cx-text-lg);
  line-height: 1.4;

  /* Default ink color so descendants without explicit \`color\` inherit
     the panel palette rather than the host app's text color. */
  color: var(--cx-ink);

  /* Ink hierarchy \u2014 values are darkest, labels recede */
  --cx-ink: #111827;
  --cx-ink-secondary: #6b7280;
  --cx-ink-tertiary: #a3a3a3;
  --cx-ink-ghost: #b0b0b0;
  --cx-ink-faint: #d4d4d4;

  /* Surfaces \u2014 drafting-paper whites */
  --cx-paper: #fff;
  --cx-vellum: #fafafa;
  --cx-well: #f5f5f5;
  --cx-well-hover: #efefef;
  --cx-well-active: #ebebeb;
  --cx-well-shadow: inset 0 1px 2px rgba(0, 0, 0, 0.03);

  /* Button hover \u2014 subtle lift on click-target surfaces (toggles, triggers,
     icon buttons, segmented picks). Intentionally lighter than
     --cx-well-hover, which is reserved for input-field hover feedback
     (NumericInput, textareas) and mouse-down active states, where heavier
     contrast reads as "this surface responds when you press it" rather than
     "this is clickable". Value matches --cx-well by design: one design step
     of lift over --cx-paper. Semantic split so the two tokens can drift
     independently if the design evolves. */
  --cx-btn-hover: #f5f5f5;

  /* Pencil lines */
  --cx-rule: #f0f0f0;
  --cx-rule-soft: rgba(0, 0, 0, 0.04);

  /* Selection anchor \u2014 one accent, earned placement */
  --cx-select: #3b82f6;
  --cx-select-hover: #2563eb;
  --cx-select-muted: rgba(59, 130, 246, 0.12);
  --cx-on-select: #fff;

  /* Status */
  --cx-success: #22c55e;
  --cx-destructive: #ef4444;
  --cx-destructive-surface: rgba(239, 68, 68, 0.06);
  --cx-warning: #f97316;
  --cx-warning-surface: rgba(249, 115, 22, 0.06);

  /* Tooltip */
  --cx-tooltip-bg: #1f2937;

  /* Monospace for values */
  --cx-mono: 'Geist Mono', ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;

  /* Spacing scale \u2014 4px base */
  --cx-sp-1: 2px;
  --cx-sp-2: 4px;
  --cx-sp-3: 6px;
  --cx-sp-4: 8px;
  --cx-sp-5: 12px;
  --cx-sp-6: 16px;
  --cx-sp-7: 24px;
  --cx-sp-8: 32px;

  /* Radius scale */
  --cx-radius-sm: 4px;
  --cx-radius-md: 6px;
  --cx-radius-lg: 8px;
  --cx-radius-lg-inner: 5px;

  /* Type scale \u2014 9/11/12/13/14 (per DESIGN.md) */
  --cx-text-xs: 9px;
  --cx-text-sm: 11px;
  --cx-text-md: 12px;
  --cx-text-lg: 13px;
  --cx-text-xl: 14px;

  /* Type weights */
  --cx-weight-label: 400;
  --cx-weight-value: 500;
  --cx-weight-heading: 600;
  --cx-weight-title: 700;
}

/* Propagate border-box sizing to every panel descendant. The bare \`*\`
   selector is safely scoped because this stylesheet is injected into the
   Shadow DOM and cannot match anything in the host app tree. */
*,
*::before,
*::after {
  box-sizing: inherit;
}

/* \u2500\u2500 Blueprint (dark mode) \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */

:host([data-theme="blueprint"]) {
  --cx-ink: #e2e8f0;
  --cx-ink-secondary: #94a3b8;
  --cx-ink-tertiary: #64748b;
  --cx-ink-ghost: #475569;
  --cx-ink-faint: #334155;

  --cx-paper: #0f172a;
  --cx-vellum: #1e293b;
  --cx-well: #1a2332;
  --cx-well-hover: #233044;
  --cx-well-active: #2a3a52;
  --cx-well-shadow: inset 0 1px 2px rgba(0, 0, 0, 0.15);

  /* Dark-mode counterpart of --cx-btn-hover. Matches --cx-well value so the
     subtle-lift semantic holds across modes. */
  --cx-btn-hover: #1a2332;

  --cx-rule: #1e293b;
  --cx-rule-soft: rgba(255, 255, 255, 0.04);

  --cx-select: #60a5fa;
  --cx-select-hover: #3b82f6;
  --cx-select-muted: rgba(96, 165, 250, 0.15);
  --cx-on-select: #0f172a;

  --cx-success: #4ade80;
  --cx-destructive: #f87171;
  --cx-destructive-surface: rgba(248, 113, 113, 0.1);
  --cx-warning: #fb923c;
  --cx-warning-surface: rgba(251, 146, 60, 0.1);

  --cx-tooltip-bg: #0f172a;
}

/* Blueprint panel shadow \u2014 stronger in dark mode since background is already dark */
:host([data-theme="blueprint"]) .cortex-panel {
  border-color: rgba(255, 255, 255, 0.06);
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4), 0 1px 4px rgba(0, 0, 0, 0.2);
}

:host([data-theme="blueprint"]) .cortex-toolbar {
  border-color: rgba(255, 255, 255, 0.06);
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.3), 0 0 0 1px rgba(255, 255, 255, 0.04);
}

/* \u2500\u2500 Tooltip layer \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */

.cortex-tooltip {
  z-index: 10000;
  max-width: 220px;
  padding: var(--cx-sp-2) var(--cx-sp-4);
  background: var(--cx-tooltip-bg);
  color: var(--cx-paper);
  font-family: var(--cx-mono);
  font-size: var(--cx-text-sm);
  font-weight: var(--cx-weight-label);
  line-height: 1.3;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  border-radius: var(--cx-radius-sm);
  pointer-events: none;
  animation: cortex-tooltip-enter 150ms ease-out;
}

@keyframes cortex-tooltip-enter {
  from { opacity: 0; transform: translateY(4px); }
  to { opacity: 1; transform: translateY(0); }
}

.cortex-hover-overlay {
  position: fixed;
  left: 0;
  top: 0;
  pointer-events: none;
  border: 2px solid var(--cx-select);
  box-sizing: border-box;
}

.cortex-selection-overlay {
  position: fixed;
  left: 0;
  top: 0;
  pointer-events: none;
  border: 2.5px solid var(--cx-select);
  box-sizing: border-box;
  transition: border-radius 150ms ease-out;
}

/* ZF0-1195: Secondary selection outline for non-primary multi-selected elements.
 * Slightly thinner border so the primary's full-chrome overlay (with label and
 * state lens) still reads as the focus. Same accent color so the user perceives
 * the selection as one logical group. */
.cortex-selection-overlay--secondary {
  border-width: 2px;
  border-style: dashed;
}

.cortex-label {
  position: absolute;
  left: 0;
  padding: 2px 6px;
  background: var(--cx-select);
  color: var(--cx-on-select);
  font: 11px/1.3 ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  white-space: nowrap;
  border-radius: 2px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.15);
  pointer-events: none;
  max-width: 200px;
  overflow: hidden;
  text-overflow: ellipsis;
}

.cortex-label--above {
  bottom: 100%;
  margin-bottom: 4px;
}

.cortex-label--below {
  top: 100%;
  margin-top: var(--cx-sp-2);
}

/* \u2500\u2500 Layer tree \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */

.cortex-layer-tree {
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
}


.cortex-layer-tree__scroll {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  scrollbar-width: thin;
  scrollbar-color: var(--cx-ink-faint) transparent;
}

.cortex-layer-tree__scroll::-webkit-scrollbar {
  width: 4px;
}
.cortex-layer-tree__scroll::-webkit-scrollbar-track {
  background: transparent;
}
.cortex-layer-tree__scroll::-webkit-scrollbar-thumb {
  background: var(--cx-ink-faint);
  border-radius: 3px;
}

.cortex-layer-node {
  display: flex;
  align-items: center;
  gap: var(--cx-sp-2);
  padding: var(--cx-sp-1) var(--cx-sp-4);
  border-left: 2px solid transparent;
  cursor: pointer;
  font-size: var(--cx-text-sm);
  font-family: var(--cx-mono);
  color: var(--cx-ink-secondary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  user-select: none;
}

.cortex-layer-node:hover {
  background: var(--cx-well);
}

.cortex-layer-node--selected {
  background: var(--cx-select-muted);
  color: var(--cx-ink);
  border-left: 2px solid var(--cx-select);
}

.cortex-layer-chevron {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 12px;
  height: 12px;
  flex-shrink: 0;
  color: var(--cx-ink-tertiary);
  cursor: pointer;
  transition: transform 150ms ease-out;
}

.cortex-layer-chevron--expanded {
  transform: rotate(90deg);
}

.cortex-layer-chevron-spacer {
  width: 12px;
  flex-shrink: 0;
}

.cortex-layer-label {
  overflow: hidden;
  text-overflow: ellipsis;
}

.cortex-layer-resize {
  height: 4px;
  cursor: row-resize;
  background: transparent;
  flex-shrink: 0;
}

.cortex-layer-resize:hover {
  background: var(--cx-select-muted);
}

/* \u2500\u2500 Element tree wrapper \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */

.cortex-element-tree {
  min-width: 0;
}

/* \u2500\u2500 Error card \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */

.cortex-error-cards {
  border-bottom: 1px solid var(--cx-rule);
}

.cortex-error-card {
  padding: var(--cx-sp-4);
  background: var(--cx-destructive-surface);
  border-bottom: 1px solid var(--cx-rule);
}

.cortex-error-card:last-child {
  border-bottom: none;
}

.cortex-error-card__header {
  display: flex;
  align-items: center;
  gap: var(--cx-sp-2);
  font-size: var(--cx-text-sm);
  font-weight: var(--cx-weight-value);
  color: var(--cx-destructive);
}

.cortex-error-card__icon {
  flex-shrink: 0;
  color: var(--cx-destructive);
}

.cortex-error-card__property {
  font-family: var(--cx-mono);
}

.cortex-error-card__reason {
  margin-top: var(--cx-sp-2);
  font-size: var(--cx-text-sm);
  color: var(--cx-ink-secondary);
  line-height: 1.4;
}

.cortex-error-card__actions {
  display: flex;
  justify-content: flex-end;
  gap: var(--cx-sp-2);
  margin-top: var(--cx-sp-3);
}

.cortex-error-card__btn {
  padding: var(--cx-sp-1) var(--cx-sp-3);
  font-size: var(--cx-text-xs);
  font-weight: var(--cx-weight-value);
  border: 1px solid var(--cx-rule);
  border-radius: var(--cx-radius-sm);
  background: var(--cx-well);
  color: var(--cx-ink);
  cursor: pointer;
}

.cortex-error-card__btn:hover:not(:disabled) {
  background: var(--cx-btn-hover);
}

.cortex-error-card__btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.cortex-error-card__btn--primary {
  background: var(--cx-select);
  color: var(--cx-on-select);
  border-color: var(--cx-select);
}

.cortex-error-card__btn--primary:hover:not(:disabled) {
  background: var(--cx-select-hover);
}

/* ZF0-1293: divergence debug disclosure. Only rendered when
 * window.__CORTEX_DEBUG_OVERRIDES__ is true. Deliberately dense \u2014 this is a
 * developer tool for root-causing mystery divergences. */
.cortex-error-card__debug {
  margin-top: var(--cx-sp-2);
  font-size: var(--cx-text-xs);
  color: var(--cx-ink-secondary);
}

.cortex-error-card__debug-summary {
  cursor: pointer;
  padding: var(--cx-sp-1) 0;
  font-weight: var(--cx-weight-value);
  color: var(--cx-ink);
  user-select: none;
}

.cortex-error-card__debug-grid {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: var(--cx-sp-1) var(--cx-sp-3);
  margin: var(--cx-sp-1) 0 0 0;
  padding: var(--cx-sp-2);
  background: var(--cx-well);
  border-radius: var(--cx-radius-sm);
}

.cortex-error-card__debug-grid dt {
  color: var(--cx-ink-secondary);
  margin: 0;
}

.cortex-error-card__debug-grid dd {
  margin: 0;
  color: var(--cx-ink);
  font-family: var(--cx-font-mono, ui-monospace, monospace);
  word-break: break-all;
}

/* \u2500\u2500 Panel shell \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */

.cortex-panel {
  position: fixed;
  left: 0;
  top: 0;
  width: 320px;
  max-height: calc(100vh - 32px);
  background: var(--cx-paper);
  border: 1px solid var(--cx-rule);
  border-radius: var(--cx-radius-lg);
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.08), 0 1px 4px rgba(0, 0, 0, 0.04);
  pointer-events: auto;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  color: var(--cx-ink);
  font-size: var(--cx-text-lg);
  line-height: 1.4;
}

.cortex-panel--entering {
  animation: cortex-slide-in 250ms cubic-bezier(0.16, 1, 0.3, 1) forwards;
}

.cortex-panel--snapping {
  will-change: transform;
  transition: transform 350ms cubic-bezier(0.16, 1, 0.3, 1);
}

@keyframes cortex-slide-in {
  from { opacity: 0; }
  to   { opacity: 1; }
}

@keyframes cortex-group-enter {
  from { opacity: 0; transform: translateY(4px); }
  to   { opacity: 1; transform: translateY(0); }
}

@keyframes cortex-popover-enter {
  from { opacity: 0; transform: translateY(-4px); }
  to   { opacity: 1; transform: translateY(0); }
}

@keyframes cortex-scope-enter {
  from { opacity: 0; }
  to   { opacity: 1; }
}

.cortex-panel__body {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  scrollbar-width: thin;
  scrollbar-color: var(--cx-ink-faint) transparent;
}

.cortex-panel__body::-webkit-scrollbar {
  width: 4px;
}
.cortex-panel__body::-webkit-scrollbar-track {
  background: transparent;
}
.cortex-panel__body::-webkit-scrollbar-thumb {
  background: var(--cx-ink-faint);
  border-radius: 3px;
}
.cortex-panel__empty {
  padding: var(--cx-sp-7) var(--cx-sp-6);
  text-align: center;
  display: flex;
  flex-direction: column;
  gap: var(--cx-sp-3);
}

.cortex-panel__empty-action {
  color: var(--cx-ink-secondary);
  font-size: var(--cx-text-md);
}

.cortex-panel__empty-hint {
  color: var(--cx-ink-tertiary);
  font-size: var(--cx-text-sm);
}

.cortex-panel__empty-shortcut {
  color: var(--cx-ink-ghost);
  font-size: var(--cx-text-xs);
  font-family: var(--cx-mono);
}

.cortex-panel__scope {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--cx-sp-3) var(--cx-sp-5);
  background: var(--cx-warning-surface);
  border-bottom: 1px solid var(--cx-rule);
  font-size: var(--cx-text-sm);
  gap: var(--cx-sp-4);
  animation: cortex-scope-enter 150ms ease-out;
}

.cortex-panel__scope-label {
  color: var(--cx-warning);
  font-weight: var(--cx-weight-value);
  white-space: nowrap;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
}

.cortex-panel__scope-toggle {
  display: flex;
  border: 1px solid var(--cx-rule);
  border-radius: var(--cx-radius-sm);
  overflow: hidden;
}

.cortex-panel__scope-btn {
  background: var(--cx-well);
  border: none;
  color: var(--cx-ink);
  font-size: var(--cx-text-sm);
  padding: 2px 8px;
  cursor: pointer;
  white-space: nowrap;
}

.cortex-panel__scope-btn:not(:last-child) {
  border-right: 1px solid var(--cx-rule);
}

.cortex-panel__scope-btn--active {
  background: var(--cx-select);
  color: var(--cx-on-select);
}

.cortex-panel__scope-btn:focus-visible {
  outline: 2px solid var(--cx-select-muted);
  outline-offset: -1px;
}

.cortex-panel__scope-toggle:focus-within {
  outline: 2px solid var(--cx-select-muted);
  outline-offset: 1px;
}

.cortex-panel__scope-btn:hover:not(.cortex-panel__scope-btn--active) {
  background: var(--cx-btn-hover);
}

/* Source-only variant: inherits base scope banner styles; no toggle buttons.
   Gated on {sharedSourceInfo && !sharedInfo} so CSS-class banner wins precedence
   and this modifier never co-renders with the full scope banner (ZF0-1583).
   Tighter block padding compensates for the absent toggle child's visual mass. */
.cortex-panel__scope--source-only {
  padding-block: var(--cx-sp-2);
}

/* \u2500\u2500 Staging drift banner (ZF0-1468) \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */

.cortex-drift-banner {
  display: flex;
  align-items: flex-start;
  gap: var(--cx-sp-3);
  padding: var(--cx-sp-3) var(--cx-sp-4);
  background: var(--cx-warning-surface);
  border-bottom: 1px solid var(--cx-rule);
}

.cortex-drift-banner__body {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 0;
}

.cortex-drift-banner__row {
  display: flex;
  align-items: flex-start;
  gap: var(--cx-sp-3);
  padding: var(--cx-sp-2) 0;
}

.cortex-drift-banner__row--bordered {
  border-top: 1px solid var(--cx-rule);
}

.cortex-drift-banner__copy {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: var(--cx-sp-1);
}

.cortex-drift-banner__title {
  font-size: var(--cx-text-sm);
  font-weight: var(--cx-weight-value);
  color: var(--cx-warning);
  line-height: 1.3;
}

.cortex-drift-banner__desc {
  font-size: var(--cx-text-sm);
  color: var(--cx-ink-secondary);
  line-height: 1.4;
}

.cortex-drift-banner__btn {
  flex-shrink: 0;
  padding: var(--cx-sp-1) var(--cx-sp-3);
  font-size: var(--cx-text-xs);
  font-weight: var(--cx-weight-value);
  border: 1px solid var(--cx-rule);
  border-radius: var(--cx-radius-sm);
  background: var(--cx-well);
  color: var(--cx-ink);
  cursor: pointer;
}

.cortex-drift-banner__btn:hover {
  background: var(--cx-btn-hover);
}

.cortex-drift-banner__dismiss {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  margin-top: var(--cx-sp-2);
  padding: 0;
  background: none;
  border: none;
  color: var(--cx-ink-secondary);
  cursor: pointer;
  border-radius: var(--cx-radius-sm);
}

.cortex-drift-banner__dismiss:hover {
  color: var(--cx-ink);
  background: var(--cx-btn-hover);
}

/* \u2500\u2500 Apply error banner (ZF0-1453) \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */
/* Surfaces sendAndAck rejections above StagingDriftBanner so the designer
   always gets feedback on Apply failure, even in the empty-selection state.
   Uses --cx-warning-* tokens (no hardcoded hex) for light/dark theming. */

.cortex-apply-error {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: var(--cx-sp-3) var(--cx-sp-4);
  margin: var(--cx-sp-3) var(--cx-sp-4);
  border-radius: var(--cx-radius-sm);
  border: 1px solid var(--cx-warning);
  background: var(--cx-warning-surface);
  color: var(--cx-ink);
  font-size: var(--cx-text-sm);
}

.cortex-apply-error__dismiss {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  padding: 0;
  margin-left: var(--cx-sp-3);
  background: none;
  border: none;
  color: var(--cx-ink-secondary);
  cursor: pointer;
  border-radius: var(--cx-radius-sm);
}

.cortex-apply-error__dismiss:hover {
  color: var(--cx-ink);
  background: var(--cx-btn-hover);
}

/* \u2500\u2500 No-annotations diagnostic banner (ZF0-1508) \u2500\u2500 */

.cortex-no-annotations-banner {
  display: flex;
  align-items: flex-start;
  gap: var(--cx-sp-3);
  padding: var(--cx-sp-3) var(--cx-sp-4);
  background: var(--cx-destructive-surface);
  border-bottom: 1px solid var(--cx-rule);
  pointer-events: auto;
}

.cortex-no-annotations-banner__body {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: var(--cx-sp-1);
}

.cortex-no-annotations-banner__title {
  font-size: var(--cx-text-sm);
  font-weight: var(--cx-weight-value);
  color: var(--cx-destructive);
  line-height: 1.3;
}

.cortex-no-annotations-banner__desc {
  font-size: var(--cx-text-sm);
  color: var(--cx-ink-secondary);
  line-height: 1.4;
}

.cortex-no-annotations-banner__link {
  color: var(--cx-destructive);
  text-decoration: underline;
}

.cortex-no-annotations-banner__dismiss {
  flex-shrink: 0;
  align-self: center;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  padding: 0;
  background: none;
  border: none;
  color: var(--cx-ink-secondary);
  cursor: pointer;
  border-radius: var(--cx-radius-sm);
}

.cortex-no-annotations-banner__dismiss:hover {
  color: var(--cx-ink);
  background: var(--cx-btn-hover);
}

/* \u2500\u2500 Panel header \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */

.cortex-panel-header {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--cx-sp-3);
  padding: var(--cx-sp-4) var(--cx-sp-5);
  border-bottom: 1px solid var(--cx-rule);
  background: var(--cx-paper);
  cursor: grab;
  min-height: 36px;
  flex-shrink: 0;
}

.cortex-panel-header:active {
  cursor: grabbing;
}

.cortex-panel-header__info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 3px;
}

/* Tag name as small badge \u2014 secondary to source attribution */
.cortex-panel-header__tag {
  font-size: var(--cx-text-sm);
  font-weight: var(--cx-weight-value);
  font-family: var(--cx-mono);
  color: var(--cx-ink-secondary);
  letter-spacing: -0.01em;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* Source attribution as hero \u2014 the bridge between visual and code */
.cortex-panel-header__source {
  font-size: var(--cx-text-md);
  font-family: var(--cx-mono);
  font-weight: var(--cx-weight-value);
  color: var(--cx-ink);
  text-decoration: none;
  letter-spacing: -0.01em;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  transition: color 150ms ease-out;
  border-bottom: 1px solid transparent;
  padding-bottom: 1px;
}

.cortex-panel-header__source:hover {
  color: var(--cx-select);
  border-bottom-color: var(--cx-select-muted);
}

.cortex-panel-header__source:focus-visible {
  outline: 2px solid var(--cx-select-muted);
  outline-offset: 1px;
}

.cortex-panel-header__actions {
  display: flex;
  align-items: center;
  gap: 2px;
  flex-shrink: 0;
}

.cortex-panel-header__btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border: none;
  background: transparent;
  border-radius: var(--cx-radius-sm);
  cursor: pointer;
  color: var(--cx-ink-ghost);
  font-size: var(--cx-text-md);
  padding: 0;
  transition: background 150ms ease-out, color 150ms ease-out, opacity 150ms ease-out, outline-color 150ms ease-out;
  outline: 2px solid transparent;
  outline-offset: 1px;
}

.cortex-panel-header__btn:hover:not(:disabled) {
  background: var(--cx-well);
  color: var(--cx-ink-secondary);
}

.cortex-panel-header__btn:focus-visible {
  outline-color: var(--cx-select-muted);
}

.cortex-panel-header__btn:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}

.cortex-panel-header__btn--close:hover:not(:disabled) {
  background: var(--cx-destructive-surface);
  color: var(--cx-destructive);
}

.cortex-panel-header__btn--toggled-off {
  opacity: 0.4;
}

/* Apply button \u2014 wider than icon-only buttons to show "Apply (N)" text */
.cortex-panel-header__btn--apply {
  width: auto;
  min-width: 72px;
  padding: 0 var(--cx-sp-3);
  background: var(--cx-well);
  font-size: var(--cx-text-sm);
  font-weight: var(--cx-weight-value);
  font-family: var(--cx-sans);
  color: var(--cx-ink);
  letter-spacing: 0;
}

.cortex-panel-header__btn--apply:hover:not(:disabled) {
  background: var(--cx-well-hover);
  color: var(--cx-ink);
}

.cortex-panel-header__btn--apply:disabled {
  background: var(--cx-well);
}

.cortex-theme-dropdown {
  position: relative;
  display: flex;
}

.cortex-theme-dropdown__trigger {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--cx-sp-1);
  width: 34px;
  height: 28px;
  border: none;
  background: var(--cx-well);
  color: var(--cx-ink-secondary);
  border-radius: var(--cx-radius-sm);
  cursor: pointer;
  padding: 0;
  transition: background 150ms ease-out, color 150ms ease-out, outline-color 150ms ease-out;
}

.cortex-theme-dropdown__trigger:hover {
  background: var(--cx-well-hover);
  color: var(--cx-ink);
}

.cortex-theme-dropdown__backdrop {
  position: fixed;
  inset: 0;
  z-index: 12;
}

.cortex-theme-dropdown__menu {
  position: absolute;
  top: calc(100% + var(--cx-sp-1));
  right: 0;
  z-index: 13;
  width: 108px;
  padding: var(--cx-sp-1);
  background: var(--cx-paper);
  border: 1px solid var(--cx-rule);
  border-radius: var(--cx-radius-md);
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.1), 0 1px 4px rgba(0, 0, 0, 0.06);
  animation: cortex-popover-enter 150ms ease-out;
}

.cortex-theme-dropdown__option {
  display: grid;
  grid-template-columns: 16px 1fr 12px;
  align-items: center;
  gap: var(--cx-sp-2);
  width: 100%;
  height: 28px;
  border: none;
  background: transparent;
  border-radius: var(--cx-radius-sm);
  color: var(--cx-ink-secondary);
  cursor: pointer;
  font-size: var(--cx-text-sm);
  font-weight: var(--cx-weight-label);
  padding: 0 var(--cx-sp-2);
  text-align: left;
}

.cortex-theme-dropdown__option:hover,
.cortex-theme-dropdown__option--selected {
  background: var(--cx-well);
  color: var(--cx-ink);
}

.cortex-theme-dropdown__option-icon {
  display: flex;
  align-items: center;
  justify-content: center;
}

.cortex-theme-dropdown__option-label {
  min-width: 0;
}

/* \u2500\u2500 Numeric input \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */

.cortex-numeric-input {
  position: relative;
  display: flex;
  align-items: center;
  height: 28px;
  background: var(--cx-well);
  border-radius: var(--cx-radius-sm);
  padding: 0 var(--cx-sp-4);
  gap: var(--cx-sp-2);
  cursor: ew-resize;
  user-select: none;
  box-shadow: var(--cx-well-shadow);
  transition: background 150ms ease-out, box-shadow 150ms ease-out;
}

.cortex-numeric-input:hover {
  background: var(--cx-well-hover);
}

.cortex-numeric-input[aria-disabled="true"] {
  cursor: not-allowed;
  opacity: 0.55;
}

.cortex-numeric-input[aria-disabled="true"]:hover {
  background: var(--cx-well);
}

/* Scrub affordance \u2014 subtle drag hint on hover */
.cortex-numeric-input::before {
  content: '\\21D4';
  font-size: 8px;
  color: transparent;
  transition: color 150ms ease-out;
  order: 99;
  flex-shrink: 0;
  pointer-events: none;
}

.cortex-numeric-input:hover::before {
  color: var(--cx-ink-ghost);
}

.cortex-numeric-input[aria-disabled="true"]::before,
.cortex-numeric-input[aria-disabled="true"]:hover::before {
  color: transparent;
}

.cortex-numeric-input--scrubbing {
  cursor: ew-resize;
  background: var(--cx-well-active);
  box-shadow: var(--cx-well-shadow), 0 0 0 1.5px var(--cx-select-muted);
}

.cortex-numeric-input__scrub-badge {
  position: absolute;
  top: -24px;
  z-index: 3;
  transform: translateX(-50%);
  padding: 2px var(--cx-sp-3);
  border-radius: var(--cx-radius-sm);
  background: var(--cx-tooltip-bg);
  color: var(--cx-paper);
  font-family: var(--cx-mono);
  font-size: var(--cx-text-xs);
  font-weight: var(--cx-weight-value);
  line-height: 1.4;
  white-space: nowrap;
  pointer-events: none;
}

.cortex-numeric-input:focus-within,
.cortex-numeric-input:focus-visible {
  box-shadow: var(--cx-well-shadow), 0 0 0 1.5px var(--cx-select-muted);
  outline: none;
}

.cortex-numeric-input__label {
  font-size: var(--cx-text-sm);
  color: var(--cx-ink-ghost);
  flex-shrink: 0;
}

/* Inline ghost-coloured prefix slot \u2014 text or icon (e.g. RotateCw on the
   PositionSection rotate input). Uses display:flex so an SVG child sits on
   the input baseline without baseline-shifting the value text. */
.cortex-numeric-input__prefix {
  display: inline-flex;
  align-items: center;
  gap: var(--cx-sp-1);
  font-size: var(--cx-text-sm);
  color: var(--cx-ink-ghost);
  flex-shrink: 0;
  line-height: 1;
}

.cortex-numeric-input__value {
  width: 100%;
  border: none;
  background: transparent;
  font-size: var(--cx-text-md);
  font-family: var(--cx-mono);
  font-weight: var(--cx-weight-value);
  font-variant-numeric: tabular-nums;
  letter-spacing: -0.02em;
  line-height: 1;
  color: var(--cx-ink);
  padding: 0;
  outline: none;
  cursor: inherit;
  -moz-appearance: textfield;
}

.cortex-numeric-input__value::-webkit-inner-spin-button,
.cortex-numeric-input__value::-webkit-outer-spin-button {
  -webkit-appearance: none;
  margin: 0;
}

.cortex-numeric-input__value:focus {
  cursor: text;
}

.cortex-numeric-input[aria-disabled="true"] .cortex-numeric-input__value {
  color: var(--cx-ink-tertiary);
  cursor: not-allowed;
}

.cortex-numeric-input__unit {
  font-size: var(--cx-text-sm);
  color: var(--cx-ink-ghost);
  flex-shrink: 0;
}

/* Override indicator \u2014 value turns blue when changed from default */
.cortex-numeric-input--overridden .cortex-numeric-input__value {
  color: var(--cx-select-hover);
  transition: color 150ms ease-out;
}

/* Stale indicator \u2014 value turns warning-orange when override TTL elapsed without HMR verify.
   Shares --cx-warning with StagingDriftBanner (one accent per view rule: both are the same
   signal \u2014 "something needs your attention"). Compositor-only: color transition only. */
.cortex-numeric-input--stale .cortex-numeric-input__value {
  color: var(--cx-warning);
  transition: color 150ms ease-out;
}

/* Mixed indicator \u2014 shared elements have different values */
.cortex-numeric-input--mixed {
  outline: 1px dashed var(--cx-rule);
  outline-offset: -1px;
}

.cortex-numeric-input--mixed .cortex-numeric-input__value::placeholder {
  color: var(--cx-ink-tertiary);
  font-family: var(--cx-sans);
  font-style: normal;
  opacity: 1;
}

.cortex-color-input--mixed .cortex-color-input__swatch {
  position: relative;
  overflow: hidden;
  background: var(--cx-well) !important;
  border-color: var(--cx-rule);
}

.cortex-color-input--mixed .cortex-color-input__swatch::before {
  content: "";
  position: absolute;
  top: 50%;
  left: -20%;
  width: 140%;
  height: 1px;
  background: var(--cx-rule);
  transform: rotate(-45deg);
  transform-origin: center;
}

.cortex-color-input--mixed .cortex-color-input__hex {
  color: var(--cx-ink-tertiary);
  font-family: var(--cx-sans);
  font-style: normal;
  outline: 1px dashed var(--cx-rule);
  outline-offset: -1px;
}

.cortex-color-input--mixed .cortex-color-input__hex::placeholder {
  color: var(--cx-ink-tertiary);
  opacity: 1;
}

.cortex-color-input--overridden .cortex-color-input__hex {
  color: var(--cx-select-hover);
  transition: color 150ms ease-out;
}

.cortex-dropdown--overridden .cortex-dropdown__value {
  color: var(--cx-select-hover);
  transition: color 150ms ease-out;
}

.cortex-dropdown--mixed .cortex-dropdown__trigger {
  outline: 1px dashed var(--cx-rule);
  outline-offset: -1px;
}

.cortex-dropdown--mixed .cortex-dropdown__value {
  color: var(--cx-ink-tertiary);
  font-family: var(--cx-sans);
}

/* \u2500\u2500 Spacing section \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */

.cortex-spacing-section {
  display: flex;
  flex-direction: column;
  gap: var(--cx-sp-5);
}

.cortex-spacing-group__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 6px;
}

.cortex-section-label {
  font-size: var(--cx-text-xs);
  font-weight: var(--cx-weight-value);
  letter-spacing: 0.01em;
  color: var(--cx-ink-ghost);
}

/* \u2500\u2500 Section group (category wrapper) \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */

.cortex-section-group {
  display: flex;
  flex-direction: column;
}

.cortex-panel--entering .cortex-section-group {
  animation: cortex-group-enter 400ms cubic-bezier(0.16, 1, 0.3, 1) both;
}

.cortex-panel--entering .cortex-section-group:nth-child(1) { animation-delay: 100ms; }
.cortex-panel--entering .cortex-section-group:nth-child(2) { animation-delay: 200ms; }
.cortex-panel--entering .cortex-section-group:nth-child(3) { animation-delay: 300ms; }
.cortex-panel--entering .cortex-section-group:nth-child(4) { animation-delay: 400ms; }
.cortex-panel--entering .cortex-section-group:nth-child(5) { animation-delay: 500ms; }
.cortex-panel--entering .cortex-section-group:nth-child(6) { animation-delay: 600ms; }
.cortex-panel--entering .cortex-section-group:nth-child(7) { animation-delay: 700ms; }
.cortex-panel--entering .cortex-section-group:nth-child(8) { animation-delay: 800ms; }

/* Divider between groups \u2014 space does the heavy lifting, rule is accent */
.cortex-section-group + .cortex-section-group {
  border-top: 1px solid var(--cx-rule);
}

/* Resize handle between Elements and the next section \u2014 replaces the
   standard group divider so there's only one visual line. */
.cortex-section-resize {
  cursor: row-resize;
  height: 5px;
  margin: -2px 0;
  position: relative;
}
.cortex-section-resize::after {
  content: '';
  position: absolute;
  left: 0;
  right: 0;
  top: 2px;
  height: 1px;
  background: var(--cx-rule);
}
.cortex-section-resize:hover {
  background: var(--cx-select-muted);
}
.cortex-section-resize + .cortex-section-group {
  border-top: none;
}

.cortex-section-group__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--cx-sp-3);
  padding: var(--cx-sp-5) var(--cx-sp-5) var(--cx-sp-4);
}

/* Sections with an empty state (Background, Border, Effects \u2014 those with a
   \`+\` header-action button for adding the first value) need balanced
   vertical padding so the label visually centers against the 28px add
   button. Without this, the 8px bottom vs 12px top shifts the label 2px
   off center. \`:has()\` scopes this to exactly the headers that render a
   header-action slot, so the other 5 sections (Position, Layout, Appearance,
   Typography, Spacing \u2014 content always rendered) keep their current padding. */
.cortex-section-group__header:has(.cortex-section-group__header-action) {
  padding: var(--cx-sp-5);
}

.cortex-section-group__title {
  font-size: var(--cx-text-lg);
  font-weight: var(--cx-weight-heading);
  color: var(--cx-ink);
  letter-spacing: 0.01em;
}

/* Right-aligned slot inside the section-group header for per-section
   affordances (Typography T toggle, Position lock, etc.). Task 4 introduces
   the wrapper; Tasks 5-16 fill it with concrete controls. Flex child is
   constrained so long section titles still ellipsize cleanly. */
.cortex-section-group__header-action {
  display: flex;
  align-items: center;
  flex-shrink: 0;
}

.cortex-elements-header-actions {
  display: flex;
  align-items: center;
  gap: var(--cx-sp-1);
}

.cortex-elements-header-actions__btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border: none;
  background: transparent;
  border-radius: var(--cx-radius-sm);
  color: var(--cx-ink-ghost);
  cursor: pointer;
  padding: 0;
  transition: background 150ms ease-out, color 150ms ease-out, opacity 150ms ease-out, outline-color 150ms ease-out;
}

.cortex-elements-header-actions__btn:hover:not(:disabled) {
  background: var(--cx-well);
  color: var(--cx-ink-secondary);
}

.cortex-elements-header-actions__btn:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}

.cortex-elements-header-actions__btn--toggled-off {
  opacity: 0.4;
}

/* Sub-section label \u2014 lightweight divider + caption used inside a section
   group to introduce a nested block (e.g. Spacing inside Layout, per-corner
   radius inside Appearance). Lives next to the parent section-group rules
   because the two evolve together. */
.cortex-subsection-label {
  font-size: var(--cx-text-md);
  font-weight: var(--cx-weight-heading);
  color: var(--cx-ink-ghost);
  padding: 8px 0;
  margin: 0;
}

.cortex-section-group__content {
  display: flex;
  flex-direction: column;
  padding: 0 var(--cx-sp-5) var(--cx-sp-5);
  gap: var(--cx-sp-5);
}

/* When a section has nothing to render (e.g. Background with no fill, Border
   with no border) the SectionGroup wrapper still mounts but its content div
   becomes :empty. Drop the bottom padding so the group collapses to just the
   header row \u2014 otherwise the empty white space below the header reads as a
   vertical rhythm bug. Preact doesn't emit whitespace text nodes from
   \`{false && ...}\` conditional children, so :empty matches reliably. */
.cortex-section-group__content:empty {
  padding-bottom: 0;
}

/* \u2500\u2500 Property section wrapper \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */

.cortex-collapsible {
  display: flex;
  flex-direction: column;
  gap: var(--cx-sp-3);
}

.cortex-collapsible__header {
  display: flex;
  align-items: center;
  gap: var(--cx-sp-2);
  min-width: 0;
}

.cortex-collapsible__label {
  font-size: var(--cx-text-sm);
  font-weight: var(--cx-weight-label);
  letter-spacing: 0.01em;
  color: var(--cx-ink-ghost);
}

.cortex-collapsible__summary {
  font-size: var(--cx-text-sm);
  font-weight: var(--cx-weight-value);
  color: var(--cx-ink);
  font-family: var(--cx-mono);
  letter-spacing: -0.02em;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.cortex-collapsible__btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  flex-shrink: 0;
  margin-left: auto;
  border: none;
  background: transparent;
  color: var(--cx-ink-tertiary);
  cursor: pointer;
  border-radius: var(--cx-radius-sm);
  padding: 0;
  font-size: 14px;
  transition: background 150ms ease-out, color 150ms ease-out, outline-color 150ms ease-out;
}

.cortex-collapsible__btn:hover {
  background: var(--cx-well);
  color: var(--cx-ink-secondary);
}

.cortex-collapsible__btn--remove:hover {
  color: var(--cx-destructive);
  background: var(--cx-destructive-surface);
}

.cortex-collapsible__btn:active {
  transform: scale(0.92);
}

.cortex-collapsible__btn:focus-visible {
  outline: 2px solid transparent;
  outline-color: var(--cx-select-muted);
}

.cortex-collapsible__body {
  display: grid;
  grid-template-rows: 1fr;
  transition: grid-template-rows 150ms ease-out;
}

.cortex-collapsible[data-has-value="false"] .cortex-collapsible__body {
  grid-template-rows: 0fr;
}

.cortex-collapsible__body-inner {
  overflow: hidden;
  min-height: 0;
}

.cortex-spacing-group__toggle {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  border: none;
  background: transparent;
  color: var(--cx-ink-tertiary);
  cursor: pointer;
  border-radius: var(--cx-radius-sm);
  padding: 0;
  font-size: 14px;
  transition: background 150ms ease-out, color 150ms ease-out, outline-color 150ms ease-out, transform 100ms ease-out;
}

.cortex-spacing-group__toggle:hover {
  background: var(--cx-well);
  color: var(--cx-ink-secondary);
}

.cortex-spacing-group__row {
  display: flex;
  gap: var(--cx-sp-3);
  align-items: center;
}

.cortex-spacing-group__grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--cx-sp-3);
}

.cortex-spacing-section__toggles {
  display: flex;
  gap: var(--cx-sp-3);
}

.cortex-spacing-section__toggle-group {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: var(--cx-sp-1);
}

/* \u2500\u2500 Source attribution \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */

.cortex-attribution {
  font-size: var(--cx-text-sm);
  color: var(--cx-ink-tertiary);
  text-align: right;
  margin-top: var(--cx-sp-2);
}

.cortex-attribution--clickable {
  cursor: pointer;
  color: var(--cx-ink-secondary);
}

.cortex-attribution--clickable:hover {
  color: var(--cx-select);
  text-decoration: underline;
}

.cortex-attribution--italic {
  font-style: italic;
}

.cortex-attribution--writing {
  color: var(--cx-ink-secondary);
}

.cortex-attribution--processing {
  color: var(--cx-select);
}

.cortex-attribution--completed {
  color: var(--cx-success);
  animation: cortex-flash 500ms ease-out;
}

.cortex-attribution--error {
  color: var(--cx-warning);
  cursor: help;
}

@keyframes cortex-flash {
  from { background: rgba(34, 197, 94, 0.15); }
  to   { background: transparent; }
}

/* \u2500\u2500 Segmented control \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */

.cortex-segmented {
  display: flex;
  align-items: center;
  position: relative;
  background: var(--cx-well);
  border-radius: var(--cx-radius-md);
  padding: 2px;
  gap: 0;
  box-shadow: var(--cx-well-shadow);
}

.cortex-segmented__indicator {
  position: absolute;
  top: 2px;
  left: 0;
  height: calc(100% - 4px);
  background: var(--cx-paper);
  border-radius: var(--cx-radius-sm);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.06);
  transition: transform 150ms ease-out, width 150ms ease-out;
  pointer-events: none;
}

.cortex-segmented__option {
  position: relative;
  z-index: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--cx-sp-2);
  height: 28px;
  padding: 0 10px;
  border: none;
  background: transparent;
  font-size: var(--cx-text-sm);
  font-weight: var(--cx-weight-value);
  color: var(--cx-ink-tertiary);
  cursor: pointer;
  white-space: nowrap;
  border-radius: var(--cx-radius-sm);
  flex: 1;
  transition: color 150ms ease-out;
}

.cortex-segmented__option:hover:not(.cortex-segmented__option--active) {
  color: var(--cx-ink);
}

.cortex-segmented__option--active {
  color: var(--cx-ink);
  font-weight: var(--cx-weight-value);
}

.cortex-segmented--disabled .cortex-segmented__indicator {
  opacity: 0;
}

.cortex-segmented--disabled .cortex-segmented__option,
.cortex-segmented--disabled .cortex-segmented__option:hover:not(.cortex-segmented__option--active) {
  color: var(--cx-ink-tertiary);
  cursor: not-allowed;
}

.cortex-segmented--sm .cortex-segmented__option {
  height: 22px;
  padding: 0 var(--cx-sp-3);
  min-width: 28px;
  flex: 0;
}

.cortex-segmented--mixed {
  outline: 1px dashed var(--cx-rule);
  outline-offset: -1px;
}

.cortex-segmented--mixed .cortex-segmented__option,
.cortex-segmented--mixed .cortex-segmented__option:hover:not(.cortex-segmented__option--active) {
  color: transparent;
}

.cortex-segmented__mixed-label {
  position: absolute;
  inset: 2px;
  z-index: 2;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--cx-radius-sm);
  background: var(--cx-well);
  color: var(--cx-ink-tertiary);
  font-family: var(--cx-sans);
  font-size: var(--cx-text-sm);
  font-weight: var(--cx-weight-value);
  pointer-events: none;
}

.cortex-segmented__icon {
  display: inline-flex;
  align-items: center;
  font-size: 14px;
  line-height: 1;
}

/* \u2500\u2500 Dropdown \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */

.cortex-dropdown {
  position: relative;
  width: 100%;
}

.cortex-dropdown__trigger {
  display: flex;
  align-items: center;
  width: 100%;
  height: 28px;
  padding: 0 var(--cx-sp-4);
  background: var(--cx-well);
  border: none;
  border-radius: var(--cx-radius-md);
  cursor: pointer;
  font-size: var(--cx-text-md);
  font-weight: var(--cx-weight-value);
  color: var(--cx-ink);
  text-align: left;
  box-shadow: var(--cx-well-shadow);
  transition: background 150ms ease-out;
}

.cortex-dropdown__trigger:hover {
  background: var(--cx-btn-hover);
}

.cortex-dropdown__value {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.cortex-dropdown__chevron {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  color: var(--cx-ink-tertiary);
  margin-left: var(--cx-sp-2);
  transition: transform 150ms ease-out;
}

.cortex-dropdown__chevron--open {
  transform: rotate(180deg);
}

.cortex-dropdown__backdrop {
  position: fixed;
  inset: 0;
  z-index: 1;
}

.cortex-dropdown__popover {
  z-index: 2;
  min-width: 120px;
  max-height: 200px;
  background: var(--cx-paper);
  animation: cortex-popover-enter 150ms ease-out;
  border: 1px solid var(--cx-rule);
  border-radius: var(--cx-radius-lg);
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.1), 0 1px 4px rgba(0, 0, 0, 0.06);
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.cortex-dropdown__filter {
  padding: var(--cx-sp-3) var(--cx-sp-4);
  border: none;
  border-bottom: 1px solid var(--cx-well);
  font-size: var(--cx-text-lg);
  color: var(--cx-ink);
  background: transparent;
  outline: none;
}

.cortex-dropdown__filter::placeholder {
  color: var(--cx-ink-tertiary);
}

.cortex-dropdown__list {
  overflow-y: auto;
  max-height: 160px;
  padding: var(--cx-sp-2) 0;
}

.cortex-dropdown__option {
  padding: var(--cx-sp-3) var(--cx-sp-4);
  font-size: var(--cx-text-lg);
  color: var(--cx-ink);
  cursor: pointer;
}

.cortex-dropdown__option:hover,
.cortex-dropdown__option--active {
  background: var(--cx-well);
  color: var(--cx-ink);
}

.cortex-dropdown__option--selected {
  font-weight: var(--cx-weight-value);
  color: var(--cx-select);
}

.cortex-dropdown__empty {
  padding: var(--cx-sp-4);
  font-size: var(--cx-text-md);
  color: var(--cx-ink-tertiary);
  text-align: center;
}

/* \u2500\u2500 PositionDropdown (Task 5 / ZF0-1183) \u2500\u2500\u2500\u2500\u2500 */
/* Purpose-built picker for CSS \`position\` \u2014 icon + label + chevron trigger,
   popover listing the 5 enum options with per-option icon + checkmark and
   a description bar at the bottom. Shares @floating-ui positioning with
   Dropdown but does NOT share DOM/CSS \u2014 keeping it separate avoids
   polluting Dropdown's filter-based API and keeps the option-row layout
   (icon / label / check) isolated from the generic dropdown styles. */

.cortex-position-dropdown {
  position: relative;
  width: 100%;
}

.cortex-position-dropdown__trigger {
  display: flex;
  align-items: center;
  gap: var(--cx-sp-3);
  width: 100%;
  height: 28px;
  padding: 0 var(--cx-sp-4);
  background: var(--cx-well);
  border: none;
  border-radius: var(--cx-radius-md);
  cursor: pointer;
  font-size: var(--cx-text-md);
  font-weight: var(--cx-weight-label);
  color: var(--cx-ink);
  text-align: left;
  box-shadow: var(--cx-well-shadow);
  transition: background 150ms ease-out;
}

.cortex-position-dropdown__trigger:hover:not(:disabled) {
  background: var(--cx-btn-hover);
}

.cortex-position-dropdown__trigger:disabled {
  cursor: not-allowed;
  opacity: 0.5;
}

.cortex-position-dropdown__trigger-icon {
  display: inline-flex;
  flex-shrink: 0;
  color: var(--cx-ink-secondary);
}

.cortex-position-dropdown__trigger-label {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.cortex-position-dropdown__chevron {
  display: inline-flex;
  flex-shrink: 0;
  color: var(--cx-ink-tertiary);
  transition: transform 150ms ease-out;
}

.cortex-position-dropdown__chevron--open {
  transform: rotate(180deg);
}

.cortex-position-dropdown__backdrop {
  position: fixed;
  inset: 0;
  z-index: 1;
}

.cortex-position-dropdown__popover {
  z-index: 2;
  min-width: 180px;
  background: var(--cx-paper);
  border: 1px solid var(--cx-rule);
  border-radius: var(--cx-radius-lg);
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.1), 0 1px 4px rgba(0, 0, 0, 0.06);
  animation: cortex-popover-enter 150ms ease-out;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.cortex-position-dropdown__list {
  padding: var(--cx-sp-2) 0;
  display: flex;
  flex-direction: column;
}

.cortex-position-dropdown__option {
  display: flex;
  align-items: center;
  gap: var(--cx-sp-3);
  height: 32px;
  padding: 0 var(--cx-sp-4);
  font-size: var(--cx-text-lg);
  font-weight: var(--cx-weight-label);
  color: var(--cx-ink);
  cursor: pointer;
}

.cortex-position-dropdown__option--highlighted {
  background: var(--cx-well);
}

.cortex-position-dropdown__option--selected {
  color: var(--cx-select);
  font-weight: var(--cx-weight-value);
}

.cortex-position-dropdown__option-icon {
  display: inline-flex;
  flex-shrink: 0;
  color: currentColor;
}

.cortex-position-dropdown__option-label {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.cortex-position-dropdown__option-check {
  display: inline-flex;
  flex-shrink: 0;
  color: var(--cx-select);
}

.cortex-position-dropdown__description {
  padding: var(--cx-sp-3) var(--cx-sp-4);
  border-top: 1px solid var(--cx-rule);
  background: var(--cx-well);
  font-size: var(--cx-text-sm);
  font-weight: var(--cx-weight-label);
  color: var(--cx-ink-secondary);
  line-height: 1.4;
}

/* \u2500\u2500 Token preset popover \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */
/* Project-token list with empty-state branch when no tokens are detected.
   Positioned via @floating-ui computePosition with position:fixed so it escapes
   the panel's shadow-DOM overflow context. */

.cortex-token-preset-popover {
  z-index: 2;
  min-width: 200px;
  background: var(--cx-paper);
  border: 1px solid var(--cx-rule);
  border-radius: var(--cx-radius-lg);
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.1), 0 1px 4px rgba(0, 0, 0, 0.06);
  animation: cortex-popover-enter 150ms ease-out;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.cortex-token-preset-popover__empty-state {
  display: flex;
  flex-direction: column;
  gap: var(--cx-sp-1);
  padding: var(--cx-sp-3);
}

.cortex-token-preset-popover__empty-state-title {
  font-size: var(--cx-text-sm);
  font-weight: var(--cx-weight-value);
  color: var(--cx-ink);
  line-height: 1.3;
}

.cortex-token-preset-popover__empty-state-hint {
  font-size: var(--cx-text-xs);
  font-weight: var(--cx-weight-label);
  color: var(--cx-ink-secondary);
  line-height: 1.4;
}

.cortex-token-preset-popover__empty-state-hint code {
  font-family: var(--cx-mono);
  font-size: var(--cx-text-xs);
  background: var(--cx-well);
  padding: 0 var(--cx-sp-1);
  border-radius: var(--cx-radius-sm);
}

.cortex-token-preset-popover__list {
  overflow-y: auto;
  max-height: 200px;
  padding: var(--cx-sp-2) 0;
  display: flex;
  flex-direction: column;
}

.cortex-token-preset-popover__list-row {
  display: flex;
  align-items: center;
  gap: var(--cx-sp-3);
  height: 28px;
  padding: 0 var(--cx-sp-3);
  background: none;
  border: none;
  cursor: pointer;
  text-align: left;
  transition: background 100ms ease-out;
}

.cortex-token-preset-popover__list-row:hover {
  background: var(--cx-well);
}

.cortex-token-preset-popover__list-row:focus-visible {
  background: var(--cx-well);
  outline: 2px solid var(--cx-select-muted);
  outline-offset: -2px;
}

.cortex-token-preset-popover__list-name {
  flex: 1;
  min-width: 0;
  font-family: var(--cx-mono);
  font-size: var(--cx-text-sm);
  font-weight: var(--cx-weight-label);
  color: var(--cx-ink);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.cortex-token-preset-popover__list-value {
  flex-shrink: 0;
  font-family: var(--cx-mono);
  font-size: var(--cx-text-sm);
  font-weight: var(--cx-weight-label);
  color: var(--cx-ink-secondary);
}

/* \u2500\u2500 Layout section \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */

.cortex-layout-section {
  display: flex;
  flex-direction: column;
  gap: var(--cx-sp-6);
}

.cortex-layout-section__group {
  display: flex;
  flex-direction: column;
  gap: var(--cx-sp-3);
}

.cortex-layout-section__reveal {
  /* no overflow: hidden \u2014 sections are conditionally rendered, not animated */
}

.cortex-layout-section__sizing {
  display: flex;
  gap: var(--cx-sp-3);
  align-items: center;
}

.cortex-lock-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border: none;
  background: transparent;
  color: var(--cx-ink-tertiary);
  cursor: pointer;
  border-radius: var(--cx-radius-sm);
  flex-shrink: 0;
  padding: 0;
  transition: background 150ms ease-out, color 150ms ease-out, outline-color 150ms ease-out, transform 100ms ease-out;
}

.cortex-lock-btn:hover {
  background: var(--cx-well);
  color: var(--cx-ink-secondary);
}

.cortex-lock-btn--active {
  color: var(--cx-select);
}

.cortex-lock-btn--active:hover {
  color: var(--cx-select-hover);
}

.cortex-lock-btn--disabled,
.cortex-lock-btn--disabled:hover {
  background: transparent;
  color: var(--cx-ink-ghost);
  cursor: not-allowed;
  opacity: 0.55;
  transform: none;
}

/* \u2500\u2500 Typography section \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */

.cortex-typography-section {
  display: flex;
  flex-direction: column;
  gap: var(--cx-sp-6);
}

/* Typography v2 rows */
.cortex-typography-section__row {
  display: flex;
  align-items: center;
  gap: var(--cx-sp-3);
  position: relative; /* picker popover anchors against this */
}

/* Family dropdown + trailing T button row */
.cortex-typography-section__row--with-t > .cortex-dropdown {
  flex: 1;
  min-width: 0;
}

/* Color input + trailing SwatchBook button row */
.cortex-typography-section__row--with-swatch > .cortex-color-input {
  flex: 1;
  min-width: 0;
}

.cortex-typography-section__field {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: var(--cx-sp-2);
}

/* Trailing icon buttons (T for typography link, SwatchBook for color link) */
.cortex-typography-section__t-button,
.cortex-typography-section__swatchbook-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  padding: 0;
  border: 1px solid var(--cx-rule);
  background: var(--cx-well);
  color: var(--cx-ink-ghost);
  border-radius: var(--cx-radius-sm);
  cursor: pointer;
  flex-shrink: 0;
  transition: color 150ms ease-out, border-color 150ms ease-out;
}

.cortex-typography-section__t-button:hover,
.cortex-typography-section__swatchbook-button:hover {
  color: var(--cx-ink);
  border-color: var(--cx-select);
}

.cortex-typography-section__t-button:focus-visible,
.cortex-typography-section__swatchbook-button:focus-visible {
  outline: 2px solid var(--cx-select);
  outline-offset: 2px;
}

/* Alignment row: horizontal + vertical segmented controls side by side */
.cortex-typography-section__align-row {
  display: flex;
  gap: var(--cx-sp-3);
}

.cortex-typography-section__align-row > .cortex-segmented-control {
  flex: 1;
  min-width: 0;
}

/* \u2500\u2500 TextComponentPicker popover \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */
.cortex-text-component-picker {
  position: absolute;
  top: calc(100% + var(--cx-sp-1));
  left: 0;
  right: 0;
  z-index: 11;
  display: flex;
  flex-direction: column;
  background: var(--cx-paper);
  border: 1px solid var(--cx-rule);
  border-radius: var(--cx-radius-sm);
  box-shadow:
    0 8px 24px rgb(0 0 0 / 0.12),
    0 2px 6px rgb(0 0 0 / 0.06);
  max-height: 240px;
  overflow-y: auto;
  padding: var(--cx-sp-1);
}

.cortex-text-component-picker--empty {
  padding: var(--cx-sp-3);
  color: var(--cx-ink-ghost);
  font-style: italic;
  font-size: var(--cx-text-sm);
  text-align: center;
}

.cortex-text-component-picker__option {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--cx-sp-3);
  padding: var(--cx-sp-2) var(--cx-sp-3);
  background: transparent;
  border: none;
  border-radius: var(--cx-radius-sm);
  color: var(--cx-ink);
  font: inherit;
  text-align: left;
  cursor: pointer;
}

.cortex-text-component-picker__option:hover {
  background: var(--cx-well);
}

.cortex-text-component-picker__option--active {
  background: color-mix(in srgb, var(--cx-select) 12%, transparent);
  color: var(--cx-select);
}

.cortex-text-component-picker__name {
  font-family: var(--cx-mono);
  font-size: var(--cx-text-md);
}

.cortex-text-component-picker__meta {
  font-size: var(--cx-text-xs);
  color: var(--cx-ink-ghost);
  white-space: nowrap;
}

/* \u2500\u2500 ColorChipPicker popover \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */
.cortex-color-chip-picker {
  position: absolute;
  top: calc(100% + var(--cx-sp-1));
  left: 0;
  right: 0;
  z-index: 11;
  display: flex;
  flex-direction: column;
  background: var(--cx-paper);
  border: 1px solid var(--cx-rule);
  border-radius: var(--cx-radius-sm);
  box-shadow:
    0 8px 24px rgb(0 0 0 / 0.12),
    0 2px 6px rgb(0 0 0 / 0.06);
  max-height: 240px;
  overflow-y: auto;
  padding: var(--cx-sp-1);
}

.cortex-color-chip-picker--empty {
  padding: var(--cx-sp-3);
  color: var(--cx-ink-ghost);
  font-style: italic;
  font-size: var(--cx-text-sm);
  text-align: center;
}

.cortex-color-chip-picker__option {
  display: grid;
  grid-template-columns: 18px 1fr auto;
  align-items: center;
  gap: var(--cx-sp-3);
  padding: var(--cx-sp-2) var(--cx-sp-3);
  background: transparent;
  border: none;
  border-radius: var(--cx-radius-sm);
  color: var(--cx-ink);
  font: inherit;
  text-align: left;
  cursor: pointer;
}

.cortex-color-chip-picker__option:hover {
  background: var(--cx-well);
}

.cortex-color-chip-picker__option--active {
  background: color-mix(in srgb, var(--cx-select) 12%, transparent);
  color: var(--cx-select);
}

.cortex-color-chip-picker__group-label {
  padding: var(--cx-sp-2) var(--cx-sp-3) var(--cx-sp-1);
  color: var(--cx-ink-ghost);
  font-size: var(--cx-text-xs);
  font-weight: var(--cx-weight-label);
  letter-spacing: 0.01em;
  text-transform: uppercase;
}

.cortex-color-chip-picker__divider {
  height: 1px;
  margin: var(--cx-sp-1) var(--cx-sp-2);
  background: var(--cx-rule);
}

.cortex-color-chip-picker__swatch {
  width: 16px;
  height: 16px;
  border-radius: var(--cx-radius-sm);
  border: 1px solid var(--cx-rule);
}

.cortex-color-chip-picker__name {
  font-family: var(--cx-mono);
  font-size: var(--cx-text-md);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.cortex-color-chip-picker__hex {
  font-family: var(--cx-mono);
  font-size: var(--cx-text-xs);
  color: var(--cx-ink-ghost);
  white-space: nowrap;
}

/* \u2500\u2500 Color input \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */

.cortex-color-input {
  display: flex;
  align-items: center;
  gap: var(--cx-sp-3);
}

.cortex-color-input__swatch {
  width: 20px;
  height: 20px;
  border-radius: 3px;
  border: 1px solid var(--cx-rule);
  flex-shrink: 0;
  cursor: pointer;
  padding: 0;
  transition: border-color 150ms ease-out, box-shadow 150ms ease-out;
}

.cortex-color-input__swatch:hover {
  border-color: var(--cx-rule);
}

.cortex-color-input__swatch:focus-visible {
  box-shadow: 0 0 0 2px var(--cx-select-muted);
}

.cortex-color-input__native {
  position: absolute;
  opacity: 0;
  width: 0;
  height: 0;
  pointer-events: none;
}

.cortex-color-input__hex {
  /* Equal flex share with opacity (\`flex: 1\` below). Previously 2 (hex
     dominant), but once BorderSection grew a second trailing button the
     2:1 bias left opacity below its ~80px min-content floor and it
     collapsed to zero width. 1:1 gives both slots a comfortable allocation
     in single- AND double-trailing layouts without needing a scoped
     min-width override on opacity. Hex at ~92px (Border 2-trailing) still
     fits the size={9} input with "#ffffff" + padding with room to spare. */
  flex: 1;
  height: 28px;
  padding: 0 var(--cx-sp-4);
  background: var(--cx-well);
  border: none;
  border-radius: var(--cx-radius-md);
  font-size: var(--cx-text-lg);
  line-height: 1;
  font-family: var(--cx-mono);
  color: var(--cx-ink);
  box-shadow: var(--cx-well-shadow);
  outline: none;
  transition: box-shadow 150ms ease-out;
}

.cortex-color-input__hex:focus {
  box-shadow: 0 0 0 2px var(--cx-select-muted);
}

/* Opacity takes 1/3 of the row's free space (hex takes 2/3). Flex arbitrates
   the allocation; the inner NumericInput fills its slot via the existing
   \`.cortex-numeric-input__value { width: 100% }\` rule just like every other
   constrained NumericInput consumer. The HTML \`size={4}\` on NumericInput's
   inner <input> keeps the flex min-content small enough that this 1/3 slot
   actually fits without forcing row overflow. */
.cortex-color-input__opacity {
  flex: 1;
}

/* \u2500\u2500 Color picker popover \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */

.cortex-color-picker__backdrop {
  position: fixed;
  inset: 0;
  z-index: 11;
}

.cortex-color-picker__popover {
  z-index: 11;
  width: 220px;
  background: var(--cx-paper);
  animation: cortex-popover-enter 150ms ease-out;
  border: 1px solid var(--cx-rule);
  border-radius: var(--cx-radius-lg);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12), 0 2px 6px rgba(0, 0, 0, 0.06);
  overflow: hidden;
  padding: var(--cx-sp-4);
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.cortex-color-picker__popover hex-color-picker {
  width: 100%;
  height: 150px;
}

.cortex-color-picker__popover hex-color-picker::part(saturation) {
  border-radius: var(--cx-radius-md) var(--cx-radius-md) 0 0;
}

.cortex-color-picker__popover hex-color-picker::part(hue) {
  height: 12px;
  border-radius: var(--cx-radius-md);
}

.cortex-color-picker__popover hex-color-picker::part(saturation-pointer) {
  width: 16px;
  height: 16px;
  border: 2px solid white;
  outline: 1px solid rgba(0, 0, 0, 0.3);
}

.cortex-color-picker__popover hex-color-picker::part(hue-pointer) {
  width: 14px;
  height: inherit;
  border-radius: 3px;
  border: 2px solid white;
}

.cortex-color-picker__inputs {
  display: flex;
  flex-direction: column;
  gap: var(--cx-sp-2);
}

.cortex-color-picker__hex-row,
.cortex-color-picker__alpha-row {
  display: flex;
  align-items: center;
  gap: var(--cx-sp-3);
}

.cortex-color-picker__label {
  font-size: var(--cx-text-sm);
  color: var(--cx-ink-secondary);
  width: 32px;
  flex-shrink: 0;
}

.cortex-color-picker__hex-input,
.cortex-color-picker__alpha-input {
  flex: 1;
  height: 28px;
  padding: 0 var(--cx-sp-3);
  background: var(--cx-well);
  border: none;
  border-radius: var(--cx-radius-sm);
  font: 12px/1 ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  color: var(--cx-ink);
  outline: none;
  box-shadow: var(--cx-well-shadow);
}

.cortex-color-picker__hex-input:focus,
.cortex-color-picker__alpha-input:focus {
  box-shadow: 0 0 0 2px var(--cx-select-muted);
}

.cortex-color-picker__unit {
  font-size: var(--cx-text-sm);
  color: var(--cx-ink-tertiary);
}

.cortex-color-picker__swatches {
  display: grid;
  grid-template-columns: repeat(8, 1fr);
  gap: 3px;
}

.cortex-color-picker__swatch {
  width: 100%;
  aspect-ratio: 1;
  border-radius: 3px;
  border: 1px solid var(--cx-rule-soft);
  cursor: pointer;
}

.cortex-color-picker__swatch:hover {
  border-color: var(--cx-rule);
  transform: scale(1.15);
}

.cortex-color-picker__swatch--active {
  border-color: var(--cx-select);
  box-shadow: 0 0 0 1px var(--cx-select);
}

/* \u2500\u2500 Background section \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */

/* Column-flex wrapper matching Typography's \`__row--full\` pattern. Single
   child (ColorInput in raw mode OR a row sub-wrapper for the TokenChip
   path) stretches horizontally via default \`align-items: stretch\`, with
   content min-width protection preserved \u2014 no scoped \`flex: 1\` needed on
   ColorInput, no \`min-width: 0\` override needed to compensate. */
.cortex-background-section {
  display: flex;
  flex-direction: column;
}

/* Row wrapper used only in the TokenChip path where we have two children
   (TokenChip + trailing IconButton) that need to sit side by side. Raw
   ColorInput mode puts its own trailing inside ColorInput's flex container,
   so this wrapper isn't used there. */
.cortex-background-section__row {
  display: flex;
  align-items: center;
  gap: var(--cx-sp-3);
  position: relative;
}

.cortex-background-section__row > .cortex-color-input,
.cortex-border-section__token-row > .cortex-color-input {
  flex: 1;
  min-width: 0;
}

/* \u2500\u2500 Border section \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */

.cortex-border-section {
  display: flex;
  flex-direction: column;
  gap: var(--cx-sp-6);
}

/* Column-flex wrapper matching Typography's \`__row--full\` pattern \u2014 see
   \`.cortex-background-section\` for the rationale. The single child (ColorInput
   in raw mode, or the \`__token-row\` sub-wrapper in TokenChip mode) stretches
   horizontally via default \`align-items: stretch\`, preserving content
   min-width protection without any scoped \`flex: 1\` / \`min-width: 0\`. */
.cortex-border-section__color-row {
  display: flex;
  flex-direction: column;
}

/* Row sub-wrapper used only in the TokenChip path where we need TokenChip +
   eye IconButton side-by-side. Raw ColorInput mode puts its own trailing
   inside ColorInput, so this sub-wrapper isn't used there. */
.cortex-border-section__token-row {
  display: flex;
  align-items: center;
  gap: var(--cx-sp-3);
  position: relative;
}

.cortex-border-section__width-row {
  display: flex;
  align-items: center;
  gap: var(--cx-sp-3);
}

.cortex-border-section__width-row > .cortex-numeric-input {
  flex: 1;
  min-width: 0;
}

.cortex-border-section__per-side {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--cx-sp-3);
}

/* \u2500\u2500 Effects section (consolidated shadow + blur) \u2500\u2500 */

.cortex-effects-section {
  display: flex;
  flex-direction: column;
  gap: var(--cx-sp-6);
}

.cortex-effects-section__shadows {
  display: flex;
  flex-direction: column;
  gap: var(--cx-sp-6);
}

.cortex-effects-section__row {
  display: flex;
  flex-direction: column;
  gap: var(--cx-sp-3);
}

.cortex-effects-section__row-header {
  display: flex;
  align-items: center;
  gap: var(--cx-sp-2);
}

/* Sized to match the adjacent IconButtons (eye + minus) at 28\xD728 so the
   row header has uniform visual rhythm. The old 20\xD720 + 10\xD710 SVG override
   was tuned for the ChevronRight; the BoxShadow icon renders at its natural
   size={14} via the JSX prop \u2014 no SVG size override needed. The rotate(90deg)
   on expanded state is also gone (a shadow preview icon shouldn't spin). */
.cortex-effects-section__expand-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  flex-shrink: 0;
  border: none;
  background: transparent;
  color: var(--cx-ink-ghost);
  cursor: pointer;
  padding: 0;
  border-radius: var(--cx-radius-sm);
  transition: background 150ms ease-out, color 150ms ease-out;
}

.cortex-effects-section__expand-btn:hover {
  background: var(--cx-btn-hover);
  color: var(--cx-ink-secondary);
}

.cortex-effects-section__type {
  flex: 1;
  min-width: 0;
}

.cortex-effects-section__detail {
  display: flex;
  flex-direction: column;
  gap: var(--cx-sp-3);
  padding: var(--cx-sp-3);
  background: var(--cx-vellum);
  border-radius: var(--cx-radius-sm);
}

.cortex-effects-section__grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--cx-sp-3);
}

.cortex-effects-section__blur-controls {
  display: flex;
  flex-direction: column;
  gap: var(--cx-sp-3);
}

/* Shared dimming for forced-state property comparison (all sections) */
.cortex-control--dimmed {
  opacity: 0.4;
  transition: opacity 150ms ease-out;
}

/* \u2500\u2500 Appearance section (Task 3 / ZF0-1181) \u2500\u2500
 *
 * Opacity, corner-radius, and visibility live here. Dimming uses the shared
 * .cortex-control--dimmed class (CTF7).
 */
.cortex-appearance-section {
  display: flex;
  flex-direction: column;
  gap: var(--cx-sp-3);
}

.cortex-appearance-section__row {
  display: flex;
  align-items: center;
  gap: var(--cx-sp-3);
}

.cortex-appearance-section__item {
  flex: 1;
  min-width: 0;
  display: flex;
}

.cortex-appearance-section__item > .cortex-numeric-input {
  flex: 1;
  min-width: 0;
}

.cortex-appearance-section__corner-toggle,
.cortex-appearance-section__visibility-toggle {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  flex: 0 0 28px;
  padding: 0;
  border: none;
  border-radius: var(--cx-radius-sm);
  background: var(--cx-paper);
  color: var(--cx-ink-secondary);
  cursor: pointer;
}

.cortex-appearance-section__corner-toggle:hover,
.cortex-appearance-section__visibility-toggle:hover {
  background: var(--cx-btn-hover);
  color: var(--cx-ink);
}

.cortex-appearance-section__corner-toggle--active,
.cortex-appearance-section__visibility-toggle--hidden {
  background: var(--cx-select-muted);
  color: var(--cx-select);
}

.cortex-appearance-section__corners {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--cx-sp-3);
}

/* \u2500\u2500 State Lens (on selection overlay) \u2500\u2500\u2500\u2500\u2500\u2500\u2500 */

.cortex-state-lens {
  display: flex;
  gap: 0;
  padding: 2px;
  background: var(--cx-well);
  border-radius: var(--cx-radius-md);
  position: fixed;
  left: 0;
  top: 0;
  pointer-events: auto;
  z-index: 1;
  white-space: nowrap;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08), 0 1px 3px rgba(0, 0, 0, 0.04);
}

.cortex-state-lens__btn {
  font-size: var(--cx-text-sm);
  font-family: inherit;
  padding: 3px 10px;
  border: none;
  border-radius: var(--cx-radius-sm);
  background: transparent;
  color: var(--cx-ink-secondary);
  cursor: pointer;
  white-space: nowrap;
  line-height: 1.4;
}

.cortex-state-lens__btn:hover:not(.cortex-state-lens__btn--active) {
  color: var(--cx-ink);
}

.cortex-state-lens__btn--active {
  background: var(--cx-paper);
  color: var(--cx-ink);
  font-weight: var(--cx-weight-value);
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.06);
}

/* \u2500\u2500 Pseudo tabs (in panel) \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */

.cortex-pseudo-tabs {
  display: flex;
  flex-basis: 100%;
  border-bottom: 1px solid var(--cx-rule);
  padding: 0 12px;
  margin-top: -2px;
}

.cortex-pseudo-tab {
  font-size: var(--cx-text-sm);
  font-family: inherit;
  font-weight: var(--cx-weight-value);
  padding: 5px 10px;
  border: none;
  border-bottom: 2px solid transparent;
  background: transparent;
  color: var(--cx-ink-tertiary);
  cursor: pointer;
  transition: color 150ms ease-out, border-color 150ms ease-out;
}

.cortex-pseudo-tab:hover {
  color: var(--cx-ink-secondary);
}

.cortex-pseudo-tab:focus-visible {
  outline: 2px solid var(--cx-select-muted);
  outline-offset: 1px;
}

.cortex-pseudo-tab--active {
  color: var(--cx-select);
  border-bottom-color: var(--cx-select);
}

/* \u2500\u2500 Library badge (in panel header) \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */

.cortex-panel-header__library {
  font-style: italic;
  color: var(--cx-ink-tertiary);
  font-size: var(--cx-text-xs);
  margin-left: var(--cx-sp-2);
}

/* \u2500\u2500 Dimmed properties (in panel sections) \u2500\u2500\u2500 */

.cortex-dimmed {
  opacity: 0.5;
  transition: opacity 150ms ease-out;
}

/* \u2500\u2500 Toolbar \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */

.cortex-toolbar {
  position: fixed;
  left: 0;
  top: 0;
  display: inline-flex;
  align-items: center;
  gap: var(--cx-sp-3);
  background: var(--cx-paper);
  border: 1px solid var(--cx-rule);
  border-radius: var(--cx-radius-lg);
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.08), 0 1px 3px rgba(0, 0, 0, 0.04);
  pointer-events: auto;
  font-size: var(--cx-text-md);
  color: var(--cx-ink);
  padding: var(--cx-sp-3);
  animation: cortex-toolbar-fade-in 200ms ease-out;
}

@keyframes cortex-toolbar-fade-in {
  from { opacity: 0; }
  to   { opacity: 1; }
}

.cortex-toolbar--horizontal {
  flex-direction: row;
}

.cortex-toolbar--vertical {
  flex-direction: column;
}

.cortex-toolbar--snapping {
  will-change: transform;
  transition: transform 300ms cubic-bezier(0.16, 1, 0.3, 1);
}

.cortex-toolbar__grip {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 36px;
  cursor: grab;
  color: var(--cx-ink-faint);
  flex-shrink: 0;
  user-select: none;
  transition: color 150ms ease-out;
}

.cortex-toolbar__grip:hover {
  color: var(--cx-ink-ghost);
}

.cortex-toolbar__grip:active {
  cursor: grabbing;
  color: var(--cx-ink-tertiary);
}

.cortex-toolbar__btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border: none;
  background: transparent;
  border-radius: var(--cx-radius-lg-inner);
  cursor: pointer;
  color: var(--cx-ink-secondary);
  padding: 0;
  flex-shrink: 0;
  transition: background 150ms ease-out, color 150ms ease-out, transform 100ms ease-out, outline-color 150ms ease-out;
  outline: 2px solid transparent;
  outline-offset: 1px;
}

.cortex-toolbar__btn:hover {
  background: var(--cx-well);
  color: var(--cx-ink);
}

.cortex-toolbar__btn:active {
  transform: scale(0.95);
}

.cortex-toolbar__btn:focus-visible {
  outline-color: var(--cx-select-muted);
}

.cortex-toolbar__btn--close {
  color: var(--cx-ink-faint);
}

.cortex-toolbar__btn--close:hover {
  background: var(--cx-destructive-surface);
  color: var(--cx-destructive);
}

.cortex-toolbar__badge {
  font-size: var(--cx-text-sm);
  font-weight: var(--cx-weight-value);
  font-family: var(--cx-mono);
  font-variant-numeric: tabular-nums;
  color: var(--cx-ink);
  padding: 0 var(--cx-sp-4);
  height: 28px;
  line-height: 28px;
  background: var(--cx-well);
  border-radius: var(--cx-radius-sm);
  white-space: nowrap;
  border: none;
  cursor: pointer;
  transition: background 150ms ease-out, transform 100ms ease-out;
}

.cortex-toolbar__badge:hover {
  background: var(--cx-btn-hover);
}

.cortex-toolbar__badge:active {
  background: var(--cx-well-active);
  transform: scale(0.97);
}

.cortex-toolbar__badge:focus-visible {
  outline: 2px solid var(--cx-select-muted);
  outline-offset: 1px;
}

/* Mode switcher \u2014 segmented select/comment */
.cortex-toolbar__modes {
  display: flex;
  align-items: center;
  position: relative;
  background: var(--cx-well);
  border-radius: var(--cx-radius-lg);
  padding: 2px;
  gap: 0;
  box-shadow: var(--cx-well-shadow);
}

/* Indicator positioned via JS translateX(btn.offsetLeft).
   left:0 and offsetLeft share the same origin (padding edge).
   See CLAUDE.md "UI Positioning Rules" \u2014 never subtract padding. */
.cortex-toolbar__modes-indicator {
  position: absolute;
  top: 2px;
  left: 0;
  width: 36px;
  height: calc(100% - 4px);
  background: var(--cx-paper);
  border-radius: var(--cx-radius-md);
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
  transition: transform 200ms cubic-bezier(0.16, 1, 0.3, 1);
  pointer-events: none;
}

.cortex-toolbar__mode {
  width: 36px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  background: transparent;
  border-radius: var(--cx-radius-md);
  cursor: pointer;
  color: var(--cx-ink-tertiary);
  position: relative;
  z-index: 1;
  transition: color 150ms ease-out, transform 100ms ease-out, outline-color 150ms ease-out;
  outline: 2px solid transparent;
  outline-offset: 1px;
}

.cortex-toolbar__mode svg {
  width: 16px;
  height: 16px;
}

.cortex-toolbar__mode:hover {
  color: var(--cx-ink-secondary);
}

.cortex-toolbar__mode:active:not(.cortex-toolbar__mode--active) {
  color: var(--cx-ink);
  transform: scale(0.92);
}

.cortex-toolbar__mode--active {
  color: var(--cx-ink);
}

.cortex-toolbar__mode:focus-visible {
  outline-color: var(--cx-select-muted);
}

.cortex-toolbar__divider {
  width: 1px;
  height: 24px;
  background: var(--cx-rule);
  flex-shrink: 0;
}

/* \u2500\u2500 Comment Thread \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */

.cortex-thread {
  padding: var(--cx-sp-4) var(--cx-sp-5);
  border-top: 1px solid var(--cx-rule);
}

.cortex-thread__header {
  display: flex;
  align-items: flex-start;
  gap: var(--cx-sp-3);
}

.cortex-thread__status {
  flex-shrink: 0;
  font-size: var(--cx-text-md);
  line-height: 18px;
}

.cortex-thread__status--pending { color: var(--cx-ink-tertiary); }
.cortex-thread__status--acknowledged { color: var(--cx-select); }
.cortex-thread__status--resolved { color: var(--cx-success); }
.cortex-thread__status--dismissed { color: var(--cx-destructive); }

.cortex-thread__text {
  font-size: var(--cx-text-md);
  color: var(--cx-ink);
  line-height: 18px;
}

.cortex-thread__working {
  font-size: var(--cx-text-sm);
  color: var(--cx-select);
  padding: var(--cx-sp-2) 0 0 18px;
}

.cortex-thread__resolution {
  font-size: var(--cx-text-sm);
  color: var(--cx-success);
  padding: var(--cx-sp-2) 0 0 18px;
}

.cortex-thread__dismiss-reason {
  font-size: var(--cx-text-sm);
  color: var(--cx-destructive);
  padding: var(--cx-sp-2) 0 0 18px;
}

.cortex-thread__messages {
  padding: var(--cx-sp-2) 0 0 18px;
}

.cortex-thread__message {
  font-size: var(--cx-text-sm);
  padding: var(--cx-sp-2) var(--cx-sp-3);
  border-radius: var(--cx-radius-sm);
  margin-top: var(--cx-sp-2);
}

.cortex-thread__message--user {
  color: var(--cx-ink);
  background: var(--cx-well);
}

.cortex-thread__message--agent {
  color: var(--cx-select-hover);
  background: var(--cx-select-muted);
}

.cortex-thread__reply {
  width: 100%;
  padding: var(--cx-sp-2) var(--cx-sp-3);
  margin-top: var(--cx-sp-3);
  background: var(--cx-well);
  border: 1px solid var(--cx-rule);
  border-radius: var(--cx-radius-sm);
  color: var(--cx-ink);
  font-size: var(--cx-text-sm);
  outline: none;
  box-sizing: border-box;
}

.cortex-thread__reply:focus {
  border-color: var(--cx-select-muted);
}

/* \u2500\u2500 Comment Pin \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */

.cortex-pin {
  position: fixed;
  width: 12px;
  height: 12px;
  background: var(--cx-select);
  border-radius: 50%;
  border: 2px solid white;
  cursor: pointer;
  pointer-events: auto;
  z-index: 2147483643;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
}

.cortex-pin:hover {
  transform: scale(1.3);
}

.cortex-pin--mode {
  position: fixed;
  inset: 0;
  pointer-events: none;
  z-index: 2147483642;
}

.cortex-pin__thread {
  position: fixed;
  width: 240px;
  background: var(--cx-paper);
  border: 1px solid var(--cx-rule);
  border-radius: 12px;
  pointer-events: auto;
  z-index: 2147483644;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.06), 0 1px 4px rgba(0, 0, 0, 0.04);
  font-size: var(--cx-text-lg);
  color: var(--cx-ink);
}

.cortex-pin__input {
  position: fixed;
  pointer-events: auto;
  z-index: 2147483645;
}

.cortex-pin__input-field {
  width: 200px;
  padding: var(--cx-sp-3) var(--cx-sp-4);
  background: var(--cx-paper);
  border: 1px solid var(--cx-rule);
  border-radius: var(--cx-radius-sm);
  color: var(--cx-ink);
  font-size: var(--cx-text-md);
  outline: none;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.06), 0 1px 4px rgba(0, 0, 0, 0.04);
}
.cortex-pin__input-field:focus {
  border-color: var(--cx-select-muted);
}

/* \u2500\u2500 Activity Log \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */

.cortex-activity-log {
  position: fixed;
  right: 16px;
  top: 60px;
  width: 280px;
  max-height: 320px;
  background: var(--cx-paper);
  border: 1px solid var(--cx-rule);
  border-radius: var(--cx-radius-lg);
  pointer-events: auto;
  z-index: 2147483643;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.08), 0 1px 3px rgba(0, 0, 0, 0.04);
  overflow: hidden;
}

.cortex-activity-log__header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: var(--cx-sp-4) var(--cx-sp-5);
  border-bottom: 1px solid var(--cx-rule);
  font-size: var(--cx-text-md);
  font-weight: var(--cx-weight-title);
  color: var(--cx-ink);
}

.cortex-activity-log__close {
  background: none;
  border: none;
  color: var(--cx-ink-secondary);
  cursor: pointer;
  font-size: var(--cx-text-md);
  padding: 2px 4px;
}

.cortex-activity-log__close:hover {
  color: var(--cx-ink);
}

.cortex-activity-log__close:active {
  transform: scale(0.92);
}

.cortex-activity-log__close:focus-visible {
  outline: 2px solid var(--cx-select-muted);
  outline-offset: 1px;
}

.cortex-activity-log__list {
  overflow-y: auto;
  max-height: 280px;
}

.cortex-activity-log__empty {
  padding: var(--cx-sp-7) var(--cx-sp-5);
  text-align: center;
  color: var(--cx-ink-secondary);
  font-size: var(--cx-text-md);
}

.cortex-activity-log__entry {
  display: flex;
  align-items: flex-start;
  gap: var(--cx-sp-3);
  padding: var(--cx-sp-3) var(--cx-sp-5);
  font-size: var(--cx-text-sm);
  border-bottom: 1px solid var(--cx-rule-soft);
}

.cortex-activity-log__icon {
  flex-shrink: 0;
  width: 16px;
  text-align: center;
}

.cortex-activity-log__desc {
  flex: 1;
  color: var(--cx-ink);
  word-break: break-word;
}

.cortex-activity-log__time {
  flex-shrink: 0;
  color: var(--cx-ink-secondary);
}

/* \u2500\u2500 Focus-visible rings \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */

.cortex-segmented__option,
.cortex-dropdown__trigger,
.cortex-color-input__swatch,
.cortex-effects-section__expand-btn,
.cortex-spacing-group__toggle,
.cortex-lock-btn,
.cortex-layout-section__minmax-dismiss,
.cortex-theme-dropdown__trigger,
.cortex-theme-dropdown__option,
.cortex-elements-header-actions__btn,
.cortex-icon-button,
.cortex-position-dropdown__trigger,
.cortex-xy-dropdown__trigger,
.cortex-expandable-options__trigger,
.cortex-alignment-grid__cell,
.cortex-alignment-grid__distribute-btn,
.cortex-alignment-grid__span,
.cortex-sizing-trigger,
.cortex-token-chip__unlink {
  outline: 2px solid transparent;
  outline-offset: 1px;
}

.cortex-segmented__option:focus-visible,
.cortex-dropdown__trigger:focus-visible,
.cortex-color-input__swatch:focus-visible,
.cortex-effects-section__expand-btn:focus-visible,
.cortex-spacing-group__toggle:focus-visible,
.cortex-lock-btn:focus-visible,
.cortex-layout-section__minmax-dismiss:focus-visible,
.cortex-theme-dropdown__trigger:focus-visible,
.cortex-theme-dropdown__option:focus-visible,
.cortex-elements-header-actions__btn:focus-visible,
.cortex-icon-button:focus-visible,
.cortex-position-dropdown__trigger:focus-visible,
.cortex-xy-dropdown__trigger:focus-visible,
.cortex-expandable-options__trigger:focus-visible,
.cortex-alignment-grid__cell:focus-visible,
.cortex-alignment-grid__distribute-btn:focus-visible,
.cortex-alignment-grid__span:focus-visible,
.cortex-sizing-trigger:focus-visible,
.cortex-token-chip__unlink:focus-visible {
  outline-color: var(--cx-select-muted);
}

/* \u2500\u2500 Active press feedback \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */

.cortex-panel-header__btn:active:not(:disabled) {
  transform: scale(0.92);
}

.cortex-theme-dropdown__trigger:active,
.cortex-elements-header-actions__btn:active:not(:disabled),
.cortex-layout-section__minmax-dismiss:active {
  transform: scale(0.92);
}

.cortex-color-input__swatch:active {
  transform: scale(0.92);
}

.cortex-effects-section__expand-btn:active {
  transform: scale(0.9);
}

.cortex-spacing-group__toggle:active {
  transform: scale(0.92);
}

/* \u2500\u2500 Position Section \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */

.cortex-position-section {
  display: flex;
  flex-direction: column;
  gap: var(--cx-sp-6);
}

.cortex-position-section__group {
  display: flex;
  flex-direction: column;
  gap: var(--cx-sp-3);
}

.cortex-position-section__xy-row {
  display: flex;
  gap: var(--cx-sp-2);
}

.cortex-position-section__xy-row > .cortex-numeric-input {
  flex: 1;
  min-width: 0;
}

.cortex-position-section__xy-row > .cortex-numeric-input:last-child {
  flex: 0 0 56px;
}

.cortex-position-section__xy-row--disabled {
  opacity: 0.4;
}

.cortex-position-section__xy-row--disabled > * {
  pointer-events: none;
}

.cortex-position-section__rotate-row {
  display: flex;
  gap: var(--cx-sp-2);
  align-items: center;
}

.cortex-position-section__rotate-row > .cortex-numeric-input {
  flex: 1;
  min-width: 0;
}

/* \u2500\u2500 Icon Button \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
   Reusable 28px square icon button \u2014 height matches other interactive
   panel controls (numeric input, segmented md option, sizing trigger,
   panel header button). */
.cortex-icon-button {
  width: 28px;
  height: 28px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: none;
  background: transparent;
  border-radius: var(--cx-radius-sm);
  cursor: pointer;
  color: var(--cx-ink-ghost);
  flex-shrink: 0;
  padding: 0;
  transition: background 150ms ease-out, color 150ms ease-out, box-shadow 150ms ease-out;
}

.cortex-icon-button:hover:not(:disabled) {
  background: var(--cx-well);
  color: var(--cx-ink-secondary);
}

.cortex-icon-button:active:not(:disabled) {
  background: var(--cx-well-hover);
  transform: scale(0.92);
}

.cortex-icon-button:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.cortex-icon-button--active {
  background: var(--cx-well);
  color: var(--cx-ink);
  box-shadow: var(--cx-well-shadow), 0 0 0 1.5px var(--cx-select-muted);
}

.cortex-icon-button--active:hover:not(:disabled) {
  background: var(--cx-well-hover);
}

/* \u2500\u2500 Alignment Grid \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
   3x3 dot grid for flex/grid alignment picking. Click = position,
   double-click = distribution overlay (replaces the target row or
   column with a 3-button strip). Plan: conditional controls mount
   instantly \u2014 no transitions on overlay show/hide. */
.cortex-alignment-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  grid-template-rows: repeat(3, 1fr);
  gap: var(--cx-sp-1);
  width: 80px;
  aspect-ratio: 1;
  padding: var(--cx-sp-1);
  background: var(--cx-well);
  border-radius: var(--cx-radius-sm);
  box-shadow: var(--cx-well-shadow);
  flex-shrink: 0;
}

.cortex-alignment-grid__cell {
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  background: transparent;
  border-radius: var(--cx-radius-sm);
  padding: 0;
  cursor: pointer;
  color: var(--cx-ink-ghost);
  /* Only background/color transition \u2014 no layout properties, no size
     changes. Keeps the compositor happy and the click feel instant. */
  transition: background 120ms ease-out, color 120ms ease-out;
}

.cortex-alignment-grid__cell:hover {
  background: var(--cx-btn-hover);
  color: var(--cx-ink-secondary);
}

.cortex-alignment-grid__cell--active {
  background: var(--cx-select-muted);
  color: var(--cx-select);
}

.cortex-alignment-grid__cell--active:hover {
  background: var(--cx-select-muted);
}

.cortex-alignment-grid__cell__dot {
  width: 4px;
  height: 4px;
  border-radius: 50%;
  background: currentColor;
  display: block;
}

/* Distribution overlay \u2014 occupies the full row or column via grid-span
   set inline on the element. Flex row of 3 labeled buttons, no icons. */
.cortex-alignment-grid__overlay {
  display: flex;
  align-items: stretch;
  gap: var(--cx-sp-1);
  background: var(--cx-well);
  border-radius: var(--cx-radius-sm);
  /* Row overlay: horizontal button strip. Col overlay: vertical strip. */
}

.cortex-alignment-grid__overlay--col {
  flex-direction: column;
}

/* Span indicator \u2014 replaces cells in a row/column with 3 bars.
   Figma spec: 2px wide, rounded 1px, ink color, 4px gap.
   Interactive (click \u2192 point alignment, dblclick \u2192 overlay). */
.cortex-alignment-grid__span {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 2px;
  cursor: pointer;
  border: none;
  background: transparent;
  appearance: none;
  padding: 0;
  color: var(--cx-ink);
  font: inherit;
  border-radius: var(--cx-radius-sm);
}

/* Full-grid span: bars spread across the entire grid (both axes non-positional).
   Figma: 3 bars at x=13, x=33, x=53 within 70px \u2192 space-between distribution. */
.cortex-alignment-grid__span--full {
  position: relative;
  flex-direction: row;
  justify-content: space-between;
  padding: 4px 8px;
}

.cortex-alignment-grid__span--full .cortex-alignment-grid__span-bar {
  width: 2px;
  height: 100%;
  background: var(--cx-ink);
  border-radius: 1px;
}

/* Dots for space-around/evenly \u2014 absolutely positioned at grid edges,
   outside the bar group. Bars stay in identical positions. */
.cortex-alignment-grid__span-dot {
  position: absolute;
  width: 4px;
  height: 4px;
  border-radius: 50%;
  background: var(--cx-ink-ghost);
  top: 50%;
  transform: translateY(-50%);
}

.cortex-alignment-grid__span-dot--left {
  left: 2px;
}

.cortex-alignment-grid__span-dot--right {
  right: 2px;
}

/* Row span: bars are vertical, filling the row height */
.cortex-alignment-grid__span--row {
  flex-direction: row;
}

/* Row baseline: "A" icon + horizontal underline extending right.
   Space-around adds vertical tick marks at left/right edges. */
.cortex-alignment-grid__span--row-baseline {
  align-items: flex-end;
  gap: 0;
  padding: 0 4px 2px;
}

.cortex-alignment-grid__span--row-baseline .cortex-alignment-grid__span-icon {
  width: 14px;
  height: 14px;
  flex-shrink: 0;
}

/* Horizontal underline that extends to fill the remaining row width */
.cortex-alignment-grid__span-baseline-line {
  flex: 1;
  height: 2px;
  background: var(--cx-ink);
  border-radius: 1px;
  margin-bottom: 1px;
}

/* Vertical tick marks at edges for space-around/evenly baseline */
.cortex-alignment-grid__span-baseline-tick {
  width: 2px;
  height: 10px;
  background: var(--cx-ink);
  border-radius: 1px;
  flex-shrink: 0;
}

.cortex-alignment-grid__span--row .cortex-alignment-grid__span-bar {
  width: 2px;
  height: 100%;
  background: var(--cx-ink);
  border-radius: 1px;
}

/* Column span: bars are vertical, filling the full column height */
.cortex-alignment-grid__span--col {
  flex-direction: row;
  padding: 4px 0;
}

.cortex-alignment-grid__span--col .cortex-alignment-grid__span-bar {
  width: 2px;
  height: 100%;
  background: var(--cx-ink);
  border-radius: 1px;
}

/* Column baseline: dot \u2192 A icon \u2192 dot, vertically distributed.
   Fills the column with no blank gaps \u2014 dots match the grid pattern. */
.cortex-alignment-grid__span--col-baseline {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: space-between;
  padding: 4px 0;
  color: var(--cx-ink);
  cursor: pointer;
  border-radius: var(--cx-radius-sm);
}

.cortex-alignment-grid__span--col-baseline .cortex-alignment-grid__cell__dot {
  color: var(--cx-ink-ghost);
}

.cortex-alignment-grid__span-icon {
  width: 16px;
  height: 16px;
  flex-shrink: 0;
}

.cortex-alignment-grid__distribute-btn {
  flex: 1;
  min-width: 0;
  min-height: 0;
  border: none;
  background: var(--cx-vellum);
  color: var(--cx-ink-secondary);
  border-radius: var(--cx-radius-sm);
  font-size: var(--cx-text-xs);
  font-weight: var(--cx-weight-value);
  font-family: inherit;
  padding: 0 var(--cx-sp-2);
  cursor: pointer;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  transition: background 120ms ease-out, color 120ms ease-out;
}

.cortex-alignment-grid__distribute-btn:hover {
  background: var(--cx-btn-hover);
  color: var(--cx-ink);
}

/* \u2500\u2500 FlexControls (Task 8 / ZF0-1186) \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */
/* Container for the complete flex sub-panel \u2014 direction segmented control,
   AlignmentGrid + X/Y dropdowns, gap input, wrap inside "More options". */

.cortex-flex-controls {
  display: flex;
  flex-direction: column;
  gap: var(--cx-sp-5);
}

.cortex-flex-controls__direction {
  display: flex;
  flex-direction: column;
  gap: var(--cx-sp-3);
}

.cortex-flex-controls__align {
  display: flex;
  gap: var(--cx-sp-4);
  align-items: stretch;
}

.cortex-flex-controls__xy {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: var(--cx-sp-2);
}

.cortex-flex-controls__xy-field {
  display: flex;
}

.cortex-flex-controls__gap {
  display: flex;
  gap: var(--cx-sp-3);
  align-items: center;
}

.cortex-flex-controls__gap > .cortex-numeric-input {
  flex: 1;
  min-width: 0;
}

.cortex-flex-controls__wrap {
  display: flex;
  flex-direction: column;
  gap: var(--cx-sp-3);
}

.cortex-flex-controls__wrap .cortex-segmented {
  width: 100%;
}

/* \u2500\u2500 XYDropdown (Task 8 / ZF0-1186) \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */
/* Sibling of PositionDropdown but with caller-supplied options \u2014 the
   X/Y alignment catalogs differ per axis and per display mode, so the
   component takes options as a prop (PositionDropdown keeps options
   module-local by design). */

.cortex-xy-dropdown {
  position: relative;
  width: 100%;
}

.cortex-xy-dropdown__trigger {
  display: flex;
  align-items: center;
  gap: var(--cx-sp-3);
  width: 100%;
  height: 28px;
  padding: 0 var(--cx-sp-4);
  background: var(--cx-well);
  border: none;
  border-radius: var(--cx-radius-md);
  cursor: pointer;
  font-size: var(--cx-text-md);
  font-weight: var(--cx-weight-label);
  color: var(--cx-ink);
  text-align: left;
  box-shadow: var(--cx-well-shadow);
  transition: background 150ms ease-out;
}

.cortex-xy-dropdown__trigger:hover:not(:disabled) {
  background: var(--cx-btn-hover);
}

.cortex-xy-dropdown__trigger:disabled {
  cursor: not-allowed;
  opacity: 0.5;
}

.cortex-xy-dropdown__trigger-axis {
  display: inline-flex;
  flex-shrink: 0;
  font-weight: var(--cx-weight-label);
  color: var(--cx-ink-ghost);
  min-width: 10px;
}

.cortex-xy-dropdown__trigger-icon {
  display: inline-flex;
  flex-shrink: 0;
  color: var(--cx-ink-secondary);
}

.cortex-xy-dropdown__trigger-label {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.cortex-xy-dropdown__chevron {
  display: inline-flex;
  flex-shrink: 0;
  color: var(--cx-ink-tertiary);
  transition: transform 150ms ease-out;
}

.cortex-xy-dropdown__chevron--open {
  transform: rotate(180deg);
}

.cortex-xy-dropdown__backdrop {
  position: fixed;
  inset: 0;
  z-index: 1;
}

.cortex-xy-dropdown__popover {
  z-index: 2;
  min-width: 160px;
  background: var(--cx-paper);
  border: 1px solid var(--cx-rule);
  border-radius: var(--cx-radius-lg);
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.1), 0 1px 4px rgba(0, 0, 0, 0.06);
  animation: cortex-popover-enter 150ms ease-out;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.cortex-xy-dropdown__list {
  padding: var(--cx-sp-2) 0;
  display: flex;
  flex-direction: column;
}

.cortex-xy-dropdown__option {
  display: flex;
  align-items: center;
  gap: var(--cx-sp-3);
  height: 28px;
  padding: 0 var(--cx-sp-4);
  font-size: var(--cx-text-md);
  font-weight: var(--cx-weight-label);
  color: var(--cx-ink);
  cursor: pointer;
}

.cortex-xy-dropdown__option--highlighted {
  background: var(--cx-well);
}

.cortex-xy-dropdown__option--selected {
  color: var(--cx-select);
  font-weight: var(--cx-weight-value);
}

.cortex-xy-dropdown__option-icon {
  display: inline-flex;
  flex-shrink: 0;
  color: currentColor;
}

.cortex-xy-dropdown__option-label {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.cortex-xy-dropdown__option-check {
  display: inline-flex;
  flex-shrink: 0;
  color: var(--cx-select);
}

/* Hint footer \u2014 describes the highlighted option */
.cortex-xy-dropdown__hint {
  padding: var(--cx-sp-2) var(--cx-sp-3);
  border-top: 1px solid var(--cx-border);
  font-size: var(--cx-text-xs);
  color: var(--cx-ink-ghost);
  line-height: 1.4;
}

/* \u2500\u2500 ExpandableOptions (Task 8 / ZF0-1186) \u2500\u2500\u2500\u2500 */
/* Collapsible container for secondary controls. Body stays mounted \u2014
   visibility flips via grid-template-rows 0fr\u21921fr, which is the one
   compositor-friendly "animate auto height" technique. No \`height\`
   transitions. Skipped entirely under prefers-reduced-motion. */

.cortex-expandable-options {
  display: flex;
  flex-direction: column;
  gap: var(--cx-sp-2);
}

.cortex-expandable-options__trigger {
  display: flex;
  align-items: center;
  gap: var(--cx-sp-2);
  padding: var(--cx-sp-2) 0;
  background: transparent;
  border: none;
  cursor: pointer;
  font-size: var(--cx-text-sm);
  font-weight: var(--cx-weight-value);
  color: var(--cx-ink-ghost);
  text-align: left;
}

.cortex-expandable-options__trigger:hover {
  color: var(--cx-ink-secondary);
}

.cortex-expandable-options__chevron {
  display: inline-flex;
  flex-shrink: 0;
  transition: transform 150ms ease-out;
}

.cortex-expandable-options__chevron--open {
  transform: rotate(90deg);
}

.cortex-expandable-options__label {
  font-weight: var(--cx-weight-value);
}

.cortex-expandable-options__body {
  display: grid;
  grid-template-rows: 0fr;
  transition: grid-template-rows 150ms ease-out;
  overflow: hidden;
}

.cortex-expandable-options--open .cortex-expandable-options__body {
  grid-template-rows: 1fr;
}

.cortex-expandable-options__inner {
  min-height: 0;
  overflow: hidden;
}

@media (prefers-reduced-motion: reduce) {
  .cortex-expandable-options__body {
    transition: none;
  }
}

/* \u2500\u2500 GridControls (Task 9 / ZF0-1187) \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */
/* Structural mirror of .cortex-flex-controls \u2014 same vertical rhythm,
   same XY/alignment row layout. Two structural differences:
   (1) a template block at the top (simple/responsive/complex tiers);
   (2) dual gap inputs side-by-side instead of a single linked input. */

.cortex-grid-controls {
  display: flex;
  flex-direction: column;
  gap: var(--cx-sp-5);
}

.cortex-grid-controls__template {
  display: flex;
  gap: var(--cx-sp-3);
  align-items: center;
}

.cortex-grid-controls__cols,
.cortex-grid-controls__rows,
.cortex-grid-controls__minwidth {
  flex: 1;
  min-width: 0;
}

.cortex-grid-controls__raw {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: var(--cx-sp-1);
  padding: var(--cx-sp-2) var(--cx-sp-3);
  background: var(--cx-well);
  border-radius: var(--cx-radius-md);
  box-shadow: var(--cx-well-shadow);
}

.cortex-grid-controls__raw-label {
  font-size: var(--cx-text-xs);
  font-weight: var(--cx-weight-label);
  color: var(--cx-ink-ghost);
}

.cortex-grid-controls__raw-value {
  font-family: var(--cx-mono);
  font-size: var(--cx-text-sm);
  color: var(--cx-ink-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* .cortex-grid-controls__direction removed \u2014 merged into __template row */

.cortex-grid-controls__align {
  display: flex;
  gap: var(--cx-sp-4);
  align-items: stretch;
}

.cortex-grid-controls__xy {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: var(--cx-sp-2);
}

.cortex-grid-controls__xy-field {
  display: flex;
}

.cortex-grid-controls__gap {
  display: flex;
  gap: var(--cx-sp-3);
  align-items: center;
}

.cortex-grid-controls__gap > .cortex-numeric-input {
  flex: 1;
  min-width: 0;
}

/* \u2500\u2500 Position Section \xB7 self-alignment button groups (Mantine-style) \u2500 */
.cortex-position-section__self-align {
  display: flex;
  gap: var(--cx-sp-3);
}

.cortex-position-section__btn-group {
  display: flex;
  flex: 1;
}

.cortex-position-section__btn-group > .cortex-icon-button {
  flex: 1;
  border-radius: 0;
  border-right: 1px solid var(--cx-rule-soft);
  color: var(--cx-ink-secondary);
}

.cortex-position-section__btn-group > .cortex-icon-button:first-child {
  border-radius: var(--cx-radius-md) 0 0 var(--cx-radius-md);
}

.cortex-position-section__btn-group > .cortex-icon-button:last-child {
  border-radius: 0 var(--cx-radius-md) var(--cx-radius-md) 0;
  border-right: none;
}

.cortex-position-section__btn-group > .cortex-icon-button:hover:not(:disabled) {
  color: var(--cx-ink);
}

/* Position \u2192 Layout transition: tighter spacing */
[data-group="position"] > .cortex-section-group__content {
  padding-bottom: var(--cx-sp-5);
}


/* \u2500\u2500 Sizing Dropdown \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */

.cortex-sizing {
  flex-shrink: 0;
}

.cortex-sizing-trigger {
  display: flex;
  align-items: center;
  gap: var(--cx-sp-1);
  padding: 0 var(--cx-sp-3);
  /* Match .cortex-numeric-input height \u2014 these are visually fused via border-left in compound W/H controls. */
  height: 28px;
  background: var(--cx-well);
  border: none;
  border-radius: 0 var(--cx-radius-sm) var(--cx-radius-sm) 0;
  cursor: pointer;
  font-size: var(--cx-text-sm);
  font-weight: var(--cx-weight-value);
  color: var(--cx-ink-ghost);
  box-shadow: var(--cx-well-shadow);
  transition: background 150ms ease-out, color 150ms ease-out, outline-color 150ms ease-out;
  outline: 2px solid transparent;
  outline-offset: 1px;
}

.cortex-sizing-trigger:hover {
  background: var(--cx-btn-hover);
  color: var(--cx-ink-secondary);
}

.cortex-sizing-trigger:active {
  transform: scale(0.97);
}

.cortex-sizing-trigger:focus-visible {
  outline-color: var(--cx-select-muted);
}

.cortex-sizing-trigger__chevron {
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--cx-ink-tertiary);
  transition: transform 200ms ease-out;
}

.cortex-sizing-trigger__chevron--open {
  transform: rotate(180deg);
}

.cortex-sizing-backdrop {
  position: fixed;
  inset: 0;
  z-index: 99;
}

.cortex-sizing-menu {
  z-index: 100;
  background: var(--cx-paper);
  border: 1px solid var(--cx-rule-soft);
  border-radius: var(--cx-radius-sm);
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.08), 0 1px 4px rgba(0, 0, 0, 0.04);
  padding: var(--cx-sp-1) 0;
  overflow: hidden;
}

.cortex-sizing-menu__item {
  display: flex;
  align-items: center;
  gap: var(--cx-sp-2);
  padding: var(--cx-sp-2) var(--cx-sp-3);
  font-size: var(--cx-text-md);
  font-weight: var(--cx-weight-value);
  color: var(--cx-ink);
  cursor: pointer;
  transition: background 150ms ease-out;
  white-space: nowrap;
}

.cortex-sizing-menu__item:hover {
  background: var(--cx-well);
}

.cortex-sizing-menu__item--checked .cortex-sizing-menu__indicator {
  color: var(--cx-select);
}

.cortex-sizing-menu__indicator {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 14px;
  color: var(--cx-ink-tertiary);
  flex-shrink: 0;
}

.cortex-sizing-menu__radio {
  width: 14px;
  height: 14px;
  border: 1.5px solid var(--cx-ink-tertiary);
  border-radius: 50%;
  flex-shrink: 0;
  position: relative;
  transition: border-color 150ms ease-out;
}

.cortex-sizing-menu__radio--active {
  border-color: var(--cx-select);
}

.cortex-sizing-menu__radio--active::after {
  content: '';
  position: absolute;
  inset: 2px;
  border-radius: 50%;
  background: var(--cx-select);
}

.cortex-sizing-menu__separator {
  height: 1px;
  background: var(--cx-rule);
  margin: var(--cx-sp-1) 0;
}

/* \u2500\u2500 Layout Section: sizing field (NumericInput + SizingDropdown pair) \u2500\u2500 */

.cortex-layout-section__sizing-field {
  display: flex;
  flex: 1;
  min-width: 0;
}

.cortex-layout-section__sizing-field > .cortex-numeric-input {
  flex: 1;
  min-width: 0;
  border-radius: var(--cx-radius-sm) 0 0 var(--cx-radius-sm);
}

.cortex-layout-section__minmax {
  display: flex;
  flex-direction: column;
  gap: var(--cx-sp-2);
  margin-top: var(--cx-sp-2);
}

.cortex-layout-section__minmax-field {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 24px;
  column-gap: var(--cx-sp-3);
  min-width: 0;
  align-items: center;
}

.cortex-layout-section__minmax-field > .cortex-numeric-input {
  min-width: 0;
}

.cortex-layout-section__minmax-dismiss {
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  background: transparent;
  border-radius: var(--cx-radius-sm);
  cursor: pointer;
  color: var(--cx-ink-faint);
  flex-shrink: 0;
  transition: background 150ms ease-out, color 150ms ease-out, outline-color 150ms ease-out;
}

.cortex-layout-section__minmax-dismiss:hover {
  background: var(--cx-destructive-surface);
  color: var(--cx-destructive);
}

/* \u2500\u2500 Checkbox control \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */

.cortex-checkbox {
  display: flex;
  align-items: center;
  gap: var(--cx-sp-3);
  cursor: pointer;
}

.cortex-checkbox__box {
  width: 14px;
  height: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--cx-rule);
  border-radius: var(--cx-radius-sm);
  flex-shrink: 0;
  transition: background 150ms ease-out, border-color 150ms ease-out;
}

.cortex-checkbox__box--checked {
  background: var(--cx-select);
  border-color: var(--cx-select);
  color: white;
}

.cortex-checkbox__label {
  font-size: var(--cx-text-sm);
  color: var(--cx-ink-secondary);
}

/* \u2500\u2500 Sizing toggles (Clip content / Border box) \u2500\u2500 */

.cortex-sizing-controls {
  display: flex;
  flex-direction: column;
}

.cortex-sizing-controls > .cortex-subsection-label {
  padding-top: 0;
}

.cortex-sizing-controls__toggles {
  display: flex;
  gap: var(--cx-sp-5);
  margin-top: var(--cx-sp-3);
}

/* \u2500\u2500 Spacing sub-controls (padding / margin) \u2500\u2500 */

.cortex-spacing-controls {
  display: flex;
  flex-direction: column;
}

/* Remove the section-group__content gap above the spacing wrapper \u2014
   the "Spacing" label's 8px top padding provides separation. */
.cortex-layout-section__group:has(> .cortex-spacing-controls) {
  margin-top: calc(-1 * var(--cx-sp-5));
}

.cortex-spacing-controls > .cortex-spacing-row + .cortex-spacing-row {
  margin-top: var(--cx-sp-3);
}

.cortex-spacing-row__inputs {
  display: flex;
  gap: var(--cx-sp-3);
  align-items: center;
}

.cortex-spacing-row__inputs > .cortex-numeric-input {
  flex: 1;
  min-width: 0;
}

/* \u2500\u2500 Connection status footer \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */

.cortex-connection-status {
  display: flex;
  align-items: center;
  gap: var(--cx-sp-3);
  padding: var(--cx-sp-2) var(--cx-sp-4);
  border-top: 1px solid var(--cx-rule);
  font-size: var(--cx-text-sm);
  font-family: 'Geist', system-ui, sans-serif;
  flex-shrink: 0;
  color: var(--cx-ink-secondary);
  background: var(--cx-vellum);
}

.cortex-connection-status__dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  flex-shrink: 0;
}

.cortex-connection-status--hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
  border: 0;
  padding: 0;
}

.cortex-connection-status--reconnecting .cortex-connection-status__dot {
  background: var(--cx-warning);
  animation: cortex-pulse 1.5s ease-in-out infinite;
}

@keyframes cortex-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.3; }
}

.cortex-connection-status--disconnected .cortex-connection-status__dot {
  background: var(--cx-destructive);
}

.cortex-connection-status--reconnected .cortex-connection-status__dot {
  background: var(--cx-success);
}

/* \u2500\u2500 Token Chip (Task 11 / ZF0-1189) \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */
/* Pill-shaped chip for displaying a CSS variable name with a color swatch
   and an optional unlink button. Used by Typography, Background, and
   Border sections. */

.cortex-token-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  height: 28px;
  padding: 0 6px;
  background: var(--cx-well);
  border: 1px solid var(--cx-rule);
  border-radius: var(--cx-radius-sm);
}

/* Body wraps swatch + name and may render as <button> (swap) or <span>
 * (display-only). Reset button chrome so visual output matches the span path. */
.cortex-token-chip__body {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  border: none;
  background: transparent;
  padding: 0;
  margin: 0;
  color: inherit;
  font: inherit;
  text-align: left;
}

button.cortex-token-chip__body {
  cursor: pointer;
}

button.cortex-token-chip__body:focus-visible {
  outline: 2px solid var(--cx-focus, currentColor);
  outline-offset: 2px;
  border-radius: 2px;
}

.cortex-token-chip__swatch {
  width: 14px;
  height: 14px;
  border-radius: var(--cx-radius-sm);
  flex-shrink: 0;
}

.cortex-token-chip__swatch--pattern {
  position: relative;
  overflow: hidden;
  background: var(--cx-well);
  border: 1px solid var(--cx-rule);
}

.cortex-token-chip__swatch--pattern::before {
  content: "";
  position: absolute;
  top: 50%;
  left: -30%;
  width: 160%;
  height: 1px;
  background: var(--cx-rule);
  transform: rotate(-45deg);
  transform-origin: center;
}

.cortex-token-chip__name {
  font-family: var(--cx-mono);
  font-size: var(--cx-text-md);
  color: var(--cx-ink);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.cortex-token-chip__unlink {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: none;
  background: transparent;
  padding: 0;
  cursor: pointer;
  color: var(--cx-ink-ghost);
  flex-shrink: 0;
  transition: color 150ms ease-out;
}

.cortex-token-chip__unlink:hover {
  color: var(--cx-ink);
}

/* \u2500\u2500 Reduced motion \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */

@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}
`;

  // src/browser/index.tsx
  var hostElement = null, shadowRoot = null, rootElement = null, activeChannel = null, themeMediaQuery = null, themeObserver = null, currentTheme = null;
  function detectTheme() {
    let pref = getThemePreference();
    if (pref === "light") return null;
    if (pref === "dark") return "blueprint";
    let html = document.documentElement;
    if (html.classList.contains("dark")) return "blueprint";
    if (html.classList.contains("light")) return null;
    let dataTheme = html.getAttribute("data-theme");
    if (dataTheme?.includes("dark")) return "blueprint";
    if (dataTheme?.includes("light")) return null;
    let dataMode = html.getAttribute("data-mode");
    if (dataMode?.includes("dark")) return "blueprint";
    if (dataMode?.includes("light")) return null;
    if (window.matchMedia("(prefers-color-scheme: dark)").matches) return "blueprint";
    if (!document.body) return null;
    let match = getComputedStyle(document.body).backgroundColor.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?/);
    if (match) {
      if ((match[4] !== void 0 ? parseFloat(match[4]) : 1) < 0.01) return null;
      let r4 = Number(match[1]) / 255, g3 = Number(match[2]) / 255, b = Number(match[3]) / 255;
      if (0.2126 * r4 + 0.7152 * g3 + 0.0722 * b < 0.4) return "blueprint";
    }
    return null;
  }
  function applyTheme() {
    if (!hostElement) return;
    let theme = detectTheme();
    theme !== currentTheme && (currentTheme = theme, theme ? hostElement.setAttribute("data-theme", theme) : hostElement.removeAttribute("data-theme"));
  }
  function bootstrap() {
    if (!document.querySelector("[data-cortex-fonts]")) {
      let fontLink = document.createElement("link");
      fontLink.setAttribute("data-cortex-fonts", ""), fontLink.rel = "stylesheet", fontLink.href = "https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600;700&family=Geist+Mono:wght@400;500&display=swap", document.head.appendChild(fontLink);
    }
    if (hostElement || document.querySelector("[data-cortex-host]")) return;
    hostElement = document.createElement("div"), hostElement.setAttribute("data-cortex-host", ""), hostElement.style.cssText = "position:fixed;inset:0;z-index:2147483646;pointer-events:none", document.documentElement.appendChild(hostElement), shadowRoot = hostElement.attachShadow({ mode: "closed" }), _setCortexHost(hostElement, shadowRoot);
    let style = document.createElement("style");
    style.textContent = styles_default, shadowRoot.appendChild(style), rootElement = document.createElement("div"), rootElement.setAttribute("data-cortex-root", ""), shadowRoot.appendChild(rootElement), applyTheme(), _registerPreferenceChangeHandler(applyTheme), themeMediaQuery = window.matchMedia("(prefers-color-scheme: dark)"), themeMediaQuery.addEventListener("change", applyTheme), themeObserver = new MutationObserver(applyTheme), themeObserver.observe(document.documentElement, {
      attributes: !0,
      attributeFilter: ["class", "data-theme", "data-mode"]
    }), typeof window.__cortex_send__ == "function" ? activeChannel = createViteChannel() : (console.warn("[cortex] __cortex_send__ not found \u2014 using WebSocket fallback. If you are using the Vite plugin, remove any manual <script> tags for cortex-browser.js from your index.html."), activeChannel = createWebSocketChannel());
    let initialActive = document.documentElement.hasAttribute("data-cortex-active");
    J(
      /* @__PURE__ */ u4(CortexApp, { channel: activeChannel, shadowRoot, initialActive }),
      rootElement
    ), window.__cortex_pending_toggle__ && delete window.__cortex_pending_toggle__;
  }
  function _resetForTesting() {
    rootElement && J(null, rootElement), activeChannel?.dispose?.(), activeChannel = null, themeMediaQuery?.removeEventListener("change", applyTheme), themeMediaQuery = null, themeObserver?.disconnect(), themeObserver = null, currentTheme = null, hostElement?.remove(), hostElement = null, shadowRoot = null, rootElement = null, _setCortexHost(null, null), document.querySelector("[data-cortex-fonts]")?.remove(), _clearPreferenceChangeHandler();
    try {
      localStorage.removeItem(THEME_STORAGE_KEY);
    } catch {
    }
  }
  document.readyState === "loading" ? document.addEventListener("DOMContentLoaded", bootstrap) : bootstrap();
  return __toCommonJS(index_exports);
})();
