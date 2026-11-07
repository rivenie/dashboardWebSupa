/* =====================================================================
   worker.js · Procesa el Excel de voladuras fuera del hilo principal
   Rubro: Minería y explosivos (perforación y voladura)
   - Detecta la fila de encabezados por puntaje (no por posición fija)
   - Acepta alias de columnas (con/sin acentos, guiones, espacios)
   - Parseo numérico robusto (1.234,56 · 1,234.56 · 2.5 · "US$ 1 200")
   - Devuelve filas limpias + catálogo dinámico de dimensiones + KPIs
   ===================================================================== */

self.onmessage = function (e) {
  try {
    const { rows } = e.data || {};
    if (!rows || rows.length === 0) throw new Error("La hoja está vacía.");
    const resultado = procesarVoladuras(rows);
    self.postMessage({ ok: true, resultado });
  } catch (err) {
    self.postMessage({ ok: false, error: err.message || String(err) });
  }
};

/* ---------- Utilidades ---------- */
function norm(v) {
  if (v === undefined || v === null) return "";
  return String(v).trim();
}

function num(v) {
  if (typeof v === "number") return isFinite(v) ? v : 0;
  if (v === null || v === undefined) return 0;
  let s = String(v).trim().replace(/[^\d.,\-]/g, "");
  if (!s || s === "-") return 0;
  const lc = s.lastIndexOf(","), ld = s.lastIndexOf(".");
  if (lc > -1 && ld > -1) {
    s = lc > ld ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "");
  } else if (lc > -1) {
    s = /^-?\d{1,3}(,\d{3})+$/.test(s) ? s.replace(/,/g, "") : s.replace(",", ".");
  } else if (ld > -1 && /^-?\d{1,3}(\.\d{3})+$/.test(s)) {
    s = s.replace(/\./g, "");
  }
  const n = parseFloat(s);
  return isFinite(n) ? n : 0;
}

// Número opcional: null si la celda está vacía (P80 y PPV se promedian: vacío ≠ 0)
function numOpt(v) {
  if (v === undefined || v === null || norm(v) === "") return null;
  return num(v);
}

function normKey(k) {
  return norm(k).toLowerCase()
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]/g, "");
}

/* ---------- Mapa de columnas (canónico + alias) ---------- */
const FIELD_MAP = {
  idvoladura: "id", id: "id", codigo: "id", codigovoladura: "id",
  fecha: "fecha", fechavoladura: "fecha", fechadisparo: "fecha",
  mes: "mes",
  ano: "año", anio: "año", year: "año",
  unidadminera: "unidad", unidad: "unidad", mina: "unidad", um: "unidad",
  tipovoladura: "voladura", voladura: "voladura", tipodisparo: "voladura",
  tipoexplosivo: "explosivo", explosivo: "explosivo", agentevoladura: "explosivo",
  turno: "turno", guardia: "turno",
  contratista: "contratista", contrata: "contratista", empresa: "contratista",
  taladrosperforados: "taladros", taladros: "taladros", numerotaladros: "taladros",
  metrosperforados: "metros", metros: "metros", metrosperforacion: "metros",
  horasperforacion: "horas", horas: "horas", horasoperativas: "horas",
  toneladasvoladas: "toneladas", toneladas: "toneladas", toneladasrotas: "toneladas", tonelaje: "toneladas",
  metatoneladas: "meta", meta: "meta", toneladasplan: "meta", toneladasplanificadas: "meta",
  explosivokg: "explosivoKg", kgexplosivo: "explosivoKg", explosivokilos: "explosivoKg", consumoexplosivo: "explosivoKg",
  detonadoresusados: "detonadores", detonadores: "detonadores",
  costoexplosivousd: "costoExp", costoexplosivo: "costoExp",
  costoperforacionusd: "costoPerf", costoperforacion: "costoPerf",
  costoaccesoriosusd: "costoAcc", costoaccesorios: "costoAcc",
  costototalusd: "costoTotal", costototal: "costoTotal",
  fragmentacionp80cm: "p80", fragmentacionp80: "p80", p80: "p80", p80cm: "p80",
  vibracionppvmms: "ppv", vibracionppv: "ppv", ppv: "ppv", ppvmms: "ppv",
  tirosfallados: "fallados", tiroscortados: "fallados", fallados: "fallados",
  incidentesseguridad: "incidentes", incidentes: "incidentes",
};

