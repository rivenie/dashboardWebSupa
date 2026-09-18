// ============ CONFIGURACIÓN SUPABASE ============
const SUPABASE_URL = "https://uoftarfxakkpevugdycg.supabase.co";
const SUPABASE_KEY = "sb_publishable_vT_w6EoVLl-BK12ojRTaOg_UeSXAVvh";
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// ============ VARIABLES ============
let workbookData = null;
let dataGlobal = [];

// ============ DOM ============
const fileInput = document.getElementById('excelFile');
const sheetSelector = document.getElementById('sheetSelector');
const sheetSelect = document.getElementById('sheetSelect');
const btnSubir = document.getElementById('btnSubir');
const mensaje = document.getElementById('mensaje');

// ============ LECTURA EXCEL ============
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

        sheetSelector.style.display = 'block';
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

    const headers = rows[0];
    dataGlobal = rows.slice(1).map(row => {
        const obj = {};
        headers.forEach((h, i) => {
            obj[h] = row[i];
        });
        return obj;
    });
}

// ============ SUBIR A SUPABASE ============
btnSubir.addEventListener('click', async function () {
    if (!dataGlobal || dataGlobal.length === 0) {
        mostrarMensaje('Primero selecciona un archivo Excel válido.', 'error');
        return;
    }

    btnSubir.disabled = true;
    btnSubir.textContent = 'Subiendo...';
    mostrarMensaje('Subiendo datos, por favor espera...', '');

    try {
        // 1. Eliminar los datos anteriores
        await supabaseClient
            .from('dashboard_data')
            .delete()
            .neq('id', 0);

        // 2. Insertar los nuevos datos
        const sheetName = sheetSelect.value;
        const { error } = await supabaseClient
            .from('dashboard_data')
            .insert([{
                sheet_name: sheetName,
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
    mensaje.className = tipo;
}