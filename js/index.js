const SUPABASE_URL = "https://uoftarfxakkpevugdycg.supabase.co";
const SUPABASE_KEY = "sb_publishable_vT_w6EoVLl-BK12ojRTaOg_UeSXAVvh";
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

let workbookData = null;
let hojasProcesadas = {};

const fileInput = document.getElementById('excelFile');
const sheetStatus = document.getElementById('sheetStatus');
const sheetList = document.getElementById('sheetList');
const btnSubir = document.getElementById('btnSubir');
const mensaje = document.getElementById('mensaje');

// ============ CONFIGURACIÓN DE ENCABEZADOS POR HOJA ============
const HOJAS_CONFIG = {
    'Hoja 1': { headerRow: null, subHeaderRow: null, keywords: ['Fecha', 'Materia', 'Proveedor', 'Costo'] },
    'MATERIA PRIMA': { headerRow: null, subHeaderRow: null, keywords: ['Fecha', 'Materia', 'Proveedor'] }
};

fileInput.addEventListener('change', function (e) {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function (event) {
        const data = new Uint8Array(event.target.result);
        const workbook = XLSX.read(data, { type: 'array' });
        workbookData = workbook;
        hojasProcesadas = {};

        sheetList.innerHTML = '';
        workbook.SheetNames.forEach(name => {
            const li = document.createElement('li');
            li.innerHTML = `<i class="fas fa-check-circle"></i> ${name}`;
            sheetList.appendChild(li);

            hojasProcesadas[name] = procesarHoja(name, workbook.Sheets[name]);
        });

        sheetStatus.style.display = 'block';
        mostrarMensaje('Excel cargado. Revisa las hojas y haz clic en Subir.', 'ok');
    };
    reader.readAsArrayBuffer(file);
});

function procesarHoja(nombreHoja, worksheet) {
    const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1, raw: false });
    if (rows.length === 0) return [];

    const config = HOJAS_CONFIG[nombreHoja] || { headerRow: null, subHeaderRow: null, keywords: ['Fecha'] };

    let headerIndex;
    let subHeaderIndex = null;

    if (config.headerRow !== null && config.headerRow !== undefined) {
        headerIndex = config.headerRow;
        subHeaderIndex = config.subHeaderRow;
    } else {
        const keywords = config.keywords || ['Fecha'];
        let mejorMatch = 0;
        headerIndex = 0;
        for (let i = 0; i < Math.min(rows.length, 15); i++) {
            const fila = rows[i].map(c => (c || '').toString().trim().toLowerCase());
            let matches = 0;
            keywords.forEach(kw => {
                if (fila.some(cell => cell.includes(kw.toLowerCase()))) matches++;
            });
            if (matches > mejorMatch) {
                mejorMatch = matches;
                headerIndex = i;
            }
        }
    }

    const fila1 = rows[headerIndex] || [];
    let headersFinales = [];
    let dataStart = headerIndex + 1;

    if (subHeaderIndex !== null && subHeaderIndex !== undefined) {
        const fila2 = rows[subHeaderIndex] || [];
        headersFinales = combinarHeaders(fila1, fila2);
        dataStart = subHeaderIndex + 1;
    } else {
        headersFinales = fila1.map(h => (h || '').toString().trim());
    }

    const headersUnicos = [];
    const contador = {};
    headersFinales.forEach((h, i) => {
        let limpio = (h || '').toString().trim();
        if (limpio === '') limpio = `Columna_${i + 1}`;
        if (contador[limpio]) {
            contador[limpio]++;
            headersUnicos.push(`${limpio}_${contador[limpio]}`);
        } else {
            contador[limpio] = 1;
            headersUnicos.push(limpio);
        }
    });

    const dataRows = rows.slice(dataStart);

    return dataRows.map(row => {
        const obj = {};
        headersUnicos.forEach((h, i) => {
            obj[h] = row[i];
        });
        return obj;
    }).filter(f => Object.values(f).some(v => v !== undefined && v !== null && v !== ''));
}

// ============ TÉCNICA DE DOBLE FILA ============
function combinarHeaders(fila1, fila2) {
    const maxLen = Math.max(fila1.length, fila2.length);
    const headers = [];
    let ultimoFila1 = '';

    for (let i = 0; i < maxLen; i++) {
        const v1 = (fila1[i] || '').toString().trim();
        const v2 = (fila2[i] || '').toString().trim();

        if (v1 !== '') ultimoFila1 = v1;

        let resultado = '';

        if (v1 !== '' && v2 !== '') {
            resultado = `${v1} ${v2}`;
        } else if (v1 !== '') {
            resultado = v1;
        } else if (v2 !== '') {
            resultado = ultimoFila1 ? `${ultimoFila1} ${v2}` : v2;
        }

        headers.push(resultado);
    }

    return headers;
}

btnSubir.addEventListener('click', async function () {
    if (!hojasProcesadas || Object.keys(hojasProcesadas).length === 0) {
        mostrarMensaje('Primero selecciona un archivo Excel válido.', 'error');
        return;
    }

    btnSubir.disabled = true;
    btnSubir.textContent = 'Subiendo...';
    mostrarMensaje('Subiendo hojas a Supabase...', 'loading');

    try {
        await supabaseClient.from('dashboard_data').delete().neq('id', 0);

        const registros = Object.entries(hojasProcesadas).map(([nombre, data]) => ({
            sheet_name: nombre,
            data: data
        }));

        const { error } = await supabaseClient
            .from('dashboard_data')
            .insert(registros);

        if (error) throw error;

        mostrarMensaje('✅ Datos subidos correctamente. El dashboard ya está actualizado.', 'ok');
    } catch (err) {
        console.error(err);
        mostrarMensaje('❌ Error: ' + err.message, 'error');
    } finally {
        btnSubir.disabled = false;
        btnSubir.textContent = 'Subir a Supabase';
    }
});

function mostrarMensaje(texto, tipo) {
    mensaje.textContent = texto;
    mensaje.className = 'mensaje ' + tipo;
}