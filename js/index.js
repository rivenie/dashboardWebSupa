/* =====================================================================
   index.js · Carga del Excel de voladuras → vista previa → publicación en Supabase
   ===================================================================== */
"use strict";

const CONFIG = {
  SUPABASE_URL: "https://ieblbnoyvppyiixtjgpk.supabase.co",
  SUPABASE_KEY: "sb_publishable_jDIyPv2xMqmOMrQr6oaHog_jec-bv6T",
  TABLE: "dashboard_data",
  SHEET_NAME: "VOLADURA_DATA",      // ← mismo valor que en dashboard.js
  DASHBOARD_URL: "dashboard.html",
  BUS: "core-dashboard",            // canal entre pestañas
  LS_UPLOAD: "core:lastUpload",
  LS_THEME: "core:theme",
};

// fetch sin caché: el navegador nunca reutiliza respuestas de Supabase
const noStoreFetch = (input, init = {}) => fetch(input, { ...init, cache: "no-store" });
const supabaseClient = supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_KEY, {
  global: { fetch: noStoreFetch },
  auth: { persistSession: false },
});

const $ = (id) => document.getElementById(id);
const el = {
  fileInput: $("excelFile"), dropzone: $("dropzone"),
  panelUpload: $("panelUpload"), panelReview: $("panelReview"), panelDone: $("panelDone"),
  progressBox: $("progressBox"), progressBar: $("progressBar"), progressLabel: $("progressLabel"),
  progressPct: $("progressPct"), progressTrack: $("progressTrack"),
  btnSubir: $("btnSubir"), mensaje: $("mensaje"),
};

const fmt = (v, d = 0) => Number(v || 0).toLocaleString("es-PE", { maximumFractionDigits: d, minimumFractionDigits: d });
const fmtMoney = (v) => "US$ " + fmt(v, 0);
const fmtT = (v) => fmt(v, 0) + " t";
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let estado = { workbook: null, file: null, hoja: null, payload: null };

