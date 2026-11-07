/* =====================================================================
   dashboard.js · CORE Minería & Voladura
   - Lee siempre la versión más reciente de Supabase (sin caché)
   - Se actualiza solo: aviso entre pestañas, Realtime, sondeo liviano,
     al volver a la pestaña y al restaurar desde el historial (bfcache)
   - 6 KPIs con tendencia + 12 gráficos con drill-down, tabla y ayuda
   - Todo se calcula en runtime a partir de las filas: nada hardcodeado
   ===================================================================== */
"use strict";

/* =========================== CONFIGURACIÓN =========================== */
const CONFIG = {
  SUPABASE_URL: "https://ieblbnoyvppyiixtjgpk.supabase.co",
  SUPABASE_KEY: "sb_publishable_jDIyPv2xMqmOMrQr6oaHog_jec-bv6T",
  TABLE: "dashboard_data",
  SHEET_NAME: "VOLADURA_DATA",      // ← mismo valor que en index.js
  HOME_URL: "index.html",
  BUS: "core-dashboard",
  LS_UPLOAD: "core:lastUpload",
  LS_THEME: "core:theme",
  POLL_MS: 20000,                   // sondeo liviano mientras la pestaña está visible
};

const noStoreFetch = (input, init = {}) => fetch(input, { ...init, cache: "no-store" });
const sb = supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_KEY, {
  global: { fetch: noStoreFetch },
  auth: { persistSession: false },
});

const REDUCED = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;

/* =========================== CONSTANTES =========================== */
const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const MES_CORTO = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

// Segmentadores (filtros globales)
const DIMS = {
  mes: { label: "Mes", icon: "fa-calendar-days" },
  unidad: { label: "Unidad minera", icon: "fa-mountain-sun" },
  voladura: { label: "Tipo de voladura", icon: "fa-burst" },
  explosivo: { label: "Explosivo", icon: "fa-flask" },
};
const FILTER_KEYS = Object.keys(DIMS);
const DIM_LABEL = { periodo: "Mes", mes: "Mes", unidad: "Unidad minera", voladura: "Tipo de voladura", explosivo: "Tipo de explosivo", contratista: "Contratista", turno: "Turno" };

const SECCIONES = {
  resumen: { titulo: "Resumen general", icon: "fa-gauge-high", desc: "Producción, consumo de explosivo, costo y seguridad de un vistazo, con la tendencia del último mes." },
  produccion: { titulo: "Producción y perforación", icon: "fa-mountain-sun", desc: "Cumplimiento del plan de toneladas, mezcla de voladuras y rendimiento de perforación." },
  costos: { titulo: "Costos y explosivos", icon: "fa-sack-dollar", desc: "Cuánto cuesta romper cada tonelada y cómo se usa el explosivo." },
  seguridad: { titulo: "Seguridad y calidad", icon: "fa-helmet-safety", desc: "Tiros fallados, vibraciones y fragmentación: el control de cada disparo." },
};
const SEC_KEYS = Object.keys(SECCIONES);

/* =========================== ESTADO =========================== */
const state = {
  payload: null,
  filas: [],
  vista: [],
  d: null,
  dims: {},
  filtros: Object.fromEntries(FILTER_KEYS.map((k) => [k, ""])),
  seccion: "resumen",
  signature: null,
  uploadedAt: null,
  lastSync: null,
  loading: null,
  error: null,
  multiYear: false,
  tk: null,
  sort: {},
};
const charts = {};
const outs = {};
const tables = {};

/* =========================== UTILIDADES =========================== */
const $ = (id) => document.getElementById(id);
const fmt = (v, d = 0) => Number(v || 0).toLocaleString("es-PE", { maximumFractionDigits: d, minimumFractionDigits: d });
const compactNF = new Intl.NumberFormat("es-PE", { notation: "compact", maximumFractionDigits: 1 });
const fmtUSD = (v) => "US$ " + fmt(v, 0);
const fmtUSDC = (v) => "US$ " + compactNF.format(Number(v || 0));
const fmtUSDt = (v) => "US$ " + fmt(v, 3) + "/t";
const fmtT = (v) => fmt(v, 0) + " t";
const fmtTC = (v) => compactNF.format(Number(v || 0)) + " t";
const fmtKg = (v) => fmt(v, 0) + " kg";
const fmtKgC = (v) => compactNF.format(Number(v || 0)) + " kg";
const fmtFC = (v) => fmt(v, 3) + " kg/t";
const fmtPct = (v, d = 1) => fmt(v, d) + " %";
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const cell = (v, f) => ({ v, f: f ? f(v) : v });
const slug = (s) => String(s).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const maxBy = (arr, k) => arr.reduce((a, b) => (b[k] > a[k] ? b : a), arr[0]);
const minBy = (arr, k) => arr.reduce((a, b) => (b[k] < a[k] ? b : a), arr[0]);
const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };

