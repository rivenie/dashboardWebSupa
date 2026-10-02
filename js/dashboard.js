/* ==========================================================
   Dashboard Minero — lógica
   Datos: Supabase (tabla dashboard_data) · Gráficos: Chart.js
   ========================================================== */

const SUPABASE_URL = "https://uoftarfxakkpevugdycg.supabase.co";
const SUPABASE_KEY = "sb_publishable_vT_w6EoVLl-BK12ojRTaOg_UeSXAVvh";
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

/* ---------- Paleta ---------- */
const C = {
  cyan: "#22E3F2", blue: "#3B9CFF", orange: "#FF8A1F", green: "#19C37D", purple: "#A06BFF",
  other: "#3A4766", text: "#E6ECFA", dim: "#8FA0C2", faint: "#5B6B8C",
  grid: "rgba(143, 160, 194, 0.10)", panel: "#0B1223",
};
const PALETTE = [C.cyan, C.orange, C.green, C.purple, C.blue];

Chart.register(ChartDataLabels);
Chart.defaults.font.family = "'IBM Plex Sans', system-ui, sans-serif";
Chart.defaults.font.size = 11;
Chart.defaults.color = C.dim;
Chart.defaults.animation.duration = 450;
Chart.defaults.plugins.datalabels.display = false;
Chart.defaults.plugins.legend.display = false;

/* ---------- Estado ---------- */
const state = { explosivos: [], produccion: [] };
const cols = { e: {}, p: {} };
const charts = {};
const ultimo = { explosivos: [], produccion: [] };
let seccionActual = "explosivos";
let listenersReady = false;
let ultimaCarga = null;

/* ---------- Helpers ---------- */
const fmt = (v, d = 0) =>
  Number(v).toLocaleString("es-PE", { maximumFractionDigits: d, minimumFractionDigits: 0 });
const round = (v, d = 1) => Number(Number(v).toFixed(d));
const clamp = (v, a = 0, b = 100) => Math.min(b, Math.max(a, v));
const truncar = (s, n = 30) => (s.length > n ? s.slice(0, n - 1) + "…" : s);
const $ = (id) => document.getElementById(id);

function col(data, clave) {
  if (!data || data.length === 0) return null;
  const keys = Object.keys(data[0]);
  return keys.find((k) => k.trim().toLowerCase() === clave.trim().toLowerCase());
}
function norm(v) { return v !== undefined && v !== null ? v.toString().trim() : ""; }
function num(v) {
  if (typeof v === "number") return v;
  if (!v) return 0;
  if (v.toString().startsWith("#")) return 0;
  return parseFloat(v.toString().replace(/[^0-9.-]/g, "")) || 0;
}
function sumBy(data, keyFn, valFn) {
  const out = {};
  data.forEach((f) => {
    const k = keyFn(f);
    if (k === null) return;
    out[k] = (out[k] || 0) + valFn(f);
  });
  return out;
}
function hexRgba(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}
function topN(obj, n, agrupar = true) {
  const arr = Object.entries(obj).sort((a, b) => b[1] - a[1]);
  const top = arr.slice(0, n);
  if (agrupar && arr.length > n) {
    const resto = arr.slice(n).reduce((a, e) => a + e[1], 0);
    if (resto > 0) top.push(["Otros", resto]);
  }
  return top;
}

/* Fechas: acepta "2026-03-05", "05/03/2026" o "05-03-2026", con o sin hora */
function parseFecha(valor) {
  const s = norm(valor).split(" ")[0].split("T")[0];
  if (!s) return null;
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) return Date.UTC(+m[1], +m[2] - 1, +m[3]);
  m = s.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/);
  if (m) return Date.UTC(+m[3], +m[2] - 1, +m[1]);
  return null;
}
const etiquetaFecha = (ts) =>
  new Date(ts).toLocaleDateString("es-PE", { day: "2-digit", month: "short", timeZone: "UTC" }).replace(".", "");
function porFecha(data, colFecha, valFn, mode = "sum") {
  const acc = {};
  data.forEach((f) => {
    const ts = parseFecha(f[colFecha]);
    if (ts === null) return;
    const v = valFn(f);
    if (!acc[ts]) acc[ts] = { sum: 0, n: 0 };
    if (mode === "avg" && !(v > 0)) return;
    acc[ts].sum += v;
    acc[ts].n += 1;
  });
  const keys = Object.keys(acc).map(Number).sort((a, b) => a - b);
  return {
    keys,
    labels: keys.map(etiquetaFecha),
    values: keys.map((k) => (mode === "avg" ? (acc[k].n ? acc[k].sum / acc[k].n : 0) : acc[k].sum)),
  };
}
function rangoFechas(data, colFecha) {
  const t = data.map((f) => parseFecha(f[colFecha])).filter((x) => x !== null);
  if (!t.length) return "—";
  const a = Math.min(...t), b = Math.max(...t);
  const o = { day: "2-digit", month: "short", timeZone: "UTC" };
  const f = (ts, y) => new Date(ts).toLocaleDateString("es-PE", y ? { ...o, year: "numeric" } : o).replace(".", "");
  return a === b ? f(a, true) : `${f(a)} – ${f(b, true)}`;
}
const argmax = (arr) => arr.reduce((bi, v, i) => (v > arr[bi] ? i : bi), 0);
const argmin = (arr) => arr.reduce((bi, v, i) => (v < arr[bi] ? i : bi), 0);