/* ---------- Tema ---------- */
function setTheme(t) {
  document.documentElement.setAttribute("data-theme", t);
  try { localStorage.setItem(CONFIG.LS_THEME, t); } catch (_) {}
  const b = $("btnTheme");
  b.innerHTML = `<i class="fas ${t === "dark" ? "fa-sun" : "fa-moon"}"></i>`;
  b.title = t === "dark" ? "Cambiar a tema claro" : "Cambiar a tema oscuro";
}
$("btnTheme").addEventListener("click", () => setTheme(document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark"));
setTheme(document.documentElement.getAttribute("data-theme") || "light");

/* ---------- Navegación al dashboard (siempre con cache-buster) ---------- */
document.querySelectorAll(".js-go-dashboard").forEach((a) => {
  a.addEventListener("click", (e) => {
    e.preventDefault();
    window.location.href = `${CONFIG.DASHBOARD_URL}?t=${Date.now()}`;
  });
});
// Si se vuelve con "Atrás" desde el dashboard, el navegador puede mostrar una copia congelada.
window.addEventListener("pageshow", (e) => { if (e.persisted) cargarPublicado(); });
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") cargarPublicado(); });

/* ---------- Pasos ---------- */
function setPaso(n) {
  document.querySelectorAll("#steps .step").forEach((s) => {
    const k = +s.dataset.step;
    s.classList.toggle("is-current", k === n);
    s.classList.toggle("is-done", k < n);
  });
}

/* ---------- Progreso / mensajes ---------- */
function setProgreso(pct, label) {
  el.progressBox.hidden = false;
  el.progressBar.style.width = pct + "%";
  el.progressPct.textContent = Math.round(pct) + "%";
  el.progressTrack.setAttribute("aria-valuenow", Math.round(pct));
  if (label) el.progressLabel.textContent = label;
}
function ocultarProgreso(ms = 900) { setTimeout(() => { el.progressBox.hidden = true; }, ms); }

function mostrarMensaje(texto, tipo) {
  if (!texto) { el.mensaje.hidden = true; return; }
  el.mensaje.className = "mensaje " + tipo;
  el.mensaje.innerHTML = `<i class="fas ${tipo === "error" ? "fa-circle-exclamation" : "fa-circle-check"}"></i><span>${esc(texto)}</span>`;
  el.mensaje.hidden = false;
}

function toast(texto, tipo = "info", ms = 4200) {
  const t = document.createElement("div");
  t.className = `toast ${tipo}`;
  const ico = { ok: "fa-circle-check", error: "fa-circle-exclamation", info: "fa-circle-info" }[tipo];
  t.innerHTML = `<i class="fas ${ico}"></i><span>${esc(texto)}</span>`;
  $("toasts").appendChild(t);
  setTimeout(() => { t.classList.add("out"); setTimeout(() => t.remove(), 260); }, ms);
}

/* ---------- Estado publicado en Supabase ---------- */
function relTime(iso) {
  if (!iso) return "—";
  const d = new Date(iso), s = Math.round((Date.now() - d.getTime()) / 1000);
  if (isNaN(s)) return "—";
  if (s < 60) return "hace un momento";
  if (s < 3600) return `hace ${Math.round(s / 60)} min`;
  if (s < 86400) return `hace ${Math.round(s / 3600)} h`;
  return d.toLocaleDateString("es-PE", { day: "2-digit", month: "short", year: "numeric" });
}

async function cargarPublicado() {
  const card = $("publishedCard"), btn = $("btnPubRefresh");
  btn.classList.add("is-loading");
  try {
    // Solo trae la metadata (liviano); si la versión anterior no la tenía, trae el payload
    let { data, error } = await supabaseClient.from(CONFIG.TABLE)
      .select("row_index, meta:data->meta, kpis:data->kpis")
      .eq("sheet_name", CONFIG.SHEET_NAME)
      .order("row_index", { ascending: false }).limit(1);
    if (error) {
      ({ data, error } = await supabaseClient.from(CONFIG.TABLE).select("row_index, data")
        .eq("sheet_name", CONFIG.SHEET_NAME).order("row_index", { ascending: false }).limit(1));
      if (error) throw error;
      if (data && data[0]) data = [{ row_index: data[0].row_index, meta: data[0].data?.meta, kpis: data[0].data?.kpis }];
    }
    const row = data && data[0];
    card.classList.toggle("is-empty", !row);
    if (!row) {
      $("pubSub").textContent = "Todavía no hay datos publicados. Cargá un Excel para empezar.";
      $("pubRegistros").textContent = "0"; $("pubArchivo").textContent = "—"; $("pubFecha").textContent = "—";
      return;
    }
    const m = row.meta || {};
    $("pubSub").textContent = m.uploadedAt ? "Esto es lo que ve hoy el dashboard." : "Hay datos publicados con el formato anterior.";
    $("pubRegistros").textContent = fmt(m.registros ?? row.kpis?.registros ?? 0);
    $("pubArchivo").textContent = m.archivo || "—";
    $("pubArchivo").title = m.archivo || "";
    $("pubFecha").textContent = relTime(m.uploadedAt);
    $("pubFecha").title = m.uploadedAt ? new Date(m.uploadedAt).toLocaleString("es-PE") : "";
  } catch (err) {
    console.error(err);
    $("pubSub").textContent = "No se pudo consultar Supabase. Revisá tu conexión.";
    ["pubRegistros", "pubArchivo", "pubFecha"].forEach((id) => { $(id).textContent = "—"; });
  } finally {
    btn.classList.remove("is-loading");
  }
}
$("btnPubRefresh").addEventListener("click", cargarPublicado);

/* ---------- Worker ---------- */
function procesarEnWorker(rows) {
  return new Promise((resolve, reject) => {
    const worker = new Worker("js/worker.js?v=4.0.0");
    worker.onmessage = (e) => {
      worker.terminate();
      if (e.data.ok) resolve(e.data.resultado);
      else reject(new Error(e.data.error || "Error al procesar el archivo"));
    };
    worker.onerror = (err) => {
      worker.terminate();
      reject(new Error("Error del procesador: " + (err.message || "desconocido")));
    };
    worker.postMessage({ rows });
  });
}

/* ---------- Selección de archivo (clic o arrastrar) ---------- */
el.fileInput.addEventListener("change", (e) => { const f = e.target.files[0]; if (f) manejarArchivo(f); });
el.dropzone.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); el.fileInput.click(); } });
["dragenter", "dragover"].forEach((ev) => el.dropzone.addEventListener(ev, (e) => { e.preventDefault(); el.dropzone.classList.add("is-drag"); }));
["dragleave", "dragend"].forEach((ev) => el.dropzone.addEventListener(ev, (e) => {
  if (ev === "dragleave" && el.dropzone.contains(e.relatedTarget)) return;
  el.dropzone.classList.remove("is-drag");
}));
el.dropzone.addEventListener("drop", (e) => {
  e.preventDefault(); el.dropzone.classList.remove("is-drag");
  const f = e.dataTransfer.files && e.dataTransfer.files[0];
  if (f) manejarArchivo(f);
});
// Evita que el navegador abra el archivo si se suelta fuera de la zona
["dragover", "drop"].forEach((ev) => window.addEventListener(ev, (e) => e.preventDefault()));

