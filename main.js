const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const express = require('express');
const cors = require('cors');
const ngrok = require('ngrok');
const { ThermalPrinter, PrinterTypes } = require('node-thermal-printer');
const Store = require('electron-store');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

let supabase;

function getSupabaseClient() {
    if (!supabase) {
        const supabaseUrl = process.env.SUPABASE_URL;
        const supabaseKey = process.env.SUPABASE_ANON_KEY;

        if (!supabaseUrl || !supabaseKey) {
            console.error('Error crítico: Las variables de entorno SUPABASE_URL y SUPABASE_ANON_KEY no están definidas en el archivo .env.');
            return null;
        }
        supabase = createClient(supabaseUrl, supabaseKey);
    }
    return supabase;
}

const store = new Store();
let mainWindow;
let forceQuit = false; 

function sendToWindow(channel, ...args) {
    if (mainWindow) {
        mainWindow.webContents.send(channel, ...args);
    }
}

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 500,
        height: 650,
        icon: path.join(__dirname, 'print.ico'),
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
        },
    });
    mainWindow.loadFile('index.html');
    mainWindow.on('close', (event) => {
        if (!forceQuit) {
            const now = new Date();
            const hour = now.getHours();

            if (hour >= 7 && hour < 12) {
                event.preventDefault();
                dialog.showMessageBox(mainWindow, {
                    type: 'warning',
                    title: 'Cierre Bloqueado',
                    message: 'La aplicación no se puede cerrar entre las 7 AM y las 12 PM.',
                    buttons: ['Aceptar']
                });
                return;
            }

            if (hour >= 12) {
                event.preventDefault();
                const choice = dialog.showMessageBoxSync(mainWindow, {
                    type: 'question',
                    buttons: ['Sí', 'No'],
                    title: 'Confirmar Cierre',
                    message: '¿Estás seguro de que quieres cerrar la aplicación?'
                });
                if (choice === 0) {
                    forceQuit = true;
                    app.quit();
                }
            }
        }
    });

    mainWindow.on('closed', () => {
        mainWindow = null;
    });
}

app.on('before-quit', (event) => {
    if (!forceQuit) {
        const now = new Date();
        const hour = now.getHours();

        if (hour >= 7 && hour < 12) {
            event.preventDefault();
            return;
        }

        if (hour >= 12) {
            event.preventDefault();
        }
    }
});


app.whenReady().then(() => {
    createWindow();
    startPrintServer();
    startNgrokTunnel();
    app.setLoginItemSettings({ openAtLogin: true });
});

// --- MANEJADORES DE IPC ---

ipcMain.handle('verify-password', (event, password) => {
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
    forceQuit = true; 
    app.relaunch();
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
        printer.println("Pagina de Prueba");
        printer.println("Conexion Exitosa ✅");
        printer.println(`Fecha: ${new Date().toLocaleString()}`);
        printer.cut();
        await printer.execute();
        
        sendToWindow('update-status', { printer: 'success' });
    } catch (error) {
        console.error("Error en impresión de prueba:", error.message);
        sendToWindow('update-status', { printer: 'error' });
    }
});

ipcMain.on('check-printer-status', async () => {
    try {
        const printerIp = store.get('printerIp');
        if (!printerIp) {
            sendToWindow('update-status', { printer: 'pending', message: 'Esperando configuración de IP...' });
            return;
        }
        const printer = new ThermalPrinter({
            type: PrinterTypes.EPSON,
            interface: `tcp://${printerIp}`,
            timeout: 2500
        });

        const isConnected = await printer.isPrinterConnected();

        if (isConnected) {
            sendToWindow('update-status', { printer: 'success', message: 'Conectada y en espera ✅' });
        } else {
            throw new Error("La impresora no respondió a la conexión.");
        }
    } catch (error) {
        console.error("Error de conexión con la impresora:", error.message);
        sendToWindow('update-status', { printer: 'error', message: 'Error de conexión ❌' });
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
            const { orderDetails } = req.body;
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
            printer.alignCenter();
            printer.println("Nuevo Pedido:");
            printer.println(orderDetails || "Sin detalles.");
            printer.cut();
            
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

        const supabaseClient = getSupabaseClient();
        if (!supabaseClient) return;

        // 1. Actualizar URL en Supabase
        const { error: updateError } = await supabaseClient
            .from('configuracion')
            .update({ valor: url })
            .eq('nombre_setting', 'printer_url');

        if (updateError) {
            console.error('Error al actualizar la URL en Supabase:', updateError.message);
        } else {
            console.log('URL actualizada en Supabase exitosamente.');
        }
        
        // 2. Verificar el valor recién escrito
        console.log('--- Verificando valor en Supabase ---');
        const { data: configData, error: fetchError } = await supabaseClient
            .from('configuracion')
            .select('valor')
            .eq('nombre_setting', 'printer_url')
            .single();

        if (fetchError) {
            console.error('Error al leer la URL desde Supabase:', fetchError.message);
        } else if (configData) {
            console.log(`✅ Valor recuperado de Supabase: ${configData.valor}`);
        } else {
            console.log('No se encontró el valor en Supabase.');
        }

    } catch (error) {
        console.error('Error al iniciar Ngrok:', error.message);
        const errorMessage = error.body?.details?.err || 'Error de conexión. Revisa el token y tu red.';
        sendToWindow('set-ngrok-url', `Error en Ngrok: ${errorMessage}`);
    }
}