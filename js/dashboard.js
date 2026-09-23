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
    orange: '#FB923C',
    yellow: '#FBBF24',
    gray: '#475569',
    textDim: '#94A3B8'
};

const PALETTE = [COLORS.accent, COLORS.cyan, COLORS.blue, COLORS.purple, COLORS.green, COLORS.orange, COLORS.red, COLORS.yellow, COLORS.greenNeon, COLORS.gray];

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
    const c = keys.find(k => k.trim().toLowerCase() === clave.trim().toLowerCase());
    return c;
}

function norm(v) {
    return v !== undefined && v !== null ? v.toString().trim() : '';
}

function num(v) {
    if (typeof v === 'number') return v;
    if (!v) return 0;
    return parseFloat(v.toString().replace(/,/g, '')) || 0;
}

function extraerMes(fecha) {
    if (!fecha) return '';
    const partes = fecha.toString().split(' ')[0].split('-');
    if (partes.length >= 2) {
        const meses = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Setiembre', 'Octubre', 'Noviembre', 'Diciembre'];
        const idx = parseInt(partes[1]) - 1;
        return meses[idx] || '';
    }
    return '';
}

// ============ KPIs ============
function calcularKPIs() {
    const cStatus = col('Status Final');
    const cFlota = col('Flota');
    const cComp = col('Componente');

    let alerta = 0, precaucion = 0, normal = 0;
    const flotas = new Set();
    const componentes = new Set();

    dataGlobal.forEach(f => {
        const s = norm(f[cStatus]).toLowerCase();
        if (s === 'alerta') alerta++;
        else if (s === 'precaución' || s === 'precaucion') precaucion++;
        else if (s === 'normal') normal++;
        if (f[cFlota]) flotas.add(norm(f[cFlota]));
        if (f[cComp]) componentes.add(norm(f[cComp]));
    });

    animar('kpiTotal', dataGlobal.length);
    animar('kpiAlerta', alerta);
    animar('kpiPrecaucion', precaucion);
    animar('kpiNormal', normal);
    animar('kpiFlotas', flotas.size);
    animar('kpiComponentes', componentes.size);

    document.getElementById('centerTotal').textContent = dataGlobal.length;
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
    llenar('filterFlota', 'Flota');
    llenar('filterFabricante', 'Fabricante');
    llenar('filterComponente', 'Componente');
    llenar('filterClase', 'Clase de componente');
    llenar('filterStatus', 'Status Final');
    llenar('filterSalud', 'Status Salud');
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
    const flota = document.getElementById('filterFlota').value;
    const fabricante = document.getElementById('filterFabricante').value;
    const componente = document.getElementById('filterComponente').value;
    const clase = document.getElementById('filterClase').value;
    const status = document.getElementById('filterStatus').value;
    const salud = document.getElementById('filterSalud').value;

    const cFlota = col('Flota');
    const cFab = col('Fabricante');
    const cComp = col('Componente');
    const cClase = col('Clase de componente');
    const cStatus = col('Status Final');
    const cSalud = col('Status Salud');

    const filt = dataGlobal.filter(f => {
        if (flota && norm(f[cFlota]) !== flota) return false;
        if (fabricante && norm(f[cFab]) !== fabricante) return false;
        if (componente && norm(f[cComp]) !== componente) return false;
        if (clase && norm(f[cClase]) !== clase) return false;
        if (status && norm(f[cStatus]) !== status) return false;
        if (salud && norm(f[cSalud]) !== salud) return false;
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
    const cStatus = col('Status Final');
    const cTipo = col('Tipo de equipo');
    const cComp = col('Componente');
    const cFecha = col('Fecha de reporte');
    const cHierro = col('Hierro');
    const cCobre = col('Cobre');
    const cPlomo = col('Plomo');
    const cAluminio = col('Aluminio');
    const cCromo = col('Cromo');
    const cEstano = col('Estano');
    const cAgua = col('Contenido de agua');
    const cSilicio = col('Silicio');
    const cSodio = col('Sodio');
    const cVisc = col('Viscosidad cinematica a 100c');
    const cFab = col('Fabricante');
    const cHrsEq = col('Hrs equipo');
    const cHrsAce = col('Hrs aceite');
    const cSalud = col('Status Salud');
    const cCont = col('Status Contaminacion');
    const cDesg = col('Status Desgastes');

    // 1. Status Final
    const porStatus = {};
    dataGlobal.forEach(f => {
        const s = norm(f[cStatus]) || 'Sin status';
        porStatus[s] = (porStatus[s] || 0) + 1;
    });
    renderDoughnut('chartStatusFinal', Object.keys(porStatus), Object.values(porStatus));

    // 2. Alertas por Tipo de Equipo
    const alertasPorTipo = {};
    dataGlobal.filter(f => {
        const s = norm(f[cStatus]).toLowerCase();
        return s === 'alerta' || s === 'precaución' || s === 'precaucion';
    }).forEach(f => {
        const t = norm(f[cTipo]) || 'Sin tipo';
        alertasPorTipo[t] = (alertasPorTipo[t] || 0) + 1;
    });
    renderBar('chartAlertasTipo', Object.keys(alertasPorTipo), Object.values(alertasPorTipo), COLORS.accent);

    // 3. Componentes con más alertas de desgaste
    const alertasDesgaste = {};
    dataGlobal.filter(f => {
        const d = norm(f[cDesg]).toLowerCase();
        return d === 'alerta' || d === 'precaución' || d === 'precaucion';
    }).forEach(f => {
        const c = norm(f[cComp]) || 'Sin componente';
        alertasDesgaste[c] = (alertasDesgaste[c] || 0) + 1;
    });
    const topDesgaste = Object.entries(alertasDesgaste).sort((a, b) => b[1] - a[1]).slice(0, 10);
    renderHBar('chartAlertasDesgaste', topDesgaste.map(d => d[0]), topDesgaste.map(d => d[1]), COLORS.red);

    // 4. Evolución de alertas por mes
    const alertasMes = {};
    dataGlobal.filter(f => {
        const s = norm(f[cStatus]).toLowerCase();
        return s === 'alerta' || s === 'precaución' || s === 'precaucion';
    }).forEach(f => {
        const m = extraerMes(norm(f[cFecha])) || 'Sin mes';
        alertasMes[m] = (alertasMes[m] || 0) + 1;
    });
    renderLine('chartEvolucionMes', Object.keys(alertasMes), Object.values(alertasMes));

    // 5. Top 10 equipos con mayor hierro
    const topFe = dataGlobal.map(f => ({
        flota: norm(f[col('Flota')]),
        fe: num(f[cHierro])
    })).sort((a, b) => b.fe - a.fe).slice(0, 10);
    renderHBar('chartTopHierro', topFe.map(t => t.flota), topFe.map(t => t.fe), COLORS.red);

    // 6. Equipos con presencia de agua
    const aguaData = {};
    dataGlobal.forEach(f => {
        const agua = norm(f[cAgua]).toLowerCase();
        const flota = norm(f[col('Flota')]) || 'Sin flota';
        if (agua.includes('detectado') || agua === 'sí' || agua === 'si') {
            aguaData[flota] = (aguaData[flota] || 0) + 1;
        }
    });
    renderBar('chartAgua', Object.keys(aguaData), Object.values(aguaData), COLORS.cyan);

    // 7. Alertas por viscosidad
    const viscData = dataGlobal.map(f => ({
        flota: norm(f[col('Flota')]),
        visc: num(f[cVisc])
    })).filter(v => v.visc > 0).sort((a, b) => a.visc - b.visc).slice(0, 10);
    renderBar('chartViscosidad', viscData.map(v => v.flota), viscData.map(v => v.visc), COLORS.purple);

    // 8. Status por fabricante
    const fabricantes = [...new Set(dataGlobal.map(f => norm(f[cFab])).filter(v => v))].slice(0, 8);
    const statusPorFab = {};
    fabricantes.forEach(fab => {
        statusPorFab[fab] = { alerta: 0, precaucion: 0, normal: 0 };
        dataGlobal.filter(f => norm(f[cFab]) === fab).forEach(f => {
            const s = norm(f[cStatus]).toLowerCase();
            if (s === 'alerta') statusPorFab[fab].alerta++;
            else if (s === 'precaución' || s === 'precaucion') statusPorFab[fab].precaucion++;
            else if (s === 'normal') statusPorFab[fab].normal++;
        });
    });
    renderStacked('chartFabricante', fabricantes, statusPorFab);

    // 9. Horas aceite vs horas equipo
    const horasData = dataGlobal.slice(0, 15).map(f => ({
        flota: norm(f[col('Flota')]),
        eq: num(f[cHrsEq]),
        ace: num(f[cHrsAce])
    }));
    renderGrouped('chartHoras', horasData.map(h => h.flota), horasData.map(h => h.eq), horasData.map(h => h.ace));

    // 10. Ranking de componentes con más desgaste (progreso)
    const desgastePorComp = {};
    dataGlobal.forEach(f => {
        const c = norm(f[cComp]) || 'Sin componente';
        const fe = num(f[cHierro]);
        const cu = num(f[cCobre]);
        const pb = num(f[cPlomo]);
        desgastePorComp[c] = (desgastePorComp[c] || 0) + fe + cu + pb;
    });
    const rankingComp = Object.entries(desgastePorComp).sort((a, b) => b[1] - a[1]).slice(0, 8);
    const maxDesg = rankingComp[0] ? rankingComp[0][1] : 1;

    const cont = document.getElementById('progressComponentes');
    if (cont) {
        cont.innerHTML = '';
        rankingComp.forEach(([comp, val]) => {
            const percent = ((val / maxDesg) * 100).toFixed(1);
            const item = document.createElement('div');
            item.className = 'progress-item';
            item.innerHTML = `
                <div class="progress-header">
                    <span class="progress-label"><i class="fas fa-cog"></i> ${comp}</span>
                    <span class="progress-values">
                        <span class="progress-percent">${val.toFixed(0)} ppm</span>
                    </span>
                </div>
                <div class="progress-bar-bg">
                    <div class="progress-bar-fill" style="width: ${percent}%"></div>
                </div>
            `;
            cont.appendChild(item);
        });
    }

    // 11. Metales de desgaste (top 8 equipos, barras agrupadas)
    const metalesData = dataGlobal.slice(0, 8);
    renderMetales('chartMetales',
        metalesData.map(f => norm(f[col('Flota')])),
        metalesData.map(f => num(f[cHierro])),
        metalesData.map(f => num(f[cCobre])),
        metalesData.map(f => num(f[cPlomo]))
    );

    // 12. Contaminación silicio / sodio
    const contData = dataGlobal.slice(0, 10);
    renderGrouped('chartContaminacion',
        contData.map(f => norm(f[col('Flota')])),
        contData.map(f => num(f[cSilicio])),
        contData.map(f => num(f[cSodio]))
    );
}

// ============ RENDERIZADORES ============
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
                legend: { position: 'bottom', labels: { color: COLORS.textDim, font: { family: 'Inter', size: 11 }, padding: 12, usePointStyle: true, boxWidth: 8 } },
                tooltip: tooltipStyle()
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
            datasets: [{ data, backgroundColor: color, borderRadius: 6, borderSkipped: false, barThickness: 20 }]
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
            datasets: [{ data, backgroundColor: color, borderRadius: 6, borderSkipped: false, barThickness: 16 }]
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

function renderLine(id, labels, data) {
    const ctx = document.getElementById(id);
    if (!ctx) return;
    if (charts[id]) charts[id].destroy();

    charts[id] = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                data: data,
                borderColor: COLORS.cyan,
                backgroundColor: 'rgba(0, 210, 255, 0.1)',
                borderWidth: 3,
                tension: 0.4,
                fill: true,
                pointBackgroundColor: COLORS.cyan,
                pointBorderColor: '#1E293B',
                pointBorderWidth: 2,
                pointRadius: 5
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

function renderGrouped(id, labels, d1, d2) {
    const ctx = document.getElementById(id);
    if (!ctx) return;
    if (charts[id]) charts[id].destroy();

    charts[id] = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [
                { label: 'Serie 1', data: d1, backgroundColor: COLORS.accent, borderRadius: 4, barThickness: 12 },
                { label: 'Serie 2', data: d2, backgroundColor: COLORS.cyan, borderRadius: 4, barThickness: 12 }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { labels: { color: COLORS.textDim, font: { family: 'Inter', size: 11 } } },
                tooltip: tooltipStyle()
            },
            scales: {
                x: { ticks: { color: COLORS.textDim, font: { family: 'Inter', size: 10 } }, grid: { display: false } },
                y: { ticks: { color: COLORS.textDim }, grid: { color: 'rgba(148,163,184,0.1)' } }
            }
        }
    });
}

