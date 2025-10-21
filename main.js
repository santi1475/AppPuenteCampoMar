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

// Control de duplicados - mantener track de comandas en proceso
let comandasEnProceso = new Set();

let envPath;
if (app.isPackaged) {
  envPath = path.join(process.resourcesPath, ".env");
} else {
  envPath = path.join(__dirname, ".env");
}

require("dotenv").config({ path: envPath });

const DEFAULT_PRINTER_IP = "192.168.100.63";
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;
const SECRET_PASSWORD = process.env.SECRET_PASSWORD;

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
      console.log("Cliente Supabase inicializado correctamente");
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

function orderPlatosWithCaldosFirst(detalles) {
  if (!detalles || !Array.isArray(detalles)) {
    return detalles;
  }

  const CATEGORIA_CALDO_ID = 4;

  const caldos = detalles.filter((detalle) => {
    return detalle.platos?.CategoriaID === CATEGORIA_CALDO_ID;
  });

  const otros = detalles.filter((detalle) => {
    return detalle.platos?.CategoriaID !== CATEGORIA_CALDO_ID;
  });

  console.log("🔄 Ordenamiento de platos:");
  console.log(`   Platos categoría 4 (primero): ${caldos.length}`);
  caldos.forEach((plato) => {
    console.log(
      `     - ${plato.Cantidad || 1}x ${plato.platos?.Descripcion} (Cat: ${
        plato.platos?.CategoriaID
      })`
    );
  });
  console.log(`   Otros platos: ${otros.length}`);
  otros.forEach((plato) => {
    console.log(
      `     - ${plato.Cantidad || 1}x ${plato.platos?.Descripcion} (Cat: ${
        plato.platos?.CategoriaID
      })`
    );
  });

  return [...caldos, ...otros];
}

async function obtenerCategoriasPlatos(descripcionesPlatos) {
  const supabaseClient = getSupabaseClient();
  if (
    !supabaseClient ||
    !descripcionesPlatos ||
    descripcionesPlatos.length === 0
  ) {
    return {};
  }

  try {
    const { data: platos, error } = await supabaseClient
      .from("platos")
      .select("Descripcion, CategoriaID")
      .in("Descripcion", descripcionesPlatos);

    if (error) {
      console.error("Error al consultar categorías de platos:", error);
      return {};
    }

    const categoriasMap = {};
    platos?.forEach((plato) => {
      categoriasMap[plato.Descripcion] = plato.CategoriaID;
    });

    console.log("📋 Categorías obtenidas de la base de datos:");
    Object.entries(categoriasMap).forEach(([descripcion, categoria]) => {
      console.log(`   ${descripcion} → Categoría ${categoria}`);
    });

    return categoriasMap;
  } catch (error) {
    console.error("Error en obtenerCategoriasPlatos:", error);
    return {};
  }
}

async function imprimirComandaNormal(printer, comanda, omitirCabecera = false) {
  const esParaLlevar =
    !comanda.pedido?.pedido_mesas || comanda.pedido.pedido_mesas.length === 0;

  if (!omitirCabecera) {
    if (esParaLlevar) {
      imprimirCabeceraComanda(printer, comanda, "COMANDA PARA LLEVAR");
    } else {
      imprimirCabeceraComanda(printer, comanda, "COMANDA DE COCINA");
    }
  }

  if (
    comanda.pedido &&
    comanda.pedido.detallepedidos &&
    Array.isArray(comanda.pedido.detallepedidos)
  ) {
    printer.setTextSize(1, 2);
    printer.bold(true);
    printer.alignCenter();
    printer.println("PRODUCTOS");
    printer.drawLine();
    printer.bold(false);

    console.log("📊 Verificando categorías en imprimirComandaNormal:");
    comanda.pedido.detallepedidos.forEach((detalle) => {
      console.log(
        `   ${detalle.Cantidad}x ${detalle.platos?.Descripcion} → Cat: ${detalle.platos?.CategoriaID}`
      );
    });

    const detallesOrdenados = orderPlatosWithCaldosFirst(
      comanda.pedido.detallepedidos
    );

    printer.setTextSize(1, 2);
    printer.alignLeft();
    printer.bold(true);

    detallesOrdenados.forEach((detalle) => {
      const descripcion =
        detalle.platos?.Descripcion || "Producto no encontrado";
      const cantidad = detalle.Cantidad || 0;

      const cantidadStr = `${cantidad}x`.padEnd(4);
      printer.println(`${cantidadStr}${descripcion}`);
    });

    printer.bold(false);
    printer.setTextNormal();
  }

  let comentarioAMostrar = comanda.Comentario || "";

  if (
    comanda.Comentario &&
    (comanda.Comentario.includes("REIMPRESIÓN - Solo:") ||
      comanda.Comentario.includes("NUEVOS PLATOS - Solo:"))
  ) {
    comentarioAMostrar = extraerComentarioUsuario(comanda.Comentario);
  }

  if (comentarioAMostrar && comentarioAMostrar.trim() !== "") {
    printer.drawLine();
    printer.setTextSize(1, 2);
    printer.alignCenter();
    printer.bold(true);
    printer.println("! INSTRUCCIONES !");
    printer.setTextSize(1, 2);
    printer.bold(false);
    printer.alignLeft();
    printer.println(comentarioAMostrar);
  }

  printer.drawLine();
  printer.alignCenter();
  printer.println(`Impreso: ${new Date().toLocaleTimeString()}`);
}

