self.onmessage = function (e) {
  try {
    const { hojas } = e.data;
    if (!hojas || !Array.isArray(hojas)) throw new Error("Hojas inválidas.");
    const resultado = procesarFinanciero(hojas);
    self.postMessage({ ok: true, resultado });
  } catch (err) {
    self.postMessage({ ok: false, error: (err && err.message) ? err.message : String(err) });
  }
};

function norm(v) { return v !== undefined && v !== null ? v.toString().trim() : ""; }
function num(v) {
  if (typeof v === "number") return isFinite(v) ? v : 0;
  if (v === null || v === undefined || v === "") return 0;
  const s = v.toString().replace(/[^\d.\-]/g, "");
  const n = parseFloat(s);
  return isFinite(n) ? n : 0;
}
function safe(v) { return (typeof v === "number" && !isFinite(v)) ? 0 : v; }

const MESES_ORD = ["01-ENE","02-FEB","03-MAR","04-ABR","05-MAY","06-JUN","07-JUL","08-AGO","09-SET","10-OCT","11-NOV","12-DIC"];

function buscarHeader(rows, criterios, maxBusqueda = 10) {
  for (let i = 0; i < Math.min(rows.length, maxBusqueda); i++) {
    const f = (rows[i] || []).map(c => (c || "").toString().trim().toUpperCase());
    if (criterios.every(c => f.some(x => x.includes(c)))) return i;
  }
  return -1;
}
function extraerHeaders(row) {
  return (row || []).map((h, i) => {
    const limpio = (h || "").toString().trim().replace(/<br\s*\/?>/gi, " ").replace(/\s+/g, " ");
    return limpio === "" ? `Columna_${i + 1}` : limpio;
  });
}

function procesarFinanciero(hojas) {
  const resultado = { tipo: "FINANCIERO_DATA", pim: null, cert: null, comp: null };

  hojas.forEach(({ nombre, rows }) => {
    if (!rows || rows.length === 0) return;
    const n = nombre.toUpperCase();
    if (n.includes("PIM")) resultado.pim = procesarPIM(rows);
    else if (n.includes("CERT")) resultado.cert = procesarCERT(rows);
    else if (n.includes("COMP")) resultado.comp = procesarCOMP(rows);
  });

  const pimK = resultado.pim ? resultado.pim.kpis : null;
  const certK = resultado.cert ? resultado.cert.kpis : null;
  const compK = resultado.comp ? resultado.comp.kpis : null;

  resultado.kpis = {
    pia: pimK ? pimK.totalPIA : 0,
    pim: pimK ? pimK.totalPIM : 0,
    certificado: pimK ? pimK.totalCertificado : (certK ? certK.totalCertificado : 0),
    compromisoAnual: pimK ? pimK.totalCompAnual : 0,
    compromiso: compK ? compK.totalCompromiso : (certK ? certK.totalCompromiso : 0),
    devengado: pimK ? pimK.totalDevengado : 0,
    girado: pimK ? pimK.totalGirado : 0,
    pagado: pimK ? pimK.totalPagado : 0,
    pctCert: pimK ? pimK.pctCertPIM : 0,
    pctComp: pimK ? pimK.pctCompPIM : 0,
    pctDev: pimK ? pimK.pctDevPIM : 0,
    pctGiro: pimK ? pimK.pctGiroPIM : 0,
  };

  return resultado;
}

