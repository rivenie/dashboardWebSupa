const SUPABASE_URL = "https://uoftarfxakkpevugdycg.supabase.co";
const SUPABASE_KEY = "sb_publishable_vT_w6EoVLl-BK12ojRTaOg_UeSXAVvh";
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

let dataGlobal = [];
let charts = {};

const COLORS = {
    accent: '#FF6B00', cyan: '#00D2FF', blue: '#2563EB', purple: '#8B5CF6',
    green: '#10B981', greenNeon: '#00E676', red: '#EF4444', yellow: '#FBBF24',
    gray: '#475569', textDim: '#94A3B8'
};
const PALETTE = [COLORS.accent, COLORS.cyan, COLORS.blue, COLORS.purple, COLORS.green, COLORS.yellow, COLORS.red, COLORS.greenNeon];

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
function norm(v) { return v !== undefined && v !== null ? v.toString().trim() : ''; }
function num(v) {
    if (typeof v === 'number') return v;
    if (!v) return 0;
    return parseFloat(v.toString().replace(/[^0-9.-]/g, '')) || 0;
}
function money(v) { return 'S/ ' + v.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }

// ============ RENDERIZADORES ============
function tooltipStyle() {
    return { backgroundColor: '#0F172A', titleColor: '#FF6B00', bodyColor: '#FFFFFF', borderColor: '#FF6B00', borderWidth: 1, padding: 12, cornerRadius: 8 };
}

function renderLine(id, labels, data) {
    const ctx = document.getElementById(id);
    if (!ctx) return;
    if (charts[id]) charts[id].destroy();
    charts[id] = new Chart(ctx, {
        type: 'line',
        data: { labels, datasets: [{ data, borderColor: COLORS.accent, backgroundColor: 'rgba(255, 107, 0, 0.1)', borderWidth: 3, tension: 0.4, fill: true, pointBackgroundColor: COLORS.accent, pointBorderColor: '#1E293B', pointBorderWidth: 2, pointRadius: 5 }] },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: tooltipStyle() }, scales: { x: { ticks: { color: COLORS.textDim, font: { family: 'Inter', size: 10 } }, grid: { display: false } }, y: { beginAtZero: true, ticks: { color: COLORS.textDim }, grid: { color: 'rgba(148,163,184,0.1)' } } } }
    });
}

function renderGrouped(id, labels, d1, d2) {
    const ctx = document.getElementById(id);
    if (!ctx) return;
    if (charts[id]) charts[id].destroy();
    charts[id] = new Chart(ctx, {
        type: 'bar',
        data: { labels, datasets: [
            { label: 'Usado', data: d1, backgroundColor: COLORS.accent, borderRadius: 4, barThickness: 16 },
            { label: 'Stock', data: d2, backgroundColor: COLORS.cyan, borderRadius: 4, barThickness: 16 }
        ]},
        options: { responsive: true, maintainAspectRatio: false,
            plugins: { legend: { labels: { color: COLORS.textDim, font: { family: 'Inter', size: 11 } } }, tooltip: tooltipStyle() },
            scales: { x: { ticks: { color: COLORS.textDim, font: { family: 'Inter', size: 10 } }, grid: { display: false } }, y: { beginAtZero: true, ticks: { color: COLORS.textDim }, grid: { color: 'rgba(148,163,184,0.1)' } } }
        }
    });
}

function renderStacked(id, labels, datasets) {
    const ctx = document.getElementById(id);
    if (!ctx) return;
    if (charts[id]) charts[id].destroy();
    charts[id] = new Chart(ctx, {
        type: 'bar',
        data: { labels, datasets },
        options: { responsive: true, maintainAspectRatio: false,
            plugins: { legend: { position: 'bottom', labels: { color: COLORS.textDim, font: { family: 'Inter', size: 10 }, usePointStyle: true, boxWidth: 8 } }, tooltip: tooltipStyle() },
            scales: { x: { stacked: true, ticks: { color: COLORS.textDim, font: { family: 'Inter', size: 10 } }, grid: { display: false } }, y: { stacked: true, beginAtZero: true, ticks: { color: COLORS.textDim }, grid: { color: 'rgba(148,163,184,0.1)' } } }
        }
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
            scales: { x: { ticks: { color: COLORS.textDim, font: { family: 'Inter', size: 10 } }, grid: { color: 'rgba(148,163,184,0.1)' } }, y: { ticks: { color: '#fff', font: { family: 'Inter', size: 10 } }, grid: { display: false } } }
        }
    });
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