/* ---------- Carga desde Supabase ---------- */
async function cargarHoja(nombre) {
  const TAMANO = 1000;
  let todos = [], desde = 0, seguir = true;
  while (seguir) {
    const { data, error } = await supabaseClient
      .from("dashboard_data")
      .select("row_index, data")
      .eq("sheet_name", nombre)
      .order("row_index", { ascending: true })
      .range(desde, desde + TAMANO - 1);
    if (error) throw error;
    if (data.length === 0) seguir = false;
    else {
      todos = todos.concat(data);
      desde += TAMANO;
      if (data.length < TAMANO) seguir = false;
    }
  }
  return todos.map((r) => r.data);
}

/* ---------- Plugins de Chart.js ---------- */
const centerText = {
  id: "centerText",
  afterDraw(chart, _args, opts) {
    if (!opts || !opts.title) return;
    const { ctx, chartArea: a } = chart;
    const x = (a.left + a.right) / 2, y = (a.top + a.bottom) / 2;
    ctx.save();
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillStyle = C.text; ctx.font = "700 26px Sora, sans-serif";
    ctx.fillText(opts.title, x, y - 8);
    ctx.fillStyle = C.dim; ctx.font = "500 11px 'IBM Plex Sans', sans-serif";
    ctx.fillText(opts.sub || "", x, y + 16);
    ctx.restore();
  },
};
const avgLine = {
  id: "avgLine",
  afterDatasetsDraw(chart, _args, opts) {
    if (!opts || opts.value === undefined || opts.value === null) return;
    const y = chart.scales.y.getPixelForValue(opts.value);
    const { left, right, top, bottom } = chart.chartArea;
    if (y < top || y > bottom) return;
    const ctx = chart.ctx;
    ctx.save();
    ctx.setLineDash([5, 4]); ctx.strokeStyle = C.orange; ctx.lineWidth = 1.25;
    ctx.beginPath(); ctx.moveTo(left, y); ctx.lineTo(right, y); ctx.stroke();
    ctx.setLineDash([]);
    ctx.font = "600 10.5px 'IBM Plex Sans', sans-serif";
    const w = ctx.measureText(opts.label).width + 16, h = 20;
    const x = right - w, ty = Math.max(top, y - h - 5);
    ctx.fillStyle = "rgba(11, 18, 35, 0.95)"; ctx.strokeStyle = C.orange; ctx.lineWidth = 1;
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(x, ty, w, h, 6); else ctx.rect(x, ty, w, h);
    ctx.fill(); ctx.stroke();
    ctx.fillStyle = C.orange; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText(opts.label, x + w / 2, ty + h / 2 + 0.5);
    ctx.restore();
  },
};

/* ---------- Utilidades de gráfico ---------- */
function tooltipStyle() {
  return {
    backgroundColor: "#070B16", titleColor: C.text, bodyColor: C.text,
    borderColor: "#27345A", borderWidth: 1, padding: 10, cornerRadius: 8, boxPadding: 4,
    callbacks: {
      label: (c) => {
        const v = typeof c.parsed === "number" ? c.parsed : c.chart.options.indexAxis === "y" ? c.parsed.x : c.parsed.y;
        return ` ${c.dataset.label ? c.dataset.label + ": " : c.label ? c.label + ": " : ""}${fmt(v, 2)}`;
      },
    },
  };
}
function mount(id, config) {
  const canvas = $(id);
  if (!canvas) return;
  if (charts[id]) { charts[id].destroy(); delete charts[id]; }
  const vacio = !config.data.labels || config.data.labels.length === 0;
  canvas.parentElement.classList.toggle("is-empty", vacio);
  if (vacio) return;
  charts[id] = new Chart(canvas, config);
}
function gradV(c1, c2) {
  return (ctx) => {
    const a = ctx.chart.chartArea;
    if (!a) return c1;
    const g = ctx.chart.ctx.createLinearGradient(0, a.top, 0, a.bottom);
    g.addColorStop(0, c1); g.addColorStop(1, c2);
    return g;
  };
}
function gradH(c1, c2) {
  return (ctx) => {
    const a = ctx.chart.chartArea;
    if (!a) return c1;
    const g = ctx.chart.ctx.createLinearGradient(a.left, 0, a.right, 0);
    g.addColorStop(0, c1); g.addColorStop(1, c2);
    return g;
  };
}
const scaleX = () => ({
  grid: { display: false }, border: { color: "#1B2745" },
  ticks: { color: C.dim, maxRotation: 0, autoSkipPadding: 14 },
});
const scaleY = (max) => ({
  beginAtZero: true, suggestedMax: max, grid: { color: C.grid }, border: { display: false },
  ticks: { color: C.faint, callback: (v) => fmt(v), maxTicksLimit: 6 },
});
const labelBase = {
  color: C.text, font: { family: "'IBM Plex Sans', sans-serif", weight: "600", size: 10.5 },
};

