#!/usr/bin/env python3
import os
import requests
import threading
import time
import logging
import random
import urllib.parse
from flask import Flask, jsonify
from datetime import datetime, timedelta

logging.basicConfig(level=logging.INFO, format='[CURSOR_API] %(message)s')
app = Flask(__name__)

# ==============================
# CONFIG
# ==============================

GAME_ID = os.environ.get("GAME_ID", "109983668079237")
BASE_URL = f"https://games.roblox.com/v1/games/{GAME_ID}/servers/Public?sortOrder=Asc&limit=100"

REQUEST_TIMEOUT = int(os.environ.get("REQUEST_TIMEOUT", "5"))
MAX_PAGES = int(os.environ.get("MAX_PAGES", "200"))  # Máximo de páginas para coletar
REFRESH_INTERVAL = int(os.environ.get("REFRESH_INTERVAL", "300"))  # Atualizar cursores a cada 5 minutos

# ==============================
# PROXIES
# ==============================

def normalize_proxy(raw: str) -> str:
    raw = raw.strip()
    if not raw:
        return None
    if raw.startswith("http://") or raw.startswith("https://"):
        return raw
    parts = raw.split(":")
    if len(parts) >= 4:
        host = parts[0]
        port = parts[1]
        user = parts[2]
        pwd = ":".join(parts[3:])
        user_enc = urllib.parse.quote(user, safe="")
        pwd_enc = urllib.parse.quote(pwd, safe="")
        return f"http://{user_enc}:{pwd_enc}@{host}:{port}"
    if len(parts) == 2:
        host, port = parts
        return f"http://{host}:{port}"
    return raw

raw_proxies = os.environ.get("PROXIES", "")
PROXIES = [normalize_proxy(p) for p in raw_proxies.split(",") if p.strip()]

if not PROXIES:
    logging.warning("[WARN] Nenhuma proxy configurada — requisições diretas.")
else:
    logging.info(f"[INIT] {len(PROXIES)} proxies carregadas.")

# ==============================
# ARMAZENAMENTO DE CURSOres
# ==============================

cursors_cache = {}  # {page_number: cursor}
last_update = None
update_lock = threading.Lock()
is_updating = False

# ==============================
# COLETA DE CURSOres
# ==============================

def fetch_all_cursors():
    global cursors_cache, last_update, is_updating
    
    with update_lock:
        if is_updating:
            logging.info("[SKIP] Atualização já em andamento...")
            return
        is_updating = True
    
    try:
        logging.info(f"[FETCH] Iniciando coleta de cursores (máximo: {MAX_PAGES} páginas)...")
        
        new_cursors = {}
        cursor = None
        page_count = 0
        proxy_index = 0
        
        # Página 1 não tem cursor (é a primeira)
        new_cursors[1] = None
        page_count = 1
        
        while page_count < MAX_PAGES:
            proxy = random.choice(PROXIES) if PROXIES else None
            proxies = {"http": proxy, "https": proxy} if proxy else None
            
            try:
                url = BASE_URL + (f"&cursor={cursor}" if cursor else "")
                
                r = requests.get(url, proxies=proxies, timeout=REQUEST_TIMEOUT)
                
                if r.status_code == 429:
                    logging.warning("[429] Too Many Requests — trocando de proxy...")
                    time.sleep(2)
                    continue
                
                r.raise_for_status()
                data = r.json()
                cursor = data.get("nextPageCursor")
                
                page_count += 1
                new_cursors[page_count] = cursor
                
                if page_count % 10 == 0:
                    logging.info(f"[PROGRESS] {page_count} páginas coletadas...")
                
                if not cursor:
                    logging.info(f"[COMPLETE] Sem mais páginas disponíveis na página {page_count}")
                    break
                
                time.sleep(0.3)  # Delay menor para coleta rápida
                
            except requests.exceptions.RequestException as e:
                logging.warning(f"[ERRO] Proxy {proxy or 'sem proxy'} falhou: {e}")
                time.sleep(1)
                proxy_index += 1
                if proxy_index >= (len(PROXIES) or 1) * 3:
                    logging.error("[ERRO] Muitas falhas consecutivas, parando coleta.")
                    break
        
        with update_lock:
            cursors_cache = new_cursors
            last_update = datetime.now()
            logging.info(f"✅ {len(cursors_cache)} cursores coletados e atualizados!")
            logging.info(f"📊 Páginas disponíveis: 1 a {len(cursors_cache)}")
        
    except Exception as e:
        logging.exception(f"❌ Erro ao coletar cursores: {e}")
    finally:
        with update_lock:
            is_updating = False

