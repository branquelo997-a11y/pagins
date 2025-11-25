#!/usr/bin/env python3
import time
import requests
import threading
from flask import Flask, jsonify

app = Flask(__name__)

# ==============================
# CONFIG
# ==============================
GAME_ID = "109983668079237"
BASE_URL = f"https://games.roblox.com/v1/games/{GAME_ID}/servers/Public?sortOrder=Asc&limit=100"

REFRESH_INTERVAL = 60  # segundos

# ==============================
# ESTADO
# ==============================
cursors = []
last_refresh = 0


# ==============================
# FUNÇÃO PRINCIPAL
# ==============================
def collect_all_cursors():
    global cursors, last_refresh

    print("[CursorCollector] Iniciando coleta...")
    collected = []

    cursor = None
    page = 1

    while True:
        if cursor:
            url = f"{BASE_URL}&cursor={cursor}"
        else:
            url = BASE_URL

        print(f"[CursorCollector] Página {page}...")

        try:
            response = requests.get(url, timeout=10)
            data = response.json()
        except Exception as e:
            print("Erro:", e)
            break

        next_cursor = data.get("nextPageCursor")

        if next_cursor:
            collected.append(next_cursor)
            cursor = next_cursor
            page += 1
        else:
            break

    cursors = collected
    last_refresh = time.time()

    print(f"[CursorCollector] Coleta finalizada: {len(cursors)} cursors coletados.")


# ==============================
# THREAD DE ATUALIZAÇÃO
# ==============================
def auto_refresh():
    while True:
        collect_all_cursors()
        time.sleep(REFRESH_INTERVAL)


threading.Thread(target=auto_refresh, daemon=True).start()


# ==============================
# ENDPOINT
# ==============================
@app.route("/cursors")
def get_cursors():
    return jsonify({
        "updatedAt": time.strftime("%Y-%m-%d %H:%M:%S", time.localtime(last_refresh)),
        "total": len(cursors),
        "cursors": cursors
    })


# ==============================
# START (local)
# ==============================
if __name__ == "__main__":
    app.run(host="0.0.0.0", port=4000)