/* ---------- Gráficos ---------- */
function renderColumns(id, labels, data, { decimals = 0, avg = null, avgLabel = "" } = {}) {
  const max = Math.max(...data, 0);
  mount(id, {
    type: "bar",
    data: {
      labels,
      datasets: [{
        data, borderRadius: { topLeft: 7, topRight: 7 }, borderSkipped: false, maxBarThickness: 54,
        backgroundColor: gradV("#2DB8FF", "#1259B8"),
        hoverBackgroundColor: gradV("#6FE6FF", "#2B7BE0"),
      }],
    },
    options: {
      responsive: true, maintainAspectRatio: false, layout: { padding: { top: 14 } },
      plugins: {
        tooltip: tooltipStyle(),
        datalabels: { ...labelBase, display: labels.length <= 14, anchor: "end", align: "end", offset: 3, formatter: (v) => fmt(v, decimals) },
        avgLine: avg === null ? {} : { value: avg, label: avgLabel },
      },
      scales: { x: scaleX(), y: scaleY(max * 1.22) },
    },
    plugins: [avgLine],
  });
}
function renderGrouped(id, labels, series, decimals = 0) {
  const max = Math.max(...series.flatMap((s) => s.data), 0);
  mount(id, {
    type: "bar",
    data: {
      labels,
      datasets: series.map((s) => ({
        label: s.label, data: s.data, backgroundColor: s.color,
        borderRadius: { topLeft: 6, topRight: 6 }, borderSkipped: false, maxBarThickness: 34,
      })),
    },
    options: {
      responsive: true, maintainAspectRatio: false, layout: { padding: { top: 12 } },
      plugins: {
        legend: { display: true, position: "bottom", labels: { color: C.dim, usePointStyle: true, pointStyle: "circle", boxWidth: 8, padding: 14 } },
        tooltip: tooltipStyle(),
        datalabels: { ...labelBase, display: labels.length * series.length <= 16, anchor: "end", align: "end", offset: 2, formatter: (v) => fmt(v, decimals) },
      },
      scales: { x: scaleX(), y: scaleY(max * 1.2) },
    },
  });
}
function renderHBar(id, labels, data, decimals = 0) {
  const max = Math.max(...data, 0);
  mount(id, {
    type: "bar",
    data: {
      labels,
      datasets: [{
        data, borderRadius: 6, borderSkipped: false, barThickness: 18,
        backgroundColor: gradH("#1259B8", "#22E3F2"),
      }],
    },
    options: {
      indexAxis: "y", responsive: true, maintainAspectRatio: false, layout: { padding: { right: 12 } },
      plugins: {
        tooltip: tooltipStyle(),
        datalabels: { ...labelBase, display: true, anchor: "end", align: "right", offset: 4, formatter: (v) => fmt(v, decimals) },
      },
      scales: {
        x: { ...scaleY(max * 1.18), ticks: { color: C.faint, callback: (v) => fmt(v), maxTicksLimit: 5 } },
        y: { grid: { display: false }, border: { display: false }, ticks: { color: C.text, callback(v) { return truncar(this.getLabelForValue(v), 24); } } },
      },
    },
  });
}
function renderDonut(id, labels, data, centerTitle, centerSub, decimals = 0) {
  const total = data.reduce((a, b) => a + Number(b), 0);
  const colores = labels.map((l, i) => (l === "Otros" ? C.other : PALETTE[i % PALETTE.length]));
  mount(id, {
    type: "doughnut",
    data: { labels, datasets: [{ data, backgroundColor: colores, borderColor: "#0B1223", borderWidth: 3, hoverOffset: 5 }] },
    options: {
      responsive: true, maintainAspectRatio: false, cutout: "68%",
      plugins: {
        tooltip: {
          ...tooltipStyle(),
          callbacks: { label: (c) => ` ${c.label}: ${fmt(c.parsed, decimals)} (${total ? Math.round((c.parsed / total) * 100) : 0}%)` },
        },
        datalabels: {
          ...labelBase, display: (c) => total > 0 && c.dataset.data[c.dataIndex] / total >= 0.06,
          color: "#04101C", font: { family: "'IBM Plex Sans', sans-serif", weight: "700", size: 11 },
          formatter: (v) => Math.round((v / total) * 100) + "%",
        },
        centerText: { title: centerTitle, sub: centerSub },
      },
    },
    plugins: [centerText],
  });
  const lg = $(id + "Legend");
  if (lg) {
    lg.innerHTML = labels.map((l, i) =>
      `<div class="legend-item"><i style="background:${colores[i]}"></i><span title="${l}">${truncar(l, 22)}</span><b>${total ? Math.round((data[i] / total) * 100) : 0}%</b></div>`
    ).join("");
  }
}
function renderArea(id, labels, datasets, { decimals = 0, avg = null, avgLabel = "" } = {}) {
  const maxAll = Math.max(...datasets.flatMap((d) => d.data), 0);
  mount(id, {
    type: "line",
    data: {
      labels,
      datasets: datasets.map((d) => {
        const mx = argmax(d.data), mn = argmin(d.data), last = d.data.length - 1;
        const marcados = new Set([mx, mn, last]);
        return {
          label: d.label, data: d.data, borderColor: d.color, borderWidth: 2.5, tension: 0.35, fill: true,
          backgroundColor: (ctx) => {
            const a = ctx.chart.chartArea;
            if (!a) return hexRgba(d.color, 0.15);
            const g = ctx.chart.ctx.createLinearGradient(0, a.top, 0, a.bottom);
            g.addColorStop(0, hexRgba(d.color, d.soft ? 0.12 : 0.34)); g.addColorStop(1, hexRgba(d.color, 0));
            return g;
          },
          pointBackgroundColor: d.color, pointBorderColor: "#0B1223", pointBorderWidth: 2,
          pointRadius: (c) => (marcados.has(c.dataIndex) ? 4.5 : 0), pointHoverRadius: 5,
          datalabels: {
            ...labelBase, display: (c) => marcados.has(c.dataIndex) && (d.labelAll || c.dataIndex === mx || c.dataIndex === mn || c.dataIndex === last),
            align: (c) => (c.dataIndex === mn && mn !== mx ? "bottom" : "top"), anchor: "center", offset: 9, clamp: true,
            backgroundColor: "rgba(7, 11, 22, 0.92)", borderColor: d.color, borderWidth: 1, borderRadius: 6,
            padding: { top: 3, bottom: 3, left: 6, right: 6 }, formatter: (v) => fmt(v, decimals),
          },
        };
      }),
    },
    options: {
      responsive: true, maintainAspectRatio: false, layout: { padding: { top: 24, right: 10 } },
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: { display: datasets.length > 1, position: "bottom", labels: { color: C.dim, usePointStyle: true, pointStyle: "circle", boxWidth: 8, padding: 14 } },
        tooltip: tooltipStyle(),
        avgLine: avg === null ? {} : { value: avg, label: avgLabel },
      },
      scales: { x: scaleX(), y: scaleY(maxAll * 1.15) },
    },
    plugins: [avgLine],
  });
}

