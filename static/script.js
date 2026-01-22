document.addEventListener('DOMContentLoaded', () => {
    // Init dates
    document.getElementById('current-date').innerText = new Date().toLocaleDateString('es-ES', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

    // Default view
    loadDashboard();

    // Setup listeners
    setupScanner();
    setupFileUpload();

    // Check key
    if (localStorage.getItem('gemini_api_key'))
        sendApiKey(localStorage.getItem('gemini_api_key'));

    // Payment change calculation
    document.getElementById('pay-received')?.addEventListener('input', (e) => {
        const total = ticketItems.reduce((acc, item) => acc + (item.precio * item.cantidad), 0);
        const received = parseFloat(e.target.value) || 0;
        const change = Math.max(0, received - total);
        document.getElementById('pay-change').innerText = change.toFixed(2) + ' €';
    });

    // Detect IP for phone connection
    setupMobileAssistant();
});

let html5QrCode = null;

// --- NAVIGATION ---
function showView(viewId) {
    document.querySelectorAll('.view-section').forEach(el => el.classList.add('hidden'));
    document.getElementById(`view-${viewId}`).classList.remove('hidden');

    document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.remove('active'));
    // Find button that calls this view
    const btn = Array.from(document.querySelectorAll('.nav-btn')).find(b => b.getAttribute('onclick')?.includes(viewId));
    if (btn) btn.classList.add('active');

    // Load specific data
    if (viewId === 'dashboard') loadDashboard();
    if (viewId === 'inventory') loadInventory();
    if (viewId === 'sales') loadSalesHistory();
    if (viewId === 'expenses') loadExpenses();
    if (viewId === 'pos') {
        document.getElementById('pos-scanner').focus();
        loadQuickCatalog();
    }
}

// --- DASHBOARD ---
function loadDashboard() {
    fetch('/api/dashboard')
        .then(r => r.json())
        .then(data => {
            animateValue('dash-sales', data.ventas_hoy, '€');
            animateValue('dash-expenses', data.gastos_hoy, '€');
            animateValue('dash-profit', data.beneficio_hoy, '€');

            renderSalesChart(data.history);

            // Más vendidos
            const topList = document.getElementById('top-products-list');
            topList.innerHTML = data.top_selling.map(p => `
                <div style="display:flex; justify-content:space-between; padding:5px; border-bottom:1px solid rgba(255,255,255,0.05)">
                    <span>${p.nombre}</span>
                    <span style="color:var(--primary); font-weight:bold">${p.cantidad} uds</span>
                </div>
            `).join('');

            // Inventario
            document.getElementById('inv-val-venta').innerText = (data.inventory.valor_venta || 0).toLocaleString() + ' €';
            document.getElementById('inv-total-items').innerText = (data.inventory.total_items || 0);

            // Alertas Stock
            const tbody = document.querySelector('#stock-alert-table tbody');
            if (data.low_stock.length === 0) {
                tbody.innerHTML = '<tr><td colspan="3" style="text-align:center; color:#10b981"><i class="ph ph-check-circle"></i> Todo el inventario está bien</td></tr>';
            } else {
                tbody.innerHTML = data.low_stock.map(p => `
                <tr>
                    <td>
                        <div style="font-weight:500">${p.nombre}</div>
                        <div style="font-size:0.8rem; color:#94a3b8">${p.codigo}</div>
                    </td>
                    <td style="color:#ef4444; font-weight:bold">${p.stock} uds</td>
                    <td><button class="btn-icon" onclick="showView('upload')"><i class="ph ph-plus-circle"></i></button></td>
                </tr>
            `).join('');
            }
        });
}

function renderSalesChart(history) {
    const ctx = document.getElementById('salesChart').getContext('2d');
    if (window.myChart) window.myChart.destroy();

    window.myChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: history.map(d => d.dia.split('-').slice(1).reverse().join('/')),
            datasets: [{
                label: 'Ventas (€)',
                data: history.map(d => d.total),
                borderColor: '#6366f1',
                backgroundColor: 'rgba(99, 102, 241, 0.1)',
                fill: true,
                tension: 0.4
            }]
        },
        options: {
            responsive: true,
            plugins: { legend: { display: false } },
            scales: {
                y: { beginAtZero: true, grid: { color: 'rgba(255,255,255,0.05)' } },
                x: { grid: { display: false } }
            }
        }
    });
}

function animateValue(id, value, suffix) {
    const el = document.getElementById(id);
    el.innerText = value.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' ' + suffix;
    // Simple color logic
    if (id === 'dash-profit') {
        el.style.color = value >= 0 ? 'var(--success)' : 'var(--danger)';
    }
}

