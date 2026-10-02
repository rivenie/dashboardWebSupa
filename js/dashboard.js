const SUPABASE_URL = "https://qhqrnnkuhsaszonippnj.supabase.co";
const SUPABASE_KEY = "sb_publishable_aGjT0aecqNHf96Tm7QLMtw_qjCKs5n3";
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

Chart.register(ChartDataLabels);
Chart.defaults.plugins.datalabels = {
  color: "#3F6325",
  font: { family: "Inter", size: 10, weight: "600" },
  anchor: "end", align: "end", offset: 2, clamp: true,
};

let produccion = [];   // PRODUCCIÓN 2026
let molienda = [];     // MOLIENDA EXTRUSIÓN
let charts = {};

const COLORS = {
  primary: "#5C8A3A", primaryDark: "#3F6325", primaryLight: "#C7D9B0",
  accent: "#D9A93B", earth: "#8B6F47", orange: "#D97706",
  textDim: "#6E7A5C",
};
const PALETTE = [COLORS.primary, COLORS.accent, COLORS.primaryDark, COLORS.earth, COLORS.orange, COLORS.primaryLight];

["fechaActual1","fechaActual2","fechaActual3","fechaActual4"].forEach(id => {
  const el = document.getElementById(id);
  if (el) el.textContent = new Date().toLocaleDateString("es-PE", { day: "2-digit", month: "short", year: "numeric" });
});

