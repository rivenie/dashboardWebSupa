const SUPABASE_URL = "https://uoftarfxakkpevugdycg.supabase.co";
const SUPABASE_KEY = "sb_publishable_vT_w6EoVLl-BK12ojRTaOg_UeSXAVvh";
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

let dataGlobal = [];
let charts = {};

const COLORS = {
    accent: '#FF6B00',
    cyan: '#00D2FF',
    blue: '#2563EB',
    purple: '#8B5CF6',
    green: '#10B981',
    greenNeon: '#00E676',
    red: '#EF4444',
    gray: '#475569',
    textDim: '#94A3B8'
};

const PALETTE = [COLORS.accent, COLORS.cyan, COLORS.blue, COLORS.purple, COLORS.green, COLORS.gray, COLORS.red, COLORS.greenNeon];

document.getElementById('fechaActual').textContent = new Date().toLocaleDateString('es-PE', {
    day: '2-digit', month: 'short', year: 'numeric'
});

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
        crearTablaResumen();

        document.querySelectorAll('.filter-select').forEach(sel => {
            sel.addEventListener('change', aplicarFiltros);
        });
    } catch (err) {
        document.getElementById('loading').innerHTML = `
            <p style="color:#ff6b00;">No hay datos disponibles.</p>
            <p style="color:#94a3b8;margin-top:10px;">Sube un Excel desde el index.html.</p>
        `;
    }
}

// ============ HELPERS ============
function col(clave) {
    if (dataGlobal.length === 0) return null;
    const keys = Object.keys(dataGlobal[0]);
    return keys.find(k => k.trim().toLowerCase() === clave.trim().toLowerCase());
}

function norm(v) {
    return v !== undefined && v !== null ? v.toString().trim() : '';
}

function num(v) {
    if (typeof v === 'number') return v;
    if (!v) return 0;
    return parseFloat(v.toString().replace(/[^0-9.-]/g, '')) || 0;
}