async function imprimirReimpresionEspecifica(
  printer,
  comanda,
  omitirCabecera = false
) {
  if (!omitirCabecera) {
    imprimirCabeceraComanda(printer, comanda, "COMANDA DE COCINA");
  }

  const regex = /REIMPRESIÓN - Solo: ([^|]+)/;
  const match = comanda.Comentario.match(regex);

  if (match && match[1]) {
    const platosEspecificos = match[1].trim();

    printer.setTextSize(1, 2);
    printer.bold(true);
    printer.alignCenter();
    printer.println("PRODUCTOS");
    printer.drawLine();
    printer.bold(false);

    printer.alignLeft();
    printer.bold(true);

    const platosArray = platosEspecificos
      .split(",")
      .map((plato) => plato.trim());
    const platosParseados = [];
    const descripcionesPlatos = [];

    platosArray.forEach((plato) => {
      const match = plato.match(/^(\d+)x\s*(.+)$/);
      if (match) {
        const cantidad = parseInt(match[1]);
        const descripcion = match[2].trim();

        descripcionesPlatos.push(descripcion);
        platosParseados.push({
          Cantidad: cantidad,
          platos: {
            Descripcion: descripcion,
            CategoriaID: 1,
          },
          textoOriginal: plato,
        });
      } else {
        platosParseados.push({
          Cantidad: 1,
          platos: {
            Descripcion: plato,
            CategoriaID: 1,
          },
          textoOriginal: plato,
        });
      }
    });

    const categoriasMap = await obtenerCategoriasPlatos(descripcionesPlatos);

    platosParseados.forEach((plato) => {
      const categoriaReal = categoriasMap[plato.platos.Descripcion];
      if (categoriaReal !== undefined) {
        plato.platos.CategoriaID = categoriaReal;
      }
    });

    const platosOrdenados = orderPlatosWithCaldosFirst(platosParseados);

    platosOrdenados.forEach((detalle) => {
      if (
        detalle.textoOriginal &&
        !detalle.textoOriginal.match(/^(\d+)x\s*(.+)$/)
      ) {
        printer.println(detalle.textoOriginal);
      } else {
        const cantidad = detalle.Cantidad;
        const descripcion = detalle.platos?.Descripcion || "";
        const cantidadStr = `${cantidad}x`.padEnd(4);
        printer.println(`${cantidadStr}${descripcion}`);
      }
    });

    printer.bold(false);
  }

  printer.setTextNormal();

  const comentarioUsuario = extraerComentarioUsuario(comanda.Comentario);
  let comentarioAMostrar = comentarioUsuario;
  if (
    !comentarioAMostrar &&
    comanda.Comentario &&
    comanda.Comentario.includes("|")
  ) {
    const partes = comanda.Comentario.split("|");
    if (partes.length > 1) {
      comentarioAMostrar = partes[1].trim();
    }
  }

  if (comentarioAMostrar && comentarioAMostrar.trim() !== "") {
    printer.drawLine();
    printer.setTextSize(1, 2);
    printer.alignCenter();
    printer.bold(true);
    printer.println("! INSTRUCCIONES !");
    printer.setTextSize(1, 2);
    printer.bold(false);
    printer.alignLeft();
    printer.println(comentarioAMostrar);
  }

  printer.drawLine();
  printer.alignCenter();
  printer.println(`Impreso: ${new Date().toLocaleTimeString()}`);
}

