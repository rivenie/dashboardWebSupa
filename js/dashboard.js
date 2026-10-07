const SUPABASE_URL = "https://qkkwvacltcmpgmtrvpjf.supabase.co";
const SUPABASE_KEY = "sb_publishable_UZnT5Fj2Hp8qLOyrWf4Ilw_1QcW_O5U";
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

const C = {
  gold: "#22D3EE", goldLight: "#67E8F9", goldDark: "#0E7490",
  orange: "#F97316", amber: "#FBBF24",
  green: "#10B981", red: "#EF4444", blue: "#3B82F6",
  other: "#1E3A5F", text: "#E6F0FA", dim: "#88A7C5", faint: "#5A7896",
  grid: "rgba(136, 167, 197, 0.10)", panel: "#0A1525",
};
const PALETTE = [C.gold, C.amber, C.blue, C.orange, C.green, C.goldLight, C.red];

Chart.register(ChartDataLabels);
Chart.defaults.font.family = "'IBM Plex Sans', system-ui, sans-serif";
Chart.defaults.font.size = 11;
Chart.defaults.color = C.dim;
Chart.defaults.animation.duration = 450;
Chart.defaults.plugins.datalabels.display = false;
Chart.defaults.plugins.legend.display = false;

const state = { sellin: null };
const charts = {};
let listenersReady = false;
let subActualS = "resumen";

const fmt = (v, d = 0) =>
  Number(v).toLocaleString("es-PE", { maximumFractionDigits: d, minimumFractionDigits: 0 });
const round = (v, d = 1) => Number(Number(v).toFixed(d));
const truncar = (s, n = 30) => (s.length > n ? s.slice(0, n - 1) + "…" : s);
const $ = (id) => document.getElementById(id);
function hexRgba(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}

async function cargarHoja(nombre) {
  const { data, error } = await supabaseClient
    .from("dashboard_data").select("row_index, data")
    .eq("sheet_name", nombre).order("row_index", { ascending: true }).limit(1);
  if (error) throw error;
  if (!data || data.length === 0) return null;
  return data[0].data;
}

const centerText = {
  id: "centerText",
  afterDraw(chart, _args, opts) {
    if (!opts || !opts.title) return;
    const { ctx, chartArea: a } = chart;
    const x = (a.left + a.right) / 2, y = (a.top + a.bottom) / 2;
    ctx.save();
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillStyle = C.text; ctx.font = "700 20px Sora, sans-serif";
    ctx.fillText(opts.title, x, y - 8);
    ctx.fillStyle = C.dim; ctx.font = "500 11px 'IBM Plex Sans', sans-serif";
    ctx.fillText(opts.sub || "", x, y + 16);
    ctx.restore();
  },
};

function tooltipStyle() {
  return {
    backgroundColor: "#0A0806", titleColor: C.text, bodyColor: C.text,
    borderColor: "#4A3F1F", borderWidth: 1, padding: 10, cornerRadius: 8, boxPadding: 4,
    callbacks: {
      label: (c) => {
        const v = typeof c.parsed === "number" ? c.parsed : c.chart.options.indexAxis === "y" ? c.parsed.x : c.parsed.y;
        return ` ${c.dataset.label ? c.dataset.label + ": " : c.label ? c.label + ": " : ""}${fmt(v, 2)}`;
      },
    },
  };
}
function mount(id, config) {
  const canvas = $(id); if (!canvas) return;
  if (charts[id]) { charts[id].destroy(); delete charts[id]; }
  const vacio = !config.data.labels || config.data.labels.length === 0;
  canvas.parentElement.classList.toggle("is-empty", vacio);
  if (vacio) return;
  charts[id] = new Chart(canvas, config);
}
function gradV(c1, c2) {
  return (ctx) => {
    const a = ctx.chart.chartArea; if (!a) return c1;
    const g = ctx.chart.ctx.createLinearGradient(0, a.top, 0, a.bottom);
    g.addColorStop(0, c1); g.addColorStop(1, c2); return g;
  };
}
function gradH(c1, c2) {
  return (ctx) => {
    const a = ctx.chart.chartArea; if (!a) return c1;
    const g = ctx.chart.ctx.createLinearGradient(a.left, 0, a.right, 0);
    g.addColorStop(0, c1); g.addColorStop(1, c2); return g;
  };
}
const scaleX = () => ({
  grid: { display: false }, border: { color: "#4A3F1F" },
  ticks: { color: C.dim, maxRotation: 0, autoSkipPadding: 14 },
});
const scaleY = (max) => ({
  beginAtZero: true, suggestedMax: max, grid: { color: C.grid }, border: { display: false },
  ticks: { color: C.faint, callback: (v) => fmt(v), maxTicksLimit: 6 },
});
const labelBase = {
  color: C.text, font: { family: "'IBM Plex Sans', sans-serif", weight: "600", size: 10.5 },
};

