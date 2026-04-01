[English](README.md) | [한국어](README.ko.md) | [日本語](README.ja.md) | [简体中文](README.zh-cn.md) | [繁體中文](README.zh-tw.md) | [Español](README.es.md) | [Français](README.fr.md) | [Deutsch](README.de.md) | [Русский](README.ru.md) | [Português (Brasil)](README.pt-br.md) | [हिन्दी](README.hi.md) | [العربية](README.ar.md)

---

# AutoAntigravity

Eine Antigravity-Erweiterung, die die Funktionen **Auto Accept**, **Telegram** And **Ralph Loop** in einem einzigen Plugin zusammenfasst.

---

## ✨ Hauptfunktionen

### ⚡ Auto Accept
Akzeptiert automatisch vom Antigravity-Agenten vorgeschlagene **Spezifische Dateibearbeitungen, Terminal-Befehle und Berechtigungsanfragen**.

- **CDP (Chrome DevTools Protocol) + MutationObserver**: Erkennt DOM-Änderungen sofort → Klickt Schaltflächen automatisch.
- **VS Code Commands API Polling**: Führt `acceptAgentStep`, `terminalCommand.run` usw. automatisch aus.
- **Erkannte Schaltflächen (Buttons)**: `Run`, `Accept`, `Always Allow`, `Allow`, `Retry`, `Continue`
- **Unterstützt benutzerdefinierte Schaltflächentexte** (Mehrsprachigkeit)

### 📱 Telegram Bot-Integration
Überwachen und verwalten Sie Arbeitsabläufe mit einem Telegram-Bot.

- **Einfache UI-Konfiguration**: Registrieren Sie Bot-Token und Chat-ID direkt über das Seitenleisten-Einstellungsfeld von AutoAntigravity.
- **Sichere Speicherung**: Verwaltet Bot-Einstellungen sicher über die `.env`-Datei.
- **Benachrichtigungen & mehr**: Die Grundlage für wichtige Erweiterungsfunktionen wie die Überwachung von Agentenaufgaben.

### 🔄 Ralph Loop
Ein **iteratives, autonomes Agentenausführungssystem**, das auf `PRD.md` basiert.

- **Aufgaben-Dateibasiert**: Verwaltet Aufgaben im Checkbox-Format (`- [ ]`) in der `PRD.md`.
- **Unterstützung für parallele Aufgaben**: Führt Aufgaben unabhängig voneinander und mithilfe von Git-Worktrees über das Tag `#parallel` parallel aus und führt sie automatisch zusammen.
- **Fortschrittsverfolgung**: Speichert das Ergebnis jeder Iteration per Append-only in der `progress.txt`.
- **Auto Commit**: Automatischer Commit in Git nach jeder Iteration.
- **Kontext aktualisieren**: Ein neuer Session-Neustart bei jeder Iteration überwindet die Limitierungen des Kontextfensters.
- **Schutzmechanismen**: Begrenzt die maximale Anzahl der Iterationen.

---

## 🛠 Installation

### 1. Debug-Modus aktivieren (Erforderlich)
Fügen Sie beim Starten von Antigravity folgendes Flag hinzu:

```
--remote-debugging-port=9559
```

**Windows**: Fügen Sie es der "Verknüpfung → Eigenschaften → Ziel" hinzu.  
**Mac**: `open -a "Antigravity" --args --remote-debugging-port=9559`  
**Linux**: Tragen Sie es in die Exec-Zeile Ihrer `.desktop`-Datei ein.

> 💡 Ist der Port nach der Erstinstallation beim Start nicht geöffnet, wird eine Info zum automatischen Patching angezeigt.