async function imprimirNuevosPlatos(printer, comanda, omitirCabecera = false) {
  const pedidoEsParaLlevar =
    !comanda.pedido?.pedido_mesas || comanda.pedido.pedido_mesas.length === 0;

  if (!omitirCabecera) {
    if (pedidoEsParaLlevar) {
      imprimirCabeceraComanda(printer, comanda, "COMANDA PARA LLEVAR");
    } else {
      imprimirCabeceraComanda(printer, comanda, "COMANDA DE COCINA");
    }
  }

  const regex = /NUEVOS PLATOS - Solo: ([^|]+)/;
  const match = comanda.Comentario.match(regex);

  if (match && match[1]) {
    const platosNuevos = match[1].trim();

    printer.setTextSize(1, 2);
    printer.bold(true);
    printer.alignCenter();
    printer.println("PRODUCTOS AGREGADOS");
    printer.drawLine();
    printer.bold(false);

    const platosPattern = /(\d+)x\s+([^,]+)/g;
    const platosParseados = [];
    const descripcionesPlatos = [];
    let match2;

    while ((match2 = platosPattern.exec(platosNuevos)) !== null) {
      const cantidad = parseInt(match2[1]);
      const descripcion = match2[2].trim();

      descripcionesPlatos.push(descripcion);
      platosParseados.push({
        Cantidad: cantidad,
        platos: {
          Descripcion: descripcion,
          CategoriaID: 1,
        },
      });
    }

    const categoriasMap = await obtenerCategoriasPlatos(descripcionesPlatos);

    platosParseados.forEach((plato) => {
      const categoriaReal = categoriasMap[plato.platos.Descripcion];
      if (categoriaReal !== undefined) {
        plato.platos.CategoriaID = categoriaReal;
      }
    });

    const platosOrdenados = orderPlatosWithCaldosFirst(platosParseados);

    printer.setTextSize(1, 2);
    printer.alignLeft();
    printer.bold(true);

    platosOrdenados.forEach((detalle) => {
      const descripcion =
        detalle.platos?.Descripcion || "Producto no encontrado";
      const cantidad = detalle.Cantidad || 0;

      const cantidadStr = `${cantidad}x`.padEnd(4);
      printer.println(`${cantidadStr}${descripcion}`);
    });

    printer.bold(false);
    printer.setTextNormal();
  }

  const comentarioUsuario = extraerComentarioUsuario(comanda.Comentario);

  if (comentarioUsuario && comentarioUsuario.trim() !== "") {
    printer.drawLine();
    printer.setTextSize(1, 2);
    printer.alignCenter();
    printer.bold(true);
    printer.println("! INSTRUCCIONES !");
    printer.setTextSize(1, 2);
    printer.bold(false);
    printer.alignLeft();
    printer.println(comentarioUsuario);
  }

  printer.drawLine();
  printer.alignCenter();
  printer.println(`Impreso: ${new Date().toLocaleTimeString()}`);
}

function extraerComentarioUsuario(comentarioCompleto) {
  if (!comentarioCompleto) return "";

  const match = comentarioCompleto.match(/\|\s*(.+)$/);
  let resultado = match ? match[1].trim() : "";

  return resultado;
}

function imprimirCabeceraComanda(printer, comanda, titulo) {
  printer.alignCenter();
  printer.bold(true);
  printer.println(titulo);
  printer.bold(false);
  printer.println(`Comanda #${comanda.ComandaID}`);
  printer.drawLine();

  if (comanda.pedido) {
    printer.alignLeft();

    const fechaPedido = new Date(comanda.pedido.Fecha);
    printer.println(
      `Fecha: ${fechaPedido.toLocaleDateString()} - Hora: ${fechaPedido.toLocaleTimeString()}`
    );
    const mozoNombre =
      comanda.pedido.empleados?.Nombre ||
      comanda.pedido.MozoNombre ||
      comanda.pedido.Mozo ||
      null;
    printer.newLine();

    let mesasTexto = "N/A";
    if (comanda.pedido.ParaLlevar === true) {
      mesasTexto = "PARA LLEVAR";
    } else if (
      !comanda.pedido.pedido_mesas ||
      comanda.pedido.pedido_mesas.length === 0
    ) {
      mesasTexto = "PARA LLEVAR";
    } else if (Array.isArray(comanda.pedido.pedido_mesas)) {
      const numerosMesa = comanda.pedido.pedido_mesas
        .map((pm) => pm.mesas?.NumeroMesa)
        .filter((num) => num !== null && num !== undefined);

      if (numerosMesa.length > 0) {
        if (numerosMesa.includes(0)) {
          mesasTexto = "PARA LLEVAR";
        } else {
          mesasTexto = numerosMesa.join(", ");
        }
      } else {
        mesasTexto = "PARA LLEVAR";
      }
    }

    printer.setTextSize(1, 1);
    printer.bold(true);
    if (mesasTexto === "PARA LLEVAR") {
      if (mozoNombre) {
        printer.println(`PARA LLEVAR | Mozo: ${mozoNombre}`);
      } else {
        printer.println("PARA LLEVAR");
      }
    } else {
      const linea = mozoNombre
        ? `MESA(S): ${mesasTexto} | Mozo: ${mozoNombre}`
        : `MESA(S): ${mesasTexto}`;
      printer.println(linea);
    }
    printer.setTextNormal();
    printer.bold(false);
    printer.drawLine();
  }
}

