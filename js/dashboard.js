const SUPABASE_URL = "https://uoftarfxakkpevugdycg.supabase.co";
const SUPABASE_KEY = "sb_publishable_vT_w6EoVLl-BK12ojRTaOg_UeSXAVvh";
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

let hojas = {};
let charts = {};

const COLORS = {
    accent: '#FF6B00', cyan: '#00D2FF', blue: '#2563EB', purple: '#8B5CF6',
    green: '#10B981', greenNeon: '#00E676', red: '#EF4444', yellow: '#FBBF24',
    gray: '#475569', textDim: '#94A3B8'
};
const PALETTE = [COLORS.accent, COLORS.cyan, COLORS.blue, COLORS.purple, COLORS.green, COLORS.yellow, COLORS.red, COLORS.greenNeon];

document.getElementById('fechaActual').textContent = new Date().toLocaleDateString('es-PE', { day: '2-digit', month: 'short', year: 'numeric' });

// ============ CARGA ============
async function cargarTodo() {
    const { data, error } = await supabaseClient.from('dashboard_data').select('*');
    if (error) throw error;

    hojas = {};
    data.forEach(row => {
        hojas[row.sheet_name] = row.data;
    });

    document.getElementById('loading').style.display = 'none';
    document.getElementById('dashboard').style.display = 'block';
}

// ============ HELPERS ============
function col(data, clave) {
    if (!data || data.length === 0) return null;
    const keys = Object.keys(data[0]);
    return keys.find(k => k.trim().toLowerCase() === clave.trim().toLowerCase());
}
function colParcial(data, contiene) {
    if (!data || data.length === 0) return null;
    const keys = Object.keys(data[0]);
    return keys.find(k => k.toLowerCase().includes(contiene.toLowerCase()));
}
function norm(v) { return v !== undefined && v !== null ? v.toString().trim() : ''; }
function num(v) {
    if (typeof v === 'number') return v;
    if (!v) return 0;
    return parseFloat(v.toString().replace(/,/g, '')) || 0;
}
function fechaCorta(f) {
    if (!f) return '';
    const partes = f.split(' ')[0].split('-');
    if (partes.length >= 3) return partes[2] + '/' + partes[1];
    return f;
}

// ============ RENDERIZADORES ============
function tooltipStyle() {
    return { backgroundColor: '#0F172A', titleColor: '#FF6B00', bodyColor: '#FFFFFF', borderColor: '#FF6B00', borderWidth: 1, padding: 12, cornerRadius: 8 };
}

function renderDoughnut(id, labels, data) {
    const ctx = document.getElementById(id);
    if (!ctx) return;
    if (charts[id]) charts[id].destroy();
    charts[id] = new Chart(ctx, {
        type: 'doughnut',
        data: { labels, datasets: [{ data, backgroundColor: PALETTE.slice(0, labels.length), borderColor: '#1E293B', borderWidth: 3 }] },
        options: { responsive: true, maintainAspectRatio: false, cutout: '65%',
            plugins: { legend: { position: 'bottom', labels: { color: COLORS.textDim, font: { family: 'Inter', size: 11 }, padding: 12, usePointStyle: true, boxWidth: 8 } }, tooltip: tooltipStyle() } }
    });
}

function renderBar(id, labels, data, color) {
    const ctx = document.getElementById(id);
    if (!ctx) return;
    if (charts[id]) charts[id].destroy();
    charts[id] = new Chart(ctx, {
        type: 'bar',
        data: { labels, datasets: [{ data, backgroundColor: color, borderRadius: 6, borderSkipped: false, barThickness: 22 }] },
        options: { responsive: true, maintainAspectRatio: false,
            plugins: { legend: { display: false }, tooltip: tooltipStyle() },
            scales: { x: { ticks: { color: COLORS.textDim, font: { family: 'Inter', size: 10 } }, grid: { display: false } }, y: { beginAtZero: true, ticks: { color: COLORS.textDim }, grid: { color: 'rgba(148,163,184,0.1)' } } } }
    });
}