// --- GASTOS ---
function loadExpenses() {
    fetch('/api/gastos')
        .then(r => r.json())
        .then(gastos => {
            const tbody = document.getElementById('expenses-body');
            tbody.innerHTML = gastos.map(g => `
            <tr>
                <td>${new Date(g.fecha).toLocaleDateString()}</td>
                <td>${g.concepto}</td>
                <td><span class="badge" style="background:rgba(255,255,255,0.1); font-weight:400">${g.categoria}</span></td>
                <td style="color:var(--danger)">-${g.monto.toFixed(2)} €</td>
                <td><button class="btn-icon" onclick="deleteExpense(${g.id})"><i class="ph ph-trash"></i></button></td>
            </tr>
        `).join('');
        });
}

function addExpense() {
    const concepto = document.getElementById('exp-desc').value;
    const monto = document.getElementById('exp-amount').value;
    const cat = document.getElementById('exp-cat').value;

    if (!concepto || !monto) return showToast('Rellena los datos', 'error');

    fetch('/api/gastos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ concepto, monto, categoria: cat })
    })
        .then(() => {
            showToast('Gasto registrado');
            document.getElementById('exp-desc').value = '';
            document.getElementById('exp-amount').value = '';
            loadExpenses();
        });
}

function deleteExpense(id) {
    if (confirm('¿Borrar registro?')) {
        fetch(`/api/gastos/${id}`, { method: 'DELETE' }).then(loadExpenses);
    }
}

// --- VENTAS HISTORIAL ---
function loadSalesHistory() {
    fetch('/api/ventas/historial')
        .then(r => r.json())
        .then(ventas => {
            const tbody = document.getElementById('sales-history-body');
            tbody.innerHTML = ventas.map(v => {
                const itemsSummary = v.items.map(i => `${i.cantidad}x ${i.nombre}`).join(', ');
                return `
            <tr>
                <td style="font-family:monospace">#${v.id}</td>
                <td>${new Date(v.fecha).toLocaleString()}</td>
                <td style="font-weight:bold; color:var(--success)">+${v.total.toFixed(2)} €</td>
                <td style="font-size:0.9rem; color:#94a3b8; max-width:300px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis" title="${itemsSummary}">${itemsSummary}</td>
            </tr>
            `;
            }).join('');
        });
}

// --- POS / TPV (Adaptado) ---
let ticketItems = [];
let scanBuffer = '';
let lastKeyTime = Date.now();

function setupScanner() {
    // Escuchar globalmente por si el foco no está en el input
    document.addEventListener('keydown', (e) => {
        const currentTime = Date.now();

        // Los scanners suelen ser muy rápidos (< 30ms entre teclas)
        if (currentTime - lastKeyTime > 50) {
            scanBuffer = '';
        }

        if (e.key === 'Enter') {
            if (scanBuffer.length > 2) {
                scanProduct(scanBuffer);
                scanBuffer = '';
                e.preventDefault();
            }
        } else if (e.key.length === 1) {
            scanBuffer += e.key;
        }

        lastKeyTime = currentTime;
    });

    const input = document.getElementById('pos-scanner');
    if (!input) return;
    input.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            const code = e.target.value.trim();
            if (code) { scanProduct(code); e.target.value = ''; }
        }
    });
}

function scanProduct(code) {
    fetch(`/api/producto/scan?code=${encodeURIComponent(code)}`)
        .then(res => { if (!res.ok) throw new Error(); return res.json(); })
        .then(product => { if (product) addToTicket(product); else showToast('No encontrado', 'error'); })
        .catch(() => showToast('Error buscando producto', 'error'));
}

function addToTicket(product) {
    const existing = ticketItems.find(i => i.codigo === product.codigo);
    if (existing) existing.cantidad++;
    else ticketItems.push({ ...product, cantidad: 1, precio: product.venta });
    renderTicket();
}