// Etiquetas legibles (se muestran en la pantalla de carga)
const CAMPOS = {
  id: "ID_Voladura", fecha: "Fecha", mes: "Mes", año: "Año", unidad: "Unidad_Minera",
  voladura: "Tipo_Voladura", explosivo: "Tipo_Explosivo", turno: "Turno", contratista: "Contratista",
  taladros: "Taladros_Perforados", metros: "Metros_Perforados", horas: "Horas_Perforacion",
  toneladas: "Toneladas_Voladas", meta: "Meta_Toneladas", explosivoKg: "Explosivo_Kg",
  detonadores: "Detonadores_Usados", costoExp: "Costo_Explosivo_USD", costoPerf: "Costo_Perforacion_USD",
  costoAcc: "Costo_Accesorios_USD", costoTotal: "Costo_Total_USD", p80: "Fragmentacion_P80_cm",
  ppv: "Vibracion_PPV_mm_s", fallados: "Tiros_Fallados", incidentes: "Incidentes_Seguridad",
};

const TEXTO = ["id", "mes", "año", "unidad", "voladura", "explosivo", "turno", "contratista"];
const OPCIONALES_NUM = ["p80", "ppv"];

const MES_ORDEN = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

function mesIndex(v) {
  if (typeof v === "number" && v >= 1 && v <= 12) return v - 1;
  const s = normKey(v);
  if (!s) return -1;
  if (/^\d{1,2}$/.test(s) && +s >= 1 && +s <= 12) return +s - 1;
  if (s.startsWith("set")) return 8; // "setiembre" (uso peruano)
  return MES_ORDEN.findIndex((m) => m === s || m.slice(0, 3) === s.slice(0, 3));
}
function mesNombre(i) {
  const m = MES_ORDEN[i];
  return m ? m.charAt(0).toUpperCase() + m.slice(1) : "";
}

function parseFecha(v) {
  if (v instanceof Date) {
    const d = new Date(v.getTime() + 60 * 1000); // SheetJS puede quedar unos segundos antes de medianoche
    return isNaN(d) ? null : new Date(d.getFullYear(), d.getMonth(), d.getDate());
  }
  if (typeof v === "number" && v > 59) {
    const d = new Date(Math.round((v - 25569) * 86400 * 1000));
    return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  }
  const s = norm(v);
  if (!s) return null;
  const dmY = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/);
  if (dmY) {
    const y = +dmY[3] < 100 ? 2000 + +dmY[3] : +dmY[3];
    return new Date(y, +dmY[2] - 1, +dmY[1]);
  }
  const d = new Date(s.replace(" ", "T"));
  return isNaN(d) ? null : d;
}