function renderHBar(id, labels, data, color) {
    const ctx = document.getElementById(id);
    if (!ctx) return;
    if (charts[id]) charts[id].destroy();
    charts[id] = new Chart(ctx, {
        type: 'bar',
        data: { labels, datasets: [{ data, backgroundColor: color, borderRadius: 6, borderSkipped: false, barThickness: 16 }] },
        options: { indexAxis: 'y', responsive: true, maintainAspectRatio: false,
            plugins: { legend: { display: false }, tooltip: tooltipStyle() },
            scales: { x: { ticks: { color: COLORS.textDim, font: { family: 'Inter', size: 10 } }, grid: { color: 'rgba(148,163,184,0.1)' } }, y: { ticks: { color: '#fff', font: { family: 'Inter', size: 10 } }, grid: { display: false } } } }
    });
}

function renderLine(id, labels, data) {
    const ctx = document.getElementById(id);
    if (!ctx) return;
    if (charts[id]) charts[id].destroy();
    charts[id] = new Chart(ctx, {
        type: 'line',
        data: { labels, datasets: [{ data, borderColor: COLORS.cyan, backgroundColor: 'rgba(0, 210, 255, 0.1)', borderWidth: 3, tension: 0.4, fill: true, pointBackgroundColor: COLORS.cyan, pointBorderColor: '#1E293B', pointBorderWidth: 2, pointRadius: 4 }] },
        options: { responsive: true, maintainAspectRatio: false,
            plugins: { legend: { display: false }, tooltip: tooltipStyle() },
            scales: { x: { ticks: { color: COLORS.textDim, font: { family: 'Inter', size: 10 } }, grid: { display: false } }, y: { beginAtZero: true, ticks: { color: COLORS.textDim }, grid: { color: 'rgba(148,163,184,0.1)' } } } }
    });
}

// ============ HELPERS DE UI ============
function crearKPI(icono, clase, titulo, valor, sub) {
    return `
        <div class="kpi-card">
            <div class="kpi-icon-circle ${clase}"><i class="fas ${icono}"></i></div>
            <div class="kpi-content">
                <span class="kpi-title">${titulo}</span>
                <span class="kpi-main">${valor}</span>
                <span class="kpi-trend trend-up">${sub}</span>
            </div>
        </div>
    `;
}

function crearChart(id, icono, titulo, full = false) {
    return `
        <div class="chart-exec-card ${full ? 'chart-full' : ''}">
            <div class="chart-exec-header">
                <i class="fas ${icono} chart-icon"></i>
                <h3>${titulo}</h3>
            </div>
            <canvas id="${id}"></canvas>
        </div>
    `;
}

function crearChartDonut(id, icono, titulo) {
    return `
        <div class="chart-exec-card">
            <div class="chart-exec-header">
                <i class="fas ${icono} chart-icon"></i>
                <h3>${titulo}</h3>
            </div>
            <div class="chart-doughnut-wrapper">
                <canvas id="${id}"></canvas>
                <div class="chart-doughnut-center">
                    <span class="center-value" id="centerTotal">0</span>
                    <span class="center-label">TOTAL</span>
                </div>
            </div>
        </div>
    `;
}

function crearChartProgress(id, icono, titulo) {
    return `
        <div class="chart-exec-card">
            <div class="chart-exec-header">
                <i class="fas ${icono} chart-icon"></i>
                <h3>${titulo}</h3>
            </div>
            <div class="progress-list" id="${id}"></div>
        </div>
    `;
}

function crearChartTabla(icono, titulo) {
    return `
        <div class="chart-exec-card chart-full">
            <div class="chart-exec-header">
                <i class="fas ${icono} chart-icon"></i>
                <h3>${titulo}</h3>
            </div>
            <div id="tablaResumen"></div>
        </div>
    `;
}