function rgba(hex, a) {
  const h = String(hex).trim().replace("#", "");
  if (h.length !== 6) return hex;
  const n = parseInt(h, 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}
function isObj(x) { return x && typeof x === "object" && !Array.isArray(x) && !(x instanceof Function); }
function merge(target, ...srcs) {
  srcs.forEach((src) => {
    Object.keys(src || {}).forEach((k) => {
      if (isObj(src[k]) && isObj(target[k])) merge(target[k], src[k]);
      else target[k] = src[k];
    });
  });
  return target;
}
function relTime(date) {
  if (!date) return "—";
  const s = Math.round((Date.now() - new Date(date).getTime()) / 1000);
  if (isNaN(s)) return "—";
  if (s < 10) return "recién";
  if (s < 60) return `hace ${s} s`;
  if (s < 3600) return `hace ${Math.round(s / 60)} min`;
  if (s < 86400) return `hace ${Math.round(s / 3600)} h`;
  return new Date(date).toLocaleDateString("es-PE", { day: "2-digit", month: "short" });
}

function tokens() {
  const cs = getComputedStyle(document.documentElement);
  const g = (n) => cs.getPropertyValue(n).trim();
  return {
    ink: g("--ink"), ink2: g("--ink-2"), ink3: g("--ink-3"), line: g("--line"), lineStrong: g("--line-strong"),
    grid: g("--grid"), surface: g("--surface"), brand: g("--brand"),
    series: [1, 2, 3, 4, 5, 6, 7, 8].map((i) => g(`--series-${i}`)),
    neutral: g("--series-neutral"), good: g("--good"), warn: g("--warn"), crit: g("--crit"),
  };
}



/* =========================== PERIODOS =========================== */
function mesIdx(m) {
  const s = String(m || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();
  if (!s) return -1;
  if (s.startsWith("set")) return 8;
  return MESES.findIndex((x) => x === s || x.slice(0, 3) === s.slice(0, 3));
}
const NUM_FIELDS = ["taladros", "metros", "horas", "toneladas", "meta", "explosivoKg", "detonadores", "costoExp", "costoPerf", "costoAcc", "costoTotal", "fallados", "incidentes"];
const OPT_FIELDS = ["p80", "ppv"];
const TXT_FIELDS = ["id", "mes", "unidad", "voladura", "explosivo", "turno", "contratista"];

function prepararFilas(filas) {
  const años = new Set();
  const out = (filas || []).map((r) => {
    const n = { ...r };
    NUM_FIELDS.forEach((k) => { n[k] = Number(n[k]) || 0; });
    OPT_FIELDS.forEach((k) => { n[k] = n[k] === null || n[k] === "" || n[k] === undefined ? null : Number(n[k]); });
    TXT_FIELDS.forEach((k) => { n[k] = n[k] == null ? "" : String(n[k]); });
    if (!n.costoTotal) n.costoTotal = n.costoExp + n.costoPerf + n.costoAcc;
    n.año = n.año ? String(n.año) : (n.fecha ? String(n.fecha).slice(0, 4) : "");
    if (n.año) años.add(n.año);
    const i = mesIdx(n.mes);
    n._mi = i;
    n._p = i >= 0 ? `${n.año || "0000"}-${String(i + 1).padStart(2, "0")}` : `${n.año || "0000"}-${n.mes}`;
    return n;
  });
  state.multiYear = años.size > 1;
  out.forEach((n) => {
    n._pl = n._mi >= 0
      ? (state.multiYear ? `${MES_CORTO[n._mi]} ${n.año}` : MESES[n._mi].charAt(0).toUpperCase() + MESES[n._mi].slice(1))
      : n.mes || "(Sin mes)";
    n._ps = n._mi >= 0 ? (state.multiYear ? `${MES_CORTO[n._mi]} ${String(n.año).slice(-2)}` : MES_CORTO[n._mi]) : n._pl;
  });
  return out;
}
function calcDims(filas) {
  const uniq = (k) => Array.from(new Set(filas.map((r) => r[k]).filter(Boolean)));
  const porTexto = (a, b) => a.localeCompare(b, "es", { numeric: true, sensitivity: "base" });
  return {
    mes: uniq("mes").sort((a, b) => mesIdx(a) - mesIdx(b)),
    unidad: uniq("unidad").sort(porTexto),
    voladura: uniq("voladura").sort(porTexto),
    explosivo: uniq("explosivo").sort(porTexto),
    contratista: uniq("contratista").sort(porTexto),
    turno: uniq("turno").sort(porTexto),
  };
}

/* =========================== AGREGACIÓN =========================== */
// Todas las métricas son cocientes de SUMAS (nunca promedio de cocientes)
function agg(rows) {
  const s = { toneladas: 0, meta: 0, explosivoKg: 0, taladros: 0, metros: 0, horas: 0, detonadores: 0, costoExp: 0, costoPerf: 0, costoAcc: 0, costoTotal: 0, fallados: 0, incidentes: 0 };
  let ps = 0, pn = 0, vs = 0, vn = 0, vmax = 0;
  for (const r of rows) {
    for (const k in s) s[k] += r[k];
    if (r.p80 != null && isFinite(r.p80) && r.p80 > 0) { ps += r.p80; pn++; }
    if (r.ppv != null && isFinite(r.ppv) && r.ppv > 0) { vs += r.ppv; vn++; if (r.ppv > vmax) vmax = r.ppv; }
  }
  const t = s.toneladas;
  return {
    ...s,
    p80: pn ? ps / pn : 0,
    ppv: vn ? vs / vn : 0,
    ppvMax: vmax,
    cumplimiento: s.meta ? (t / s.meta) * 100 : 0,
    factorCarga: t ? s.explosivoKg / t : 0,
    costoTon: t ? s.costoTotal / t : 0,
    tasaFallados: s.taladros ? (s.fallados / s.taladros) * 100 : 0,
    rendimiento: s.metros ? t / s.metros : 0,
    metrosHora: s.horas ? s.metros / s.horas : 0,
    costoKg: s.explosivoKg ? s.costoExp / s.explosivoKg : 0,
    voladuras: rows.length,
    registros: rows.length,
  };
}
function groupBy(rows, fn) {
  const m = new Map();
  rows.forEach((r) => { const k = fn(r) || "(Sin dato)"; if (!m.has(k)) m.set(k, []); m.get(k).push(r); });
  return m;
}
function porDim(rows, dim) {
  return Array.from(groupBy(rows, (r) => r[dim]).entries())
    .map(([label, v]) => ({ label, ...agg(v) }))
    .sort((a, b) => b.toneladas - a.toneladas);
}
function porPeriodo(rows) {
  const g = groupBy(rows, (r) => r._p);
  return Array.from(g.entries())
    .map(([key, v]) => ({ key, label: v[0]._pl, short: v[0]._ps, mes: v[0].mes, año: v[0].año, ...agg(v) }))
    .sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
}
function filtrar(rows, filtros, except) {
  return rows.filter((r) => FILTER_KEYS.every((k) => k === except || !filtros[k] || r[k] === filtros[k]));
}
function matchCond(r, c) {
  if (c.dim === "periodo") return r._p === c.value;
  return (r[c.dim] || "(Sin dato)") === c.value;
}

function calcular() {
  state.vista = filtrar(state.filas, state.filtros);
  const v = state.vista;
  const sinMes = filtrar(state.filas, state.filtros, "mes");
  const tipoPeriodo = {};
  groupBy(v, (r) => r._p).forEach((rows, p) => {
    tipoPeriodo[p] = {};
    groupBy(rows, (r) => r.voladura).forEach((rr, c) => { tipoPeriodo[p][c] = rr.reduce((a, x) => a + x.toneladas, 0); });
  });
  state.d = {
    k: agg(v),
    periodos: porPeriodo(v),
    tendencia: porPeriodo(sinMes),
    unidad: porDim(v, "unidad"),
    voladura: porDim(v, "voladura"),
    explosivo: porDim(v, "explosivo").sort((a, b) => b.explosivoKg - a.explosivoKg),
    contratista: porDim(v, "contratista"),
    tipoPeriodo,
  };
}

/* Color por entidad (no por ranking): un filtro nunca repinta a los que quedan */
function colorOf(dim, value, t) {
  if (value === "Otros" || value === "(Sin dato)") return t.neutral;
  const list = state.dims[dim] || [];
  const i = list.indexOf(value);
  return i < 0 ? t.neutral : t.series[i % t.series.length];
}
function fold(list, max = 7, key = "toneladas") {
  if (list.length <= max + 1) return list;
  const top = list.slice(0, max), rest = list.slice(max);
  const otros = { label: "Otros", _otros: rest.map((r) => r.label) };
  ["toneladas", "meta", "explosivoKg", "costoExp", "costoTotal", "taladros", "metros", "fallados", "incidentes"].forEach((k) => { otros[k] = rest.reduce((a, r) => a + r[k], 0); });
  otros.factorCarga = otros.toneladas ? otros.explosivoKg / otros.toneladas : 0;
  otros.costoTon = otros.toneladas ? otros.costoTotal / otros.toneladas : 0;
  otros.costoKg = otros.explosivoKg ? otros.costoExp / otros.explosivoKg : 0;
  return [...top, otros].sort((a, b) => (a._otros ? 1 : b._otros ? -1 : b[key] - a[key]));
}


/* =========================== CHART.JS: PLUGINS =========================== */
const bgPlugin = {
  id: "coreBg",
  beforeDraw(chart) {
    const { ctx, width, height } = chart;
    ctx.save(); ctx.globalCompositeOperation = "destination-over";
    ctx.fillStyle = (state.tk && state.tk.surface) || "#fff";
    ctx.fillRect(0, 0, width, height); ctx.restore();
  },
};
const crossPlugin = {
  id: "coreCross",
  afterDatasetsDraw(chart, _a, opts) {
    if (!opts || !opts.enabled) return;
    const act = chart.tooltip && chart.tooltip.getActiveElements ? chart.tooltip.getActiveElements() : [];
    if (!act.length) return;
    const x = act[0].element.x, a = chart.chartArea, ctx = chart.ctx;
    ctx.save(); ctx.strokeStyle = state.tk.lineStrong; ctx.lineWidth = 1; ctx.setLineDash([3, 3]);
    ctx.beginPath(); ctx.moveTo(x, a.top); ctx.lineTo(x, a.bottom); ctx.stroke(); ctx.restore();
  },
};
const refPlugin = {
  id: "coreRef",
  afterDatasetsDraw(chart, _a, opts) {
    if (!opts || !Array.isArray(opts.lines)) return;
    const { ctx, chartArea: a } = chart;
    opts.lines.forEach((l) => {
      const sc = chart.scales[l.axis || "y"];
      if (!sc || l.value == null || !isFinite(l.value)) return;
      const p = sc.getPixelForValue(l.value);
      const vertical = sc.axis === "x";
      if (vertical ? (p < a.left - 1 || p > a.right + 1) : (p < a.top - 1 || p > a.bottom + 1)) return;
      ctx.save();
      ctx.strokeStyle = l.color || state.tk.ink3; ctx.lineWidth = 1.5; ctx.setLineDash([6, 4]);
      ctx.beginPath();
      if (vertical) { ctx.moveTo(p, a.top); ctx.lineTo(p, a.bottom); } else { ctx.moveTo(a.left, p); ctx.lineTo(a.right, p); }
      ctx.stroke(); ctx.setLineDash([]);
      if (l.label) {
        ctx.font = "600 11px 'Instrument Sans', system-ui, sans-serif";
        const w = ctx.measureText(l.label).width + 12;
        const x = vertical ? Math.min(p + 4, a.right - w) : a.right - w;
        const y = vertical ? a.top : p - 20;
        ctx.fillStyle = state.tk.surface; ctx.globalAlpha = 0.92;
        ctx.beginPath(); ctx.roundRect ? ctx.roundRect(x, y, w, 18, 5) : ctx.rect(x, y, w, 18); ctx.fill();
        ctx.globalAlpha = 1; ctx.fillStyle = state.tk.ink2; ctx.textBaseline = "middle";
        ctx.fillText(l.label, x + 6, y + 9);
      }
      ctx.restore();
    });
  },
};
const centerPlugin = {
  id: "coreCenter",
  afterDraw(chart, _a, opts) {
    if (!opts || !opts.title) return;
    const meta = chart.getDatasetMeta(0);
    if (!meta || !meta.data || !meta.data[0]) return;
    const { x, y } = meta.data[0];
    const ctx = chart.ctx;
    ctx.save(); ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillStyle = state.tk.ink; ctx.font = "700 19px 'Bricolage Grotesque', system-ui, sans-serif";
    ctx.fillText(opts.title, x, y - 8);
    ctx.fillStyle = state.tk.ink3; ctx.font = "500 11px 'Instrument Sans', system-ui, sans-serif";
    ctx.fillText(opts.sub || "", x, y + 13);
    ctx.restore();
  },
};

/* =========================== CHART.JS: FÁBRICAS =========================== */
function setupChartDefaults() {
  Chart.register(ChartDataLabels, bgPlugin, crossPlugin, refPlugin, centerPlugin);
  Chart.defaults.font.family = "'Instrument Sans', system-ui, sans-serif";
  Chart.defaults.font.size = 11.5;
  Chart.defaults.plugins.datalabels.display = false;
  Chart.defaults.plugins.legend.display = false;
  if (REDUCED) Chart.defaults.animation = false;
}

function tooltipCfg(t) {
  return {
    backgroundColor: t.surface, titleColor: t.ink, bodyColor: t.ink2, footerColor: t.ink,
    borderColor: t.lineStrong, borderWidth: 1, padding: 12, cornerRadius: 10, caretSize: 6,
    titleFont: { weight: "700", size: 12.5 }, bodyFont: { size: 12 }, footerFont: { weight: "600", size: 12 },
    boxWidth: 9, boxHeight: 9, boxPadding: 5, usePointStyle: true, displayColors: true,
  };
}
function legendCfg(t, show) {
  return {
    display: !!show, position: "bottom", align: "start",
    labels: { color: t.ink2, usePointStyle: true, pointStyle: "circle", boxWidth: 8, boxHeight: 8, padding: 16, font: { size: 12 } },
  };
}
function baseOptions(t, o = {}) {
  const fmtAxis = o.axisFmt || ((v) => fmt(v));
  const valueAxis = {
    beginAtZero: o.min == null, min: o.min, max: o.max, suggestedMax: o.suggestedMax, suggestedMin: o.suggestedMin, stacked: !!o.stacked,
    grid: { color: t.grid, drawTicks: false }, border: { display: false },
    ticks: { color: t.ink3, padding: 8, maxTicksLimit: 6, callback: (v) => fmtAxis(v) },
    title: o.valueTitle ? { display: true, text: o.valueTitle, color: t.ink3, font: { size: 11 } } : undefined,
  };
  const catAxis = {
    stacked: !!o.stacked, grid: { display: false }, border: { color: t.line },
    ticks: { color: t.ink2, padding: 6, autoSkip: !o.horizontal, maxRotation: 0, autoSkipPadding: 12, font: { size: 11.5 } },
  };
  return {
    responsive: true, maintainAspectRatio: false,
    animation: REDUCED ? false : { duration: 650, easing: "easeOutQuart" },
    interaction: { mode: o.mode || "index", intersect: false, axis: o.horizontal ? "y" : "x" },
    indexAxis: o.horizontal ? "y" : "x",
    layout: { padding: { top: o.padTop ?? 10, right: o.padRight ?? 8, left: 0, bottom: 0 } },
    scales: o.horizontal ? { x: valueAxis, y: catAxis } : { x: catAxis, y: valueAxis },
    plugins: { legend: legendCfg(t, o.legend), tooltip: tooltipCfg(t), datalabels: { display: false } },
  };
}

// Atenúa lo que no está bajo el cursor (enfoque visual)
const focusColor = (c, by = "index") => (ctx) => {
  const base = Array.isArray(c) ? c[ctx.dataIndex % c.length] : c;
  const f = ctx.chart.$focus;
  if (!f) return base;
  const hit = by === "dataset" ? ctx.datasetIndex === f.ds : by === "cell" ? (ctx.datasetIndex === f.ds && ctx.dataIndex === f.i) : ctx.dataIndex === f.i;
  return hit ? base : rgba(base, 0.28);
};
function barDs(t, label, data, color, o = {}) {
  return {
    label, data,
    backgroundColor: focusColor(color, o.by || "index"),
    hoverBackgroundColor: Array.isArray(color) ? color : color,
    borderRadius: o.stacked ? 3 : 5,
    borderSkipped: o.stacked ? false : "start",
    borderWidth: o.stacked ? 1 : 0,
    borderColor: t.surface,
    maxBarThickness: o.thick || 40,
    barPercentage: 0.78, categoryPercentage: 0.82,
    order: o.order || 1,
  };
}
function lineDs(t, label, data, color, o = {}) {
  return {
    label, data,
    borderColor: color, borderWidth: 2, tension: 0.35,
    borderDash: o.dashed ? [6, 5] : [],
    fill: o.fill ? "origin" : false,
    backgroundColor: o.fill
      ? (ctx) => {
          const { chart } = ctx; const a = chart.chartArea;
          if (!a) return rgba(color, 0.1);
          const g = chart.ctx.createLinearGradient(0, a.top, 0, a.bottom);
          g.addColorStop(0, rgba(color, 0.24)); g.addColorStop(1, rgba(color, 0));
          return g;
        }
      : color,
    pointStyle: o.dashed ? "line" : "circle",
    pointRadius: o.dashed ? 0 : 4, pointHoverRadius: o.dashed ? 0 : 7, pointHitRadius: 16,
    pointBackgroundColor: t.surface, pointBorderColor: color, pointBorderWidth: 2,
    pointHoverBackgroundColor: color, pointHoverBorderColor: t.surface, pointHoverBorderWidth: 3,
    spanGaps: true,
  };
}
const endLabels = (t, formatter) => ({
  display: (ctx) => ctx.dataset.data[ctx.dataIndex] != null,
  anchor: "end", align: "end", offset: 4, clamp: true,
  color: t.ink2, font: { weight: "600", size: 11 }, formatter,
});


/* =========================== INFO (botón "i") =========================== */
const INFO = {};

/* =========================== 12 GRÁFICOS =========================== */
const CHARTS = [
  /* ---------- RESUMEN ---------- */
  {
    id: "cTonMeta", sec: "resumen", span: 8, size: "lg", focus: false,
    title: "Toneladas voladas vs. plan", sub: "Toneladas por mes · la línea punteada es la meta",
    info: {
      what: "Cuánta roca se rompió cada mes con las voladuras, comparado con lo planificado.",
      how: "Toneladas = suma de Toneladas_Voladas del mes. Meta = suma de Meta_Toneladas del mes. Si la línea sólida queda por encima de la punteada, ese mes se cumplió el plan.",
      tip: "Pasá el mouse para ver el cumplimiento de cada mes; hacé clic para ver su detalle.",
    },
    build(d, t) {
      const P = d.periodos;
      return {
        empty: !P.length,
        config: {
          type: "line",
          data: { labels: P.map((p) => p.label), datasets: [
            lineDs(t, "Toneladas", P.map((p) => p.toneladas), t.series[0], { fill: true }),
            lineDs(t, "Meta", P.map((p) => p.meta), t.ink3, { dashed: true }),
          ] },
          options: merge(baseOptions(t, { legend: true, axisFmt: fmtTC }), {
            plugins: {
              coreCross: { enabled: true },
              tooltip: { callbacks: {
                label: (c) => ` ${c.dataset.label}: ${fmtT(c.parsed.y)}`,
                footer: (items) => { const p = P[items[0].dataIndex]; return p && p.meta ? [`Cumplimiento: ${fmtPct(p.cumplimiento)}`, `Voladuras: ${fmt(p.voladuras)}`] : ""; },
              } },
            },
          }),
        },
        table: {
          head: [{ t: "Mes" }, { t: "Toneladas", num: 1 }, { t: "Meta", num: 1 }, { t: "Cumplimiento", num: 1 }, { t: "Voladuras", num: 1 }],
          rows: P.map((p) => [cell(p.key, () => p.label), cell(p.toneladas, fmtT), cell(p.meta, fmtT), cell(p.cumplimiento, fmtPct), cell(p.voladuras, fmt)]),
          conds: P.map((p) => [{ dim: "periodo", value: p.key, label: p.label }]),
        },
        drill: (e) => { const p = P[e.index]; return p && [{ dim: "periodo", value: p.key, label: p.label }]; },
      };
    },
  },
  {
    id: "cExplosivo", sec: "resumen", span: 4, size: "donut", focus: true,
    title: "Consumo por tipo de explosivo", sub: "Porcentaje de los kilos cargados",
    info: {
      what: "Qué explosivos se usan y en qué proporción.",
      how: "Para cada tipo se suma Explosivo_Kg y se divide por el total de kilos en vista. El centro muestra el total consumido.",
      tip: "En temporada de lluvias suele subir la emulsión, porque resiste el agua en los taladros.",
    },
    build(d, t) {
      const L = fold(d.explosivo, 6, "explosivoKg");
      const total = d.k.explosivoKg || 1;
      const colors = L.map((c) => colorOf("explosivo", c.label, t));
      return {
        empty: !L.length || !d.k.explosivoKg,
        config: {
          type: "doughnut",
          data: { labels: L.map((c) => c.label), datasets: [{
            data: L.map((c) => c.explosivoKg), backgroundColor: focusColor(colors), hoverBackgroundColor: colors,
            borderColor: t.surface, borderWidth: 3, hoverOffset: 10, borderRadius: 4,
          }] },
          options: {
            responsive: true, maintainAspectRatio: false, cutout: "70%",
            animation: REDUCED ? false : { animateRotate: true, duration: 750, easing: "easeOutQuart" },
            layout: { padding: 10 },
            plugins: {
              legend: { display: false },
              tooltip: merge(tooltipCfg(t), { callbacks: {
                label: (c) => ` ${c.label}: ${fmtKg(c.parsed)} (${fmtPct((c.parsed / total) * 100)})`,
                afterLabel: (c) => { const r = L[c.dataIndex]; return r.costoKg ? `Costo: US$ ${fmt(r.costoKg, 2)}/kg` : ""; },
              } }),
              coreCenter: { title: fmtKgC(d.k.explosivoKg), sub: "Explosivo cargado" },
              datalabels: { display: false },
            },
          },
        },
        legend: L.map((c, i) => ({ label: c.label, color: colors[i], value: fmtKgC(c.explosivoKg), pct: (c.explosivoKg / total) * 100, index: i })),
        table: {
          head: [{ t: "Explosivo" }, { t: "Kilos", num: 1 }, { t: "Participación", num: 1 }, { t: "Costo", num: 1 }, { t: "US$/kg", num: 1 }],
          rows: L.map((c) => [c.label, cell(c.explosivoKg, fmtKg), cell((c.explosivoKg / total) * 100, fmtPct), cell(c.costoExp, fmtUSD), cell(c.costoKg, (v) => fmt(v, 2))]),
          conds: L.map((c) => (c._otros ? null : [{ dim: "explosivo", value: c.label }])),
        },
        drill: (e) => { const c = L[e.index]; return c && !c._otros && [{ dim: "explosivo", value: c.label }]; },
      };
    },
  },
  {
    id: "cUnidad", sec: "resumen", span: 6, size: "md", focus: true,
    title: "Toneladas por unidad minera", sub: "Ordenadas de mayor a menor",
    info: {
      what: "El aporte de cada unidad minera a la producción de roca volada.",
      how: "Para cada unidad se suma Toneladas_Voladas. En el detalle del cursor ves su cumplimiento del plan, factor de carga y costo por tonelada.",
      tip: "Clic en una barra para ver la unidad por dentro o filtrar todo el dashboard.",
    },
    build(d, t) {
      const L = d.unidad, total = d.k.toneladas || 1;
      return {
        empty: !L.length,
        config: {
          type: "bar",
          data: { labels: L.map((r) => r.label), datasets: [barDs(t, "Toneladas", L.map((r) => r.toneladas), t.series[0], { thick: 30 })] },
          options: merge(baseOptions(t, { horizontal: true, axisFmt: fmtTC, padRight: 64, mode: "nearest" }), {
            plugins: {
              datalabels: endLabels(t, (v) => fmtTC(v)),
              tooltip: { callbacks: {
                label: (c) => ` Toneladas: ${fmtT(c.parsed.x)}`,
                afterLabel: (c) => { const r = L[c.dataIndex]; return [`Participación: ${fmtPct((r.toneladas / total) * 100)}`, `Cumplimiento: ${fmtPct(r.cumplimiento)}`, `Factor de carga: ${fmtFC(r.factorCarga)}`, `Costo: ${fmtUSDt(r.costoTon)}`]; },
              } },
            },
          }),
        },
        table: {
          head: [{ t: "Unidad minera" }, { t: "Toneladas", num: 1 }, { t: "Participación", num: 1 }, { t: "Cumplimiento", num: 1 }, { t: "Costo/t", num: 1 }],
          rows: L.map((r) => [r.label, cell(r.toneladas, fmtT), cell((r.toneladas / total) * 100, fmtPct), cell(r.cumplimiento, fmtPct), cell(r.costoTon, fmtUSDt)]),
          conds: L.map((r) => [{ dim: "unidad", value: r.label }]),
        },
        drill: (e) => { const r = L[e.index]; return r && [{ dim: "unidad", value: r.label }]; },
      };
    },
  },

  /* ---------- PRODUCCIÓN Y PERFORACIÓN ---------- */
  {
    id: "cCumplMes", sec: "produccion", span: 6, size: "md", focus: true,
    title: "Cumplimiento del plan por mes", sub: "Barras claras: meses que no llegaron a la meta",
    info: {
      what: "Qué porcentaje de las toneladas planificadas se logró romper cada mes.",
      how: "Cumplimiento = Toneladas_Voladas ÷ Meta_Toneladas × 100, sumando todas las voladuras del mes. La línea punteada marca el 100 %.",
      tip: "Clic en un mes para ver qué unidades o tipos de voladura explican el resultado.",
    },
    build(d, t) {
      const P = d.periodos.filter((p) => p.meta > 0);
      const max = Math.max(110, ...P.map((p) => p.cumplimiento)) * 1.08;
      const colors = P.map((p) => (p.cumplimiento >= 100 ? t.series[0] : rgba(t.series[0], 0.42)));
      return {
        empty: !P.length,
        config: {
          type: "bar",
          data: { labels: P.map((p) => p.label), datasets: [barDs(t, "Cumplimiento", P.map((p) => p.cumplimiento), colors)] },
          options: merge(baseOptions(t, { axisFmt: (v) => v + " %", suggestedMax: max, padTop: 22, mode: "nearest" }), {
            plugins: {
              coreRef: { lines: [{ axis: "y", value: 100, label: "Meta 100 %" }] },
              datalabels: merge(endLabels(t, (v) => fmt(v, 0) + " %"), { offset: 2 }),
              tooltip: { callbacks: {
                label: (c) => ` Cumplimiento: ${fmtPct(c.parsed.y)}`,
                afterLabel: (c) => { const p = P[c.dataIndex]; return [`Toneladas: ${fmtT(p.toneladas)}`, `Meta: ${fmtT(p.meta)}`, p.cumplimiento >= 100 ? "Cumplió el plan" : `Faltaron ${fmtT(p.meta - p.toneladas)}`]; },
              } },
            },
          }),
        },
        table: {
          head: [{ t: "Mes" }, { t: "Toneladas", num: 1 }, { t: "Meta", num: 1 }, { t: "Cumplimiento", num: 1 }, { t: "Diferencia", num: 1 }],
          rows: P.map((p) => [cell(p.key, () => p.label), cell(p.toneladas, fmtT), cell(p.meta, fmtT), cell(p.cumplimiento, fmtPct), cell(p.toneladas - p.meta, fmtT)]),
          conds: P.map((p) => [{ dim: "periodo", value: p.key, label: p.label }]),
        },
        drill: (e) => { const p = P[e.index]; return p && [{ dim: "periodo", value: p.key, label: p.label }]; },
      };
    },
  },
  {
    id: "cTipoMes", sec: "produccion", span: 6, size: "md", focus: true,
    title: "Toneladas por tipo de voladura", sub: "Composición de la producción de cada mes",
    info: {
      what: "Qué tipo de disparo genera las toneladas de cada mes: producción, amortiguada, precorte, secundaria u otros.",
      how: "Cada segmento es la suma de Toneladas_Voladas de un tipo de voladura en ese mes; la altura de la barra es el total del mes. Si hay más de 8 tipos, los menores se agrupan en «Otros».",
      tip: "Clic en un segmento para ver ese tipo de voladura en ese mes.",
    },
    build(d, t) {
      const P = d.periodos;
      const tipos = fold(d.voladura, 7);
      const otrosSet = new Set(tipos.find((c) => c._otros)?._otros || []);
      const valor = (p, c) => c._otros
        ? Object.entries(d.tipoPeriodo[p.key] || {}).filter(([k]) => otrosSet.has(k)).reduce((a, [, v]) => a + v, 0)
        : (d.tipoPeriodo[p.key] || {})[c.label] || 0;
      return {
        empty: !P.length || !tipos.length,
        config: {
          type: "bar",
          data: { labels: P.map((p) => p.label), datasets: tipos.map((c) => barDs(t, c.label, P.map((p) => valor(p, c)), colorOf("voladura", c.label, t), { stacked: true, by: "cell" })) },
          options: merge(baseOptions(t, { stacked: true, legend: true, axisFmt: fmtTC, mode: "index" }), {
            plugins: { tooltip: { callbacks: {
              label: (c) => ` ${c.dataset.label}: ${fmtT(c.parsed.y)}`,
              footer: (items) => `Total del mes: ${fmtT(items.reduce((a, i) => a + i.parsed.y, 0))}`,
            } } },
          }),
        },
        table: {
          head: [{ t: "Mes" }, ...tipos.map((c) => ({ t: c.label, num: 1 })), { t: "Total", num: 1 }],
          rows: P.map((p) => [cell(p.key, () => p.label), ...tipos.map((c) => cell(valor(p, c), fmtT)), cell(p.toneladas, fmtT)]),
          conds: P.map((p) => [{ dim: "periodo", value: p.key, label: p.label }]),
        },
        drill: (e) => {
          const p = P[e.index], c = tipos[e.datasetIndex];
          if (!p || !c) return null;
          return c._otros ? [{ dim: "periodo", value: p.key, label: p.label }] : [{ dim: "periodo", value: p.key, label: p.label }, { dim: "voladura", value: c.label }];
        },
      };
    },
  },
  {
    id: "cRendContrata", sec: "produccion", span: 5, size: "lg", focus: true,
    title: "Rendimiento por contratista", sub: "Toneladas rotas por cada metro perforado",
    info: {
      what: "Qué tan productiva es la perforación de cada contratista: cuánta roca se rompe por cada metro perforado.",
      how: "Rendimiento = suma de Toneladas_Voladas ÷ suma de Metros_Perforados. La línea punteada es el rendimiento de todo lo que está en vista. Más alto es mejor.",
      tip: "En el detalle del cursor ves también los metros por hora de perforadora.",
    },
    build(d, t) {
      const L = d.contratista.filter((c) => c.label !== "(Sin dato)" && c.metros > 0).sort((a, b) => b.rendimiento - a.rendimiento);
      return {
        empty: !L.length,
        config: {
          type: "bar",
          data: { labels: L.map((c) => c.label), datasets: [barDs(t, "Rendimiento", L.map((c) => c.rendimiento), t.series[2], { thick: 30 })] },
          options: merge(baseOptions(t, { horizontal: true, axisFmt: (v) => fmt(v, 0), padRight: 60, padTop: 22, mode: "nearest" }), {
            plugins: {
              coreRef: { lines: [{ axis: "x", value: d.k.rendimiento, label: `Prom. ${fmt(d.k.rendimiento, 1)} t/m` }] },
              datalabels: endLabels(t, (v) => fmt(v, 1) + " t/m"),
              tooltip: { callbacks: {
                label: (c) => ` Rendimiento: ${fmt(c.parsed.x, 1)} t/m`,
                afterLabel: (c) => { const r = L[c.dataIndex]; return [`Metros perforados: ${fmt(r.metros, 0)} m`, `Velocidad: ${fmt(r.metrosHora, 1)} m/h`, `Toneladas: ${fmtT(r.toneladas)}`]; },
              } },
            },
          }),
        },
        table: {
          head: [{ t: "Contratista" }, { t: "t/m", num: 1 }, { t: "Metros", num: 1 }, { t: "m/h", num: 1 }, { t: "Toneladas", num: 1 }],
          rows: L.map((c) => [c.label, cell(c.rendimiento, (v) => fmt(v, 1)), cell(c.metros, fmt), cell(c.metrosHora, (v) => fmt(v, 1)), cell(c.toneladas, fmtT)]),
          conds: L.map((c) => [{ dim: "contratista", value: c.label }]),
        },
        drill: (e) => { const c = L[e.index]; return c && [{ dim: "contratista", value: c.label }]; },
      };
    },
  },

  /* ---------- COSTOS Y EXPLOSIVOS ---------- */
  {
    id: "cCostoTonMes", sec: "costos", span: 8, size: "lg", focus: false,
    title: "Costo por tonelada volada", sub: "US$ por tonelada, mes a mes · la línea punteada es el promedio",
    info: {
      what: "Cuánto cuesta romper una tonelada de roca, sumando explosivo, perforación y accesorios.",
      how: "Costo por tonelada = suma de Costo_Total_USD ÷ suma de Toneladas_Voladas del mes. Si Costo_Total_USD viene vacío se suman Explosivo + Perforación + Accesorios. Más bajo es mejor.",
      tip: "Clic en un mes para ver qué unidad o tipo de voladura lo encareció.",
    },
    build(d, t) {
      const P = d.periodos.filter((p) => p.toneladas > 0);
      return {
        empty: !P.length || !d.k.costoTotal,
        config: {
          type: "line",
          data: { labels: P.map((p) => p.label), datasets: [lineDs(t, "Costo por tonelada", P.map((p) => p.costoTon), t.series[1], { fill: true })] },
          options: merge(baseOptions(t, { min: 0, axisFmt: (v) => "US$ " + fmt(v, 2), padTop: 22 }), {
            plugins: {
              coreCross: { enabled: true },
              coreRef: { lines: [{ axis: "y", value: d.k.costoTon, label: `Prom. US$ ${fmt(d.k.costoTon, 3)}/t` }] },
              tooltip: { callbacks: {
                label: (c) => ` Costo: ${fmtUSDt(c.parsed.y)}`,
                afterLabel: (c) => { const p = P[c.dataIndex]; return [`Costo total: ${fmtUSD(p.costoTotal)}`, `Toneladas: ${fmtT(p.toneladas)}`]; },
              } },
            },
          }),
        },
        table: {
          head: [{ t: "Mes" }, { t: "Costo/t", num: 1 }, { t: "Explosivo", num: 1 }, { t: "Perforación", num: 1 }, { t: "Accesorios", num: 1 }, { t: "Total", num: 1 }],
          rows: P.map((p) => [cell(p.key, () => p.label), cell(p.costoTon, fmtUSDt), cell(p.costoExp, fmtUSD), cell(p.costoPerf, fmtUSD), cell(p.costoAcc, fmtUSD), cell(p.costoTotal, fmtUSD)]),
          conds: P.map((p) => [{ dim: "periodo", value: p.key, label: p.label }]),
        },
        drill: (e) => { const p = P[e.index]; return p && [{ dim: "periodo", value: p.key, label: p.label }]; },
      };
    },
  },
  {
    id: "cFactorTipo", sec: "costos", span: 4, size: "lg", focus: true,
    title: "Factor de carga por tipo de voladura", sub: "Kilos de explosivo por tonelada rota",
    info: {
      what: "Cuánto explosivo se necesita para romper una tonelada, según el tipo de disparo.",
      how: "Factor de carga = suma de Explosivo_Kg ÷ suma de Toneladas_Voladas. La línea punteada es el factor de todo lo que está en vista. Un factor alto encarece; uno bajo puede dejar bolones (roca gruesa).",
      tip: "Comparalo con la fragmentación P80 en «Seguridad y calidad».",
    },
    build(d, t) {
      const L = d.voladura.filter((c) => c.toneladas > 0).sort((a, b) => b.factorCarga - a.factorCarga);
      return {
        empty: !L.length,
        config: {
          type: "bar",
          data: { labels: L.map((c) => c.label), datasets: [barDs(t, "Factor de carga", L.map((c) => c.factorCarga), t.series[1], { thick: 30 })] },
          options: merge(baseOptions(t, { horizontal: true, axisFmt: (v) => fmt(v, 2), padRight: 58, padTop: 22, mode: "nearest" }), {
            plugins: {
              coreRef: { lines: [{ axis: "x", value: d.k.factorCarga, label: `Prom. ${fmt(d.k.factorCarga, 3)}` }] },
              datalabels: endLabels(t, (v) => fmt(v, 3)),
              tooltip: { callbacks: {
                label: (c) => ` Factor de carga: ${fmtFC(c.parsed.x)}`,
                afterLabel: (c) => { const r = L[c.dataIndex]; return [`Explosivo: ${fmtKg(r.explosivoKg)}`, `Toneladas: ${fmtT(r.toneladas)}`, r.p80 ? `P80 promedio: ${fmt(r.p80, 1)} cm` : "P80: no aplica"]; },
              } },
            },
          }),
        },
        table: {
          head: [{ t: "Tipo de voladura" }, { t: "kg/t", num: 1 }, { t: "Explosivo", num: 1 }, { t: "Toneladas", num: 1 }, { t: "P80", num: 1 }],
          rows: L.map((c) => [c.label, cell(c.factorCarga, (v) => fmt(v, 3)), cell(c.explosivoKg, fmtKg), cell(c.toneladas, fmtT), cell(c.p80, (v) => (v ? fmt(v, 1) + " cm" : "—"))]),
          conds: L.map((c) => [{ dim: "voladura", value: c.label }]),
        },
        drill: (e) => { const c = L[e.index]; return c && [{ dim: "voladura", value: c.label }]; },
      };
    },
  },
  {
    id: "cCostoUnidad", sec: "costos", span: 6, size: "md", focus: true,
    title: "Estructura de costos por unidad minera", sub: "Perforación, explosivo y accesorios · US$",
    info: {
      what: "En qué se va el dinero de perforación y voladura de cada unidad minera.",
      how: "Cada tramo es la suma de su columna: Costo_Perforacion_USD, Costo_Explosivo_USD y Costo_Accesorios_USD. La barra completa es el costo total de la unidad.",
      tip: "En el detalle del cursor ves el costo por tonelada de la unidad.",
    },
    build(d, t) {
      const L = d.unidad.filter((u) => u.costoTotal > 0).sort((a, b) => b.costoTotal - a.costoTotal);
      const comp = [["Perforación", "costoPerf", t.series[0]], ["Explosivo", "costoExp", t.series[1]], ["Accesorios", "costoAcc", t.series[2]]];
      return {
        empty: !L.length,
        config: {
          type: "bar",
          data: { labels: L.map((u) => u.label), datasets: comp.map(([lab, key, col]) => barDs(t, lab, L.map((u) => u[key]), col, { stacked: true, by: "cell", thick: 32 })) },
          options: merge(baseOptions(t, { horizontal: true, stacked: true, legend: true, axisFmt: fmtUSDC, mode: "index" }), {
            plugins: { tooltip: { callbacks: {
              label: (c) => ` ${c.dataset.label}: ${fmtUSD(c.parsed.x)} (${fmtPct((c.parsed.x / (L[c.dataIndex].costoTotal || 1)) * 100, 0)})`,
              footer: (items) => { const u = L[items[0].dataIndex]; return [`Total: ${fmtUSD(u.costoTotal)}`, `Costo por tonelada: ${fmtUSDt(u.costoTon)}`]; },
            } } },
          }),
        },
        table: {
          head: [{ t: "Unidad minera" }, { t: "Perforación", num: 1 }, { t: "Explosivo", num: 1 }, { t: "Accesorios", num: 1 }, { t: "Total", num: 1 }, { t: "Costo/t", num: 1 }],
          rows: L.map((u) => [u.label, cell(u.costoPerf, fmtUSD), cell(u.costoExp, fmtUSD), cell(u.costoAcc, fmtUSD), cell(u.costoTotal, fmtUSD), cell(u.costoTon, fmtUSDt)]),
          conds: L.map((u) => [{ dim: "unidad", value: u.label }]),
        },
        drill: (e) => { const u = L[e.index]; return u && [{ dim: "unidad", value: u.label }]; },
      };
    },
  },

  /* ---------- SEGURIDAD Y CALIDAD ---------- */
  {
    id: "cFalladosMes", sec: "seguridad", span: 6, size: "md", focus: false,
    title: "Tasa de tiros fallados", sub: "Porcentaje de taladros que no detonaron · por mes",
    info: {
      what: "Qué porcentaje de los taladros cargados no detonó. Un tiro fallado es un riesgo de seguridad y obliga a re-disparar.",
      how: "Tasa = suma de Tiros_Fallados ÷ suma de Taladros_Perforados × 100. La línea punteada es la tasa de todo lo que está en vista. Más bajo es mejor.",
      tip: "Revisá los meses de lluvia: el agua en los taladros suele aumentar los tiros fallados.",
    },
    build(d, t) {
      const P = d.periodos.filter((p) => p.taladros > 0);
      return {
        empty: !P.length,
        config: {
          type: "line",
          data: { labels: P.map((p) => p.label), datasets: [lineDs(t, "Tiros fallados", P.map((p) => p.tasaFallados), t.series[6], { fill: true })] },
          options: merge(baseOptions(t, { min: 0, axisFmt: (v) => fmt(v, 2) + " %", padTop: 22 }), {
            plugins: {
              coreCross: { enabled: true },
              coreRef: { lines: [{ axis: "y", value: d.k.tasaFallados, label: `Prom. ${fmt(d.k.tasaFallados, 2)} %` }] },
              tooltip: { callbacks: {
                label: (c) => ` Tasa: ${fmtPct(c.parsed.y, 2)}`,
                afterLabel: (c) => { const p = P[c.dataIndex]; return [`Tiros fallados: ${fmt(p.fallados)} de ${fmt(p.taladros)} taladros`, `Incidentes de seguridad: ${fmt(p.incidentes)}`]; },
              } },
            },
          }),
        },
        table: {
          head: [{ t: "Mes" }, { t: "Tasa", num: 1 }, { t: "Tiros fallados", num: 1 }, { t: "Taladros", num: 1 }, { t: "Incidentes", num: 1 }],
          rows: P.map((p) => [cell(p.key, () => p.label), cell(p.tasaFallados, (v) => fmtPct(v, 2)), cell(p.fallados, fmt), cell(p.taladros, fmt), cell(p.incidentes, fmt)]),
          conds: P.map((p) => [{ dim: "periodo", value: p.key, label: p.label }]),
        },
        drill: (e) => { const p = P[e.index]; return p && [{ dim: "periodo", value: p.key, label: p.label }]; },
      };
    },
  },
  {
    id: "cPpvUnidad", sec: "seguridad", span: 6, size: "md", focus: true,
    title: "Vibración por unidad minera (PPV)", sub: "Promedio y máximo registrado · mm/s",
    info: {
      what: "La intensidad de las vibraciones que generan los disparos en cada unidad minera, clave para cuidar taludes, instalaciones y comunidades cercanas.",
      how: "PPV promedio = promedio de Vibracion_PPV_mm_s de las voladuras con medición. PPV máximo = el valor más alto registrado. Las celdas vacías no cuentan.",
      tip: "Compará el máximo con el límite permitido en tu estudio de vibraciones.",
    },
    build(d, t) {
      const L = d.unidad.filter((u) => u.ppv > 0).sort((a, b) => b.ppvMax - a.ppvMax);
      return {
        empty: !L.length,
        config: {
          type: "bar",
          data: { labels: L.map((u) => u.label), datasets: [
            barDs(t, "PPV promedio", L.map((u) => u.ppv), t.series[0], { by: "index" }),
            barDs(t, "PPV máximo", L.map((u) => u.ppvMax), t.series[1], { by: "index" }),
          ] },
          options: merge(baseOptions(t, { legend: true, axisFmt: (v) => fmt(v, 0), valueTitle: "mm/s", padTop: 18, mode: "index" }), {
            plugins: { tooltip: { callbacks: {
              label: (c) => ` ${c.dataset.label}: ${fmt(c.parsed.y, 1)} mm/s`,
              footer: (items) => `Voladuras: ${fmt(L[items[0].dataIndex].voladuras)}`,
            } } },
          }),
        },
        table: {
          head: [{ t: "Unidad minera" }, { t: "PPV prom.", num: 1 }, { t: "PPV máx.", num: 1 }, { t: "Voladuras", num: 1 }],
          rows: L.map((u) => [u.label, cell(u.ppv, (v) => fmt(v, 1) + " mm/s"), cell(u.ppvMax, (v) => fmt(v, 1) + " mm/s"), cell(u.voladuras, fmt)]),
          conds: L.map((u) => [{ dim: "unidad", value: u.label }]),
        },
        drill: (e) => { const u = L[e.index]; return u && [{ dim: "unidad", value: u.label }]; },
      };
    },
  },
  {
    id: "cFcP80", sec: "seguridad", span: 6, size: "md", focus: true,
    title: "Factor de carga vs. fragmentación", sub: "Una burbuja por unidad minera · tamaño = toneladas",
    info: {
      what: "Si cargar más explosivo por tonelada se traduce en roca más fina, unidad por unidad.",
      how: "Eje horizontal: factor de carga (Explosivo_Kg ÷ Toneladas_Voladas). Eje vertical: promedio de Fragmentacion_P80_cm, el tamaño bajo el que pasa el 80 % de la roca. El tamaño de la burbuja es la suma de toneladas.",
      tip: "Abajo a la izquierda es lo ideal: roca fina con poco explosivo.",
    },
    build(d, t) {
      const L = d.unidad.filter((u) => u.factorCarga > 0 && u.p80 > 0);
      const maxT = Math.max(1, ...L.map((u) => u.toneladas));
      const c = t.series[0];
      return {
        empty: !L.length,
        config: {
          type: "bubble",
          data: { datasets: [{
            label: "Unidades mineras",
            data: L.map((u) => ({ x: u.factorCarga, y: u.p80, r: 7 + Math.sqrt(u.toneladas / maxT) * 15 })),
            backgroundColor: (ctx) => { const f = ctx.chart.$focus; return f && f.i !== ctx.dataIndex ? rgba(c, 0.12) : rgba(c, 0.55); },
            borderColor: c, borderWidth: 1.5, hoverBorderWidth: 2.5, hoverBackgroundColor: rgba(c, 0.75),
          }] },
          options: {
            responsive: true, maintainAspectRatio: false,
            animation: REDUCED ? false : { duration: 650, easing: "easeOutQuart" },
            layout: { padding: { top: 26, right: 26, left: 6 } },
            interaction: { mode: "nearest", intersect: true },
            scales: {
              x: { grace: "15%", grid: { color: t.grid, drawTicks: false }, border: { display: false }, ticks: { color: t.ink3, padding: 8, callback: (v) => fmt(v, 3) }, title: { display: true, text: "Factor de carga (kg/t)", color: t.ink3 } },
              y: { grace: "12%", grid: { color: t.grid, drawTicks: false }, border: { display: false }, ticks: { color: t.ink3, padding: 8, callback: (v) => fmt(v, 1) }, title: { display: true, text: "Fragmentación P80 (cm)", color: t.ink3 } },
            },
            plugins: {
              legend: { display: false },
              tooltip: merge(tooltipCfg(t), { displayColors: false, callbacks: {
                title: (items) => L[items[0].dataIndex].label,
                label: (ctx) => { const u = L[ctx.dataIndex]; return [`Factor de carga: ${fmtFC(u.factorCarga)}`, `P80 promedio: ${fmt(u.p80, 1)} cm`, `Toneladas: ${fmtT(u.toneladas)}`]; },
              } }),
              datalabels: {
                display: true, align: "top", anchor: "end", offset: 2, clamp: true,
                color: t.ink, font: { weight: "600", size: 11 }, formatter: (_v, ctx) => L[ctx.dataIndex].label,
              },
            },
          },
        },
        table: {
          head: [{ t: "Unidad minera" }, { t: "kg/t", num: 1 }, { t: "P80", num: 1 }, { t: "Toneladas", num: 1 }],
          rows: L.map((u) => [u.label, cell(u.factorCarga, (v) => fmt(v, 3)), cell(u.p80, (v) => fmt(v, 1) + " cm"), cell(u.toneladas, fmtT)]),
          conds: L.map((u) => [{ dim: "unidad", value: u.label }]),
        },
        drill: (e) => { const u = L[e.index]; return u && [{ dim: "unidad", value: u.label }]; },
      };
    },
  },
];
CHARTS.forEach((c) => { INFO["chart:" + c.id] = { title: c.title, ...c.info }; });

/* =========================== TARJETAS EXTRA (tablas e insights) =========================== */
const EXTRAS = [
  {
    id: "xHallazgos", sec: "resumen", span: 6, title: "Hallazgos automáticos", sub: "Lo que más se destaca con los filtros actuales",
    info: { what: "Frases que resumen lo más relevante de las voladuras en vista: el mejor mes, el cumplimiento del plan, la seguridad y la unidad más eficiente.", how: "Se recalculan cada vez que cambiás un filtro o llegan datos nuevos. Ninguna está escrita a mano: salen de comparar los totales.", tip: "Clic en un hallazgo para abrir su detalle." },
    render: renderHallazgos,
  },
  {
    id: "tUnidad", sec: "produccion", span: 7, title: "Detalle por unidad minera", sub: "Ordená por cualquier columna · clic en una fila para ver el detalle",
    info: { what: "Producción, perforación y consumo de explosivo de cada unidad minera en una sola tabla.", how: "Participación = toneladas de la unidad ÷ toneladas en vista. Cumplimiento = Toneladas ÷ Meta. Rendimiento = Toneladas ÷ Metros perforados. Factor de carga = Explosivo_Kg ÷ Toneladas." },
    table: (d) => {
      const total = d.k.toneladas || 1;
      return {
        head: [{ t: "Unidad minera" }, { t: "Voladuras", num: 1 }, { t: "Toneladas", num: 1 }, { t: "Particip.", num: 1, bar: 1 }, { t: "Cumpl.", num: 1 }, { t: "t/m", num: 1 }, { t: "kg/t", num: 1 }],
        rows: d.unidad.map((u) => [u.label, cell(u.voladuras, fmt), cell(u.toneladas, fmtT), cell((u.toneladas / total) * 100, fmtPct), cell(u.cumplimiento, fmtPct), cell(u.rendimiento, (v) => fmt(v, 1)), cell(u.factorCarga, (v) => fmt(v, 3))]),
        conds: d.unidad.map((u) => [{ dim: "unidad", value: u.label }]),
      };
    },
  },
  {
    id: "tExplosivo", sec: "costos", span: 6, title: "Detalle por tipo de explosivo", sub: "Ordená por cualquier columna · clic en una fila para ver el detalle",
    info: { what: "Cuánto se usó de cada explosivo, cuánto costó y cuánta roca rompió.", how: "US$/kg = Costo_Explosivo_USD ÷ Explosivo_Kg. Factor de carga = Explosivo_Kg ÷ Toneladas_Voladas de las voladuras que usaron ese explosivo." },
    table: (d) => {
      const total = d.k.explosivoKg || 1;
      return {
        head: [{ t: "Explosivo" }, { t: "Kilos", num: 1 }, { t: "Particip.", num: 1, bar: 1 }, { t: "Costo", num: 1 }, { t: "US$/kg", num: 1 }, { t: "kg/t", num: 1 }],
        rows: d.explosivo.map((x) => [x.label, cell(x.explosivoKg, fmtKg), cell((x.explosivoKg / total) * 100, fmtPct), cell(x.costoExp, fmtUSD), cell(x.costoKg, (v) => fmt(v, 2)), cell(x.factorCarga, (v) => fmt(v, 3))]),
        conds: d.explosivo.map((x) => [{ dim: "explosivo", value: x.label }]),
      };
    },
  },
  {
    id: "tSeguridad", sec: "seguridad", span: 6, title: "Control mensual de seguridad y calidad", sub: "Tiros fallados, incidentes, vibración y fragmentación",
    info: { what: "El control de cada mes: cuántos disparos hubo, cuántos tiros fallaron, incidentes, vibración y tamaño de la roca.", how: "Tasa = Tiros_Fallados ÷ Taladros_Perforados. PPV prom. y P80 son promedios de las voladuras con medición; PPV máx. es el mayor valor del mes." },
    table: (d) => ({
      head: [{ t: "Mes" }, { t: "Voladuras", num: 1 }, { t: "Fallados", num: 1 }, { t: "Tasa", num: 1 }, { t: "Incidentes", num: 1 }, { t: "PPV prom.", num: 1 }, { t: "PPV máx.", num: 1 }, { t: "P80", num: 1 }],
      rows: d.periodos.map((p) => [cell(p.key, () => p.label), cell(p.voladuras, fmt), cell(p.fallados, fmt), cell(p.tasaFallados, (v) => fmtPct(v, 2)), cell(p.incidentes, fmt), cell(p.ppv, (v) => fmt(v, 1)), cell(p.ppvMax, (v) => fmt(v, 1)), cell(p.p80, (v) => (v ? fmt(v, 1) : "—"))]),
      conds: d.periodos.map((p) => [{ dim: "periodo", value: p.key, label: p.label }]),
    }),
  },
];
EXTRAS.forEach((x) => { INFO["extra:" + x.id] = { title: x.title, ...x.info }; });

/* =========================== KPIs =========================== */
// better: "up" (subir es bueno) · "down" (bajar es bueno) · "neutral" (depende del diseño del disparo)
const KPIS = [
  { id: "toneladas", label: "Toneladas voladas", icon: "fa-mountain", slot: 0, f: (v) => (v >= 1e6 ? fmtTC(v) : fmtT(v)), delta: "pct", better: "up",
    info: { what: "Toda la roca fragmentada por las voladuras en vista.", how: "Suma de Toneladas_Voladas. La flecha compara el último mes con el anterior; la mini línea muestra la evolución mensual." } },
  { id: "cumplimiento", label: "Cumplimiento del plan", icon: "fa-bullseye", slot: 6, f: (v) => fmtPct(v), delta: "pp", better: "up", bar: 100,
    status: (v, k) => (k.meta > 0 ? (v >= 100 ? ["good", "fa-circle-check", "Plan cumplido"] : v >= 95 ? ["warn", "fa-circle-exclamation", "Cerca del plan"] : ["crit", "fa-circle-xmark", "Por debajo del plan"]) : null),
    info: { what: "Qué porcentaje de las toneladas planificadas se logró romper.", how: "Toneladas_Voladas ÷ Meta_Toneladas × 100. Estado: 100 % o más = plan cumplido; 95 a 99,9 % = cerca; menos de 95 % = por debajo." } },
  { id: "factorCarga", label: "Factor de carga", icon: "fa-burst", slot: 1, f: (v) => fmt(v, 3), unit: "kg/t", delta: "abs", dec: 3, better: "neutral",
    info: { what: "Kilos de explosivo usados para romper cada tonelada de roca.", how: "Suma de Explosivo_Kg ÷ suma de Toneladas_Voladas. No hay un «mejor» universal: alto encarece y aumenta la vibración; bajo puede dejar roca gruesa. Se compara contra el diseño de cada mina." } },
  { id: "costoTon", label: "Costo por tonelada", icon: "fa-dollar-sign", slot: 2, f: (v) => "US$ " + fmt(v, 3), unit: "/t", delta: "pct", better: "down",
    info: { what: "Cuánto cuesta romper una tonelada de roca (perforación + explosivo + accesorios).", how: "Suma de Costo_Total_USD ÷ suma de Toneladas_Voladas. Acá bajar es bueno: una flecha hacia abajo se muestra en verde." } },
  { id: "tasaFallados", label: "Tiros fallados", icon: "fa-triangle-exclamation", slot: 4, f: (v) => fmtPct(v, 2), delta: "pp", dec: 2, better: "down",
    info: { what: "Porcentaje de taladros que no detonaron: un riesgo de seguridad que obliga a re-disparar.", how: "Suma de Tiros_Fallados ÷ suma de Taladros_Perforados × 100. Bajar es bueno." } },
  { id: "incidentes", label: "Incidentes de seguridad", icon: "fa-helmet-safety", slot: 7, f: (v) => fmt(v), delta: "abs", dec: 0, better: "down",
    status: (v) => (v === 0 ? ["good", "fa-shield-halved", "Sin incidentes"] : null),
    info: { what: "Cantidad de incidentes de seguridad registrados en las voladuras en vista.", how: "Suma de Incidentes_Seguridad. La flecha compara el último mes con el anterior; bajar es bueno." } },
];
KPIS.forEach((k) => { INFO["kpi:" + k.id] = { title: k.label, ...k.info }; });


/* =========================== LAYOUT =========================== */
function construirLayout() {
  // Pestañas
  $("dashTabs").innerHTML = SEC_KEYS.map((k, i) => {
    const s = SECCIONES[k];
    return `<a href="#${k}" class="tab" role="tab" data-seccion="${k}" aria-selected="false"><i class="fas ${s.icon}"></i><span>${s.titulo}</span><kbd>${i + 1}</kbd></a>`;
  }).join("");

  // Encabezados de sección
  SEC_KEYS.forEach((k) => {
    const s = SECCIONES[k];
    document.querySelector(`#sec-${k} .page-head`).innerHTML =
      `<div class="page-head-ico"><i class="fas ${s.icon}"></i></div><div><h1>${s.titulo}</h1><p>${s.desc}</p></div>`;
  });

  // KPIs (esqueleto)
  $("kpiRow").innerHTML = KPIS.map((k) => `
    <article class="card kpi" data-kpi="${k.id}" style="--accent: var(--series-${k.slot + 1})">
      <header class="kpi-head">
        <span class="kpi-ico"><i class="fas ${k.icon}"></i></span>
        <h3>${k.label}</h3>
        ${infoBtn("kpi:" + k.id, k.label)}
      </header>
      <div class="kpi-val"><span class="kpi-num"><span class="sk sk-kpi"></span></span>${k.unit ? `<small>${k.unit}</small>` : ""}</div>
      <div class="kpi-mid"></div>
      <footer class="kpi-foot"><span class="sk sk-line"></span></footer>
    </article>`).join("");

  // Gráficos + extras por sección (el orden de CHARTS/EXTRAS define la grilla)
  const orden = {
    resumen: ["cTonMeta", "cExplosivo", "cUnidad", "xHallazgos"],
    produccion: ["cCumplMes", "cTipoMes", "cRendContrata", "tUnidad"],
    costos: ["cCostoTonMes", "cFactorTipo", "cCostoUnidad", "tExplosivo"],
    seguridad: ["cFalladosMes", "cPpvUnidad", "cFcP80", "tSeguridad"],
  };
  SEC_KEYS.forEach((sec) => {
    $("grid-" + sec).innerHTML = orden[sec].map((id) => {
      const c = CHARTS.find((x) => x.id === id);
      if (c) return chartCard(c);
      const x = EXTRAS.find((e) => e.id === id);
      return x ? extraCard(x) : "";
    }).join("");
  });
}

function infoBtn(key, label) {
  return `<button type="button" class="card-btn info-btn js-info" data-info="${key}" aria-label="Qué significa: ${esc(label)}" aria-expanded="false"><i class="fas fa-circle-info"></i></button>`;
}
function chartCard(c) {
  return `
  <article class="card chart-card span-${c.span}" id="card-${c.id}" data-chart="${c.id}">
    <header class="card-head">
      <div class="card-titles"><h3>${c.title}</h3><p>${c.sub}</p></div>
      <div class="card-actions">
        ${infoBtn("chart:" + c.id, c.title)}
        <button type="button" class="card-btn js-table" aria-pressed="false" title="Ver como tabla" aria-label="Ver ${esc(c.title)} como tabla"><i class="fas fa-table-list"></i></button>
        <button type="button" class="card-btn js-expand" title="Ampliar" aria-label="Ampliar ${esc(c.title)}"><i class="fas fa-up-right-and-down-left-from-center"></i></button>
        <button type="button" class="card-btn js-png" title="Descargar imagen PNG" aria-label="Descargar ${esc(c.title)} como imagen"><i class="fas fa-download"></i></button>
      </div>
    </header>
    <div class="card-body">
      <div class="plot plot-${c.size}">
        <canvas id="${c.id}" role="img" aria-label="${esc(c.title)}"></canvas>
        <div class="sk sk-plot" aria-hidden="true"></div>
      </div>
      ${c.size === "donut" ? `<ul class="donut-legend" data-legend="${c.id}"></ul>` : ""}
      <div class="table-view" data-tableview="${c.id}" hidden></div>
      <div class="empty-card" hidden>
        <i class="fas fa-filter-circle-xmark"></i>
        <p>No hay datos para esta combinación de filtros.</p>
        <button type="button" class="btn-chip js-clear">Limpiar filtros</button>
      </div>
    </div>
  </article>`;
}
function extraCard(x) {
  return `
  <article class="card extra-card span-${x.span}" id="card-${x.id}" data-extra="${x.id}">
    <header class="card-head">
      <div class="card-titles"><h3>${x.title}</h3><p>${x.sub}</p></div>
      <div class="card-actions">${infoBtn("extra:" + x.id, x.title)}</div>
    </header>
    <div class="card-body" id="${x.id}"><div class="sk sk-block"></div></div>
  </article>`;
}

/* =========================== MONTAJE DE GRÁFICOS =========================== */
function wire(spec, out, config) {
  config.options = config.options || {};
  config.options.onHover = (evt, els, chart) => {
    const e = els[0];
    const f = e ? { i: e.index, ds: e.datasetIndex } : null;
    const p = chart.$focus;
    if (spec.focus && ((p && p.i) !== (f && f.i) || (p && p.ds) !== (f && f.ds))) { chart.$focus = f; chart.update("none"); }
    chart.canvas.style.cursor = e && out.drill ? "pointer" : "default";
  };
  config.options.onClick = (evt, els) => {
    const e = els[0];
    if (!e || !out.drill) return;
    const cond = out.drill(e);
    if (cond) abrirDrill(cond.filter(Boolean));
  };
  return config;
}

function mountChart(spec, { force = false } = {}) {
  const canvas = $(spec.id);
  if (!canvas) return;
  const card = $("card-" + spec.id);
  const out = spec.build(state.d, state.tk);
  outs[spec.id] = out;
  card.classList.toggle("is-empty", !!out.empty);
  card.querySelector(".empty-card").hidden = !out.empty;

  // Vista de tabla de este gráfico
  renderTabla(card.querySelector(`[data-tableview="${spec.id}"]`), "tv-" + spec.id, out.table);
  // Leyenda HTML (anillo)
  const leg = card.querySelector(`[data-legend="${spec.id}"]`);
  if (leg) renderDonutLegend(leg, spec, out);

  if (out.empty) { if (charts[spec.id]) { charts[spec.id].destroy(); delete charts[spec.id]; } return; }

  const config = wire(spec, out, out.config);
  const prev = charts[spec.id];
  // Actualización suave: se mantienen los elementos y Chart.js anima la transición
  if (prev && !force && prev.config.type === config.type && prev.data.datasets.length === config.data.datasets.length) {
    prev.data.labels = config.data.labels;
    config.data.datasets.forEach((ds, i) => {
      const target = prev.data.datasets[i];
      Object.assign(target, ds);
    });
    prev.options = config.options;
    prev.$focus = null;
    prev.update();
    return;
  }
  if (prev) prev.destroy();
  charts[spec.id] = new Chart(canvas, config);
}

function renderDonutLegend(ul, spec, out) {
  if (!out.legend || out.empty) { ul.innerHTML = ""; return; }
  ul.innerHTML = out.legend.map((l) => `
    <li><button type="button" class="dl-item" data-chart="${spec.id}" data-index="${l.index}">
      <span class="dl-dot" style="background:${l.color}"></span>
      <span class="dl-label">${esc(l.label)}</span>
      <span class="dl-val">${l.value}</span>
      <span class="dl-pct">${fmt(l.pct, 1)} %</span>
    </button></li>`).join("");
}

/* =========================== TABLAS (ordenables) =========================== */
function renderTabla(container, id, def) {
  if (!container) return;
  if (!def || !def.rows || !def.rows.length) { container.innerHTML = `<p class="table-empty">Sin filas para mostrar.</p>`; return; }
  tables[id] = { def, container };
  const s = state.sort[id];
  const idx = def.rows.map((_, i) => i);
  if (s) {
    const val = (c) => (c && typeof c === "object" && "v" in c ? c.v : c);
    idx.sort((a, b) => {
      const x = val(def.rows[a][s.col]), y = val(def.rows[b][s.col]);
      const r = typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y), "es", { numeric: true });
      return s.dir === "asc" ? r : -r;
    });
  }
  const barCols = def.head.map((h, i) => (h.bar ? i : -1)).filter((i) => i >= 0);
  const maxes = {};
  barCols.forEach((c) => { maxes[c] = Math.max(1e-9, ...def.rows.map((r) => Math.abs(Number(r[c]?.v ?? r[c]) || 0))); });

  container.innerHTML = `<div class="tbl-wrap"><table class="tbl">
    <thead><tr>${def.head.map((h, i) => {
      const act = s && s.col === i;
      const dir = act ? (s.dir === "asc" ? "ascending" : "descending") : "none";
      return `<th class="${h.num ? "num" : ""}" aria-sort="${dir}"><button type="button" class="th-sort" data-table="${id}" data-col="${i}">${h.t}<i class="fas ${act ? (s.dir === "asc" ? "fa-arrow-up-short-wide" : "fa-arrow-down-wide-short") : "fa-sort"}"></i></button></th>`;
    }).join("")}</tr></thead>
    <tbody>${idx.map((ri) => {
      const row = def.rows[ri];
      const cond = def.conds && def.conds[ri];
      return `<tr ${cond ? `class="is-clickable" tabindex="0" data-table="${id}" data-row="${ri}"` : ""}>${row.map((c, ci) => {
        const f = c && typeof c === "object" && "f" in c ? c.f : c;
        const bar = barCols.includes(ci) ? `<span class="cell-bar" style="--w:${Math.max(2, (Math.abs(Number(c.v) || 0) / maxes[ci]) * 100)}%"></span>` : "";
        return `<td class="${def.head[ci].num ? "num" : ""} ${ci === 0 ? "name" : ""}">${bar}<span>${esc(f)}</span></td>`;
      }).join("")}</tr>`;
    }).join("")}</tbody></table></div>`;
}


