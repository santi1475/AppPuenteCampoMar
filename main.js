// main.js
const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const express = require('express');
const cors = require('cors');
const ngrok = require('ngrok');
const { ThermalPrinter, PrinterTypes, CharacterSet } = require('node-thermal-printer');
const Store = require('electron-store');
const { createClient } = require('@supabase/supabase-js');



const store = new Store();
let supabase;

function getSupabaseClient() {
    if (!supabase) {
        if (!SUPABASE_URL || !SUPABASE_KEY) {
            console.error('Error crítico: Las variables de Supabase no están definidas en el código.');
            return null;
        }
        supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
    }
    return supabase;
}

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
    mainWindow.maximize();

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

// --- MANEJADORES DE IPC  ---

ipcMain.handle('verify-password', (event, password) => {
    return password === SECRET_PASSWORD;
});

ipcMain.on('request-initial-config', (event) => {
    event.reply('load-config', {
        printerIp: store.get('printerIp', DEFAULT_PRINTER_IP),
        ngrokToken: store.get('ngrokToken', DEFAULT_NGROK_TOKEN)
    });
});

ipcMain.on('save-config', (event, config) => {
    store.set('printerIp', config.printerIp);
    store.set('ngrokToken', config.ngrokToken);
    app.relaunch();
    app.exit();
});

ipcMain.on('test-print', async () => {
    try {
        const printerIp = store.get('printerIp', DEFAULT_PRINTER_IP);
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
        const printerIp = store.get('printerIp', DEFAULT_PRINTER_IP);
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

ipcMain.on('relaunch-app', () => {
    app.relaunch();
    app.exit();
});

// --- LÓGICA DE SERVIDORES ---

function startPrintServer() {
    const localApp = express();
    localApp.use(cors());
    localApp.use(express.json());

    localApp.post('/print', async (req, res) => {
        const { pedidoID, comentario } = req.body;

        if (!pedidoID) {
            return res.status(400).json({ success: false, error: "Debe proporcionar un ID de pedido" });
        }

        try {
            const supabaseClient = getSupabaseClient();
            if (!supabaseClient) {
                throw new Error("Cliente de Supabase no inicializado.");
            }

            const { data: pedido, error: fetchError } = await supabaseClient
                .from('pedidos')
                .select(`
                    Fecha,
                    detallepedidos (
                        Cantidad,
                        platos ( Descripcion )
                    ),
                    pedido_mesas (
                        mesas ( NumeroMesa )
                    )
                `)
                .eq('PedidoID', pedidoID)
                .single();

            if (fetchError || !pedido) {
                throw new Error(fetchError?.message || "Pedido no encontrado en la base de datos.");
            }

            const printerIp = store.get('printerIp', DEFAULT_PRINTER_IP);
            if (!printerIp) {
                throw new Error("La IP de la impresora no está configurada en la aplicación.");
            }
            
            sendToWindow('update-status', { printer: 'printing' });

            const printer = new ThermalPrinter({
                type: PrinterTypes.EPSON,
                interface: `tcp://${printerIp}`,
                characterSet: CharacterSet.PC850_MULTILINGUAL,
                removeSpecialCharacters: false,
                lineCharacter: "-",
                timeout: 3000
            });

            printer.alignCenter();
            printer.bold(true);
            printer.println("PEDIDO DE COCINA");
            printer.bold(false);
            printer.drawLine();

            printer.alignLeft();
            printer.println(`Fecha: ${new Date(pedido.Fecha).toLocaleDateString()} - Hora: ${new Date(pedido.Fecha).toLocaleTimeString()}`);
            
            const mesasStr = pedido.pedido_mesas.map((pm) => pm.mesas?.NumeroMesa).join(", ");
            printer.setTextSize(1, 1);
            printer.bold(true);
            printer.println(`MESA(S): ${mesasStr}`);
            printer.setTextNormal();
            printer.bold(false);
            printer.drawLine();

            printer.setTextNormal();
            printer.tableCustom([
                { text: "CANT", align: "LEFT", width: 0.15, bold: true },
                { text: "PRODUCTO", align: "RIGHT", width: 0.80, bold: true },
            ]);

            printer.setTextSize(1, 1);
            pedido.detallepedidos.forEach((detalle) => {
                printer.tableCustom([
                    { text: `${detalle.Cantidad}x`, align: "LEFT", width: 0.15 },
                    { text: `${detalle.platos?.Descripcion}`, align: "LEFT", width: 0.85 },
                ]);
            });
            
            printer.setTextNormal();
            printer.drawLine();

            if (comentario && comentario.trim() !== "") {
                printer.alignCenter();
                printer.bold(true);
                printer.println("! INSTRUCCIONES !");
                printer.bold(false);
                printer.println(comentario);
                printer.drawLine();
            }
            
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
    const token = store.get('ngrokToken', DEFAULT_NGROK_TOKEN);
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

        // Usamos upsert para insertar si no existe, o actualizar si ya existe.
        const { error: upsertError } = await supabaseClient
            .from('configuracion')
            .upsert({ id: 1, nombre_setting: 'printer_url', valor: url });

        if (upsertError) {
            console.error('Error al actualizar la URL en Supabase:', upsertError.message);
        } else {
            console.log('URL actualizada en Supabase exitosamente.');
        }

    } catch (error) {
        console.error('Error al iniciar Ngrok:', error.message);
        const errorMessage = error.body?.details?.err || 'Error de conexión. Revisa el token y tu red.';
        sendToWindow('set-ngrok-url', `Error en Ngrok: ${errorMessage}`);
    }
}