// ============================================================
// DASHBOARD COMBUSTIBLE
// ============================================================
async function iniciarDashboardCombustible() {
    await cargarTodo();

    const noche = hojas['T. NOCHE DESPACHO'] || [];
    const dia = hojas['T. DIA DESPACHO'] || [];
    const abastCis = hojas['ABAST. DIESEL.CISTERNA'] || [];

    const cGalNoche = col(noche, 'GALONES');
    const cGalDia = col(dia, 'GALONES');

    const totalNoche = noche.reduce((a, f) => a + num(f[cGalNoche]), 0);
    const totalDia = dia.reduce((a, f) => a + num(f[cGalDia]), 0);
    const totalGeneral = totalNoche + totalDia;

    document.getElementById('kpiRow').innerHTML = `
        ${crearKPI('fa-gas-pump', '', 'Galones Noche', totalNoche.toFixed(1), 'Despachados')}
        ${crearKPI('fa-sun', 'icon-yellow', 'Galones Día', totalDia.toFixed(1), 'Despachados')}
        ${crearKPI('fa-tint', 'icon-cyan', 'Total Galones', totalGeneral.toFixed(1), 'General')}
        ${crearKPI('fa-truck', 'icon-green', 'Despachos Noche', noche.length, 'Registros')}
        ${crearKPI('fa-truck-fast', 'icon-green', 'Despachos Día', dia.length, 'Registros')}
        ${crearKPI('fa-database', 'icon-red', 'Abast. Cisterna', abastCis.length, 'Eventos')}
    `;

    document.getElementById('filtersRow').innerHTML = ``;

    document.getElementById('chartsGrid').innerHTML = `
        ${crearChart('chartComparativo', 'fa-chart-column', 'Comparativo Noche vs Día')}
        ${crearChartDonut('chartCisternas', 'fa-database', 'Galones por Cisterna')}
        ${crearChart('chartTopCamiones', 'fa-ranking-star', 'Top 10 Camiones por Galones')}
        ${crearChart('chartConsumoCamion', 'fa-truck', 'Consumo por Camión (Noche)')}
        ${crearChartProgress('progressCisternas', 'fa-gauge-high', 'Participación por Cisterna')}
        ${crearChartTabla('fa-table', 'Detalle de Despachos (Noche)')}
    `;

    renderBar('chartComparativo', ['Turno Noche', 'Turno Día'], [totalNoche, totalDia], COLORS.accent);

    const porCisterna = {};
    [...noche, ...dia].forEach(f => {
        const c = norm(f[col(noche, 'CISTERNA')] || f[col(dia, 'CISTERNA')]) || 'Sin cisterna';
        porCisterna[c] = (porCisterna[c] || 0) + num(f[col(noche, 'GALONES')] || f[col(dia, 'GALONES')]);
    });
    renderDoughnut('chartCisternas', Object.keys(porCisterna), Object.values(porCisterna));

    const porCamion = {};
    [...noche, ...dia].forEach(f => {
        const c = norm(f[col(noche, 'CAMION')] || f[col(dia, 'CAMION')]) || 'Sin camión';
        porCamion[c] = (porCamion[c] || 0) + num(f[col(noche, 'GALONES')] || f[col(dia, 'GALONES')]);
    });
    const topCamiones = Object.entries(porCamion).sort((a, b) => b[1] - a[1]).slice(0, 10);
    renderHBar('chartTopCamiones', topCamiones.map(t => t[0]), topCamiones.map(t => t[1]), COLORS.accent);

    const nochePorCamion = {};
    noche.forEach(f => {
        const c = norm(f[col(noche, 'CAMION')]) || 'Sin camión';
        nochePorCamion[c] = (nochePorCamion[c] || 0) + num(f[col(noche, 'GALONES')]);
    });
    const topNoche = Object.entries(nochePorCamion).sort((a, b) => b[1] - a[1]).slice(0, 12);
    renderBar('chartConsumoCamion', topNoche.map(t => t[0]), topNoche.map(t => t[1]), COLORS.cyan);

    const totalCis = Object.values(porCisterna).reduce((a, b) => a + b, 0);
    const contCis = document.getElementById('progressCisternas');
    contCis.innerHTML = '';
    Object.entries(porCisterna).sort((a, b) => b[1] - a[1]).forEach(([cis, val]) => {
        const pct = totalCis > 0 ? ((val / totalCis) * 100).toFixed(1) : 0;
        contCis.innerHTML += `
            <div class="progress-item">
                <div class="progress-header">
                    <span class="progress-label"><i class="fas fa-database"></i> ${cis}</span>
                    <span class="progress-values"><span class="progress-percent">${pct}%</span><span class="progress-count">${val.toFixed(0)} gl</span></span>
                </div>
                <div class="progress-bar-bg"><div class="progress-bar-fill" style="width: ${pct}%"></div></div>
            </div>
        `;
    });

    const cFecha = col(noche, 'FECHA'), cCam = col(noche, 'CAMION'), cGal = col(noche, 'GALONES'), cCis = col(noche, 'CISTERNA'), cTurn = col(noche, 'TURNO');
    let html = '<table><thead><tr><th>Fecha</th><th>Camión</th><th>Cisterna</th><th>Turno</th><th>Galones</th></tr></thead><tbody>';
    noche.slice(0, 100).forEach(f => {
        html += `<tr><td>${norm(f[cFecha]).split(' ')[0]}</td><td>${norm(f[cCam])}</td><td>${norm(f[cCis])}</td><td>${norm(f[cTurn])}</td><td>${num(f[cGal]).toFixed(2)}</td></tr>`;
    });
    html += '</tbody></table>';
    document.getElementById('tablaResumen').innerHTML = html;

    document.getElementById('centerTotal').textContent = totalGeneral.toFixed(0);
}

