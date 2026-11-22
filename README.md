# WhatsApp Scripted Bot

Der Bot erkennt `!scripted` in einer festgelegten WhatsApp-Gruppe und schickt dem Absender den Einladungslink **privat**.

## Hosting

Der Bot kann als Render Web Service gestartet werden. Ein kleiner HTTP-Health-Check läuft auf dem von Render bereitgestellten Port. Das macht den Dienst erreichbar, verhindert aber nicht, dass ein kostenloser Render-Dienst bei Inaktivität einschläft.

Die WhatsApp-Sitzung wird in Supabase in der Tabelle `public.whatsapp_auth` gespeichert. Dadurch gehen die Anmeldedaten bei einem normalen Neustart nicht verloren.

## Render-Einstellungen

- Runtime: Node
- Build Command: `npm install`
- Start Command: `npm start`
- Branch: `main`
- Root Directory: leer lassen

## Render-Umgebungsvariablen

Unter Render > Service > Environment eintragen:

- `BOT_PREFIX` = `!scripted`
- `TARGET_GROUP_LINK` = dein WhatsApp-Gruppenlink
- `SOURCE_GROUP_ID` = Gruppen-ID der Quellgruppe (zunächst leer lassen, falls noch unbekannt)
- `LOG_GROUPS` = `true`
- `SUPABASE_URL` = Project URL aus Supabase
- `SUPABASE_SECRET_KEY` = serverseitiger Secret Key aus Supabase

**Wichtig:** Den Supabase Secret Key niemals in GitHub, Screenshots oder Chats veröffentlichen. Er gehört ausschließlich als geheime Umgebungsvariable in Render. Die Tabelle `whatsapp_auth` muss bereits im Supabase-Projekt existieren.

## WhatsApp verbinden

1. Render deployen und die Logs öffnen.
2. Beim ersten Start erscheint ein QR-Code in den Logs.
3. In WhatsApp > Verknüpfte Geräte > Gerät hinzufügen scannen.
4. Nach erfolgreicher Verbindung erscheint eine Bestätigung in den Logs.
5. Eine Nachricht in der Quellgruppe senden und die Gruppen-ID aus den Logs übernehmen.
6. Diese ID als `SOURCE_GROUP_ID` in Render eintragen und erneut deployen.

## Lokal starten

1. Repository herunterladen/klonen.
2. `npm install`
3. `.env.example` in `.env` kopieren und Werte ergänzen.
4. `npm start` ausführen und den QR-Code scannen.

## Sicherheit und Hinweise

- Niemals QR-Codes oder WhatsApp-Sitzungsdaten veröffentlichen.
- Den Bot möglichst mit einem separaten WhatsApp-Konto betreiben.
- Baileys ist eine inoffizielle WhatsApp-Web-Bibliothek, keine offizielle WhatsApp Business API. WhatsApp kann die Nutzung einschränken oder das Konto sperren. Nutzung auf eigenes Risiko.
- Der Bot fügt niemanden automatisch hinzu. Er sendet nur den Gruppenlink privat; der Empfänger tritt selbst bei.
- Der kostenlose Render-Tarif garantiert keinen dauerhaft verbundenen Bot. Supabase speichert die Sitzung, hält Render aber nicht wach.
