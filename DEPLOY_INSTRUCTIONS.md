# Deployando Nexus ERP

Tienes dos opciones principales para usar este programa en tu TPV Windows sin compilarlo manualmente allí.

## Opción 1: Construcción Automática (Recomendada)
He creado un flujo de trabajo de automatización (**GitHub Actions**). Si subes este código a GitHub, la plataforma construirá el `.exe` por ti automáticamente.

### Pasos:
1.  **Sube este código a GitHub**:
    *   Crea un repositorio en GitHub.com.
    *   Sube los archivos de tu carpeta `TPV`.
2.  **Espera a que termine**:
    *   Ve a la pestaña **"Actions"** en tu repositorio de GitHub.
    *   Verás un proceso llamado "Build Windows App" ejecutándose. Tarda unos 3 minutos.
3.  **Descarga**:
    *   Cuando termine (se ponga en verde), haz clic en él.
    *   Al final de la página, en la sección **"Artifacts"**, descargarás un archivo zip con tu **`NexusERP.exe`**.
4.  **Instala en el TPV**:
    *   Lleva ese archivo al TPV.
    *   Instala [Tesseract OCR](https://github.com/UB-Mannheim/tesseract/wiki) en el TPV (necesario solo si usas el lector de albaranes).
    *   ¡Ejecuta `NexusERP.exe` y listo!

---

## Opción 2: Despliegue Web (En la Nube)
Podemos subir la aplicación a un servidor web (como Render, Railway o PythonAnywhere).

*   **Ventaja**: No instalas nada en el TPV. Solo abres Chrome/Edge y entras a `tu-tienda.com`.
*   **Desventaja**: Necesitas internet siempre. Si se cae la red, no puedes cobrar.
*   **Cambio necesario**: Tendríamos que cambiar la base de datos de SQLite a PostgreSQL para que no se borren los datos al reiniciar el servidor.

**Mi recomendación:** Usa la **Opción 1**. Mantienes la velocidad local, no dependes de internet, y ya tienes el archivo `.exe` generado sin esfuerzo.