// ============================================================
// DASHBOARD KILOMETRAJE
// ============================================================
async function iniciarDashboardKilometraje() {
    await cargarTodo();

    const km2107 = hojas['KILOMETRAJE 2107'] || [];
    const km2248 = hojas['KILOMETRAJE 2248'] || [];
    const operatividad = hojas['OPERATIVIDAD'] || [];

    // DEBUG
    console.log('=== KILOMETRAJE 2107 - Primera fila ===');
    console.log(km2107[0]);
    console.log('=== Claves ===');
    console.log(km2107.length > 0 ? Object.keys(km2107[0]) : 'Sin datos');

    // Buscar columnas por nombre (con búsqueda parcial por si tienen prefijo)
    const cFecha = col(km2107, 'FECHA') || colParcial(km2107, 'fecha');
    const cTurno = col(km2107, 'TURNO') || colParcial(km2107, 'turno');
    const cKI = col(km2107, 'Kilometraje KI') || colParcial(km2107, 'KI');
    const cKF = col(km2107, 'Kilometraje KF') || colParcial(km2107, 'KF');
    const cHR = col(km2107, 'HR MOTOR ACUM.') || colParcial(km2107, 'HR MOTOR');
    const cAdBlue = col(km2107, 'NIVEL DE ADBLUE') || colParcial(km2107, 'ADBLUE');

    console.log('Columnas detectadas:', { cFecha, cTurno, cKI, cKF, cHR, cAdBlue });

    // Calcular km
    let totalKm2107 = 0;
    km2107.forEach(f => {
        const ki = num(f[cKI]);
        const kf = num(f[cKF]);
        const dif = kf - ki;
        if (dif > 0 && dif < 500) totalKm2107 += dif;
    });

    let totalKm2248 = 0;
    const cFecha2 = col(km2248, 'FECHA') || colParcial(km2248, 'fecha');
    const cTurno2 = col(km2248, 'TURNO') || colParcial(km2248, 'turno');
    const cKI2 = col(km2248, 'Kilometraje KI') || colParcial(km2248, 'KI');
    const cKF2 = col(km2248, 'Kilometraje KF') || colParcial(km2248, 'KF');
    const cHR2 = col(km2248, 'HR MOTOR ACUM.') || colParcial(km2248, 'HR MOTOR');
    const cAdBlue2 = col(km2248, 'NIVEL DE ADBLUE') || colParcial(km2248, 'ADBLUE');

    km2248.forEach(f => {
        const ki = num(f[cKI2]);
        const kf = num(f[cKF2]);
        const dif = kf - ki;
        if (dif > 0 && dif < 500) totalKm2248 += dif;
    });

    document.getElementById('kpiRow').innerHTML = `
        ${crearKPI('fa-road', '', 'Km 2107', totalKm2107.toFixed(0), 'Recorridos')}
        ${crearKPI('fa-road', 'icon-cyan', 'Km 2248', totalKm2248.toFixed(0), 'Recorridos')}
        ${crearKPI('fa-tachometer-alt', 'icon-green', 'Total Km', (totalKm2107 + totalKm2248).toFixed(0), 'Flota')}
        ${crearKPI('fa-clock', 'icon-yellow', 'Registros 2107', km2107.length, 'Eventos')}
        ${crearKPI('fa-clock', 'icon-yellow', 'Registros 2248', km2248.length, 'Eventos')}
        ${crearKPI('fa-truck', 'icon-red', 'Operatividad', operatividad.length, 'Días')}
    `;

    document.getElementById('filtersRow').innerHTML = ``;

    document.getElementById('chartsGrid').innerHTML = `
        ${crearChart('chartComparativoKm', 'fa-chart-column', 'Km Recorridos por Cisterna')}
        ${crearChartDonut('chartTurnos', 'fa-clock', 'Distribución por Turno (2107)')}
        ${crearChart('chartKm2107', 'fa-chart-line', 'Evolución Diaria Km 2107')}
        ${crearChart('chartKm2248', 'fa-chart-line', 'Evolución Diaria Km 2248')}
        ${crearChart('chartHoras', 'fa-tachometer-alt', 'Horas Motor Acumuladas')}
        ${crearChart('chartAdblue', 'fa-tint', 'Nivel AdBlue por Turno')}
        ${crearChartProgress('progressOperatividad', 'fa-check-circle', 'Operatividad por Unidad')}
        ${crearChartTabla('fa-table', 'Detalle 2107')}
    `;

    renderBar('chartComparativoKm', ['2107', '2248'], [totalKm2107, totalKm2248], COLORS.accent);

    const porTurno = {};
    km2107.forEach(f => {
        const t = norm(f[cTurno]) || 'Sin turno';
        porTurno[t] = (porTurno[t] || 0) + 1;
    });
    renderDoughnut('chartTurnos', Object.keys(porTurno), Object.values(porTurno));

    const kmPorDia2107 = {};
    km2107.forEach(f => {
        const fecha = fechaCorta(norm(f[cFecha]));
        const ki = num(f[cKI]);
        const kf = num(f[cKF]);
        const dif = kf - ki;
        if (fecha && dif > 0 && dif < 500) kmPorDia2107[fecha] = (kmPorDia2107[fecha] || 0) + dif;
    });
    renderLine('chartKm2107', Object.keys(kmPorDia2107), Object.values(kmPorDia2107));

    const kmPorDia2248 = {};
    km2248.forEach(f => {
        const fecha = fechaCorta(norm(f[cFecha2]));
        const ki = num(f[cKI2]);
        const kf = num(f[cKF2]);
        const dif = kf - ki;
        if (fecha && dif > 0 && dif < 500) kmPorDia2248[fecha] = (kmPorDia2248[fecha] || 0) + dif;
    });
    renderLine('chartKm2248', Object.keys(kmPorDia2248), Object.values(kmPorDia2248));

    const ultimo2107 = km2107.length > 0 ? num(km2107[km2107.length - 1][cHR]) : 0;
    const ultimo2248 = km2248.length > 0 ? num(km2248[km2248.length - 1][cHR2]) : 0;
    renderBar('chartHoras', ['2107', '2248'], [ultimo2107, ultimo2248], COLORS.cyan);

    const adblueData2107 = km2107.slice(0, 30).map(f => num(f[cAdBlue]) * 100);
    const fechas2107 = km2107.slice(0, 30).map(f => fechaCorta(norm(f[cFecha])));
    renderLine('chartAdblue', fechas2107, adblueData2107);

    const cont = document.getElementById('progressOperatividad');
    cont.innerHTML = '';
    const unidades = ['CJW-817', 'CJU-888', 'BVC-938', 'X6F-783', 'X5Y-834'];
    unidades.forEach(u => {
        cont.innerHTML += `
            <div class="progress-item">
                <div class="progress-header">
                    <span class="progress-label"><i class="fas fa-truck"></i> ${u}</span>
                    <span class="progress-values"><span class="progress-percent">100%</span><span class="progress-count">Operativo</span></span>
                </div>
                <div class="progress-bar-bg"><div class="progress-bar-fill" style="width: 100%"></div></div>
            </div>
        `;
    });

    let html = '<table><thead><tr><th>Fecha</th><th>Turno</th><th>KI</th><th>KF</th><th>Km</th><th>Hr Motor</th><th>AdBlue</th></tr></thead><tbody>';
    km2107.slice(0, 100).forEach(f => {
        const ki = num(f[cKI]);
        const kf = num(f[cKF]);
        const dif = kf - ki;
        html += `<tr>
            <td>${norm(f[cFecha]).split(' ')[0]}</td>
            <td>${norm(f[cTurno])}</td>
            <td>${ki}</td>
            <td>${kf}</td>
            <td>${dif > 0 && dif < 500 ? dif.toFixed(0) : 0}</td>
            <td>${num(f[cHR])}</td>
            <td>${(num(f[cAdBlue]) * 100).toFixed(0)}%</td>
        </tr>`;
    });
    html += '</tbody></table>';
    document.getElementById('tablaResumen').innerHTML = html;

    document.getElementById('centerTotal').textContent = (totalKm2107 + totalKm2248).toFixed(0);
}

