---
id: abende
title: Abende
sidebar_label: Abende
---

# Abende

Ein **Abend** ist der zentrale Container für einen Kegel-Spieltag. Alle Spiele, Strafen und Getränke eines Abends werden hier zusammengefasst.

## Abend anlegen

Abende werden immer über die **Termine-Seite** gestartet – kein Ad-hoc-Start mehr.

1. Erstelle zunächst einen Termin unter **Termine** → **+ Termin**
2. Starte den Abend am Abendtag mit **▶ Abend starten**

:::note
Nur **Admins** können Abende starten.
:::

## Live-Modus 🔴

Läuft ein Abend, öffnet die App direkt in den **Live-Modus** — den ersten Reiter (🔴 **Live**)
im Abend-Bereich. Er fasst das Geschehen des Abends auf einen Blick zusammen und wird über die
bestehende Echtzeit-Aktualisierung (SSE + Polling) automatisch frisch gehalten:

- **Schnellerfassung als Hauptansicht (⚡)**: Direkt im Live-Reiter als prominente Aktionskarte sowie dauerhaft als hervorgehobener **⚡ Schnellerfassung**-Knopf in der Abend-Reiterleiste erreichbar.
- **Warnung bei fehlendem Spiel & Team-Auswahl direkt zum Start**: Läuft noch kein Spiel, weist eine auffällige Warnkarte direkt auf den Spielstart hin. Zu Abendbeginn (beim Starten auf der **Termine**-Seite mit Vorlagen oder direkt oben im Live-Modus, solange noch Teams/Zuweisungen fehlen oder kein Spiel gestartet wurde) lassen sich Teams direkt per Vorlage, Zufalls-Mix oder Antippen je Spieler festlegen.
- **Anzeigetafel**: das gerade laufende Spiel sowie – nur bei eingeschalteter Wurf-Erfassung –
  wer am Zug ist, wer als Nächstes wirft, der letzte Wurf und der **Spielstand** als Balken pro
  Spieler bzw. Team (Holz).
- **Kennzahlen-Zeile**: Vier einheitliche Kennzahl-Kacheln (Straf-Summe des Abends, Bierrunden, Schnapsrunden, beendete Spiele) sowie darunter eine eigene Verlaufs-Kurve, wie die Straf-Summe über den Abend gewachsen ist.
- **Strafen heute & Häufigkeiten (`×N`)**: Rangliste der anwesenden Spieler nach ihren Strafen, mit Balken auf gemeinsamer Skala (Zeilen gleiten bei Platzwechseln an ihren neuen Platz), sowie eine kompakte Übersicht der heute gebuchten **Strafenarten mit Anzahl (`×N`)**.
- **Schnellaktionen** (daumengroß): **Strafe** / **Runde** öffnen die Schnellerfassung,
  **Highlight** springt zum Highlights-Reiter, **Spiele** zum Spiele-Reiter.
- **Vollständiger Verlauf-Ticker mit Spiel-Markern**: Alle Strafen, Getränkerunden, Highlights, **🎳 Alle Neune** sowie **farbige Spiel-Start- (`▶`) und Spiel-Ende-Trenner (`🏁`)** chronologisch (neueste zuerst) — Ereignisse während eines Spiels tragen links denselben farbigen Spiel-Streifen wie im Protokoll.

:::note
Im Ticker landen von den Würfen nur die **Alle Neune** — ein Abend erzeugt hunderte Würfe, der
volle Wurf-Strom würde Strafen, Getränke und Highlights binnen eines Spiels aus dem Verlauf
drängen. Der laufende Wurf-Stand steht in der Anzeigetafel. Ist die Wurf-Erfassung im Verein
abgeschaltet, erscheinen auch die Alle-Neune-Einträge nicht.
:::

Beim Beenden des Abends verschwindet der Live-Reiter wieder, und der Abend-Bereich zeigt wie
gewohnt zuerst das Protokoll.

### Live-Insel 🏝️ & Schnellerfassungs-Cockpit

Am oberen Bildschirmrand sitzt durchgehend eine **Live-Insel** (auch über der Schnellerfassung sichtbar):

