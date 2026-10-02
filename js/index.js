const SUPABASE_URL = "https://qhqrnnkuhsaszonippnj.supabase.co";
const SUPABASE_KEY = "sb_publishable_aGjT0aecqNHf96Tm7QLMtw_qjCKs5n3";
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

const fileInput = document.getElementById('excelFile');
const sheetStatus = document.getElementById('sheetStatus');
const sheetList = document.getElementById('sheetList');
const btnSubir = document.getElementById('btnSubir');
const mensaje = document.getElementById('mensaje');

let hojasProcesadas = {};
const TAMANO_LOTE = 1000;

fileInput.addEventListener('change', function (e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function (event) {
        const data = new Uint8Array(event.target.result);
        const workbook = XLSX.read(data, { type: 'array' });
        hojasProcesadas = {};
        sheetList.innerHTML = '';

        // Procesar SOLO las hojas relevantes (por nombre)
        const hojasRelevantes = ["PRODUCCIÓN 2026", "MOLIENDA EXTRUSIÓN"];
        let encontradas = 0;

        for (const nombreHoja of workbook.SheetNames) {
            if (!hojasRelevantes.includes(nombreHoja.trim())) continue;
            const worksheet = workbook.Sheets[nombreHoja];
            const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1, raw: false });
            const filas = procesarHoja(rows);
            if (filas.length === 0) continue;

            const key = nombreHoja.trim() === "PRODUCCIÓN 2026" ? "PRODUCCION" : "MOLIENDA";
            hojasProcesadas[key] = filas;
            encontradas++;

            const li = document.createElement('li');
            li.innerHTML = `<i class="fas fa-check-circle"></i> ${nombreHoja} → ${key} (${filas.length} filas)`;
            sheetList.appendChild(li);
        }

        if (encontradas === 0) {
            mostrarMensaje('No se detectaron las hojas "PRODUCCIÓN 2026" ni "MOLIENDA EXTRUSIÓN".', 'error');
            return;
        }
        sheetStatus.style.display = 'block';
        mostrarMensaje(`Listo para subir (${encontradas} hoja/s).`, 'ok');
    };
    reader.readAsArrayBuffer(file);
});

function procesarHoja(rows) {
    if (!rows || rows.length === 0) return [];
    let headerIndex = 0;
    for (let i = 0; i < Math.min(rows.length, 20); i++) {
        const fila = rows[i].map(c => (c || '').toString().trim().toLowerCase());
        if (fila.includes('producto') && fila.some(c => c.includes('kg'))) { headerIndex = i; break; }
    }
    const headers = (rows[headerIndex] || []).map((h, i) => {
        let limpio = (h || '').toString().trim().replace(/<br\s*\/?>/gi, ' ').replace(/\s+/g, ' ');
        return limpio === '' ? `Columna_${i + 1}` : limpio;
    });
    const headersUnicos = [], contador = {};
    headers.forEach(h => {
        if (contador[h]) { contador[h]++; headersUnicos.push(`${h}_${contador[h]}`); }
        else { contador[h] = 1; headersUnicos.push(h); }
    });
    return rows.slice(headerIndex + 1).map(row => {
        const obj = {};
        headersUnicos.forEach((h, i) => { obj[h] = row[i]; });
        return obj;
    }).filter(f => Object.values(f).some(v => v !== undefined && v !== null && v !== ''));
}

btnSubir.addEventListener('click', async function () {
    if (!hojasProcesadas || Object.keys(hojasProcesadas).length === 0) {
        mostrarMensaje('Primero selecciona un archivo Excel válido.', 'error');
        return;
    }
    btnSubir.disabled = true;
    btnSubir.textContent = 'Subiendo...';
    try {
        for (const [nombre, data] of Object.entries(hojasProcesadas)) {
            mostrarMensaje(`Borrando datos anteriores de ${nombre}...`, 'loading');
            await supabaseClient.from('dashboard_data').delete().eq('sheet_name', nombre);
            if (data.length === 0) continue;
            const totalLotes = Math.ceil(data.length / TAMANO_LOTE);
            for (let lote = 0; lote < totalLotes; lote++) {
                const inicio = lote * TAMANO_LOTE;
                const bloque = data.slice(inicio, inicio + TAMANO_LOTE);
                const registros = bloque.map((fila, idx) => ({ sheet_name: nombre, row_index: inicio + idx, data: fila }));
                mostrarMensaje(`📤 ${nombre}: lote ${lote + 1}/${totalLotes}`, 'loading');
                const { error } = await supabaseClient.from('dashboard_data').insert(registros);
                if (error) throw error;
            }
        }
        mostrarMensaje('✅ Proceso terminado.', 'ok');
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