function money(v) {
    return '$' + v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function moneySoles(v) {
    return 'S/ ' + v.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fechaCorta(f) {
    if (!f) return '';
    const partes = f.split('/');
    if (partes.length === 3) return partes[0] + '/' + partes[1];
    return f;
}

// ============ KPIs ============
function calcularKPIs() {
    const cDespacho = col('CANTIDAD DE DESPACHOS') || col('CANT_DESPACHOS');
    const cVolumen = col('VOLUMEN M3');
    const cUSD = col('VALOR DE_VENTA_$');
    const cSoles = col('VALOR DE_VENTA_S/.') || col('VALOR DE VENTA_S/.');
    const cPais = col('COUNTRY');
    const cPedido = col('PEDIDO');

    let despachos = 0, volumen = 0, usd = 0, soles = 0;
    const paises = new Set();

    dataGlobal.forEach(f => {
        despachos += num(f[cDespacho]);
        volumen += num(f[cVolumen]);
        usd += num(f[cUSD]);
        soles += num(f[cSoles]);
        if (f[cPais]) paises.add(norm(f[cPais]));
    });

    const ticket = dataGlobal.length > 0 ? usd / dataGlobal.length : 0;

    animar('kpiDespachos', despachos);
    document.getElementById('kpiVolumen').textContent = volumen.toLocaleString('en-US', { maximumFractionDigits: 1 });
    document.getElementById('kpiUSD').textContent = money(usd);
    document.getElementById('kpiSoles').textContent = moneySoles(soles);
    document.getElementById('kpiTicket').textContent = money(ticket);
    animar('kpiPaises', paises.size);
    document.getElementById('centerTotal').textContent = despachos;
}

function animar(id, valor) {
    const el = document.getElementById(id);
    const inicio = performance.now();
    const duracion = 800;
    function step(now) {
        const prog = Math.min((now - inicio) / duracion, 1);
        el.textContent = Math.floor(prog * valor);
        if (prog < 1) requestAnimationFrame(step);
        else el.textContent = valor;
    }
    requestAnimationFrame(step);
}

// ============ FILTROS ============
function cargarFiltros() {
    llenar('filterPais', 'COUNTRY');
    llenar('filterMes', 'MES');
    llenar('filterSemana', 'SEMANA');
    llenar('filterTransporte', 'TRANSPORTE');
    llenar('filterIncoterm', 'INCOTERMS');
    llenar('filterUnidad', 'TIPO DE UNIDAD');
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
    const pais = document.getElementById('filterPais').value;
    const mes = document.getElementById('filterMes').value;
    const semana = document.getElementById('filterSemana').value;
    const transporte = document.getElementById('filterTransporte').value;
    const incoterm = document.getElementById('filterIncoterm').value;
    const unidad = document.getElementById('filterUnidad').value;

    const cPais = col('COUNTRY');
    const cMes = col('MES');
    const cSemana = col('SEMANA');
    const cTrans = col('TRANSPORTE');
    const cInc = col('INCOTERMS');
    const cUni = col('TIPO DE UNIDAD');

    const filt = dataGlobal.filter(f => {
        if (pais && norm(f[cPais]) !== pais) return false;
        if (mes && norm(f[cMes]) !== mes) return false;
        if (semana && norm(f[cSemana]) !== semana) return false;
        if (transporte && norm(f[cTrans]) !== transporte) return false;
        if (incoterm && norm(f[cInc]) !== incoterm) return false;
        if (unidad && norm(f[cUni]) !== unidad) return false;
        return true;
    });

    const backup = dataGlobal;
    dataGlobal = filt;
    calcularKPIs();
    crearGraficos();
    crearTablaResumen();
    dataGlobal = backup;
}

// ============ GRÁFICOS ============
function crearGraficos() {
    const cFecha = col('FECHA_TRANSACCION');
    const cPais = col('COUNTRY');
    const cMes = col('MES');
    const cSemana = col('SEMANA');
    const cTrans = col('TRANSPORTE');
    const cInc = col('INCOTERMS');
    const cUni = col('TIPO DE UNIDAD');
    const cCliente = col('NOMBRE_CLIENTE');
    const cUSD = col('VALOR DE_VENTA_$');
    const cVolumen = col('VOLUMEN M3');
    const cDespacho = col('CANTIDAD DE DESPACHOS') || col('CANT_DESPACHOS');

    // 1. Evolución diaria
    const porDia = {};
    dataGlobal.forEach(f => {
        const fecha = fechaCorta(norm(f[cFecha]));
        if (!fecha) return;
        porDia[fecha] = (porDia[fecha] || 0) + num(f[cUSD]);
    });
    renderLine('chartEvolucion', Object.keys(porDia), Object.values(porDia));

    // 2. Ventas por País
    const porPais = {};
    dataGlobal.forEach(f => {
        const p = norm(f[cPais]) || 'Sin país';
        porPais[p] = (porPais[p] || 0) + num(f[cUSD]);
    });
    const paisesOrdenados = Object.entries(porPais).sort((a, b) => b[1] - a[1]).slice(0, 10);
    renderHBar('chartPais', paisesOrdenados.map(p => p[0]), paisesOrdenados.map(p => p[1]), COLORS.accent);

    // 3. Ventas por Mes
    const porMes = {};
    dataGlobal.forEach(f => {
        const m = norm(f[cMes]) || 'Sin mes';
        porMes[m] = (porMes[m] || 0) + num(f[cUSD]);
    });
    renderBar('chartMes', Object.keys(porMes), Object.values(porMes), COLORS.green);

    // 4. Incoterms
    const porInc = {};
    dataGlobal.forEach(f => {
        const i = norm(f[cInc]) || 'Sin incoterm';
        porInc[i] = (porInc[i] || 0) + num(f[cDespacho]);
    });
    renderDoughnut('chartIncoterm', Object.keys(porInc), Object.values(porInc));

    // 5. Tipo Unidad
    const porUni = {};
    dataGlobal.forEach(f => {
        const u = norm(f[cUni]) || 'Sin tipo';
        porUni[u] = (porUni[u] || 0) + num(f[cDespacho]);
    });
    renderDoughnut('chartUnidad', Object.keys(porUni), Object.values(porUni));

    // 6. Transportes
    const porTrans = {};
    dataGlobal.forEach(f => {
        const t = norm(f[cTrans]) || 'Sin transporte';
        porTrans[t] = (porTrans[t] || 0) + num(f[cDespacho]);
    });
    renderBar('chartTransporte', Object.keys(porTrans), Object.values(porTrans), COLORS.cyan);

    // 7. Top 10 clientes
    const porCliente = {};
    dataGlobal.forEach(f => {
        const cl = norm(f[cCliente]) || 'Sin cliente';
        porCliente[cl] = (porCliente[cl] || 0) + num(f[cUSD]);
    });
    const topClientes = Object.entries(porCliente).sort((a, b) => b[1] - a[1]).slice(0, 10);
    renderHBar('chartTopClientes', topClientes.map(c => c[0].substring(0, 25)), topClientes.map(c => c[1]), COLORS.purple);

    // 8. Volumen por país
    const volPorPais = {};
    dataGlobal.forEach(f => {
        const p = norm(f[cPais]) || 'Sin país';
        volPorPais[p] = (volPorPais[p] || 0) + num(f[cVolumen]);
    });
    const volOrdenado = Object.entries(volPorPais).sort((a, b) => b[1] - a[1]).slice(0, 10);
    renderHBar('chartVolumenPais', volOrdenado.map(v => v[0]), volOrdenado.map(v => v[1]), COLORS.cyan);

    // 9. Progreso por país (participación)
    const totalUSD = Object.values(porPais).reduce((a, b) => a + b, 0);
    const cont = document.getElementById('progressPaises');
    if (cont) {
        cont.innerHTML = '';
        paisesOrdenados.slice(0, 8).forEach(([pais, monto]) => {
            const percent = totalUSD > 0 ? ((monto / totalUSD) * 100).toFixed(1) : 0;
            const item = document.createElement('div');
            item.className = 'progress-item';
            item.innerHTML = `
                <div class="progress-header">
                    <span class="progress-label"><i class="fas fa-globe"></i> ${pais}</span>
                    <span class="progress-values">
                        <span class="progress-percent">${percent}%</span>
                        <span class="progress-count">${money(monto)}</span>
                    </span>
                </div>
                <div class="progress-bar-bg">
                    <div class="progress-bar-fill" style="width: ${percent}%"></div>
                </div>
            `;
            cont.appendChild(item);
        });
    }

    // 10. Despachos por semana
    const porSem = {};
    dataGlobal.forEach(f => {
        const s = norm(f[cSemana]) || 'Sin semana';
        porSem[s] = (porSem[s] || 0) + num(f[cDespacho]);
    });
    const semanasOrdenadas = Object.keys(porSem).sort();
    renderBar('chartSemana', semanasOrdenadas, semanasOrdenadas.map(s => porSem[s]), COLORS.accent);
}

// ============ RENDERIZADORES ============
function renderLine(id, labels, data) {
    const ctx = document.getElementById(id);
    if (!ctx) return;
    if (charts[id]) charts[id].destroy();

    const maxValue = Math.max(...data);
    const maxIndex = data.indexOf(maxValue);

    charts[id] = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: 'Ventas USD',
                data: data,
                borderColor: COLORS.cyan,
                backgroundColor: 'rgba(0, 210, 255, 0.1)',
                borderWidth: 3,
                tension: 0.4,
                fill: true,
                pointBackgroundColor: COLORS.cyan,
                pointBorderColor: '#1E293B',
                pointBorderWidth: 2,
                pointRadius: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    ...tooltipStyle(),
                    callbacks: {
                        afterBody: (c) => c[0].dataIndex === maxIndex ? '▲ MÁXIMO DEL PERIODO' : ''
                    }
                }
            },
            scales: {
                x: { ticks: { color: COLORS.textDim, font: { family: 'Inter', size: 10 } }, grid: { display: false } },
                y: { beginAtZero: true, ticks: { color: COLORS.textDim }, grid: { color: 'rgba(148,163,184,0.1)' } }
            }
        }
    });
}