/* =========================== HALLAZGOS =========================== */
function renderHallazgos(d, el) {
  const L = [];
  const P = d.periodos;
  if (P.length > 1) {
    const b = maxBy(P, "toneladas");
    L.push({ icon: "fa-trophy", tone: "brand", html: `<b>${esc(b.label)}</b> fue el mes con más roca volada: <b>${fmtT(b.toneladas)}</b>.`, cond: [{ dim: "periodo", value: b.key, label: b.label }] });
  }
  const conMeta = P.filter((p) => p.meta > 0);
  if (conMeta.length) {
    const bajo = conMeta.filter((p) => p.cumplimiento < 100);
    if (bajo.length) {
      const peor = minBy(bajo, "cumplimiento");
      L.push({ icon: "fa-triangle-exclamation", tone: "warn", html: `<b>${bajo.length} de ${conMeta.length}</b> meses no cumplieron el plan de toneladas. El más bajo: <b>${esc(peor.label)}</b> (${fmtPct(peor.cumplimiento)}).`, cond: [{ dim: "periodo", value: peor.key, label: peor.label }] });
    } else {
      L.push({ icon: "fa-circle-check", tone: "good", html: `Todos los meses en vista <b>cumplieron o superaron</b> el plan de toneladas.` });
    }
  }
  if (d.k.incidentes === 0 && d.k.voladuras) {
    L.push({ icon: "fa-shield-halved", tone: "good", html: `<b>Cero incidentes</b> de seguridad en las ${fmt(d.k.voladuras)} voladuras en vista.` });
  } else if (P.length) {
    const w = maxBy(P, "incidentes");
    L.push({ icon: "fa-helmet-safety", tone: "warn", html: `Se registraron <b>${fmt(d.k.incidentes)} incidentes</b> de seguridad; el mes con más fue <b>${esc(w.label)}</b> (${fmt(w.incidentes)}).`, cond: [{ dim: "periodo", value: w.key, label: w.label }] });
  }
  const conTal = P.filter((p) => p.taladros > 0);
  if (conTal.length > 1) {
    const w = maxBy(conTal, "tasaFallados");
    if (w.fallados > 0) L.push({ icon: "fa-bomb", tone: "warn", html: `La mayor tasa de tiros fallados fue en <b>${esc(w.label)}</b>: <b>${fmtPct(w.tasaFallados, 2)}</b> (${fmt(w.fallados)} taladros sin detonar).`, cond: [{ dim: "periodo", value: w.key, label: w.label }] });
  }
  const uni = d.unidad.filter((u) => u.toneladas > 0 && u.costoTotal > 0);
  if (uni.length > 1) {
    const u = minBy(uni, "costoTon");
    L.push({ icon: "fa-coins", tone: "brand", html: `<b>${esc(u.label)}</b> rompe la roca más barata: <b>${fmtUSDt(u.costoTon)}</b> (promedio ${fmtUSDt(d.k.costoTon)}).`, cond: [{ dim: "unidad", value: u.label }] });
  }
  if (d.unidad.length > 1 && d.k.toneladas) {
    const u = d.unidad[0];
    L.push({ icon: "fa-mountain-sun", tone: "brand", html: `<b>${esc(u.label)}</b> aporta el <b>${fmtPct((u.toneladas / d.k.toneladas) * 100)}</b> de las toneladas voladas.`, cond: [{ dim: "unidad", value: u.label }] });
  }
  const con = d.contratista.filter((c) => c.label !== "(Sin dato)" && c.metros > 0);
  if (con.length > 1) {
    const c = maxBy(con, "rendimiento");
    L.push({ icon: "fa-helmet-safety", tone: "brand", html: `<b>${esc(c.label)}</b> tiene el mejor rendimiento de perforación: <b>${fmt(c.rendimiento, 1)} t/m</b>.`, cond: [{ dim: "contratista", value: c.label }] });
  }
  const shown = L.slice(0, 6);
  el._conds = shown.map((x) => x.cond || null);
  el.innerHTML = shown.length
    ? `<ul class="insights">${shown.map((x, i) => `
        <li class="insight tone-${x.tone}">
          ${x.cond ? `<button type="button" class="insight-btn" data-insight="${i}">` : `<div class="insight-btn is-static">`}
            <span class="insight-ico"><i class="fas ${x.icon}"></i></span>
            <span class="insight-text">${x.html}</span>
            ${x.cond ? `<i class="fas fa-chevron-right insight-go" aria-hidden="true"></i></button>` : `</div>`}
        </li>`).join("")}</ul>`
    : `<p class="table-empty">No hay suficientes datos en vista para generar hallazgos.</p>`;
}