function renderColumns(id, labels, data, color1 = C.goldLight, color2 = C.goldDark, decimals = 0) {
  const max = Math.max(...data, 0);
  mount(id, {
    type: "bar",
    data: { labels, datasets: [{ data, borderRadius: { topLeft: 7, topRight: 7 }, borderSkipped: false, maxBarThickness: 54, backgroundColor: gradV(color1, color2) }] },
    options: {
      responsive: true, maintainAspectRatio: false, layout: { padding: { top: 14 } },
      plugins: {
        tooltip: tooltipStyle(),
        datalabels: { ...labelBase, display: labels.length <= 14, anchor: "end", align: "end", offset: 3, formatter: (v) => fmt(v, decimals) },
      },
      scales: { x: scaleX(), y: scaleY(max * 1.22) },
    },
  });
}
function renderHBar(id, labels, data, color1 = C.goldDark, color2 = C.goldLight, decimals = 0) {
  const max = Math.max(...data, 0);
  mount(id, {
    type: "bar",
    data: { labels, datasets: [{ data, borderRadius: 6, borderSkipped: false, barThickness: 18, backgroundColor: gradH(color1, color2) }] },
    options: {
      indexAxis: "y", responsive: true, maintainAspectRatio: false, layout: { padding: { right: 12 } },
      plugins: {
        tooltip: tooltipStyle(),
        datalabels: { ...labelBase, display: true, anchor: "end", align: "right", offset: 4, formatter: (v) => fmt(v, decimals) },
      },
      scales: {
        x: { ...scaleY(max * 1.18), ticks: { color: C.faint, callback: (v) => fmt(v), maxTicksLimit: 5 } },
        y: { grid: { display: false }, border: { display: false }, ticks: { color: C.text, callback(v) { return truncar(this.getLabelForValue(v), 28); } } },
      },
    },
  });
}
function renderScrollHBar(id, labels, data, color1 = C.goldDark, color2 = C.goldLight, decimals = 0) {
  const ctx = $(id); if (!ctx) return;
  if (charts[id]) charts[id].destroy();
  const wrap = ctx.parentElement;
  wrap.style.maxHeight = "420px";
  wrap.style.overflowY = "auto";
  wrap.style.overflowX = "hidden";
  ctx.style.height = Math.max(420, labels.length * 32) + "px";
  ctx.style.maxHeight = "none";
  const max = Math.max(...data, 0);
  charts[id] = new Chart(ctx, {
    type: "bar",
    data: { labels, datasets: [{ data, borderRadius: 6, borderSkipped: false, barThickness: 16, backgroundColor: gradH(color1, color2) }] },
    options: {
      indexAxis: "y", responsive: true, maintainAspectRatio: false, layout: { padding: { right: 12 } },
      plugins: {
        tooltip: tooltipStyle(),
        datalabels: { ...labelBase, display: true, anchor: "end", align: "right", offset: 4, formatter: (v) => fmt(v, decimals) },
      },
      scales: {
        x: { ...scaleY(max * 1.18), ticks: { color: C.faint, callback: (v) => fmt(v), maxTicksLimit: 5 } },
        y: { grid: { display: false }, border: { display: false }, ticks: { color: C.text, callback(v) { return truncar(this.getLabelForValue(v), 30); } } },
      },
    },
  });
}
function renderDoughnut(id, labels, data, centerTitle, centerSub, decimals = 0) {
  const total = data.reduce((a, b) => a + Number(b), 0);
  const colores = labels.map((l, i) => (l === "Otros" ? C.other : PALETTE[i % PALETTE.length]));
  mount(id, {
    type: "doughnut",
    data: { labels, datasets: [{ data, backgroundColor: colores, borderColor: "#141008", borderWidth: 3, hoverOffset: 5 }] },
    options: {
      responsive: true, maintainAspectRatio: false, cutout: "68%",
      plugins: {
        tooltip: { ...tooltipStyle(), callbacks: { label: (c) => ` ${c.label}: ${fmt(c.parsed, decimals)} (${total ? Math.round((c.parsed / total) * 100) : 0}%)` } },
        datalabels: {
          ...labelBase, display: (c) => total > 0 && c.dataset.data[c.dataIndex] / total >= 0.06,
          color: "#1A1408", font: { family: "'IBM Plex Sans', sans-serif", weight: "700", size: 11 },
          formatter: (v) => Math.round((v / total) * 100) + "%",
        },
        centerText: { title: centerTitle, sub: centerSub },
      },
    },
    plugins: [centerText],
  });
  const lg = $(id + "Legend");
  if (lg) lg.innerHTML = labels.map((l, i) =>
    `<div class="legend-item"><i style="background:${colores[i]}"></i><span title="${l}">${truncar(l, 22)}</span><b>${total ? Math.round((data[i] / total) * 100) : 0}%</b></div>`
  ).join("");
}

