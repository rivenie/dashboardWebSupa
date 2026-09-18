// ============ CONFIGURACIÓN SUPABASE ============
const SUPABASE_URL = "https://uoftarfxakkpevugdycg.supabase.co";
const SUPABASE_KEY = "sb_publishable_vT_w6EoVLl-BK12ojRTaOg_UeSXAVvh";
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

let dataGlobal = [];

// ============ CARGAR DATOS ============
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
        crearGraficos();
    } catch (err) {
        document.getElementById('loading').textContent = 'No hay datos disponibles. Sube un Excel primero.';
        console.error(err);
    }
}

// ============ HELPERS ============
function obtenerColumna(clave) {
    if (dataGlobal.length === 0) return null;
    const keys = Object.keys(dataGlobal[0]);
    return keys.find(k => k.trim().toLowerCase() === clave.trim().toLowerCase());
}

function normalizar(v) {
    return v !== undefined && v !== null ? v.toString().trim() : '';
}

// ============ KPIs ============
function calcularKPIs() {
    const cInc = obtenerColumna('Incidencia');
    const cEst = obtenerColumna('Estado');

    let incidencias = 0, cerrados = 0, enProceso = 0;

    dataGlobal.forEach(f => {
        const inc = normalizar(f[cInc]).toLowerCase();
        const est = normalizar(f[cEst]).toLowerCase();
        if (inc === 'sí' || inc === 'si') incidencias++;
        if (est === 'cerrado') cerrados++;
        if (est === 'en proceso') enProceso++;
    });

    document.getElementById('kpiTotal').textContent = dataGlobal.length;
    document.getElementById('kpiIncidencias').textContent = incidencias;
    document.getElementById('kpiCerrados').textContent = cerrados;
    document.getElementById('kpiProceso').textContent = enProceso;
}

// ============ GRÁFICOS ============
function crearGraficos() {
    const cTurno = obtenerColumna('Turno');
    const cArea = obtenerColumna('Área');

    // Por Turno
    const porTurno = {};
    dataGlobal.forEach(f => {
        const t = normalizar(f[cTurno]) || 'Sin turno';
        porTurno[t] = (porTurno[t] || 0) + 1;
    });

    new Chart(document.getElementById('chartTurno'), {
        type: 'doughnut',
        data: {
            labels: Object.keys(porTurno),
            datasets: [{
                data: Object.values(porTurno),
                backgroundColor: ['#ff6b00', '#00d2ff', '#8b5cf6', '#10b981'],
                borderColor: '#1e293b',
                borderWidth: 3
            }]
        },
        options: {
            responsive: true,
            plugins: {
                legend: { labels: { color: '#94a3b8' } }
            }
        }
    });

    // Por Área
    const porArea = {};
    dataGlobal.forEach(f => {
        const a = normalizar(f[cArea]) || 'Sin área';
        porArea[a] = (porArea[a] || 0) + 1;
    });

    new Chart(document.getElementById('chartArea'), {
        type: 'bar',
        data: {
            labels: Object.keys(porArea),
            datasets: [{
                data: Object.values(porArea),
                backgroundColor: '#ff6b00',
                borderRadius: 6
            }]
        },
        options: {
            responsive: true,
            plugins: { legend: { display: false } },
            scales: {
                x: { ticks: { color: '#94a3b8' }, grid: { display: false } },
                y: { ticks: { color: '#94a3b8' }, grid: { color: 'rgba(148,163,184,0.1)' } }
            }
        }
    });
}

// ============ INICIO ============
cargarDatos();