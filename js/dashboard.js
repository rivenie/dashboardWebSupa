const SUPABASE_URL = "https://ffiuayjfnhlvxgktxbal.supabase.co";
const SUPABASE_KEY = "sb_publishable_F8h3Zay5r9pVATEnvAIa-Q_bnaXgj1U";
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

const C = {
  gold: "#1E40AF", goldLight: "#3B82F6", goldDark: "#1E3A8A",
  orange: "#C2410C", amber: "#B45309",
  green: "#15803D", red: "#B91C1C", blue: "#0369A1", cyan: "#0E7490",
  other: "#CBD5E1", text: "#1E293B", dim: "#64748B", faint: "#94A3B8",
  grid: "rgba(100, 116, 139, 0.14)", panel: "#FFFFFF",
};
const PALETTE = [C.gold, C.amber, C.blue, C.orange, C.green, C.cyan, C.red, C.goldLight];
const MESES_ORD_DASH = ["01-ENE","02-FEB","03-MAR","04-ABR","05-MAY","06-JUN","07-JUL","08-AGO","09-SET","10-OCT","11-NOV","12-DIC"];

Chart.register(ChartDataLabels);
Chart.defaults.font.family = "'IBM Plex Sans', system-ui, sans-serif";
Chart.defaults.font.size = 11;
Chart.defaults.color = C.dim;
Chart.defaults.animation.duration = 450;
Chart.defaults.plugins.datalabels.display = false;
Chart.defaults.plugins.legend.display = false;

const state = { data: null };
const charts = {};
let listenersReady = false;
let subActualC = "general";

const fmt = (v, d = 0) => Number(v).toLocaleString("es-PE", { maximumFractionDigits: d, minimumFractionDigits: 0 });
const fmtM = (v) => {
  const n = Number(v);
  if (!isFinite(n)) return "0";
  if (Math.abs(n) >= 1e9) return (n / 1e9).toFixed(2) + " MM";
  if (Math.abs(n) >= 1e6) return (n / 1e6).toFixed(2) + " M";
  if (Math.abs(n) >= 1e3) return (n / 1e3).toFixed(1) + " K";
  return fmt(n, 0);
};
const round = (v, d = 1) => Number(Number(v).toFixed(d));
const truncar = (s, n = 30) => (s && s.length > n ? s.slice(0, n - 1) + "…" : s || "");
const $ = (id) => document.getElementById(id);

async function cargarHoja(nombre) {
  const { data, error } = await supabaseClient.from("dashboard_data").select("row_index, data").eq("sheet_name", nombre).order("row_index", { ascending: true }).limit(1);
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
    ctx.save(); ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillStyle = C.text; ctx.font = "700 18px Sora, sans-serif";
    ctx.fillText(opts.title, x, y - 8);
    ctx.fillStyle = C.dim; ctx.font = "500 11px 'IBM Plex Sans', sans-serif";
    ctx.fillText(opts.sub || "", x, y + 14); ctx.restore();
  },
};