/* ---------------- PIM ---------------- */
function procesarPIM(rows) {
  const hIdx = buscarHeader(rows, ["PIA", "PIM"]);
  if (hIdx < 0) throw new Error("PIM-SJ-J: no se encontró encabezado.");
  const headers = extraerHeaders(rows[hIdx]);
  const idx = (pred) => headers.findIndex(h => pred(h.toLowerCase()));

  const cOficina = idx(h => h.includes("oficina") && !h.includes("meta"));
  const cMeta = idx(h => h === "meta");
  const cGen = idx(h => h === "gen" || h.startsWith("gen "));
  const cSubgen = idx(h => h.includes("sub gen"));
  const cEspGasto = idx(h => h.includes("esp gasto") && !h.includes("sub"));
  const cPIA = idx(h => h.startsWith("pia"));
  const cPIM = idx(h => h.startsWith("pim") && !h.includes("%"));
  const cCert = idx(h => h.startsWith("certificado") && !h.includes("%"));
  const cCompAnual = idx(h => h.startsWith("compromiso anual") && !h.includes("saldo"));
  const cComp = idx(h => h.startsWith("compromiso") && !h.includes("anual") && !h.includes("saldo") && !h.includes("%"));
  const cDev = idx(h => h.startsWith("devengado") && !h.includes("saldo") && !h.includes("%") && !h.includes("proy"));
  const cGir = idx(h => h.startsWith("girado") && !h.includes("saldo") && !h.includes("%"));
  const cPag = idx(h => h.startsWith("pagado") && !h.includes("saldo") && !h.includes("%"));
  const cMeta2 = idx(h => h.includes("meta + oficina"));

  const get = (r, i) => (i >= 0 && r[i] !== undefined) ? r[i] : "";

  const filas = [];
  const porOficina = {}, porGen = {}, porSubgen = {}, porEspGasto = {}, porMeta = {}, porRubro = {};
  let totalPIA=0, totalPIM=0, totalCert=0, totalCompAnual=0, totalComp=0, totalDev=0, totalGir=0, totalPag=0;

  for (let i = hIdx + 1; i < rows.length; i++) {
    const r = rows[i]; if (!r) continue;
    const oficina = norm(get(r, cOficina));
    if (!oficina || oficina.toUpperCase() === "TOTAL") continue;

    const meta = norm(get(r, cMeta));
    const gen = norm(get(r, cGen));
    const subgen = norm(get(r, cSubgen));
    const espGasto = norm(get(r, cEspGasto));
    const meta2 = norm(get(r, cMeta2));
    const pia = num(get(r, cPIA));
    const pim = num(get(r, cPIM));
    const cert = num(get(r, cCert));
    const compAnual = num(get(r, cCompAnual));
    const comp = num(get(r, cComp));
    const dev = num(get(r, cDev));
    const gir = num(get(r, cGir));
    const pag = num(get(r, cPag));

    totalPIA += pia; totalPIM += pim; totalCert += cert; totalCompAnual += compAnual;
    totalComp += comp; totalDev += dev; totalGir += gir; totalPag += pag;

    if (oficina) porOficina[oficina] = (porOficina[oficina] || 0) + dev;
    if (gen) porGen[gen] = (porGen[gen] || 0) + dev;
    if (subgen) porSubgen[subgen] = (porSubgen[subgen] || 0) + dev;
    if (espGasto) porEspGasto[espGasto] = (porEspGasto[espGasto] || 0) + dev;
    if (meta) porMeta[meta] = (porMeta[meta] || 0) + dev;
    if (meta2) porRubro[meta2] = (porRubro[meta2] || 0) + dev;

    filas.push({ oficina, meta, gen, subgen, espGasto, meta2, pia, pim, cert, compAnual, comp, dev, gir, pag });
  }

  const devPorMes = MESES_ORD.map((m) => {
    const col = headers.findIndex(h => h.toLowerCase().includes("dev proy") && h.toLowerCase().includes(m.toLowerCase().slice(3)));
    let total = 0;
    if (col >= 0) {
      for (let j = hIdx + 1; j < rows.length; j++) {
        const r = rows[j]; if (!r) continue;
        total += num(get(r, col));
      }
    }
    return { mes: m, valor: total };
  });

  const pct = (v) => totalPIM ? (v / totalPIM) * 100 : 0;

  return {
    kpis: {
      totalPIA: safe(totalPIA), totalPIM: safe(totalPIM),
      totalCertificado: safe(totalCert), totalCompAnual: safe(totalCompAnual),
      totalCompromiso: safe(totalComp), totalDevengado: safe(totalDev),
      totalGirado: safe(totalGir), totalPagado: safe(totalPag),
      pctCertPIM: safe(pct(totalCert)),
      pctCompPIM: safe(pct(totalCompAnual)),
      pctDevPIM: safe(pct(totalDev)),
      pctGiroPIM: safe(pct(totalGir)),
      saldoPimCert: safe(totalPIM - totalCert),
      saldoCertComp: safe(totalCert - totalCompAnual),
      saldoCompDev: safe(totalCompAnual - totalDev),
      saldoDevGir: safe(totalDev - totalGir),
      saldoGirPag: safe(totalGir - totalPag),
    },
    porOficina: Object.entries(porOficina).map(([n,v]) => ({nombre:n, valor:v})).sort((a,b)=>b.valor-a.valor),
    porGen: Object.entries(porGen).map(([n,v]) => ({nombre:n, valor:v})).sort((a,b)=>b.valor-a.valor),
    porSubgen: Object.entries(porSubgen).map(([n,v]) => ({nombre:n, valor:v})).sort((a,b)=>b.valor-a.valor),
    porEspGasto: Object.entries(porEspGasto).map(([n,v]) => ({nombre:n, valor:v})).sort((a,b)=>b.valor-a.valor),
    porMeta: Object.entries(porMeta).map(([n,v]) => ({nombre:n, valor:v})).sort((a,b)=>b.valor-a.valor),
    porRubro: Object.entries(porRubro).map(([n,v]) => ({nombre:n, valor:v})).sort((a,b)=>b.valor-a.valor),
    devPorMes,
    filas,
  };
}

