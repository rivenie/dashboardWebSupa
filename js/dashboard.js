const SUPABASE_URL = "https://uoftarfxakkpevugdycg.supabase.co";
const SUPABASE_KEY = "sb_publishable_vT_w6EoVLl-BK12ojRTaOg_UeSXAVvh";
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

let dataGlobal = [];
let charts = {};

// PALETA AZUL
const COLORS = {
    primary: '#3A82C8',
    primaryLight: '#A6CAEC',
    primaryDark: '#156082',
    green: '#397940',
    orange: '#F26F2B',
    textDim: '#5A7A8F'
};

// Para gráficos de anillo (colores diferenciados)
const PALETTE_DONUT = [COLORS.primary, COLORS.primaryLight, COLORS.primaryDark, COLORS.green, COLORS.orange];
// Para gráficos de barra/línea
const PALETTE_BAR = [COLORS.primary, COLORS.primaryLight, COLORS.primaryDark, COLORS.green, COLORS.orange];

document.getElementById('fechaActual').textContent = new Date().toLocaleDateString('es-PE', { day: '2-digit', month: 'short', year: 'numeric' });

// ============ CARGA ============
async function cargarDatos() {
    try {
        const { data, error } = await supabaseClient
            .from('dashboard_data')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(1)
            .single();

        if (error) throw error;

        dataGlobal = data.data;
        document.getElementById('sheetName').textContent = 'Pestaña: ' + data.sheet_name;

        document.getElementById('loading').style.display = 'none';
        document.getElementById('dashboard').style.display = 'block';

        calcularKPIs();
        cargarFiltros();
        crearGraficos();
        crearTablas();

        document.querySelectorAll('.filter-select, .filter-input').forEach(sel => {
            sel.addEventListener('change', aplicarFiltros);
        });
    } catch (err) {
        document.getElementById('loading').innerHTML = `
            <p style="color:#F26F2B;">No hay datos disponibles.</p>
            <p style="color:#5A7A8F;margin-top:10px;">Sube un Excel desde el index.html.</p>
        `;
        console.error(err);
    }
}

