const serverStatusEl = document.getElementById('server-status');
const printerStatusEl = document.getElementById('printer-status');

const configSection = document.getElementById('config-section');
const printerIpInput = document.getElementById('printer-ip');
const saveButton = document.getElementById('save-button');
const testPrintButton = document.getElementById('test-print-button');
const refreshButton = document.getElementById('refresh-button'); 
const closeSettingsButton = document.getElementById('close-settings-button'); 
const refreshOrdersButton = document.getElementById('refresh-orders');
const latestOrdersContainer = document.getElementById('latest-orders');

const unlockSection = document.getElementById('unlock-section');
const passwordInput = document.getElementById('password-input');
const unlockButton = document.getElementById('unlock-button');

unlockButton.addEventListener('click', async () => {
    const password = passwordInput.value;
    const isCorrect = await window.electronAPI.verifyPassword(password);
    
    if (isCorrect) {
        unlockSection.style.display = 'none';
        configSection.style.display = 'block';
    } else {
        alert('Contraseña incorrecta');
        passwordInput.value = '';
    }
});

closeSettingsButton.addEventListener('click', () => {
    configSection.style.display = 'none';
    unlockSection.style.display = 'block';
    passwordInput.value = '';
});

saveButton.addEventListener('click', () => {
    window.electronAPI.saveConfig({
        printerIp: printerIpInput.value
    });
});

testPrintButton.addEventListener('click', () => {
    window.electronAPI.testPrint();
});

refreshButton.addEventListener('click', () => {
    window.electronAPI.relaunchApp();
});

window.electronAPI.requestInitialConfig();

window.electronAPI.onUpdateStatus((status) => {
    if (status.server) {
        serverStatusEl.textContent = 'Corriendo ✅';
        serverStatusEl.className = 'status running';
    }
    if (status.printer) {
        const messages = {
            'printing': { text: 'Imprimiendo... ⏳', class: 'pending' },
            'success': { text: status.message || 'Última impresión OK ✅', class: 'running' },
            'error': { text: status.message || 'Error de conexión ❌', class: 'error' },
            'pending': { text: status.message || 'En espera...', class: 'pending'}
        };
        printerStatusEl.textContent = messages[status.printer].text;
        printerStatusEl.className = `status ${messages[status.printer].class}`;
    }
});


window.electronAPI.onLoadConfig((config) => {
    printerIpInput.value = config.printerIp || '';
});

// Función para actualizar las comandas
async function updateOrders() {
    latestOrdersContainer.innerHTML = '<p class="loading-message">Cargando comandas...</p>';
    try {
        const orders = await window.electronAPI.getLatestOrders();
        if (orders && orders.length > 0) {
            latestOrdersContainer.innerHTML = orders.map(order => `
                <div class="order-item">
                    <div class="order-header">
                        <span>Comanda #${order.id}</span>
                        <span class="order-time">${new Date(order.timestamp).toLocaleString()}</span>
                    </div>
                    <div class="order-details">
                        <p>Mesa: ${order.mesa}</p>
                        <p>Items: ${order.items.length}</p>
                    </div>
                    <div class="order-actions">
                        <button onclick="handleReprint(${order.id})" class="action-button reprint-button">
                            🖨️ Reimprimir
                        </button>
                    </div>
                </div>
            `).join('');

            // Agregar la función de reimpresión al contexto global
            window.handleReprint = async (commandId) => {
                try {
                    await window.electronAPI.reprintCommand(commandId);
                } catch (error) {
                    console.error('Error al reimprimir:', error);
                }
            };
        } else {
            latestOrdersContainer.innerHTML = '<p class="loading-message">No hay comandas recientes</p>';
        }
    } catch (error) {
        latestOrdersContainer.innerHTML = '<p class="loading-message">Error al cargar las comandas</p>';
    }
}

// Event listener para el botón de actualizar comandas
refreshOrdersButton.addEventListener('click', updateOrders);

// Actualizamos las comandas al inicio y cada 30 segundos
updateOrders();
setInterval(updateOrders, 30000);

// Verificación del estado de la impresora
setInterval(() => {
    console.log("Verificando estado de la impresora...");
    window.electronAPI.checkPrinterStatus();
}, 30000);