function renderStacked(id, labels, dataObj) {
    const ctx = document.getElementById(id);
    if (!ctx) return;
    if (charts[id]) charts[id].destroy();

    charts[id] = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [
                { label: 'Alerta', data: labels.map(l => dataObj[l].alerta), backgroundColor: COLORS.red, borderRadius: 4 },
                { label: 'Precaución', data: labels.map(l => dataObj[l].precaucion), backgroundColor: COLORS.orange, borderRadius: 4 },
                { label: 'Normal', data: labels.map(l => dataObj[l].normal), backgroundColor: COLORS.green, borderRadius: 4 }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { position: 'bottom', labels: { color: COLORS.textDim, font: { family: 'Inter', size: 10 }, usePointStyle: true, boxWidth: 8 } },
                tooltip: tooltipStyle()
            },
            scales: {
                x: { stacked: true, ticks: { color: COLORS.textDim, font: { family: 'Inter', size: 10 } }, grid: { display: false } },
                y: { stacked: true, beginAtZero: true, ticks: { color: COLORS.textDim }, grid: { color: 'rgba(148,163,184,0.1)' } }
            }
        }
    });
}

function renderMetales(id, labels, fe, cu, pb) {
    const ctx = document.getElementById(id);
    if (!ctx) return;
    if (charts[id]) charts[id].destroy();

    charts[id] = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [
                { label: 'Hierro', data: fe, backgroundColor: COLORS.red, borderRadius: 4 },
                { label: 'Cobre', data: cu, backgroundColor: COLORS.accent, borderRadius: 4 },
                { label: 'Plomo', data: pb, backgroundColor: COLORS.purple, borderRadius: 4 }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { position: 'bottom', labels: { color: COLORS.textDim, font: { family: 'Inter', size: 10 }, usePointStyle: true, boxWidth: 8 } },
                tooltip: tooltipStyle()
            },
            scales: {
                x: { ticks: { color: COLORS.textDim, font: { family: 'Inter', size: 10 } }, grid: { display: false } },
                y: { beginAtZero: true, ticks: { color: COLORS.textDim }, grid: { color: 'rgba(148,163,184,0.1)' } }
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
    const cFlota = col('Flota');
    const cDesc = col('Descripcion de equipo');
    const cTipo = col('Tipo de equipo');
    const cComp = col('Componente');
    const cFecha = col('Fecha de reporte');
    const cHrsEq = col('Hrs equipo');
    const cStatus = col('Status Final');
    const cSalud = col('Status Salud');
    const cCont = col('Status Contaminacion');
    const cDesg = col('Status Desgastes');
    const cAdit = col('Status Aditivo');
    const cFe = col('Hierro');

    let html = '<table><thead><tr>';
    html += '<th>Flota</th><th>Equipo</th><th>Tipo</th><th>Componente</th><th>Fecha</th><th>Hrs Eq</th><th>Fe ppm</th><th>Status</th><th>Salud</th><th>Contam.</th><th>Desgaste</th><th>Aditivo</th>';
    html += '</tr></thead><tbody>';

    dataGlobal.slice(0, 100).forEach(f => {
        const s = norm(f[cStatus]);
        const cls = s.toLowerCase() === 'alerta' ? 'value-down' : (s.toLowerCase() === 'normal' ? 'value-up' : '');

        html += `<tr>
            <td>${norm(f[cFlota])}</td>
            <td>${norm(f[cDesc])}</td>
            <td>${norm(f[cTipo])}</td>
            <td>${norm(f[cComp])}</td>
            <td>${norm(f[cFecha]).split(' ')[0]}</td>
            <td>${norm(f[cHrsEq])}</td>
            <td class="${num(f[cFe]) > 100 ? 'value-down' : ''}">${num(f[cFe])}</td>
            <td class="${cls}">${s}</td>
            <td>${norm(f[cSalud])}</td>
            <td>${norm(f[cCont])}</td>
            <td>${norm(f[cDesg])}</td>
            <td>${norm(f[cAdit])}</td>
        </tr>`;
    });

    html += '</tbody></table>';
    document.getElementById('tablaResumen').innerHTML = html;
}

document.getElementById('clearFilters')?.addEventListener('click', () => {
    document.querySelectorAll('.filter-select').forEach(sel => sel.value = '');
    aplicarFiltros();
});

cargarDatos();