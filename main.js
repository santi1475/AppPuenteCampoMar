// main.js
const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const express = require('express');
const cors = require('cors');
const ngrok = require('ngrok');
const { ThermalPrinter, PrinterTypes, CharacterSet } = require('node-thermal-printer');
const Store = require('electron-store');

const store = new Store();
let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 500,
    height: 550,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
    },
  });
  mainWindow.loadFile('index.html');
}

app.whenReady().then(() => {
  createWindow();
  startPrintServer();
  startNgrokTunnel();
  app.setLoginItemSettings({ openAtLogin: true, path: app.getPath('exe') });
});

ipcMain.on('request-initial-config', (event) => {
  event.reply('load-config', {
    printerIp: store.get('printerIp', '192.168.1.123'),
    ngrokToken: store.get('ngrokToken', '')
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
    const printerIp = store.get('printerIp');
    if (!printerIp) throw new Error("La IP de la impresora no está configurada.");
    mainWindow.webContents.send('update-status', { printer: 'printing' });

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
    mainWindow.webContents.send('update-status', { printer: 'success' });
  } catch (error) {
    console.error("Error en impresión de prueba:", error);
    mainWindow.webContents.send('update-status', { printer: 'error' });
  }
});

function startPrintServer() {
  const localApp = express();
  localApp.use(cors());
  localApp.use(express.json());

  localApp.post('/print', async (req, res) => {
    try {
      const { orderDetails } = req.body;
      const printerIp = store.get('printerIp');
      if (!printerIp) throw new Error("La IP de la impresora no está configurada.");
      mainWindow.webContents.send('update-status', { printer: 'printing' });
      const printer = new ThermalPrinter({ /* ...lógica de impresión de comanda... */ });
      // ...código para construir el ticket...
      await printer.execute();
      mainWindow.webContents.send('update-status', { printer: 'success' });
      res.status(200).json({ success: true, message: "Impreso correctamente." });
    } catch (error) {
      console.error("Error de impresión:", error.message);
      mainWindow.webContents.send('update-status', { printer: 'error' });
      res.status(500).json({ success: false, error: "No se pudo conectar con la impresora." });
    }
  });

  localApp.listen(4000, () => {
    mainWindow.webContents.send('update-status', { server: 'running' });
  });
}

async function startNgrokTunnel() {
  const token = store.get('ngrokToken');
  if (!token) {
    mainWindow.webContents.send('set-ngrok-url', 'Error: El token de Ngrok no está configurado.');
    return;
  }
  try {
    const url = await ngrok.connect({ proto: 'http', addr: 4000, authtoken: token });
    mainWindow.webContents.send('set-ngrok-url', url);
  } catch (error) {
    mainWindow.webContents.send('set-ngrok-url', 'Error. Revisa el token.');
  }
}