async function manejarArchivo(file) {
  mostrarMensaje("");
  if (!/\.(xlsx|xls|xlsm)$/i.test(file.name)) {
    mostrarMensaje("Ese archivo no es un Excel. Elegí uno con extensión .xlsx, .xls o .xlsm.", "error");
    return;
  }
  estado = { workbook: null, file, hoja: null, payload: null };
  el.panelReview.hidden = true; el.panelDone.hidden = true;
  try {
    setProgreso(8, "Leyendo archivo…");
    const data = new Uint8Array(await file.arrayBuffer());
    setProgreso(22, "Abriendo Excel…");
    await sleep(16);
    const wb = XLSX.read(data, { type: "array", cellDates: true, cellNF: false, cellStyles: false });
    if (!wb.SheetNames.length) throw new Error("El Excel no tiene hojas.");
    estado.workbook = wb;
    const preferida = wb.SheetNames.find((n) => n.trim().toUpperCase() === CONFIG.SHEET_NAME) || wb.SheetNames[0];

    const pick = $("sheetPick");
    pick.innerHTML = wb.SheetNames.map((n) => `<option value="${esc(n)}" ${n === preferida ? "selected" : ""}>${esc(n)}</option>`).join("");
    $("sheetPickWrap").hidden = wb.SheetNames.length < 2;

    await procesarHoja(preferida);
  } catch (err) {
    console.error(err);
    setProgreso(100, "Error");
    mostrarMensaje(err.message, "error");
    ocultarProgreso();
    setPaso(1);
  }
}

$("sheetPick").addEventListener("change", async (e) => {
  try { await procesarHoja(e.target.value); }
  catch (err) { mostrarMensaje(err.message, "error"); ocultarProgreso(); }
});

async function procesarHoja(hoja) {
  mostrarMensaje("");
  estado.hoja = hoja;
  setProgreso(40, `Leyendo la hoja "${hoja}"…`);
  const rows = XLSX.utils.sheet_to_json(estado.workbook.Sheets[hoja], { header: 1, raw: true, defval: "" });
  setProgreso(62, `Procesando ${fmt(rows.length)} filas…`);
  const payload = await procesarEnWorker(rows);
  payload.meta.hoja = hoja;
  estado.payload = payload;
  setProgreso(100, "Listo para revisar");
  ocultarProgreso(600);
  renderRevision();
}

