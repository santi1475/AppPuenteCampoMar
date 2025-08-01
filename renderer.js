// renderer.js
const serverStatusEl = document.getElementById('server-status');
const printerStatusEl = document.getElementById('printer-status');
const ngrokUrlEl = document.getElementById('ngrok-url');

const configSection = document.getElementById('config-section');
const printerIpInput = document.getElementById('printer-ip');
const ngrokTokenInput = document.getElementById('ngrok-token');
const saveButton = document.getElementById('save-button');
const testPrintButton = document.getElementById('test-print-button');

const unlockSection = document.getElementById('unlock-section');
const passwordInput = document.getElementById('password-input');
const unlockButton = document.getElementById('unlock-button');
// En renderer.js
unlockButton.addEventListener('click', async () => {
    const password = passwordInput.value;
    // Llama a la función segura del backend para verificar la contraseña
    const isCorrect = await window.electronAPI.verifyPassword(password);
    
    if (isCorrect) {
        unlockSection.style.display = 'none';
        configSection.style.display = 'block';
    } else {
        alert('Contraseña incorrecta');
        passwordInput.value = '';
    }
});

saveButton.addEventListener('click', () => {
    window.electronAPI.saveConfig({
        printerIp: printerIpInput.value,
        ngrokToken: ngrokTokenInput.value
    });
});

testPrintButton.addEventListener('click', () => {
    window.electronAPI.testPrint();
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
            'success': { text: 'Última impresión OK ✅', class: 'running' },
            'error': { text: 'Error de conexión ❌', class: 'error' }
        };
        printerStatusEl.textContent = messages[status.printer].text;
        printerStatusEl.className = `status ${messages[status.printer].class}`;
    }
});

window.electronAPI.onSetNgrokUrl((url) => {
    ngrokUrlEl.textContent = url;
});

window.electronAPI.onLoadConfig((config) => {
    printerIpInput.value = config.printerIp || '';
    ngrokTokenInput.value = config.ngrokToken || '';
});