// HELPERS
function col(data, clave) {
  if (!data || data.length === 0) return null;
  const keys = Object.keys(data[0]);
  return keys.find(k => k.trim().toLowerCase() === clave.trim().toLowerCase());
}
function norm(v) { return v !== undefined && v !== null ? v.toString().trim() : ""; }
function num(v) {
  if (typeof v === "number") return v;
  if (!v) return 0;
  return parseFloat(v.toString().replace(/[^0-9.-]/g, "")) || 0;
}
function tooltipStyle() {
  return { backgroundColor: "#3F6325", titleColor: "#FFFFFF", bodyColor: "#FFFFFF", borderColor: "#5C8A3A", borderWidth: 1, padding: 12, cornerRadius: 8 };
}
function prom(arr) {
  const vals = arr.filter(v => v !== 0);
  if (vals.length === 0) return 0;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

async function cargarHoja(nombre) {
  const TAMANO = 1000;
  let todos = [], desde = 0, seguir = true;
  while (seguir) {
    const { data, error } = await supabaseClient
      .from("dashboard_data").select("row_index, data")
      .eq("sheet_name", nombre).order("row_index", { ascending: true })
      .range(desde, desde + TAMANO - 1);
    if (error) throw error;
    if (data.length === 0) seguir = false;
    else { todos = todos.concat(data); desde += TAMANO; if (data.length < TAMANO) seguir = false; }
  }
  return todos.map(r => r.data);
}

// RENDER
function renderBar(id, labels, data, color) {
  const ctx = document.getElementById(id); if (!ctx) return;
  if (charts[id]) charts[id].destroy();
  charts[id] = new Chart(ctx, {
    type: "bar",
    data: { labels, datasets: [{ data, backgroundColor: color || COLORS.primary, borderRadius: 6, borderSkipped: false, maxBarThickness: 80, categoryPercentage: 0.7, barPercentage: 0.9 }] },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false }, tooltip: tooltipStyle(),
        datalabels: { anchor: "end", align: "top", formatter: v => Number(v).toLocaleString("es-PE", { maximumFractionDigits: 1 }) } },
      scales: {
        x: { ticks: { color: COLORS.textDim, font: { family: "Inter", size: 10 } }, grid: { display: false } },
        y: { beginAtZero: true, ticks: { color: COLORS.textDim }, grid: { color: "rgba(220, 229, 206, 0.7)" }, suggestedMax: Math.max(...data) * 1.15 }
      }
    }
  });
}
function renderHBar(id, labels, data, color) {
  const ctx = document.getElementById(id); if (!ctx) return;
  if (charts[id]) charts[id].destroy();
  const wrap = ctx.parentElement;
  if (labels.length > 12) { wrap.style.maxHeight = "500px"; wrap.style.overflowY = "auto"; ctx.style.height = labels.length * 34 + "px"; ctx.style.maxHeight = "none"; }
  charts[id] = new Chart(ctx, {
    type: "bar",
    data: { labels, datasets: [{ data, backgroundColor: color || COLORS.primary, borderRadius: 6, borderSkipped: false }] },
    options: {
      indexAxis: "y", responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false }, tooltip: tooltipStyle(),
        datalabels: { anchor: "end", align: "right", formatter: v => Number(v).toLocaleString("es-PE", { maximumFractionDigits: 1 }) } },
      scales: {
        x: { beginAtZero: true, ticks: { color: COLORS.textDim }, grid: { color: "rgba(220, 229, 206, 0.7)" } },
        y: { ticks: { color: COLORS.primaryDark, font: { family: "Inter", size: 10 } }, grid: { display: false } }
      }
    }
  });
}
function renderDoughnut(id, labels, data) {
  const ctx = document.getElementById(id); if (!ctx) return;
  if (charts[id]) charts[id].destroy();
  charts[id] = new Chart(ctx, {
    type: "doughnut",
    data: { labels, datasets: [{ data, backgroundColor: PALETTE.slice(0, labels.length), borderColor: "#FFFFFF", borderWidth: 3 }] },
    options: {
      responsive: true, maintainAspectRatio: false, cutout: "65%",
      animation: { duration: 1000, easing: "easeOutQuart" },
      plugins: {
        legend: { position: "bottom", labels: { color: COLORS.textDim, font: { family: "Inter", size: 11 }, padding: 12, usePointStyle: true, boxWidth: 8 } },
        tooltip: tooltipStyle(),
        datalabels: { color: "#FFFFFF", anchor: "center", align: "center",
          formatter: (v, ctx) => { const t = ctx.dataset.data.reduce((a, b) => a + Number(b), 0); const p = t > 0 ? (Number(v) / t) * 100 : 0; return p >= 4 ? v : ""; } }
      }
    }
  });
}
function renderLine(id, labels, datasets) {
  const ctx = document.getElementById(id); if (!ctx) return;
  if (charts[id]) charts[id].destroy();
  charts[id] = new Chart(ctx, {
    type: "line",
    data: { labels, datasets },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { position: "bottom", labels: { color: COLORS.textDim, font: { family: "Inter", size: 11 }, usePointStyle: true, boxWidth: 8 } },
        tooltip: tooltipStyle(),
        datalabels: { display: true, align: "top", anchor: "end", offset: 4, color: "#3F6325", font: { family: "Inter", size: 10, weight: "600" }, formatter: v => Number(v).toLocaleString("es-PE", { maximumFractionDigits: 0 }) } },
      scales: {
        x: { ticks: { color: COLORS.textDim, font: { family: "Inter", size: 10 } }, grid: { display: false } },
        y: { beginAtZero: true, ticks: { color: COLORS.textDim }, grid: { color: "rgba(220, 229, 206, 0.7)" } }
      }
    }
  });
}
function agruparYRender(data, id, columna, tipo, color) {
  if (!columna) return;
  const conteo = {};
  data.forEach(f => { const v = norm(f[columna]) || "Sin dato"; conteo[v] = (conteo[v] || 0) + 1; });
  const entries = Object.entries(conteo).sort((a, b) => b[1] - a[1]);
  const labels = entries.map(e => e[0]);
  const valores = entries.map(e => e[1]);
  const ctx = document.getElementById(id);
  if (!ctx) return;
  if (charts[id]) {
    charts[id].data.labels = labels;
    charts[id].data.datasets[0].data = valores;
    charts[id].update();
    return;
  }
  if (tipo === "bar") renderBar(id, labels, valores, color);
  else if (tipo === "hbar") renderHBar(id, labels, valores, color);
  else renderDoughnut(id, labels, valores);
}
function llenarSelect(id, data, columna) {
  const select = document.getElementById(id);
  if (!select || !columna) return;
  const labelInicial = select.dataset.label || select.options[0]?.text || "Opción";
  select.dataset.label = labelInicial;
  const valorActual = select.value;
  const valores = [...new Set(data.map(f => norm(f[columna])).filter(v => v !== ""))];
  select.innerHTML = `<option value="">${labelInicial}</option>`;
  valores.sort().forEach(v => {
    const opt = document.createElement("option");
    opt.value = v; opt.textContent = v;
    select.appendChild(opt);
  });
  if (valorActual && valores.includes(valorActual)) select.value = valorActual;
}
function marcarSegmentadorActivo(select) {
  if (!select) return;
  if (select.value) select.classList.add("activo");
  else select.classList.remove("activo");
}
function crearKPI(icono, clase, titulo, valor, sub) {
  return `<div class="kpi-card"><div class="kpi-icon-circle ${clase}"><i class="fas ${icono}"></i></div>
    <div class="kpi-content"><span class="kpi-title">${titulo}</span><span class="kpi-main">${valor}</span><span class="kpi-trend">${sub}</span></div></div>`;
}
function crearChart(id, icono, titulo, full = false) {
  return `<div class="chart-exec-card ${full ? "chart-full" : ""}"><div class="chart-exec-header"><i class="fas ${icono} chart-icon"></i><h3>${titulo}</h3></div><canvas id="${id}"></canvas></div>`;
}
function crearChartDonut(id, icono, titulo) {
  return `<div class="chart-exec-card"><div class="chart-exec-header"><i class="fas ${icono} chart-icon"></i><h3>${titulo}</h3></div><div class="chart-doughnut-wrapper"><canvas id="${id}"></canvas></div></div>`;
}
function crearChartTabla(icono, titulo, id) {
  return `<div class="chart-exec-card"><div class="chart-exec-header"><i class="fas ${icono} chart-icon"></i><h3>${titulo}</h3></div><div id="${id}" class="mini-table"></div></div>`;
}

