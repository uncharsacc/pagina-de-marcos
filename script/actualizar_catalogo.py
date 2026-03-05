# -*- coding: utf-8 -*-
"""
Script para descargar la carpeta 'CATÁLOGO DE LENTES' desde un enlace compartido de OneDrive/SharePoint
Requiere: pip install Office365-REST-Python-Client
"""

import os
from office365.runtime.auth.user_credential import UserCredential
from office365.sharepoint.client_context import ClientContext
from office365.sharepoint.files.file import File


# ── CONFIGURACIÓN ────────────────────────────────────────────────
username = "el_loko_gusano@hotmail.com"          # ← CAMBIA ESTO
password = "lokillo_90"              # ← CAMBIA ESTO
# ¡Importante! Si tienes MFA → este método NO funciona.
# En ese caso necesitas App Registration (client_id + client_secret o certificado)

site_url = "https://mercavisionltda-my.sharepoint.com/personal/usointerno_mercavisionltda_onmicrosoft_com"
folder_to_download = "CATÁLOGO DE LENTES"    # nombre exacto de la carpeta

# Enlace compartido (solo se usa para referencia, pero usaremos la ruta relativa)
shared_link = "https://mercavisionltda-my.sharepoint.com/:f:/g/personal/usointerno_mercavisionltda_onmicrosoft_com/EhfAo9Bv_9FIiPEz0i2Of1UB9DHTxjuzmRgEiUzoGCIinA?e=zfUsmJ"
# ──────────────────────────────────────────────────────────────────


def download_folder(ctx, server_rel_url, local_path):
    """Descarga recursivamente una carpeta de SharePoint"""
    os.makedirs(local_path, exist_ok=True)

    folder = ctx.web.get_folder_by_server_relative_url(server_rel_url)
    ctx.load(folder)
    ctx.execute_query()

    # Archivos
    files = folder.files
    ctx.load(files)
    ctx.execute_query()

    for file in files:
        local_file_path = os.path.join(local_path, file.name)
        print(f"Descargando → {file.name}")
        with open(local_file_path, "wb") as local_file:
            file.download(local_file)
            ctx.execute_query()

    # Subcarpetas (recursivo)
    subfolders = folder.folders
    ctx.load(subfolders)
    ctx.execute_query()

    for sub in subfolders:
        if sub.name in (".", "..", "Forms"):  # ignorar carpetas sistema
            continue
        sub_rel_url = f"{server_rel_url}/{sub.name}"
        sub_local = os.path.join(local_path, sub.name)
        download_folder(ctx, sub_rel_url, sub_local)


# ── EJECUCIÓN ────────────────────────────────────────────────────
try:
    credentials = UserCredential(username, password)
    ctx = ClientContext(site_url).with_credentials(credentials)

    # Verificar conexión básica
    web = ctx.web
    ctx.load(web)
    ctx.execute_query()
    print(f"Conectado exitosamente a: {web.properties['Title']}")

    # Ruta relativa de la carpeta (ajusta si está dentro de otra carpeta)
    # En OneDrive personal suele ser /personal/.../Documents/CATÁLOGO DE LENTES
    # Prueba primero con "/personal/usointerno_mercavisionltda_onmicrosoft_com/Documents"
    root_folder = "/personal/usointerno_mercavisionltda_onmicrosoft_com/Documents"
    target_rel_url = f"{root_folder}/{folder_to_download}"

    local_destination = os.path.join(os.getcwd(), folder_to_download)

    print(f"Descargando carpeta: {target_rel_url}")
    print(f"Destino local   : {local_destination}\n")

    download_folder(ctx, target_rel_url, local_destination)

    print("\n¡Descarga finalizada!")

except Exception as ex:
    print("Error:", ex)
    print("\nPosibles causas:")
    print("1. Credenciales incorrectas")
    print("2. MFA activado → necesitas client_id + client_secret")
    print("3. La carpeta no está en /Documents o el nombre tiene tilde/acentos mal escritos")
    print("4. Versión antigua de la librería → intenta: pip install --upgrade Office365-REST-Python-Client")