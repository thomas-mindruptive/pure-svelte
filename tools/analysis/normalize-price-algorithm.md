# Preis-Normalisierungs-Algorithmus

Dieses Dokument beschreibt den Algorithmus zur Ermittlung eines vergleichbaren Preises (Normalisierung) für Edelstein-Produkte.

## Ziel
Vergleichbarkeit schaffen zwischen unterschiedlichen Verkaufsformen:
- **Einzelstücke** (z.B. "Druse, 2.5kg" für 100€)
- **Bulk-Ware** (z.B. "Trommelsteine 1kg Sack" für 40€)
- **Stück-Ware mit Varianz** (z.B. "Cluster 30-50g" für 5€)
- **Ware ohne Gewichtsangabe** (z.B. "Kugel 50mm" für 20€)

## Kern-Strategie: "Weight First"
Da das Volumen (und damit das Gewicht) bei 3D-Objekten (Steine) die physikalisch korrekteste Vergleichsgröße ist, versuchen wir primär, einen **Preis pro Kilogramm (€/kg)** zu ermitteln.

Nur bei spezifischen Produktgruppen (Ketten, Anhänger), die primär nach Stück gehandelt werden und deren Gewicht irrelevant für den Wert ist, nutzen wir **Preis pro Stück (€/Stk)**.

---

## Der "Wasserfall"-Algorithmus

Für jedes Produkt wird sequenziell geprüft, ob eine Gewichtsermittlung möglich ist. Sobald ein Schritt erfolgreich ist, wird dieser Wert verwendet.

### 1. Strategie-Bestimmung
Basierend auf `Product Type`:
- **UNIT (Stück):** Anhänger, Halskette, Pendel, Massagestab.
- **WEIGHT (Gewicht):** Trommelstein, Wassersteine, Rohstein, Kugel, Ei, Druse, Cluster/Stufe.
- **AUTO:** Stand/Tischstein, Halbedelstein (Fallback auf WEIGHT).

*Wenn Strategie = UNIT, ist das Gewicht irrelevant. Endpreis = Stückpreis.*

### 2. Gewichts-Ermittlung (Für WEIGHT-Strategie)

Wir suchen das effektive Gewicht in dieser Reihenfolge:

#### A. Bulk-Verpackung (📦 BULK)
Prüfung auf explizite Großpackungen im Feld `packaging` oder `title`.
- *Trigger:* Text wie "1kg", "500g", "Bulk".
- *Logik:* Wenn `package_weight` validiert wurde, nutzen wir dieses Gesamtgewicht.
- *Beispiel:* "1kg Beutel Trommelsteine" -> Gewicht: **1.0 kg**.

#### B. Explizites Gewicht (⚖️ EXACT)
Prüfung auf Datenbank-Feld `offeringWeightGrams`.
- *Trigger:* Feld ist > 0.
- *Logik:* Nutze den exakten Wert.
- *Beispiel:* "Amethyst Druse" mit DB-Eintrag 2500g -> Gewicht: **2.5 kg**.

#### C. Gewichts-Spanne (〰️ RANGE)
Prüfung auf Datenbank-Feld `offeringWeightRange`.
- *Trigger:* Feld enthält Format wie "30-50g".
- *Logik:* Berechne Mittelwert: `(Min + Max) / 2`.
- *Beispiel:* "30-50g" -> `(30+50)/2` = 40g -> Gewicht: **0.04 kg**.

#### D. Geometrische Berechnung (📐 CALC)
Prüfung auf Dimensionen (`offeringDimensions`) und Form.
- *Trigger:* Dimensionen vorhanden (z.B. "50mm", "10x5x5cm").
- *Logik:*
    1. **Volumen-Box:** Extrahieren von L, B, H aus Dimensionen.
       - Wenn nur 1 Wert (z.B. "50mm"): `L=B=H=50mm`.
       - Wenn 2 Werte (z.B. "10x5cm"): `L=10, B=H=5`.
    2. **Form-Faktor:** Multiplikator für Füllgrad (aus `tools/analysis/material-densities.ts`).
       - Kugel/Würfel: 1.0
       - Rohstein: 0.6
       - Cluster: 0.5
       - Druse: 0.4
    3. **Dichte:** Spezifisches Gewicht des Materials (g/cm³) (aus `tools/analysis/material-densities.ts`).
       - Standard (Quarz): ~2.65 g/cm³.
    4. **Formel:** `Gewicht = (L * B * H) * FormFaktor * Dichte`.
- *Beispiel:* Kugel 50mm (Amethyst).
    - Box: 5x5x5 = 125 cm³.
    - Kugel-Formel (genauer): `4/3 * pi * r^3` ≈ 65.45 cm³. (Oder Box * 0.52).
    - Dichte Amethyst: 2.65.
    - Gewicht ≈ 173g -> **0.173 kg**.

### 3. Preis-Normalisierung
- **Endpreis** = `Offering Price` / `Ermitteltes Gewicht (kg)`.

---

## Darstellung im Report

Um die Herkunft des Gewichts transparent zu machen, wird im Markdown-Report eine Spalte **Calc** eingeführt, die Icons mit Tooltips (via HTML `<abbr>` Tag) nutzt.

| Icon | Bedeutung | Tooltip-Inhalt |
| :--- | :--- | :--- |
| 📦 | **Bulk** | "Quelle: Bulk-Verpackung '1kg'..." |
| ⚖️ | **Exact** | "Quelle: Datenbank-Feld (250g)..." |
| 〰️ | **Range** | "Quelle: Mittelwert aus '30-50g'..." |
| 📐 | **Calc** | "Quelle: Berechnet aus 50mm (Kugel)..." |
| ❌ | **Error** | "Kein Gewicht ermittelbar" |
