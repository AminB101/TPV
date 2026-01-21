try:
    import google.generativeai as genai
    HAS_GENAI = True
except ImportError:
    HAS_GENAI = False

import os
import json
import PIL.Image
import pandas as pd
import io

# Intentar configurar API Key desde entorno
API_KEY = os.environ.get("GEMINI_API_KEY")

if API_KEY and HAS_GENAI:
    try:
        genai.configure(api_key=API_KEY)
    except:
        pass

def configure_api_key(key):
    global API_KEY
    API_KEY = key
    if HAS_GENAI:
        try:
            genai.configure(api_key=key)
        except:
            pass

def procesar_albaran(file_path):
    ext = file_path.rsplit('.', 1)[1].lower()
    
    if ext == 'csv':
        return procesar_csv(file_path)
    else:
        return procesar_imagen_gemini(file_path)

def procesar_csv(file_path):
    try:
        # Intentar leer con pandas detectando formato europeo
        # sep=; decimal=,
        try:
            df = pd.read_csv(file_path, sep=';', decimal=',', encoding='utf-8')
        except:
            # Fallback a formato estandar si falla
            df = pd.read_csv(file_path)
            
        productos = []
        
        # Mapeo de columnas flexible (normalizar nombres)
        cols = {c.strip().lower(): c for c in df.columns}
        
        # Buscar columnas clave
        col_sku = next((cols[c] for c in cols if 'sku' in c or 'cod' in c or 'ref' in c), None)
        col_nom = next((cols[c] for c in cols if 'desc' in c or 'prod' in c or 'nom' in c), None)
        col_cant = next((cols[c] for c in cols if 'cant' in c or 'uni' in c or 'qty' in c), None)
        col_costo = next((cols[c] for c in cols if 'cost' in c or 'precio' in c), None)
        
        if not (col_sku and col_nom):
            return {"success": False, "error": "No se encontraron columnas de Código/SKU o Nombre en el CSV"}
            
        for _, row in df.iterrows():
            try:
                # Limpieza básica
                sku = str(row[col_sku]).strip()
                nombre = str(row[col_nom]).strip()
                
                # Cantidad
                cant = 1
                if col_cant:
                    try: cant = int(float(str(row[col_cant]).replace(',', '.'))) 
                    except: pass
                    
                # Costo
                costo = 0.0
                if col_costo:
                    try: costo = float(str(row[col_costo]).replace('€', '').replace(',', '.').strip())
                    except: pass
                
                # Venta sugerida (30% margen si no hay columna venta)
                venta = round(costo * 1.3, 2)
                
                if sku and nombre:
                    productos.append({
                        "codigo": sku,
                        "nombre": nombre,
                        "costo": costo,
                        "venta": venta,
                        "unidades": cant
                    })
            except Exception as ex:
                print(f"Error fila: {ex}")
                continue
                
        return {"success": True, "productos": productos}
        
    except Exception as e:
        return {"success": False, "error": f"Error procesando CSV: {str(e)}"}

def procesar_imagen_gemini(image_path):
    if not HAS_GENAI:
        return {
            "success": False, 
            "error": "La librería de IA no está instalada (google-generativeai)."
        }

    if not API_KEY:
        return {
            "success": False, 
            "error": "Falta la API Key de Gemini. Configúrala en el sistema."
        }

    try:
        model = genai.GenerativeModel('gemini-1.5-flash')
        
        img = PIL.Image.open(image_path)
        
        prompt = """
        Analiza esta imagen y extrae la lista de productos en formato JSON estricto.
        Para cada item devuelve:
        - "codigo": SKU o referencia.
        - "nombre": Descripción.
        - "unidades": Cantidad entera (si no dice, asume 1).
        - "costo": Precio unitario costo.
        - "venta": Sugiere PVP (costo * 1.5 aprox).
        
        Responde SOLO el JSON:
        {"productos": [...]}
        """
        
        response = model.generate_content([prompt, img])
        text_resp = response.text.strip()
        
        if text_resp.startswith("```json"):
            text_resp = text_resp.replace("```json", "").replace("```", "")
        
        data = json.loads(text_resp)
        return {"success": True, "productos": data.get("productos", [])}
        
    except Exception as e:
        return {"success": False, "error": str(e)}
