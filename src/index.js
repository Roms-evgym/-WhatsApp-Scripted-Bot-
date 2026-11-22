import "dotenv/config";
import http from "node:http";
import { timingSafeEqual } from "node:crypto";
import baileys from "@whiskeysockets/baileys";

const makeWASocket = baileys.default || baileys.makeWASocket || baileys;
const {
  BufferJSON,
  DisconnectReason,
  fetchLatestBaileysVersion,
  initAuthCreds,
  proto
} = baileys;
import { createClient } from "@supabase/supabase-js";
import pino from "pino";
import qrcode from "qrcode-terminal";
import QRCode from "qrcode";
import { Boom } from "@hapi/boom";

const PREFIX = process.env.BOT_PREFIX || "!scripted";
const TARGET_GROUP_LINK = process.env.TARGET_GROUP_LINK;
const SOURCE_GROUP_ID = process.env.SOURCE_GROUP_ID || "";
const LOG_GROUPS = (process.env.LOG_GROUPS || "true").toLowerCase() === "true";
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
const TABLE = "whatsapp_auth";

if (!TARGET_GROUP_LINK?.startsWith("https://chat.whatsapp.com/")) {
  console.error("Bitte TARGET_GROUP_LINK als Render-Umgebungsvariable setzen.");
  process.exit(1);
}
if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("SUPABASE_URL und SUPABASE_SECRET_KEY fehlen in den Render-Umgebungsvariablen.");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false }
});

// Render Web Services benötigen einen HTTP-Port. Der QR-Code ist nur mit QR_VIEW_TOKEN erreichbar.
const QR_VIEW_TOKEN = process.env.QR_VIEW_TOKEN || "";
let latestQr = null;