function fechaISO(d) {
  if (!d) return "";
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/* ---------- Proceso principal ---------- */
function procesarVoladuras(rows) {
  // 1) Encabezado = la fila (entre las 10 primeras) con más columnas reconocidas
  let hIdx = -1, mejor = 0;
  for (let i = 0; i < Math.min(rows.length, 10); i++) {
    const r = rows[i];
    if (!Array.isArray(r)) continue;
    const score = new Set(r.map((c) => FIELD_MAP[normKey(c)]).filter(Boolean)).size;
    if (score > mejor) { mejor = score; hIdx = i; }
  }
  if (hIdx < 0 || mejor < 3) {
    throw new Error("No se encontró la fila de encabezados. Verificá que la hoja tenga columnas como Mes, Unidad_Minera y Toneladas_Voladas.");
  }

  const header = rows[hIdx].map((c) => norm(c));
  const map = {}, columnas = {};
  header.forEach((h, i) => {
    const campo = FIELD_MAP[normKey(h)];
    if (campo && !(campo in columnas)) { map[i] = campo; columnas[campo] = h; }
  });

  if (!columnas.toneladas) throw new Error("Falta la columna Toneladas_Voladas: es la base de casi todas las métricas.");
  if (!columnas.mes && !columnas.fecha) throw new Error("Falta la columna Mes o Fecha: sin ella no se pueden armar las series mensuales.");

  // 2) Filas
  const registros = [];
  let omitidas = 0;
  for (let i = hIdx + 1; i < rows.length; i++) {
    const r = rows[i];
    if (!Array.isArray(r) || r.length === 0) { omitidas++; continue; }
    const obj = {};
    let hasData = false;
    for (const idx in map) {
      const campo = map[idx];
      const raw = r[idx];
      if (raw !== undefined && raw !== null && norm(raw) !== "") hasData = true;
      if (campo === "fecha") obj.fecha = parseFecha(raw);
      else if (TEXTO.includes(campo)) obj[campo] = norm(raw);
      else if (OPCIONALES_NUM.includes(campo)) obj[campo] = numOpt(raw);
      else obj[campo] = num(raw);
    }
    if (!hasData) { omitidas++; continue; }

    let mi = mesIndex(obj.mes);
    if (mi < 0 && obj.fecha) mi = obj.fecha.getMonth();
    obj.mes = mi >= 0 ? mesNombre(mi) : norm(obj.mes);
    if (!obj.año && obj.fecha) obj.año = String(obj.fecha.getFullYear());
    if (obj.año) obj.año = String(obj.año).replace(/\.0+$/, "");

    // Derivados si faltan
    const comp = (obj.costoExp || 0) + (obj.costoPerf || 0) + (obj.costoAcc || 0);
    if (!obj.costoTotal && comp) obj.costoTotal = comp;

    if (!obj.mes && !obj.fecha) { omitidas++; continue; }
    registros.push(obj);
  }

  if (registros.length === 0) throw new Error("No se detectaron filas de datos válidas. Verificá el formato de las columnas.");

  // 3) Catálogo dinámico de dimensiones (nunca hardcodeado)
  const uniq = (arr) => Array.from(new Set(arr.filter((x) => x !== "" && x !== undefined && x !== null)));
  const porTexto = (a, b) => String(a).localeCompare(String(b), "es", { numeric: true, sensitivity: "base" });
  const dims = {
    mes: uniq(registros.map((r) => r.mes)).sort((a, b) => mesIndex(a) - mesIndex(b)),
    año: uniq(registros.map((r) => r.año)).sort(porTexto),
    unidad: uniq(registros.map((r) => r.unidad)).sort(porTexto),
    voladura: uniq(registros.map((r) => r.voladura)).sort(porTexto),
    explosivo: uniq(registros.map((r) => r.explosivo)).sort(porTexto),
    turno: uniq(registros.map((r) => r.turno)).sort(porTexto),
    contratista: uniq(registros.map((r) => r.contratista)).sort(porTexto),
  };

  // 4) KPIs globales (vista previa en la pantalla de carga)
  const sum = (f) => registros.reduce((a, x) => a + (Number(f(x)) || 0), 0);
  const avg = (f) => {
    const v = registros.map(f).filter((x) => typeof x === "number" && isFinite(x) && x > 0);
    return v.length ? v.reduce((a, b) => a + b, 0) / v.length : 0;
  };
  const toneladas = sum((x) => x.toneladas), meta = sum((x) => x.meta);
  const explosivoKg = sum((x) => x.explosivoKg), costoTotal = sum((x) => x.costoTotal);
  const taladros = sum((x) => x.taladros), fallados = sum((x) => x.fallados);
  const kpis = {
    toneladas, meta, explosivoKg, costoTotal, taladros, fallados,
    cumplimiento: meta ? (toneladas / meta) * 100 : 0,
    factorCarga: toneladas ? explosivoKg / toneladas : 0,
    costoTon: toneladas ? costoTotal / toneladas : 0,
    tasaFallados: taladros ? (fallados / taladros) * 100 : 0,
    incidentes: sum((x) => x.incidentes),
    p80: avg((x) => x.p80),
    ppv: avg((x) => x.ppv),
    registros: registros.length,
  };

  return {
    meta: {
      schema: 2,
      rubro: "mineria-voladura",
      columnas,
      faltantes: Object.keys(CAMPOS).filter((c) => !(c in columnas)),
      etiquetas: CAMPOS,
      filasLeidas: rows.length - hIdx - 1,
      filasOmitidas: omitidas,
      filaEncabezado: hIdx + 1,
    },
    dims,
    kpis,
    filas: registros.map((r) => ({
      id: r.id || "", fecha: fechaISO(r.fecha),
      mes: r.mes || "", año: r.año || "", unidad: r.unidad || "", voladura: r.voladura || "",
      explosivo: r.explosivo || "", turno: r.turno || "", contratista: r.contratista || "",
      taladros: r.taladros || 0, metros: r.metros || 0, horas: r.horas || 0,
      toneladas: r.toneladas || 0, meta: r.meta || 0, explosivoKg: r.explosivoKg || 0,
      detonadores: r.detonadores || 0, costoExp: r.costoExp || 0, costoPerf: r.costoPerf || 0,
      costoAcc: r.costoAcc || 0, costoTotal: r.costoTotal || 0,
      p80: r.p80 ?? null, ppv: r.ppv ?? null,
      fallados: r.fallados || 0, incidentes: r.incidentes || 0,
    })),
  };
}