function renderTicket() {
    const container = document.getElementById('ticket-items-container');
    const totalEl = document.getElementById('ticket-total');

    if (ticketItems.length === 0) {
        container.innerHTML = '<div class="empty-ticket-msg">Ticket vacío</div>';
        totalEl.textContent = '0.00 €';
        return;
    }

    let total = 0;
    container.innerHTML = ticketItems.map((item, idx) => {
        const sub = item.precio * item.cantidad;
        total += sub;
        return `
            <div class="ticket-item" style="display:flex; justify-content:space-between; margin-bottom:10px; padding:10px; background:rgba(255,255,255,0.05); border-radius:8px">
                <div>
                    <div style="font-weight:500">${item.nombre}</div>
                    <div style="font-size:0.85rem; color:#94a3b8">${item.cantidad} x ${item.precio.toFixed(2)} €</div>
                </div>
                <div style="display:flex; align-items:center; gap:10px">
                    <div style="font-weight:bold">${sub.toFixed(2)} €</div>
                    <button class="btn-icon" onclick="removeTicketItem(${idx})"><i class="ph ph-trash"></i></button>
                </div>
            </div>
        `;
    }).join('');

    totalEl.textContent = total.toFixed(2) + ' €';
}

window.removeTicketItem = (idx) => { ticketItems.splice(idx, 1); renderTicket(); };
window.clearTicket = () => { ticketItems = []; renderTicket(); };

function finalizeSale() {
    if (ticketItems.length === 0) return;
    fetch('/api/venta', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: ticketItems })
    })
        .then(r => r.json())
        .then(d => {
            if (d.success) {
                showToast('Venta realizada');
                printTicket(); // Llamar a la función de impresión
                clearTicket();
                loadQuickCatalog();
            } else showToast(d.error, 'error');
        });
}

function printTicket() {
    const printWindow = window.open('', '_blank');
    const total = ticketItems.reduce((acc, item) => acc + (item.precio * item.cantidad), 0);
    const baseImponible = total / 1.21;
    const cuotaIva = total - baseImponible;

    const received = parseFloat(document.getElementById('pay-received').value) || total;
    const change = received - total;
    const date = new Date().toLocaleString();

    let itemsHtml = ticketItems.map(item => `
        <div style="display:flex; justify-content:space-between; margin-bottom: 5px;">
            <span>${item.cantidad} x ${item.nombre}</span>
            <span>${(item.precio * item.cantidad).toFixed(2)}€</span>
        </div>
    `).join('');

    printWindow.document.write(`
        <html>
            <head>
                <style>
                    body { font-family: 'Courier New', Courier, monospace; width: 72mm; padding: 10px; margin: 0; font-size: 13px; color: #000; }
                    .header { text-align: center; margin-bottom: 15px; }
                    .divider { border-top: 1px dashed #000; margin: 10px 0; }
                    .total-big { font-weight: bold; font-size: 18px; margin: 10px 0; display: flex; justify-content: space-between; }
                    .tax-row { font-size: 11px; display: flex; justify-content: space-between; margin-bottom: 3px; }
                    @media print { @page { margin: 0; } }
                </style>
            </head>
            <body>
                <div class="header">
                    <h2 style="margin:0">Nexus Store</h2>
                    <p style="margin:2px 0">CIF: B12345678</p>
                    <p style="font-weight:bold; margin-top:10px">FACTURA SIMPLIFICADA</p>
                    <p style="font-size:11px">Op: T-${Date.now().toString().slice(-5)}</p>
                    <p style="font-size:11px">${date}</p>
                </div>
                <div class="divider"></div>
                <div style="font-weight:bold; display:flex; justify-content:space-between; margin-bottom:5px">
                    <span>Uds. Producto</span>
                    <span>Importe</span>
                </div>
                ${itemsHtml}
                <div class="divider"></div>
                <div class="tax-row">
                    <span>21% Base: ${baseImponible.toFixed(2)}€</span>
                    <span>Cuota: ${cuotaIva.toFixed(2)}€</span>
                </div>
                <div class="tax-row" style="font-weight:bold">
                    <span>Total: ${baseImponible.toFixed(2)}€</span>
                    <span>Total: ${cuotaIva.toFixed(2)}€</span>
                </div>
                <div class="total-big">
                    <span>Total (IVA incl.)</span>
                    <span>${total.toFixed(2)}€</span>
                </div>
                <div class="divider"></div>
                <div class="tax-row" style="font-size: 13px;">
                    <span>Entregado:</span>
                    <span>${received.toFixed(2)}€</span>
                </div>
                <div class="tax-row" style="font-size: 13px; font-weight:bold">
                    <span>Cambio:</span>
                    <span>${change.toFixed(2)}€</span>
                </div>
                <div class="header" style="margin-top:30px">
                    <p>¡Gracias por su visita!</p>
                </div>
                <script>
                    window.onload = function() { window.print(); window.close(); }
                </script>
            </body>
        </html>
    `);
    printWindow.document.close();
    // Limpiar campo de pago
    document.getElementById('pay-received').value = '';
    document.getElementById('pay-change').innerText = '0.00 €';
}

