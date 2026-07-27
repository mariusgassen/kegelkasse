---
sidebar_position: 14
---

# 📺 TV-Scoreboard

Eine Vollbild-Anzeige für einen Fernseher oder Beamer an der Kegelbahn. Sie zeigt den laufenden
Abend live an — wer am Zug ist, die Würfe des aktuellen Spiels, die Strafen des Abends, die
Getränkezähler und das letzte Highlight.

Die Ansicht ist **rein lesend**: auf dem TV lässt sich nichts eintragen, löschen oder ändern.

## Einrichten

1. **Verein → Einstellungen → 📺 TV-Scoreboard** öffnen (nur Admins)
2. Den Link kopieren — er sieht aus wie `https://deine-kegelkasse.de/tv/<zufälliger-code>`
3. Den Link auf dem Fernseher oder Beamer im Browser öffnen (bzw. vom Handy dorthin casten)

**Ein Login ist auf dem TV-Gerät nicht nötig.** Der zufällige Code im Link ist der Zugang — genau
wie beim [Kalender-Abo](./termine.md). Solange der Link geheim bleibt, kommt niemand sonst an die
Anzeige.

:::tip
Am besten den Browser auf dem TV in den Vollbild-Modus schalten und den Bildschirmschoner
deaktivieren. Die Seite aktualisiert sich selbst und muss nie neu geladen werden.
:::

## Was angezeigt wird

| Bereich | Inhalt |
|---------|--------|
| Kopfzeile | Vereinslogo, Vereinsname, Datum und Lokal des Abends, aktueller König 👑 |
| Hauptfeld | Laufendes Spiel: **wer am Zug ist** (größte Schrift auf dem Schirm), wer als Nächstes dran ist, und die letzten Würfe |
| Kennzahlen | Strafensumme des Abends, Bier- und Schnapsrunden, beendete Spiele |
| Wechselnde Anzeige | Rotiert alle 12 Sekunden zwischen **Strafen heute**, **Getränke** und dem **letzten Highlight-Foto** |

Bereiche ohne Inhalt werden übersprungen: Sind noch keine Strafen eingetragen, taucht die
Strafen-Anzeige gar nicht erst auf.

Läuft gerade kein Abend, zeigt der Bildschirm einen Ruhezustand — er springt automatisch an, sobald
ein Kegelabend gestartet wird.

## Feier-Momente

Wird jemand **König** oder wirft jemand **Alle Neune**, übernimmt eine Vollbild-Feier den Schirm —
mit Konfetti und Sound, wie in der App ([Feier-Effekte](./darstellung.md)). Nach ein paar Sekunden
kehrt die normale Anzeige zurück.

Momente, die schon vorbei waren, als der Fernseher eingeschaltet wurde, werden **nicht** nachgefeiert.

## Wurf-Erfassung aus?

Hat der Verein die [Kamera-Wurf-Erfassung](./spiele.md) deaktiviert, blendet das Scoreboard die
Wurf-Historie aus. Wer am Zug ist, Strafen, Getränke und Highlights bleiben unverändert sichtbar.

## Link zurückziehen

Über **Neuen Link erzeugen** wird ein neuer Code erstellt. Der alte Link funktioniert danach nicht
mehr — praktisch, wenn er versehentlich weitergegeben wurde. Auf dem TV muss dann der neue Link
geöffnet werden.
