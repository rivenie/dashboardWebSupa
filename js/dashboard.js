// ============ CONFIGURACIÓN SUPABASE ============
const SUPABASE_URL = "https://uoftarfxakkpevugdycg.supabase.co";
const SUPABASE_KEY = "sb_publishable_vT_w6EoVLl-BK12ojRTaOg_UeSXAVvh";
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

/* ============ VARIABLES ============ */
let dataGlobal = [];
let charts = {};

/* ============ PALETA ============ */
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

const PALETTE = [
    COLORS.accent, COLORS.cyan, COLORS.blue, COLORS.purple,
    COLORS.green, COLORS.gray, COLORS.red, COLORS.greenNeon
];

/* Fecha actual */
document.getElementById('fechaActual').textContent = new Date().toLocaleDateString('es-PE', {
    day: '2-digit', month: 'short', year: 'numeric'
});

/* ============ CARGAR DATOS DE SUPABASE ============ */
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
            <p style="color:#ff6b00;font-size:1.1rem;">No hay datos disponibles.</p>
            <p style="color:#94a3b8;font-size:0.9rem;margin-top:10px;">Sube un Excel desde el index.html para ver el dashboard.</p>
        `;
        console.error(err);
    }
}

/* ============ HELPERS ============ */
function obtenerColumna(clave) {
    if (dataGlobal.length === 0) return null;
    const keys = Object.keys(dataGlobal[0]);
    return keys.find(k => k.trim().toLowerCase() === clave.trim().toLowerCase());
}

function normalizar(v) {
    return v !== undefined && v !== null ? v.toString().trim() : '';
}

/* ============ KPIs ============ */
function calcularKPIs() {
    const colInc = obtenerColumna('Incidencia');
    const colEst = obtenerColumna('Estado');

    const total = dataGlobal.length;
    let incidencias = 0, cerrados = 0, enProceso = 0;

    dataGlobal.forEach(f => {
        const inc = normalizar(f[colInc]).toLowerCase();
        const est = normalizar(f[colEst]).toLowerCase();
        if (inc === 'sí' || inc === 'si') incidencias++;
        if (est === 'cerrado') cerrados++;
        if (est === 'en proceso') enProceso++;
    });

    const eficiencia = total > 0 ? ((cerrados / total) * 100).toFixed(1) : 0;

    animarNumero('kpiTotal', total);
    animarNumero('kpiIncidencias', incidencias);
    animarNumero('kpiCerrados', cerrados);
    animarNumero('kpiProceso', enProceso);
    document.getElementById('kpiEficiencia').textContent = eficiencia + '%';

    document.getElementById('kpiTotalTrend').textContent = '+' + (total > 0 ? (total * 0.05).toFixed(0) : 0) + '%';
    document.getElementById('kpiIncTrend').textContent = '-' + (incidencias > 0 ? (incidencias * 0.1).toFixed(0) : 0) + '%';
    document.getElementById('kpiCerradosTrend').textContent = '+' + (cerrados > 0 ? (cerrados * 0.08).toFixed(0) : 0) + '%';
    document.getElementById('kpiProcTrend').textContent = '-' + (enProceso > 0 ? (enProceso * 0.05).toFixed(0) : 0) + '%';
    document.getElementById('kpiEfTrend').textContent = '+' + (eficiencia > 0 ? (eficiencia * 0.02).toFixed(1) : 0) + '%';

    const centro = document.getElementById('centerTotal');
    if (centro) centro.textContent = total;
}

function animarNumero(id, valorFinal) {
    const el = document.getElementById(id);
    if (!el) return;
    const duracion = 800;
    const inicio = performance.now();
    function step(now) {
        const progreso = Math.min((now - inicio) / duracion, 1);
        el.textContent = Math.floor(progreso * valorFinal);
        if (progreso < 1) requestAnimationFrame(step);
        else el.textContent = valorFinal;
    }
    requestAnimationFrame(step);
}

/* ============ FILTROS ============ */
function cargarFiltros() {
    llenarSelect('filterFecha', 'Fecha');
    llenarSelect('filterTurno', 'Turno');
    llenarSelect('filterArea', 'Área');
    llenarSelect('filterFundo', 'Fundo / Planta');
    llenarSelect('filterTipo', 'Tipo de Registro');
    llenarSelect('filterIncidencia', 'Incidencia');
    llenarSelect('filterEstado', 'Estado');
}

function llenarSelect(id, columna) {
    const select = document.getElementById(id);
    if (!select) return;
    const col = obtenerColumna(columna);
    if (!col) return;

    const valores = [...new Set(dataGlobal.map(f => normalizar(f[col])).filter(v => v !== ''))];

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
    const turno = document.getElementById('filterTurno').value;
    const area = document.getElementById('filterArea').value;
    const fundo = document.getElementById('filterFundo').value;
    const tipo = document.getElementById('filterTipo').value;
    const incidencia = document.getElementById('filterIncidencia').value;
    const estado = document.getElementById('filterEstado').value;

    const cFecha = obtenerColumna('Fecha');
    const cTurno = obtenerColumna('Turno');
    const cArea = obtenerColumna('Área');
    const cFundo = obtenerColumna('Fundo / Planta');
    const cTipo = obtenerColumna('Tipo de Registro');
    const cInc = obtenerColumna('Incidencia');
    const cEst = obtenerColumna('Estado');

    const filtrados = dataGlobal.filter(f => {
        if (fecha && normalizar(f[cFecha]) !== fecha) return false;
        if (turno && normalizar(f[cTurno]) !== turno) return false;
        if (area && normalizar(f[cArea]) !== area) return false;
        if (fundo && normalizar(f[cFundo]) !== fundo) return false;
        if (tipo && normalizar(f[cTipo]) !== tipo) return false;
        if (incidencia && normalizar(f[cInc]) !== incidencia) return false;
        if (estado && normalizar(f[cEst]) !== estado) return false;
        return true;
    });

    const backup = dataGlobal;
    dataGlobal = filtrados;
    calcularKPIs();
    crearGraficos();
    crearTablaResumen();
    dataGlobal = backup;
}

/* ============ GRÁFICOS ============ */
function crearGraficos() {
    const cFecha = obtenerColumna('Fecha');
    const cTurno = obtenerColumna('Turno');
    const cTipo = obtenerColumna('Tipo de Registro');
    const cArea = obtenerColumna('Área');
    const cEst = obtenerColumna('Estado');
    const cInc = obtenerColumna('Incidencia');

    // 1. Anillo: Incidencias por Estado
    const porEstado = {};
    dataGlobal.filter(f => {
        const inc = normalizar(f[cInc]).toLowerCase();
        return inc === 'sí' || inc === 'si';
    }).forEach(f => {
        const e = normalizar(f[cEst]) || 'Sin estado';
        porEstado[e] = (porEstado[e] || 0) + 1;
    });
    renderDoughnut('chartEstado', Object.keys(porEstado), Object.values(porEstado));

    // 2. Barras horizontales: Registros por Área
    const porArea = {};
    dataGlobal.forEach(f => {
        const a = normalizar(f[cArea]) || 'Sin área';
        porArea[a] = (porArea[a] || 0) + 1;
    });
    renderHorizontalBar('chartAreas', Object.keys(porArea), Object.values(porArea));

    // 3. Columnas apiladas: Turno y Tipo
    const turnos = [...new Set(dataGlobal.map(f => normalizar(f[cTurno])).filter(v => v))];
    const tipos = [...new Set(dataGlobal.map(f => normalizar(f[cTipo])).filter(v => v))];

    const datasetsStacked = tipos.map((tipo, i) => {
        const dataPorTurno = turnos.map(turno => {
            return dataGlobal.filter(f =>
                normalizar(f[cTurno]) === turno &&
                normalizar(f[cTipo]) === tipo
            ).length;
        });
        return {
            label: tipo,
            data: dataPorTurno,
            backgroundColor: PALETTE[i % PALETTE.length],
            borderRadius: 4,
            borderSkipped: false
        };
    });
    renderStackedBar('chartStacked', turnos, datasetsStacked);

    // 4. Líneas: Registros por Día
    const porDia = {};
    dataGlobal.forEach(f => {
        const fecha = normalizar(f[cFecha]).split(' ')[0];
        if (!fecha) return;
        porDia[fecha] = (porDia[fecha] || 0) + 1;
    });
    renderLine('chartLineas', Object.keys(porDia), Object.values(porDia));

    // 5. Barras de progreso: Distribución por Turno
    const totalTurno = dataGlobal.length;
    const turnoData = dataGlobal.reduce((acc, f) => {
        const t = normalizar(f[cTurno]) || 'Sin turno';
        acc[t] = (acc[t] || 0) + 1;
        return acc;
    }, {});

    const iconosTurno = {
        'Día': 'fa-sun',
        'Tarde': 'fa-cloud-sun',
        'Noche': 'fa-moon'
    };

    const progressContainer = document.getElementById('progressTurnos');
    if (progressContainer) {
        progressContainer.innerHTML = '';
        Object.entries(turnoData).sort((a, b) => b[1] - a[1]).forEach(([turno, count]) => {
            const percent = totalTurno > 0 ? ((count / totalTurno) * 100).toFixed(1) : 0;
            const icono = iconosTurno[turno] || 'fa-clock';

            const item = document.createElement('div');
            item.className = 'progress-item';
            item.innerHTML = `
                <div class="progress-header">
                    <span class="progress-label">
                        <i class="fas ${icono}"></i> ${turno}
                    </span>
                    <span class="progress-values">
                        <span class="progress-percent">${percent}%</span>
                        <span class="progress-count">(${count})</span>
                    </span>
                </div>
                <div class="progress-bar-bg">
                    <div class="progress-bar-fill" style="width: ${percent}%"></div>
                </div>
            `;
            progressContainer.appendChild(item);
        });
    }

    // 6. Rondas vs Inspecciones
    const rondas = dataGlobal.filter(f => normalizar(f[cTipo]).toLowerCase() === 'ronda').length;
    const inspecciones = dataGlobal.filter(f => {
        const t = normalizar(f[cTipo]).toLowerCase();
        return t === 'inspección' || t === 'inspeccion';
    }).length;
    renderComparisonBar('chartRondas', ['Rondas', 'Inspecciones'], [rondas, inspecciones]);
}

/* ============ RENDERIZADORES ============ */
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
                borderWidth: 3,
                hoverOffset: 8
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: '68%',
            animation: { duration: 900, easing: 'easeOutQuart' },
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: {
                        color: COLORS.textDim,
                        font: { family: 'Inter', size: 11, weight: '500' },
                        padding: 12,
                        usePointStyle: true,
                        pointStyle: 'circle',
                        boxWidth: 8,
                        boxHeight: 8
                    }
                },
                tooltip: {
                    backgroundColor: '#0F172A',
                    titleColor: '#FF6B00',
                    bodyColor: '#FFFFFF',
                    borderColor: '#FF6B00',
                    borderWidth: 1,
                    padding: 12,
                    cornerRadius: 8
                }
            }
        }
    });
}

function renderHorizontalBar(id, labels, data) {
    const ctx = document.getElementById(id);
    if (!ctx) return;
    if (charts[id]) charts[id].destroy();

    const maxData = Math.max(...data);
    const meta = maxData * 0.85;

    charts[id] = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [
                {
                    label: 'Registros',
                    data: data,
                    backgroundColor: COLORS.accent,
                    borderRadius: 6,
                    borderSkipped: false,
                    barThickness: 18
                },
                {
                    label: 'Meta',
                    data: labels.map(() => meta),
                    backgroundColor: 'transparent',
                    borderColor: COLORS.greenNeon,
                    borderWidth: 2,
                    borderDash: [6, 4],
                    type: 'line',
                    pointRadius: 0,
                    borderSkipped: false
                }
            ]
        },
        options: {
            indexAxis: 'y',
            responsive: true,
            maintainAspectRatio: false,
            animation: { duration: 900 },
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: '#0F172A',
                    titleColor: '#FF6B00',
                    bodyColor: '#FFFFFF',
                    borderColor: '#FF6B00',
                    borderWidth: 1,
                    padding: 10,
                    cornerRadius: 8
                }
            },
            scales: {
                x: {
                    ticks: { color: COLORS.textDim, font: { family: 'Inter', size: 10 } },
                    grid: { color: 'rgba(148, 163, 184, 0.1)' }
                },
                y: {
                    ticks: { color: '#FFFFFF', font: { family: 'Inter', size: 11, weight: '500' } },
                    grid: { display: false }
                }
            }
        }
    });
}

function renderStackedBar(id, labels, datasets) {
    const ctx = document.getElementById(id);
    if (!ctx) return;
    if (charts[id]) charts[id].destroy();

    charts[id] = new Chart(ctx, {
        type: 'bar',
        data: { labels: labels, datasets: datasets },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: { duration: 900 },
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: {
                        color: COLORS.textDim,
                        font: { family: 'Inter', size: 10 },
                        padding: 10,
                        usePointStyle: true,
                        boxWidth: 8,
                        boxHeight: 8
                    }
                },
                tooltip: {
                    backgroundColor: '#0F172A',
                    titleColor: '#FF6B00',
                    bodyColor: '#FFFFFF',
                    borderColor: '#FF6B00',
                    borderWidth: 1,
                    padding: 10,
                    cornerRadius: 8
                }
            },
            scales: {
                x: {
                    stacked: true,
                    ticks: { color: COLORS.textDim, font: { family: 'Inter', size: 10 } },
                    grid: { display: false }
                },
                y: {
                    stacked: true,
                    beginAtZero: true,
                    ticks: { color: COLORS.textDim, font: { family: 'Inter', size: 10 } },
                    grid: { color: 'rgba(148, 163, 184, 0.1)' }
                }
            }
        }
    });
}

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
                label: 'Registros',
                data: data,
                borderColor: COLORS.cyan,
                backgroundColor: 'rgba(0, 210, 255, 0.1)',
                borderWidth: 3,
                tension: 0.4,
                fill: true,
                pointBackgroundColor: COLORS.cyan,
                pointBorderColor: '#1E293B',
                pointBorderWidth: 2,
                pointRadius: 5,
                pointHoverRadius: 7
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: { duration: 900 },
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: '#0F172A',
                    titleColor: '#FF6B00',
                    bodyColor: '#FFFFFF',
                    borderColor: '#FF6B00',
                    borderWidth: 1,
                    padding: 10,
                    cornerRadius: 8,
                    callbacks: {
                        afterBody: (context) => {
                            const idx = context[0].dataIndex;
                            if (idx === maxIndex) return '▲ MÁXIMO DEL PERIODO';
                            return '';
                        }
                    }
                }
            },
            scales: {
                x: {
                    ticks: { color: COLORS.textDim, font: { family: 'Inter', size: 10 } },
                    grid: { display: false }
                },
                y: {
                    beginAtZero: true,
                    ticks: { color: COLORS.textDim, font: { family: 'Inter', size: 10 } },
                    grid: { color: 'rgba(148, 163, 184, 0.1)' }
                }
            }
        }
    });
}

function renderComparisonBar(id, labels, data) {
    const ctx = document.getElementById(id);
    if (!ctx) return;
    if (charts[id]) charts[id].destroy();

    charts[id] = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                data: data,
                backgroundColor: [COLORS.cyan, COLORS.purple],
                borderRadius: 10,
                borderSkipped: false,
                barThickness: 50
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: { duration: 900 },
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: '#0F172A',
                    titleColor: '#FF6B00',
                    bodyColor: '#FFFFFF',
                    borderColor: '#FF6B00',
                    borderWidth: 1,
                    padding: 10,
                    cornerRadius: 8
                }
            },
            scales: {
                x: {
                    ticks: { color: '#FFFFFF', font: { family: 'Inter', size: 12, weight: '600' } },
                    grid: { display: false }
                },
                y: {
                    beginAtZero: true,
                    ticks: { color: COLORS.textDim, font: { family: 'Inter', size: 10 } },
                    grid: { color: 'rgba(148, 163, 184, 0.1)' }
                }
            }
        }
    });
}

/* ============ TABLA RESUMEN ============ */
function crearTablaResumen() {
    const cArea = obtenerColumna('Área');
    const cInc = obtenerColumna('Incidencia');
    const cEst = obtenerColumna('Estado');
    const cTipo = obtenerColumna('Tipo de Registro');

    const resumen = {};
    dataGlobal.forEach(f => {
        const area = normalizar(f[cArea]) || 'Sin área';
        const inc = normalizar(f[cInc]).toLowerCase();
        const est = normalizar(f[cEst]).toLowerCase();
        const tipo = normalizar(f[cTipo]).toLowerCase();

        if (!resumen[area]) {
            resumen[area] = { registros: 0, incidencias: 0, cerrados: 0, enProceso: 0, rondas: 0, inspecciones: 0, accesos: 0 };
        }
        resumen[area].registros++;
        if (inc === 'sí' || inc === 'si') resumen[area].incidencias++;
        if (est === 'cerrado') resumen[area].cerrados++;
        if (est === 'en proceso') resumen[area].enProceso++;
        if (tipo === 'ronda') resumen[area].rondas++;
        if (tipo === 'inspección' || tipo === 'inspeccion') resumen[area].inspecciones++;
        if (tipo === 'control de acceso') resumen[area].accesos++;
    });

    const iconosArea = {
        'Fundo': 'fa-tree',
        'Planta': 'fa-industry'
    };

    let html = '<table><thead><tr>';
    html += '<th>Área</th><th>Registros</th><th>Incidencias</th><th>Cerrados</th><th>En Proceso</th><th>Rondas</th><th>Inspecciones</th><th>Accesos</th>';
    html += '</tr></thead><tbody>';

    let totales = { registros: 0, incidencias: 0, cerrados: 0, enProceso: 0, rondas: 0, inspecciones: 0, accesos: 0 };

    Object.entries(resumen).forEach(([area, d]) => {
        const icono = iconosArea[area] || 'fa-map-marker-alt';
        html += `<tr>
            <td>
                <div class="area-name">
                    <div class="area-icon"><i class="fas ${icono}"></i></div>
                    ${area}
                </div>
            </td>
            <td>${d.registros}</td>
            <td class="${d.incidencias > 0 ? 'value-down' : ''}">${d.incidencias}</td>
            <td class="value-up">${d.cerrados}</td>
            <td>${d.enProceso}</td>
            <td>${d.rondas}</td>
            <td>${d.inspecciones}</td>
            <td>${d.accesos}</td>
        </tr>`;

        totales.registros += d.registros;
        totales.incidencias += d.incidencias;
        totales.cerrados += d.cerrados;
        totales.enProceso += d.enProceso;
        totales.rondas += d.rondas;
        totales.inspecciones += d.inspecciones;
        totales.accesos += d.accesos;
    });

    html += `<tr class="table-total-row">
        <td>TOTAL</td>
        <td>${totales.registros}</td>
        <td>${totales.incidencias}</td>
        <td>${totales.cerrados}</td>
        <td>${totales.enProceso}</td>
        <td>${totales.rondas}</td>
        <td>${totales.inspecciones}</td>
        <td>${totales.accesos}</td>
    </tr>`;

    html += '</tbody></table>';
    document.getElementById('tablaResumen').innerHTML = html;
}

/* ============ LIMPIAR FILTROS ============ */
document.getElementById('clearFilters')?.addEventListener('click', () => {
    document.querySelectorAll('.filter-select').forEach(sel => sel.value = '');
    aplicarFiltros();
});

/* ============ INICIO ============ */
cargarDatos();