function heroCard({ title, value, unit, badge, note }) {
  return `<article class="card hero span-3">
    <span class="eyebrow">Indicador principal</span>
    <h3>${title}</h3>
    <div class="hero-val">${value}<small>${unit}</small></div>
    <p class="hero-note">${note}</p>
    <span class="pill pill-orange">${badge}</span>
  </article>`;
}
function kpiCard({ icon, tone, title, value, unit, pct, barLabel, foot }) {
  return `<article class="card kpi tone-${tone} span-3">
    <div class="kpi-head"><span class="kpi-ico"><i class="fas ${icon}"></i></span><h3>${title}</h3></div>
    <div class="kpi-val">${value}<small>${unit}</small></div>
    <div class="bar"><i style="width:${Math.min(100, Math.max(0, pct))}%"></i></div>
    <div class="kpi-foot"><span>${barLabel}</span><b>${fmt(pct, 1)}%</b></div>
    <p class="kpi-note">${foot}</p>
  </article>`;
}
function plotCard(id, titulo, sub, span, size = "") {
  return `<article class="card span-${span}">
    <div class="card-head"><h3>${titulo}</h3><p>${sub}</p></div>
    <div class="plot ${size}"><canvas id="${id}"></canvas>
      <div class="plot-empty"><i class="fas fa-chart-simple"></i><span>Sin datos para mostrar</span></div></div>
  </article>`;
}
function donutCard(id, titulo, sub, span) {
  return `<article class="card span-${span}">
    <div class="card-head"><h3>${titulo}</h3><p>${sub}</p></div>
    <div class="plot donut"><canvas id="${id}"></canvas>
      <div class="plot-empty"><i class="fas fa-chart-pie"></i><span>Sin datos para mostrar</span></div></div>
    <div class="legend" id="${id}Legend"></div>
  </article>`;
}
function slotCard(id, titulo, sub, span) {
  return `<article class="card span-${span}">
    <div class="card-head"><h3>${titulo}</h3><p>${sub}</p></div>
    <div id="${id}" class="mini-table"></div>
  </article>`;
}
function tabla(encabezados, filas) {
  return `<div class="tbl-wrap"><table class="tbl"><thead><tr>${encabezados
    .map((h) => `<th class="${h.num ? "num" : ""}">${h.t}</th>`).join("")}</tr></thead><tbody>${
    filas.map((f) => `<tr>${f.map((c, i) => `<td class="${encabezados[i].num ? "num" : ""} ${i === 0 ? "name" : ""}">${c}</td>`).join("")}</tr>`).join("")
  }</tbody></table></div>`;
}
function vacioMensaje(span = 12) {
  return `<article class="card span-${span}"><div class="plot-empty" style="display:flex;position:static;min-height:200px"><i class="fas fa-database"></i><span>No se encontraron datos.</span></div></article>`;
}

