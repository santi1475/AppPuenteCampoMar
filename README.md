<p align="center">
  <img src="print.ico" alt="campomar-print-bridge logo" width="100" style="border-radius: 12px;">
</p>

<h1 align="center">campomar-print-bridge</h1>

<p align="center">
  <img src="https://img.shields.io/badge/Electron-37-4784F4?logo=electron" alt="Electron 37">
  &nbsp;
  <img src="https://img.shields.io/badge/Supabase-v2-3ECF8E?logo=supabase" alt="Supabase v2">
  &nbsp;
  <img src="https://img.shields.io/badge/Node.js-18%2B-339933?logo=node.js" alt="Node.js 18+">
  &nbsp;
  <img src="https://img.shields.io/badge/JavaScript-ES6-F7DF1E?logo=javascript" alt="JavaScript ES6">
</p>

<p align="center">
  A robust local print bridge desktop application to connect remote database events to thermal printers in real-time.<br>
  Built with Electron and Supabase to power reliable kitchen and receipt ticketing for Campomar restaurant.
</p>

---

## ✨ Key Features

- 🔌 **Real-time Database Connection** — Actively listens to new command (comanda) events from Supabase to trigger local printing instantly.
- 🖨️ **Smart Print Logic** — Automatically differentiates normal orders, added dishes, and manual reprints, prioritizing dishes like broths/soups (Category ID 4) at the top of the kitchen ticket.
- 🔑 **Secure Config Portal** — A password-protected local administration panel to prevent unauthorized changes to printer configurations.
- 💾 **Persistent Configuration** — Printer IP and local settings are securely stored locally via `electron-store` for persistent boots.
- 📊 **Analytical Reporting** — Generates and prints comprehensive daily sales reports, waiter performance summaries, and cancellation audits directly from the UI.
- 🔄 **Ticket Reprint Queue** — Maintains a list of recent commands in the UI, enabling instant manual reprint of any ticket with a single click.

---

## 🚀 Quick Start

To set up the print bridge locally on your development system, follow these steps:

### Prerequisites

You need to have **Node.js** (version 18 or higher) and **npm** installed on your system.

### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/santi1475/apppuentecampomar.git
   ```

2. Navigate to the project directory:
   ```bash
   cd AppPuenteCampomar
   ```

3. Install the NPM dependencies:
   ```bash
   npm install
   ```

---

## ⚙️ Configuration

Before running the application, you need to configure the environment variables:

1. Create a `.env` file in the root of the project:
   ```bash
   # Windows PowerShell
   New-Item .env
   
   # Or Unix-like bash
   touch .env
   ```

2. Configure the following variables in your `.env` file:
   ```env
   # Your Supabase project connection URL
   SUPABASE_URL=your_supabase_url_here

   # Your Supabase public API key
   SUPABASE_KEY=your_supabase_key_here

   # Security password to unlock application settings in the UI
   SECRET_PASSWORD=your_secret_admin_password
   ```

> 💡 **Tip:** You can configure the thermal printer's local IP address directly inside the application's UI after unlocking the Settings section using the configured `SECRET_PASSWORD`.

---

## 📦 Usage

### Run in Development Mode
To start the Electron application for development:
```bash
npm start
```

This launches the desktop window showing the printer status, latest command list, and control options.

### Package & Build for Production
To package the app into a standalone Windows installer (`.exe`) with NSIS:
```bash
npm run dist
```
The compiled binaries will be generated inside the `dist/` directory.

---

## 🏗️ Architecture & Stack Details

- **Frontend & UI:** Pure HTML5, CSS3 with custom variables, and vanilla ES6 JavaScript (`renderer.js`).
- **Main Process:** Electron App lifecycle control, IPC handling, and direct communication with thermal printers (`main.js`).
- **Data Synchronization:** Real-time data-fetching client using `@supabase/supabase-js`.
- **Hardware Integration:** Raw network thermal printing utilizing `node-thermal-printer` over TCP/IP connection.
- **Local Storage:** Secure, persistent configuration files handled via `electron-store`.

---

## 🤝 Contributing

Contributions, bug reports, and pull requests are welcome! Feel free to open issues or submit PRs.

---

## 📄 License

Distributed under the **Apache 2.0** License. See [`LICENSE.md`](./LICENSE.md) for details.

---

## 📞 Contact

<div align="center">

<a href="https://www.linkedin.com/in/santiago-g-v/">
  <img src="https://img.shields.io/badge/LinkedIn-0A66C2?style=for-the-badge&logo=linkedin&logoColor=white" alt="LinkedIn"/>
</a>
<a href="mailto:santiguz1475@gmail.com">
  <img src="https://img.shields.io/badge/Gmail-D14836?style=for-the-badge&logo=gmail&logoColor=white" alt="Gmail"/>
</a>

</div>