/* =========================== KPIs: render =========================== */
function sparkSVG(values, hi, color) {
  const v = values.filter((x) => isFinite(x));
  if (v.length < 2) return "";
  const W = 80, H = 30, pad = 3;
  const min = Math.min(...v), max = Math.max(...v), rng = max - min || 1;
  const pts = values.map((x, i) => [pad + (i / (values.length - 1)) * (W - pad * 2), H - pad - ((x - min) / rng) * (H - pad * 2)]);
  const dPath = pts.map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ");
  const area = `${dPath} L${pts[pts.length - 1][0].toFixed(1)},${H} L${pts[0][0].toFixed(1)},${H} Z`;
  const h = pts[Math.max(0, Math.min(pts.length - 1, hi))];
  return `<svg class="spark" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" aria-hidden="true">
    <path d="${area}" fill="${color}" opacity=".12"></path>
    <path d="${dPath}" fill="none" stroke="${color}" stroke-width="1.75" stroke-linejoin="round" stroke-linecap="round"></path>
    <circle cx="${h[0].toFixed(1)}" cy="${h[1].toFixed(1)}" r="3" fill="${color}" stroke="var(--surface)" stroke-width="1.5"></circle>
  </svg>`;
}

function animateNumber(el, to, f) {
  const from = typeof el._val === "number" ? el._val : 0;
  el._val = to;
  if (REDUCED || from === to) { el.textContent = f(to); return; }
  cancelAnimationFrame(el._raf);
  const t0 = performance.now(), dur = 750;
  const step = (now) => {
    const p = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - p, 3);
    el.textContent = f(from + (to - from) * e);
    if (p < 1) el._raf = requestAnimationFrame(step);
  };
  el._raf = requestAnimationFrame(step);
}