/* ---------------- CERT ---------------- */
function procesarCERT(rows) {
  const hIdx = buscarHeader(rows, ["NRO CERT", "FECHA CERT", "CERTIFICADO"]);
  if (hIdx < 0) throw new Error("CERT-SL-J: no se encontró encabezado.");
  const headers = extraerHeaders(rows[hIdx]);
  const idx = (pred) => headers.findIndex(h => pred(h.toLowerCase()));

  const cOficina = idx(h => h.includes("oficina") && !h.includes("meta"));
  const cMeta = idx(h => h === "meta");
  const cCert = idx(h => h === "certificado");
  const cCompAnual = idx(h => h.includes("comp anual"));
  const cComp = idx(h => h === "compromiso");
  const cDev = idx(h => h === "devengado");
  const cGir = idx(h => h === "girado");
  const cPag = idx(h => h === "pagado");
  const cTipoSIAF = idx(h => h.includes("tipo siaf"));
  const cRubroAdq = idx(h => h.includes("rubro adquisicion"));
  const cRubroSani = idx(h => h.includes("rubro sani"));
  const cMesCert = idx(h => h.includes("mes cert"));
  const cAmp = idx(h => h.includes("monto ampliado"));
  const cReb = idx(h => h.includes("monto rebajado"));
  const cAnu = idx(h => h.includes("monto anulado"));
  const cFFDet = idx(h => h === "ff det");
  const cProcSel = idx(h => h.includes("procedimiento selec"));

  const get = (r, i) => (i >= 0 && r[i] !== undefined) ? r[i] : "";

  const filas = [];
  const porOficina = {}, porMeta = {}, porTipoSIAF = {}, porMes = {}, porFF = {}, porProc = {};
  let totCert=0, totCompAnual=0, totComp=0, totDev=0, totGir=0, totPag=0, totAmp=0, totReb=0, totAnu=0;

  for (let i = hIdx + 1; i < rows.length; i++) {
    const r = rows[i]; if (!r) continue;
    const oficina = norm(get(r, cOficina));
    if (!oficina || oficina.toUpperCase() === "TOTAL") continue;

    const meta = norm(get(r, cMeta));
    const cert = num(get(r, cCert));
    const compAnual = num(get(r, cCompAnual));
    const comp = num(get(r, cComp));
    const dev = num(get(r, cDev));
    const gir = num(get(r, cGir));
    const pag = num(get(r, cPag));
    const tipoSIAF = norm(get(r, cTipoSIAF)) || "SIN TIPO";
    const mesCert = norm(get(r, cMesCert));
    const ffDet = norm(get(r, cFFDet));
    const proc = norm(get(r, cProcSel));
    const amp = num(get(r, cAmp));
    const reb = num(get(r, cReb));
    const anu = num(get(r, cAnu));

    totCert += cert; totCompAnual += compAnual; totComp += comp; totDev += dev;
    totGir += gir; totPag += pag; totAmp += amp; totReb += reb; totAnu += anu;

    if (oficina) porOficina[oficina] = (porOficina[oficina] || 0) + cert;
    if (meta) porMeta[meta] = (porMeta[meta] || 0) + cert;
    if (tipoSIAF) porTipoSIAF[tipoSIAF] = (porTipoSIAF[tipoSIAF] || 0) + cert;
    if (mesCert) porMes[mesCert] = (porMes[mesCert] || 0) + cert;
    if (ffDet) porFF[ffDet] = (porFF[ffDet] || 0) + cert;
    if (proc) porProc[proc] = (porProc[proc] || 0) + cert;

    filas.push({ oficina, meta, cert, compAnual, comp, dev, gir, pag, tipoSIAF, mesCert, ffDet, proc, amp, reb, anu });
  }

  return {
    kpis: {
      totalCertificado: safe(totCert), totalCompAnual: safe(totCompAnual),
      totalCompromiso: safe(totComp), totalDevengado: safe(totDev),
      totalGirado: safe(totGir), totalPagado: safe(totPag),
      totalAmpliado: safe(totAmp), totalRebajado: safe(totReb), totalAnulado: safe(totAnu),
      saldoCertComp: safe(totCert - totCompAnual),
      saldoCompDev: safe(totCompAnual - totDev),
    },
    porOficina: Object.entries(porOficina).map(([n,v]) => ({nombre:n, valor:v})).sort((a,b)=>b.valor-a.valor),
    porMeta: Object.entries(porMeta).map(([n,v]) => ({nombre:n, valor:v})).sort((a,b)=>b.valor-a.valor),
    porTipoSIAF: Object.entries(porTipoSIAF).map(([n,v]) => ({nombre:n, valor:v})).sort((a,b)=>b.valor-a.valor),
    porMes: Object.entries(porMes).map(([n,v]) => ({nombre:n, valor:v})),
    porFF: Object.entries(porFF).map(([n,v]) => ({nombre:n, valor:v})).sort((a,b)=>b.valor-a.valor),
    porProc: Object.entries(porProc).map(([n,v]) => ({nombre:n, valor:v})).sort((a,b)=>b.valor-a.valor),
    filas,
  };
}