function renderBar(id, labels, data, color) {
    const ctx = document.getElementById(id);
    if (!ctx) return;
    if (charts[id]) charts[id].destroy();

    charts[id] = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                data: data,
                backgroundColor: color,
                borderRadius: 6,
                borderSkipped: false,
                barThickness: 24
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false }, tooltip: tooltipStyle() },
            scales: {
                x: { ticks: { color: COLORS.textDim, font: { family: 'Inter', size: 10 } }, grid: { display: false } },
                y: { beginAtZero: true, ticks: { color: COLORS.textDim }, grid: { color: 'rgba(148,163,184,0.1)' } }
            }
        }
    });
}

function renderHBar(id, labels, data, color) {
    const ctx = document.getElementById(id);
    if (!ctx) return;
    if (charts[id]) charts[id].destroy();

    charts[id] = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                data: data,
                backgroundColor: color,
                borderRadius: 6,
                borderSkipped: false,
                barThickness: 16
            }]
        },
        options: {
            indexAxis: 'y',
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false }, tooltip: tooltipStyle() },
            scales: {
                x: { ticks: { color: COLORS.textDim, font: { family: 'Inter', size: 10 } }, grid: { color: 'rgba(148,163,184,0.1)' } },
                y: { ticks: { color: '#fff', font: { family: 'Inter', size: 10 } }, grid: { display: false } }
            }
        }
    });
}

