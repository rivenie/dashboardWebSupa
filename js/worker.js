self.onmessage = function (e) {
  const { tipo, rows } = e.data;
  try {
    let resultado;
    if (tipo === "DATA" || tipo === "SELLIN_DATA") resultado = procesarSellIn(rows);
    else throw new Error("Tipo desconocido: " + tipo);
    self.postMessage({ ok: true, tipo, resultado });
  } catch (err) {
    self.postMessage({ ok: false, tipo, error: err.message });
  }
};

function norm(v) { return v !== undefined && v !== null ? v.toString().trim() : ""; }
function num(v) {
  if (typeof v === "number") return v;
  if (!v) return 0;
  const s = v.toString().replace(",", ".").replace(/[^0-9.-]/g, "");
  return parseFloat(s) || 0;
}

function procesarSellIn(rows) {
  let headerIndex = 0;
  for (let i = 0; i < Math.min(rows.length, 20); i++) {
    const f = rows[i].map(c => (c || "").toString().trim().toLowerCase());
    if (f.includes("fecha") && f.includes("cliente") && f.includes("venta_neta")) { headerIndex = i; break; }
  }
  const headers = rows[headerIndex].map((h, i) => (h || "").toString().trim() || `Columna_${i + 1}`);

  const cMes = headers.findIndex(h => h.toLowerCase() === "mes");
  const cFactura = headers.findIndex(h => h.toLowerCase() === "factura");
  const cCliente = headers.findIndex(h => h.toLowerCase() === "cliente");
  const cGrupo = headers.findIndex(h => h.toLowerCase().includes("grupo de producto"));
  const cSubcat = headers.findIndex(h => h.toLowerCase() === "subcategoria");
  const cCodProd = headers.findIndex(h => h.toLowerCase().includes("cod. producto"));
  const cProducto = headers.findIndex(h => h.toLowerCase() === "producto");
  const cCant = headers.findIndex(h => h.toLowerCase() === "cantidad");
  const cVenta = headers.findIndex(h => h.toLowerCase() === "venta_neta");
  const cCanal = headers.findIndex(h => h.toLowerCase() === "canal");
  const cRegion = headers.findIndex(h => h.toLowerCase() === "region" || h.toLowerCase() === "región");
  const cEnc = headers.findIndex(h => h.toLowerCase() === "encargado");

  let totVenta = 0, totCant = 0, totRegistros = 0;
  const setFacturas = new Set();
  const setClientes = new Set();
  const setProductos = new Set();
  const porMes = {}, porGrupo = {}, porSubcat = {}, porCanal = {}, porRegion = {}, porEnc = {};
  const porCliente = {}, porProducto = {};

  for (let i = headerIndex + 1; i < rows.length; i++) {
    const r = rows[i]; if (!r) continue;
    const prod = norm(r[cProducto]);
    if (!prod) continue;

    const venta = num(r[cVenta]);
    const cant = num(r[cCant]);
    const mes = norm(r[cMes]) || "Sin mes";
    const factura = norm(r[cFactura]);
    const cliente = norm(r[cCliente]) || "Sin cliente";
    const grupo = norm(r[cGrupo]) || "Sin grupo";
    const subcat = norm(r[cSubcat]) || "Sin subcategoría";
    const canal = norm(r[cCanal]) || "Sin canal";
    const region = norm(r[cRegion]) || "Sin región";
    const enc = norm(r[cEnc]) || "Sin encargado";
    const codProd = norm(r[cCodProd]);

    totVenta += venta;
    totCant += cant;
    totRegistros++;
    if (factura) setFacturas.add(factura);
    if (cliente) setClientes.add(cliente);
    setProductos.add(prod);

    if (!porMes[mes]) porMes[mes] = { mes, venta: 0, cant: 0 };
    porMes[mes].venta += venta;
    porMes[mes].cant += cant;

    if (!porGrupo[grupo]) porGrupo[grupo] = { nombre: grupo, venta: 0, cant: 0 };
    porGrupo[grupo].venta += venta;
    porGrupo[grupo].cant += cant;

    if (!porSubcat[subcat]) porSubcat[subcat] = { nombre: subcat, venta: 0, cant: 0 };
    porSubcat[subcat].venta += venta;
    porSubcat[subcat].cant += cant;

    if (!porCanal[canal]) porCanal[canal] = { nombre: canal, venta: 0, cant: 0 };
    porCanal[canal].venta += venta;
    porCanal[canal].cant += cant;

    if (!porRegion[region]) porRegion[region] = { nombre: region, venta: 0, cant: 0 };
    porRegion[region].venta += venta;
    porRegion[region].cant += cant;

    if (!porEnc[enc]) porEnc[enc] = { nombre: enc, venta: 0, cant: 0 };
    porEnc[enc].venta += venta;
    porEnc[enc].cant += cant;

    if (!porCliente[cliente]) porCliente[cliente] = { nombre: cliente, venta: 0, cant: 0, facturas: 0 };
    porCliente[cliente].venta += venta;
    porCliente[cliente].cant += cant;
    if (factura) porCliente[cliente].facturas++;

    const keyProd = prod + "|" + codProd;
    if (!porProducto[keyProd]) porProducto[keyProd] = { nombre: prod, codigo: codProd, venta: 0, cant: 0 };
    porProducto[keyProd].venta += venta;
    porProducto[keyProd].cant += cant;
  }

  return {
    tipo: "SELLIN_DATA",
    kpis: {
      totalRegistros: totRegistros,
      totalVenta: totVenta,
      totalCantidad: totCant,
      totalFacturas: setFacturas.size,
      totalClientes: setClientes.size,
      totalProductos: setProductos.size,
      ticketPromedio: setFacturas.size ? totVenta / setFacturas.size : 0,
    },
    porMes: Object.values(porMes),
    porGrupo: Object.values(porGrupo).sort((a, b) => b.venta - a.venta),
    porSubcat: Object.values(porSubcat).sort((a, b) => b.cant - a.cant),
    porCanal: Object.values(porCanal).sort((a, b) => b.venta - a.venta),
    porRegion: Object.values(porRegion).sort((a, b) => b.venta - a.venta),
    porEncargado: Object.values(porEnc).sort((a, b) => b.venta - a.venta),
    porCliente: Object.values(porCliente).sort((a, b) => b.venta - a.venta).slice(0, 200),
    porProducto: Object.values(porProducto).sort((a, b) => b.venta - a.venta).slice(0, 200),
  };
}