/* ---------- Plantillas ---------- */
function heroCard({ title, value, unit, badge, note }) {
  return `
    <article class="card hero span-3">
      <span class="eyebrow">Indicador principal</span>
      <h3>${title}</h3>
      <div class="hero-val">${value}<small>${unit}</small></div>
      <p class="hero-note">${note}</p>
      <span class="pill pill-orange">${badge}</span>
    </article>`;
}
function kpiCard({ icon, tone, title, value, unit, pct, barLabel, foot }) {
  return `
    <article class="card kpi tone-${tone} span-3">
      <div class="kpi-head"><span class="kpi-ico"><i class="fas ${icon}"></i></span><h3>${title}</h3></div>
      <div class="kpi-val">${value}<small>${unit}</small></div>
      <div class="bar"><i style="width:${clamp(pct)}%"></i></div>
      <div class="kpi-foot"><span>${barLabel}</span><b>${fmt(pct, 1)}%</b></div>
      <p class="kpi-note">${foot}</p>
    </article>`;
}
function plotCard(id, titulo, sub, span, size = "") {
  return `
    <article class="card span-${span}">
      <div class="card-head"><h3>${titulo}</h3><p>${sub}</p></div>
      <div class="plot ${size}"><canvas id="${id}"></canvas>
        <div class="plot-empty"><i class="fas fa-chart-simple"></i><span>Sin datos para mostrar</span></div></div>
    </article>`;
}
function donutCard(id, titulo, sub, span) {
  return `
    <article class="card span-${span}">
      <div class="card-head"><h3>${titulo}</h3><p>${sub}</p></div>
      <div class="plot donut"><canvas id="${id}"></canvas>
        <div class="plot-empty"><i class="fas fa-chart-pie"></i><span>Sin datos para mostrar</span></div></div>
      <div class="legend" id="${id}Legend"></div>
    </article>`;
}
function slotCard(id, titulo, sub, span, inner = "") {
  return `
    <article class="card span-${span}">
      <div class="card-head"><h3>${titulo}</h3><p>${sub}</p></div>
      <div id="${id}" class="${inner}"></div>
    </article>`;
}
function footCard(key, texto) {
  return `
    <footer class="card foot span-12">
      <div><h4>Metodología y fuentes</h4><p id="${key}Nota">${texto}</p></div>
      <div class="foot-side">
        <span class="foot-ref">Origen: <b id="${key}Origen">Supabase</b></span>
        <button type="button" class="btn-export js-export"><i class="fas fa-file-arrow-down"></i> Exportar CSV</button>
      </div>
    </footer>`;
}
function medidores(id, entradas, total, unidad, decimals = 0) {
  const el = $(id);
  if (!entradas.length) { el.innerHTML = `<div class="plot-empty" style="display:flex;position:static;min-height:120px"><i class="fas fa-chart-simple"></i><span>Sin datos para mostrar</span></div>`; return; }
  const max = Math.max(...entradas.map((e) => e[1]), 1);
  const N = 12;
  el.innerHTML = entradas.map(([n, v], i) => {
    const on = Math.max(1, Math.round((v / max) * N));
    const color = PALETTE[i % PALETTE.length];
    const share = total ? Math.round((v / total) * 100) : 0;
    return `<div class="seg-row" style="--c:${color}">
      <span class="seg-name" title="${n}">${truncar(n, 20)}</span>
      <div class="segs">${Array.from({ length: N }, (_, k) => `<i class="${k < on ? "on" : ""}"></i>`).join("")}</div>
      <span class="seg-pill">${fmt(v, decimals)}${unidad} · ${share}%</span>
    </div>`;
  }).join("");
}
function tabla(encabezados, filas) {
  return `<div class="tbl-wrap"><table class="tbl"><thead><tr>${encabezados
    .map((h) => `<th class="${h.num ? "num" : ""}">${h.t}</th>`).join("")}</tr></thead><tbody>${
    filas.map((f) => `<tr>${f.map((c, i) => `<td class="${encabezados[i].num ? "num" : ""} ${i === 0 ? "name" : ""}">${c}</td>`).join("")}</tr>`).join("")
  }</tbody></table></div>`;
}
const shareCell = (pct, ancho, tone = "cyan") =>
  `<div class="share"><div class="bar" style="--tone:var(--${tone})"><i style="width:${clamp(ancho)}%"></i></div><b>${fmt(pct, 1)}%</b></div>`;

function llenarSelect(id, data, columna, etiquetaTodos) {
  const select = $(id);
  if (!select) return;
  select.innerHTML = `<option value="">${etiquetaTodos}</option>`;
  if (!columna) return;
  const valores = [...new Set(data.map((f) => norm(f[columna])).filter((v) => v !== ""))];
  valores.sort((a, b) => a.localeCompare(b, "es", { numeric: true }));
  valores.forEach((v) => {
    const opt = document.createElement("option");
    opt.value = v; opt.textContent = v;
    select.appendChild(opt);
  });
}

