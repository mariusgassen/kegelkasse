---
sidebar_position: 15
---

# 📱 App-Icon mit Vereinslogo

Admins können das **Vereinslogo als App-Icon** für alle Mitglieder einschalten. Wer die App dann auf
dem Handy oder Tablet installiert, hat statt des Kegelkasse-Icons das Logo des Vereins auf dem
Home-Bildschirm.

## Einschalten

**Verein → Einstellungen → 📱 App-Icon**

1. Schalter **„Vereinslogo als App-Icon für alle Mitglieder"** einschalten.
2. Einen **Hintergrund** wählen. Die vier Varianten kommen aus der Vereinsfarbpalette:
   - **Dunkel** – der Hintergrund der App (bzw. die eingestellte Hintergrundfarbe)
   - **Hell** – das helle Gegenstück dazu, passend für helle Home-Bildschirme
   - **Grundfarbe** – die Primärfarbe des Vereins
   - **Akzentfarbe** – die Sekundärfarbe des Vereins

Die Vorschaubilder sind genau die Icons, die die Geräte bekommen. Änderungen werden sofort
gespeichert. Ändert sich später das Logo oder die Vereinsfarbe, wird das Icon automatisch neu
erzeugt.

:::tip Welches Logo-Format?
Am besten ein **PNG mit transparentem Hintergrund**, ungefähr quadratisch. JPEG und WebP gehen auch.
**SVG-Logos** lassen sich nicht in ein App-Icon umwandeln — dann zeigt das Icon die Initialen des
Vereins in der Vereinsfarbe, bis ein PNG hochgeladen ist. Ohne Logo gilt dasselbe.
:::

## Auf welchen Geräten?

| Gerät | Verhalten |
|---|---|
| **Android** (Chrome, Firefox, Samsung Internet) | Neue Installationen bekommen das Vereinslogo sofort. Bereits installierte Apps übernehmen es von selbst, das kann bis zu einem Tag dauern. |
| **iPhone / iPad** (Safari → „Zum Home-Bildschirm") | Neue Installationen bekommen das Vereinslogo sofort. iOS übernimmt Icons **nur beim Hinzufügen**: wer die App schon installiert hat, entfernt sie einmal vom Home-Bildschirm und fügt sie neu hinzu. |
| **Desktop** (Chrome, Edge) | Wie Android. |

Die Icons werden als PNG in allen nötigen Größen bereitgestellt (192 und 512 Pixel, eine
„maskable"-Version für die runden bzw. abgerundeten Icon-Formen von Android und 180 Pixel für iOS),
weil Android-Browser keine SVG-Icons verwenden.

## Ausschalten

Schalter wieder aus: neue Installationen bekommen das Kegelkasse-Icon, und Android stellt bereits
installierte Apps beim nächsten Abgleich wieder auf das Standard-Icon um.
