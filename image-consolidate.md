# Image Consolidation Plan: Junction Tables + Canonical Images

## Ziel

Umstellung von direkter `offering_id`/`product_def_id` in `images` auf Junction-Tabellen mit expliziten vs. kanonischen Bildern.

## Architektur-Entscheidungen

### Logik-Regeln

1. **Explizite Bilder** (`explicit = true`):
   - Werden über `ImageDetailPage` gespeichert
   - Sind offering-spezifisch (z.B. selbstgemachtes Foto)
   - Werden NIE für andere Offerings verwendet
   - Mehrere Offerings können explizite Bilder mit gleichem Fingerprint haben

2. **Kanonische Bilder** (`explicit = false`):
   - Werden automatisch generiert (via `tools/images`)
   - Werden zwischen Offerings mit gleichem Fingerprint geteilt
   - Nur als "Notfalllösung" wenn kein explizites Bild existiert

3. **Invariante**:
   ```
   explicit = true  → kanonisch = false (immer)
   explicit = false → kanonisch = true  (immer)
   ```

4. **UNIQUE Constraint**:
   - Nur EIN kanonisches Bild pro `prompt_fingerprint`
   - Explizite Bilder können denselben Fingerprint haben (kein Constraint)

### Tabellenstruktur

#### `dbo.images` (kanonische Bilddaten)
- `image_id` (PK)
- `filepath`, `file_hash`, `filename`, etc. (Bilddaten)
- `material_id`, `form_id`, `surface_finish_id`, `construction_type_id` (Fingerprint-Felder)
- `size_range`, `quality_grade`, `color_variant`, `packaging`
- `prompt_fingerprint` (berechnet aus Fingerprint-Feldern)
- `explicit` (BIT NOT NULL DEFAULT 0) - **Nur diese Spalte, `is_canonical` ist redundant!**
- UNIQUE Constraint: `(prompt_fingerprint) WHERE explicit = 0`

#### `dbo.offering_images` (Junction-Tabelle)
- `offering_image_id` (PK)
- `offering_id` (FK → offerings)
- `image_id` (FK → images)
- `is_primary` (BIT)
- `sort_order` (INT)
- `created_at` (DATETIME)

**Wichtig:** `explicit` Flag ist nur in `images`, NICHT in Junction-Tabellen (Option A).

**Hinweis:** Product Definition Images werden aktuell nicht benötigt und sind aus diesem Plan ausgeschlossen. Falls später benötigt, analog zu Offering Images umsetzen.

## Anpassungsliste

### 1. Domain (Zod Schemas) - `src/lib/domain/domainTypes.ts`

**ImageSchema erweitern:**
- `explicit: z.boolean().default(false)`
- `prompt_fingerprint: z.string().max(64).nullable().optional()` (falls noch nicht vorhanden)

**Junction-Tabellen-Schemas erstellen:**
- `OfferingImageJunctionSchema` (offering_images)
- ~~`ProductDefinitionImageJunctionSchema`~~ (nicht benötigt, siehe Hinweis oben)

**Type-Aliase anpassen:**
- `OfferingImage_Image` → sollte JOIN mit Junction-Tabelle sein
- ~~`ProductDefinitionImage_Image`~~ (nicht benötigt)

### 2. DDL - `pureenergy-schema/DDL.sql`

**Junction-Tabellen erstellen:**
- `dbo.offering_images`
- `dbo.product_definition_images`

**UNIQUE Constraint auf `images`:**
- `(prompt_fingerprint) WHERE explicit = 0`

### 3. ALTER TABLE Script - `pureenergy-schema/ALTER-Add-Image-Junction-Tables.sql`

**Spalten zu `images` hinzufügen:**
- `explicit BIT NOT NULL DEFAULT 0`
- `prompt_fingerprint NVARCHAR(64) NULL` (falls noch nicht vorhanden)

**Junction-Tabellen erstellen:**
- `dbo.offering_images`
- ~~`dbo.product_definition_images`~~ (nicht benötigt)

**Alte Spalten entfernen:**
- `images.offering_id` → entfernen
- `images.product_def_id` → entfernen