function construirLayoutInterno() {
  $("filtersSellRes").innerHTML = `
    <div class="filter-chip"><i class="fas fa-tags"></i>
      <select id="fSellGrupo" class="filter-select"><option value="">Grupo</option></select></div>
    <div class="filter-chip"><i class="fas fa-box"></i>
      <select id="fSellSubcat" class="filter-select"><option value="">Subcategoría</option></select></div>
    <div class="filter-chip"><i class="fas fa-bullhorn"></i>
      <select id="fSellCanal" class="filter-select"><option value="">Canal</option></select></div>
    <div class="filter-chip"><i class="fas fa-map"></i>
      <select id="fSellRegion" class="filter-select"><option value="">Región</option></select></div>
    <button id="clearSellRes" class="btn-clear-chips"><i class="fas fa-eraser"></i> Limpiar</button>`;

  $("gridSellRes").innerHTML = [
    plotCard("ssMes", "Venta Neta por mes", "Evolución mensual", 6, "tall"),
    donutCard("ssGrupo", "Venta Neta por grupo", "DOFFI · MOSSE · Otros", 6),
    plotCard("ssSubcat", "Cantidad por subcategoría", "140GR · 15KG · 4KG · FMCG", 6, "tall"),
    donutCard("ssCanal", "Venta Neta por canal", "Distribución por canal", 6),
    plotCard("ssRegion", "Venta Neta por región", "Top regiones", 6, "tall"),
    plotCard("ssEncargado", "Venta Neta por encargado", "Top encargados", 6, "tall"),
  ].join("");

  $("gridSellDet").innerHTML = [
    slotCard("sdClientes", "Detalle por cliente", "Cliente · Venta Neta · Cantidad · Facturas", 6),
    slotCard("sdProductos", "Detalle por producto", "Producto · Código · Cantidad · Venta Neta", 6),
  ].join("");
}

function llenarSelect(id, valores, etiqueta) {
  const sel = $(id); if (!sel) return;
  const actual = sel.value;
  sel.innerHTML = `<option value="">${etiqueta}</option>`;
  valores.forEach((v) => { const o = document.createElement("option"); o.value = v; o.textContent = v; sel.appendChild(o); });
  if (actual && valores.includes(actual)) sel.value = actual;
}
function llenarSegmentadores() {
  if (!state.sellin) return;
  const grupos = [...new Set(state.sellin.porGrupo.map(g => g.nombre))].sort();
  llenarSelect("fSellGrupo", grupos, "Grupo");
  const subcats = [...new Set(state.sellin.porSubcat.map(s => s.nombre))].sort();
  llenarSelect("fSellSubcat", subcats, "Subcategoría");
  const canales = [...new Set(state.sellin.porCanal.map(c => c.nombre))].sort();
  llenarSelect("fSellCanal", canales, "Canal");
  const regiones = [...new Set(state.sellin.porRegion.map(r => r.nombre))].sort();
  llenarSelect("fSellRegion", regiones, "Región");
}

function filtroActivo(id) { const el = $(id); return el ? el.value : ""; }