/* ---------- Esqueleto (se arma una sola vez) ---------- */
function construirLayout() {
  $("gridExplosivos").innerHTML = [
    `<div class="contents" id="kpiExplosivos"></div>`,
    donutCard("eVeta", "Distribución por veta", "Participación de pies perforados", 4),
    plotCard("eNivel", "Taladros por nivel", "Taladros perforados, con promedio", 4),
    plotCard("eGuardia", "Pies por guardia y turno", "Comparativo de rendimiento", 4),
    plotCard("eAvance", "Avance diario", "Metros por día, con promedio y extremos", 8),
    slotCard("eLaborSeg", "Taladros por labor", "Principales labores del periodo", 4, "segs-list"),
    slotCard("ePerfTable", "Ranking de perforistas", "Top 10 por pies perforados", 12),
    footCard("explosivos", ""),
  ].join("");

  $("gridProduccion").innerHTML = [
    `<div class="contents" id="kpiProduccion"></div>`,
    donutCard("pEquipo", "TMS por equipo", "Participación en toneladas secas", 4),
    plotCard("pTransp", "TMS por transportista", "Principales 8 transportistas", 4, "tall"),
    plotCard("pH2O", "% H₂O promedio por fecha", "Humedad de ingreso, con promedio", 4, "tall"),
    plotCard("pTMH", "TMS vs TMH por fecha", "Toneladas métricas secas y húmedas por día", 8),
    slotCard("pEquipoSeg", "Viajes por equipo", "Registros del periodo", 4, "segs-list"),
    slotCard("pTranspTable", "Desempeño por transportista", "Viajes, toneladas y humedad", 12),
    footCard("produccion", ""),
  ].join("");
}

/* ---------- Columnas ---------- */
function resolverColumnas() {
  const e = state.explosivos, p = state.produccion;
  cols.e = {
    taladros: col(e, "TALADROS PERFORADOS"), cargados: col(e, "N° TALADROS CARGADOS"),
    pies: col(e, "PIES PERFORADOS"), metros: col(e, "METROS PERFORADOS"), avance: col(e, "AVANCE (m)"),
    anfo: col(e, "ANFO (Kg) (25)"), emul5: col(e, "EMULNOR 5000"), emul3: col(e, "EMULNOR 3000"),
    turno: col(e, "TURNO"), guardia: col(e, "GUARDIA"), nivel: col(e, "NIVEL"), veta: col(e, "VETA"),
    perforista: col(e, "PERFORISTA-SCOOPERO-MOTORISTA-PALERO"), labor: col(e, "LABOR DENOMINACION"), fecha: col(e, "FECHA"),
  };
  cols.p = {
    tms: col(p, "TMS"), tmh: col(p, "TMH"), h2o: col(p, "% H2O  INGRESO"),
    transp: col(p, "TRANSPORTISTA"), equipo: col(p, "EQUIPO"), fecha: col(p, "FECHA"),
  };
}