function renderKPIs() {
  const d = state.d, T = d.tendencia;
  // Mes "actual" de la comparación: el mes filtrado o el último disponible
  let cur = T.length - 1;
  if (state.filtros.mes) { for (let i = T.length - 1; i >= 0; i--) if (T[i].mes === state.filtros.mes) { cur = i; break; } }
  const prev = cur - 1;

  KPIS.forEach((k) => {
    const card = document.querySelector(`.kpi[data-kpi="${k.id}"]`);
    const valor = d.k[k.id];
    const num = card.querySelector(".kpi-num");
    if (num.querySelector(".sk")) num.textContent = "";
    animateNumber(num, valor, k.f);
    card.querySelector(".kpi-val").title = k.id === "toneladas" ? fmtT(valor) : "";

    // Barra (cumplimiento / CSAT) + estado
    const mid = card.querySelector(".kpi-mid");
    let midHTML = "";
    if (k.bar) {
      const pct = Math.max(0, Math.min(100, (valor / k.bar) * 100));
      midHTML += `<div class="kpi-bar" role="presentation"><i style="width:${pct}%"></i></div>`;
    }
    const st = k.status ? k.status(valor, d.k) : null;
    if (st) midHTML += `<span class="status status-${st[0]}"><i class="fas ${st[1]}"></i>${st[2]}</span>`;
    mid.innerHTML = midHTML;

    // Tendencia vs. mes anterior
    const foot = card.querySelector(".kpi-foot");
    const serie = T.map((p) => p[k.id]);
    let deltaHTML = `<span class="delta flat"><i class="fas fa-minus"></i>Sin mes anterior</span>`;
    if (cur >= 0 && prev >= 0 && T[prev]) {
      const a = T[cur][k.id], b = T[prev][k.id];
      let diff, txt;
      if (k.delta === "pct") { diff = b ? ((a - b) / Math.abs(b)) * 100 : 0; txt = `${diff >= 0 ? "+" : "−"}${fmt(Math.abs(diff), 1)} %`; }
      else if (k.delta === "pp") { diff = a - b; txt = `${diff >= 0 ? "+" : "−"}${fmt(Math.abs(diff), k.dec ?? 1)} pp`; }
      else { diff = a - b; txt = `${diff >= 0 ? "+" : "−"}${fmt(Math.abs(diff), k.dec ?? 1)}`; }
      const eps = Math.pow(10, -((k.dec ?? 1) + 1));
      const up = diff > eps, down = diff < -eps;
      const good = (k.better === "up" && up) || (k.better === "down" && down);
      const cls = !up && !down || k.better === "neutral" ? "flat" : good ? "good" : "bad";
      const ico = up ? "fa-arrow-trend-up" : down ? "fa-arrow-trend-down" : "fa-minus";
      deltaHTML = `<span class="delta ${cls}" title="${esc(T[cur].label)} comparado con ${esc(T[prev].label)}"><i class="fas ${ico}"></i>${txt}</span><span class="delta-ref">${esc(T[cur].short)} vs. ${esc(T[prev].short)}</span>`;
    }
    foot.innerHTML = `<div class="delta-wrap">${deltaHTML}</div>${sparkSVG(serie, cur, state.tk.series[k.slot] || state.tk.brand)}`;
  });
}