function renderSellinResumen() {
  if (!state.sellin) { $("gridSellRes").innerHTML = vacioMensaje(12); $("kpiSellRes").innerHTML = ""; return; }
  const d = state.sellin;
  const k = d.kpis;

  $("kpiSellRes").innerHTML = [
    heroCard({
      title: "Total Venta Neta", value: "S/ " + fmt(k.totalVenta, 2), unit: "",
      note: `${fmt(k.totalRegistros)} líneas · ${fmt(k.totalFacturas)} facturas`,
      badge: `Ticket prom: S/ ${fmt(k.ticketPromedio, 2)}`,
    }),
    kpiCard({ icon: "fa-cubes", tone: "gold", title: "Total Cantidad", value: fmt(k.totalCantidad), unit: "",
      pct: 100, barLabel: "Unidades",
      foot: `En el periodo` }),
    kpiCard({ icon: "fa-users", tone: "amber", title: "Clientes", value: fmt(k.totalClientes), unit: "",
      pct: 100, barLabel: "Distintos",
      foot: `Compradores` }),
    kpiCard({ icon: "fa-box", tone: "green", title: "Productos", value: fmt(k.totalProductos), unit: "",
      pct: 100, barLabel: "Distintos",
      foot: `En catálogo` }),
  ].join("");

  const ordenMeses = ["ENERO","FEBRERO","MARZO","ABRIL","MAYO","JUNIO","JULIO","AGOSTO","SEPTIEMBRE","OCTUBRE","NOVIEMBRE","DICIEMBRE"];
  const mesesArr = d.porMes.slice().sort((a, b) => ordenMeses.indexOf(a.mes.toUpperCase()) - ordenMeses.indexOf(b.mes.toUpperCase()));
  renderColumns("ssMes", mesesArr.map(m => m.mes), mesesArr.map(m => round(m.venta, 2)), C.goldLight, C.goldDark, 0);

  const grupoArr = d.porGrupo.slice(0, 6);
  const otrosG = d.porGrupo.slice(6).reduce((a, e) => a + e.venta, 0);
  const gd = grupoArr.map(g => round(g.venta, 2)); const gl = grupoArr.map(g => g.nombre);
  if (otrosG > 0) { gd.push(round(otrosG, 2)); gl.push("Otros"); }
  renderDoughnut("ssGrupo", gl, gd, "S/ " + fmt(k.totalVenta, 0), "venta neta");

  const subArr = d.porSubcat.slice(0, 10);
  renderScrollHBar("ssSubcat", subArr.map(s => truncar(s.nombre, 25)), subArr.map(s => round(s.cant, 0)), C.goldDark, C.goldLight, 0);

  const canalArr = d.porCanal.slice(0, 6);
  const otrosC = d.porCanal.slice(6).reduce((a, e) => a + e.venta, 0);
  const cdd = canalArr.map(c => round(c.venta, 2)); const cll = canalArr.map(c => c.nombre);
  if (otrosC > 0) { cdd.push(round(otrosC, 2)); cll.push("Otros"); }
  renderDoughnut("ssCanal", cll, cdd, "S/ " + fmt(k.totalVenta, 0), "venta neta");

  const regArr = d.porRegion.slice(0, 10);
  renderScrollHBar("ssRegion", regArr.map(r => truncar(r.nombre, 25)), regArr.map(r => round(r.venta, 2)), C.goldDark, C.goldLight, 2);

  const encArr = d.porEncargado.slice(0, 10);
  renderScrollHBar("ssEncargado", encArr.map(e => truncar(e.nombre, 25)), encArr.map(e => round(e.venta, 2)), C.goldDark, C.goldLight, 2);
}