// --- NUEVA FUNCIÓN ---
async function imprimirReporteAuditoria(printer) {
  const supabaseClient = getSupabaseClient();
  if (!supabaseClient) return;

  const { start, end } = obtenerRangoDiaActual();

  const { data: auditoriaData, error: auditoriaError } = await supabaseClient
    .from("auditoria")
    .select(
      `
      *,
      empleado:empleados ( Nombre )
    `
    )
    .gte("fechaAccion", start.toISOString())
    .lte("fechaAccion", end.toISOString())
    .eq("accion", "CANCELACION_PEDIDO")
    .order("fechaAccion", { ascending: false });

  if (auditoriaError) {
    console.error(
      "Error al obtener registros de auditoría:",
      auditoriaError.message
    );
    return;
  }

  if (!auditoriaData || auditoriaData.length === 0) {
    printer.println("Sin cancelaciones registradas hoy.");
    return;
  }

  printer.newLine();
  printer.alignCenter();
  printer.bold(true);
  printer.println("!!! ATENCION: PEDIDOS CANCELADOS HOY !!!");
  printer.bold(false);
  printer.drawLine();

  for (const registro of auditoriaData) {
    printer.alignLeft();
    printer.bold(true);
    printer.println(
      `ALERTA: ${registro.nivelAlerta} | Pedido #${registro.pedidoId}`
    );
    printer.bold(false);

    const fechaCreacion = new Date(registro.fechaCreacion);
    const fechaAccion = new Date(registro.fechaAccion);

    printer.println(`  Creado : ${fechaCreacion.toLocaleTimeString()}`);
    printer.println(`  Cancel.: ${fechaAccion.toLocaleTimeString()}`);
    printer.println(`  Tiempo : ${registro.tiempoTranscurrido} min.`);
    printer.println(
      `  Total  : S/ ${Number(registro.detalles.total).toFixed(2)}`
    );
    printer.println(`  Mozo   : ${registro.detalles.mozoCreador || "N/A"}`);
    printer.println(
      `  Canceló: ${registro.empleado?.Nombre || "ID " + registro.usuarioId}`
    );
    printer.println("  Platos:");

    registro.detalles.detalles.forEach((d) => {
      printer.println(`    - ${d.cantidad}x ${d.plato}`);
    });

    printer.drawLine();
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
  console.log(
    "Iniciando sondeo de base de datos para trabajos de impresión..."
  );
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
    printer.println("Conexion Exitosa");
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
        message: "Conectada y en espera",
      });
    } else {
      throw new Error("La impresora no respondió a la conexión.");
    }
  } catch (error) {
    console.error("Error de conexión con la impresora:", error.message);
    sendToWindow("update-status", {
      printer: "error",
      message: "Error de conexión",
    });
  }
});

ipcMain.on("relaunch-app", () => {
  app.relaunch();
  app.exit();
});

function obtenerRangoDiaActual() {
  const now = new Date();
  const start = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
    0,
    0,
    0,
    0
  );
  const end = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
    23,
    59,
    59,
    999
  );
  return { start, end };
}

