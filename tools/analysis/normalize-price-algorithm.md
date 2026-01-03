# Preis-Normalisierungs-Algorithmus

Dieses Dokument beschreibt den Algorithmus zur Ermittlung des besten Preises und der Normalisierung für Edelstein-Produkte (Pricing Pipeline).

## Ziel
Vergleichbarkeit schaffen zwischen unterschiedlichen Verkaufsformen und Mengenstaffeln.

---

## Der Pipeline-Prozess

Der Algorithmus läuft für jedes Offering in definierten Schritten ab:

### 1. Preis-Ermittlung (Best Price)
Bevor wir normalisieren, ermitteln wir den effektiv niedrigsten Preis.

1. **Listenpreis:** Startwert ist der Standardpreis des Offerings.
2. **Bulk-Preis Check:** 
   - Wir prüfen das Feld `bulk_prices` (Format: `Menge|Einheit|Preis|Info`) sowie Preismuster im `comment`-Feld.
   - Wir suchen den niedrigsten verfügbaren Einzelpreis.
   - *Beispiel:* Listenpreis 5€, aber Staffel "ab 10 Stk: 3€" -> **Effektiver Preis: 3€**.

### 2. Strategie-Bestimmung
Basierend auf `Product Type` entscheiden wir, ob wir nach Gewicht oder Stück normalisieren. Die Konfiguration erfolgt in `analyze-config.ts`.

- **UNIT (Stück):** Explizit konfiguriert für: Anhänger, Halskette, Pendel, Massagestab/Griffel, Ständer.
- **WEIGHT (Gewicht):** Explizit konfiguriert für: Wasserenergetisierer, Handstein.
- **AUTO:** Alle anderen (z.B. Rohsteine, Trommelsteine, Halbedelsteine).
  - *Logik:* Wenn ein Gewicht ermittelt werden kann -> **WEIGHT**. Sonst -> **UNIT**.

### 3. Gewichts-Ermittlung (Weight Waterfall)
Die Ermittlung folgt einer strikten Priorität ("Wasserfall"). **Der erste Treffer gewinnt.**

#### A. Geometrische Berechnung (📐 CALC) - Priorität 1
Prüfung auf Dimensionen (`offeringDimensions`).
- *Grund:* Dimensionen ermöglichen die Berechnung des Einzelgewichts (wichtig für Sortierung nach Größe).
- *Logik:*
    1. **Volumen-Box:** Extrahieren von L, B, H.
    2. **Form-Faktor:** Korrekturfaktor für Volumen (z.B. Rohstein 0.6, Kugel 1.0).
    3. **Dichte:** Spezifisches Gewicht (Standard Quarz: ~2.65 g/cm³).
    4. **Formel:** `Gewicht = (L * B * H) * FormFaktor * Dichte`.

#### B. Bulk-Verpackung (📦 BULK) - Priorität 2
Wenn keine Dimensionen vorhanden sind, Prüfung auf explizite Großpackungen.
- *Trigger:* `packaging` enthält "bulk", "sack", "karton" etc. UND Gewichtsangabe vorhanden.
- *Logik:* Nutze das Gesamtgewicht aus der Verpackung.
- *Hinweis:* Hier fehlt oft das Einzelgewicht für die Sortierung.

#### C. Explizites Gewicht (⚖️ EXACT) - Priorität 3
Prüfung auf Datenbank-Feld `offeringWeightGrams`.
- *Trigger:* Feld ist > 0.
- *Logik:* Nutze den exakten Wert.

#### D. Gewichts-Spanne (〰️ RANGE) - Priorität 4
Prüfung auf Datenbank-Feld `offeringWeightRange`.
- *Trigger:* Feld enthält Format wie "30-50g".
- *Logik:* Berechne Mittelwert: `(Min + Max) / 2`.

### 4. Preis-Normalisierung
Berechnung des finalen Vergleichspreises:

- **Strategie WEIGHT:** `Effektiver Preis` / `Ermitteltes Gewicht (kg)` = **€/kg**.
- **Strategie UNIT:** `Effektiver Preis` = **€/Stk**.

---

## Darstellung im Report

Die Ergebnisse werden in der Spalte **Einheit** angezeigt. Details zur Berechnung sind als **Tooltip** (Mouseover) hinterlegt.

| Anzeige | Bedeutung | Tooltip-Beispiel (Hover) |
| :--- | :--- | :--- |
| **€/kg** | Basis: Gewicht | "Geom: 50x50x50mm -> Vol: 125cm³..." oder "Weight: 50g (field)" |
| **€/Stk** | Basis: Stück | "Strategy: UNIT. Price per piece..." |

Zusätzliche Icons in der Spalte **Info**:
- 📦 **Bulk**: Preis stammt aus einer Mengenstaffel/Kommentar.
- ⚖️ **Calc.W.**: Gewicht wurde berechnet (Regex/Geometrie).
- 🌍 **Land**: Herkunft (wenn nicht DE/AT/NL).
- ⚠️ : Warnung zu Datenqualität (z.B. Dimensionen unklar).
