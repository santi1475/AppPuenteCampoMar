// main.js (versión mejorada)
const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const express = require('express');
const cors = require('cors');
const ngrok = require('ngrok');
const { ThermalPrinter, PrinterTypes } = require('node-thermal-printer');
const Store = require('electron-store');
require('dotenv').config(); 

const store = new Store();
let mainWindow;

// Función para enviar mensajes a la ventana de forma segura
function sendToWindow(channel, ...args) {
    if (mainWindow) {
        mainWindow.webContents.send(channel, ...args);
    }
}

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 500,
        height: 650, // Un poco más de alto para comodidad
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
        },
    });
    mainWindow.loadFile('index.html');
    mainWindow.on('closed', () => {
        mainWindow = null; // Limpia la referencia al cerrar
    });
}

app.whenReady().then(() => {
    createWindow();
    startPrintServer();
    startNgrokTunnel();
    // Configura que la app inicie con el sistema (Windows y macOS)
    app.setLoginItemSettings({ openAtLogin: true });
});

// --- MANEJADORES DE IPC ---

ipcMain.handle('verify-password', (event, password) => {
    // La comparación se hace de forma segura en el proceso principal
    const secret = process.env.SECRET_PASSWORD || 'default_password';
    return password === secret;
});

ipcMain.on('request-initial-config', (event) => {
    event.reply('load-config', {
        printerIp: store.get('printerIp', process.env.PRINTER_IP), 
        ngrokToken: store.get('ngrokToken', process.env.NGROK_TOKEN)
    });
});

ipcMain.on('save-config', (event, config) => {
    store.set('printerIp', config.printerIp);
    store.set('ngrokToken', config.ngrokToken);
    app.relaunch(); // Reinicia la aplicación para aplicar cambios
    app.exit();
});

ipcMain.on('test-print', async () => {
    try {
        const printerIp = store.get('printerIp');
        if (!printerIp) {
            throw new Error("La IP de la impresora no está configurada.");
        }
        sendToWindow('update-status', { printer: 'printing' });

        const printer = new ThermalPrinter({
            type: PrinterTypes.EPSON,
            interface: `tcp://${printerIp}`,
            timeout: 3000
        });
        printer.alignCenter();
        printer.println("Página de Prueba");
        printer.println("Conexión Exitosa ✅");
        printer.println(`Fecha: ${new Date().toLocaleString()}`);
        printer.cut();
        await printer.execute();
        
        sendToWindow('update-status', { printer: 'success' });
    } catch (error) {
        console.error("Error en impresión de prueba:", error.message);
        sendToWindow('update-status', { printer: 'error' });
    }
});

// --- LÓGICA DE SERVIDORES ---

function startPrintServer() {
    const localApp = express();
    localApp.use(cors());
    localApp.use(express.json());

    localApp.post('/print', async (req, res) => {
        let printer;
        try {
            const { orderDetails } = req.body; // Suponiendo que usas esto
            const printerIp = store.get('printerIp');
            
            if (!printerIp) {
                throw new Error("La IP de la impresora no está configurada en la aplicación.");
            }
            sendToWindow('update-status', { printer: 'printing' });

            printer = new ThermalPrinter({
                type: PrinterTypes.EPSON,
                interface: `tcp://${printerIp}`,
                timeout: 3000
            });
            
            // --- Aquí va tu lógica para formatear el ticket ---
            printer.alignCenter();
            printer.println("Nuevo Pedido:");
            printer.println(orderDetails || "Sin detalles."); // Ejemplo
            printer.cut();
            // ------------------------------------------------
            
            await printer.execute();
            sendToWindow('update-status', { printer: 'success' });
            res.status(200).json({ success: true, message: "Impreso correctamente." });
        } catch (error) {
            console.error("Error de impresión:", error.message);
            sendToWindow('update-status', { printer: 'error' });
            res.status(500).json({ success: false, error: `No se pudo conectar con la impresora. Detalle: ${error.message}` });
        }
    });

    const server = localApp.listen(4000, () => {
        console.log('Servidor de impresión local escuchando en el puerto 4000.');
        sendToWindow('update-status', { server: 'running' });
    });
    
    // EXCEPCIÓN: Maneja el error si el puerto ya está en uso
    server.on('error', (err) => {
        if (err.code === 'EADDRINUSE') {
            console.error('Error: El puerto 4000 ya está en uso.');
            sendToWindow('update-status', { server: 'error', message: 'Puerto 4000 en uso' });
            sendToWindow('set-ngrok-url', 'Error: Puerto 4000 ocupado.');
        } else {
            console.error('Error en el servidor local:', err.message);
        }
    });
}

async function startNgrokTunnel() {
    const token = store.get('ngrokToken', process.env.NGROK_TOKEN); 
    if (!token) {
        console.warn('El token de Ngrok no está configurado.');
        sendToWindow('set-ngrok-url', 'Error: Falta el token de Ngrok.');
        return;
    }

    try {
        await ngrok.authtoken(token);
        const url = await ngrok.connect({ proto: 'http', addr: 4000 });
        console.log(`Túnel de Ngrok establecido en: ${url}`);
        sendToWindow('set-ngrok-url', url);
    } catch (error) {
        console.error('Error al iniciar Ngrok:', error.message);
        // Envía un error más específico si es posible
        const errorMessage = error.body?.details?.err || 'Error de conexión. Revisa el token y tu red.';
        sendToWindow('set-ngrok-url', `Error en Ngrok: ${errorMessage}`);
    }
}