**Hinweis:** Keine Datenmigration nötig, da alle bestehenden Bilder gelöscht werden.

**UNIQUE Constraint erstellen:**
- `UNIQUE (prompt_fingerprint) WHERE explicit = 0`

### 4. Backend Queries - `src/lib/backendQueries/entityOperations/`

#### `image.ts`:
- `insertImage(transaction: Transaction | null, data)`: `explicit = true` setzen, wenn über ImageDetailPage gespeichert
- `updateImage(transaction: Transaction | null, imageId, data)`: Logik für explizite vs. kanonische Bilder
- Alle Funktionen erhalten optionale `Transaction | null` als ersten Parameter
- Verwenden intern `TransWrapper` für Transaction-Handling
- Neue Funktionen:
  - `findCanonicalImageByFingerprint(transaction: Transaction | null, fingerprint: string)` → `WHERE explicit = 0 AND prompt_fingerprint = ?`

#### Neue Datei: `offeringImage.ts`:
- **Zentrale Logik für Offering Images** (verwendet `image.ts` intern)
- Alle Funktionen erhalten optionale `Transaction | null` als ersten Parameter
- Verwenden intern `TransWrapper` für Transaction-Handling
- Funktionen:
  - `loadOfferingImages(transaction: Transaction | null, offeringId, options?: { is_explicit?: boolean })`
    - Lädt Offering Images via View oder JOIN
  - `insertOfferingImage(transaction: Transaction | null, data)`
    - Erstellt Image (via `insertImage()`) + Junction-Eintrag
    - Setzt `explicit = true` für explizite Bilder
  - `updateOfferingImage(transaction: Transaction | null, junctionId, data)`
    - Aktualisiert Junction-Eintrag + ggf. Image
  - `deleteOfferingImage(transaction: Transaction | null, junctionId)`
    - Löscht Junction-Eintrag (Image bleibt erhalten)
  - `loadOfferingImageById(transaction: Transaction | null, junctionId)`
    - Lädt einzelnes Offering Image via Junction-ID

~~#### Neue Datei: `productDefinitionImage.ts`:~~
- ~~Analog zu `offeringImage.ts` für ProductDefinition Images~~ (nicht benötigt)

### 5. API Endpoints - `src/routes/api/`

#### `offering-images/`:
- `+server.ts` (POST): Liste laden (mit JOIN zu images)
- `[id]/+server.ts` (GET/PUT/DELETE): Einzelne Operationen
- `new/+server.ts` (POST): Neues explizites Bild erstellen
  - `explicit = true` setzen
  - Image + Junction-Eintrag erstellen

~~#### `product-definition-images/`:~~
- ~~Analog zu `offering-images/`~~ (nicht benötigt)

### 6. API Client - `src/lib/api/client/`

#### `offeringImage.ts`:
- Anpassen: JOIN mit Junction-Tabelle statt direkter `offering_id` in `images`
- Neue Methoden:
  - `loadExplicitOfferingImages(offeringId)` → `WHERE explicit = 1`
  - `loadCanonicalOfferingImages(offeringId)` → `WHERE explicit = 0`

~~#### `productDefinitionImage.ts`:~~
- ~~Analog anpassen~~ (nicht benötigt)

### 7. Frontend Components - `src/lib/components/domain/offeringImages/`

#### `ImageDetailPage.svelte`:
- Beim Speichern: `explicit = true` setzen
- Logik anpassen: Junction-Tabelle statt direkter `offering_id`

#### `ImageForm.svelte`:
- UI-Anpassungen falls nötig (z.B. Anzeige "Explizites Bild")

#### `OfferingDetailPage.svelte`:
- Bildliste laden: JOIN mit Junction-Tabelle
- Unterscheidung: Explizite vs. kanonische Bilder anzeigen

### 8. Table Registry - `src/lib/backendQueries/tableRegistry.ts`

- Junction-Tabellen hinzufügen:
  - `offering_images`
  - ~~`product_definition_images`~~ (nicht benötigt)

### 9. Query Config - `src/lib/backendQueries/queryConfig.ts`

- **KEINE JOIN-Konfigurationen nötig** - Views werden stattdessen verwendet (siehe Punkt 11)

