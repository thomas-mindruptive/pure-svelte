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
   - Wir prüfen das Feld `bulk_prices` (Format: `Menge|Einheit|Preis|Info`).
   - Wir parsen die Tabelle strikt.
   - Wir suchen den niedrigsten verfügbaren Einzelpreis in der Staffel.
   - *Beispiel:* Listenpreis 5€, aber Staffel "ab 10 Stk: 3€" -> **Effektiver Preis: 3€**.
   - *Fehlerbehandlung:* "Fail Fast" - bei ungültigem Format wird ein Fehler geworfen.

### 2. Strategie-Bestimmung
Basierend auf `Product Type` entscheiden wir, ob wir nach Gewicht oder Stück normalisieren:

- **UNIT (Stück):** Anhänger, Halskette, Pendel, Massagestab, Armband.
- **WEIGHT (Gewicht):** Trommelstein, Wassersteine, Rohstein, Kugel, Ei, Druse, Cluster/Stufe.
- **AUTO:** Stand/Tischstein, Halbedelstein (Fallback auf WEIGHT).

*Wenn Strategie = UNIT, ist das Gewicht für den Preis irrelevant (aber evtl. für Sortierung).*

### 3. Gewichts-Ermittlung (Weight Waterfall)
Unabhängig von der Strategie versuchen wir immer, ein Gewicht zu ermitteln (z.B. für Sortierung oder WEIGHT-Pricing).

Die Ermittlung folgt einer strikten Priorität ("Wasserfall"):

#### A. Bulk-Verpackung (📦 BULK)
Prüfung auf explizite Großpackungen im Feld `packaging` oder `package_weight`.
- *Trigger:* `package_weight` ist gesetzt (z.B. "1kg").
- *Logik:* Nutze dieses Gesamtgewicht.

#### B. Explizites Gewicht (⚖️ EXACT)
Prüfung auf Datenbank-Feld `offeringWeightGrams`.
- *Trigger:* Feld ist > 0.
- *Logik:* Nutze den exakten Wert.

#### C. Gewichts-Spanne (〰️ RANGE)
Prüfung auf Datenbank-Feld `offeringWeightRange`.
- *Trigger:* Feld enthält Format wie "30-50g".
- *Logik:* Berechne Mittelwert: `(Min + Max) / 2`.

#### D. Geometrische Berechnung (📐 CALC)
Prüfung auf Dimensionen (`offeringDimensions` / `size`) und Form.
- *Trigger:* Dimensionen vorhanden (z.B. "50mm", "10x5x5cm", "[30mm][3mm]").
- *Logik:*
    1. **Volumen-Box:** Extrahieren von L, B, H.
       - *Bracket-Notation:* `[30mm][3mm]` -> nimmt ersten Wert als L=B=H (Kugel-Annahme).
    2. **Form-Faktor:** Korrekturfaktor für Volumen (z.B. Rohstein 0.6, Kugel 1.0).
    3. **Dichte:** Spezifisches Gewicht (Standard Quarz: ~2.65 g/cm³).
    4. **Formel:** `Gewicht = (L * B * H) * FormFaktor * Dichte`.

### 4. Preis-Normalisierung
Berechnung des finalen Vergleichspreises:

- **Strategie WEIGHT:** `Effektiver Preis` / `Ermitteltes Gewicht (kg)` = **€/kg**.
- **Strategie UNIT:** `Effektiver Preis` = **€/Stk**.

---

## Darstellung im Report

Die Ergebnisse werden in der Spalte **Einheit** angezeigt. Um die Herkunft der Berechnung transparent zu machen, nutzen wir HTML-Tooltips (`<abbr>`), die beim Hovern Details zeigen.

| Anzeige | Bedeutung | Tooltip-Beispiel |
| :--- | :--- | :--- |
| **€/kg** 📦 | Basis: Bulk-Package | "Gewicht aus Bulk-Packung (1kg)..." |
| **€/kg** ⚖️ | Basis: Exaktes Gewicht | "Gewicht aus DB-Feld (250g)..." |
| **€/kg** 〰️ | Basis: Gewichts-Spanne | "Mittelwert aus '30-50g'..." |
| **€/kg** 📐 | Basis: Geometrie | "Berechnet aus 50mm (Kugel)..." |
| **€/Stk** | Basis: Stückpreis | "Strategie: Unit..." |
