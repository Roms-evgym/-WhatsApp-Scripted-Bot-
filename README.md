# WhatsApp Scripted Bot

Der Bot erkennt `!scripted` in einer festgelegten WhatsApp-Gruppe und schickt dem Absender den Einladungslink **privat**.

## Wichtig: kostenloses Hosting

GitHub speichert den Code, führt einen WhatsApp-Web-Bot aber nicht dauerhaft aus. GitHub Pages ist dafür ungeeignet; GitHub Actions sind keine dauerhafte Laufzeit für eine verbundene WhatsApp-Web-Sitzung. Für zuverlässigen Betrieb braucht der Bot einen dauerhaft laufenden Rechner oder einen Hosting-Anbieter, dessen kostenlose Stufe einen dauerhaften Prozess erlaubt. Kostenlose Hosting-Angebote können schlafen gehen oder ihre Bedingungen ändern.

## Voraussetzungen

- Node.js 20 oder neuer
- Ein WhatsApp-Konto, das du mit dem Bot verbindest
- Ein dauerhaft laufender Rechner/Server für den Betrieb

## Lokal starten

1. Repository herunterladen/klonen.
2. `npm install`
3. `.env.example` in `.env` kopieren.
4. `TARGET_GROUP_LINK` prüfen.
5. `npm start` ausführen und den QR-Code mit WhatsApp > Verknüpfte Geräte scannen.
6. Schreibe in die Quellgruppe eine Nachricht. Die Gruppen-ID wird im Terminal ausgegeben.
7. Trage diese ID als `SOURCE_GROUP_ID` in `.env` ein und starte den Bot neu.

Wenn `SOURCE_GROUP_ID` leer bleibt, reagiert der Bot auf `!scripted` in jeder Gruppe, in der das verbundene Konto Nachrichten empfangen kann. Daher wird empfohlen, die ID einzutragen.

## Konfiguration

- `BOT_PREFIX`: Standard `!scripted`
- `TARGET_GROUP_LINK`: Einladungslink der Zielgruppe
- `SOURCE_GROUP_ID`: ID der Gruppe, in der der Befehl gelten soll
- `LOG_GROUPS`: Gruppen-IDs im Terminal anzeigen (`true`/ `false`)

Der Bot sendet pro Absender höchstens eine Einladung innerhalb von 10 Minuten.

## Sicherheit

- **Niemals** den Ordner `auth_info`, QR-Codes oder WhatsApp-Sitzungsdaten veröffentlichen oder committen.
- Den Bot möglichst mit einem separaten WhatsApp-Konto betreiben.
- Baileys ist eine inoffizielle WhatsApp-Web-Bibliothek, keine offizielle WhatsApp Business API. WhatsApp kann die Nutzung einschränken oder das Konto sperren. Nutzung auf eigenes Risiko.
- Der Bot fügt niemanden automatisch hinzu. Er sendet nur den Gruppenlink privat; der Empfänger tritt selbst bei.