// Handler para imprimir el reporte diario
ipcMain.handle("print-daily-report", async () => {
  const supabaseClient = getSupabaseClient();
  if (!supabaseClient) {
    throw new Error("No se pudo inicializar Supabase");
  }

  const { start, end } = obtenerRangoDiaActual();
  const startISO = start.toISOString();
  const endISO = end.toISOString();

  try {
    sendToWindow("update-status", {
      printer: "printing",
      message: "Generando reporte diario...",
    }); // --- CORRECCIÓN DEL CÁLCULO TOTAL --- // 1. Obtener pedidos pagados del día con sus detalles

    const { data: pedidosData, error: pedidosError } = await supabaseClient
      .from("pedidos")
      .select(
        `
        PedidoID, 
        TipoPago, 
        detallepedidos ( Cantidad, PrecioUnitario )
        `
      )
      .gte("Fecha", startISO)
      .lte("Fecha", endISO)
      .eq("Estado", false);

    if (pedidosError) {
      throw new Error(`Error consultando pedidos: ${pedidosError.message}`);
    }

    let totalGeneral = 0;
    let efectivo = 0;
    let yape = 0;
    let pos = 0;
    const pedidoIds = []; // 2. Recalcular el total de cada pedido y agregarlo a los contadores

    (pedidosData || []).forEach((p) => {
      const verdaderoTotal = p.detallepedidos.reduce((acc, detalle) => {
        return acc + Number(detalle.PrecioUnitario) * detalle.Cantidad;
      }, 0);
      totalGeneral += verdaderoTotal;
      switch (p.TipoPago) {
        case 1:
          efectivo += verdaderoTotal;
          break;
        case 2:
          yape += verdaderoTotal;
          break;
        case 3:
          pos += verdaderoTotal;
          break;
      }
      pedidoIds.push(p.PedidoID);
    }); // --- FIN DE LA CORRECCIÓN --- // 3. Obtener detalle de TODOS los platos vendidos
    let platosVendidos = []; // <-- CAMBIO: Cambiado el nombre de la variable para mayor claridad
    if (pedidoIds.length > 0) {
      const { data: detallesData, error: detallesError } = await supabaseClient
        .from("detallepedidos")
        .select(
          `PedidoID, PlatoID, Cantidad, platos:platos!detallepedidos_PlatoID_fkey(Descripcion)`
        )
        .in("PedidoID", pedidoIds);

      if (detallesError) {
        throw new Error(
          `Error consultando detalle de pedidos: ${detallesError.message}`
        );
      }

      const acumulado = new Map();
      (detallesData || []).forEach((d) => {
        const key = d.PlatoID;
        const desc = d.platos?.Descripcion || "Desconocido";
        const cant = Number(d.Cantidad) || 0;
        if (!acumulado.has(key)) {
          acumulado.set(key, { descripcion: desc, cantidad: 0 });
        }
        acumulado.get(key).cantidad += cant;
      });

      // --- CAMBIO PRINCIPAL ---
      // Se elimina .slice(0, 3) para obtener todos los platos.
      // La lista seguirá ordenada de mayor a menor cantidad vendida.
      platosVendidos = Array.from(acumulado.values()).sort(
        (a, b) => b.cantidad - a.cantidad
      );
    } // 4. Preparar impresión (sin cambios en la estructura)

    const printerIp = store.get("printerIp", DEFAULT_PRINTER_IP);
    if (!printerIp) {
      throw new Error("IP de impresora no configurada");
    }

    const printer = new ThermalPrinter({
      type: PrinterTypes.EPSON,
      interface: `tcp://${printerIp}`,
      characterSet: CharacterSet.PC850_MULTILINGUAL,
      removeSpecialCharacters: false,
      lineCharacter: "-",
      timeout: 4000,
    });

    printer.alignCenter();
    printer.bold(true);
    printer.println("REPORTE DIARIO");
    printer.bold(false);
    printer.println(`${start.toLocaleDateString()}`);
    printer.drawLine();

    printer.alignLeft();
    printer.bold(true);
    printer.println("RESUMEN DE VENTAS");
    printer.bold(false);
    printer.println(`Total Recaudado: S/ ${totalGeneral.toFixed(2)}`);
    printer.newLine();
    printer.bold(true);
    printer.println("Por Método de Pago:");
    printer.bold(false);
    printer.println(`  Efectivo: S/ ${efectivo.toFixed(2)}`);
    printer.println(`  Yape    : S/ ${yape.toFixed(2)}`);
    printer.println(`  POS     : S/ ${pos.toFixed(2)}`);
    printer.newLine();

    // --- CAMBIO EN LA IMPRESIÓN ---
    printer.bold(true);
    printer.println("PLATOS VENDIDOS DEL DIA"); // <-- CAMBIO: Título actualizado
    printer.bold(false);
    if (platosVendidos.length === 0) {
      printer.println("  (Sin ventas registradas)");
    } else {
      platosVendidos.forEach((plato) => {
        // <-- CAMBIO: Se usa la nueva variable y se imprime cada elemento
        printer.println(`  - ${plato.cantidad}x ${plato.descripcion}`); // Formato un poco más limpio para una lista larga
      });
    } // --- INTEGRACIÓN DEL REPORTE DE AUDITORÍA ---
    await imprimirReporteAuditoria(printer); // --- FIN DE LA INTEGRACIÓN ---
    printer.drawLine();
    printer.alignCenter();
    printer.println(`Impreso: ${new Date().toLocaleString()}`);
    printer.cut();

    await printer.execute();

    sendToWindow("update-status", {
      printer: "success",
      message: "Reporte diario impreso",
    });
    return { success: true };
  } catch (error) {
    console.error("Error al generar/imprimir reporte diario:", error.message);
    sendToWindow("update-status", {
      printer: "error",
      message: `Error reporte: ${error.message}`,
    });
    throw error;
  }
});

