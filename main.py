import os
import threading
import webview
from app import app

def start_flask():
    # Desactivar reloader para que no interfiera con hilos
    app.run(port=5000, debug=False, use_reloader=False)

if __name__ == '__main__':
    # Asegurar que el directorio de subidas existe
    if not os.path.exists('uploads'):
        os.makedirs('uploads')

    # Iniciar Flask en un hilo separado
    t = threading.Thread(target=start_flask)
    t.daemon = True
    t.start()

    # Crear la ventana nativa
    webview.create_window(
        'Nexus ERP - Punto de Venta', 
        'http://127.0.0.1:5000',
        width=1200,
        height=800,
        min_size=(1000, 700),
        confirm_close=True
    )
    
    webview.start()