/* ---------------- COMP ---------------- */
function procesarCOMP(rows) {
  const hIdx = buscarHeader(rows, ["NRO CERT", "COMPROMISO", "PROVEEDOR"]);
  if (hIdx < 0) throw new Error("COMP-SL-J: no se encontró encabezado.");
  const headers = extraerHeaders(rows[hIdx]);
  const idx = (pred) => headers.findIndex(h => pred(h.toLowerCase()));

  const cOficina = idx(h => h.includes("oficina") && !h.includes("meta"));
  const cMeta = idx(h => h === "meta");
  const cProv = idx(h => h.includes("proveedor") && !h.includes("razon"));
  const cTipoDoc = idx(h => h === "documento");
  const cComp = idx(h => h === "compromiso");
  const cDev = idx(h => h === "devengado");
  const cGir = idx(h => h === "girado");
  const cPag = idx(h => h === "pagado");
  const cEstado = idx(h => h.includes("estado compromiso"));
  const cTipoSIAF = idx(h => h.includes("tipo siaf"));
  const cMesComp = idx(h => h.includes("fecha compromiso"));
  const cFF = idx(h => h === "ff");

  const get = (r, i) => (i >= 0 && r[i] !== undefined) ? r[i] : "";

  const filas = [];
  const porOficina = {}, porMeta = {}, porProv = {}, porTipoDoc = {}, porEstado = {}, porTipoSIAF = {}, porMes = {};
  let totComp=0, totDev=0, totGir=0, totPag=0;

  for (let i = hIdx + 1; i < rows.length; i++) {
    const r = rows[i]; if (!r) continue;
    const oficina = norm(get(r, cOficina));
    if (!oficina || oficina.toUpperCase() === "TOTAL") continue;

    const meta = norm(get(r, cMeta));
    const prov = norm(get(r, cProv));
    const tipoDoc = norm(get(r, cTipoDoc)) || "SIN DOC";
    const comp = num(get(r, cComp));
    const dev = num(get(r, cDev));
    const gir = num(get(r, cGir));
    const pag = num(get(r, cPag));
    const estado = norm(get(r, cEstado)) || "SIN ESTADO";
    const tipoSIAF = norm(get(r, cTipoSIAF)) || "SIN TIPO";
    const mesRaw = norm(get(r, cMesComp));
    let mes = "";
    if (mesRaw) {
      const d = new Date(mesRaw);
      if (!isNaN(d.getTime())) mes = MESES_ORD[d.getMonth()];
      else if (/^\d{5}$/.test(mesRaw)) {
        const sd = new Date((parseInt(mesRaw) - 25569) * 86400 * 1000);
        mes = MESES_ORD[sd.getUTCMonth()];
      }
    }

    totComp += comp; totDev += dev; totGir += gir; totPag += pag;

    if (oficina) porOficina[oficina] = (porOficina[oficina] || 0) + comp;
    if (meta) porMeta[meta] = (porMeta[meta] || 0) + comp;
    if (prov) porProv[prov] = (porProv[prov] || 0) + comp;
    if (tipoDoc) porTipoDoc[tipoDoc] = (porTipoDoc[tipoDoc] || 0) + comp;
    if (estado) porEstado[estado] = (porEstado[estado] || 0) + comp;
    if (tipoSIAF) porTipoSIAF[tipoSIAF] = (porTipoSIAF[tipoSIAF] || 0) + comp;
    if (mes) porMes[mes] = (porMes[mes] || 0) + comp;

    filas.push({ oficina, meta, prov, tipoDoc, comp, dev, gir, pag, estado, tipoSIAF, mes });
  }

  return {
    kpis: {
      totalCompromiso: safe(totComp), totalDevengado: safe(totDev),
      totalGirado: safe(totGir), totalPagado: safe(totPag),
      saldoCompDev: safe(totComp - totDev),
    },
    porOficina: Object.entries(porOficina).map(([n,v]) => ({nombre:n, valor:v})).sort((a,b)=>b.valor-a.valor),
    porMeta: Object.entries(porMeta).map(([n,v]) => ({nombre:n, valor:v})).sort((a,b)=>b.valor-a.valor),
    porProv: Object.entries(porProv).map(([n,v]) => ({nombre:n, valor:v})).sort((a,b)=>b.valor-a.valor),
    porTipoDoc: Object.entries(porTipoDoc).map(([n,v]) => ({nombre:n, valor:v})).sort((a,b)=>b.valor-a.valor),
    porEstado: Object.entries(porEstado).map(([n,v]) => ({nombre:n, valor:v})).sort((a,b)=>b.valor-a.valor),
    porTipoSIAF: Object.entries(porTipoSIAF).map(([n,v]) => ({nombre:n, valor:v})).sort((a,b)=>b.valor-a.valor),
    porMes: Object.entries(porMes).map(([n,v]) => ({nombre:n, valor:v})),
    filas,
  };
}