// ============ KPIs ============
function calcularKPIs() {
    const cIngresada = col('Cantidad Ingresada');
    const cUsada = col('Cantidad Usada');
    const cStock = col('Stock Actual');
    const cCostoTotal = col('Costo Total (S/)') || col('Costo Total');
    const cMateria = col('Materia Prima');
    const cArea = col('Área Destino');

    let totalIng = 0, totalUsa = 0, totalStock = 0, totalCosto = 0;
    const materias = new Set(), areas = new Set();

    dataGlobal.forEach(f => {
        totalIng += num(f[cIngresada]);
        totalUsa += num(f[cUsada]);
        totalStock += num(f[cStock]);
        totalCosto += num(f[cCostoTotal]);
        if (f[cMateria]) materias.add(norm(f[cMateria]));
        if (f[cArea]) areas.add(norm(f[cArea]));
    });

    document.getElementById('kpiRow').innerHTML = `
        <div class="kpi-card"><div class="kpi-icon-circle"><i class="fas fa-boxes-stacked"></i></div>
            <div class="kpi-content"><span class="kpi-title">Ingresado</span><span class="kpi-main">${totalIng.toFixed(0)}</span><span class="kpi-trend trend-up">Unidades</span></div></div>
        <div class="kpi-card"><div class="kpi-icon-circle icon-cyan"><i class="fas fa-industry"></i></div>
            <div class="kpi-content"><span class="kpi-title">Usado</span><span class="kpi-main">${totalUsa.toFixed(0)}</span><span class="kpi-trend trend-up">Unidades</span></div></div>
        <div class="kpi-card"><div class="kpi-icon-circle icon-green"><i class="fas fa-warehouse"></i></div>
            <div class="kpi-content"><span class="kpi-title">Stock Actual</span><span class="kpi-main">${totalStock.toFixed(0)}</span><span class="kpi-trend trend-up">Disponible</span></div></div>
        <div class="kpi-card"><div class="kpi-icon-circle icon-yellow"><i class="fas fa-coins"></i></div>
            <div class="kpi-content"><span class="kpi-title">Costo Total</span><span class="kpi-main">${money(totalCosto)}</span><span class="kpi-trend trend-up">Acumulado</span></div></div>
        <div class="kpi-card"><div class="kpi-icon-circle icon-orange"><i class="fas fa-lemon"></i></div>
            <div class="kpi-content"><span class="kpi-title">Materias</span><span class="kpi-main">${materias.size}</span><span class="kpi-trend trend-up">Tipos</span></div></div>
        <div class="kpi-card"><div class="kpi-icon-circle icon-red"><i class="fas fa-map-marker-alt"></i></div>
            <div class="kpi-content"><span class="kpi-title">Áreas</span><span class="kpi-main">${areas.size}</span><span class="kpi-trend trend-up">Destinos</span></div></div>
    `;

    document.getElementById('centerTotal').textContent = totalCosto.toFixed(0);
    document.getElementById('centerTotalArea').textContent = totalStock.toFixed(0);
}