function tooltipStyle() {
  return {
    backgroundColor: "#FFFFFF", titleColor: C.text, bodyColor: C.text,
    borderColor: "#E2E8F0", borderWidth: 1, padding: 10, cornerRadius: 8, boxPadding: 4,
    callbacks: { label: (c) => ` ${c.dataset.label ? c.dataset.label + ": " : c.label ? c.label + ": " : ""}${fmtM(c.parsed.y !== undefined ? c.parsed.y : c.parsed)}` },
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
function gradV(c1, c2) { return (ctx) => { const a = ctx.chart.chartArea; if (!a) return c1; const g = ctx.chart.ctx.createLinearGradient(0, a.top, 0, a.bottom); g.addColorStop(0, c1); g.addColorStop(1, c2); return g; }; }
function gradH(c1, c2) { return (ctx) => { const a = ctx.chart.chartArea; if (!a) return c1; const g = ctx.chart.ctx.createLinearGradient(a.left, 0, a.right, 0); g.addColorStop(0, c1); g.addColorStop(1, c2); return g; }; }
const scaleX = () => ({ grid: { display: false }, border: { color: "#E2E8F0" }, ticks: { color: C.dim, maxRotation: 0, autoSkipPadding: 14 } });
const scaleY = (max, decimals = 0, money = true) => ({ beginAtZero: true, suggestedMax: max, grid: { color: C.grid }, border: { display: false }, ticks: { color: C.faint, callback: (v) => money ? fmtM(v) : fmt(v, decimals), maxTicksLimit: 6 } });
const labelBase = { color: C.text, font: { family: "'IBM Plex Sans', sans-serif", weight: "600", size: 10 } };

function renderColumns(id, labels, data, color1 = C.goldLight, color2 = C.goldDark, decimals = 0, money = true) {
  const max = Math.max(...data, 0);
  mount(id, {
    type: "bar",
    data: { labels, datasets: [{ data, borderRadius: { topLeft: 7, topRight: 7 }, borderSkipped: false, maxBarThickness: 54, backgroundColor: gradV(color1, color2) }] },
    options: { responsive: true, maintainAspectRatio: false, layout: { padding: { top: 16 } },
      plugins: { tooltip: tooltipStyle(), datalabels: { ...labelBase, display: labels.length <= 12, anchor: "end", align: "end", offset: 3, formatter: (v) => money ? fmtM(v) : fmt(v, decimals) } },
      scales: { x: scaleX(), y: scaleY(max * 1.22, decimals, money) } },
  });
}
function renderScrollHBar(id, labels, data, color1 = C.goldDark, color2 = C.goldLight, money = true) {
  const ctx = $(id); if (!ctx) return;
  if (charts[id]) charts[id].destroy();
  const wrap = ctx.parentElement;
  wrap.style.maxHeight = "420px"; wrap.style.overflowY = "auto"; wrap.style.overflowX = "hidden";
  ctx.style.height = Math.max(420, labels.length * 28) + "px"; ctx.style.maxHeight = "none";
  const max = Math.max(...data, 0);
  charts[id] = new Chart(ctx, {
    type: "bar",
    data: { labels, datasets: [{ data, borderRadius: 6, borderSkipped: false, barThickness: 14, backgroundColor: gradH(color1, color2) }] },
    options: { indexAxis: "y", responsive: true, maintainAspectRatio: false, layout: { padding: { right: 12 } },
      plugins: { tooltip: tooltipStyle(), datalabels: { ...labelBase, display: true, anchor: "end", align: "right", offset: 4, formatter: (v) => money ? fmtM(v) : fmt(v) } },
      scales: { x: { ...scaleY(max * 1.18, 0, money), ticks: { color: C.faint, callback: (v) => money ? fmtM(v) : fmt(v), maxTicksLimit: 5 } }, y: { grid: { display: false }, border: { display: false }, ticks: { color: C.text, callback(v) { return truncar(this.getLabelForValue(v), 28); } } } } },
  });
}
function renderDoughnut(id, labels, data, centerTitle, centerSub, money = true) {
  const total = data.reduce((a, b) => a + Number(b), 0);
  const colores = labels.map((l, i) => {
    const k = (l || "").toUpperCase();
    if (k.includes("PERSONAL")) return C.gold;
    if (k.includes("BIENES")) return C.amber;
    if (k.includes("SERVICIO")) return C.blue;
    if (k.includes("LOCADOR")) return C.cyan;
    if (k.includes("VIATICO") || k.includes("VIÁTICO")) return C.orange;
    if (k.includes("DEVENGADO")) return C.green;
    if (k.includes("SALDO")) return C.amber;
    if (k === "OTROS") return C.other;
    return PALETTE[i % PALETTE.length];
  });
  mount(id, {
    type: "doughnut",
    data: { labels, datasets: [{ data, backgroundColor: colores, borderColor: "#FFFFFF", borderWidth: 3, hoverOffset: 5 }] },
    options: { responsive: true, maintainAspectRatio: false, cutout: "68%",
      plugins: {
        tooltip: { ...tooltipStyle(), callbacks: { label: (c) => ` ${c.label}: ${money ? fmtM(c.parsed) : fmt(c.parsed)} (${total ? Math.round((c.parsed / total) * 100) : 0}%)` } },
        datalabels: { ...labelBase, display: (c) => total > 0 && c.dataset.data[c.dataIndex] / total >= 0.06, color: "#1E293B", font: { family: "'IBM Plex Sans', sans-serif", weight: "700", size: 11 }, formatter: (v) => Math.round((v / total) * 100) + "%" },
        centerText: { title: centerTitle, sub: centerSub },
      } },
    plugins: [centerText],
  });
  const lg = $(id + "Legend");
  if (lg) lg.innerHTML = labels.map((l, i) => `<div class="legend-item"><i style="background:${colores[i]}"></i><span title="${l}">${truncar(l, 22)}</span><b>${total ? Math.round((data[i] / total) * 100) : 0}%</b></div>`).join("");
}
function renderLine(id, labels, datasets, money = true) {
  const maxAll = Math.max(...datasets.flatMap(d => d.data), 0);
  mount(id, {
    type: "line",
    data: { labels, datasets: datasets.map(d => ({
      label: d.label, data: d.data, borderColor: d.color, borderWidth: 2.5, tension: 0.35, fill: false,
      pointBackgroundColor: d.color, pointBorderColor: "#FFFFFF", pointBorderWidth: 2, pointRadius: 4, pointHoverRadius: 6,
    })) },
    options: { responsive: true, maintainAspectRatio: false, layout: { padding: { top: 22, right: 10 } },
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: { display: datasets.length > 1, position: "bottom", labels: { color: C.dim, usePointStyle: true, pointStyle: "circle", boxWidth: 8, padding: 14 } },
        tooltip: tooltipStyle(),
        datalabels: { display: false },
      },
      scales: { x: scaleX(), y: scaleY(maxAll * 1.18, 0, money) } },
  });
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
  return `<article class="card span-${span}"><div class="card-head"><h3>${titulo}</h3><p>${sub}</p></div>
    <div class="plot ${size}"><canvas id="${id}"></canvas><div class="plot-empty"><i class="fas fa-chart-simple"></i><span>Sin datos para mostrar</span></div></div></article>`;
}
function donutCard(id, titulo, sub, span) {
  return `<article class="card span-${span}"><div class="card-head"><h3>${titulo}</h3><p>${sub}</p></div>
    <div class="plot donut"><canvas id="${id}"></canvas><div class="plot-empty"><i class="fas fa-chart-pie"></i><span>Sin datos para mostrar</span></div></div>
    <div class="legend" id="${id}Legend"></div></article>`;
}
function slotCard(id, titulo, sub, span) {
  return `<article class="card span-${span}"><div class="card-head"><h3>${titulo}</h3><p>${sub}</p></div><div id="${id}" class="mini-table"></div></article>`;
}
function tabla(encabezados, filas) {
  return `<div class="tbl-wrap"><table class="tbl"><thead><tr>${encabezados.map((h) => `<th class="${h.num ? "num" : ""}">${h.t}</th>`).join("")}</tr></thead><tbody>${filas.map((f) => `<tr>${f.map((c, i) => `<td class="${encabezados[i].num ? "num" : ""} ${i === 0 ? "name" : ""}">${c}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
}
function vacioMensaje(span = 12) {
  return `<article class="card span-${span}"><div class="plot-empty" style="display:flex;position:static;min-height:200px"><i class="fas fa-database"></i><span>No se encontraron datos.</span></div></article>`;
}

function construirLayoutInterno() {
  // GENERAL
  $("gridCompRes").innerHTML = [
    plotCard("ccResumen", "PIM vs Cert vs Comp vs Dev", "Ejecución global", 12, "tall"),
  ].join("");

  // PIM
  $("filtersPim").innerHTML = `
    <div class="filter-chip"><i class="fas fa-building"></i>
      <select id="fPimOficina" class="filter-select"><option value="">Oficina</option></select></div>
    <div class="filter-chip"><i class="fas fa-layer-group"></i>
      <select id="fPimGen" class="filter-select"><option value="">Genérica</option></select></div>
    <button id="clearPim" class="btn-clear-chips"><i class="fas fa-eraser"></i> Limpiar</button>`;
  $("gridPim").innerHTML = [
    plotCard("pimBar", "PIM vs Certificado vs Devengado", "Ejecución presupuestal", 6, "tall"),
    donutCard("pimGen", "Devengado por genérica", "Personal · Bienes · Servicios", 6),
    plotCard("pimOficina", "Devengado por oficina", "Top oficinas", 6, "tall"),
    plotCard("pimMes", "Devengado por mes", "Ene - Dic", 6, "tall"),
    slotCard("pimTabla", "Detalle PIM", "Oficina · Meta · PIA · PIM · Cert · Comp · Dev · Gir · Pag", 12),
  ].join("");

  // CERT
  $("filtersCert").innerHTML = `
    <div class="filter-chip"><i class="fas fa-building"></i>
      <select id="fCertOficina" class="filter-select"><option value="">Oficina</option></select></div>
    <button id="clearCert" class="btn-clear-chips"><i class="fas fa-eraser"></i> Limpiar</button>`;
  $("gridCert").innerHTML = [
    plotCard("certOficina", "Certificado por oficina", "Top oficinas", 6, "tall"),
    donutCard("certTipo", "Certificado por tipo SIAF", "Servicio · Bienes · Locador", 6),
    plotCard("certMes", "Certificado por mes", "Ene - Dic", 6, "tall"),
    donutCard("certFF", "Certificado por FF", "Fuente de financiamiento", 6),
    slotCard("certTabla", "Detalle Certificados", "Oficina · Meta · Cert · Comp · Dev · Gir · Pag · Tipo SIAF", 12),
  ].join("");

  // COMP
  $("filtersComp").innerHTML = `
    <div class="filter-chip"><i class="fas fa-building"></i>
      <select id="fCompOficina" class="filter-select"><option value="">Oficina</option></select></div>
    <button id="clearComp" class="btn-clear-chips"><i class="fas fa-eraser"></i> Limpiar</button>`;
  $("gridComp").innerHTML = [
    plotCard("compProv", "Compromiso por proveedor", "Top proveedores", 6, "tall"),
    donutCard("compEstado", "Compromiso por estado SIAF", "Devengado · Saldo x Devengar", 6),
    plotCard("compMes", "Compromiso por mes", "Ene - Dic", 6, "tall"),
    donutCard("compDoc", "Compromiso por tipo doc", "Orden de Servicio · Orden de Compra", 6),
    slotCard("compTabla", "Detalle Compromisos", "Oficina · Meta · Proveedor · Tipo Doc · Comp · Dev · Gir · Pag · Estado", 12),
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
  if (!state.data) return;
  const d = state.data;
  const oficinas = new Set();
  if (d.pim) d.pim.filas.forEach(f => oficinas.add(f.oficina));
  if (d.cert) d.cert.filas.forEach(f => oficinas.add(f.oficina));
  if (d.comp) d.comp.filas.forEach(f => oficinas.add(f.oficina));
  const gen = d.pim ? d.pim.filas.map(f => f.gen).filter(Boolean) : [];
  llenarSelect("fPimOficina", [...oficinas].sort(), "Oficina");
  llenarSelect("fPimGen", [...new Set(gen)].sort(), "Genérica");
  llenarSelect("fCertOficina", [...oficinas].sort(), "Oficina");
  llenarSelect("fCompOficina", [...oficinas].sort(), "Oficina");
}
function filtroActivo(id) { const el = $(id); return el ? el.value : ""; }

/* ---------- GENERAL ---------- */
function renderGeneral() {
  if (!state.data) { $("kpiCompRes").innerHTML = ""; $("gridCompRes").innerHTML = vacioMensaje(12); return; }
  const k = state.data.kpis;

  $("kpiCompRes").innerHTML = [
    heroCard({
      title: "PIM Total", value: fmtM(k.pim), unit: "",
      note: `Cert: ${fmtM(k.certificado)} · Comp: ${fmtM(k.compromiso)}`,
      badge: `Dev: ${fmt(k.pctDev, 1)}%`,
    }),
    kpiCard({ icon: "fa-file-signature", tone: "gold", title: "Certificado", value: fmtM(k.certificado), unit: "",
      pct: k.pctCert, barLabel: "Cert / PIM", foot: `${fmt(k.pctCert, 1)}% del PIM` }),
    kpiCard({ icon: "fa-handshake", tone: "amber", title: "Compromiso", value: fmtM(k.compromiso), unit: "",
      pct: k.pctComp, barLabel: "Comp / PIM", foot: `${fmt(k.pctComp, 1)}%` }),
    kpiCard({ icon: "fa-coins", tone: "green", title: "Devengado", value: fmtM(k.devengado), unit: "",
      pct: k.pctDev, barLabel: "Dev / PIM", foot: `Girado: ${fmtM(k.girado)} · Pagado: ${fmtM(k.pagado)}` }),
  ].join("");

  mount("ccResumen", {
    type: "bar",
    data: { labels: ["PIA", "PIM", "Certificado", "Compromiso", "Devengado", "Girado", "Pagado"],
      datasets: [{ data: [k.pia, k.pim, k.certificado, k.compromiso, k.devengado, k.girado, k.pagado],
        backgroundColor: [C.goldLight, C.gold, C.blue, C.amber, C.green, C.cyan, C.orange],
        borderRadius: { topLeft: 7, topRight: 7 }, borderSkipped: false, maxBarThickness: 56 }] },
    options: { responsive: true, maintainAspectRatio: false, layout: { padding: { top: 16 } },
      plugins: { tooltip: tooltipStyle(), datalabels: { ...labelBase, display: true, anchor: "end", align: "end", offset: 3, formatter: (v) => fmtM(v) } },
      scales: { x: scaleX(), y: scaleY(k.pim * 1.22, 0, true) } },
  });
}

/* ---------- PIM ---------- */
function renderPim() {
  if (!state.data || !state.data.pim) { $("kpiPim").innerHTML = ""; $("gridPim").innerHTML = vacioMensaje(12); return; }
  const fOficina = filtroActivo("fPimOficina");
  const fGen = filtroActivo("fPimGen");
  const filas = state.data.pim.filas.filter(f => (!fOficina || f.oficina === fOficina) && (!fGen || f.gen === fGen));

  const sum = (arr, key) => arr.reduce((a, x) => a + (x[key] || 0), 0);
  const totalPIM = sum(filas, "pim");
  const totalCert = sum(filas, "cert");
  const totalComp = sum(filas, "comp");
  const totalDev = sum(filas, "dev");
  const totalGir = sum(filas, "gir");
  const totalPag = sum(filas, "pag");

  $("kpiPim").innerHTML = [
    heroCard({ title: "PIM", value: fmtM(totalPIM), unit: "", note: `${filas.length} registros`, badge: `Dev: ${fmt(totalPIM ? (totalDev/totalPIM)*100 : 0, 1)}%` }),
    kpiCard({ icon: "fa-file-signature", tone: "gold", title: "Certificado", value: fmtM(totalCert), unit: "", pct: totalPIM ? (totalCert/totalPIM)*100 : 0, barLabel: "Cert / PIM", foot: `${fmt(totalPIM ? (totalCert/totalPIM)*100 : 0, 1)}%` }),
    kpiCard({ icon: "fa-handshake", tone: "amber", title: "Compromiso", value: fmtM(totalComp), unit: "", pct: totalPIM ? (totalComp/totalPIM)*100 : 0, barLabel: "Comp / PIM", foot: `${fmt(totalPIM ? (totalComp/totalPIM)*100 : 0, 1)}%` }),
    kpiCard({ icon: "fa-coins", tone: "green", title: "Devengado", value: fmtM(totalDev), unit: "", pct: totalPIM ? (totalDev/totalPIM)*100 : 0, barLabel: "Dev / PIM", foot: `Gir: ${fmtM(totalGir)} · Pag: ${fmtM(totalPag)}` }),
  ].join("");

  mount("pimBar", {
    type: "bar",
    data: { labels: ["PIM", "Certificado", "Compromiso", "Devengado", "Girado", "Pagado"],
      datasets: [{ data: [totalPIM, totalCert, totalComp, totalDev, totalGir, totalPag],
        backgroundColor: [C.goldDark, C.gold, C.amber, C.green, C.cyan, C.orange],
        borderRadius: { topLeft: 7, topRight: 7 }, borderSkipped: false, maxBarThickness: 56 }] },
    options: { responsive: true, maintainAspectRatio: false, layout: { padding: { top: 16 } },
      plugins: { tooltip: tooltipStyle(), datalabels: { ...labelBase, display: true, anchor: "end", align: "end", offset: 3, formatter: (v) => fmtM(v) } },
      scales: { x: scaleX(), y: scaleY(totalPIM * 1.22, 0, true) } },
  });

  const genAgg = {};
  filas.forEach(f => { if (f.gen) genAgg[f.gen] = (genAgg[f.gen] || 0) + f.dev; });
  const genArr = Object.entries(genAgg).sort((a, b) => b[1] - a[1]).slice(0, 6);
  renderDoughnut("pimGen", genArr.map(g => g[0]), genArr.map(g => round(g[1], 2)), fmtM(totalDev), "devengado");

  const oficAgg = {};
  filas.forEach(f => { if (f.oficina) oficAgg[f.oficina] = (oficAgg[f.oficina] || 0) + f.dev; });
  const ofArr = Object.entries(oficAgg).sort((a, b) => b[1] - a[1]).slice(0, 20);
  renderScrollHBar("pimOficina", ofArr.map(o => truncar(o[0], 30)), ofArr.map(o => round(o[1], 2)), C.goldDark, C.goldLight, true);

  if (state.data.pim.devPorMes) {
    renderLine("pimMes", state.data.pim.devPorMes.map(d => d.mes), [
      { label: "Devengado", color: C.gold, data: state.data.pim.devPorMes.map(d => round(d.valor, 2)) },
    ], true);
  }

  $("pimTabla").innerHTML = filas.length
    ? tabla(
        [{ t: "Oficina" }, { t: "Meta" }, { t: "Gen" }, { t: "Esp. Gasto" },
         { t: "PIA", num: 1 }, { t: "PIM", num: 1 }, { t: "Cert", num: 1 }, { t: "Comp", num: 1 },
         { t: "Dev", num: 1 }, { t: "Gir", num: 1 }, { t: "Pag", num: 1 }],
        filas.slice(0, 200).map(f => [
          truncar(f.oficina, 30), f.meta, f.gen, truncar(f.espGasto, 25),
          fmtM(f.pia), fmtM(f.pim), fmtM(f.cert), fmtM(f.comp),
          fmtM(f.dev), fmtM(f.gir), fmtM(f.pag),
        ])
      )
    : `<div class="plot-empty" style="display:flex;position:static;min-height:120px"><i class="fas fa-chart-simple"></i><span>Sin datos</span></div>`;
}

/* ---------- CERT ---------- */
function renderCert() {
  if (!state.data || !state.data.cert) { $("kpiCert").innerHTML = ""; $("gridCert").innerHTML = vacioMensaje(12); return; }
  const fOficina = filtroActivo("fCertOficina");
  const filas = state.data.cert.filas.filter(f => !fOficina || f.oficina === fOficina);
  const k = state.data.cert.kpis;

  $("kpiCert").innerHTML = [
    heroCard({ title: "Certificado Total", value: fmtM(k.totalCertificado), unit: "", note: `${filas.length} registros`, badge: `Comp: ${fmtM(k.totalCompromiso)}` }),
    kpiCard({ icon: "fa-handshake", tone: "gold", title: "Compromiso", value: fmtM(k.totalCompromiso), unit: "", pct: k.totalCertificado ? (k.totalCompromiso/k.totalCertificado)*100 : 0, barLabel: "Comp / Cert", foot: `${fmt(k.totalCertificado ? (k.totalCompromiso/k.totalCertificado)*100 : 0, 1)}%` }),
    kpiCard({ icon: "fa-coins", tone: "green", title: "Devengado", value: fmtM(k.totalDevengado), unit: "", pct: k.totalCertificado ? (k.totalDevengado/k.totalCertificado)*100 : 0, barLabel: "Dev / Cert", foot: `${fmt(k.totalCertificado ? (k.totalDevengado/k.totalCertificado)*100 : 0, 1)}%` }),
    kpiCard({ icon: "fa-money-bill-transfer", tone: "amber", title: "Girado", value: fmtM(k.totalGirado), unit: "", pct: k.totalCertificado ? (k.totalGirado/k.totalCertificado)*100 : 0, barLabel: "Giro / Cert", foot: `Pagado: ${fmtM(k.totalPagado)}` }),
  ].join("");

  const oficAgg = {};
  filas.forEach(f => { if (f.oficina) oficAgg[f.oficina] = (oficAgg[f.oficina] || 0) + f.cert; });
  const ofArr = Object.entries(oficAgg).sort((a, b) => b[1] - a[1]).slice(0, 20);
  renderScrollHBar("certOficina", ofArr.map(o => truncar(o[0], 30)), ofArr.map(o => round(o[1], 2)), C.blue, C.cyan, true);

  const tipoAgg = {};
  filas.forEach(f => { if (f.tipoSIAF) tipoAgg[f.tipoSIAF] = (tipoAgg[f.tipoSIAF] || 0) + f.cert; });
  const tArr = Object.entries(tipoAgg).sort((a, b) => b[1] - a[1]).slice(0, 8);
  renderDoughnut("certTipo", tArr.map(t => t[0]), tArr.map(t => round(t[1], 2)), fmtM(k.totalCertificado), "certificado");

  const mesAgg = {};
  filas.forEach(f => { if (f.mesCert) mesAgg[f.mesCert] = (mesAgg[f.mesCert] || 0) + f.cert; });
  const mArr = Object.entries(mesAgg);
  renderColumns("certMes", mArr.map(m => m[0]), mArr.map(m => round(m[1], 2)), C.goldLight, C.goldDark, 0, true);

  const ffAgg = {};
  filas.forEach(f => { if (f.ffDet) ffAgg[f.ffDet] = (ffAgg[f.ffDet] || 0) + f.cert; });
  const ffArr = Object.entries(ffAgg).sort((a, b) => b[1] - a[1]).slice(0, 8);
  renderDoughnut("certFF", ffArr.map(f => f[0]), ffArr.map(f => round(f[1], 2)), fmtM(k.totalCertificado), "certificado");

  $("certTabla").innerHTML = filas.length
    ? tabla(
        [{ t: "Oficina" }, { t: "Meta" }, { t: "Tipo SIAF" },
         { t: "Cert", num: 1 }, { t: "Comp. Anual", num: 1 }, { t: "Comp", num: 1 },
         { t: "Dev", num: 1 }, { t: "Gir", num: 1 }, { t: "Pag", num: 1 }, { t: "Mes" }],
        filas.slice(0, 200).map(f => [
          truncar(f.oficina, 26), f.meta, truncar(f.tipoSIAF, 14),
          fmtM(f.cert), fmtM(f.compAnual), fmtM(f.comp), fmtM(f.dev), fmtM(f.gir), fmtM(f.pag),
          f.mesCert || "—",
        ])
      )
    : `<div class="plot-empty" style="display:flex;position:static;min-height:120px"><i class="fas fa-chart-simple"></i><span>Sin datos</span></div>`;
}

/* ---------- COMP ---------- */
function renderComp() {
  if (!state.data || !state.data.comp) { $("kpiComp").innerHTML = ""; $("gridComp").innerHTML = vacioMensaje(12); return; }
  const fOficina = filtroActivo("fCompOficina");
  const filas = state.data.comp.filas.filter(f => !fOficina || f.oficina === fOficina);
  const k = state.data.comp.kpis;

  $("kpiComp").innerHTML = [
    heroCard({ title: "Compromiso Total", value: fmtM(k.totalCompromiso), unit: "", note: `${filas.length} registros`, badge: `Dev: ${fmtM(k.totalDevengado)}` }),
    kpiCard({ icon: "fa-coins", tone: "green", title: "Devengado", value: fmtM(k.totalDevengado), unit: "", pct: k.totalCompromiso ? (k.totalDevengado/k.totalCompromiso)*100 : 0, barLabel: "Dev / Comp", foot: `${fmt(k.totalCompromiso ? (k.totalDevengado/k.totalCompromiso)*100 : 0, 1)}%` }),
    kpiCard({ icon: "fa-money-bill-transfer", tone: "amber", title: "Girado", value: fmtM(k.totalGirado), unit: "", pct: k.totalCompromiso ? (k.totalGirado/k.totalCompromiso)*100 : 0, barLabel: "Giro / Comp", foot: `Pagado: ${fmtM(k.totalPagado)}` }),
    kpiCard({ icon: "fa-hourglass-half", tone: "orange", title: "Saldo x Devengar", value: fmtM(k.saldoCompDev), unit: "", pct: k.totalCompromiso ? (k.saldoCompDev/k.totalCompromiso)*100 : 0, barLabel: "Saldo / Comp", foot: `Pendiente de ejecución` }),
  ].join("");

  const provAgg = {};
  filas.forEach(f => { if (f.prov) provAgg[f.prov] = (provAgg[f.prov] || 0) + f.comp; });
  const pArr = Object.entries(provAgg).sort((a, b) => b[1] - a[1]).slice(0, 20);
  renderScrollHBar("compProv", pArr.map(p => truncar(p[0], 30)), pArr.map(p => round(p[1], 2)), C.goldDark, C.goldLight, true);

  const estAgg = {};
  filas.forEach(f => { if (f.estado) estAgg[f.estado] = (estAgg[f.estado] || 0) + f.comp; });
  const eArr = Object.entries(estAgg).sort((a, b) => b[1] - a[1]).slice(0, 8);
  renderDoughnut("compEstado", eArr.map(e => e[0]), eArr.map(e => round(e[1], 2)), fmtM(k.totalCompromiso), "compromiso");

  const mesAgg = {};
  filas.forEach(f => { if (f.mes) mesAgg[f.mes] = (mesAgg[f.mes] || 0) + f.comp; });
  const mArr = Object.entries(mesAgg).sort((a, b) => MESES_ORD_DASH.indexOf(a[0]) - MESES_ORD_DASH.indexOf(b[0]));
  renderColumns("compMes", mArr.map(m => m[0]), mArr.map(m => round(m[1], 2)), C.goldLight, C.goldDark, 0, true);

  const docAgg = {};
  filas.forEach(f => { if (f.tipoDoc) docAgg[f.tipoDoc] = (docAgg[f.tipoDoc] || 0) + f.comp; });
  const dArr = Object.entries(docAgg).sort((a, b) => b[1] - a[1]).slice(0, 8);
  renderDoughnut("compDoc", dArr.map(d => d[0]), dArr.map(d => round(d[1], 2)), fmtM(k.totalCompromiso), "compromiso");

  $("compTabla").innerHTML = filas.length
    ? tabla(
        [{ t: "Oficina" }, { t: "Meta" }, { t: "Proveedor" }, { t: "Tipo Doc" },
         { t: "Comp", num: 1 }, { t: "Dev", num: 1 }, { t: "Gir", num: 1 }, { t: "Pag", num: 1 },
         { t: "Estado" }, { t: "Mes" }],
        filas.slice(0, 200).map(f => [
          truncar(f.oficina, 26), f.meta, truncar(f.prov, 28), truncar(f.tipoDoc, 14),
          fmtM(f.comp), fmtM(f.dev), fmtM(f.gir), fmtM(f.pag),
          truncar(f.estado, 18), f.mes || "—",
        ])
      )
    : `<div class="plot-empty" style="display:flex;position:static;min-height:120px"><i class="fas fa-chart-simple"></i><span>Sin datos</span></div>`;
}

function cambiarSubC(sub) {
  subActualC = sub;
  document.querySelectorAll("#subTabsC .subtab").forEach(t => t.classList.toggle("active", t.dataset.sub === sub));
  ["general", "pim", "cert", "comp"].forEach(s => {
    const el = document.getElementById("subC-" + s);
    if (el) el.style.display = s === sub ? "block" : "none";
  });
  if (sub === "general") renderGeneral();
  else if (sub === "pim") renderPim();
  else if (sub === "cert") renderCert();
  else if (sub === "comp") renderComp();
  requestAnimationFrame(() => Object.values(charts).forEach(c => c.resize()));
}

function engancharEventos() {
  if (listenersReady) return;
  listenersReady = true;

  document.querySelectorAll("#subTabsC .subtab").forEach(t => {
    t.addEventListener("click", () => cambiarSubC(t.dataset.sub));
  });
  ["fPimOficina", "fPimGen"].forEach(id => { const el = $(id); if (el) el.addEventListener("change", () => renderPim()); });
  ["fCertOficina"].forEach(id => { const el = $(id); if (el) el.addEventListener("change", () => renderCert()); });
  ["fCompOficina"].forEach(id => { const el = $(id); if (el) el.addEventListener("change", () => renderComp()); });
  const cp = $("clearPim"); if (cp) cp.addEventListener("click", () => { ["fPimOficina","fPimGen"].forEach(x => { const el = $(x); if (el) el.value = ""; }); renderPim(); });
  const cc = $("clearCert"); if (cc) cc.addEventListener("click", () => { const el = $("fCertOficina"); if (el) el.value = ""; renderCert(); });
  const cm = $("clearComp"); if (cm) cm.addEventListener("click", () => { const el = $("fCompOficina"); if (el) el.value = ""; renderComp(); });

  document.querySelectorAll(".js-refresh").forEach((b) =>
    b.addEventListener("click", async () => {
      document.querySelectorAll(".js-refresh").forEach((x) => { x.disabled = true; x.classList.add("is-loading"); });
      try { await cargarTodo(); } catch (err) { console.error(err); }
      document.querySelectorAll(".js-refresh").forEach((x) => { x.disabled = false; x.classList.remove("is-loading"); });
    })
  );
}

async function cargarTodo() {
  const data = await cargarHoja("FINANCIERO_DATA").catch(() => null);
  state.data = data;

  const count = data ? 1 : 0;
  $("stRegistros").textContent = `${count} / 1`;
  $("stSync").textContent = new Date().toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit" });

  $("chipRegistros").textContent = fmt(
    (state.data?.pim?.filas?.length || 0) +
    (state.data?.cert?.filas?.length || 0) +
    (state.data?.comp?.filas?.length || 0)
  );
  $("chipSync").textContent = new Date().toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit" });

  llenarSegmentadores();
  cambiarSubC(subActualC);
}

(async function init() {
  construirLayoutInterno();
  try {
    await cargarTodo();
    $("loading").hidden = true;
    $("topbar").hidden = false;
    $("shell").hidden = false;
    $("presupuesto").hidden = false;
    engancharEventos();
    cambiarSubC(subActualC);
  } catch (err) {
    console.error(err);
    $("loading").innerHTML = `<div class="error-box"><i class="fas fa-triangle-exclamation"></i><h3>No se pudieron cargar los datos</h3><p>${err.message || err}</p></div>`;
  }
})();