### 2. Erweiterung installieren
Suchen Sie im **Erweiterungspanel (Extensions Panel)** von Antigravity nach `AutoAntigravity`, um es direkt zu installieren.
- [Open VSX Registry: AutoAntigravity Webseite](https://open-vsx.org/extension/shinepcsg/AutoAntigravity)

---

## 📖 Nutzung

### Auto Accept
- **Umschalten**: Klicken Sie auf der Statusleiste auf `⚡ AutoAccept: ON` / `✕ AutoAccept: OFF`
- **Befehl**: `Strg+Umschalt+P` → `AutoAntigravity: Toggle Auto Accept`

### 📱 Telegram-Bot-Einstellungen
Nutzen Sie den Telegram-Bot zur Erfassung und Überwachung.

1. **Bot Erstellen**: Erstellen Sie einen Bot mit Hilfe von `@BotFather` und kopieren Sie das **Bot Token**.
2. **Chat-ID Beziehen**: Ermitteln Sie Ihre eigene Chat-ID, indem Sie `@msid_bot` abonnieren.
3. **Einstellungen Vornehmen**: Klicken Sie links im Menü der Aktivitätsleiste auf das **AutoAntigravity Symbol**.
4. Über das **Telegram-Integrations-Menü** können Sie Token und Chat-ID einfügen.
   > 💡 *Sämtliche Eingabedaten werden als geschützte Variante automatisch in der `.env`-Root-Datei hinterlegt.*

### 🔄 Ralph Loop
1. **Aufgaben-Datei Erstellen**: Erstellen Sie die Datei `PRD.md` in Ihrem Workspace.
   ```markdown
   - [ ] Basis-API einrichten
   - [ ] Datenbank überarbeiten
   - [ ] Unit-Tests anfertigen
   ```
2. **Starten**: `Strg+Umschalt+P` → `AutoAntigravity: Start Ralph Loop`
3. **Stoppen**: `Strg+Umschalt+P` → `AutoAntigravity: Stop Ralph Loop`

### `/write-prd` Workflow-Registrierung

Mit dem Slash-Befehl `/write-prd` erstellt der KI-Agent automatisch eine PRD und wendet sie sofort auf den Ralph Loop an.

Klicken Sie auf das **AutoAntigravity-Symbol** in der linken Aktivitätsleiste, um das Seitenpaneel zu öffnen,  
und klicken Sie dann auf die Schaltfläche **📋 write-prd (Workspace)** im Einstellungsbereich, um den Workflow automatisch im aktuellen Projekt zu installieren.

Geben Sie nach der Installation im Chat den Befehl `/write-prd` ein.

---

### 🔀 Konfiguration Paralleler Aufgaben

Ralph Loop ermöglicht es, Aufgaben mit einem entsprechenden `#parallel` Tag gesondert in unabhängigen Worktrees auszuführen.

#### Aktivierung

Standardmäßig ist die parallele Ausführung aktiv. Sie kann separat angepasst werden:

| Einstellung | Standardwert | Beschreibung |
|---|---|---|
| `autoAntigravity.ralphLoop.enableParallel` | `true` | parallele Ausführung aktiv |
| `autoAntigravity.ralphLoop.maxParallelTasks` | `3` | Gleichzeitige Paralleltasks (2~8) |

#### Wie man Parallele Tasks kennzeichnet

```markdown
### Step 2: Unabhängige Ausführungen definieren
- [ ] #parallel Task 2-1: Nutzermodul implementieren (src/user.js)
- [ ] #parallel Task 2-2: Produktmodul implementieren (src/product.js)
- [ ] #parallel Task 2-3: Ordermodul implementieren (src/order.js)
- [ ] Prüfung: Gesamtes Projektverhalten definieren
```

#### Hinweise zur Parallel-Entwicklung

- Eine Verkettung von **mehreren `#parallel` Einträgen hintereinander** definiert stets eine isolierte Parallelgruppe.
- **Nur anwenden auf Dateien unterschiedlicher Pfade.** (Gleichzeitiges paralleles Ändern identischer Dateien erzwingt Merge-Konflikte)
- **Bitte beachten:** Vermeiden Sie es, abhängige Voraufgaben an dieser Stelle auszuwählen.

#### Die Arbeitsweise

1. Ralph Loop erzeugt zunächst für einzelne abhängige Tasks einen autonomen Git-Worktree.
2. Mehrere voneinander getrennte KI Agenten arbeiten den Abschnitt komplett synchron und isoliert voneinander ab.
3. Sämtliche erledigte Parallelaufgaben werden gemeinsam in den System-Branch integriert.
4. Ein genereller KI-Agent behebt automatisch etwaige Konflikte.

---

## ⚙ Einstellungen

| Einstellung | Standard | Details |
|---|---|---|
| `autoAntigravity.autoAccept.pollInterval` | `500` | Abfrage-Polling-Zeit |
| `autoAntigravity.autoAccept.cdpPort` | `9559` | Standard CDP Debug Port |
| `autoAntigravity.autoAccept.customButtonTexts` | `[]` | Zusätzliche Kriterien für Text |
| `autoAntigravity.ralphLoop.maxIterations` | `50` | Maximales Iterationslimit |
| `autoAntigravity.ralphLoop.taskFile` | `PRD.md` | Standard Dateibereich für Dokumentation |
| `autoAntigravity.ralphLoop.progressFile` | `progress.txt` | Fortschritt |
| `autoAntigravity.ralphLoop.autoCommit` | `true` | Automatischer Commit in der Branch |
| `autoAntigravity.ralphLoop.autoDeleteBranch` | `true` | Automatisches Verwerfen der Standard-Taskbranch |
| `autoAntigravity.ralphLoop.iterationDelayMs` | `1500` | Abweichungen im Iterations-Limit |
| `autoAntigravity.ralphLoop.allowPrdModification` | `false` | Modifikation der Agent-Struktur |
| `autoAntigravity.ralphLoop.autoStart` | `true` | Automatischer Start bei Dateiänderung |
| `autoAntigravity.ralphLoop.enableParallel` | `true` | Tag-Klassifikation aktiv |
| `autoAntigravity.ralphLoop.maxParallelTasks` | `3` | Beschränkung maximaler Arbeitsbereiche |

---

## 🔒 Sicherheitshinweise

- Die Steuerung erfolgt ausschließlich in den lokalen Modellen.
- Keine automatischen Aktivitäten über den standardisierten Web-View hinaus („Webview Guard“).
- Der CDP Debug läuft komplett über „localhost“.
- Endlosstrukturen werden streng bei Ausführung der Limits automatisch eingefroren.

---

## 📝 Lizenz

MIT License — [LICENSE](LICENSE)

## 🙏 Credits
Chansun Park (shinepcs@gmail.com)
