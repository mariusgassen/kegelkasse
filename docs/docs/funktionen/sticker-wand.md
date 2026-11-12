---
id: sticker-wand
title: Sticker-Wand
sidebar_label: Sticker-Wand
---

# Sticker-Wand

Wir kleben auf Reisen Sticker. Auf der **Sticker-Wand** (Verein → 🏷️ Sticker) postet jedes Mitglied ein Foto davon, samt Ort. Alle sehen die Beiträge im **Feed** und die Orte auf einer **Weltkarte**.

## Sticker posten

Tippe auf **+ Sticker posten**. Zuerst kommt das **Foto** (Pflicht, ohne Foto kein Sticker): Die große Fläche öffnet die Fotomediathek deines Geräts, dort kannst du **mehrere Fotos auf einmal** auswählen (bis zu 10). Danach siehst du das gewählte Foto groß, darunter eine nummerierte Leiste aller Fotos. Mit **Bearbeiten** drehst du ein Foto, schneidest es zu (Original, 1:1, 4:3, 3:4, 16:9), zoomst und verschiebst den Ausschnitt per Ziehen; **Entfernen** nimmt es wieder heraus. Mit den Pfeilen ‹ › änderst du die **Reihenfolge**; das erste Foto ist das Titelbild.

Hast du mehrere Fotos gewählt, entscheidest du: **Ein Post** (alle Fotos in einem Beitrag) oder **Je Foto ein Post** – dann entsteht aus einer einzigen Auswahl für jedes Foto ein eigener Sticker, mit Ort, Pin und Datum aus den Daten des jeweiligen Fotos. Beim Durchklicken der Bilder siehst du direkt auf dem Vorschaubild und in den Feldern darunter den ermittelten Ort, Pin und das Datum des aktuell gewählten Fotos und kannst sie je Foto anpassen; hat ein einzelnes Foto keine eigenen GPS-Daten, erscheint für dieses Foto die Karte zum Setzen des Pins. So musst du nicht mehrfach durch die Fotomediathek scrollen.

Danach werden die übrigen Felder – wenn die Fotos die Daten enthalten – automatisch vorbelegt:

- **Ort** (Pflicht), z. B. „Lissabon, Portugal": aus der GPS-Position des Fotos als „Stadt, Land" ermittelt (über OpenStreetMap). Du kannst ihn jederzeit ändern; was du selbst getippt hast, wird nie überschrieben.
- **Position auf der Karte** (Pflicht): aus den GPS-Daten des Fotos. Die Karte bleibt eingeklappt – mit **Pin auf der Karte anpassen** korrigierst du die Position, oder du tippst auf **Meinen Standort verwenden**. Hat das Foto keine Position, erscheint die Karte gleich; ein Tipp setzt den Pin und füllt den Ort, falls er noch leer ist.
- **Geklebt am** (optional): das Aufnahmedatum des Fotos.
- **Beschreibung** (optional).

Bearbeiten und Löschen können der Autor und Admins über das ⋮-Menü der Karte.

## Feed und Karte

- **Suche** über dem Feed: nach Ort, Beschreibung oder Autor (Kegelname oder Klarname; zusätzlich kannst du unter dem Suchfeld direkt auf den Chip eines Autors tippen). Der Filter gilt auch für die Karte und aktualisiert die angezeigte Anzahl der Sticker und Orte über der Liste.
- **Feed**: neueste zuerst (nach dem Tag, an dem der Sticker geklebt wurde). Fotos öffnen per Tipp im Vollbild (zum Schließen nach unten wischen; ein Tipp blendet Ort, Datum und das Teilen-Menü mit „Link kopieren“ (Link zum Beitrag) und „Teilen / Speichern“ (natives Teilen-Menü) ein bzw. aus); im Feed erscheinen Fotos als Quadrat-Ausschnitt (im Vollbild siehst du das ganze Foto); mehrere Fotos eines Beitrags wischst du im Feed und im Vollbild durch, die Nummer 1/3, 2/3 … steht auf dem Bild; ❤️ und Kommentare funktionieren wie bei Neuigkeiten. Oben stehen nur Feed/Karte-Umschalter, Suche (Lupe) und ＋; die Anzahl steht über der Liste.
- **Karte**: die Pins sind Fotos (das neueste am Ort); gibt es dort mehrere Fotos – auch von mehreren Stickern nahe beieinander –, zeigt eine Zahl am Pin, wie viele. Die Gruppierung hängt vom Zoom ab: herausgezoomt verschmelzen benachbarte Orte zu einem Pin, hineingezoomt trennen sie sich wieder. Ein Tipp auf eine Gruppe mehrerer Orte zoomt hinein; ein Tipp auf einen einzelnen Ort öffnet den Ort mit nummerierten Vorschaubildern, **Beitrag ansehen** wechselt in den Feed und scrollt direkt zum ausgewählten Beitrag.

## Benachrichtigungen und Zusammenfassung

- Unter Profil → Einstellungen → Benachrichtigungen gibt es die Kategorie **Neue Sticker** (standardmäßig aus). Wer sie aktiviert, bekommt eine Meldung, wenn jemand anderes einen Sticker postet.
- In der **E-Mail-Zusammenfassung** erscheinen neue Sticker anderer Mitglieder im Abschnitt **Neue Sticker**, mit Link zum Beitrag.

## Hinweise

- Bilder laden schnell: Beim Hochladen werden große Fotos auf höchstens 2048 Pixel verkleinert (Drehung aus den Fotodaten wird übernommen), Listen, Karte und Vorschauen laden kleinere Größen (im Hintergrund erzeugt und zwischengespeichert). Bis ein Foto da ist, zeigt die App eine unscharfe Vorschau statt einer leeren Fläche.

- Die Karte nutzt CARTO-Kartenkacheln (auf Basis von OpenStreetMap-Daten, über den Server geladen, damit `CARTO_API_KEY` auf dem Server bleibt) und braucht eine Internetverbindung; ohne Netz erscheint ein Hinweis, der Feed funktioniert weiter.
- Für die automatische Ortsbestimmung fragt dein Browser bei OpenStreetMap (Nominatim) nach dem Ortsnamen zur Foto-Position; es wird kein Foto und kein Nutzername übertragen.