/* ---------- Render: Explosivos ---------- */
function renderExplosivos(data) {
  const c = cols.e;
  let tal = 0, carg = 0, pies = 0, metros = 0, avance = 0, anfo = 0, emul = 0;
  data.forEach((f) => {
    tal += num(f[c.taladros]); carg += num(f[c.cargados]);
    pies += num(f[c.pies]); metros += num(f[c.metros]); avance += num(f[c.avance]);
    anfo += num(f[c.anfo]); emul += num(f[c.emul5]) + num(f[c.emul3]);
  });
  const av = porFecha(data, c.fecha, (f) => num(f[c.avance]));
  const dias = av.values.length;
  const avgDia = dias ? avance / dias : 0;
  const mi = dias ? argmax(av.values) : 0;

  const turnoPies = sumBy(data, (f) => norm(f[c.turno]) || "Sin turno", (f) => num(f[c.pies]));
  const turnoTop = Object.entries(turnoPies).sort((a, b) => b[1] - a[1])[0] || ["—", 0];
  const kgTotal = anfo + emul;

  $("kpiExplosivos").innerHTML = [
    heroCard({
      title: "Avance total del periodo", value: fmt(avance, 2), unit: "m",
      note: dias ? `Promedio diario: ${fmt(avgDia, 1)} m en ${dias} días` : "Sin fechas registradas",
      badge: dias ? `Mejor día: ${av.labels[mi]} · ${fmt(av.values[mi], 1)} m` : "Sin datos",
    }),
    kpiCard({
      icon: "fa-bullseye", tone: "blue", title: "Taladros perforados", value: fmt(tal), unit: "",
      pct: tal ? (carg / tal) * 100 : 0, barLabel: "Taladros cargados",
      foot: `${fmt(carg)} de ${fmt(tal)} taladros cargados`,
    }),
    kpiCard({
      icon: "fa-ruler-combined", tone: "green", title: "Pies perforados", value: fmt(pies), unit: "pies",
      pct: pies ? (turnoTop[1] / pies) * 100 : 0, barLabel: `Turno líder: ${truncar(turnoTop[0], 14)}`,
      foot: `${fmt(metros, 1)} m perforados · ${fmt(tal ? pies / tal : 0, 1)} pies por taladro`,
    }),
    kpiCard({
      icon: "fa-bomb", tone: "purple", title: "ANFO + Emulnor", value: fmt(kgTotal), unit: "kg",
      pct: kgTotal ? (anfo / kgTotal) * 100 : 0, barLabel: "ANFO",
      foot: `Emulnor ${fmt(emul)} kg · ${fmt(tal ? kgTotal / tal : 0, 2)} kg por taladro`,
    }),
  ].join("");

  // Veta (dona con total al centro)
  const veta = topN(sumBy(data, (f) => norm(f[c.veta]) || "Sin veta", (f) => num(f[c.pies])), 4);
  renderDonut("eVeta", veta.map((v) => v[0]), veta.map((v) => round(v[1])), fmt(pies), "pies perforados", 1);

  // Nivel (columnas con promedio)
  const nivel = sumBy(data, (f) => norm(f[c.nivel]) || "Sin nivel", (f) => num(f[c.taladros]));
  const nivKeys = Object.keys(nivel).sort((a, b) => a.localeCompare(b, "es", { numeric: true }));
  const nivVals = nivKeys.map((k) => nivel[k]);
  const nivAvg = nivVals.length ? nivVals.reduce((a, b) => a + b, 0) / nivVals.length : 0;
  renderColumns("eNivel", nivKeys, nivVals, { avg: nivAvg, avgLabel: `Prom. ${fmt(nivAvg, 0)}` });

  // Guardia × turno (columnas agrupadas)
  const guardias = [...new Set(data.map((f) => norm(f[c.guardia]) || "Sin guardia"))].sort((a, b) => a.localeCompare(b, "es", { numeric: true }));
  const turnos = Object.keys(turnoPies).sort((a, b) => turnoPies[b] - turnoPies[a]).slice(0, 3);
  const colTurno = [C.cyan, C.orange, C.purple];
  const gt = {};
  data.forEach((f) => {
    const g = norm(f[c.guardia]) || "Sin guardia", t = norm(f[c.turno]) || "Sin turno";
    gt[g + "|" + t] = (gt[g + "|" + t] || 0) + num(f[c.pies]);
  });
  renderGrouped("eGuardia", guardias,
    turnos.map((t, i) => ({ label: t, color: colTurno[i], data: guardias.map((g) => round(gt[g + "|" + t] || 0)) })), 0);

  // Avance diario (área)
  renderArea("eAvance", av.labels,
    [{ label: "Avance (m)", color: C.cyan, data: av.values.map((v) => round(v, 2)) }],
    { decimals: 1, avg: dias ? avgDia : null, avgLabel: `Prom. ${fmt(avgDia, 1)} m` });

  // Labores (medidores)
  const labor = topN(sumBy(data, (f) => norm(f[c.labor]) || "Sin labor", (f) => num(f[c.taladros])), 6, false);
  medidores("eLaborSeg", labor, tal, "");

  // Ranking de perforistas (tabla)
  const agg = {};
  data.forEach((f) => {
    const p = norm(f[c.perforista]) || "Sin nombre";
    if (p === "0") return;
    const a = (agg[p] = agg[p] || { pies: 0, tal: 0, av: 0 });
    a.pies += num(f[c.pies]); a.tal += num(f[c.taladros]); a.av += num(f[c.avance]);
  });
  const rank = Object.entries(agg).sort((a, b) => b[1].pies - a[1].pies).slice(0, 10);
  const maxPies = rank.length ? rank[0][1].pies : 1;
  const ratioGlobal = tal ? pies / tal : 0;
  $("ePerfTable").innerHTML = rank.length
    ? tabla(
        [{ t: "Perforista" }, { t: "Pies", num: 1 }, { t: "Taladros", num: 1 }, { t: "Avance (m)", num: 1 }, { t: "Pies / taladro", num: 1 }, { t: "Participación" }],
        rank.map(([n, a]) => {
          const r = a.tal ? a.pies / a.tal : 0;
          return [
            n, fmt(a.pies), fmt(a.tal), fmt(a.av, 2),
            `<span class="pill ${r >= ratioGlobal ? "pill-green" : "pill-amber"}">${fmt(r, 1)}</span>`,
            shareCell(pies ? (a.pies / pies) * 100 : 0, (a.pies / maxPies) * 100),
          ];
        })
      )
    : `<div class="plot-empty" style="display:flex;position:static;min-height:120px"><i class="fas fa-chart-simple"></i><span>Sin datos para mostrar</span></div>`;

  $("explosivosNota").textContent =
    `Datos de la hoja EXPLOSIVOS (${fmt(data.length)} registros en el filtro actual). Las sumas ignoran valores no numéricos. ` +
    `El verde en "Pies / taladro" indica rendimiento igual o superior al promedio general (${fmt(ratioGlobal, 1)}).`;
}