ipcMain.handle("get-latest-orders", async () => {
  console.log("Buscando comandas recientes a petición del usuario...");
  const supabaseClient = getSupabaseClient();
  if (!supabaseClient) {
    console.error("No se pudo obtener el cliente Supabase");
    return [];
  }

  try {
    const { data, error } = await supabaseClient
      .from("comandas_cocina")
      .select(
        `
        ComandaID,
        FechaCreacion,
        Comentario,
        pedido:pedidos!comandas_cocina_PedidoID_fkey (
          PedidoID,
          Fecha,
          ParaLlevar,
          EmpleadoID,
          empleados:empleados ( Nombre ),
          pedido_mesas (
            mesas (
              NumeroMesa
            )
          ),
          detallepedidos (
            DetalleID,
            Cantidad,
            platos (
              Descripcion,
              CategoriaID,
              categorias (
                Descripcion
              )
            )
          )
        )
      `
      )
      .order("FechaCreacion", { ascending: false })
      .limit(3);

    if (error) {
      console.error("Error al obtener comandas recientes:", error.message);
      return [];
    }

    const result = (data || []).map((comanda) => {
      let mesa = "N/A";
      if (comanda.pedido?.ParaLlevar === true) {
        mesa = "PARA LLEVAR";
      } else if (
        comanda.pedido?.pedido_mesas &&
        Array.isArray(comanda.pedido.pedido_mesas)
      ) {
        const mesas = comanda.pedido.pedido_mesas
          .map((pm) => pm.mesas?.NumeroMesa)
          .filter((num) => num !== null && num !== undefined);
        if (mesas.length > 0) {
          if (mesas.includes(0)) {
            mesa = "PARA LLEVAR";
          } else {
            mesa = mesas.join(", ");
          }
        }
      }

      let items = [];
      if (
        comanda.pedido?.detallepedidos &&
        Array.isArray(comanda.pedido.detallepedidos)
      ) {
        items = comanda.pedido.detallepedidos.map((detalle) => ({
          cantidad: detalle.Cantidad || 0,
          descripcion: detalle.platos?.Descripcion || "Sin nombre",
        }));
      }

      return {
        id: comanda.ComandaID,
        mesa: mesa,
        timestamp: comanda.FechaCreacion,
        comentario: comanda.Comentario || "",
        fechaPedido: comanda.pedido?.Fecha || null,
        mozo: comanda.pedido?.empleados?.Nombre || null,
        items: items,
      };
    });

    return result;
  } catch (error) {
    console.error("Error en la consulta de comandas recientes:", error.message);
    return [];
  }
});