// ============ RESUMEN ============
function renderResumen() {
  const data = produccion;
  const cProducto = col(data, "PRODUCTO");
  const cResponsable = col(data, "RESPONSABLE");
  const cKgProd = col(data, "KG. PRODUCIDOS");
  const cKgMerma = col(data, "KG. MERMA");
  const cKgMP = col(data, "KG. DE MP. CONSUMIDA REAL");
  const cHoras = col(data, "HORAS TRABAJADAS");
  const cTrab = col(data, "N° DE TRABAJADORES");
  const cFecha = col(data, "FECHA");

  ["rProducto","rResponsable","rMes","rFecha"].forEach(id => {
    if (charts[id]) { charts[id].destroy(); delete charts[id]; }
  });

  let totalKg = 0, totalMP = 0, totalMerma = 0, totalHoras = 0, totalTrab = 0;
  data.forEach(f => {
    totalKg += num(f[cKgProd]);
    totalMP += num(f[cKgMP]);
    totalMerma += num(f[cKgMerma]);
    totalHoras += num(f[cHoras]);
    totalTrab += num(f[cTrab]);
  });
  const rendimiento = totalMP > 0 ? (totalKg / totalMP) * 100 : 0;
  const pctMerma = totalMP > 0 ? (totalMerma / totalMP) * 100 : 0;

  document.getElementById("kpiResumen").innerHTML = `
    ${crearKPI("fa-weight-hanging", "", "KG Producidos", totalKg.toLocaleString("es-PE", { maximumFractionDigits: 1 }), "Total")}
    ${crearKPI("fa-wheat-awn", "icon-gold", "MP Consumida (Kg)", totalMP.toLocaleString("es-PE", { maximumFractionDigits: 1 }), "Real")}
    ${crearKPI("fa-recycle", "icon-orange", "Merma Total (Kg)", totalMerma.toLocaleString("es-PE", { maximumFractionDigits: 1 }), `${pctMerma.toFixed(2)}% de MP`)}
    ${crearKPI("fa-percent", "icon-gold", "Rendimiento", rendimiento.toFixed(2) + "%", "KG prod / MP")}
    ${crearKPI("fa-clock", "", "Horas Trabajadas", totalHoras.toLocaleString("es-PE"), "Total")}
  `;

  document.getElementById("chartsResumen").innerHTML = `
    ${crearChart("rProducto", "fa-boxes-stacked", "Producción por Producto")}
    ${crearChart("rResponsable", "fa-user-tie", "Producción por Responsable")}
    <div class="chart-exec-card chart-full">
      <div class="chart-exec-header"><i class="fas fa-calendar chart-icon"></i><h3>Evolución de Producción por Fecha</h3></div>
      <canvas id="rFecha"></canvas>
    </div>
    ${crearChart("rMes", "fa-calendar-alt", "Producción por Mes")}
    ${crearChartDonut("rTopProducto", "fa-cubes", "Top 5 Productos")}
  `;

  // Producción por producto
  const porProd = {};
  data.forEach(f => { const p = norm(f[cProducto]) || "Sin producto"; porProd[p] = (porProd[p] || 0) + num(f[cKgProd]); });
  const arrProd = Object.entries(porProd).sort((a, b) => b[1] - a[1]);
  renderHBar("rProducto", arrProd.map(p => p[0].substring(0, 30)), arrProd.map(p => +p[1].toFixed(1)), COLORS.primary);

  // Producción por responsable
  const porResp = {};
  data.forEach(f => { const r = norm(f[cResponsable]) || "Sin responsable"; porResp[r] = (porResp[r] || 0) + num(f[cKgProd]); });
  const arrResp = Object.entries(porResp).sort((a, b) => b[1] - a[1]);
  renderBar("rResponsable", arrResp.map(r => r[0]), arrResp.map(r => +r[1].toFixed(1)), COLORS.accent);

  // Evolución por fecha
  if (cFecha) {
    const porFecha = {};
    data.forEach(f => {
      const raw = norm(f[cFecha]);
      if (!raw) return;
      const fecha = raw.split(" ")[0];
      porFecha[fecha] = (porFecha[fecha] || 0) + num(f[cKgProd]);
    });
    const keys = Object.keys(porFecha).sort();
    renderLine("rFecha", keys, [{
      label: "KG Producidos", data: keys.map(k => +porFecha[k].toFixed(1)),
      borderColor: COLORS.primary, backgroundColor: "rgba(92, 138, 58, 0.15)",
      borderWidth: 3, tension: 0.4, pointRadius: 4, fill: true
    }]);

    // Producción por mes
    const porMes = {};
    data.forEach(f => {
      const raw = norm(f[cFecha]);
      if (!raw) return;
      const mes = raw.split(" ")[0].substring(0, 7);
      porMes[mes] = (porMes[mes] || 0) + num(f[cKgProd]);
    });
    const keysM = Object.keys(porMes).sort();
    const mesesAbrev = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Set","Oct","Nov","Dic"];
    const labelsM = keysM.map(k => { const [a, m] = k.split("-"); return mesesAbrev[parseInt(m) - 1] + " " + a.substring(2); });
    renderBar("rMes", labelsM, keysM.map(k => +porMes[k].toFixed(1)), COLORS.earth);
  }

  // Top 5 productos (donut)
  const top5 = arrProd.slice(0, 5);
  requestAnimationFrame(() => {
    renderDoughnut("rTopProducto", top5.map(p => p[0].substring(0, 15)), top5.map(p => +p[1].toFixed(1)));
  });

  llenarSelect("filterProductoR", data, cProducto);
  llenarSelect("filterResponsableR", data, cResponsable);

  ["filterProductoR","filterResponsableR"].forEach(id => {
    const sel = document.getElementById(id);
    if (sel && !sel.dataset.listener) {
      sel.addEventListener("change", () => { marcarSegmentadorActivo(sel); aplicarFiltrosResumen(); });
      sel.dataset.listener = "1";
    }
    marcarSegmentadorActivo(sel);
  });
}