/* ---------- Render: Producción ---------- */
function renderProduccion(data) {
  const c = cols.p;
  let tms = 0, tmh = 0, h2oSum = 0, nH = 0;
  data.forEach((f) => {
    tms += num(f[c.tms]); tmh += num(f[c.tmh]);
    const h = num(f[c.h2o]);
    if (h > 0) { h2oSum += h; nH++; }
  });
  const promH = nH ? h2oSum / nH : 0;
  let hMin = Infinity, hMax = 0, sobre = 0;
  data.forEach((f) => {
    const h = num(f[c.h2o]);
    if (h > 0) { hMin = Math.min(hMin, h); hMax = Math.max(hMax, h); if (h > promH) sobre++; }
  });
  if (!nH) hMin = 0;

  const tmsF = porFecha(data, c.fecha, (f) => num(f[c.tms]));
  const dias = tmsF.values.length;
  const avgDia = dias ? tms / dias : 0;
  const mi = dias ? argmax(tmsF.values) : 0;

  const viajesTransp = sumBy(data, (f) => norm(f[c.transp]) || "Sin transportista", () => 1);
  const lider = Object.entries(viajesTransp).sort((a, b) => b[1] - a[1])[0] || ["—", 0];

  $("kpiProduccion").innerHTML = [
    heroCard({
      title: "TMS total del periodo", value: fmt(tms, 1), unit: "t",
      note: dias ? `Promedio diario: ${fmt(avgDia, 1)} t en ${dias} días` : "Sin fechas registradas",
      badge: dias ? `Mejor día: ${tmsF.labels[mi]} · ${fmt(tmsF.values[mi], 1)} t` : "Sin datos",
    }),
    kpiCard({
      icon: "fa-scale-balanced", tone: "blue", title: "TMH total", value: fmt(tmh, 1), unit: "t",
      pct: tmh ? (tms / tmh) * 100 : 0, barLabel: "Fracción seca (TMS / TMH)",
      foot: `${fmt(tmh - tms, 1)} t de humedad retenida`,
    }),
    kpiCard({
      icon: "fa-droplet", tone: "green", title: "% H₂O promedio", value: promH.toFixed(2), unit: "%",
      pct: nH ? (sobre / nH) * 100 : 0, barLabel: "Viajes sobre el promedio",
      foot: `Mínimo ${fmt(hMin, 2)}% · Máximo ${fmt(hMax, 2)}%`,
    }),
    kpiCard({
      icon: "fa-truck", tone: "purple", title: "Viajes / registros", value: fmt(data.length), unit: "",
      pct: data.length ? (lider[1] / data.length) * 100 : 0, barLabel: `Líder: ${truncar(lider[0], 16)}`,
      foot: `${fmt(data.length ? tms / data.length : 0, 1)} t secas por viaje`,
    }),
  ].join("");

  // Equipo (dona)
  const equipo = topN(sumBy(data, (f) => norm(f[c.equipo]) || "Sin equipo", (f) => num(f[c.tms])), 4);
  renderDonut("pEquipo", equipo.map((e) => e[0]), equipo.map((e) => round(e[1], 1)), fmt(tms, 0), "TMS totales", 1);

  // Transportistas (barras horizontales)
  const transp = topN(sumBy(data, (f) => norm(f[c.transp]) || "Sin transportista", (f) => num(f[c.tms])), 8, false);
  renderHBar("pTransp", transp.map((t) => t[0]), transp.map((t) => round(t[1], 1)), 0);

  // Humedad por fecha (área con promedio)
  const hF = porFecha(data, c.fecha, (f) => num(f[c.h2o]), "avg");
  renderArea("pH2O", hF.labels,
    [{ label: "% H₂O", color: C.green, data: hF.values.map((v) => round(v, 2)) }],
    { decimals: 1, avg: nH ? promH : null, avgLabel: `Prom. ${fmt(promH, 2)}%` });

  // TMS vs TMH (dos áreas)
  const tmhF = porFecha(data, c.fecha, (f) => num(f[c.tmh]));
  renderArea("pTMH", tmsF.labels, [
    { label: "TMH", color: C.orange, soft: true, data: tmhF.values.map((v) => round(v, 1)) },
    { label: "TMS", color: C.cyan, data: tmsF.values.map((v) => round(v, 1)) },
  ], { decimals: 0 });

  // Viajes por equipo (medidores)
  const viajesEq = topN(sumBy(data, (f) => norm(f[c.equipo]) || "Sin equipo", () => 1), 6, false);
  medidores("pEquipoSeg", viajesEq, data.length, "");

  // Desempeño por transportista (tabla)
  const agg = {};
  data.forEach((f) => {
    const t = norm(f[c.transp]) || "Sin transportista";
    const a = (agg[t] = agg[t] || { v: 0, tms: 0, h: 0, nh: 0 });
    a.v++; a.tms += num(f[c.tms]);
    const h = num(f[c.h2o]);
    if (h > 0) { a.h += h; a.nh++; }
  });
  const rank = Object.entries(agg).sort((a, b) => b[1].tms - a[1].tms).slice(0, 10);
  const maxT = rank.length ? rank[0][1].tms : 1;
  $("pTranspTable").innerHTML = rank.length
    ? tabla(
        [{ t: "Transportista" }, { t: "Viajes", num: 1 }, { t: "TMS", num: 1 }, { t: "TMS / viaje", num: 1 }, { t: "% H₂O prom.", num: 1 }, { t: "Participación" }],
        rank.map(([n, a]) => {
          const h = a.nh ? a.h / a.nh : 0;
          return [
            n, fmt(a.v), fmt(a.tms, 1), fmt(a.v ? a.tms / a.v : 0, 1),
            `<span class="pill ${h <= promH ? "pill-green" : "pill-amber"}">${fmt(h, 2)}%</span>`,
            shareCell(tms ? (a.tms / tms) * 100 : 0, (a.tms / maxT) * 100, "orange"),
          ];
        })
      )
    : `<div class="plot-empty" style="display:flex;position:static;min-height:120px"><i class="fas fa-chart-simple"></i><span>Sin datos para mostrar</span></div>`;

  $("produccionNota").textContent =
    `Datos de la hoja B.Datos Produccion (${fmt(data.length)} registros en el filtro actual). El % H₂O se promedia solo sobre valores mayores a cero. ` +
    `El verde en la humedad indica un transportista igual o por debajo del promedio general (${fmt(promH, 2)}%).`;
}

