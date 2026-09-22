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

// ============ CARGA SUPABASE ============
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
    return parseFloat(v.toString().replace(/,/g, '')) || 0;
}

function money(v) {
    return 'S/ ' + v.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// ============ KPIs ============
function calcularKPIs() {
    const cCodigo = col('CODIGO');
    const cReal = col('REAL');
    const cEsperado = col('ESPERADO');
    const cHoras = col('TOTAL HRS');
    const cDif = col('DIFERENCIA RATIO');
    const cTotal = col('TOTAL S/.');
    const cProp = col('PROPIETARIO');

    const totalEquipos = dataGlobal.length;
    let totalHoras = 0, excesoTotal = 0, perdidaTotal = 0, propias = 0, alquiladas = 0;

    dataGlobal.forEach(f => {
        totalHoras += num(f[cHoras]);
        excesoTotal += num(f[cDif]);
        perdidaTotal += num(f[cTotal]);

        const p = norm(f[cProp]).toUpperCase();
        if (p.includes('INSTTALE')) propias++;
        else if (p.includes('ALQUILADA')) alquiladas++;
    });

    animar('kpiEquipos', totalEquipos);
    document.getElementById('kpiHoras').textContent = totalHoras.toFixed(1);
    document.getElementById('kpiExceso').textContent = excesoTotal.toFixed(2);
    document.getElementById('kpiPerdida').textContent = money(perdidaTotal);
    animar('kpiPropias', propias);
    animar('kpiAlquiladas', alquiladas);
    document.getElementById('centerTotal').textContent = totalEquipos;
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
    llenar('filterEquipo', 'EQUIPO');
    llenar('filterPropietario', 'PROPIETARIO');
    llenar('filterCodigo', 'CODIGO');
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
    const eq = document.getElementById('filterEquipo').value;
    const pr = document.getElementById('filterPropietario').value;
    const co = document.getElementById('filterCodigo').value;

    const cEq = col('EQUIPO'), cPr = col('PROPIETARIO'), cCo = col('CODIGO');

    const filt = dataGlobal.filter(f => {
        if (eq && norm(f[cEq]) !== eq) return false;
        if (pr && norm(f[cPr]) !== pr) return false;
        if (co && norm(f[cCo]) !== co) return false;
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
    const cCodigo = col('CODIGO');
    const cEquipo = col('EQUIPO');
    const cReal = col('REAL');
    const cEsperado = col('ESPERADO');
    const cDif = col('DIFERENCIA RATIO');
    const cTotal = col('TOTAL S/.');
    const cProp = col('PROPIETARIO');

    // 1. Real vs Esperado (barras agrupadas)
    const top15 = [...dataGlobal].slice(0, 15);
    renderGrouped('chartRealEsperado',
        top15.map(f => norm(f[cCodigo])),
        top15.map(f => num(f[cReal])),
        top15.map(f => num(f[cEsperado]))
    );

    // 2. Top 10 mayor pérdida
    const top10 = [...dataGlobal].sort((a, b) => num(b[cTotal]) - num(a[cTotal])).slice(0, 10);
    renderHBar('chartTopPerdida', top10.map(f => norm(f[cCodigo])), top10.map(f => num(f[cTotal])));

    // 3. Pérdida por tipo de equipo
    const porTipo = {};
    dataGlobal.forEach(f => {
        const t = norm(f[cEquipo]) || 'Sin tipo';
        porTipo[t] = (porTipo[t] || 0) + num(f[cTotal]);
    });
    renderDoughnut('chartPerdidaTipo', Object.keys(porTipo), Object.values(porTipo));

    // 4. Propias vs Alquiladas
    let propias = 0, alquiladas = 0;
    dataGlobal.forEach(f => {
        const p = norm(f[cProp]).toUpperCase();
        if (p.includes('INSTTALE')) propias++;
        else if (p.includes('ALQUILADA')) alquiladas++;
    });
    renderDoughnut('chartPropiosAlq', ['INSTTALE', 'ALQUILADA'], [propias, alquiladas]);

    // 5. Costo total por tipo
    const costoPorTipo = {};
    dataGlobal.forEach(f => {
        const t = norm(f[cEquipo]) || 'Sin tipo';
        costoPorTipo[t] = (costoPorTipo[t] || 0) + num(f[cTotal]);
    });
    renderBar('chartCostoTipo', Object.keys(costoPorTipo), Object.values(costoPorTipo), COLORS.accent);

    // 6. Diferencia ratio por equipo
    const topDif = [...dataGlobal].sort((a, b) => num(b[cDif]) - num(a[cDif])).slice(0, 15);
    renderBar('chartDiferencia', topDif.map(f => norm(f[cCodigo])), topDif.map(f => num(f[cDif])), COLORS.red);

    // 7. Distribución por propietario
    const porProp = {};
    dataGlobal.forEach(f => {
        const p = norm(f[cProp]) || 'Sin propietario';
        porProp[p] = (porProp[p] || 0) + 1;
    });
    renderDoughnut('chartPropietario', Object.keys(porProp), Object.values(porProp));

    // 8. Progreso de exceso por equipo (barra de progreso)
    const excesoOrdenado = [...dataGlobal]
        .filter(f => num(f[cDif]) > 0)
        .sort((a, b) => num(b[cDif]) - num(a[cDif]))
        .slice(0, 10);

    const maxExceso = Math.max(...excesoOrdenado.map(f => num(f[cDif])), 1);
    const cont = document.getElementById('progressExceso');
    if (cont) {
        cont.innerHTML = '';
        excesoOrdenado.forEach(f => {
            const codigo = norm(f[cCodigo]);
            const exceso = num(f[cDif]);
            const percent = ((exceso / maxExceso) * 100).toFixed(1);

            const item = document.createElement('div');
            item.className = 'progress-item';
            item.innerHTML = `
                <div class="progress-header">
                    <span class="progress-label"><i class="fas fa-tractor"></i> ${codigo}</span>
                    <span class="progress-values">
                        <span class="progress-percent">+${exceso.toFixed(2)}</span>
                        <span class="progress-count">ratio</span>
                    </span>
                </div>
                <div class="progress-bar-bg">
                    <div class="progress-bar-fill" style="width: ${percent}%"></div>
                </div>
            `;
            cont.appendChild(item);
        });
    }

    // 9. Pérdida promedio por tipo
    const sumaPorTipo = {};
    const cuentaPorTipo = {};
    dataGlobal.forEach(f => {
        const t = norm(f[cEquipo]) || 'Sin tipo';
        sumaPorTipo[t] = (sumaPorTipo[t] || 0) + num(f[cTotal]);
        cuentaPorTipo[t] = (cuentaPorTipo[t] || 0) + 1;
    });
    const promedioPorTipo = {};
    Object.keys(sumaPorTipo).forEach(t => {
        promedioPorTipo[t] = sumaPorTipo[t] / cuentaPorTipo[t];
    });
    renderBar('chartPerdidaPromedio', Object.keys(promedioPorTipo), Object.values(promedioPorTipo), COLORS.purple);

    // 10. Eficiencia operativa (real / esperado * 100)
    const topEff = dataGlobal.slice(0, 15).map(f => {
        const real = num(f[cReal]);
        const esperado = num(f[cEsperado]);
        return {
            codigo: norm(f[cCodigo]),
            eff: esperado > 0 ? (real / esperado) * 100 : 0
        };
    });
    renderBar('chartEficiencia', topEff.map(e => e.codigo), topEff.map(e => e.eff.toFixed(1)), COLORS.green);
}

// ============ RENDERIZADORES ============
function renderGrouped(id, labels, d1, d2) {
    const ctx = document.getElementById(id);
    if (!ctx) return;
    if (charts[id]) charts[id].destroy();

    charts[id] = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [
                { label: 'Real', data: d1, backgroundColor: COLORS.accent, borderRadius: 4, barThickness: 12 },
                { label: 'Esperado', data: d2, backgroundColor: COLORS.cyan, borderRadius: 4, barThickness: 12 }
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
                barThickness: 18
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

function renderHBar(id, labels, data) {
    const ctx = document.getElementById(id);
    if (!ctx) return;
    if (charts[id]) charts[id].destroy();

    charts[id] = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                data: data,
                backgroundColor: COLORS.accent,
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
                y: { ticks: { color: '#fff', font: { family: 'Inter', size: 11, weight: '500' } }, grid: { display: false } }
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
    const cCodigo = col('CODIGO');
    const cEquipo = col('EQUIPO');
    const cReal = col('REAL');
    const cEsperado = col('ESPERADO');
    const cDif = col('DIFERENCIA RATIO');
    const cTotal = col('TOTAL S/.');
    const cProp = col('PROPIETARIO');

    let html = '<table><thead><tr>';
    html += '<th>Código</th><th>Equipo</th><th>Real</th><th>Esperado</th><th>Diferencia</th><th>Pérdida S/.</th><th>Propietario</th>';
    html += '</tr></thead><tbody>';

    let totReal = 0, totEsp = 0, totDif = 0, totTotal = 0;

    const ordenado = [...dataGlobal].sort((a, b) => num(b[cTotal]) - num(a[cTotal]));

    ordenado.forEach(f => {
        const real = num(f[cReal]);
        const esp = num(f[cEsperado]);
        const dif = num(f[cDif]);
        const total = num(f[cTotal]);

        totReal += real; totEsp += esp; totDif += dif; totTotal += total;

        html += `<tr>
            <td>${norm(f[cCodigo])}</td>
            <td>${norm(f[cEquipo])}</td>
            <td>${real.toFixed(2)}</td>
            <td>${esp.toFixed(2)}</td>
            <td class="${dif > 0 ? 'value-down' : ''}">${dif.toFixed(2)}</td>
            <td class="${total > 0 ? 'value-down' : ''}">${money(total)}</td>
            <td>${norm(f[cProp])}</td>
        </tr>`;
    });

    html += `<tr class="table-total-row">
        <td>TOTAL</td><td></td>
        <td>${totReal.toFixed(2)}</td>
        <td>${totEsp.toFixed(2)}</td>
        <td>${totDif.toFixed(2)}</td>
        <td>${money(totTotal)}</td>
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