// ============ FILTROS ============
function cargarFiltros() {
    llenar('filterMateria', 'Materia Prima');
    llenar('filterArea', 'Área Destino');
    llenar('filterProveedor', 'Proveedor');
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
    const m = document.getElementById('filterMateria').value;
    const a = document.getElementById('filterArea').value;
    const p = document.getElementById('filterProveedor').value;

    const cM = col('Materia Prima'), cA = col('Área Destino'), cP = col('Proveedor');

    const filt = dataGlobal.filter(f => {
        if (m && norm(f[cM]) !== m) return false;
        if (a && norm(f[cA]) !== a) return false;
        if (p && norm(f[cP]) !== p) return false;
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
    const cFecha = col('Fecha');
    const cMateria = col('Materia Prima');
    const cIngresada = col('Cantidad Ingresada');
    const cUsada = col('Cantidad Usada');
    const cStock = col('Stock Actual');
    const cProveedor = col('Proveedor');
    const cCostoTotal = col('Costo Total (S/)') || col('Costo Total');
    const cArea = col('Área Destino');

    // 1. Evolución de ingreso de limón por fecha
    const porFecha = {};
    dataGlobal.filter(f => norm(f[cMateria]).toLowerCase().includes('limón') || norm(f[cMateria]).toLowerCase().includes('limon'))
        .forEach(f => {
            const fecha = norm(f[cFecha]);
            porFecha[fecha] = (porFecha[fecha] || 0) + num(f[cIngresada]);
        });
    const fechasOrdenadas = Object.keys(porFecha).sort((a, b) => {
        const [da, ma, ya] = a.split('/');
        const [db, mb, yb] = b.split('/');
        return new Date(ya, ma - 1, da) - new Date(yb, mb - 1, db);
    });
    renderLine('chartEvolucion', fechasOrdenadas, fechasOrdenadas.map(f => porFecha[f]));

    // 2. Uso vs Stock por materia prima
    const porMateriaUso = {}, porMateriaStock = {};
    dataGlobal.forEach(f => {
        const m = norm(f[cMateria]);
        if (!m) return;
        porMateriaUso[m] = (porMateriaUso[m] || 0) + num(f[cUsada]);
        porMateriaStock[m] = (porMateriaStock[m] || 0) + num(f[cStock]);
    });
    renderGrouped('chartUsoStock', Object.keys(porMateriaUso), Object.values(porMateriaUso), Object.values(porMateriaStock));

    // 3. Distribución de costos por materia prima
    const porMateriaCosto = {};
    dataGlobal.forEach(f => {
        const m = norm(f[cMateria]);
        if (!m) return;
        porMateriaCosto[m] = (porMateriaCosto[m] || 0) + num(f[cCostoTotal]);
    });
    renderDoughnut('chartCostos', Object.keys(porMateriaCosto), Object.values(porMateriaCosto));

    // 4. Rendimiento: limón → jugo + aceite + cáscara
    const rendimiento = {};
    dataGlobal.forEach(f => {
        const fecha = norm(f[cFecha]);
        const materia = norm(f[cMateria]).toLowerCase();
        if (!rendimiento[fecha]) rendimiento[fecha] = { jugo: 0, aceite: 0, cascara: 0 };
        if (materia.includes('jugo')) rendimiento[fecha].jugo += num(f[cIngresada]);
        if (materia.includes('aceite')) rendimiento[fecha].aceite += num(f[cIngresada]);
        if (materia.includes('cáscara') || materia.includes('cascara')) rendimiento[fecha].cascara += num(f[cIngresada]);
    });
    const fechasRend = Object.keys(rendimiento).sort((a, b) => {
        const [da, ma, ya] = a.split('/');
        const [db, mb, yb] = b.split('/');
        return new Date(ya, ma - 1, da) - new Date(yb, mb - 1, db);
    });
    renderStacked('chartRendimiento', fechasRend, [
        { label: 'Jugo', data: fechasRend.map(f => rendimiento[f].jugo), backgroundColor: COLORS.accent, borderRadius: 4 },
        { label: 'Aceite', data: fechasRend.map(f => rendimiento[f].aceite), backgroundColor: COLORS.cyan, borderRadius: 4 },
        { label: 'Cáscara', data: fechasRend.map(f => rendimiento[f].cascara), backgroundColor: COLORS.green, borderRadius: 4 }
    ]);

    // 5. Costo total por proveedor
    const porProveedor = {};
    dataGlobal.forEach(f => {
        const p = norm(f[cProveedor]) || 'Sin proveedor';
        porProveedor[p] = (porProveedor[p] || 0) + num(f[cCostoTotal]);
    });
    const proveedoresOrdenados = Object.entries(porProveedor).sort((a, b) => b[1] - a[1]);
    renderHBar('chartProveedor', proveedoresOrdenados.map(p => p[0]), proveedoresOrdenados.map(p => p[1]), COLORS.accent);

    // 6. Stock actual por área destino
    const porArea = {};
    dataGlobal.forEach(f => {
        const a = norm(f[cArea]) || 'Sin área';
        porArea[a] = (porArea[a] || 0) + num(f[cStock]);
    });
    renderDoughnut('chartArea', Object.keys(porArea), Object.values(porArea));
}

// ============ TABLA ============
function crearTablaResumen() {
    const cFecha = col('Fecha');
    const cMateria = col('Materia Prima');
    const cUnidad = col('Unidad');
    const cIngresada = col('Cantidad Ingresada');
    const cUsada = col('Cantidad Usada');
    const cStock = col('Stock Actual');
    const cProveedor = col('Proveedor');
    const cCostoUnit = col('Costo Unitario (S/)') || col('Costo Unitario');
    const cCostoTotal = col('Costo Total (S/)') || col('Costo Total');
    const cArea = col('Área Destino');

    let html = '<table><thead><tr>';
    html += '<th>Fecha</th><th>Materia</th><th>Unidad</th><th>Ingresado</th><th>Usado</th><th>Stock</th><th>Proveedor</th><th>Costo Unit.</th><th>Costo Total</th><th>Área</th>';
    html += '</tr></thead><tbody>';

    dataGlobal.forEach(f => {
        html += `<tr>
            <td>${norm(f[cFecha])}</td>
            <td>${norm(f[cMateria])}</td>
            <td>${norm(f[cUnidad])}</td>
            <td>${num(f[cIngresada])}</td>
            <td>${num(f[cUsada])}</td>
            <td>${num(f[cStock])}</td>
            <td>${norm(f[cProveedor])}</td>
            <td>${money(num(f[cCostoUnit]))}</td>
            <td>${money(num(f[cCostoTotal]))}</td>
            <td>${norm(f[cArea])}</td>
        </tr>`;
    });

    html += '</tbody></table>';
    document.getElementById('tablaResumen').innerHTML = html;
}

// ============ LIMPIAR ============
document.getElementById('clearFilters')?.addEventListener('click', () => {
    document.querySelectorAll('.filter-select').forEach(sel => sel.value = '');
    aplicarFiltros();
});

cargarDatos();