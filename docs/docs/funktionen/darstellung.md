---
id: darstellung
title: Darstellung, Bewegung & Rückmeldung
sidebar_label: Darstellung & Bewegung
---

# Darstellung, Bewegung & Rückmeldung

Die App gibt dir an vielen Stellen kleine Rückmeldungen: Zahlen zählen sich hoch, Listen zeigen
beim Laden schon ihre Umrisse, eine angetippte Zeile wächst zu ihrem Detailfenster, und dein Gerät
gibt bei bestätigten Aktionen ein kurzes Vibrationssignal. Diese Seite erklärt, was du wo siehst —
und wie du es abschalten kannst, wenn dir das zu viel ist.

## Ladezustände: Umrisse statt „Lade…"

Listen, Konten und Diagramme zeigen beim Nachladen **Platzhalter in der Form des kommenden
Inhalts** statt einer Textzeile. Zwei Vorteile:

- Die Seite **springt nicht**, sobald die Daten da sind — der Platz ist schon reserviert.
- Du siehst sofort, *was* gerade lädt (eine Mitgliederliste sieht anders aus als ein Diagramm).

Betroffen sind unter anderem die Konten-Liste in der Kasse, der Saldo-Verlauf-Graph, die
Terminliste, die Historie, die Neuigkeiten und die Statistik-Auswertungen.

:::note Für Screenreader
Jeder Platzhalter meldet sich als Ladezustand an — der Hinweis „Lade…" bleibt also hörbar, auch
wenn er nicht mehr sichtbar auf dem Bildschirm steht.
:::

## Mitzählende Beträge

Ändert sich ein Geldbetrag — dein Kontostand, der Kassenstand, die Geldfluss-Zeilen der Kasse —
zählt die Zahl auf ihren neuen Wert **hoch bzw. herunter**, statt lautlos umzuspringen. Eine
gebuchte Zahlung ist dadurch als Vorgang sichtbar und nicht bloß als anderer Wert.

Beim ersten Öffnen einer Seite wird **nicht** animiert: dein Kontostand zählt nicht bei jedem
Seitenaufruf von Null hoch, sondern steht direkt da.

## Vibration (Haptik)

Auf Geräten mit Vibrationsmotor (Android; iPhones unterstützen das im Browser nicht) gibt es ein
kurzes Signal bei:

| Situation | Signal |
|---|---|
| Aktion erfolgreich (Strafe erfasst, Buchung gespeichert …) | kurzer Doppelpuls |
| Aktion fehlgeschlagen | längerer, deutlich anderer Doppelpuls |
| Auswahl getroffen, Reaktions-Liste geöffnet | ein einzelner kurzer Puls |

Fehler und Erfolg fühlen sich bewusst **unterschiedlich** an, damit du am Gerät merkst, ob etwas
geklappt hat, ohne auf den Bildschirm zu schauen — praktisch, wenn das Tablet auf der Bahn liegt.

## Bewegte Übergänge

- **Angetippte Zeile → Detailfenster**: Tippst du im Mitglieder-Bereich eine Zeile an, wächst diese
  Zeile in das aufklappende Aktionsfenster hinein, statt hart umzuschalten. Browser ohne
  Unterstützung dafür (aktuell u. a. Firefox) zeigen einfach das gewohnte Aufklappen — es fehlt
  nichts, es bewegt sich nur weniger.
- **Seitenwechsel** blenden kurz ein, statt zu springen.

## Alles ruhiger stellen

Es gibt zwei Schalter, und sie greifen unterschiedlich weit:

### 1. Systemeinstellung „Bewegung reduzieren"

Stellst du in deinem Betriebssystem (iOS: *Bedienungshilfen → Bewegung → Bewegung reduzieren*,
Android: *Bedienungshilfen → Animationen entfernen*, Windows/macOS entsprechend) die Reduzierung
von Bewegung ein, hält die App **jede** Animation an: keine Seitenübergänge, kein Flimmern der
Ladeplatzhalter, keine mitzählenden Beträge, keine Konfetti.

Die App fragt diese Einstellung **live** ab — du musst sie nicht neu starten.

### 2. „🎉 Feier-Effekte" im Profil

Unter **Profil → Einstellungen → 🎉 Feier-Effekte** schaltest du die Zugaben ab:

- Konfetti und Ton bei **König** und **Alle Neune**
- **Vibration**
- **mitzählende Beträge**

Ladeplatzhalter bleiben dabei erhalten — sie sind kein Effekt, sondern zeigen an, dass etwas lädt.
