const { app, BrowserWindow, ipcMain, dialog } = require("electron");
const path = require("path");
const {
  ThermalPrinter,
  PrinterTypes,
  CharacterSet,
} = require("node-thermal-printer");
const Store = require("electron-store");
const { createClient } = require("@supabase/supabase-js");

const store = new Store();
let supabase;



function getSupabaseClient() {
  if (!supabase) {
    if (!SUPABASE_URL || !SUPABASE_KEY) {
      console.error(
        "Error crítico: Las variables de Supabase no están definidas en el código."
      );
      return null;
    }
    try {
      supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
      console.log("✅ Cliente Supabase inicializado correctamente");
    } catch (error) {
      console.error("Error al inicializar cliente Supabase:", error.message);
      return null;
    }
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
    icon: path.join(__dirname, "print.ico"),
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
    },
  });
  mainWindow.maximize();
  mainWindow.loadFile("index.html");

  mainWindow.on("close", (event) => {
    if (!forceQuit) {
      const now = new Date();
      const hour = now.getHours();

      if (hour >= 7 && hour < 12) {
        event.preventDefault();
        dialog.showMessageBox(mainWindow, {
          type: "warning",
          title: "Cierre Bloqueado",
          message:
            "La aplicación no se puede cerrar entre las 7 AM y las 12 PM.",
          buttons: ["Aceptar"],
        });
        return;
      }

      if (hour >= 12) {
        event.preventDefault();
        const choice = dialog.showMessageBoxSync(mainWindow, {
          type: "question",
          buttons: ["Sí", "No"],
          title: "Confirmar Cierre",
          message: "¿Estás seguro de que quieres cerrar la aplicación?",
        });
        if (choice === 0) {
          forceQuit = true;
          app.quit();
        }
      }
    }
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

app.on("before-quit", (event) => {
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
  console.log("Iniciando sondeo de base de datos para trabajos de impresión...");
  setInterval(checkForPrintJobs, 5000);
  app.setLoginItemSettings({ openAtLogin: true });
});


ipcMain.handle("verify-password", (event, password) => {
  return password === SECRET_PASSWORD;
});

ipcMain.on("request-initial-config", (event) => {
  event.reply("load-config", {
    printerIp: store.get("printerIp", DEFAULT_PRINTER_IP),
  });
});

ipcMain.on("save-config", (event, config) => {
  store.set("printerIp", config.printerIp);
  app.relaunch();
  app.exit();
});

ipcMain.on("test-print", async () => {
  try {
    const printerIp = store.get("printerIp", DEFAULT_PRINTER_IP);
    if (!printerIp) {
      throw new Error("La IP de la impresora no está configurada.");
    }
    sendToWindow("update-status", { printer: "printing" });

    const printer = new ThermalPrinter({
      type: PrinterTypes.EPSON,
      interface: `tcp://${printerIp}`,
      timeout: 3000,
    });
    printer.alignCenter();
    printer.println("Pagina de Prueba");
    printer.println("Conexion Exitosa ✅");
    printer.println(`Fecha: ${new Date().toLocaleString()}`);
    printer.cut();
    await printer.execute();

    sendToWindow("update-status", { printer: "success" });
  } catch (error) {
    console.error("Error en impresión de prueba:", error.message);
    sendToWindow("update-status", { printer: "error" });
  }
});

ipcMain.on("check-printer-status", async () => {
  try {
    const printerIp = store.get("printerIp", DEFAULT_PRINTER_IP);
    if (!printerIp) {
      sendToWindow("update-status", {
        printer: "pending",
        message: "Esperando configuración de IP...",
      });
      return;
    }
    const printer = new ThermalPrinter({
      type: PrinterTypes.EPSON,
      interface: `tcp://${printerIp}`,
      timeout: 2500,
    });
    const isConnected = await printer.isPrinterConnected();
    if (isConnected) {
      sendToWindow("update-status", {
        printer: "success",
        message: "Conectada y en espera ✅",
      });
    } else {
      throw new Error("La impresora no respondió a la conexión.");
    }
  } catch (error) {
    console.error("Error de conexión con la impresora:", error.message);
    sendToWindow("update-status", {
      printer: "error",
      message: "Error de conexión ❌",
    });
  }
});

ipcMain.on("relaunch-app", () => {
  app.relaunch();
  app.exit();
});

ipcMain.handle("get-latest-orders", async () => {
  console.log("🔍 Buscando comandas recientes...");
  const supabaseClient = getSupabaseClient();
  if (!supabaseClient) {
    console.error("❌ No se pudo obtener el cliente Supabase");
    return [];
  }

  try {
    const { data, error } = await supabaseClient
      .from('comandas_cocina')
      .select(`
        ComandaID,
        FechaCreacion,
        pedido:pedidos (
          PedidoID,
          pedido_mesas (
            mesas (
              NumeroMesa
            )
          ),
          detallepedidos (
            DetalleID,
            Cantidad,
            platos (
              Descripcion
            )
          )
        )
      `)
      .order('FechaCreacion', { ascending: false })
      .limit(3);

    if (error) {
      console.error('❌ Error al obtener comandas recientes:', error.message);
      return [];
    }
    
    const result = (data || []).map(comanda => {
      let mesa = 'N/A';
      if (comanda.pedido && comanda.pedido.pedido_mesas && comanda.pedido.pedido_mesas.length > 0) {
        mesa = comanda.pedido.pedido_mesas.map(pm => pm.mesas?.NumeroMesa).filter(Boolean).join(', ');
      }
      
      let items = [];
      if (comanda.pedido && comanda.pedido.detallepedidos) {
        items = comanda.pedido.detallepedidos.map(det => ({
          cantidad: det.Cantidad,
          descripcion: det.platos?.Descripcion || 'Sin nombre'
        }));
      }

      return {
        id: comanda.ComandaID,
        mesa,
        timestamp: comanda.FechaCreacion,
        items
      };
    });
    
    return result;

  } catch (error) {
    console.error('Error en la consulta de comandas recientes:', error.message);
    return [];
  }
});

ipcMain.handle("reprint-command", async (event, commandId) => {
  console.log(`🔄 Reimprimiendo comanda #${commandId}...`);
  const supabaseClient = getSupabaseClient();
  if (!supabaseClient) {
    throw new Error("No se pudo obtener el cliente Supabase");
  }

  try {
    const { data: comanda, error } = await supabaseClient
      .from('comandas_cocina')
      .select(`
        ComandaID,
        Comentario,
        pedido:pedidos!comandas_cocina_PedidoID_fkey (
          PedidoID,
          Fecha,
          detallepedidos!detallepedidos_PedidoID_fkey (
            DetalleID,
            Cantidad,
            platos!detallepedidos_PlatoID_fkey (
              Descripcion
            )
          ),
          pedido_mesas!pedido_mesas_PedidoID_fkey (
            mesas!pedido_mesas_MesaID_fkey (
              NumeroMesa
            )
          )
        )
      `)
      .eq('ComandaID', commandId)
      .single();

    if (error) {
      throw new Error(`Error al obtener la comanda: ${error.message}`);
    }

    if (!comanda) {
      throw new Error("Comanda no encontrada");
    }

    const printerIp = store.get("printerIp", DEFAULT_PRINTER_IP);
    const printer = new ThermalPrinter({
      type: PrinterTypes.EPSON,
      interface: `tcp://${printerIp}`,
      characterSet: CharacterSet.PC850_MULTILINGUAL,
      removeSpecialCharacters: false,
      lineCharacter: "-",
      timeout: 3000,
    });

    printer.alignCenter();
    printer.bold(true);
    printer.println("REIMPRESIÓN DE COMANDA");
    printer.bold(false);
    printer.drawLine();

    if (comanda.pedido) {
      printer.alignLeft();
      printer.println(
        `Fecha Original: ${new Date(comanda.pedido.Fecha).toLocaleDateString()} ${new Date(
          comanda.pedido.Fecha
        ).toLocaleTimeString()}`
      );
      printer.println(`Fecha Reimpresión: ${new Date().toLocaleString()}`);

      const mesasStr = comanda.pedido.pedido_mesas
        ?.map((pm) => pm.mesas?.NumeroMesa)
        .join(", ");
      printer.setTextSize(1, 1);
      printer.bold(true);
      printer.println(`MESA(S): ${mesasStr}`);
      printer.setTextNormal();
      printer.bold(false);
      printer.drawLine();

      printer.tableCustom([
        { text: "CANT", align: "LEFT", width: 0.15, bold: true },
        { text: "PRODUCTO", align: "RIGHT", width: 0.8, bold: true },
      ]);

      printer.setTextSize(1, 1);
      comanda.pedido.detallepedidos?.forEach((detalle) => {
        printer.tableCustom([
          { text: `${detalle.Cantidad}x`, align: "LEFT", width: 0.15 },
          {
            text: `${detalle.platos?.Descripcion}`,
            align: "LEFT",
            width: 0.85,
          },
        ]);
      });
    }

    printer.setTextNormal();
    printer.drawLine();
    
    if (comanda.Comentario && comanda.Comentario.trim() !== "") {
      printer.alignCenter();
      printer.bold(true);
      printer.println("! INSTRUCCIONES !");
      printer.bold(false);
      printer.println(comanda.Comentario);
      printer.drawLine();
    }

    printer.cut();
    await printer.execute();

    sendToWindow("update-status", {
      printer: "success",
      message: `Comanda #${commandId} reimpresa ✅`
    });

    return { success: true };
  } catch (error) {
    console.error(`Error al reimprimir comanda #${commandId}:`, error.message);
    sendToWindow("update-status", {
      printer: "error",
      message: `Error al reimprimir comanda #${commandId}`
    });
    throw error;
  }
});

async function checkForPrintJobs() {
  const supabaseClient = getSupabaseClient();
  if (!supabaseClient) {
    console.error("Supabase no está listo, saltando la verificación.");
    return;
  }

  console.log("🔍 Buscando comandas pendientes...");
  const { data: comandas, error: comandasError } = await supabaseClient
    .from('comandas_cocina')
    .select(`
      ComandaID,
      PedidoID,
      Comentario,
      EstadoImpresion,
      pedido:pedidos!comandas_cocina_PedidoID_fkey (
        PedidoID,
        Fecha,
        Total,
        detallepedidos!detallepedidos_PedidoID_fkey (
          DetalleID,
          Cantidad,
          platos!detallepedidos_PlatoID_fkey (
            PlatoID,
            Descripcion,
            Precio
          )
        ),
        pedido_mesas!pedido_mesas_PedidoID_fkey (
          PedidoMesaID,
          mesas!pedido_mesas_MesaID_fkey (
            MesaID,
            NumeroMesa
          )
        )
      )
    `)
    .eq('EstadoImpresion', 'pendiente');


  if (comandasError) {
    console.error("Error al buscar comandas pendientes:", comandasError.message);
    console.error("Detalles del error:", comandasError);
    sendToWindow("update-status", { printer: "error", message: "Error al consultar comandas" });
    return;
  }

  console.log(`✅ Se encontraron ${comandas?.length || 0} comandas pendientes`);
  if (comandas?.length > 0) {
    console.log('Primera comanda encontrada:', JSON.stringify(comandas[0], null, 2));
  }

  if (comandas && comandas.length > 0) {
    console.log(`✅ ${comandas.length} comanda(s) encontrada(s) para imprimir.`);
    sendToWindow("update-status", {
      printer: "printing",
      message: `Imprimiendo ${comandas.length} comanda(s)...`
    });

    for (const comanda of comandas) {
      try {
        const printerIp = store.get("printerIp", DEFAULT_PRINTER_IP);
        const printer = new ThermalPrinter({
          type: PrinterTypes.EPSON,
          interface: `tcp://${printerIp}`,
          characterSet: CharacterSet.PC850_MULTILINGUAL,
          removeSpecialCharacters: false,
          lineCharacter: "-",
          timeout: 3000,
        });

        printer.alignCenter();
        printer.bold(true);
        printer.println("COMANDA DE COCINA");
        printer.bold(false);
        printer.drawLine();

        if (comanda.pedido) {
          printer.alignLeft();
          printer.println(
            `Fecha: ${new Date(comanda.pedido.Fecha).toLocaleDateString()} - Hora: ${new Date(
              comanda.pedido.Fecha
            ).toLocaleTimeString()}`
          );

          const mesasStr = comanda.pedido.pedido_mesas
            ?.map((pm) => pm.mesas?.NumeroMesa)
            .join(", ");
          printer.setTextSize(1, 1);
          printer.bold(true);
          printer.println(`MESA(S): ${mesasStr}`);
          printer.setTextNormal();
          printer.bold(false);
          printer.drawLine();

          printer.tableCustom([
            { text: "CANT", align: "LEFT", width: 0.15, bold: true },
            { text: "PRODUCTO", align: "RIGHT", width: 0.8, bold: true },
          ]);

          printer.setTextSize(1, 1);
          comanda.pedido.detallepedidos?.forEach((detalle) => {
            printer.tableCustom([
              { text: `${detalle.Cantidad}x`, align: "LEFT", width: 0.15 },
              {
                text: `${detalle.platos?.Descripcion}`,
                align: "LEFT",
                width: 0.85,
              },
            ]);
          });
        }

        printer.setTextNormal();
        printer.drawLine();
        
        if (comanda.Comentario && comanda.Comentario.trim() !== "") {
          printer.alignCenter();
          printer.bold(true);
          printer.println("! INSTRUCCIONES !");
          printer.bold(false);
          printer.println(comanda.Comentario);
          printer.drawLine();
        }

        printer.cut();

        await printer.execute();
        console.log(`Comanda #${comanda.ComandaID} impresa.`);

        const { error: updateError } = await supabaseClient
          .from("comandas_cocina")
          .update({ EstadoImpresion: 'impreso' })
          .eq("ComandaID", comanda.ComandaID);

        if (updateError) {
          console.error(
            `Error al actualizar el estado de la comanda #${comanda.ComandaID}:`,
            updateError.message
          );
        } else {
          console.log(`Comanda #${comanda.ComandaID} marcada como impresa.`);
        }
      } catch (printError) {
        console.error(
          `Error al imprimir la comanda #${comanda.ComandaID}:`,
          printError.message
        );
        sendToWindow("update-status", {
          printer: "error",
          message: `Error imprimiendo comanda #${comanda.ComandaID}`,
        });
      }
    }

    sendToWindow("update-status", {
      printer: "success",
      message: "Comandas impresas. En espera... ✅",
    });
  }
}