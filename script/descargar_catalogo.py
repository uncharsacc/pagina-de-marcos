import os
import time
import json
import hashlib
from datetime import datetime
from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.chrome.service import Service
from selenium.webdriver.chrome.options import Options
from webdriver_manager.chrome import ChromeDriverManager
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC

class MonitorSharePoint:
    def __init__(self, url, archivo_estado="estado_catalogo.json"):
        self.url = url
        self.archivo_estado = archivo_estado
        self.estado_anterior = self.cargar_estado()
        
    def cargar_estado(self):
        """Carga el estado anterior guardado"""
        if os.path.exists(self.archivo_estado):
            with open(self.archivo_estado, 'r', encoding='utf-8') as f:
                return json.load(f)
        return {}
    
    def guardar_estado(self, estado):
        """Guarda el estado actual"""
        with open(self.archivo_estado, 'w', encoding='utf-8') as f:
            json.dump(estado, f, indent=2, ensure_ascii=False)
    
    def obtener_archivos_actuales(self):
        """Obtiene la lista actual de archivos en la carpeta SharePoint"""
        print("🔍 Revisando carpeta SharePoint...")
        
        options = Options()
        options.add_argument('--headless')  # Corre en segundo plano
        options.add_argument('--no-sandbox')
        options.add_argument('--disable-dev-shm-usage')
        
        driver = webdriver.Chrome(service=Service(ChromeDriverManager().install()), options=options)
        
        archivos_actuales = {}
        
        try:
            driver.get(self.url)
            time.sleep(5)  # Esperar carga
            
            # Buscar nombres de archivos
            selectores = [
                "//span[@data-automationid='name']",
                "//span[contains(@class, 'fileName')]",
                "//div[@role='row']//span[@dir='auto']",
                "//div[contains(@class, 'file-name')]"
            ]
            
            archivos_encontrados = []
            
            for selector in selectores:
                elementos = driver.find_elements(By.XPATH, selector)
                for elem in elementos:
                    texto = elem.text.strip()
                    if texto and len(texto) > 3 and '.' in texto:
                        if texto not in archivos_encontrados:
                            archivos_encontrados.append(texto)
                            
                            # Crear un hash simple del nombre (para detectar cambios)
                            hash_nombre = hashlib.md5(texto.encode()).hexdigest()[:8]
                            
                            archivos_actuales[texto] = {
                                'nombre': texto,
                                'hash': hash_nombre,
                                'ultima_vista': datetime.now().isoformat()
                            }
            
            print(f"✅ Encontrados {len(archivos_actuales)} archivos")
            
        except Exception as e:
            print(f"❌ Error: {e}")
            
        finally:
            driver.quit()
        
        return archivos_actuales
    
    def comparar_cambios(self, actual):
        """Compara el estado actual con el anterior y detecta cambios"""
        cambios = {
            'nuevos': [],
            'eliminados': [],
            'modificados': []
        }
        
        anteriores = self.estado_anterior
        
        # Buscar archivos nuevos o modificados
        for nombre, info in actual.items():
            if nombre not in anteriores:
                cambios['nuevos'].append(nombre)
            elif anteriores[nombre].get('hash') != info['hash']:
                cambios['modificados'].append(nombre)
        
        # Buscar archivos eliminados
        for nombre in anteriores:
            if nombre not in actual:
                cambios['eliminados'].append(nombre)
        
        return cambios
    
    def mostrar_resumen(self, cambios):
        """Muestra un resumen de los cambios encontrados"""
        print("\n" + "="*60)
        print("📊 RESUMEN DE CAMBIOS")
        print("="*60)
        
        if not any(cambios.values()):
            print("✨ No hay cambios en la carpeta")
            return
        
        if cambios['nuevos']:
            print(f"\n🆕 ARCHIVOS NUEVOS ({len(cambios['nuevos'])}):")
            for archivo in cambios['nuevos']:
                print(f"  + {archivo}")
        
        if cambios['modificados']:
            print(f"\n📝 ARCHIVOS MODIFICADOS ({len(cambios['modificados'])}):")
            for archivo in cambios['modificados']:
                print(f"  ~ {archivo}")
        
        if cambios['eliminados']:
            print(f"\n🗑️ ARCHIVOS ELIMINADOS ({len(cambios['eliminados'])}):")
            for archivo in cambios['eliminados']:
                print(f"  - {archivo}")
    
    def ejecutar_una_vez(self):
        """Ejecuta una única verificación"""
        print(f"\n📁 Monitoreando: CATÁLOGO DE LENTES")
        print(f"🕒 {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
        
        actual = self.obtener_archivos_actuales()
        cambios = self.comparar_cambios(actual)
        
        self.mostrar_resumen(cambios)
        
        # Guardar estado actual para la próxima vez
        self.guardar_estado(actual)
        
        return cambios
    
    def monitorear_continuo(self, intervalo=300):
        """Monitorea continuamente cada cierto intervalo (en segundos)"""
        print(f"🔄 Monitoreo continuo iniciado (intervalo: {intervalo}s)")
        print("Presiona Ctrl+C para detener\n")
        
        try:
            while True:
                self.ejecutar_una_vez()
                print(f"\n⏳ Esperando {intervalo} segundos hasta la próxima revisión...")
                time.sleep(intervalo)
        except KeyboardInterrupt:
            print("\n\n👋 Monitoreo detenido por el usuario")

# Configuración
URL = "https://mercavisionltda-my.sharepoint.com/:f:/g/personal/usointerno_mercavisionltda_onmicrosoft_com/EhfAo9Bv_9FIiPEz0i2Of1UB9DHTxjuzmRgEiUzoGCIinA?e=zfUsmJ"
ARCHIVO_ESTADO = "estado_catalogo.json"

# Crear monitor
monitor = MonitorSharePoint(URL, ARCHIVO_ESTADO)

# === ELIGE UNA OPCIÓN ===

# Opción 1: Verificar una sola vez
print("🔍 VERIFICACIÓN ÚNICA")
monitor.ejecutar_una_vez()

# Opción 2: Monitoreo continuo (descomenta para usar)
# print("🔄 MONITOREO CONTINUO")
# monitor.monitorear_continuo(intervalo=300)  # Revisa cada 5 minutos