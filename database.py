import sqlite3
import os
import datetime
import json

DB_NAME = 'tpv.db'

def get_db_connection():
    conn = sqlite3.connect(DB_NAME)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    conn = get_db_connection()
    try:
        # Tabla Productos
        conn.execute('''
            CREATE TABLE IF NOT EXISTS productos (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                codigo TEXT UNIQUE NOT NULL,
                nombre TEXT NOT NULL,
                costo REAL NOT NULL,
                venta REAL NOT NULL,
                stock INTEGER DEFAULT 0
            )
        ''')
        
        # Tabla Ventas/Tickets
        conn.execute('''
            CREATE TABLE IF NOT EXISTS ventas (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                fecha TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                total REAL NOT NULL,
                items TEXT NOT NULL
            )
        ''')

        # Tabla Gastos
        conn.execute('''
            CREATE TABLE IF NOT EXISTS gastos (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                fecha TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                concepto TEXT NOT NULL,
                monto REAL NOT NULL,
                categoria TEXT
            )
        ''')

        # Migración simple: Verificar si existe columna stock en productos
        cursor = conn.execute("PRAGMA table_info(productos)")
        columns = [column[1] for column in cursor.fetchall()]
        if 'stock' not in columns:
            print("Migrando base de datos: añadiendo columna stock...")
            conn.execute('ALTER TABLE productos ADD COLUMN stock INTEGER DEFAULT 0')

        print("Base de datos inicializada y verificada.")
    finally:
        conn.close()

# --- PRODUCTOS ---

def add_or_update_product(codigo, nombre, costo, venta, cantidad_a_sumar=0):
    conn = get_db_connection()
    try:
        prod = conn.execute('SELECT * FROM productos WHERE codigo = ?', (codigo,)).fetchone()
        
        if prod:
            nuevo_stock = prod['stock'] + cantidad_a_sumar
            conn.execute('''
                UPDATE productos 
                SET nombre = ?, costo = ?, venta = ?, stock = ?
                WHERE codigo = ?
            ''', (nombre, costo, venta, nuevo_stock, codigo))
            action = "updated"
        else:
            conn.execute('''
                INSERT INTO productos (codigo, nombre, costo, venta, stock) 
                VALUES (?, ?, ?, ?, ?)
            ''', (codigo, nombre, costo, venta, cantidad_a_sumar))
            action = "created"
            
        conn.commit()
        return {"success": True, "action": action}
    except Exception as e:
        return {"success": False, "error": str(e)}
    finally:
        conn.close()

def get_product_by_code(codigo):
    conn = get_db_connection()
    prod = conn.execute('SELECT * FROM productos WHERE codigo = ?', (codigo,)).fetchone()
    conn.close()
    if prod: return dict(prod)
    return None

def get_all_products(search=None):
    conn = get_db_connection()
    query = 'SELECT * FROM productos'
    params = []
    if search:
        query += ' WHERE nombre LIKE ? OR codigo LIKE ?'
        st = f'%{search}%'
        params = [st, st]
    query += ' ORDER BY id DESC'
    
    productos = conn.execute(query, params).fetchall()
    conn.close()
    return [dict(p) for p in productos]

def delete_product(id):
    conn = get_db_connection()
    with conn:
        conn.execute('DELETE FROM productos WHERE id = ?', (id,))
    conn.close()

# --- VENTAS ---

def procesar_venta(items):
    conn = get_db_connection()
    total_ticket = 0
    items_json = json.dumps(items) # Usamos JSON DE VERDAD ahora via json lib
    
    try:
        conn.execute('BEGIN TRANSACTION')
        for item in items:
            codigo = item['codigo']
            cantidad = int(item.get('cantidad', 1))
            
            # Verificar stock
            curr = conn.execute('SELECT stock FROM productos WHERE codigo = ?', (codigo,)).fetchone()
            if not curr: continue # O error
            
            # Restar venta
            conn.execute('UPDATE productos SET stock = stock - ? WHERE codigo = ?', (cantidad, codigo))
            total_ticket += item['precio'] * cantidad

        conn.execute('INSERT INTO ventas (total, items) VALUES (?, ?)', (total_ticket, items_json))
        conn.commit()
        return {"success": True, "total": total_ticket}
    except Exception as e:
        conn.rollback()
        return {"success": False, "error": str(e)}
    finally:
        conn.close()