ipcMain.handle("reprint-command", async (event, commandId) => {
  console.log(`Reimprimiendo comanda #${commandId}...`);
  const supabaseClient = getSupabaseClient();
  if (!supabaseClient) {
    throw new Error("No se pudo obtener el cliente Supabase");
  }

  try {
    const { data: comanda, error } = await supabaseClient
      .from("comandas_cocina")
      .select(
        `
        ComandaID,
        Comentario,
        FechaCreacion,
        pedido:pedidos!comandas_cocina_PedidoID_fkey (
          PedidoID,
          Fecha,
          ParaLlevar,
            EmpleadoID,
            empleados:empleados ( Nombre ),
          detallepedidos!detallepedidos_PedidoID_fkey (
            Cantidad,
            platos!detallepedidos_PlatoID_fkey (
              Descripcion,
              CategoriaID,
              categorias!platos_CategoriaID_fkey (
                Descripcion
              )
            )
          ),
          pedido_mesas!pedido_mesas_PedidoID_fkey (
            mesas!pedido_mesas_MesaID_fkey (
              NumeroMesa
            )
          )
        )
      `
      )
      .eq("ComandaID", commandId)
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

    if (
      comanda.Comentario &&
      comanda.Comentario.includes("REIMPRESIÓN - Solo:")
    ) {
      console.log(
        `🖨️ Reimprimiendo comanda de REIMPRESIÓN ESPECÍFICA #${comanda.ComandaID}`
      );
      printer.alignCenter();
      printer.bold(true);
      printer.println("REIMPRESIÓN DE COMANDA");
      printer.bold(false);
      printer.println(`Comanda #${comanda.ComandaID}`);
      printer.drawLine();

      if (comanda.pedido) {
        printer.alignLeft();
        const fechaOriginal = new Date(comanda.pedido.Fecha);
        const fechaReimpresion = new Date();
        printer.println(
          `Fecha Original: ${fechaOriginal.toLocaleDateString()} ${fechaOriginal.toLocaleTimeString()}`
        );
        printer.println(
          `Reimpresión: ${fechaReimpresion.toLocaleDateString()} ${fechaReimpresion.toLocaleTimeString()}`
        );
        const mozoNombre = comanda.pedido.empleados?.Nombre || null;
        let mesasTexto = "N/A";
        if (comanda.pedido.ParaLlevar === true) {
          mesasTexto = "PARA LLEVAR";
        } else if (
          comanda.pedido.pedido_mesas &&
          Array.isArray(comanda.pedido.pedido_mesas)
        ) {
          const numerosMesa = comanda.pedido.pedido_mesas
            .map((pm) => pm.mesas?.NumeroMesa)
            .filter((num) => num !== null && num !== undefined);
          if (numerosMesa.length > 0) {
            if (numerosMesa.includes(0)) {
              mesasTexto = "PARA LLEVAR";
            } else {
              mesasTexto = numerosMesa.join(", ");
            }
          }
        }
        printer.newLine();
        printer.bold(true);
        if (mesasTexto === "PARA LLEVAR") {
          printer.println(
            mozoNombre ? `PARA LLEVAR | Mozo: ${mozoNombre}` : "PARA LLEVAR"
          );
        } else {
          printer.println(
            mozoNombre
              ? `MESA(S): ${mesasTexto} | Mozo: ${mozoNombre}`
              : `MESA(S): ${mesasTexto}`
          );
        }
        printer.bold(false);
        printer.drawLine();
      }

      await imprimirReimpresionEspecifica(printer, comanda, true);
    } else if (
      comanda.Comentario &&
      comanda.Comentario.includes("NUEVOS PLATOS - Solo:")
    ) {
      console.log(
        `🖨️ Reimprimiendo comanda de NUEVOS PLATOS #${comanda.ComandaID}`
      );
      printer.alignCenter();
      printer.bold(true);
      printer.println("REIMPRESIÓN DE COMANDA");
      printer.bold(false);
      printer.println(`Comanda #${comanda.ComandaID}`);
      printer.drawLine();

      if (comanda.pedido) {
        printer.alignLeft();
        const fechaOriginal = new Date(comanda.pedido.Fecha);
        const fechaReimpresion = new Date();
        printer.println(
          `Fecha Original: ${fechaOriginal.toLocaleDateString()} ${fechaOriginal.toLocaleTimeString()}`
        );
        printer.println(
          `Reimpresión: ${fechaReimpresion.toLocaleDateString()} ${fechaReimpresion.toLocaleTimeString()}`
        );
        const mozoNombre = comanda.pedido.empleados?.Nombre || null;
        let mesasTexto = "N/A";
        if (comanda.pedido.ParaLlevar === true) {
          mesasTexto = "PARA LLEVAR";
        } else if (
          comanda.pedido.pedido_mesas &&
          Array.isArray(comanda.pedido.pedido_mesas)
        ) {
          const numerosMesa = comanda.pedido.pedido_mesas
            .map((pm) => pm.mesas?.NumeroMesa)
            .filter((num) => num !== null && num !== undefined);
          if (numerosMesa.length > 0) {
            if (numerosMesa.includes(0)) {
              mesasTexto = "PARA LLEVAR";
            } else {
              mesasTexto = numerosMesa.join(", ");
            }
          }
        }
        printer.newLine();
        printer.bold(true);
        if (mesasTexto === "PARA LLEVAR") {
          printer.println(
            mozoNombre ? `PARA LLEVAR | Mozo: ${mozoNombre}` : "PARA LLEVAR"
          );
        } else {
          printer.println(
            mozoNombre
              ? `MESA(S): ${mesasTexto} | Mozo: ${mozoNombre}`
              : `MESA(S): ${mesasTexto}`
          );
        }
        printer.bold(false);
        printer.drawLine();
      }

      await imprimirNuevosPlatos(printer, comanda, true);
    } else {
      console.log(`🖨️ Reimprimiendo comanda NORMAL #${comanda.ComandaID}`);
      printer.alignCenter();
      printer.bold(true);
      printer.println("REIMPRESIÓN DE COMANDA");
      printer.bold(false);
      printer.println(`Comanda #${comanda.ComandaID}`);
      printer.drawLine();

      if (comanda.pedido) {
        printer.alignLeft();
        const fechaOriginal = new Date(comanda.pedido.Fecha);
        const fechaReimpresion = new Date();
        printer.println(
          `Fecha Original: ${fechaOriginal.toLocaleDateString()} ${fechaOriginal.toLocaleTimeString()}`
        );
        printer.println(
          `Reimpresión: ${fechaReimpresion.toLocaleDateString()} ${fechaReimpresion.toLocaleTimeString()}`
        );
        const mozoNombre = comanda.pedido.empleados?.Nombre || null;
        let mesasTexto = "N/A";
        if (comanda.pedido.ParaLlevar === true) {
          mesasTexto = "PARA LLEVAR";
        } else if (
          comanda.pedido.pedido_mesas &&
          Array.isArray(comanda.pedido.pedido_mesas)
        ) {
          const numerosMesa = comanda.pedido.pedido_mesas
            .map((pm) => pm.mesas?.NumeroMesa)
            .filter((num) => num !== null && num !== undefined);
          if (numerosMesa.length > 0) {
            if (numerosMesa.includes(0)) {
              mesasTexto = "PARA LLEVAR";
            } else {
              mesasTexto = numerosMesa.join(", ");
            }
          }
        }
        printer.newLine();
        printer.bold(true);
        if (mesasTexto === "PARA LLEVAR") {
          printer.println(
            mozoNombre ? `PARA LLEVAR | Mozo: ${mozoNombre}` : "PARA LLEVAR"
          );
        } else {
          printer.println(
            mozoNombre
              ? `MESA(S): ${mesasTexto} | Mozo: ${mozoNombre}`
              : `MESA(S): ${mesasTexto}`
          );
        }
        printer.bold(false);
        printer.drawLine();
      }

      await imprimirComandaNormal(printer, comanda, true);
    }

    printer.drawLine();
    printer.alignCenter();
    printer.println("REIMPRESIÓN");
    printer.cut();

    await printer.execute();

    sendToWindow("update-status", {
      printer: "success",
      message: `Comanda #${commandId} reimpresa `,
    });

    return { success: true };
  } catch (error) {
    console.error(`Error al reimprimir comanda #${commandId}:`, error.message);
    sendToWindow("update-status", {
      printer: "error",
      message: `Error al reimprimir: ${error.message}`,
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

  try {
    const { data: comandas, error: comandasError } = await supabaseClient
      .from("comandas_cocina")
      .select(
        `
        ComandaID,
        Comentario,
        FechaCreacion,
        pedido:pedidos!comandas_cocina_PedidoID_fkey (
          PedidoID,
          Fecha,
          EmpleadoID,
          empleados:empleados ( Nombre ),
          detallepedidos!detallepedidos_PedidoID_fkey (
            Cantidad,
            platos!detallepedidos_PlatoID_fkey (
              Descripcion,
              CategoriaID,
              categorias!platos_CategoriaID_fkey (
                Descripcion
              )
            )
          ),
          pedido_mesas!pedido_mesas_PedidoID_fkey (
            mesas!pedido_mesas_MesaID_fkey (
              NumeroMesa
            )
          )
        )
      `
      )
      .eq("EstadoImpresion", "pendiente");

    if (comandasError) {
      console.error(
        "Error al buscar comandas pendientes:",
        comandasError.message
      );
      sendToWindow("update-status", {
        printer: "error",
        message: "Error al consultar comandas",
      });
      return;
    }

    if (!comandas || comandas.length === 0) {
      return;
    }

    console.log(
      `🔍 Encontradas ${comandas.length} comanda(s) pendientes. Procesando...`
    );

    comandas.forEach((comanda) => {
      console.log(`📋 Comanda #${comanda.ComandaID}:`, {
        Comentario: comanda.Comentario,
        FechaCreacion: comanda.FechaCreacion,
        PedidoID: comanda.pedido?.PedidoID,
      });
    });
    sendToWindow("update-status", {
      printer: "printing",
      message: `Imprimiendo ${comandas.length} comanda(s)...`,
    });

    const printerIp = store.get("printerIp", DEFAULT_PRINTER_IP);
    if (!printerIp) {
      throw new Error("La IP de la impresora no está configurada");
    }

    for (const comanda of comandas) {
      if (comandasEnProceso.has(comanda.ComandaID)) {
        console.log(
          `⏭️ Saltando comanda #${comanda.ComandaID} - ya está en proceso`
        );
        continue;
      }

      comandasEnProceso.add(comanda.ComandaID);
      console.log(
        `🔄 Procesando comanda #${comanda.ComandaID} (en proceso: ${comandasEnProceso.size})`
      );

      try {
        const printer = new ThermalPrinter({
          type: PrinterTypes.EPSON,
          interface: `tcp://${printerIp}`,
          characterSet: CharacterSet.PC850_MULTILINGUAL,
          removeSpecialCharacters: false,
          lineCharacter: "-",
          timeout: 3000,
        });

        if (
          comanda.Comentario &&
          comanda.Comentario.includes("REIMPRESIÓN - Solo:")
        ) {
          console.log(
            `🖨️ Imprimiendo comanda de REIMPRESIÓN ESPECÍFICA #${comanda.ComandaID}`
          );
          await imprimirReimpresionEspecifica(printer, comanda);
        } else if (
          comanda.Comentario &&
          comanda.Comentario.includes("NUEVOS PLATOS - Solo:")
        ) {
          console.log(
            `🖨️ Imprimiendo comanda de NUEVOS PLATOS #${comanda.ComandaID}`
          );
          await imprimirNuevosPlatos(printer, comanda);
        } else {
          console.log(`🖨️ Imprimiendo comanda NORMAL #${comanda.ComandaID}`);
          await imprimirComandaNormal(printer, comanda);
        }

        printer.cut();

        await printer.execute();

        const { error: updateError } = await supabaseClient
          .from("comandas_cocina")
          .update({ EstadoImpresion: "impreso" })
          .eq("ComandaID", comanda.ComandaID);

        if (updateError) {
          console.error(
            `Error al actualizar estado de comanda #${comanda.ComandaID}:`,
            updateError.message
          );
        } else {
          console.log(
            `Comanda #${comanda.ComandaID} impresa y marcada como 'impreso'.`
          );
        }
      } catch (printError) {
        console.error(
          `Error al imprimir comanda #${comanda.ComandaID}:`,
          printError.message
        );
        sendToWindow("update-status", {
          printer: "error",
          message: `Error imprimiendo comanda #${comanda.ComandaID}: ${printError.message}`,
        });
      } finally {
        comandasEnProceso.delete(comanda.ComandaID);
        console.log(
          `🧹 Liberando comanda #${comanda.ComandaID} del control de duplicados (restantes: ${comandasEnProceso.size})`
        );
      }
    }

    sendToWindow("update-status", {
      printer: "success",
      message: "Comandas impresas. En espera... ",
    });
  } catch (error) {
    console.error("Error general en checkForPrintJobs:", error.message);
    sendToWindow("update-status", {
      printer: "error",
      message: `Error general: ${error.message}`,
    });
  }
}