function loadQuickCatalog() {
    fetch('/api/productos').then(r => r.json()).then(prods => {
        const grid = document.getElementById('quick-products-grid');
        grid.innerHTML = prods.slice(0, 15).map(p => `
            <div class="product-card" onclick="scanProduct('${p.codigo}')">
                <div style="font-size:0.85rem; height:40px; overflow:hidden">${p.nombre}</div>
                <div style="margin-top:5px; font-weight:700; color:var(--warning)">${p.venta.toFixed(2)} €</div>
            </div>
        `).join('');
    });
}

// --- UPLOAD & INVENTORY (Simplificado) ---
function loadInventory() {
    fetch('/api/productos').then(r => r.json()).then(prods => {
        document.getElementById('inventory-body').innerHTML = prods.map(p => `
            <tr>
                <td style="font-family:monospace">${p.codigo}</td>
                <td>${p.nombre}</td>
                <td>
                    <div style="display:flex; align-items:center; gap:8px">
                        <button class="btn-icon" onclick="updateStock(${p.id}, -1)" style="font-size:0.8rem"><i class="ph ph-minus"></i></button>
                        <span class="badge ${p.stock < 5 ? 'bg-red' : 'bg-gray'}">${p.stock}</span>
                        <button class="btn-icon" onclick="updateStock(${p.id}, 1)" style="font-size:0.8rem"><i class="ph ph-plus"></i></button>
                    </div>
                </td>
                <td>${p.costo.toFixed(2)}</td>
                <td>${p.venta.toFixed(2)}</td>
                <td><button class="btn-icon" onclick="deleteProduct(${p.id})"><i class="ph ph-trash"></i></button></td>
            </tr>
        `).join('');
    });
}

// --- UTILS ---
function showToast(msg, type = 'success') {
    const t = document.getElementById('toast');
    t.innerText = msg;
    t.style.background = type === 'error' ? 'var(--danger)' : 'var(--success)';
    t.classList.remove('hidden');
    setTimeout(() => t.classList.add('hidden'), 3000);
}

// --- API KEY ---
function promptApiKey() { document.getElementById('apikey-modal').classList.remove('hidden'); }
window.closeModal = (id) => document.getElementById(id).classList.add('hidden');
window.saveApiKey = () => {
    const key = document.getElementById('api-key-input').value;
    if (key) {
        localStorage.setItem('gemini_api_key', key); sendApiKey(key);
        closeModal('apikey-modal');
    }
};
function sendApiKey(key) {
    fetch('/api/config/apikey', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key }) });
}

// Upload handlers
function setupFileUpload() {
    const input = document.getElementById('file-input');
    const zone = document.getElementById('drop-zone');
    if (!input) return; // Puede no existir en todas las vistas inicialmente si hidden
    zone.onclick = () => input.click();
    input.onchange = (e) => handleUpload(e.target.files[0]);
    // Drag handlers ignored for brevity but same logic
}

function handleUpload(file) {
    if (!file) return;
    const fd = new FormData(); fd.append('file', file);
    document.getElementById('drop-zone').innerHTML = '<i class="ph ph-spinner ph-spin"></i>';

    fetch('/api/upload', { method: 'POST', body: fd }).then(r => r.json()).then(res => {
        document.getElementById('drop-zone').innerHTML = '<i class="ph ph-file-image"></i>';
        if (res.success) showDetected(res.productos);
        else showToast(res.error, 'error');
    });
}

function showDetected(items) {
    document.getElementById('view-upload').querySelector('.upload-hero').classList.add('hidden');
    document.getElementById('ocr-results-panel').classList.remove('hidden');
    const tbody = document.querySelector('#ocr-table tbody');
    tbody.innerHTML = items.map((p, i) => `
        <tr data-idx="${i}">
            <td><input value="${p.codigo}" name="cod"></td>
            <td><input value="${p.nombre}" name="nom"></td>
            <td width="60"><input value="${p.unidades || 1}" name="cant" type="number"></td>
            <td width="80"><input value="${p.venta}" name="pvp" type="number" step="0.01"></td>
        </tr>
    `).join('');

    document.getElementById('save-all-btn').onclick = async () => {
        for (const tr of tbody.querySelectorAll('tr')) {
            const p = {
                codigo: tr.querySelector('[name=cod]').value,
                nombre: tr.querySelector('[name=nom]').value,
                stock: tr.querySelector('[name=cant]').value,
                venta: tr.querySelector('[name=pvp]').value,
                costo: 0 // Si no lo editamos se queda 0 a menos que venga del server
            };
            await fetch('/api/productos', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(p) });
        }
        showToast('Guardado');
        document.getElementById('ocr-results-panel').classList.add('hidden');
        document.getElementById('view-upload').querySelector('.upload-hero').classList.remove('hidden');
    };
}

