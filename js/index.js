// ============ CONFIGURACIÓN SUPABASE ============
const SUPABASE_URL = "https://uoftarfxakkpevugdycg.supabase.co";
const SUPABASE_KEY = "sb_publishable_vT_w6EoVLl-BK12ojRTaOg_UeSXAVvh";
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

let workbookData = null;
let dataGlobal = [];

const fileInput = document.getElementById('excelFile');
const sheetSelector = document.getElementById('sheetSelector');
const sheetSelect = document.getElementById('sheetSelect');
const btnSubir = document.getElementById('btnSubir');
const mensaje = document.getElementById('mensaje');
const tableContainer = document.getElementById('tableContainer');

fileInput.addEventListener('change', function (e) {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function (event) {
        const data = new Uint8Array(event.target.result);
        const workbook = XLSX.read(data, { type: 'array' });
        workbookData = workbook;

        sheetSelect.innerHTML = '';
        workbook.SheetNames.forEach(name => {
            const opt = document.createElement('option');
            opt.value = name;
            opt.textContent = name;
            sheetSelect.appendChild(opt);
        });

        sheetSelector.style.display = 'flex';
        procesarPestaña(workbook.SheetNames[0]);
    };
    reader.readAsArrayBuffer(file);
});

sheetSelect.addEventListener('change', function () {
    procesarPestaña(this.value);
});

function procesarPestaña(nombre) {
    const worksheet = workbookData.Sheets[nombre];
    const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1, raw: false });

    if (rows.length === 0) return;

    // ============ DETECTAR FILA DE ENCABEZADOS REAL ============
    // Busca la fila que contiene "Status Final" o "Estado de reporte"
    let headerRowIndex = 0;
    for (let i = 0; i < Math.min(rows.length, 10); i++) {
        const fila = rows[i].map(c => (c || '').toString().trim().toLowerCase());
        if (fila.includes('status final') || fila.includes('estado de reporte') || fila.includes('flota')) {
            headerRowIndex = i;
            break;
        }
    }

    const headers = rows[headerRowIndex];
    const dataRows = rows.slice(headerRowIndex + 1);

    dataGlobal = dataRows.map(row => {
        const obj = {};
        headers.forEach((h, i) => {
            if (h && h.toString().trim() !== '') {
                obj[h.toString().trim()] = row[i];
            }
        });
        return obj;
    }).filter(f => Object.values(f).some(v => v !== undefined && v !== null && v !== ''));

    // Renderizar tabla previa
    let html = '<table><thead><tr>';
    headers.forEach(h => html += `<th>${h || ''}</th>`);
    html += '</tr></thead><tbody>';
    dataRows.slice(0, 100).forEach(row => {
        html += '<tr>';
        headers.forEach((_, idx) => {
            html += `<td>${row[idx] !== undefined ? row[idx] : ''}</td>`;
        });
        html += '</tr>';
    });
    html += '</tbody></table>';
    tableContainer.innerHTML = html;
}

btnSubir.addEventListener('click', async function () {
    if (!dataGlobal || dataGlobal.length === 0) {
        mostrarMensaje('Primero selecciona un archivo Excel válido.', 'error');
        return;
    }

    btnSubir.disabled = true;
    btnSubir.textContent = 'Subiendo...';
    mostrarMensaje('Subiendo datos, por favor espera...', 'loading');

    try {
        await supabaseClient.from('dashboard_data').delete().neq('id', 0);

        const { error } = await supabaseClient
            .from('dashboard_data')
            .insert([{
                sheet_name: sheetSelect.value,
                data: dataGlobal
            }]);

        if (error) throw error;

        mostrarMensaje('✅ Datos subidos correctamente. El dashboard ya está actualizado.', 'ok');
    } catch (err) {
        console.error(err);
        mostrarMensaje('❌ Error al subir los datos: ' + err.message, 'error');
    } finally {
        btnSubir.disabled = false;
        btnSubir.textContent = 'Subir al Dashboard';
    }
});

function mostrarMensaje(texto, tipo) {
    mensaje.textContent = texto;
    mensaje.className = 'mensaje ' + tipo;
}