import "dotenv/config";
import makeWASocket, {
  DisconnectReason,
  fetchLatestBaileysVersion,
  useMultiFileAuthState
} from "@whiskeysockets/baileys";
import pino from "pino";
import { Boom } from "@hapi/boom";

const PREFIX = process.env.BOT_PREFIX || "!scripted";
const TARGET_GROUP_LINK = process.env.TARGET_GROUP_LINK;
const SOURCE_GROUP_ID = process.env.SOURCE_GROUP_ID || "";
const LOG_GROUPS = (process.env.LOG_GROUPS || "true").toLowerCase() === "true";
const AUTH_DIR = process.env.AUTH_DIR || "auth_info";

if (!TARGET_GROUP_LINK?.startsWith("https://chat.whatsapp.com/")) {
  console.error("Bitte TARGET_GROUP_LINK in .env setzen.");
  process.exit(1);
}

const sentRecently = new Map();
const COOLDOWN_MS = 10 * 60 * 1000;

async function startBot() {
  const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
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

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", ({ connection, lastDisconnect }) => {
    if (connection === "open") console.log("WhatsApp verbunden. Bot wartet auf", PREFIX);
    if (connection === "close") {
      const statusCode = new Boom(lastDisconnect?.error)?.output?.statusCode;
      if (statusCode !== DisconnectReason.loggedOut) {
        console.log("Verbindung getrennt. Neuer Verbindungsversuch ...");
        setTimeout(() => startBot().catch(console.error), 3000);
      } else {
        console.error("WhatsApp hat die Sitzung abgemeldet. Auth-Daten neu koppeln.");
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