function renderDoughnut(id, labels, data) {
    const ctx = document.getElementById(id);
    if (!ctx) return;
    if (charts[id]) charts[id].destroy();

    charts[id] = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: labels,
            datasets: [{
                data: data,
                backgroundColor: PALETTE.slice(0, labels.length),
                borderColor: '#1E293B',
                borderWidth: 3
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: '65%',
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: { color: COLORS.textDim, font: { family: 'Inter', size: 11 }, padding: 12, usePointStyle: true, boxWidth: 8 }
                },
                tooltip: tooltipStyle()
            }
        }
    });
}

function tooltipStyle() {
    return {
        backgroundColor: '#0F172A',
        titleColor: '#FF6B00',
        bodyColor: '#FFFFFF',
        borderColor: '#FF6B00',
        borderWidth: 1,
        padding: 12,
        cornerRadius: 8
    };
}

// ============ TABLA RESUMEN ============
function crearTablaResumen() {
    const cFecha = col('FECHA_TRANSACCION');
    const cPedido = col('PEDIDO');
    const cCliente = col('NOMBRE_CLIENTE');
    const cPais = col('COUNTRY');
    const cVolumen = col('VOLUMEN M3');
    const cUSD = col('VALOR DE_VENTA_$');
    const cSoles = col('VALOR DE_VENTA_S/.') || col('VALOR DE VENTA_S/.');
    const cInc = col('INCOTERMS');

    let html = '<table><thead><tr>';
    html += '<th>Fecha</th><th>Pedido</th><th>Cliente</th><th>País</th><th>Vol m³</th><th>USD</th><th>Soles</th><th>Incoterm</th>';
    html += '</tr></thead><tbody>';

    let totVol = 0, totUSD = 0, totSoles = 0;

    dataGlobal.forEach(f => {
        const vol = num(f[cVolumen]);
        const usd = num(f[cUSD]);
        const sol = num(f[cSoles]);

        totVol += vol;
        totUSD += usd;
        totSoles += sol;

        html += `<tr>
            <td>${norm(f[cFecha])}</td>
            <td>${norm(f[cPedido])}</td>
            <td>${norm(f[cCliente])}</td>
            <td>${norm(f[cPais])}</td>
            <td>${vol}</td>
            <td>${money(usd)}</td>
            <td>${moneySoles(sol)}</td>
            <td>${norm(f[cInc])}</td>
        </tr>`;
    });

    html += `<tr class="table-total-row">
        <td colspan="4">TOTAL</td>
        <td>${totVol.toLocaleString('en-US', { maximumFractionDigits: 1 })}</td>
        <td>${money(totUSD)}</td>
        <td>${moneySoles(totSoles)}</td>
        <td></td>
    </tr>`;

    html += '</tbody></table>';
    document.getElementById('tablaResumen').innerHTML = html;
}

// ============ LIMPIAR ============
document.getElementById('clearFilters')?.addEventListener('click', () => {
    document.querySelectorAll('.filter-select').forEach(sel => sel.value = '');
    aplicarFiltros();
});

cargarDatos();