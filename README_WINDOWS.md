# Instrucciones para generar el instalador de Windows

Para convertir este proyecto en un archivo `.exe` ejecutable para Windows, sigue estos pasos desde una computadora con Windows:

## 1. Requisitos previos
Asegúrate de tener instalado:
* **Python 3.9+**
* **Tesseract OCR** (si usas la función de escaneo de albaranes por IA): 
  - Descarga desde: [github.com/UB-Mannheim/tesseract/wiki](https://github.com/UB-Mannheim/tesseract/wiki)
  - Añade la ruta a las variables de entorno de Windows (PATH).

## 2. Preparar el entorno
Abre una terminal (CMD o PowerShell) en la carpeta del proyecto y ejecuta:

```bash
# Crear entorno virtual (opcional pero recomendado)
python -m venv venv
venv\Scripts\activate

# Instalar dependencias
pip install -r requirements.txt
```

## 3. Crear el Ejecutable (.exe)
Usaremos `PyInstaller` para empaquetar todo. Ejecuta el siguiente comando:

```bash
pyinstaller --noconfirm --onefile --windowed --add-data "templates;templates" --add-data "static;static" --icon "static/icon.png" --name "NexusERP" main.py
```

### Explicación del comando:
* `--onefile`: Crea un único archivo .exe.
* `--windowed`: No abre la consola (ventana negra) al iniciar.
* `--add-data`: Incluye las carpetas de plantillas y estilos.
* `--name`: Nombre del programa.
* `main.py`: El punto de entrada del programa.

## 4. Resultado
Una vez termine el proceso, encontrarás el archivo `NexusERP.exe` dentro de la carpeta **`dist/`**. 

---

## 5. Configuración del Scanner y la Impresora
* **Scanner Honeywell**: El programa ya está configurado para escuchar al scanner automáticamente. Asegúrate de que el scanner esté en modo "Keyboard Wedge" (es el modo por defecto).
* **Impresora**: Al finalizar una venta, se abrirá automáticamente el diálogo de impresión. El ticket está diseñado para un ancho estándar de 80mm o 58mm.