function aplicarFiltrosResumen() {
  const prod = document.getElementById("filterProductoR").value;
  const resp = document.getElementById("filterResponsableR").value;
  const cProducto = col(produccion, "PRODUCTO");
  const cResponsable = col(produccion, "RESPONSABLE");
  const filtrado = produccion.filter(f => {
    if (prod && norm(f[cProducto]) !== prod) return false;
    if (resp && norm(f[cResponsable]) !== resp) return false;
    return true;
  });
  const backup = produccion; produccion = filtrado; renderResumen(); produccion = backup;
}

// ============ POR PRODUCTO ============
function renderProducto() {
  const data = produccion;
  const cProducto = col(data, "PRODUCTO");
  const cKgProd = col(data, "KG. PRODUCIDOS");
  const cKgMP = col(data, "KG. DE MP. CONSUMIDA REAL");
  const cKgMerma = col(data, "KG. MERMA");
  const cUnidades = col(data, "TOTAL DE UNIDADES PRODUCIDAD");
  const cPst = col(data, "PRST.");
  const cResponsable = col(data, "RESPONSABLE");

  ["pProdKg","pProdUni","pRendimiento","pMerma","pUnidadProm"].forEach(id => {
    if (charts[id]) { charts[id].destroy(); delete charts[id]; }
  });

  let totalKg = 0, totalUni = 0, totalMP = 0, totalMerma = 0;
  data.forEach(f => {
    totalKg += num(f[cKgProd]);
    totalUni += num(f[cUnidades]);
    totalMP += num(f[cKgMP]);
    totalMerma += num(f[cKgMerma]);
  });
  const rendimiento = totalMP > 0 ? (totalKg / totalMP) * 100 : 0;
  const pctMerma = totalMP > 0 ? (totalMerma / totalMP) * 100 : 0;

  document.getElementById("kpiProducto").innerHTML = `
    ${crearKPI("fa-cubes-stacked", "", "Total Unidades", totalUni.toLocaleString("es-PE"), "Producidas")}
    ${crearKPI("fa-weight-hanging", "icon-gold", "KG Producidos", totalKg.toLocaleString("es-PE", { maximumFractionDigits: 1 }), "Total")}
    ${crearKPI("fa-percent", "", "Rendimiento", rendimiento.toFixed(2) + "%", "KG / MP")}
    ${crearKPI("fa-recycle", "icon-orange", "Merma Prom.", pctMerma.toFixed(2) + "%", "Sobre MP")}
  `;

  document.getElementById("chartsProducto").innerHTML = `
    ${crearChart("pProdKg", "fa-weight-hanging", "KG Producidos por Producto", true)}
    ${crearChart("pProdUni", "fa-cubes", "Unidades Producidas por Producto", true)}
    ${crearChart("pRendimiento", "fa-percent", "Rendimiento por Producto")}
    ${crearChart("pMerma", "fa-recycle", "Merma por Producto")}
  `;

  // KG por producto
  const kgPorProd = {};
  const uniPorProd = {};
  const mpPorProd = {};
  const mermaPorProd = {};
  data.forEach(f => {
    const p = norm(f[cProducto]) || "Sin producto";
    kgPorProd[p] = (kgPorProd[p] || 0) + num(f[cKgProd]);
    uniPorProd[p] = (uniPorProd[p] || 0) + num(f[cUnidades]);
    mpPorProd[p] = (mpPorProd[p] || 0) + num(f[cKgMP]);
    mermaPorProd[p] = (mermaPorProd[p] || 0) + num(f[cKgMerma]);
  });

  const arrKg = Object.entries(kgPorProd).sort((a, b) => b[1] - a[1]).slice(0, 10);
  renderHBar("pProdKg", arrKg.map(p => p[0].substring(0, 25)), arrKg.map(p => +p[1].toFixed(1)), COLORS.primary);

  const arrUni = Object.entries(uniPorProd).sort((a, b) => b[1] - a[1]).slice(0, 10);
  renderHBar("pProdUni", arrUni.map(p => p[0].substring(0, 25)), arrUni.map(p => +p[1].toFixed(0)), COLORS.accent);

  // Rendimiento por producto
  const arrRend = Object.entries(kgPorProd).map(([p, kg]) => {
    const mp = mpPorProd[p] || 0;
    return [p, mp > 0 ? (kg / mp) * 100 : 0];
  }).sort((a, b) => b[1] - a[1]).slice(0, 10);
  renderBar("pRendimiento", arrRend.map(r => r[0].substring(0, 18)), arrRend.map(r => +r[1].toFixed(2)), COLORS.primaryDark);

  // Merma por producto
  const arrMerma = Object.entries(mermaPorProd).sort((a, b) => b[1] - a[1]).slice(0, 10);
  renderBar("pMerma", arrMerma.map(m => m[0].substring(0, 18)), arrMerma.map(m => +m[1].toFixed(2)), COLORS.orange);

  llenarSelect("filterProductoP", data, cProducto);
  llenarSelect("filterResponsableP", data, cResponsable);

  ["filterProductoP","filterResponsableP"].forEach(id => {
    const sel = document.getElementById(id);
    if (sel && !sel.dataset.listener) {
      sel.addEventListener("change", () => { marcarSegmentadorActivo(sel); aplicarFiltrosProducto(); });
      sel.dataset.listener = "1";
    }
    marcarSegmentadorActivo(sel);
  });
}