function hasQrAccess(url) {
  const supplied = url.searchParams.get("token") || "";
  if (!QR_VIEW_TOKEN || !supplied) return false;
  const expectedBuffer = Buffer.from(QR_VIEW_TOKEN);
  const suppliedBuffer = Buffer.from(supplied);
  return expectedBuffer.length === suppliedBuffer.length &&
    timingSafeEqual(expectedBuffer, suppliedBuffer);
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || "/", "http://localhost");
  const noStore = {
    "cache-control": "no-store, no-cache, must-revalidate, private",
    "pragma": "no-cache",
    "referrer-policy": "no-referrer",
    "x-content-type-options": "nosniff"
  };

  if (url.pathname === "/health" || url.pathname === "/") {
    res.writeHead(200, { ...noStore, "content-type": "text/plain; charset=utf-8" });
    res.end("WhatsApp Scripted Bot is running");
    return;
  }

  if (url.pathname === "/qr" || url.pathname === "/qr.png") {
    if (!QR_VIEW_TOKEN) {
      res.writeHead(503, { ...noStore, "content-type": "text/plain; charset=utf-8" });
      res.end("QR-Bildanzeige ist nicht eingerichtet. QR_VIEW_TOKEN fehlt.");
      return;
    }
    if (!hasQrAccess(url)) {
      res.writeHead(401, { ...noStore, "content-type": "text/plain; charset=utf-8" });
      res.end("Nicht autorisiert. Token fehlt oder ist falsch.");
      return;
    }
    if (!latestQr) {
      res.writeHead(503, { ...noStore, "content-type": "text/plain; charset=utf-8" });
      res.end("Aktuell ist kein QR-Code verfügbar. Bitte kurz warten und neu laden.");
      return;
    }

    if (url.pathname === "/qr.png") {
      try {
        const png = await QRCode.toBuffer(latestQr, {
          type: "png",
          errorCorrectionLevel: "H",
          margin: 4,
          scale: 10
        });
        res.writeHead(200, { ...noStore, "content-type": "image/png" });
        res.end(png);
      } catch (error) {
        console.error("QR-Bild konnte nicht erstellt werden:", error.message);
        res.writeHead(500, { ...noStore, "content-type": "text/plain; charset=utf-8" });
        res.end("QR-Bild konnte nicht erstellt werden.");
      }
      return;
    }

    const tokenJson = JSON.stringify(url.searchParams.get("token"));
    const html = `<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="referrer" content="no-referrer">
<title>WhatsApp Bot verbinden</title>
<style>
body{font-family:system-ui,-apple-system,sans-serif;background:#f4f6f8;color:#17202a;margin:0;min-height:100vh;display:grid;place-items:center;padding:20px;box-sizing:border-box}
main{background:white;border-radius:20px;padding:24px;max-width:440px;width:100%;box-sizing:border-box;text-align:center;box-shadow:0 8px 32px #00000012}
img{width:min(100%,360px);height:auto;image-rendering:pixelated;background:white}
p{line-height:1.5;color:#4b5563}#status{font-size:14px}
</style>
</head>
<body><main>
<h1>WhatsApp verbinden</h1>
<p>Öffne WhatsApp auf deinem Handy → <b>Verknüpfte Geräte</b> → <b>Gerät hinzufügen</b> und scanne diesen QR-Code.</p>
<img id="qr" alt="Aktueller WhatsApp-Verknüpfungs-QR-Code">
<p id="status">Lade aktuellen QR-Code …</p>
</main>
<script>
const token = ${tokenJson};
const image = document.getElementById("qr");
const status = document.getElementById("status");
async function refreshQr(){
  try{
    const response = await fetch("/qr.png?token=" + encodeURIComponent(token) + "&t=" + Date.now(), {cache:"no-store"});
    if(!response.ok) throw new Error(response.status === 503 ? "Noch kein QR-Code verfügbar – bitte warten." : "QR-Code konnte nicht geladen werden.");
    const blob = await response.blob();
    const oldUrl = image.dataset.objectUrl;
    const objectUrl = URL.createObjectURL(blob);
    image.src = objectUrl;
    image.dataset.objectUrl = objectUrl;
    if(oldUrl) URL.revokeObjectURL(oldUrl);
    status.textContent = "QR-Code wird automatisch aktualisiert. Bitte sofort scannen.";
  }catch(error){status.textContent = error.message;}
}
refreshQr();
setInterval(refreshQr, 2000);
</script>
</body>
</html>`;
    res.writeHead(200, {
      ...noStore,
      "content-type": "text/html; charset=utf-8",
      "content-security-policy": "default-src 'none'; img-src 'self' blob:; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'"
    });
    res.end(html);
    return;
  }

  res.writeHead(404, { ...noStore, "content-type": "text/plain; charset=utf-8" });
  res.end("Not found");
});
server.listen(Number(process.env.PORT) || 3000, "0.0.0.0", () => {
  console.log("HTTP-Server gestartet. Geschützte QR-Seite: /qr?token=DEIN_QR_VIEW_TOKEN");
  if (!QR_VIEW_TOKEN) console.warn("QR_VIEW_TOKEN fehlt – QR-Bildanzeige bleibt deaktiviert.");
});

async function readAuthRow(id) {
  const { data, error } = await supabase
    .from(TABLE)
    .select("data")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data?.data ?? null;
}

async function writeAuthRows(rows) {
  if (!rows.length) return;
  const { error } = await supabase.from(TABLE).upsert(
    rows.map(({ id, data }) => ({ id, data, updated_at: new Date().toISOString() })),
    { onConflict: "id" }
  );
  if (error) throw error;
}

async function useSupabaseAuthState() {
  const savedCreds = await readAuthRow("creds");
  const creds = savedCreds
    ? JSON.parse(JSON.stringify(savedCreds), BufferJSON.reviver)
    : initAuthCreds();

  const keys = {
    get: async (type, ids) => {
      if (!ids.length) return {};
      const rowIds = ids.map((id) => `key:${type}:${id}`);
      const { data, error } = await supabase
        .from(TABLE)
        .select("id,data")
        .in("id", rowIds);
      if (error) throw error;

      const result = {};
      for (const row of data || []) {
        const keyId = row.id.slice(`key:${type}:`.length);
        let value = JSON.parse(JSON.stringify(row.data), BufferJSON.reviver);
        if (type === "app-state-sync-key" && value) {
          value = proto.Message.AppStateSyncKeyData.fromObject(value);
        }
        result[keyId] = value;
      }
      return result;
    },
    set: async (data) => {
      const rowsToWrite = [];
      const idsToDelete = [];

      for (const [type, entries] of Object.entries(data)) {
        for (const [id, value] of Object.entries(entries || {})) {
          const rowId = `key:${type}:${id}`;
          if (value == null) {
            idsToDelete.push(rowId);
          } else {
            rowsToWrite.push({
              id: rowId,
              data: JSON.parse(JSON.stringify(value, BufferJSON.replacer))
            });
          }
        }
      }

      if (idsToDelete.length) {
        const { error } = await supabase.from(TABLE).delete().in("id", idsToDelete);
        if (error) throw error;
      }
      await writeAuthRows(rowsToWrite);
    }
  };

  return {
    state: { creds, keys },
    saveCreds: () => writeAuthRows([{
      id: "creds",
      data: JSON.parse(JSON.stringify(creds, BufferJSON.replacer))
    }])
  };
}