/* ---------- Revisión ---------- */
function renderRevision() {
  const { payload, file, hoja } = estado;
  const k = payload.kpis, m = payload.meta, d = payload.dims;

  $("fileName").textContent = file.name;
  $("fileInfo").textContent = `Hoja "${hoja}" · ${fmt(k.registros)} registros válidos · ${(file.size / 1024).toFixed(0)} KB` +
    (m.filasOmitidas ? ` · ${fmt(m.filasOmitidas)} filas vacías omitidas` : "");

  $("kpiPreview").innerHTML = [
    ["fa-mountain", "Toneladas voladas", k.toneladas >= 1e6 ? new Intl.NumberFormat("es-PE", { notation: "compact", maximumFractionDigits: 1 }).format(k.toneladas) + " t" : fmtT(k.toneladas)],
    ["fa-bullseye", "Cumplimiento de meta", fmt(k.cumplimiento, 1) + " %"],
    ["fa-burst", "Factor de carga", fmt(k.factorCarga, 3) + " kg/t"],
    ["fa-dollar-sign", "Costo por tonelada", "US$ " + fmt(k.costoTon, 3)],
  ].map(([i, t, v]) => `<div class="kpi-mini"><span><i class="fas ${i}"></i>${t}</span><b title="${esc(v)}">${v}</b></div>`).join("");

  const DIMS = [["mes", "Meses", "fa-calendar-days"], ["unidad", "Unidades mineras", "fa-mountain-sun"], ["voladura", "Tipos de voladura", "fa-burst"], ["explosivo", "Tipos de explosivo", "fa-flask"], ["contratista", "Contratistas", "fa-helmet-safety"]];
  $("dimsPreview").innerHTML = DIMS.map(([key, label, icon]) => {
    const vals = d[key] || [];
    return `<div class="dim"><div class="dim-head"><i class="fas ${icon}"></i>${label}<b>${vals.length}</b></div><div class="dim-vals">${vals.length ? vals.map(esc).join(", ") : "No se encontró la columna"}</div></div>`;
  }).join("");

  const etiquetas = m.etiquetas || {};
  const total = Object.keys(etiquetas).length;
  const ok = total - m.faltantes.length;
  $("colsResumen").textContent = `${ok} de ${total}` + (m.faltantes.length ? " · las que faltan se muestran como 0 o sin dato" : " · todo en orden");
  $("colsPreview").innerHTML = Object.entries(etiquetas).map(([campo, label]) => {
    const found = m.columnas[campo];
    return found
      ? `<li class="ok" title="Columna del Excel: ${esc(found)}"><i class="fas fa-circle-check"></i><span>${esc(label)}</span></li>`
      : `<li class="miss" title="No se encontró esta columna"><i class="fas fa-triangle-exclamation"></i><span>${esc(label)}</span></li>`;
  }).join("");

  const cols = [
    ["id", "ID"], ["mes", "Mes"], ["unidad", "Unidad minera"], ["voladura", "Voladura"], ["explosivo", "Explosivo"],
    ["taladros", "Taladros", 1], ["toneladas", "Toneladas", 1, fmtT], ["meta", "Meta", 1, fmtT],
    ["explosivoKg", "Explosivo (kg)", 1], ["costoTotal", "Costo total", 1, fmtMoney],
    ["p80", "P80 (cm)", 1, (v) => (v == null ? "—" : fmt(v, 1))], ["ppv", "PPV (mm/s)", 1, (v) => (v == null ? "—" : fmt(v, 1))],
    ["fallados", "Tiros fallados", 1], ["incidentes", "Incidentes", 1],
  ];
  $("previewTable").innerHTML =
    `<thead><tr>${cols.map(([, t, n]) => `<th class="${n ? "num" : ""}">${t}</th>`).join("")}</tr></thead>` +
    `<tbody>${payload.filas.slice(0, 8).map((r) => `<tr>${cols.map(([c, , n, f]) => `<td class="${n ? "num" : ""}">${esc(f ? f(r[c]) : n ? fmt(r[c]) : r[c] || "—")}</td>`).join("")}</tr>`).join("")}</tbody>`;

  el.panelUpload.hidden = true;
  el.panelReview.hidden = false;
  el.panelReview.style.animation = "none"; void el.panelReview.offsetWidth; el.panelReview.style.animation = "";
  setPaso(2);
  el.btnSubir.focus({ preventScroll: true });
}

function resetear() {
  estado = { workbook: null, file: null, hoja: null, payload: null };
  el.fileInput.value = "";
  el.panelReview.hidden = true; el.panelDone.hidden = true; el.panelUpload.hidden = false;
  mostrarMensaje("");
  setPaso(1);
}
$("btnOtro").addEventListener("click", resetear);
$("btnOtroDone").addEventListener("click", resetear);