function aplicarFiltrosProducto() {
  const prod = document.getElementById("filterProductoP").value;
  const resp = document.getElementById("filterResponsableP").value;
  const cProducto = col(produccion, "PRODUCTO");
  const cResponsable = col(produccion, "RESPONSABLE");
  const filtrado = produccion.filter(f => {
    if (prod && norm(f[cProducto]) !== prod) return false;
    if (resp && norm(f[cResponsable]) !== resp) return false;
    return true;
  });
  const backup = produccion; produccion = filtrado; renderProducto(); produccion = backup;
}

// ============ MOLIENDA / EXTRUSIÓN ============
function renderProceso() {
  const data = molienda;
  const cProducto = col(data, "PRODUCTO");
  const cResponsable = col(data, "RESPONSABLE");
  const cKgProd = col(data, " KG PRODUCIDOS") || col(data, "KG PRODUCIDOS");
  const cKgMP = col(data, "PESO INICALKG");
  const cMerma = col(data, "MERMA");
  const cPerdida = col(data, "PERDIDA FUNDA");
  const cHumedad = col(data, "PERDIDA HUMEDAD");
  const cHoras = col(data, "HORAS TRABAJADAS");
  const cTrab = col(data, "N° DE TRABAJADORES");
  const cFecha = col(data, "FECHA");

  ["mProdKg","mMerma","mHumedad","mHoras","mTrabajador","mFecha"].forEach(id => {
    if (charts[id]) { charts[id].destroy(); delete charts[id]; }
  });

  let totalKg = 0, totalMP = 0, totalMerma = 0, totalPerdida = 0, totalHumedad = 0, totalHoras = 0, totalTrab = 0;
  data.forEach(f => {
    totalKg += num(f[cKgProd]);
    totalMP += num(f[cKgMP]);
    totalMerma += num(f[cMerma]);
    totalPerdida += num(f[cPerdida]);
    totalHumedad += num(f[cHumedad]);
    totalHoras += num(f[cHoras]);
    totalTrab += num(f[cTrab]);
  });
  const pctMerma = totalMP > 0 ? (totalMerma / totalMP) * 100 : 0;
  const pctHumedad = totalMP > 0 ? (totalHumedad / totalMP) * 100 : 0;
  const kgHora = totalHoras > 0 ? totalKg / totalHoras : 0;

  document.getElementById("kpiProceso").innerHTML = `
    ${crearKPI("fa-weight-hanging", "", "KG Producidos", totalKg.toLocaleString("es-PE", { maximumFractionDigits: 1 }), "Total")}
    ${crearKPI("fa-recycle", "icon-orange", "Merma Total", totalMerma.toLocaleString("es-PE", { maximumFractionDigits: 1 }) + " Kg", `${pctMerma.toFixed(2)}%`)}
    ${crearKPI("fa-droplet", "icon-gold", "Pérdida Humedad", totalHumedad.toLocaleString("es-PE", { maximumFractionDigits: 1 }) + " Kg", `${pctHumedad.toFixed(2)}%`)}
    ${crearKPI("fa-clock", "", "KG / Hora", kgHora.toFixed(1), `${totalHoras.toFixed(0)} horas`)}
    ${crearKPI("fa-users", "icon-gold", "Trabajadores", totalTrab, "Total acumulado")}
  `;

  document.getElementById("chartsProceso").innerHTML = `
    ${crearChart("mProdKg", "fa-weight-hanging", "KG Producidos por Producto")}
    ${crearChart("mMerma", "fa-recycle", "Merma por Producto")}
    ${crearChart("mHumedad", "fa-droplet", "Pérdida por Humedad por Producto")}
    ${crearChart("mHoras", "fa-clock", "Horas Trabajadas por Producto")}
    <div class="chart-exec-card chart-full">
      <div class="chart-exec-header"><i class="fas fa-calendar chart-icon"></i><h3>Evolución de Producción Diaria</h3></div>
      <canvas id="mFecha"></canvas>
    </div>
    ${crearChart("mTrabajador", "fa-user-tie", "KG Producidos por Responsable")}
  `;

  function agruparSum(colName) {
    const grupo = {};
    data.forEach(f => {
      const p = norm(f[cProducto]) || "Sin producto";
      grupo[p] = (grupo[p] || 0) + num(f[colName]);
    });
    return Object.entries(grupo).sort((a, b) => b[1] - a[1]);
  }

  const kgArr = agruparSum(cKgProd);
  renderHBar("mProdKg", kgArr.map(p => p[0].substring(0, 25)), kgArr.map(p => +p[1].toFixed(1)), COLORS.primary);

  const mermaArr = agruparSum(cMerma);
  renderHBar("mMerma", mermaArr.map(p => p[0].substring(0, 25)), mermaArr.map(p => +p[1].toFixed(2)), COLORS.orange);

  const humArr = agruparSum(cHumedad);
  renderHBar("mHumedad", humArr.map(p => p[0].substring(0, 25)), humArr.map(p => +p[1].toFixed(2)), COLORS.accent);

  const horasArr = agruparSum(cHoras);
  renderBar("mHoras", horasArr.map(p => p[0].substring(0, 15)), horasArr.map(p => +p[1].toFixed(1)), COLORS.earth);

  // Evolución diaria
  const porFecha = {};
  data.forEach(f => {
    const raw = norm(f[cFecha]);
    if (!raw) return;
    const fecha = raw.split(" ")[0];
    porFecha[fecha] = (porFecha[fecha] || 0) + num(f[cKgProd]);
  });
  const keys = Object.keys(porFecha).sort();
  renderLine("mFecha", keys, [{
    label: "KG Producidos", data: keys.map(k => +porFecha[k].toFixed(1)),
    borderColor: COLORS.primary, backgroundColor: "rgba(92, 138, 58, 0.15)",
    borderWidth: 3, tension: 0.4, pointRadius: 3, fill: true
  }]);

  // KG por responsable
  const porResp = {};
  data.forEach(f => { const r = norm(f[cResponsable]) || "Sin responsable"; porResp[r] = (porResp[r] || 0) + num(f[cKgProd]); });
  const arrResp = Object.entries(porResp).sort((a, b) => b[1] - a[1]);
  renderBar("mTrabajador", arrResp.map(r => r[0]), arrResp.map(r => +r[1].toFixed(1)), COLORS.primaryDark);

  llenarSelect("filterProductoM", data, cProducto);
  llenarSelect("filterResponsableM", data, cResponsable);

  ["filterProductoM","filterResponsableM"].forEach(id => {
    const sel = document.getElementById(id);
    if (sel && !sel.dataset.listener) {
      sel.addEventListener("change", () => { marcarSegmentadorActivo(sel); aplicarFiltrosProceso(); });
      sel.dataset.listener = "1";
    }
    marcarSegmentadorActivo(sel);
  });
}

