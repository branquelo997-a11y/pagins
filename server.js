// server.js — coleta TODOS os nextPageCursor da Roblox
// npm i express node-fetch

import express from "express";
import fetch from "node-fetch";

const app = express();
app.use(express.json());

// ===================== CONFIG =====================
const PORT = process.env.PORT || 4000;
const GAME_ID = process.env.GAME_ID || "109983668079237";

const BASE_URL = `https://games.roblox.com/v1/games/${GAME_ID}/servers/Public?sortOrder=Asc&limit=100`;
const REFRESH_INTERVAL = Number(process.env.REFRESH_INTERVAL || 60_000); // 1 minuto

// ===================== ESTADO =====================
let cursors = [];
let lastRefresh = 0;

// ===================== FUNÇÃO PRINCIPAL =====================

async function collectAllCursors() {
    console.log("[CursorCollector] Iniciando coleta de nextPageCursor...");

    let pageCursor = null;
    let page = 1;
    const newList = [];

    while (true) {
        // monta URL
        const url = pageCursor
            ? `${BASE_URL}&cursor=${encodeURIComponent(pageCursor)}`
            : BASE_URL;

        console.log(`[CursorCollector] Página ${page}...`);

        // faz request
        const res = await fetch(url);
        if (!res.ok) {
            console.log(`Erro ao buscar página (${res.status})`);
            break;
        }

        const data = await res.json();

        // pega nextPageCursor
        if (data.nextPageCursor) {
            newList.push(data.nextPageCursor);
            pageCursor = data.nextPageCursor;
            page++;
        } else {
            break;
        }
    }

    cursors = newList;
    lastRefresh = Date.now();
    console.log(`[CursorCollector] Coleta completa com ${cursors.length} cursors.`);
}

// ===================== ENDPOINT =====================

app.get("/cursors", (req, res) => {
    res.json({
        updatedAt: new Date(lastRefresh).toISOString(),
        total: cursors.length,
        cursors,
    });
});

// ===================== ATUALIZAÇÃO AUTOMÁTICA =====================

setInterval(() => {
    collectAllCursors();
}, REFRESH_INTERVAL);

collectAllCursors(); // primeiro carregamento imediato

// ===================== START =====================

app.listen(PORT, () => {
    console.log(`Servidor iniciado na porta ${PORT}`);
});
