import database
import ocr_service
import os

# Ruta del archivo
csv_path = '/Users/aminb101/TPV/albarantest.csv'

if not os.path.exists(csv_path):
    print("Error: No encuentro el archivo csv")
    exit()

print("--- Iniciando importación masiva ---")

# 1. Procesar CSV usando la lógica que ya creamos
resultado = ocr_service.procesar_csv(csv_path)

if not resultado['success']:
    print(f"Error procesando CSV: {resultado.get('error')}")
    exit()

productos = resultado['productos']
print(f"Se encontraron {len(productos)} productos en el albarán.")

# 2. Insertar en Base de Datos
count_ok = 0
count_err = 0

for p in productos:
    # Preparar datos
    codigo = p['codigo']
    nombre = p['nombre']
    costo = p['costo']
    venta = p['venta']
    unidades = p.get('unidades', 1)
    
    print(f"Procesando: {codigo} | {unidades} uds... ", end='')
    
    # Llamar a la función de BD que suma stock si ya existe
    res = database.add_or_update_product(codigo, nombre, costo, venta, unidades)
    
    if res['success']:
        print(f"OK ({res['action']})")
        count_ok += 1
    else:
        print(f"ERROR: {res['error']}")
        count_err += 1

print("\n--- Resumen ---")
print(f"Importados/Actualizados: {count_ok}")
print(f"Errores: {count_err}")
print("El stock ha sido actualizado en la base de datos.")