function aplicarFiltrosProceso() {
  const prod = document.getElementById("filterProductoM").value;
  const resp = document.getElementById("filterResponsableM").value;
  const cProducto = col(molienda, "PRODUCTO");
  const cResponsable = col(molienda, "RESPONSABLE");
  const filtrado = molienda.filter(f => {
    if (prod && norm(f[cProducto]) !== prod) return false;
    if (resp && norm(f[cResponsable]) !== resp) return false;
    return true;
  });
  const backup = molienda; molienda = filtrado; renderProceso(); molienda = backup;
}

// ============ DETALLE ============
function renderDetalle() {
  const data = produccion;
  const cFecha = col(data, "FECHA");
  const cProducto = col(data, "PRODUCTO");
  const cPst = col(data, "PRST.");
  const cLote = col(data, "LOTE");
  const cUniPaq = col(data, "UNIDAD X PAQUETE");
  const cPaq = col(data, "PAQUETES PRODUCIDOS");
  const cUniSueltas = col(data, "UNIDADES SUELTAS");
  const cTotalUni = col(data, "TOTAL DE UNIDADES PRODUCIDAD");
  const cKgProd = col(data, "KG. PRODUCIDOS");
  const cKgMerma = col(data, "KG. MERMA");
  const cKgMP = col(data, "KG. DE MP. CONSUMIDA REAL");
  const cHoras = col(data, "HORAS TRABAJADAS");
  const cTrab = col(data, "N° DE TRABAJADORES");
  const cResp = col(data, "RESPONSABLE");

  let html = `<table><thead><tr>
    <th>Fecha</th><th>Producto</th><th>Lote</th><th>Prst.</th>
    <th>Paq.</th><th>Unid. Sueltas</th><th>Total Unid.</th>
    <th>KG Prod.</th><th>KG Merma</th><th>KG MP</th>
    <th>Horas</th><th>Trab.</th><th>Responsable</th>
  </tr></thead><tbody>`;
  data.forEach(f => {
    let fecha = norm(f[cFecha]);
    if (fecha.includes(" ")) fecha = fecha.split(" ")[0];
    html += `<tr>
      <td>${fecha || "-"}</td>
      <td><strong>${norm(f[cProducto]) || "-"}</strong></td>
      <td>${norm(f[cLote]) || "-"}</td>
      <td>${norm(f[cPst]) || "-"}</td>
      <td>${norm(f[cPaq]) || "-"}</td>
      <td>${norm(f[cUniSueltas]) || "-"}</td>
      <td>${norm(f[cTotalUni]) || "-"}</td>
      <td>${num(f[cKgProd]).toFixed(1)}</td>
      <td>${num(f[cKgMerma]).toFixed(2)}</td>
      <td>${num(f[cKgMP]).toFixed(1)}</td>
      <td>${norm(f[cHoras]) || "-"}</td>
      <td>${norm(f[cTrab]) || "-"}</td>
      <td>${norm(f[cResp]) || "-"}</td>
    </tr>`;
  });
  html += "</tbody></table>";
  document.getElementById("tablaDetalle").innerHTML = html;

  llenarSelect("filterProductoD", produccion, cProducto);
  llenarSelect("filterResponsableD", produccion, cResp);

  ["filterProductoD","filterResponsableD"].forEach(id => {
    const sel = document.getElementById(id);
    if (sel && !sel.dataset.listener) {
      sel.addEventListener("change", () => { marcarSegmentadorActivo(sel); aplicarFiltrosDetalle(); });
      sel.dataset.listener = "1";
    }
    marcarSegmentadorActivo(sel);
  });
}