const sentRecently = new Map();
const COOLDOWN_MS = 10 * 60 * 1000;
let reconnectTimer;

async function startBot() {
  console.log("Lade WhatsApp-Anmeldedaten aus Supabase ...");
  const { state, saveCreds } = await useSupabaseAuthState();
  console.log("Lade unterstützte WhatsApp-Version ...");
  const { version } = await fetchLatestBaileysVersion();
  console.log("Starte WhatsApp-Verbindung ...");

  const sock = makeWASocket({
    version,
    auth: state,
    logger: pino({ level: "silent" }),
    browser: ["Scripted Invite Bot", "Chrome", "1.0.0"],
    markOnlineOnConnect: false,
    syncFullHistory: false
  });

  sock.ev.on("creds.update", () => {
    saveCreds().catch((error) => console.error("WhatsApp-Anmeldedaten konnten nicht gespeichert werden:", error.message));
  });

  sock.ev.on("connection.update", ({ connection, lastDisconnect, qr }) => {
    if (qr) {
      latestQr = qr;
      console.log("Neuer WhatsApp-QR-Code erstellt. Geschützte Bildanzeige: /qr");
      qrcode.generate(qr, { small: true });
    }
    if (connection === "connecting") console.log("WhatsApp verbindet ...");
    if (connection === "open") console.log("WhatsApp verbunden. Bot wartet auf", PREFIX);
    if (connection === "close") {
      const statusCode = new Boom(lastDisconnect?.error)?.output?.statusCode;
      if (statusCode !== DisconnectReason.loggedOut) {
        console.log("Verbindung getrennt. Neuer Verbindungsversuch ...");
        clearTimeout(reconnectTimer);
        reconnectTimer = setTimeout(() => {
          startBot().catch((error) => console.error("Neustart fehlgeschlagen:", error));
        }, 5000);
      } else {
        console.error("WhatsApp hat die Sitzung abgemeldet. Bitte neu koppeln.");
      }
    }
  });

  sock.ev.on("messages.upsert", async ({ messages, type }) => {
    if (type !== "notify") return;

    for (const message of messages) {
      if (!message.message || message.key.fromMe) continue;
      const chatId = message.key.remoteJid;
      if (!chatId?.endsWith("@g.us")) continue;

      if (LOG_GROUPS) console.log("Gruppen-Nachricht aus:", chatId);

      const text =
        message.message.conversation ||
        message.message.extendedTextMessage?.text ||
        message.message.imageMessage?.caption ||
        message.message.videoMessage?.caption ||
        "";

      if (text.trim().toLowerCase() !== PREFIX.toLowerCase()) continue;
      if (SOURCE_GROUP_ID && chatId !== SOURCE_GROUP_ID) continue;

      const sender = message.key.participant || message.key.remoteJid;
      if (!sender) continue;

      const now = Date.now();
      const lastSent = sentRecently.get(sender) || 0;
      if (now - lastSent < COOLDOWN_MS) {
        console.log("Einladung wegen Cooldown übersprungen:", sender);
        continue;
      }

      try {
        await sock.sendMessage(sender, {
          text: "Hey! 👋\n\nDu hast dich für Scripted angemeldet!\n\nHier kannst du unserer Scripted-Gruppe beitreten:\n" +
            TARGET_GROUP_LINK +
            "\n\nWir freuen uns auf dich! 🎮"
        });
        sentRecently.set(sender, now);
        console.log("Einladung privat gesendet an:", sender);
      } catch (error) {
        console.error("Private Nachricht konnte nicht gesendet werden:", error?.message || error);
      }
    }
  });
}

startBot().catch((error) => {
  console.error("Bot konnte nicht starten:", error);
  process.exit(1);
});