function renderSellinDetalle() {
  if (!state.sellin) { $("gridSellDet").innerHTML = vacioMensaje(12); return; }
  const d = state.sellin;

  const cliArr = d.porCliente.slice(0, 50);
  $("sdClientes").innerHTML = cliArr.length
    ? tabla(
        [{ t: "Cliente" }, { t: "Venta Neta", num: 1 }, { t: "Cantidad", num: 1 }, { t: "Facturas", num: 1 }],
        cliArr.map(c => [truncar(c.nombre, 40), fmt(c.venta, 2), fmt(c.cant), fmt(c.facturas)])
      )
    : `<div class="plot-empty" style="display:flex;position:static;min-height:120px"><i class="fas fa-chart-simple"></i><span>Sin datos</span></div>`;

  const prodArr = d.porProducto.slice(0, 50);
  $("sdProductos").innerHTML = prodArr.length
    ? tabla(
        [{ t: "Producto" }, { t: "Código" }, { t: "Cantidad", num: 1 }, { t: "Venta Neta", num: 1 }],
        prodArr.map(p => [truncar(p.nombre, 40), p.codigo, fmt(p.cant), fmt(p.venta, 2)])
      )
    : `<div class="plot-empty" style="display:flex;position:static;min-height:120px"><i class="fas fa-chart-simple"></i><span>Sin datos</span></div>`;
}

function cambiarSubS(sub) {
  subActualS = sub;
  document.querySelectorAll("#subTabsS .subtab").forEach(t => t.classList.toggle("active", t.dataset.sub === sub));
  ["resumen", "detalle"].forEach(s => {
    const el = document.getElementById("subS-" + s);
    if (el) el.style.display = s === sub ? "block" : "none";
  });
  if (sub === "resumen") renderSellinResumen();
  else if (sub === "detalle") renderSellinDetalle();
  requestAnimationFrame(() => Object.values(charts).forEach(c => c.resize()));
}

function engancharEventos() {
  if (listenersReady) return;
  listenersReady = true;

  document.querySelectorAll("#subTabsS .subtab").forEach(t => {
    t.addEventListener("click", () => cambiarSubS(t.dataset.sub));
  });
  ["fSellGrupo","fSellSubcat","fSellCanal","fSellRegion"].forEach(id => {
    const el = $(id); if (el) el.addEventListener("change", () => cambiarSubS(subActualS));
  });
  const btnClear = $("clearSellRes");
  if (btnClear) btnClear.addEventListener("click", () => {
    ["fSellGrupo","fSellSubcat","fSellCanal","fSellRegion"].forEach(x => {
      const el = $(x); if (el) el.value = "";
    });
    cambiarSubS(subActualS);
  });

  document.querySelectorAll(".js-refresh").forEach((b) =>
    b.addEventListener("click", async () => {
      document.querySelectorAll(".js-refresh").forEach((x) => { x.disabled = true; x.classList.add("is-loading"); });
      try { await cargarTodo(); } catch (err) { console.error(err); }
      document.querySelectorAll(".js-refresh").forEach((x) => { x.disabled = false; x.classList.remove("is-loading"); });
    })
  );
}

async function cargarTodo() {
  const sellin = await cargarHoja("SELLIN_DATA").catch(() => null);
  state.sellin = sellin;

  const count = sellin ? 1 : 0;
  $("stRegistros").textContent = `${count} / 1`;
  $("stSync").textContent = new Date().toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit" });

  $("chipRegistros").textContent = fmt(state.sellin?.kpis?.totalRegistros || 0);
  $("chipSync").textContent = new Date().toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit" });

  llenarSegmentadores();
  cambiarSubS(subActualS);
}

(async function init() {
  construirLayoutInterno();
  try {
    await cargarTodo();
    $("loading").hidden = true;
    $("topbar").hidden = false;
    $("shell").hidden = false;
    $("sellin").hidden = false;
    engancharEventos();
    cambiarSubS(subActualS);
  } catch (err) {
    console.error(err);
    $("loading").innerHTML = `
      <div class="error-box">
        <i class="fas fa-triangle-exclamation"></i>
        <h3>No se pudieron cargar los datos</h3>
        <p>${err.message || err}</p>
      </div>`;
  }
})();