// ============================================================
// DASHBOARD MANO DE OBRA
// ============================================================
async function iniciarDashboardHH() {
    await cargarTodo();

    document.getElementById('kpiRow').innerHTML = `
        ${crearKPI('fa-users', '', 'Total Personal', '44', 'Directo')}
        ${crearKPI('fa-user-tie', 'icon-cyan', 'Indirecto', '33', 'Personal')}
        ${crearKPI('fa-clock', 'icon-green', 'HH Directa', '44', 'Del informe')}
        ${crearKPI('fa-clock', 'icon-yellow', 'HH Indirecta', '33', 'Del informe')}
        ${crearKPI('fa-calendar-check', 'icon-green', 'Días Libres', '5', 'Promedio')}
        ${crearKPI('fa-user-md', 'icon-red', 'Descansos', '0', 'Médicos')}
    `;

    document.getElementById('filtersRow').innerHTML = ``;

    document.getElementById('chartsGrid').innerHTML = `
        ${crearChart('chartDirectoIndirecto', 'fa-chart-column', 'Personal Directo vs Indirecto')}
        ${crearChartDonut('chartDistribucion', 'fa-users', 'Distribución por Cargo')}
        ${crearChart('chartHH', 'fa-clock', 'HH por Cargo')}
        ${crearChart('chartAsistencia', 'fa-calendar-check', 'Asistencia (Contratado vs Obra)')}
        ${crearChartProgress('progressPersonal', 'fa-gauge-high', 'Resumen de Personal')}
        ${crearChartTabla('fa-table', 'Detalle de Personal')}
    `;

    renderBar('chartDirectoIndirecto', ['Directo', 'Indirecto'], [44, 33], COLORS.accent);
    renderDoughnut('chartDistribucion', ['Conductor', 'Auxiliar', 'Supervisor', 'Admin', 'Gerencia'], [6, 3, 3, 1, 1]);
    renderBar('chartHH', ['Conductor', 'Auxiliar', 'Supervisor', 'Gerencia'], [22, 11, 11, 8], COLORS.cyan);
    renderBar('chartAsistencia', ['Contratado', 'En Obra'], [12, 5], COLORS.green);

    const cont = document.getElementById('progressPersonal');
    cont.innerHTML = `
        <div class="progress-item">
            <div class="progress-header">
                <span class="progress-label"><i class="fas fa-user"></i> Directo</span>
                <span class="progress-values"><span class="progress-percent">57%</span><span class="progress-count">44 HH</span></span>
            </div>
            <div class="progress-bar-bg"><div class="progress-bar-fill" style="width: 57%"></div></div>
        </div>
        <div class="progress-item">
            <div class="progress-header">
                <span class="progress-label"><i class="fas fa-user-tie"></i> Indirecto</span>
                <span class="progress-values"><span class="progress-percent">43%</span><span class="progress-count">33 HH</span></span>
            </div>
            <div class="progress-bar-bg"><div class="progress-bar-fill" style="width: 43%"></div></div>
        </div>
    `;

    document.getElementById('tablaResumen').innerHTML = '<p style="color:#94a3b8;padding:20px;">Reporte Daily Report de Mano de Obra · Consultar detalle en la hoja HH SETIEMBRE.</p>';
    document.getElementById('centerTotal').textContent = '77';
}