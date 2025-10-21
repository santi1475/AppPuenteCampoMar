# Puente de Impresión Campomar
### 📝 Descripción del Proyecto

Este proyecto fue desarrollado para solucionar la necesidad de imprimir comandas y recibos de venta desde un sistema centralizado directamente en la cocina o en el área de facturación de un restaurante. La aplicación proporciona una solución estable y confiable que se ejecuta de forma local en un ordenador con acceso a la impresora térmica, garantizando que no se pierdan pedidos y que el flujo de trabajo en la cocina sea eficiente.

### Tecnologías Utilizadas

* [Electron](https://www.electronjs.org/)
* [Supabase](https://supabase.com/)
* [Node.js](https://nodejs.org/)
* [CSS3](https://developer.mozilla.org/es/docs/Web/CSS)
* [HTML5](https://developer.mozilla.org/es/docs/Web/HTML)
* [JavaScript](https://developer.mozilla.org/es/docs/Web/JavaScript)

### ✨ Características Principales

* **Servidor de Impresión Local:** La aplicación monitorea constantemente la base de datos de Supabase en busca de nuevas comandas pendientes de impresión.
* **Interfaz de Usuario Sencilla:** Muestra el estado de la conexión con la impresora, las últimas comandas impresas y permite realizar acciones rápidas.
* **Configuración Segura:** La sección de configuración, donde se introduce la dirección IP de la impresora, está protegida por una contraseña para evitar cambios no autorizados.
* **Configuración Persistente:** Guarda la dirección IP de la impresora de forma local, por lo que no es necesario volver a configurarla cada vez que se inicia la aplicación.
* **Funcionalidades Adicionales:**
    * **Reimpresión de Comandas:** Permite reimprimir cualquiera de las últimas comandas con un solo clic.
    * **Reporte Diario:** Genera e imprime un reporte de ventas del día con un resumen de los métodos de pago y los platos más vendidos.
    * **Lógica de Impresión Inteligente:** La aplicación es capaz de diferenciar entre comandas normales, comandas con platos añadidos y reimpresiones específicas, adaptando el formato de impresión a cada caso.

## 🚀 Cómo Empezar

Para poner en marcha una copia local de la aplicación, sigue estos sencillos pasos.

### Prerrequisitos

Necesitarás tener Node.js y npm instalados en tu sistema.

* npm
    ```sh
    npm install npm@latest -g
    ```

### Instalación

1.  Clona el repositorio:
    ```sh
    git clone [https://github.com/santi1475/apppuentecampomar.git](https://github.com/santi1475/apppuentecampomar.git)
    ```
2.  Navega al directorio del proyecto:
    ```sh
    cd AppPuenteCampoMar
    ```
3.  Instala los paquetes de NPM:
    ```sh
    npm install
    ```

## ⚙️ Configuración

Antes de ejecutar la aplicación, es necesario configurar las variables de entorno.

1.  Crea un archivo `.env` en la raíz del proyecto.
    ```
    touch .env
    ```
2.  Añade las siguientes variables a tu archivo `.env`:
    ```env
    # URL de tu proyecto de Supabase
    SUPABASE_URL=tu_url_de_supabase_aqui

    # Clave de API (pública) de tu proyecto de Supabase
    SUPABASE_KEY=tu_api_key_de_supabase_aqui

    # Una contraseña secreta para desbloquear la configuración en la aplicación
    SECRET_PASSWORD=tu_contraseña_secreta
    ```
    **Nota:** También puedes configurar la dirección IP de la impresora directamente en la interfaz de la aplicación después de desbloquear la sección de configuración.

## 📦 Uso

Para ejecutar la aplicación en modo de desarrollo, utiliza el siguiente comando:

```sh
npm start
```
Esto lanzará la aplicación de **Electron**. La ventana principal te mostrará el estado de la impresora y las últimas comandas. Desde ahí podrás gestionar la configuración y las funciones de impresión.

Para construir la aplicación y generar un instalador para Windows, utiliza el siguiente comando:

```sh
npm run dist
```
---

## Contacto

<div align="center">

<a href="https://www.linkedin.com/in/santiago-g-v/">
  <img src="https://img.shields.io/badge/LinkedIn-0A66C2?style=for-the-badge&logo=linkedin&logoColor=white" alt="LinkedIn"/>
</a>
<a href="mailto:santiguz1475@gmail.com">
  <img src="https://img.shields.io/badge/Gmail-D14836?style=for-the-badge&logo=gmail&logoColor=white" alt="Gmail"/>
</a>

</div>