function aplicarFiltrosDetalle() {
  const prod = document.getElementById("filterProductoD").value;
  const resp = document.getElementById("filterResponsableD").value;
  const cProducto = col(produccion, "PRODUCTO");
  const cResponsable = col(produccion, "RESPONSABLE");
  const filtrado = produccion.filter(f => {
    if (prod && norm(f[cProducto]) !== prod) return false;
    if (resp && norm(f[cResponsable]) !== resp) return false;
    return true;
  });
  const backup = produccion; produccion = filtrado; renderDetalle(); produccion = backup;
}

// ============ NAVEGACIÓN ============
function cambiarSeccion(seccion) {
  document.querySelectorAll("#dashTabs .tab").forEach(t => t.classList.toggle("active", t.dataset.seccion === seccion));
  ["resumen","producto","proceso","detalle"].forEach(s => {
    document.getElementById(s).style.display = s === seccion ? "block" : "none";
  });
}

// ============ INIT ============
(async function init() {
  try {
    produccion = await cargarHoja("PRODUCCION");
    molienda = await cargarHoja("MOLIENDA");

    document.getElementById("loading").style.display = "none";
    document.getElementById("dashTabs").style.display = "flex";
    document.getElementById("resumen").style.display = "block";

    if (produccion.length > 0) {
      renderResumen();
      renderProducto();
      renderDetalle();
    }
    if (molienda.length > 0) renderProceso();

    document.getElementById("clearResumen").addEventListener("click", () => {
      document.querySelectorAll("#resumen .filter-select").forEach(s => s.value = "");
      document.querySelectorAll("#resumen .filter-select").forEach(marcarSegmentadorActivo);
      renderResumen();
    });
    document.getElementById("clearProducto").addEventListener("click", () => {
      document.querySelectorAll("#producto .filter-select").forEach(s => s.value = "");
      document.querySelectorAll("#producto .filter-select").forEach(marcarSegmentadorActivo);
      renderProducto();
    });
    document.getElementById("clearProceso").addEventListener("click", () => {
      document.querySelectorAll("#proceso .filter-select").forEach(s => s.value = "");
      document.querySelectorAll("#proceso .filter-select").forEach(marcarSegmentadorActivo);
      renderProceso();
    });
    document.getElementById("clearDetalle").addEventListener("click", () => {
      document.querySelectorAll("#detalle .filter-select").forEach(s => s.value = "");
      document.querySelectorAll("#detalle .filter-select").forEach(marcarSegmentadorActivo);
      renderDetalle();
    });

    document.querySelectorAll("#dashTabs .tab").forEach(tab => {
      tab.addEventListener("click", (e) => {
        e.preventDefault();
        cambiarSeccion(tab.dataset.seccion);
      });
    });
  } catch (err) {
    console.error(err);
    document.getElementById("loading").innerHTML = `<p style="color:#D97706;">Error al cargar: ${err.message}</p>`;
  }
})();