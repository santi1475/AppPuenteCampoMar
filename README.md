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

<div style="display: flex; gap: 15px;">
  <a href="https://www.linkedin.com/in/santiago-g-v/">
    <svg width="48" height="48" viewBox="0 0 256 256" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect width="256" height="256" rx="60" fill="#0A66C2"/>
      <path d="M184.715 217.685H213.985C216.194 217.685 217.985 215.895 217.985 213.686L218 151.844C218 119.521 211.035 94.6755 173.262 94.6755C158.903 94.1423 145.362 101.544 138.055 113.904C137.997 114.002 137.893 114.062 137.779 114.062C137.603 114.062 137.46 113.919 137.46 113.743V101.66C137.46 99.4511 135.67 97.6602 133.46 97.6602H105.683C103.474 97.6602 101.683 99.4511 101.683 101.66V213.68C101.683 215.89 103.474 217.68 105.683 217.68H134.951C137.16 217.68 138.951 215.89 138.951 213.68V158.307C138.951 142.65 141.921 127.487 161.332 127.487C180.467 127.487 180.715 145.403 180.715 159.321V213.685C180.715 215.894 182.506 217.685 184.715 217.685Z" fill="white"/>
      <path d="M38 59.6275C38 71.4921 47.7675 81.2539 59.6321 81.2539C71.4944 81.2528 81.2551 71.4853 81.2551 59.623C81.2528 47.7607 71.491 38 59.6275 38C47.763 38 38 47.763 38 59.6275Z" fill="white"/>
      <path d="M44.9588 217.685H74.2659C76.4751 217.685 78.2659 215.894 78.2659 213.685V101.66C78.2659 99.4511 76.4751 97.6602 74.2659 97.6602H44.9588C42.7497 97.6602 40.9588 99.4511 40.9588 101.66V213.685C40.9588 215.894 42.7497 217.685 44.9588 217.685Z" fill="white"/>
    </svg>
  </a>

  <a href="mailto:santiguz1475@gmail.com">
    <svg width="48" height="48" viewBox="0 0 256 256" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect width="256" height="256" rx="60" fill="#242938"/>
      <path d="M41.6364 203.028H73.4545V125.755L28 91.6646V189.392C28 196.937 34.1136 203.028 41.6364 203.028Z" fill="#4285F4"/>
      <path d="M182.545 203.028H214.364C221.909 203.028 228 196.915 228 189.392V91.6646L182.545 125.755" fill="#34A853"/>
      <path d="M182.545 66.6643V125.755L228 91.6643V73.4825C228 56.6189 208.75 47.0052 195.273 57.1189" fill="#FBBC04"/>
      <path d="M73.4545 125.755V66.6646L128 107.574L182.545 66.6646V125.755L128 166.665" fill="#EA4335"/>
      <path d="M28 73.4825V91.6643L73.4545 125.755V66.6643L60.7273 57.1189C47.2273 47.0052 28 56.6189 28 73.4825Z" fill="#C5221F"/>
    </svg>
  </a>
</div>
