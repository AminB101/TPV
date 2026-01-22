from flask import Flask, render_template, request, jsonify
import os
from dotenv import load_dotenv

load_dotenv()

import database
import ocr_service
from werkzeug.utils import secure_filename

import sys

# Determinar si estamos ejecutando como un bundle de PyInstaller
if getattr(sys, 'frozen', False):
    template_folder = os.path.join(sys._MEIPASS, 'templates')
    static_folder = os.path.join(sys._MEIPASS, 'static')
    BASE_DIR = os.path.dirname(sys.executable)
    app = Flask(__name__, template_folder=template_folder, static_folder=static_folder)
else:
    BASE_DIR = os.path.dirname(os.path.abspath(__file__))
    app = Flask(__name__)

# Configuración
UPLOAD_FOLDER = os.path.join(BASE_DIR, 'uploads')
ALLOWED_EXTENSIONS = {'png', 'jpg', 'jpeg', 'webp', 'csv'}

app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER
app.config['MAX_CONTENT_LENGTH'] = 16 * 1024 * 1024  # 16MB max

# Asegurar que existe la BD
database.init_db()

def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

@app.route('/')
def index():
    return render_template('index.html')

# --- DASHBOARD & STATS ---

@app.route('/api/dashboard', methods=['GET'])
def get_dashboard():
    stats = database.get_dashboard_stats()
    return jsonify(stats)

@app.route('/api/ventas/historial', methods=['GET'])
def get_historial_ventas():
    ventas = database.get_recent_sales()
    return jsonify(ventas)

# --- GASTOS ---

@app.route('/api/gastos', methods=['GET'])
def get_gastos():
    gastos = database.get_expenses()
    return jsonify(gastos)

@app.route('/api/gastos', methods=['POST'])
def add_gasto():
    data = request.json
    concepto = data.get('concepto')
    monto = data.get('monto')
    categoria = data.get('categoria', 'General')
    
    if concepto and monto:
        database.add_expense(concepto, float(monto), categoria)
        return jsonify({'success': True})
    return jsonify({'error': 'Faltan datos'}), 400

@app.route('/api/gastos/<int:id>', methods=['DELETE'])
def delete_gasto(id):
    database.delete_expense(id)
    return jsonify({'success': True})


# --- PRODUCTOS (Existentes) ---

@app.route('/api/productos', methods=['GET'])
def get_productos():
    search = request.args.get('search')
    productos = database.get_all_products(search)
    return jsonify(productos)

@app.route('/api/productos', methods=['POST'])
def add_producto():
    data = request.json
    codigo = data.get('codigo')
    nombre = data.get('nombre')
    costo = data.get('costo')
    venta = data.get('venta')
    stock_add = data.get('stock', 0)
    
    if not all([codigo, nombre]):
        return jsonify({'error': 'Faltan datos'}), 400
        
    res = database.add_or_update_product(codigo, nombre, float(costo or 0), float(venta or 0), int(stock_add))
    
    if res['success']:
        return jsonify({'message': 'Ok', 'action': res['action']}), 201
    else:
        return jsonify({'error': res['error']}), 500

@app.route('/api/productos/<int:id>', methods=['DELETE'])
def delete_producto(id):
    database.delete_product(id)
    return jsonify({'message': 'Producto eliminado'})

@app.route('/api/producto/scan', methods=['GET'])
def scan_producto():
    code = request.args.get('code')
    prod = database.get_product_by_code(code)
    if prod: return jsonify(prod)
    return jsonify(None), 404

# --- VENTAS (Existente) ---
@app.route('/api/venta', methods=['POST'])
def crear_venta():
    data = request.json
    items = data.get('items', [])
    if not items: return jsonify({'error': 'Ticket vacío'}), 400
    resultado = database.procesar_venta(items)
    if resultado['success']: return jsonify(resultado)
    else: return jsonify({'error': resultado['error']}), 400

# --- IA / CONFIG ---

@app.route('/api/config/apikey', methods=['POST'])
def set_api_key():
    data = request.json
    key = data.get('key')
    if key:
        ocr_service.configure_api_key(key)
        return jsonify({'success': True})
    return jsonify({'error': 'No key provided'}), 400

@app.route('/api/upload', methods=['POST'])
def upload_file():
    if 'file' not in request.files:
        return jsonify({'error': 'No file part'}), 400
    file = request.files['file']
    if file.filename == '':
        return jsonify({'error': 'No selected file'}), 400
    if file and allowed_file(file.filename):
        filename = secure_filename(file.filename)
        filepath = os.path.join(app.config['UPLOAD_FOLDER'], filename)
        file.save(filepath)
        
        resultado = ocr_service.procesar_albaran(filepath)
        
        try: os.remove(filepath)
        except: pass
            
        return jsonify(resultado)
    
    return jsonify({'error': 'File type not allowed'}), 400

@app.route('/api/config/ip', methods=['GET'])
def get_local_ip():
    import socket
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
    except:
        ip = "127.0.0.1"
    return jsonify({'ip': ip})

if __name__ == '__main__':
    if not os.path.exists(UPLOAD_FOLDER):
        os.makedirs(UPLOAD_FOLDER)
    # Escuchar en todas las interfaces para permitir acceso desde el móvil
    app.run(host='0.0.0.0', debug=True, port=5000)
