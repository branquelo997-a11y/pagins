#!/usr/bin/env python3
import requests
import threading
import time
from flask import Flask, jsonify
import logging

logging.basicConfig(level=logging.INFO, format='[CURSOR] %(message)s')

app = Flask(__name__)

# ==============================
# CONFIG
# ==============================
GAME_ID = "109983668079237"
BASE_URL = f"https://games.roblox.com/v1/games/{GAME_ID}/servers/Public?sortOrder=Asc&limit=100"
REQUEST_TIMEOUT = 10
SLEEP_BETWEEN_PAGES = 0.1
SLEEP_FULL_CYCLE = 1

# ==============================
# ARMAZENAMENTO
# ==============================
cursors = []            # lista de cursores coletados
seen_cursors = set()    # usado para evitar duplicados

# ==============================
# THREAD: PAGINAÇÃO INFINITA
# ==============================
def paginate_forever():
    global cursors, seen_cursors

    while True:
        try:
            next_cursor = ""

            while True:
                url = BASE_URL
                if next_cursor:
                    url += f"&cursor={next_cursor}"

                logging.info(f"Pegando página... cursor={next_cursor}")

                r = requests.get(url, timeout=REQUEST_TIMEOUT)
                if r.status_code != 200:
                    logging.warning("Erro na request, pausando...")
                    time.sleep(2)
                    break

                data = r.json()

                # SALVA O CURSOR ATUAL NA LISTA
                if next_cursor and next_cursor not in seen_cursors:
                    seen_cursors.add(next_cursor)
                    cursors.append(next_cursor)
                    logging.info(f"Salvo cursor: {next_cursor}")

                # PEGA O PRÓXIMO CURSOR
                next_cursor = data.get("nextPageCursor")

                if not next_cursor:
                    logging.info("Fim das páginas — reiniciando ciclo...")
                    break

                time.sleep(SLEEP_BETWEEN_PAGES)

            time.sleep(SLEEP_FULL_CYCLE)

        except Exception as e:
            logging.error(f"Erro inesperado: {e}")
            time.sleep(2)


# ==============================
# ENDPOINTS
# ==============================

@app.route("/cursors", methods=["GET"])
def get_cursors():
    return jsonify({
        "count": len(cursors),
        "cursors": cursors
    })


@app.route("/", methods=["GET"])
def home():
    return jsonify({"status": "Cursor API rodando", "total_cursors": len(cursors)})


# ==============================
# START
# ==============================
if __name__ == "__main__":
    # inicia thread sem travar o flask
    t = threading.Thread(target=paginate_forever)
    t.daemon = True
    t.start()

    app.run(host="0.0.0.0", port=8000)