/* =========================== FILTROS Y CONTEXTO =========================== */
function renderFiltros() {
  const fb = $("filterbar");
  const activos = FILTER_KEYS.filter((k) => state.filtros[k]).length;
  fb.innerHTML = `
    <span class="fb-title"><i class="fas fa-sliders"></i><span>Segmentadores</span>${activos ? `<b class="fb-count">${activos}</b>` : ""}</span>
    <div class="fb-chips">
    ${FILTER_KEYS.map((k) => {
      const base = filtrar(state.filas, state.filtros, k);
      const counts = {};
      base.forEach((r) => { counts[r[k]] = (counts[r[k]] || 0) + 1; });
      const vals = state.dims[k] || [];
      const cur = state.filtros[k];
      return `<label class="fchip ${cur ? "is-active" : ""}">
        <i class="fas ${DIMS[k].icon}"></i>
        <span class="fchip-label">${DIMS[k].label}</span>
        <span class="fchip-value">${cur ? esc(cur) : "Todos"}</span>
        <select data-filtro="${k}" aria-label="Filtrar por ${DIMS[k].label}">
          <option value="">Todos</option>
          ${vals.map((v) => `<option value="${esc(v)}" ${v === cur ? "selected" : ""}>${esc(v)} (${counts[v] || 0})</option>`).join("")}
        </select>
        <i class="fas fa-chevron-down fchip-caret" aria-hidden="true"></i>
      </label>`;
    }).join("")}
    </div>
    <div class="fb-actions">
      <button type="button" class="btn-chip js-clear" ${activos ? "" : "disabled"}><i class="fas fa-filter-circle-xmark"></i>Limpiar</button>
      <button type="button" class="btn-chip js-csv" title="Descargar las filas en vista"><i class="fas fa-file-csv"></i>Exportar CSV</button>
    </div>`;
}

function renderContexto() {
  const s = SECCIONES[state.seccion];
  const activos = FILTER_KEYS.filter((k) => state.filtros[k]);
  const total = state.filas.length, enVista = state.vista.length;

  $("crumbs").innerHTML = `
    <span class="crumb-sec"><i class="fas ${s.icon}"></i>${s.titulo}</span>
    <i class="fas fa-chevron-right crumb-sep" aria-hidden="true"></i>
    <span class="crumb-filters">${activos.length ? activos.map((k) => `${DIMS[k].label}: <b>${esc(state.filtros[k])}</b>`).join('<span class="crumb-dot"></span>') : "Todos los datos"}</span>`;

  $("contextBar").innerHTML = `
    <div class="ctx-main">
      <span class="ctx-pill"><i class="fas ${s.icon}"></i>Estás en <b>${s.titulo}</b></span>
      <span class="ctx-count">Mostrando <b>${fmt(enVista)}</b> de ${fmt(total)} registros${total ? ` · ${fmtPct((enVista / total) * 100, 0)}` : ""}</span>
    </div>
    <div class="ctx-filters">
      ${activos.length
        ? activos.map((k) => `<button type="button" class="ctx-chip js-remove-filter" data-dim="${k}" title="Quitar este filtro"><i class="fas ${DIMS[k].icon}"></i>${DIMS[k].label}: <b>${esc(state.filtros[k])}</b><i class="fas fa-xmark ctx-x"></i></button>`).join("")
        : `<span class="ctx-none"><i class="fas fa-layer-group"></i>Sin filtros: ves todos los datos</span>`}
    </div>`;
  $("contextBar").classList.toggle("has-filters", activos.length > 0);
  $("contextBar").classList.toggle("is-empty-view", total > 0 && enVista === 0);
  document.title = `${s.titulo}${activos.length ? " · " + activos.map((k) => state.filtros[k]).join(" · ") : ""} | CORE`;
}

function setFiltro(k, v) {
  if (!FILTER_KEYS.includes(k)) return;
  state.filtros[k] = v || "";
  render();
}

/* =========================== RENDER =========================== */
function render({ force = false } = {}) {
  if (!state.payload) return;
  state.tk = tokens();
  calcular();
  renderFiltros();
  renderContexto();
  writeHash();
  renderSeccion(state.seccion, { force });
  // las demás secciones se recalculan al abrirlas
  SEC_KEYS.forEach((k) => { if (k !== state.seccion) $("sec-" + k).dataset.dirty = "1"; });
}

function renderSeccion(sec, { force = false } = {}) {
  SEC_KEYS.forEach((k) => {
    const el = $("sec-" + k);
    const on = k === sec;
    if (on && el.hidden) { el.classList.remove("enter"); void el.offsetWidth; el.classList.add("enter"); }
    el.hidden = !on;
  });
  document.querySelectorAll("#dashTabs .tab").forEach((t) => {
    const on = t.dataset.seccion === sec;
    t.classList.toggle("active", on);
    t.setAttribute("aria-selected", on ? "true" : "false");
  });
  if (!state.payload) return;
  $("sec-" + sec).dataset.dirty = "";
  if (sec === "resumen") renderKPIs();
  CHARTS.filter((c) => c.sec === sec).forEach((c) => mountChart(c, { force }));
  EXTRAS.filter((x) => x.sec === sec).forEach((x) => {
    const el = $(x.id);
    if (x.render) x.render(state.d, el);
    else renderTabla(el, x.id, x.table(state.d));
  });
}

function cambiarSeccion(sec) {
  if (!SECCIONES[sec]) sec = "resumen";
  const cambio = sec !== state.seccion;
  state.seccion = sec;
  cerrarPopover();
  renderContexto();
  writeHash();
  renderSeccion(sec, { force: cambio });
  if (cambio) window.scrollTo({ top: 0, behavior: REDUCED ? "auto" : "smooth" });
}