# ==============================
# THREAD DE ATUALIZAÇÃO AUTOMÁTICA
# ==============================

def auto_refresh():
    """Atualiza os cursores periodicamente"""
    while True:
        time.sleep(REFRESH_INTERVAL)
        logging.info(f"[AUTO] Iniciando atualização automática de cursores...")
        fetch_all_cursors()

# Inicia atualização automática em background
threading.Thread(target=auto_refresh, daemon=True).start()

# Coleta inicial
fetch_all_cursors()

# ==============================
# ENDPOINTS
# ==============================

@app.route("/", methods=["GET"])
def home():
    with update_lock:
        total_pages = len(cursors_cache)
        return jsonify({
            "status": "cursor API running",
            "total_pages": total_pages,
            "last_update": last_update.isoformat() if last_update else None,
            "game_id": GAME_ID,
            "max_pages": MAX_PAGES,
            "refresh_interval_seconds": REFRESH_INTERVAL,
            "endpoints": {
                "/cursors": "Lista todos os cursores",
                "/cursors/<page>": "Obtém cursor de uma página específica",
                "/refresh": "Força atualização dos cursores"
            }
        })

@app.route("/cursors", methods=["GET"])
def list_cursors():
    """Lista todos os cursores disponíveis"""
    with update_lock:
        return jsonify({
            "total_pages": len(cursors_cache),
            "last_update": last_update.isoformat() if last_update else None,
            "cursors": cursors_cache
        })

@app.route("/cursors/<int:page>", methods=["GET"])
def get_cursor(page):
    """Obtém o cursor de uma página específica"""
    with update_lock:
        if page < 1:
            return jsonify({"error": "Número de página deve ser >= 1"}), 400
        
        if page in cursors_cache:
            return jsonify({
                "page": page,
                "cursor": cursors_cache[page],
                "has_next": cursors_cache[page] is not None
            })
        else:
            return jsonify({
                "error": f"Página {page} não encontrada",
                "available_pages": f"1 a {len(cursors_cache)}"
            }), 404

@app.route("/refresh", methods=["POST", "GET"])
def refresh():
    """Força atualização dos cursores"""
    threading.Thread(target=fetch_all_cursors, daemon=True).start()
    return jsonify({
        "status": "Atualização iniciada em background",
        "message": "Os cursores serão atualizados em breve. Use /cursors para verificar."
    })

@app.route("/stats", methods=["GET"])
def stats():
    """Estatísticas da API"""
    with update_lock:
        total = len(cursors_cache)
        pages_with_cursor = sum(1 for c in cursors_cache.values() if c is not None)
        
        return jsonify({
            "total_pages": total,
            "pages_with_cursor": pages_with_cursor,
            "last_page": total,
            "last_update": last_update.isoformat() if last_update else None,
            "is_updating": is_updating,
            "refresh_interval_seconds": REFRESH_INTERVAL
        })

# ==============================
# RUN
# ==============================

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8000))
    logging.info(f"🚀 Cursor API rodando na porta {port}")
    logging.info(f"📡 Game ID: {GAME_ID}")
    logging.info(f"🔄 Atualização automática a cada {REFRESH_INTERVAL} segundos")
    app.run(host="0.0.0.0", port=port, debug=False)