// ============ HELPERS ============
function col(clave) {
    if (dataGlobal.length === 0) return null;
    const keys = Object.keys(dataGlobal[0]);
    return keys.find(k => k.trim().toLowerCase() === clave.trim().toLowerCase());
}
function norm(v) { return v !== undefined && v !== null ? v.toString().trim() : ''; }
function num(v) {
    if (typeof v === 'number') return v;
    if (!v) return 0;
    return parseFloat(v.toString().replace(/[^0-9.-]/g, '')) || 0;
}
function moneyUSD(v) { return '$' + v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function moneySoles(v) { return 'S/ ' + v.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function ordenarMeses(labels) {
    const orden = ['ENERO','FEBRERO','MARZO','ABRIL','MAYO','JUNIO','JULIO','AGOSTO','SETIEMBRE','SEPTIEMBRE','OCTUBRE','NOVIEMBRE','DICIEMBRE'];
    return labels.sort((a, b) => orden.indexOf(a.toUpperCase()) - orden.indexOf(b.toUpperCase()));
}

// ============ RENDERIZADORES ============
function tooltipStyle() {
    return {
        backgroundColor: '#156082',
        titleColor: '#FFFFFF',
        bodyColor: '#FFFFFF',
        borderColor: '#3A82C8',
        borderWidth: 1,
        padding: 12,
        cornerRadius: 8
    };
}

function renderLine(id, labels, data, color) {
    const ctx = document.getElementById(id);
    if (!ctx) return;
    if (charts[id]) charts[id].destroy();
    charts[id] = new Chart(ctx, {
        type: 'line',
        data: { labels, datasets: [{ data, borderColor: color || COLORS.primary, backgroundColor: 'rgba(58, 130, 200, 0.1)', borderWidth: 3, tension: 0.4, fill: true, pointBackgroundColor: color || COLORS.primary, pointBorderColor: '#FFFFFF', pointBorderWidth: 2, pointRadius: 5 }] },
        options: { responsive: true, maintainAspectRatio: false,
            plugins: { legend: { display: false }, tooltip: tooltipStyle() },
            scales: { x: { ticks: { color: COLORS.textDim, font: { family: 'Inter', size: 10 } }, grid: { display: false } }, y: { beginAtZero: true, ticks: { color: COLORS.textDim }, grid: { color: 'rgba(214, 228, 240, 0.5)' } } }
        }
    });
}

function renderBar(id, labels, data, color) {
    const ctx = document.getElementById(id);
    if (!ctx) return;
    if (charts[id]) charts[id].destroy();
    charts[id] = new Chart(ctx, {
        type: 'bar',
        data: { labels, datasets: [{ data, backgroundColor: color || COLORS.primary, borderRadius: 6, borderSkipped: false, barThickness: 24 }] },
        options: { responsive: true, maintainAspectRatio: false,
            plugins: { legend: { display: false }, tooltip: tooltipStyle() },
            scales: { x: { ticks: { color: COLORS.textDim, font: { family: 'Inter', size: 10 } }, grid: { display: false } }, y: { beginAtZero: true, ticks: { color: COLORS.textDim }, grid: { color: 'rgba(214, 228, 240, 0.5)' } } }
        }
    });
}

function renderHBar(id, labels, data, color) {
    const ctx = document.getElementById(id);
    if (!ctx) return;
    if (charts[id]) charts[id].destroy();
    charts[id] = new Chart(ctx, {
        type: 'bar',
        data: { labels, datasets: [{ data, backgroundColor: color || COLORS.primary, borderRadius: 6, borderSkipped: false, barThickness: 16 }] },
        options: { indexAxis: 'y', responsive: true, maintainAspectRatio: false,
            plugins: { legend: { display: false }, tooltip: tooltipStyle() },
            scales: { x: { ticks: { color: COLORS.textDim, font: { family: 'Inter', size: 10 } }, grid: { color: 'rgba(214, 228, 240, 0.5)' } }, y: { ticks: { color: COLORS.primaryDark, font: { family: 'Inter', size: 10 } }, grid: { display: false } } }
        }
    });
}

function renderDoughnut(id, labels, data) {
    const ctx = document.getElementById(id);
    if (!ctx) return;
    if (charts[id]) charts[id].destroy();
    charts[id] = new Chart(ctx, {
        type: 'doughnut',
        data: { labels, datasets: [{ data, backgroundColor: PALETTE_DONUT.slice(0, labels.length), borderColor: '#FFFFFF', borderWidth: 3 }] },
        options: { responsive: true, maintainAspectRatio: false, cutout: '65%',
            plugins: {
                legend: { position: 'bottom', labels: { color: COLORS.textDim, font: { family: 'Inter', size: 11 }, padding: 12, usePointStyle: true, boxWidth: 8 } },
                tooltip: tooltipStyle()
            }
        }
    });
}

// Gráfico combinado: barras + línea
function renderCombo(id, labels, barData, lineData, barColor, lineColor) {
    const ctx = document.getElementById(id);
    if (!ctx) return;
    if (charts[id]) charts[id].destroy();
    charts[id] = new Chart(ctx, {
        type: 'bar',
        data: {
            labels,
            datasets: [
                {
                    type: 'bar',
                    label: 'Venta USD',
                    data: barData,
                    backgroundColor: barColor,
                    borderRadius: 6,
                    borderSkipped: false,
                    yAxisID: 'y',
                    barThickness: 30
                },
                {
                    type: 'line',
                    label: 'Despachos',
                    data: lineData,
                    borderColor: lineColor,
                    backgroundColor: lineColor,
                    borderWidth: 3,
                    tension: 0.4,
                    pointBackgroundColor: lineColor,
                    pointBorderColor: '#FFFFFF',
                    pointBorderWidth: 2,
                    pointRadius: 5,
                    yAxisID: 'y1'
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { position: 'bottom', labels: { color: COLORS.textDim, font: { family: 'Inter', size: 11 }, usePointStyle: true, boxWidth: 8 } },
                tooltip: tooltipStyle()
            },
            scales: {
                x: { ticks: { color: COLORS.textDim, font: { family: 'Inter', size: 10 } }, grid: { display: false } },
                y: {
                    beginAtZero: true,
                    position: 'left',
                    ticks: { color: COLORS.textDim },
                    grid: { color: 'rgba(214, 228, 240, 0.5)' }
                },
                y1: {
                    beginAtZero: true,
                    position: 'right',
                    ticks: { color: COLORS.primaryDark },
                    grid: { display: false }
                }
            }
        }
    });
}

// ============ KPIs ============
function calcularKPIs() {
    const cDespacho = col('CANTIDAD DE DESPACHOS') || col('CANT_DESPACHOS');
    const cVolumen = col('VOLUMEN M3');
    const cUSD = col('VALOR DE_VENTA_$') || col('VALOR DE VENTA_$');
    const cSoles = col('VALOR DE_VENTA_S/.') || col('VALOR DE VENTA_S/.');
    const cPais = col('COUNTRY');
    const cCliente = col('NOMBRE_CLIENTE');

    let despachos = 0, volumen = 0, usd = 0, soles = 0;
    const paises = new Set(), clientes = new Set();

    dataGlobal.forEach(f => {
        despachos += num(f[cDespacho]);
        volumen += num(f[cVolumen]);
        usd += num(f[cUSD]);
        soles += num(f[cSoles]);
        if (f[cPais]) paises.add(norm(f[cPais]));
        if (f[cCliente]) clientes.add(norm(f[cCliente]));
    });

    document.getElementById('kpiRow').innerHTML = `
        <div class="kpi-card"><div class="kpi-icon-circle"><i class="fas fa-boxes-stacked"></i></div>
            <div class="kpi-content"><span class="kpi-title">Despachos</span><span class="kpi-main">${despachos}</span><span class="kpi-trend">Total</span></div></div>
        <div class="kpi-card"><div class="kpi-icon-circle icon-cyan"><i class="fas fa-cube"></i></div>
            <div class="kpi-content"><span class="kpi-title">Volumen m³</span><span class="kpi-main">${volumen.toLocaleString('en-US', { maximumFractionDigits: 1 })}</span><span class="kpi-trend">Total</span></div></div>
        <div class="kpi-card"><div class="kpi-icon-circle icon-green"><i class="fas fa-dollar-sign"></i></div>
            <div class="kpi-content"><span class="kpi-title">Venta USD</span><span class="kpi-main">${moneyUSD(usd)}</span><span class="kpi-trend">Total</span></div></div>
        <div class="kpi-card"><div class="kpi-icon-circle icon-orange"><i class="fas fa-coins"></i></div>
            <div class="kpi-content"><span class="kpi-title">Venta S/</span><span class="kpi-main">${moneySoles(soles)}</span><span class="kpi-trend">Total</span></div></div>
        <div class="kpi-card"><div class="kpi-icon-circle icon-cyan"><i class="fas fa-globe"></i></div>
            <div class="kpi-content"><span class="kpi-title">Países</span><span class="kpi-main">${paises.size}</span><span class="kpi-trend">Destinos</span></div></div>
        <div class="kpi-card"><div class="kpi-icon-circle icon-green"><i class="fas fa-users"></i></div>
            <div class="kpi-content"><span class="kpi-title">Clientes</span><span class="kpi-main">${clientes.size}</span><span class="kpi-trend">Únicos</span></div></div>
    `;

    const center = document.getElementById('centerTotal');
    if (center) center.textContent = despachos;
}

// ============ FILTROS ============
function cargarFiltros() {
    llenar('filterMes', 'MES');
    llenar('filterSemana', 'SEMANA');
    llenar('filterUnidad', 'TIPO DE UNIDAD');
    llenar('filterPais', 'COUNTRY');
    llenar('filterIncoterm', 'INCOTERMS');
}

function llenar(id, columna) {
    const select = document.getElementById(id);
    if (!select) return;
    const c = col(columna);
    if (!c) return;
    const valores = [...new Set(dataGlobal.map(f => norm(f[c])).filter(v => v !== ''))];
    select.innerHTML = `<option value="">${columna}</option>`;
    valores.sort().forEach(v => {
        const opt = document.createElement('option');
        opt.value = v;
        opt.textContent = v;
        select.appendChild(opt);
    });
}

function aplicarFiltros() {
    const fecha = document.getElementById('filterFecha').value;
    const mes = document.getElementById('filterMes').value;
    const semana = document.getElementById('filterSemana').value;
    const unidad = document.getElementById('filterUnidad').value;
    const pais = document.getElementById('filterPais').value;
    const incoterm = document.getElementById('filterIncoterm').value;

    const cFecha = col('FECHA_TRANSACCION');
    const cMes = col('MES');
    const cSem = col('SEMANA');
    const cUni = col('TIPO DE UNIDAD');
    const cPais = col('COUNTRY');
    const cInc = col('INCOTERMS');

    const backup = dataGlobal;
    dataGlobal = backup.filter(f => {
        if (fecha) {
            const fechaFila = norm(f[cFecha]).split(' ')[0];
            if (fechaFila !== fecha) return false;
        }
        if (mes && norm(f[cMes]) !== mes) return false;
        if (semana && norm(f[cSem]) !== semana) return false;
        if (unidad && norm(f[cUni]) !== unidad) return false;
        if (pais && norm(f[cPais]) !== pais) return false;
        if (incoterm && norm(f[cInc]) !== incoterm) return false;
        return true;
    });

    calcularKPIs();
    crearGraficos();
    crearTablas();
    dataGlobal = backup;
}

// ============ GRÁFICOS ============
function crearGraficos() {
    const cMes = col('MES');
    const cSem = col('SEMANA');
    const cUSD = col('VALOR DE_VENTA_$') || col('VALOR DE VENTA_$');
    const cVol = col('VOLUMEN M3');
    const cDesp = col('CANTIDAD DE DESPACHOS') || col('CANT_DESPACHOS');
    const cTransp = col('TRANSPORTE');
    const cUni = col('TIPO DE UNIDAD');
    const cPais = col('COUNTRY');
    const cInc = col('INCOTERMS');

    // 1. Facturación por mes
    const porMesUSD = {};
    dataGlobal.forEach(f => {
        const m = norm(f[cMes]) || 'Sin mes';
        porMesUSD[m] = (porMesUSD[m] || 0) + num(f[cUSD]);
    });
    const mesesOrdenados = ordenarMeses(Object.keys(porMesUSD));
    renderLine('chartFactMes', mesesOrdenados, mesesOrdenados.map(m => porMesUSD[m]), COLORS.primary);

    // 2. Cantidad de despachos por mes
    const porMesDesp = {};
    dataGlobal.forEach(f => {
        const m = norm(f[cMes]) || 'Sin mes';
        porMesDesp[m] = (porMesDesp[m] || 0) + num(f[cDesp]);
    });
    renderLine('chartDespMes', mesesOrdenados, mesesOrdenados.map(m => porMesDesp[m]), COLORS.primaryDark);

    // 3. Volumen por mes
    const porMesVol = {};
    dataGlobal.forEach(f => {
        const m = norm(f[cMes]) || 'Sin mes';
        porMesVol[m] = (porMesVol[m] || 0) + num(f[cVol]);
    });
    renderLine('chartVolMes', mesesOrdenados, mesesOrdenados.map(m => porMesVol[m]), COLORS.green);

    // 4. Despachos por semana
    const porSemana = {};
    dataGlobal.forEach(f => {
        const s = norm(f[cSem]) || 'Sin semana';
        porSemana[s] = (porSemana[s] || 0) + num(f[cDesp]);
    });
    const semanasOrdenadas = Object.keys(porSemana).sort();
    renderLine('chartDespSem', semanasOrdenadas, semanasOrdenadas.map(s => porSemana[s]), COLORS.orange);

    // 5. Despachos por proveedor de transporte (ANILLO)
    const porTransp = {};
    dataGlobal.forEach(f => {
        const t = norm(f[cTransp]) || 'Sin transporte';
        porTransp[t] = (porTransp[t] || 0) + num(f[cDesp]);
    });
    renderDoughnut('chartTransporte', Object.keys(porTransp), Object.values(porTransp));

    // 6. Despachos por tipo de unidad
    const porUni = {};
    dataGlobal.forEach(f => {
        const u = norm(f[cUni]) || 'Sin tipo';
        porUni[u] = (porUni[u] || 0) + num(f[cDesp]);
    });
    renderBar('chartTipoUnidad', Object.keys(porUni), Object.values(porUni), COLORS.primary);

    // 7. Venta y despachos por país (COMBO)
    const porPaisUSD = {}, porPaisDesp = {};
    dataGlobal.forEach(f => {
        const p = norm(f[cPais]) || 'Sin país';
        porPaisUSD[p] = (porPaisUSD[p] || 0) + num(f[cUSD]);
        porPaisDesp[p] = (porPaisDesp[p] || 0) + num(f[cDesp]);
    });
    const paisesArr = Object.keys(porPaisUSD).sort((a, b) => porPaisUSD[b] - porPaisUSD[a]).slice(0, 10);
    renderCombo('chartPais', paisesArr, paisesArr.map(p => porPaisUSD[p]), paisesArr.map(p => porPaisDesp[p]), COLORS.primary, COLORS.orange);

    // 8. Venta y despachos por incoterm (COMBO)
    const porIncUSD = {}, porIncDesp = {};
    dataGlobal.forEach(f => {
        const i = norm(f[cInc]) || 'Sin incoterm';
        porIncUSD[i] = (porIncUSD[i] || 0) + num(f[cUSD]);
        porIncDesp[i] = (porIncDesp[i] || 0) + num(f[cDesp]);
    });
    const incArr = Object.keys(porIncUSD).sort((a, b) => porIncUSD[b] - porIncUSD[a]);
    renderCombo('chartIncoterm', incArr, incArr.map(i => porIncUSD[i]), incArr.map(i => porIncDesp[i]), COLORS.primaryDark, COLORS.green);
}

// ============ TABLAS ============
function crearTablas() {
    const cCliente = col('NOMBRE_CLIENTE');
    const cUSD = col('VALOR DE_VENTA_$') || col('VALOR DE VENTA_$');
    const cSoles = col('VALOR DE_VENTA_S/.') || col('VALOR DE VENTA_S/.');
    const cDesp = col('CANTIDAD DE DESPACHOS') || col('CANT_DESPACHOS');

    // Agrupar por cliente
    const porCliente = {};
    dataGlobal.forEach(f => {
        const c = norm(f[cCliente]) || 'Sin cliente';
        if (!porCliente[c]) porCliente[c] = { usd: 0, soles: 0, desp: 0 };
        porCliente[c].usd += num(f[cUSD]);
        porCliente[c].soles += num(f[cSoles]);
        porCliente[c].desp += num(f[cDesp]);
    });

    const clientesArr = Object.entries(porCliente).sort((a, b) => b[1].usd - a[1].usd);

    // Top 5 mayor venta
    const top5 = clientesArr.slice(0, 5);
    // Top 5 menor venta (excluyendo los que tienen 0 ventas, y los primeros 5)
    const bottom5 = clientesArr.filter(c => c[1].usd > 0).slice(-5).reverse();

    document.getElementById('tablaTopClientes').innerHTML = generarTablaHTML(top5);
    document.getElementById('tablaBottomClientes').innerHTML = generarTablaHTML(bottom5);
}

function generarTablaHTML(arr) {
    let html = '<table><thead><tr><th>Cliente</th><th>Venta $</th><th>Venta S/</th><th>Desp.</th></tr></thead><tbody>';
    arr.forEach(([nombre, d]) => {
        html += `<tr>
            <td>${nombre.substring(0, 35)}</td>
            <td>${moneyUSD(d.usd)}</td>
            <td>${moneySoles(d.soles)}</td>
            <td>${d.desp}</td>
        </tr>`;
    });
    html += '</tbody></table>';
    return html;
}

// ============ LIMPIAR ============
document.getElementById('clearFilters')?.addEventListener('click', () => {
    document.querySelectorAll('.filter-select').forEach(sel => sel.value = '');
    const fechaInput = document.getElementById('filterFecha');
    if (fechaInput) fechaInput.value = '';
    aplicarFiltros();
});

cargarDatos();