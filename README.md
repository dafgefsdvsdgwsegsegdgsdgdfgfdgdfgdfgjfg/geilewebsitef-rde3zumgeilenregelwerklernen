# DE3 Regeltrainer

Ein kleines Offline-Lernprogramm (Quiz) für die Serverregeln.

## Start

- Öffne `rules-trainer/index.html` im Browser (Doppelklick).
- Jede Session enthält **alle** Regeln in **zufälliger Reihenfolge**.
- Nach jeder Antwort siehst du **richtig/falsch** und die **korrekte Sanktion**.

## Modi (Tabs)

- `Regelnummer`: Regeltext → passende Regelnummer wählen (z.B. `Allg. 6.2`)
- `Regel finden`: Regelnummer → passende Beschreibung wählen
- `Sanktion`: Regeltext → richtige Strafe wählen

## Einstellungen

- Oben rechts kannst du einstellen, ob es **2 / 3 / 4 Antworten** pro Frage geben soll.
- `Unsicher`: markiert die Frage als falsch und zeigt direkt die Lösung (kommt dann beim „Nur Fehler wiederholen“ wieder).
- `50/50 Hinweis`: entfernt zwei falsche Antworten (Shortcut: `H`).
- `Merken`: markiert Regeln für später; im Ergebnis kannst du „Nur Gemerkte“ üben (Shortcut: `B`).

## Regeln bearbeiten

- Daten stehen in `rules-trainer/rules-data.js`.