/* =========================== URL (sección + filtros) =========================== */
function readHash() {
  const raw = decodeURIComponent(location.hash.replace(/^#/, ""));
  const [sec, qs] = raw.split("?");
  if (SECCIONES[sec]) state.seccion = sec;
  const p = new URLSearchParams(qs || "");
  FILTER_KEYS.forEach((k) => { state.filtros[k] = p.get(k) || ""; });
}
function writeHash() {
  const p = new URLSearchParams();
  FILTER_KEYS.forEach((k) => { if (state.filtros[k]) p.set(k, state.filtros[k]); });
  const qs = p.toString();
  const url = new URL(location.href);
  url.searchParams.delete("t"); // el cache-buster ya cumplió su función
  url.hash = state.seccion + (qs ? "?" + qs : "");
  if (url.href !== location.href) history.replaceState(null, "", url.href);
}


/* =========================== DRILL-DOWN =========================== */
let drillReturnFocus = null;
function abrirDrill(conds) {
  if (!conds || !conds.length) return;
  const rows = state.vista.filter((r) => conds.every((c) => matchCond(r, c)));
  const k = agg(rows);
  const share = state.d.k.toneladas ? (k.toneladas / state.d.k.toneladas) * 100 : 0;
  const titulo = conds.map((c) => c.label || c.value).join(" · ");
  $("drawerKicker").textContent = conds.map((c) => DIM_LABEL[c.dim] || c.dim).join(" · ");
  $("drawerTitle").textContent = titulo;

  const mini = [
    ["Toneladas", fmtT(k.toneladas)], ["Cumplimiento", k.meta ? fmtPct(k.cumplimiento) : "—"],
    ["Explosivo", fmtKg(k.explosivoKg)], ["Factor de carga", k.toneladas ? fmtFC(k.factorCarga) : "—"],
    ["Costo total", fmtUSD(k.costoTotal)], ["Costo por tonelada", k.toneladas ? fmtUSDt(k.costoTon) : "—"],
    ["Rendimiento", k.metros ? fmt(k.rendimiento, 1) + " t/m" : "—"], ["Tiros fallados", `${fmt(k.fallados)} (${fmtPct(k.tasaFallados, 2)})`],
    ["Incidentes", fmt(k.incidentes)], ["Voladuras", fmt(k.voladuras)],
    ["P80 promedio", k.p80 ? fmt(k.p80, 1) + " cm" : "—"], ["PPV máximo", k.ppvMax ? fmt(k.ppvMax, 1) + " mm/s" : "—"],
  ];
  // Desglose por la primera dimensión que no esté fijada y tenga variedad
  const usados = new Set(conds.map((c) => c.dim));
  const opciones = [["periodo", "Mes"], ["unidad", "Unidad minera"], ["voladura", "Tipo de voladura"], ["explosivo", "Tipo de explosivo"], ["contratista", "Contratista"]];
  const [bdim, blabel] = opciones.find(([dm]) => !usados.has(dm) && new Set(rows.map((r) => (dm === "periodo" ? r._p : r[dm]))).size > 1) || [];
  let breakdown = null;
  if (bdim) {
    const list = bdim === "periodo" ? porPeriodo(rows) : porDim(rows, bdim);
    breakdown = {
      head: [{ t: blabel }, { t: "Toneladas", num: 1, bar: 1 }, { t: "kg/t", num: 1 }, { t: "Costo/t", num: 1 }],
      rows: list.map((x) => [bdim === "periodo" ? cell(x.key, () => x.label) : x.label, cell(x.toneladas, fmtTC), cell(x.factorCarga, (v) => fmt(v, 3)), cell(x.costoTon, (v) => "US$ " + fmt(v, 3))]),
    };
  }

  $("drawerBody").innerHTML = `
    <div class="drill-share">
      <div class="drill-share-top"><span>Peso en las toneladas en vista</span><b>${fmtPct(share)}</b></div>
      <div class="kpi-bar"><i style="width:${Math.min(100, share)}%"></i></div>
      <small>${fmt(rows.length)} registros · ${conds.length > 1 ? "combinación seleccionada" : "dentro de los filtros actuales"}</small>
    </div>
    <dl class="drill-grid">${mini.map(([a, b]) => `<div><dt>${a}</dt><dd>${b}</dd></div>`).join("")}</dl>
    ${breakdown ? `<h3 class="drill-sub">Desglose por ${blabel.toLowerCase()}</h3><div id="drillTable"></div>` : ""}`;
  if (breakdown) renderTabla($("drillTable"), "drill", breakdown);

  // Acción: convertir el detalle en filtro global
  const aplicables = conds.map((c) => {
    if (c.dim === "periodo") { const r = rows[0]; return r ? { dim: "mes", value: r.mes, label: r.mes } : null; }
    return FILTER_KEYS.includes(c.dim) && c.value !== "(Sin dato)" ? { dim: c.dim, value: c.value, label: c.value } : null;
  }).filter(Boolean);
  $("drawerFoot").innerHTML = aplicables.length
    ? `<button type="button" class="btn-primary" id="drillApply"><i class="fas fa-filter"></i>Filtrar el dashboard por ${esc(aplicables.map((a) => a.label).join(" + "))}</button>
       <button type="button" class="btn-ghost" id="drillCancel">Cerrar</button>`
    : `<p class="drill-note"><i class="fas fa-circle-info"></i>${esc(DIM_LABEL[conds[0].dim])} no es un segmentador: esta vista es solo de detalle.</p>
       <button type="button" class="btn-ghost" id="drillCancel">Cerrar</button>`;
  const ap = $("drillApply");
  if (ap) ap.addEventListener("click", () => {
    aplicables.forEach((a) => { state.filtros[a.dim] = a.value; });
    cerrarDrill(); render();
    toast(`Filtro aplicado: ${aplicables.map((a) => `${DIMS[a.dim].label} = ${a.value}`).join(", ")}`, "info");
  });
  $("drillCancel").addEventListener("click", cerrarDrill);

  drillReturnFocus = document.activeElement;
  $("scrim").hidden = false;
  requestAnimationFrame(() => { document.body.classList.add("drawer-open"); $("drawer").setAttribute("aria-hidden", "false"); });
  setTimeout(() => $("drawerClose").focus(), 60);
}
function cerrarDrill() {
  if (!document.body.classList.contains("drawer-open")) return;
  document.body.classList.remove("drawer-open");
  $("drawer").setAttribute("aria-hidden", "true");
  setTimeout(() => { $("scrim").hidden = true; }, 280);
  if (drillReturnFocus && drillReturnFocus.focus) drillReturnFocus.focus();
}

/* =========================== POPOVER DE AYUDA =========================== */
let popState = { btn: null, pinned: false, timer: null };
function mostrarPopover(btn, pinned = false) {
  const info = INFO[btn.dataset.info];
  if (!info) return;
  const pop = $("popover");
  pop.innerHTML = `
    <p class="pop-title">${esc(info.title)}</p>
    <div class="pop-block"><span class="pop-label"><i class="fas fa-eye"></i>Qué muestra</span><p>${esc(info.what)}</p></div>
    <div class="pop-block"><span class="pop-label"><i class="fas fa-calculator"></i>Cómo se calcula</span><p>${esc(info.how)}</p></div>
    ${info.tip ? `<p class="pop-tip"><i class="fas fa-hand-pointer"></i>${esc(info.tip)}</p>` : ""}`;
  if (popState.btn && popState.btn !== btn) popState.btn.setAttribute("aria-expanded", "false");
  popState.btn = btn; popState.pinned = pinned;
  btn.setAttribute("aria-expanded", "true");
  pop.hidden = false;
  pop.classList.toggle("is-pinned", pinned);
  // Posición: debajo y alineado a la derecha del botón, sin salirse de la pantalla
  const r = btn.getBoundingClientRect(), pw = pop.offsetWidth, ph = pop.offsetHeight, m = 10;
  let left = Math.min(window.innerWidth - pw - m, Math.max(m, r.right - pw + 8));
  let top = r.bottom + 8, above = false;
  if (top + ph > window.innerHeight - m) { top = r.top - ph - 8; above = true; }
  pop.style.left = left + "px"; pop.style.top = Math.max(m, top) + "px";
  pop.style.setProperty("--arrow-x", Math.min(pw - 14, Math.max(14, r.left + r.width / 2 - left)) + "px");
  pop.classList.toggle("above", above);
  pop.classList.remove("show"); void pop.offsetWidth; pop.classList.add("show");
}
function cerrarPopover() {
  const pop = $("popover");
  if (popState.btn) popState.btn.setAttribute("aria-expanded", "false");
  popState = { btn: null, pinned: false, timer: null };
  pop.classList.remove("show"); pop.hidden = true;
}

/* =========================== MODAL (ampliar) =========================== */
let modalChart = null, modalReturnFocus = null;
function abrirModal(id) {
  const spec = CHARTS.find((c) => c.id === id);
  if (!spec || !state.d) return;
  const out = spec.build(state.d, state.tk);
  if (out.empty) { toast("No hay datos para ampliar con estos filtros.", "info"); return; }
  $("modalTitle").textContent = spec.title;
  const ctx = FILTER_KEYS.filter((k) => state.filtros[k]).map((k) => `${DIMS[k].label}: ${state.filtros[k]}`).join(" · ");
  $("modalSub").textContent = `${spec.sub}${ctx ? " · " + ctx : ""}`;
  modalReturnFocus = document.activeElement;
  $("modal").hidden = false;
  document.body.classList.add("modal-open");
  if (modalChart) modalChart.destroy();
  const cfg = wire(spec, out, out.config);
  if (cfg.type === "doughnut") cfg.options.plugins.legend = merge(legendCfg(state.tk, true), { position: "right" });
  modalChart = new Chart($("modalCanvas"), cfg);
  setTimeout(() => $("modalClose").focus(), 30);
}
function cerrarModal() {
  if ($("modal").hidden) return;
  $("modal").hidden = true;
  document.body.classList.remove("modal-open");
  if (modalChart) { modalChart.destroy(); modalChart = null; }
  if (modalReturnFocus && modalReturnFocus.focus) modalReturnFocus.focus();
}

/* =========================== EXPORTAR =========================== */
function descargarPNG(id) {
  const ch = charts[id];
  const spec = CHARTS.find((c) => c.id === id);
  if (!ch) { toast("Este gráfico no tiene datos para exportar.", "info"); return; }
  const a = document.createElement("a");
  a.href = ch.toBase64Image("image/png", 1);
  a.download = `${slug(spec.title)}_${new Date().toISOString().slice(0, 10)}.png`;
  document.body.appendChild(a); a.click(); a.remove();
  toast(`Imagen descargada: ${spec.title}`, "ok", 2600);
}

function exportarCSV() {
  const cols = [["id", "ID_Voladura"], ["fecha", "Fecha"], ["mes", "Mes"], ["año", "Año"], ["unidad", "Unidad_Minera"], ["voladura", "Tipo_Voladura"],
    ["explosivo", "Tipo_Explosivo"], ["turno", "Turno"], ["contratista", "Contratista"], ["taladros", "Taladros_Perforados"], ["metros", "Metros_Perforados"],
    ["horas", "Horas_Perforacion"], ["toneladas", "Toneladas_Voladas"], ["meta", "Meta_Toneladas"], ["explosivoKg", "Explosivo_Kg"],
    ["detonadores", "Detonadores_Usados"], ["costoExp", "Costo_Explosivo_USD"], ["costoPerf", "Costo_Perforacion_USD"], ["costoAcc", "Costo_Accesorios_USD"],
    ["costoTotal", "Costo_Total_USD"], ["p80", "Fragmentacion_P80_cm"], ["ppv", "Vibracion_PPV_mm_s"], ["fallados", "Tiros_Fallados"], ["incidentes", "Incidentes_Seguridad"]];
  const q = (v) => { const s = v == null ? "" : String(v); return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const lines = [cols.map((c) => c[1]).join(","), ...state.vista.map((r) => cols.map(([k]) => q(r[k])).join(","))];
  const blob = new Blob(["﻿" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
  const suf = FILTER_KEYS.filter((k) => state.filtros[k]).map((k) => slug(state.filtros[k])).join("_");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `voladuras${suf ? "_" + suf : ""}_${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  toast(`CSV descargado: ${fmt(state.vista.length)} voladuras`, "ok", 2600);
}


/* =========================== TOASTS =========================== */
function toast(texto, tipo = "info", ms = 4200) {
  const t = document.createElement("div");
  t.className = `toast ${tipo}`;
  const ico = { ok: "fa-circle-check", error: "fa-circle-exclamation", info: "fa-circle-info", new: "fa-bolt" }[tipo] || "fa-circle-info";
  t.innerHTML = `<i class="fas ${ico}"></i><span>${esc(texto)}</span><button type="button" class="toast-x" aria-label="Cerrar aviso"><i class="fas fa-xmark"></i></button>`;
  const close = () => { t.classList.add("out"); setTimeout(() => t.remove(), 260); };
  t.querySelector(".toast-x").addEventListener("click", close);
  $("toasts").appendChild(t);
  setTimeout(close, ms);
}

/* =========================== DATOS: CARGA Y SINCRONIZACIÓN =========================== */
function firma(rowIndex, meta, payload) {
  if (meta && meta.uploadedAt) return `${rowIndex}|${meta.uploadedAt}`;
  const p = payload || {};
  return `${rowIndex}|legacy|${(p.filas || []).length}|${p.kpis ? Math.round(p.kpis.toneladas || 0) : "?"}`;
}

async function fetchUltimo() {
  const { data, error } = await sb.from(CONFIG.TABLE)
    .select("row_index, data")
    .eq("sheet_name", CONFIG.SHEET_NAME)
    .order("row_index", { ascending: false })
    .limit(1);
  if (error) throw error;
  return data && data[0] ? data[0] : null;
}

function setSync(modo, texto) {
  const s = $("syncStatus");
  s.dataset.mode = modo;
  $("syncText").textContent = texto;
}
function pintarSync() {
  if (!state.lastSync) return;
  if ($("syncStatus").dataset.mode === "error") return;
  setSync("live", `En vivo · ${relTime(state.lastSync)}`);
  $("stSync").textContent = relTime(state.lastSync);
  if (state.uploadedAt) $("stPublicado").textContent = relTime(state.uploadedAt);
}

/**
 * Carga completa desde Supabase.
 * motivo: "inicial" | "manual" | "nuevo" | "aviso" | "visible"
 */
function cargarDatos(motivo = "inicial") {
  if (state.loading) return state.loading;
  const inicial = !state.payload && motivo === "inicial";
  document.body.classList.add(inicial ? "is-loading" : "is-refreshing");
  document.querySelectorAll(".js-refresh").forEach((b) => { b.disabled = true; b.classList.add("is-loading"); });
  setSync("syncing", "Sincronizando…");

  state.loading = (async () => {
    try {
      let row = await fetchUltimo();
      // Si llegó un aviso de carga nueva, puede haber una fracción de segundo sin filas: reintento corto
      const debeEsperar = motivo === "aviso" || motivo === "nuevo" || !!state.payload;
      for (let i = 0; !row && debeEsperar && i < 3; i++) { await sleep(600 * (i + 1)); row = await fetchUltimo(); }

      const firmaPrev = state.signature;
      aplicarRow(row);
      state.lastSync = new Date();
      state.error = null;
      pintarSync();

      if (motivo === "manual") toast(firmaPrev && firmaPrev === state.signature ? "Ya tenés los datos más recientes." : "Datos actualizados desde Supabase.", "ok", 2800);
      else if ((motivo === "nuevo" || motivo === "aviso") && firmaPrev !== state.signature) toast("Llegó un registro de voladuras nuevo: el dashboard se actualizó.", "new", 5000);
    } catch (err) {
      console.error(err);
      state.error = err;
      setSync("error", "Sin conexión · reintentando");
      if (!state.payload) mostrarEstadoGlobal("error", err);
      else if (motivo === "manual") toast("No se pudo actualizar: " + (err.message || err), "error", 6000);
    } finally {
      document.body.classList.remove("is-loading", "is-refreshing");
      document.querySelectorAll(".js-refresh").forEach((b) => { b.disabled = false; b.classList.remove("is-loading"); });
      state.loading = null;
    }
  })();
  return state.loading;
}

function aplicarRow(row) {
  if (!row || !row.data || !Array.isArray(row.data.filas) || !row.data.filas.length) {
    state.payload = null; state.filas = []; state.signature = row ? firma(row.row_index, row.data && row.data.meta, row.data) : null;
    Object.keys(charts).forEach((id) => { charts[id].destroy(); delete charts[id]; });
    mostrarEstadoGlobal("vacio");
    return;
  }
  const payload = row.data;
  const meta = payload.meta || {};
  state.payload = payload;
  state.signature = firma(row.row_index, meta, payload);
  state.uploadedAt = meta.uploadedAt || null;
  state.filas = prepararFilas(payload.filas);
  state.dims = calcDims(state.filas);

  // Se conservan los filtros que siguen existiendo en los datos nuevos
  FILTER_KEYS.forEach((k) => { if (state.filtros[k] && !(state.dims[k] || []).includes(state.filtros[k])) state.filtros[k] = ""; });

  $("stArchivo").textContent = meta.archivo || "—";
  $("stArchivo").title = meta.archivo || "";
  $("stRegistros").textContent = fmt(state.filas.length);
  $("stPublicado").textContent = state.uploadedAt ? relTime(state.uploadedAt) : "Formato anterior";
  $("stPublicado").title = state.uploadedAt ? new Date(state.uploadedAt).toLocaleString("es-PE") : "";

  mostrarEstadoGlobal(null);
  render({ force: true });
}

function mostrarEstadoGlobal(tipo, err) {
  const g = $("globalState");
  document.body.classList.toggle("no-data", !!tipo);
  if (!tipo) { g.innerHTML = ""; return; }
  SEC_KEYS.forEach((k) => { $("sec-" + k).hidden = true; });
  $("filterbar").innerHTML = ""; $("contextBar").innerHTML = "";
  $("crumbs").innerHTML = `<span class="crumb-sec"><i class="fas fa-database"></i>Sin datos</span>`;
  g.innerHTML = tipo === "vacio"
    ? `<div class="global-empty">
         <span class="ge-ico"><i class="fas fa-file-excel"></i></span>
         <h2>Todavía no hay datos publicados</h2>
         <p>Cargá el Excel de voladuras en la pantalla de inicio. Apenas lo publiques, este dashboard se actualiza solo.</p>
         <a class="btn-primary js-go-home" href="${CONFIG.HOME_URL}"><i class="fas fa-file-arrow-up"></i>Cargar Excel</a>
       </div>`
    : `<div class="global-empty is-error">
         <span class="ge-ico"><i class="fas fa-plug-circle-xmark"></i></span>
         <h2>No se pudo conectar con Supabase</h2>
         <p>${esc((err && err.message) || "Revisá tu conexión a internet.")}</p>
         <button type="button" class="btn-primary js-refresh"><i class="fas fa-rotate"></i>Reintentar</button>
       </div>`;
}

/* Chequeo liviano: solo trae la versión, no el payload completo */
async function hayNovedades() {
  if (state.loading || document.visibilityState !== "visible") return;
  try {
    const { data, error } = await sb.from(CONFIG.TABLE)
      .select("row_index, meta:data->meta")
      .eq("sheet_name", CONFIG.SHEET_NAME)
      .order("row_index", { ascending: false }).limit(1);
    if (error) throw error;
    const row = data && data[0];
    state.lastSync = new Date();
    if (state.error) { state.error = null; setSync("live", "En vivo"); }
    if (!row) { if (state.payload) cargarDatos("nuevo"); else pintarSync(); return; }
    if (!row.meta || !row.meta.uploadedAt) { await cargarDatos("nuevo"); return; } // formato anterior: comparación completa
    const f = firma(row.row_index, row.meta);
    if (f !== state.signature) await cargarDatos("nuevo");
    else pintarSync();
  } catch (err) {
    console.warn("Chequeo de novedades falló:", err);
    setSync("error", "Sin conexión · reintentando");
  }
}
const hayNovedadesDebounced = debounce(hayNovedades, 400);

function iniciarSincronizacion() {
  // 1) Aviso inmediato desde la pestaña de carga (mismo navegador)
  try {
    const bc = new BroadcastChannel(CONFIG.BUS);
    bc.onmessage = (e) => { if (e.data && e.data.type === "data-updated") cargarDatos("aviso"); };
  } catch (_) {}
  window.addEventListener("storage", (e) => { if (e.key === CONFIG.LS_UPLOAD && e.newValue) cargarDatos("aviso"); });

  // 2) Supabase Realtime (si está habilitado para la tabla; si no, no molesta)
  try {
    sb.channel("core-dashboard-data")
      .on("postgres_changes", { event: "*", schema: "public", table: CONFIG.TABLE }, () => hayNovedadesDebounced())
      .subscribe();
  } catch (_) {}

  // 3) Al volver a la pestaña / ventana
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") hayNovedadesDebounced(); });
  window.addEventListener("focus", hayNovedadesDebounced);

  // 4) Restaurado desde el historial (botón Atrás): bfcache congela la página vieja
  window.addEventListener("pageshow", (e) => { if (e.persisted) cargarDatos("visible"); });

  // 5) Sondeo liviano mientras se mira el dashboard
  setInterval(hayNovedades, CONFIG.POLL_MS);
  setInterval(pintarSync, 15000);

  // 6) Navegador vuelve a tener red
  window.addEventListener("online", () => cargarDatos("visible"));
}

/* =========================== TEMA =========================== */
function setTheme(t, { rerender = true } = {}) {
  document.documentElement.setAttribute("data-theme", t);
  try { localStorage.setItem(CONFIG.LS_THEME, t); } catch (_) {}
  const b = $("btnTheme");
  b.innerHTML = `<i class="fas ${t === "dark" ? "fa-sun" : "fa-moon"}"></i>`;
  b.title = `Cambiar a tema ${t === "dark" ? "claro" : "oscuro"} (tecla T)`;
  if (rerender && state.payload) render({ force: true });
}
function toggleTheme() { setTheme(document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark"); }

/* =========================== EVENTOS =========================== */
function engancharEventos() {
  // Delegación de clics
  document.addEventListener("click", (e) => {
    const t = e.target;
    const tab = t.closest("#dashTabs .tab");
    if (tab) { e.preventDefault(); cambiarSeccion(tab.dataset.seccion); return; }

    const home = t.closest(".js-go-home");
    if (home) { e.preventDefault(); window.location.href = `${CONFIG.HOME_URL}?t=${Date.now()}`; return; }

    if (t.closest(".js-refresh")) { cargarDatos("manual"); return; }
    if (t.closest("#btnTheme")) { toggleTheme(); return; }

    const info = t.closest(".js-info");
    if (info) {
      e.stopPropagation();
      if (popState.btn === info && popState.pinned) cerrarPopover(); else mostrarPopover(info, true);
      return;
    }
    if (!t.closest("#popover") && popState.pinned) cerrarPopover();

    if (t.closest(".js-clear")) { FILTER_KEYS.forEach((k) => { state.filtros[k] = ""; }); render(); return; }
    if (t.closest(".js-csv")) { exportarCSV(); return; }
    const rm = t.closest(".js-remove-filter");
    if (rm) { setFiltro(rm.dataset.dim, ""); return; }

    const card = t.closest(".chart-card");
    if (card && t.closest(".js-table")) {
      const btn = t.closest(".js-table");
      const on = !card.classList.contains("show-table");
      card.classList.toggle("show-table", on);
      card.querySelector(".table-view").hidden = !on;
      btn.setAttribute("aria-pressed", on ? "true" : "false");
      btn.innerHTML = `<i class="fas ${on ? "fa-chart-simple" : "fa-table-list"}"></i>`;
      btn.title = on ? "Ver como gráfico" : "Ver como tabla";
      return;
    }
    if (card && t.closest(".js-expand")) { abrirModal(card.dataset.chart); return; }
    if (card && t.closest(".js-png")) { descargarPNG(card.dataset.chart); return; }

    const dl = t.closest(".dl-item");
    if (dl) {
      const out = outs[dl.dataset.chart];
      const cond = out && out.drill && out.drill({ index: +dl.dataset.index, datasetIndex: 0 });
      if (cond) abrirDrill(cond);
      return;
    }

    const th = t.closest(".th-sort");
    if (th) {
      const id = th.dataset.table, col = +th.dataset.col;
      const s = state.sort[id];
      state.sort[id] = s && s.col === col ? { col, dir: s.dir === "desc" ? "asc" : "desc" } : { col, dir: "desc" };
      const tb = tables[id];
      if (tb) renderTabla(tb.container, id, tb.def);
      return;
    }
    const tr = t.closest("tr.is-clickable");
    if (tr) { const tb = tables[tr.dataset.table]; const c = tb && tb.def.conds && tb.def.conds[+tr.dataset.row]; if (c) abrirDrill(c); return; }

    const ins = t.closest(".insight-btn[data-insight]");
    if (ins) { const host = ins.closest(".card-body"); const c = host && host._conds && host._conds[+ins.dataset.insight]; if (c) abrirDrill(c); return; }

    if (t.closest("#drawerClose") || t.closest("#scrim")) { cerrarDrill(); return; }
    if (t.closest("#modalClose") || t === $("modal")) { cerrarModal(); return; }
  });

  // Filtros
  document.addEventListener("change", (e) => {
    const sel = e.target.closest("select[data-filtro]");
    if (sel) setFiltro(sel.dataset.filtro, sel.value);
  });

  // Popover en hover/focus (los táctiles usan el clic)
  document.addEventListener("mouseover", (e) => {
    const b = e.target.closest(".js-info");
    if (!b || popState.pinned) return;
    clearTimeout(popState.timer);
    popState.timer = setTimeout(() => mostrarPopover(b, false), 140);
  });
  document.addEventListener("mouseout", (e) => {
    const b = e.target.closest(".js-info");
    if (!b || popState.pinned) return;
    clearTimeout(popState.timer);
    if (!e.relatedTarget || !e.relatedTarget.closest || !e.relatedTarget.closest(".js-info")) cerrarPopover();
  });
  document.addEventListener("focusin", (e) => { const b = e.target.closest && e.target.closest(".js-info"); if (b && !popState.pinned) mostrarPopover(b, false); });
  document.addEventListener("focusout", (e) => { const b = e.target.closest && e.target.closest(".js-info"); if (b && !popState.pinned) cerrarPopover(); });
  window.addEventListener("scroll", () => { if (popState.btn && !popState.pinned) cerrarPopover(); }, { passive: true });
  window.addEventListener("resize", debounce(() => { if (popState.btn) mostrarPopover(popState.btn, popState.pinned); }, 100));

  // Leyenda del anillo: resalta el segmento al pasar el mouse
  document.addEventListener("mouseover", (e) => {
    const dl = e.target.closest(".dl-item");
    if (!dl) return;
    const ch = charts[dl.dataset.chart];
    if (!ch) return;
    const i = +dl.dataset.index;
    ch.$focus = { i, ds: 0 };
    ch.setActiveElements([{ datasetIndex: 0, index: i }]);
    ch.tooltip.setActiveElements([{ datasetIndex: 0, index: i }], { x: 0, y: 0 });
    ch.update("none");
  });
  document.addEventListener("mouseout", (e) => {
    const dl = e.target.closest(".dl-item");
    if (!dl || (e.relatedTarget && dl.contains(e.relatedTarget))) return;
    const ch = charts[dl.dataset.chart];
    if (!ch) return;
    ch.$focus = null; ch.setActiveElements([]); ch.tooltip.setActiveElements([], { x: 0, y: 0 }); ch.update("none");
  });

  // Teclado
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") { cerrarPopover(); cerrarDrill(); cerrarModal(); return; }
    const tr = e.target.closest && e.target.closest("tr.is-clickable");
    if (tr && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); tr.click(); return; }
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (/^(INPUT|SELECT|TEXTAREA)$/.test(e.target.tagName) || e.target.isContentEditable) return;
    if (document.body.classList.contains("drawer-open") || document.body.classList.contains("modal-open")) return;
    if (e.key >= "1" && e.key <= String(SEC_KEYS.length)) { cambiarSeccion(SEC_KEYS[+e.key - 1]); }
    else if (e.key === "r" || e.key === "R") { cargarDatos("manual"); }
    else if (e.key === "t" || e.key === "T") { toggleTheme(); }
  });

  window.addEventListener("hashchange", () => {
    const prevSec = state.seccion, prevF = JSON.stringify(state.filtros);
    readHash();
    if (JSON.stringify(state.filtros) !== prevF) render();
    else if (state.seccion !== prevSec) { const s = state.seccion; state.seccion = prevSec; cambiarSeccion(s); }
  });

  // Si cambia el tema del sistema y el usuario no eligió uno
  try {
    matchMedia("(prefers-color-scheme: dark)").addEventListener("change", (ev) => {
      let saved = null; try { saved = localStorage.getItem(CONFIG.LS_THEME); } catch (_) {}
      if (!saved) setTheme(ev.matches ? "dark" : "light");
    });
  } catch (_) {}
}

/* =========================== INICIO =========================== */
(async function init() {
  setupChartDefaults();
  construirLayout();
  readHash();
  setTheme(document.documentElement.getAttribute("data-theme") || "light", { rerender: false });
  engancharEventos();
  renderSeccion(state.seccion);   // muestra los esqueletos de la sección pedida
  iniciarSincronizacion();
  await cargarDatos("inicial");
})();