window.updateStock = async (id, delta) => {
    const prods = await fetch('/api/productos').then(r => r.json());
    const p = prods.find(x => x.id === id);
    if (!p) return;
    await fetch('/api/productos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            codigo: p.codigo,
            nombre: p.nombre,
            costo: p.costo,
            venta: p.venta,
            stock: delta
        })
    });
    loadInventory();
};

document.getElementById('inventory-search')?.addEventListener('input', (e) => {
    const term = e.target.value.toLowerCase();
    fetch(`/api/productos?search=${encodeURIComponent(term)}`)
        .then(r => r.json())
        .then(prods => {
            const tbody = document.getElementById('inventory-body');
            tbody.innerHTML = prods.map(p => `
                <tr>
                    <td style="font-family:monospace">${p.codigo}</td>
                    <td>${p.nombre}</td>
                    <td>
                        <div style="display:flex; align-items:center; gap:8px">
                            <button class="btn-icon" onclick="updateStock(${p.id}, -1)" style="font-size:0.8rem"><i class="ph ph-minus"></i></button>
                            <span class="badge ${p.stock < 5 ? 'bg-red' : 'bg-gray'}">${p.stock}</span>
                            <button class="btn-icon" onclick="updateStock(${p.id}, 1)" style="font-size:0.8rem"><i class="ph ph-plus"></i></button>
                        </div>
                    </td>
                    <td>${p.costo.toFixed(2)}</td>
                    <td>${p.venta.toFixed(2)}</td>
                    <td><button class="btn-icon" onclick="deleteProduct(${p.id})"><i class="ph ph-trash"></i></button></td>
                </tr>
            `).join('');
        });
});

// --- MOBILE & MANUAL ADD ---
function setupMobileAssistant() {
    fetch('/api/config/ip')
        .then(r => r.json())
        .then(data => {
            const url = `http://${data.ip}:5000`;
            document.getElementById('local-url').innerText = url;
            // Generar QR usando una API gratuita (QRServer)
            document.getElementById('qr-img').src = `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(url)}`;
        });
}

function openManualAdd() {
    document.getElementById('manual-add-modal').classList.remove('hidden');
}

async function saveManualProduct() {
    const p = {
        codigo: document.getElementById('man-code').value,
        nombre: document.getElementById('man-name').value,
        costo: parseFloat(document.getElementById('man-cost').value) || 0,
        venta: parseFloat(document.getElementById('man-price').value) || 0,
        stock: parseInt(document.getElementById('man-stock').value) || 0
    };

    if (!p.codigo || !p.nombre) return showToast('Código y Nombre obligatorios', 'error');

    const res = await fetch('/api/productos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(p)
    });

    if (res.ok) {
        showToast('Producto guardado');
        closeModal('manual-add-modal');
        loadInventory();
        // Limpiar
        ['man-code', 'man-name', 'man-cost', 'man-price', 'man-stock'].forEach(id => document.getElementById(id).value = '');
    } else {
        showToast('Error al guardar', 'error');
    }
}

function startPhoneScanner() {
    document.getElementById('scanner-modal').classList.remove('hidden');
    html5QrCode = new Html5Qrcode("reader");
    html5QrCode.start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 250, height: 250 } },
        (decodedText) => {
            document.getElementById('man-code').value = decodedText;
            stopScanner();
        },
        () => { } // Ignorar errores de escaneo continuo
    ).catch(err => {
        console.error(err);
        showToast("Error cámara: " + err, "error");
    });
}

function stopScanner() {
    if (html5QrCode) {
        html5QrCode.stop().then(() => {
            document.getElementById('scanner-modal').classList.add('hidden');
        }).catch(() => {
            document.getElementById('scanner-modal').classList.add('hidden');
        });
    } else {
        document.getElementById('scanner-modal').classList.add('hidden');
    }
}

// Sobrescribir closeModal para asegurar limpieza de cámara
const originalCloseModal = window.closeModal;
window.closeModal = (id) => {
    if (id === 'scanner-modal') stopScanner();
    originalCloseModal(id);
};

window.deleteProduct = (id) => {
    if (confirm('¿Eliminar producto?')) {
        fetch(`/api/productos/${id}`, { method: 'DELETE' }).then(loadInventory);
    }
}