- **Laufender Abend & Spiel-Timer**: zeigt die laufende Spielzeit (`m:ss`), solange ein Spiel läuft; läuft bei geöffnetem Abend gerade **kein Spiel**, zeigt die Insel kompakt ein ruhiges, gelb abgesetztes **„Pause“** (mit abgedunkeltem Kegel-Symbol, statt rotem Alarm) damit sofort auffällt, dass noch kein Spiel läuft, ohne die Header-Buttons zu berühren. Langes Drücken klappt Lokal, aktuelles Spiel / Spieler am Zug sowie Kasse, Bier- und Schnapsrunden auf – bzw. direkt den Knopf zum Spielstart; Antippen springt direkt zum Abend.
- **Im Ruhezustand (kein aktiver Abend)**: statt einer leeren Notch zeigt die Insel den **nächsten geplanten Termin** (Datum/Uhrzeit, farbig nach deinem RSVP-Status — aufgeklappt mit **1-Tipp-Zu-/Absage** und deinem aktuellen Kassenstand), fällt ohne kommenden Termin direkt auf deine **eigenen Kontodaten** zurück (kompakter Saldo in €/–, aufgeklappt inkl. Strafen, Zahlungen sowie Direktzugriff auf Mein Konto & Kasse; für Konten ohne Stammspieler-Verknüpfung kompakt **„Konto“** mit Profil-Direktzugriff).
- **Schnellerfassungs-Ereignisse**: beim Buchen von Strafen und Getränkerunden, beim Stornieren sowie beim Starten/Beenden eines Spiels zeigt die Insel sofort eine kurze Live-Quittung (z. B. Strafe, Spieler und Betrag).
- **König & Alle Neune**: kurze Feier-Einblendung direkt in der Insel.
- **Foto-Uploads & Offline-Warteschlange**: zeigt laufende Datei-Uploads sowie ausstehende Offline-Buchungen (mit **Jetzt synchronisieren**-Knopf, sobald wieder Verbindung besteht).
- **Zahlungsanfragen**: Kassenwarte können eingehende Zahlungsanfragen direkt in der aufgeklappten Insel bestätigen oder ablehnen.
- **Zweistufige Kopfzeile der Schnellerfassung**: Zeile 1 hält die Mitte für die Live-Insel frei (links **✕** Schließen + Modus-Badge, rechts die primäre Spiel-Aktion **🏁 Spiel beenden** bzw. **▶ Spiel starten**); Zeile 2 bündelt das **Spiel- & Wurf-Cockpit** (aktuelles Spiel, Zug-Reihenfolge mit Team-Farben, Wurf-Steuerung, Live-Würfe mit Kegelbild-Heatmap sowie das Aufklapp-Panel zum Spiel-Starten/Beenden).
- **Smartphone-Layout der Schnellerfassung**: auf dem Smartphone (`< lg`) zeigt die Schnellerfassung einen Umschalter **⚡ Buchen** / **📊 Stand**; unter **Buchen** sitzt oben das zweispaltige Spieler-Raster (direkt erreichbar, bevor eine Strafe getippt wird) und darunter die zweispaltigen Getränke- und Strafen-Buttons.

## Highlights erfassen

Unter dem Spieler-/Team-Bereich gibt es einen **✨ Highlights**-Abschnitt:

- Trage denkwürdige Momente des Abends als Freitext ein (z. B. *„Schuh geworfen"*, *„Kugel gegen die Heizung"*)
- Highlights werden mit dem Abend gespeichert und erscheinen beim nächsten Öffnen
- Jeder Spieler des Abends kann Highlights eintragen und über das **⋮**-Menü der Highlight-Karte löschen

## Spieler verwalten

### Spieler hinzufügen

- Aus der **Stammspieler-Liste**: Wähle einen bekannten Spieler für automatische Statistikverknüpfung
- Als **Gast**: Gib einen beliebigen Namen ein

### Spieler entfernen

Tippe auf einen Spieler → **Entfernen**

:::caution
Das Entfernen eines Spielers löscht alle zugehörigen Strafen und Spielzuweisungen für diesen Abend.
:::

## Teams bilden

### Team erstellen

1. Tippe auf **Teams** → **Team hinzufügen**
2. Gib einen Namen ein
3. Weise Spieler zu

### Teams aus Vorlagen laden

Falls Vereins-Teams hinterlegt sind:

1. Tippe auf **Teams** → **Aus Vorlagen**
2. Wähle die gewünschten Vereinsteams
3. Die Teams werden mit Namen angelegt

### Team auflösen

Tippe auf ein Team → **Löschen**

## Abend schließen & archivieren

Wenn der Abend beendet ist:

1. Tippe auf das **Menü** des Abends
2. Wähle **Abend schließen**

Der Abend wird in die **Historie** verschoben und kann nicht mehr bearbeitet werden (außer durch Wiedereröffnen).

Beim Beenden kannst du den **Endzeitpunkt** direkt setzen — vorausgefüllt mit dem zuletzt gespeicherten Endzeitpunkt (bzw. jetzt, falls noch keiner existiert), **in deiner lokalen Uhrzeit**. Das ist z. B. hilfreich, wenn du das Beenden am eigentlichen Kegelabend vergessen hast und den korrekten Zeitpunkt nachträglich einträgst. Alle automatisch berechneten **Abwesenheitsstrafen** verwenden diesen Endzeitpunkt statt des Bearbeitungszeitpunkts, damit sie im Strafenprotokoll chronologisch korrekt einsortiert sind.

### Abend wiedereröffnen

In der **Historie**:

1. Wähle den Abend
2. Tippe auf **Wiedereröffnen**

Der gespeicherte Endzeitpunkt bleibt beim Wiedereröffnen erhalten — beim erneuten Beenden ist er vorausgefüllt und kann unverändert übernommen oder auf einen neuen Zeitpunkt gesetzt werden.

## Echtzeit-Updates

Alle geöffneten Abende werden alle **30 Sekunden** automatisch aktualisiert. Änderungen anderer Benutzer erscheinen ohne manuellen Reload.

## Abend löschen

Ein Abend kann unter **Historie → Abend → Löschen** dauerhaft gelöscht werden.

:::danger
Das Löschen eines Abends ist endgültig und entfernt alle Spiele, Strafen und Getränke dieses Abends.
:::

## Live-Insel

Solange ein Abend läuft, zeigt die App oben eine kleine „Dynamic Island“: kompakt 🎳 und die laufende Spielzeit bzw. Strafensumme. Gedrückt halten klappt sie auf (Lokal, laufendes Spiel — bei aktiver Wurferfassung auch mit dem Spieler am Zug —, Strafensumme sowie Bier- und Schnapsrunden, oder einen direkten Spiel-Start-Knopf, falls noch kein Spiel läuft); ein kurzer Tipp öffnet den Abend. Außerhalb eines Abends zeigt sie den nächsten geplanten Termin (mit 1-Tipp-Zu-/Absage im aufgeklappten Zustand) oder deinen persönlichen Kassenstand; auch App-Updates und Hinweise auf neue Versionen erscheinen dort. Sie ist nur innerhalb der App sichtbar, solange diese geöffnet ist.