/* ---------- Publicación ---------- */
// row_index = segundos desde 1970 → cada carga es una versión nueva y el dashboard
// siempre lee la más reciente (ORDER BY row_index DESC), aunque el borrado falle por RLS.
function esErrorDeRango(err) {
  const s = `${err?.code || ""} ${err?.message || ""}`;
  return /22003|out of range|fuera de rango/i.test(s);
}

el.btnSubir.addEventListener("click", async () => {
  if (!estado.payload) { mostrarMensaje("Primero elegí un archivo válido.", "error"); return; }
  const label = el.btnSubir.querySelector("span");
  el.btnSubir.disabled = true; label.textContent = "Publicando…";
  $("btnOtro").disabled = true;
  let avisoBorrado = "";
  try {
    const version = Math.floor(Date.now() / 1000);
    const payload = estado.payload;
    payload.meta = {
      ...payload.meta,
      uploadedAt: new Date().toISOString(),
      version,
      archivo: estado.file.name,
      registros: payload.filas.length,
    };

    setProgreso(20, "Publicando datos en Supabase…");
    let { error } = await supabaseClient.from(CONFIG.TABLE).insert([{ sheet_name: CONFIG.SHEET_NAME, row_index: version, data: payload }]);
    let modoLegado = false;

    if (error && esErrorDeRango(error)) {
      // La columna row_index no admite números grandes → flujo anterior (borrar e insertar)
      modoLegado = true;
      setProgreso(35, "Reemplazando datos anteriores…");
      const del = await supabaseClient.from(CONFIG.TABLE).delete().eq("sheet_name", CONFIG.SHEET_NAME);
      if (del.error) throw del.error;
      payload.meta.version = 0;
      ({ error } = await supabaseClient.from(CONFIG.TABLE).insert([{ sheet_name: CONFIG.SHEET_NAME, row_index: 0, data: payload }]));
    }
    if (error) throw error;

    if (!modoLegado) {
      setProgreso(65, "Limpiando versiones anteriores…");
      const { error: delErr } = await supabaseClient.from(CONFIG.TABLE).delete()
        .eq("sheet_name", CONFIG.SHEET_NAME).neq("row_index", version);
      if (delErr) {
        console.warn("No se pudieron borrar versiones anteriores:", delErr);
        avisoBorrado = "No se pudieron borrar las versiones anteriores (revisá la política DELETE de la tabla en Supabase). El dashboard igual muestra la versión nueva.";
      }
    }

    setProgreso(85, "Verificando…");
    const { data: check } = await supabaseClient.from(CONFIG.TABLE).select("row_index")
      .eq("sheet_name", CONFIG.SHEET_NAME).order("row_index", { ascending: false }).limit(1);
    if (!modoLegado && check && check[0] && check[0].row_index !== version) {
      console.warn("La versión más reciente en Supabase no coincide con la publicada", check[0]);
    }

    // Aviso inmediato a cualquier pestaña del dashboard abierta en este navegador
    const msg = { type: "data-updated", version: payload.meta.version, at: Date.now() };
    try { const bc = new BroadcastChannel(CONFIG.BUS); bc.postMessage(msg); bc.close(); } catch (_) {}
    try { localStorage.setItem(CONFIG.LS_UPLOAD, JSON.stringify(msg)); } catch (_) {}

    setProgreso(100, "Publicado");
    ocultarProgreso(700);
    el.panelReview.hidden = true; el.panelUpload.hidden = true; el.panelDone.hidden = false;
    $("doneText").textContent = `${fmt(payload.filas.length)} registros de "${estado.file.name}" ya están en el dashboard.`;
    $("doneWarn").hidden = !avisoBorrado; $("doneWarn").textContent = avisoBorrado;
    setPaso(4);
    toast("Datos publicados en el dashboard", "ok");
    cargarPublicado();
    estado.payload = null; el.fileInput.value = "";
  } catch (err) {
    console.error(err);
    setProgreso(100, "Error");
    ocultarProgreso();
    mostrarMensaje("No se pudo publicar: " + (err.message || err) + ". Revisá tu conexión y volvé a intentar.", "error");
  } finally {
    el.btnSubir.disabled = false; label.textContent = "Publicar en el dashboard";
    $("btnOtro").disabled = false;
  }
});

cargarPublicado();
