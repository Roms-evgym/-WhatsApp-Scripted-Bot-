import "dotenv/config";
import http from "node:http";
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

// Render Web Services benötigen einen HTTP-Port. Dieser Endpunkt ist nur ein Health Check.
const server = http.createServer((req, res) => {
  if (req.url === "/health" || req.url === "/") {
    res.writeHead(200, { "content-type": "text/plain; charset=utf-8" });
    res.end("WhatsApp Scripted Bot is running");
    return;
  }
  res.writeHead(404);
  res.end("Not found");
});
server.listen(Number(process.env.PORT) || 3000, "0.0.0.0", () => {
  console.log("Health-Check-Server gestartet.");
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
  const { state, saveCreds } = await useSupabaseAuthState();
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    version,
    auth: state,
    logger: pino({ level: "silent" }),
    printQRInTerminal: true,
    browser: ["Scripted Invite Bot", "Chrome", "1.0.0"],
    markOnlineOnConnect: false,
    syncFullHistory: false
  });

  sock.ev.on("creds.update", () => {
    saveCreds().catch((error) => console.error("WhatsApp-Anmeldedaten konnten nicht gespeichert werden:", error.message));
  });

  sock.ev.on("connection.update", ({ connection, lastDisconnect }) => {
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