/* ---------- Filtros ---------- */
const SECCIONES = {
  explosivos: {
    datos: () => state.explosivos, render: renderExplosivos, fecha: () => cols.e.fecha,
    badge: "badgeExplosivos", clear: "clearExplosivos",
    filtros: [
      { id: "filterTurnoE", col: () => cols.e.turno, todos: "Todos" },
      { id: "filterGuardiaE", col: () => cols.e.guardia, todos: "Todas" },
      { id: "filterNivelE", col: () => cols.e.nivel, todos: "Todos" },
      { id: "filterVetaE", col: () => cols.e.veta, todos: "Todas" },
    ],
  },
  produccion: {
    datos: () => state.produccion, render: renderProduccion, fecha: () => cols.p.fecha,
    badge: "badgeProduccion", clear: "clearProduccion",
    filtros: [
      { id: "filterTransportistaP", col: () => cols.p.transp, todos: "Todos" },
      { id: "filterEquipoP", col: () => cols.p.equipo, todos: "Todos" },
    ],
  },
};

function actualizarChips() {
  const s = SECCIONES[seccionActual];
  const filtrado = ultimo[seccionActual];
  const total = s.datos().length;
  const activos = s.filtros.filter((f) => $(f.id).value).length;
  $("chipPeriodo").textContent = rangoFechas(filtrado, s.fecha());
  $("chipAlcance").textContent = activos
    ? `${fmt(filtrado.length)} de ${fmt(total)} registros`
    : `${fmt(total)} registros`;
}

function aplicar(key) {
  const s = SECCIONES[key];
  const activos = s.filtros
    .map((f) => ({ col: f.col(), val: $(f.id).value }))
    .filter((f) => f.val);
  s.filtros.forEach((f) => $(f.id).classList.toggle("is-active", !!$(f.id).value));

  const total = s.datos();
  const filtrado = activos.length ? total.filter((r) => activos.every((a) => norm(r[a.col]) === a.val)) : total;
  ultimo[key] = filtrado;
  s.render(filtrado);

  const badge = $(s.badge);
  badge.textContent = activos.length;
  badge.hidden = activos.length === 0;
  if (key === seccionActual) actualizarChips();
}

function prepararFiltros(key) {
  const s = SECCIONES[key];
  s.filtros.forEach((f) => llenarSelect(f.id, s.datos(), f.col(), f.todos));
}

/* ---------- Exportar CSV ---------- */
function exportarCSV() {
  const filas = ultimo[seccionActual];
  if (!filas.length) return;
  const cab = Object.keys(filas[0]);
  const esc = (v) => {
    const s = v === null || v === undefined ? "" : String(v);
    return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = [cab.map(esc).join(","), ...filas.map((r) => cab.map((k) => esc(r[k])).join(","))].join("\n");
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `${seccionActual}_${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

/* ---------- Eventos ---------- */
function engancharEventos() {
  if (listenersReady) return;
  listenersReady = true;

  Object.entries(SECCIONES).forEach(([key, s]) => {
    s.filtros.forEach((f) => $(f.id).addEventListener("change", () => aplicar(key)));
    $(s.clear).addEventListener("click", () => {
      s.filtros.forEach((f) => ($(f.id).value = ""));
      aplicar(key);
    });
  });

  document.querySelectorAll("#dashTabs .tab").forEach((tab) =>
    tab.addEventListener("click", (e) => { e.preventDefault(); cambiarSeccion(tab.dataset.seccion); })
  );
  document.querySelectorAll(".js-export").forEach((b) => b.addEventListener("click", exportarCSV));
  document.querySelectorAll(".js-refresh").forEach((b) =>
    b.addEventListener("click", async () => {
      document.querySelectorAll(".js-refresh").forEach((x) => { x.disabled = true; x.classList.add("is-loading"); });
      try { await cargarTodo(); } catch (err) { console.error(err); }
      document.querySelectorAll(".js-refresh").forEach((x) => { x.disabled = false; x.classList.remove("is-loading"); });
    })
  );
}

/* ---------- Navegación ---------- */
function cambiarSeccion(seccion) {
  if (!SECCIONES[seccion]) seccion = "explosivos";
  seccionActual = seccion;
  document.querySelectorAll("#dashTabs .tab").forEach((t) => t.classList.toggle("active", t.dataset.seccion === seccion));
  Object.keys(SECCIONES).forEach((k) => { $(k).hidden = k !== seccion; });
  try { history.replaceState(null, "", "#" + seccion); } catch (e) { /* entorno sin historial */ }
  actualizarChips();
  requestAnimationFrame(() => Object.values(charts).forEach((ch) => ch.resize()));
}

/* ---------- Carga completa ---------- */
async function cargarTodo() {
  const [e, p] = await Promise.all([cargarHoja("EXPLOSIVOS"), cargarHoja("B.Datos Produccion")]);
  state.explosivos = e;
  state.produccion = p;
  resolverColumnas();
  Object.keys(SECCIONES).forEach(prepararFiltros);
  Object.keys(SECCIONES).forEach(aplicar);
  ultimaCarga = new Date();
  $("stRegistros").textContent = fmt(e.length + p.length);
  $("stSync").textContent = ultimaCarga.toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit" });
}

/* ---------- Inicio ---------- */
(async function init() {
  construirLayout();
  try {
    await cargarTodo();
    $("loading").hidden = true;
    $("topbar").hidden = false;
    $("shell").hidden = false;
    engancharEventos();
    cambiarSeccion(location.hash.replace("#", "") || "explosivos");
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