### 10. Fingerprint-Berechnung - `src/lib/utils/` oder `src/lib/domain/`

- `createFingerprint()` implementieren (siehe `image-fingerprint.md`)
- `createPromptFingerprint()` für Images
- Integration in `insertImage()` / `updateImage()`

### 11. Views - `pureenergy-schema/DDL-Views.sql`

**Idempotente View erstellen:**
- `dbo.view_offering_images` (oder ähnlicher Name)
  - JOIN: `offering_images` → `images`
  - Enthält alle Felder aus beiden Tabellen
  - Idempotent: `CREATE OR ALTER VIEW` verwenden
  - **Zweck**: Ersetzt JOIN-Konfiguration in queryConfig, kann direkt in Queries verwendet werden

~~**Analog für ProductDefinition:**~~
- ~~`dbo.view_product_definition_images`~~ (nicht benötigt)

**Vorteil:**
- Keine queryConfig-Einträge nötig
- Views können direkt in SQL-Queries verwendet werden
- Einfacher zu warten und zu verstehen

### 12. Dependency Checks - `src/lib/dataModel/dependencyChecks.ts`

- Prüfen: Hat Image Junction-Einträge?
- Soft dependencies: Junction-Einträge
- Hard dependencies: Falls Image noch verwendet wird

### 13. Delete Operations - `src/lib/dataModel/deletes.ts`

- `deleteImage()`: Prüfen, ob Junction-Einträge existieren
- `deleteOffering()`: Cascade-Löschen von Junction-Einträgen
- ~~`deleteProductDefinition()`: Cascade-Löschen von Junction-Einträgen~~ (nicht benötigt)

## Generierungslogik (für tools/images) - **Hinweis für später**

**Hinweis:** Die automatische Bildgenerierung via `tools/images` wird aktuell nicht implementiert, bleibt aber als Architektur-Hinweis für spätere Umsetzung erhalten.

**Workflow beim Generieren (später umzusetzen):**

1. Prüfe: Hat Offering bereits explizite Bilder? (`explicit = 1`)
   - Wenn ja: KEINE Generierung, explizite Bilder haben Vorrang
   - Wenn nein: Weiter zu Schritt 2

2. Berechne Fingerprint aus Offering (mit Coalesce-Logik)

3. Suche kanonisches Bild mit diesem Fingerprint (`explicit = 0 AND prompt_fingerprint = ?`)
   - Wenn gefunden: Verwende es (via Junction-Eintrag)
   - Wenn nicht gefunden: Weiter zu Schritt 4

4. Generiere neues Bild via fal.ai

5. Speichere als kanonisches Bild (`explicit = 0`)

6. Erstelle Junction-Eintrag

## Reihenfolge der Implementierung

1. **Domain** (Schemas) - Grundlage für alles
2. **ALTER Script** (DDL) - Datenbank-Struktur
3. **Views** (DDL-Views.sql) - Idempotente Views für JOINs
4. **Backend Queries** (entityOperations) - Datenzugriff
   - `offeringImage.ts` (zentrale Logik, verwendet `image.ts`)
5. **API Endpoints** - Server-API
6. **API Client** - Client-API
7. **Frontend Components** - UI
8. **Table Registry** - Registry-Updates
9. **Dependency Checks & Deletes** - Cleanup-Logik

## Wichtige Hinweise

- **Nur `explicit` Spalte**: `is_canonical` ist redundant, da `explicit = !canonical` immer gilt
- **UNIQUE Constraint**: Nur auf kanonische Bilder (`explicit = 0`), nicht auf explizite
- **Migration**: Keine Migration nötig, da alle bestehenden Bilder gelöscht werden
- **Generierung**: Tools in `tools/images/` werden aktuell nicht angepasst (siehe "Generierungslogik" Abschnitt)
- **Transaction-Handling**: Alle entityOperations-Funktionen erhalten optionale `Transaction | null` und verwenden `TransWrapper`
- **Views statt queryConfig**: Idempotente Views ersetzen JOIN-Konfigurationen in queryConfig
- **Zentrale Logik**: `offeringImage.ts` kapselt alle Offering-Image-Operationen und verwendet `image.ts` intern