def get_recent_sales(limit=50):
    conn = get_db_connection()
    sales = conn.execute('SELECT * FROM ventas ORDER BY fecha DESC LIMIT ?', (limit,)).fetchall()
    conn.close()
    
    # Parsear items JSON para frontend
    res = []
    for s in sales:
        d = dict(s)
        try: d['items'] = json.loads(d['items'])
        except: d['items'] = []
        res.append(d)
    return res

# --- GASTOS ---

def add_expense(concepto, monto, categoria="General"):
    conn = get_db_connection()
    try:
        with conn:
            conn.execute('INSERT INTO gastos (concepto, monto, categoria) VALUES (?, ?, ?)',
                         (concepto, monto, categoria))
        return True
    except:
        return False
    finally:
        conn.close()

def get_expenses(limit=50):
    conn = get_db_connection()
    gastos = conn.execute('SELECT * FROM gastos ORDER BY fecha DESC LIMIT ?', (limit,)).fetchall()
    conn.close()
    return [dict(g) for g in gastos]

def delete_expense(id):
    conn = get_db_connection()
    with conn:
        conn.execute('DELETE FROM gastos WHERE id = ?', (id,))
    conn.close()

# --- ESTADISTICAS / DASHBOARD ---

def get_dashboard_stats():
    conn = get_db_connection()
    
    # 1. Ventas de HOY
    ventas_hoy = conn.execute('''
        SELECT SUM(total) as total FROM ventas 
        WHERE date(fecha) = date('now', 'localtime')
    ''').fetchone()['total'] or 0.0

    # 2. Gastos de HOY
    gastos_hoy = conn.execute('''
        SELECT SUM(monto) as total FROM gastos 
        WHERE date(fecha) = date('now', 'localtime')
    ''').fetchone()['total'] or 0.0
    
    # 3. Productos con stock BAJO (< 5)
    low_stock = conn.execute('SELECT * FROM productos WHERE stock <= 5 ORDER BY stock ASC LIMIT 5').fetchall()

    # 4. Historial de ventas últimos 7 días para gráfico
    ventas_7_dias = conn.execute('''
        SELECT date(fecha) as dia, SUM(total) as total 
        FROM ventas 
        WHERE fecha >= date('now', '-7 days')
        GROUP BY dia
        ORDER BY dia ASC
    ''').fetchall()

    # 5. Valor del inventario
    stats_inv = conn.execute('''
        SELECT 
            SUM(stock) as total_items, 
            SUM(stock * costo) as valor_costo,
            SUM(stock * venta) as valor_venta
        FROM productos
    ''').fetchone()

    # 6. Top 5 productos más vendidos
    top_ventas = conn.execute('''
        WITH split_items AS (
            SELECT value as item_json 
            FROM ventas, json_each(items)
        )
        SELECT 
            json_extract(item_json, '$.nombre') as nombre,
            SUM(json_extract(item_json, '$.cantidad')) as cantidad
        FROM split_items
        GROUP BY nombre
        ORDER BY cantidad DESC
        LIMIT 5
    ''').fetchall()
    
    conn.close()
    
    return {
        "ventas_hoy": ventas_hoy,
        "gastos_hoy": gastos_hoy,
        "beneficio_hoy": ventas_hoy - gastos_hoy,
        "low_stock": [dict(p) for p in low_stock],
        "history": [dict(v) for v in ventas_7_dias],
        "inventory": dict(stats_inv) if stats_inv else {"total_items": 0, "valor_costo": 0, "valor_venta": 0},
        "top_selling": [dict(t) for t in top_ventas]
    }
