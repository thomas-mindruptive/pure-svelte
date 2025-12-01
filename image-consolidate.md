# Image Tables Consolidation Plan

## Ziel

Konsolidierung der drei Image-Tabellen (`images`, `offering_images`, `product_definition_images`) in eine einzige Tabelle `images` mit optionalen Foreign Keys (`offering_id`, `product_def_id`). Dies eliminiert:
- Duplikate von Feldern (material_id, form_id, surface_finish_id, construction_type_id, size_range, quality_grade, color_variant)
- Das komplexe OOP-Inheritance-Pattern mit separaten Tabellen
- Die Notwendigkeit, bei jedem Insert/Update beide Tabellen zu aktualisieren

## Aktuelle Struktur

### `dbo.images` (Basis-Tabelle)
- Alle Basis-Felder (filename, filepath, file_hash, etc.)
- Variant matching fields: `material_id`, `form_id`, `surface_finish_id`, `construction_type_id`
- Variant dimensions: `size_range`, `quality_grade`, `color_variant`, `packaging`

### `dbo.offering_images` (Subklasse)
- `image_id` (PK+FK)
- `offering_id` (FK) - **einziger eindeutiger Wert**
- `image_type`, `sort_order`, `is_primary` - **nicht in Basis-Tabelle**
- **Duplikate**: material_id, form_id, surface_finish_id, construction_type_id, size_range, quality_grade, color_variant

### `dbo.product_definition_images` (Subklasse)
- `image_id` (PK+FK)
- `product_def_id` (FK) - **einziger eindeutiger Wert**
- `image_type`, `sort_order`, `is_primary` - **nicht in Basis-Tabelle**
- **Duplikate**: material_id, form_id, surface_finish_id, construction_type_id, size_range, quality_grade, color_variant

## Neue Struktur

### `dbo.images` (Konsolidiert)
- Alle bestehenden Felder aus `images`
- **Neue optionale FKs**: `offering_id`, `product_def_id`
- **Neue Felder**: `image_type`, `sort_order`, `is_primary`
- **CHECK-Constraint**: Nur einer der beiden FKs darf gesetzt sein (oder beide NULL für standalone images)

## Schritt-für-Schritt Umsetzung

### Phase 1: Datenbank-Schema-Änderungen

#### Schritt 1.1: ALTER TABLE Script erstellen
**Datei:** `pureenergy-schema/ALTER-Consolidate-Image-Tables.sql`

```sql
USE pureenergyworks;
GO

-- 1. Add new columns to dbo.images
ALTER TABLE dbo.images
ADD offering_id INT NULL,
    product_def_id INT NULL,
    image_type NVARCHAR(50) NULL,
    sort_order INT NOT NULL DEFAULT 0,
    is_primary BIT NOT NULL DEFAULT 0;
GO

-- 2. Add CHECK constraint: Only one FK can be set
ALTER TABLE dbo.images
ADD CONSTRAINT CK_images_single_parent CHECK (
    (offering_id IS NULL AND product_def_id IS NOT NULL) OR
    (offering_id IS NOT NULL AND product_def_id IS NULL) OR
    (offering_id IS NULL AND product_def_id IS NULL)
);
GO

-- 3. Add Foreign Key constraints
ALTER TABLE dbo.images
ADD CONSTRAINT FK_img_offering FOREIGN KEY (offering_id)
    REFERENCES dbo.wholesaler_item_offerings(offering_id);

ALTER TABLE dbo.images
ADD CONSTRAINT FK_img_productdef FOREIGN KEY (product_def_id)
    REFERENCES dbo.product_definitions(product_def_id);
GO

-- 4. Create indexes
CREATE INDEX IX_img_offering ON dbo.images(offering_id);
CREATE INDEX IX_img_productdef ON dbo.images(product_def_id);
CREATE INDEX IX_img_image_type ON dbo.images(image_type);
GO
```

#### Schritt 1.2: MIGRATION NICHT BENÖTIGT!
=> offering_images und product_definition_images sind bereits gedropped!


### Phase 2: Domain Types Anpassungen

#### Schritt 2.1: `ImageSchemaBase` erweitern
**Datei:** `src/lib/domain/domainTypes.ts` (Zeile 645-670)

Erweitere `ImageSchemaBase` um:
```typescript
offering_id: z.number().int().positive().nullable().optional(),
product_def_id: z.number().int().positive().nullable().optional(),
image_type: z.string().max(50).nullable().optional(),
sort_order: z.number().int().nonnegative().default(0),
is_primary: z.boolean().default(false),
```

#### Schritt 2.2: Subklassen-Schemas entfernen
**Datei:** `src/lib/domain/domainTypes.ts`

- Entferne `ImageSubclassBaseSchema` (Zeile 722-739)
- Entferne `ProductDefinitionImageSchemaBase` und `ProductDefinitionImage_Schema` (Zeile 741-761)
- Entferne `OfferingImageSchemaBase` und `OfferingImage_Schema` (Zeile 778-796)
- Entferne alle `*_Image_Schema` Varianten (Zeile 763-809)

#### Schritt 2.3: Neue Typ-Aliase erstellen (für Rückwärtskompatibilität)
**Datei:** `src/lib/domain/domainTypes.ts`

```typescript
// Type aliases for backward compatibility during migration
// WICHTIG: Die tatsächliche Datenstruktur ist flach (Image), keine nested structures mehr!
// Diese Aliase helfen nur bei der Code-Migration, um bestehende Typ-Referenzen kompatibel zu halten
export type ProductDefinitionImage = Image;
export type OfferingImage = Image;
export type ProductDefinitionImage_Image = Image;  // Flach, nicht { image: Image, ... }
export type OfferingImage_Image = Image;  // Flach, nicht { image: Image, ... }
```

### Phase 3: Entity Operations Anpassungen

#### Schritt 3.1: `image.ts` vereinfachen
**Datei:** `src/lib/backendQueries/entityOperations/image.ts`

**Zu entfernen:**
- `insertProductDefinitionImageWithImage` (Zeile 135-275)
- `updateProductDefinitionImageWithImage` (Zeile 286-346)
- `loadProductDefinitionImageWithImageById` (Zeile 356-381)
- `loadProductDefinitionImagesWithImage` (Zeile 429-489)
- `deleteProductDefinitionImageWithImage` (Zeile 501-536)
- `insertOfferingImageWithImage` (Zeile 820-910)
- `updateOfferingImageWithImage` (Zeile 916-926)
- `loadOfferingImageWithImageById` (Zeile 931-941)
- `loadOfferingImagesWithImage` (Zeile 946-956)
- `deleteOfferingImageWithImage` (Zeile 961-971)
- Alle generischen Helper-Funktionen (`updateImageWithSubclass`, `loadImagesWithSubclass`, `loadImageWithSubclassById`, `deleteImageWithSubclass`)

**Neu zu erstellen:**
- `insertImage(transaction, data): Promise<Image>` - Einfacher Insert in eine Tabelle
  - Enthält Coalesce-Logik für `offering_id` und `product_def_id` (siehe Schritt 3.2)
  - Enthält `enrichImageMetadata` für filepath-basierte Metadaten
- `updateImage(transaction, imageId, data): Promise<Image>` - Einfacher Update
  - Enthält Coalesce-Logik für `offering_id` und `product_def_id` (siehe Schritt 3.2)
- `loadImageById(transaction, imageId): Promise<Image>` - Einfacher Load
  - Gibt flaches `Image` zurück (keine nested structures)
- `loadImages(transaction, payload?): Promise<Image[]>` - Bereits vorhanden (Zeile 391-419), anpassen
  - Gibt `Image[]` zurück (keine JSON-Strings, keine nested structures)
- `deleteImage(transaction, imageId): Promise<Image>` - Einfacher Delete
  - Gibt gelöschtes `Image` zurück

**Spezielle Logik beibehalten:**
- `enrichImageMetadata` (Zeile 64-122) - bleibt unverändert, wird in `insertImage` verwendet
- Coalesce-Logik für Offerings (aus `insertOfferingImageWithImage`) - in `insertImage` integrieren, wenn `offering_id` gesetzt ist
- Coalesce-Logik für ProductDefinitions (aus `insertProductDefinitionImageWithImage`) - in `insertImage` integrieren, wenn `product_def_id` gesetzt ist

#### Schritt 3.2: Coalesce-Logik in `insertImage` und `updateImage`

**Wenn `offering_id` gesetzt ist:**
- Coalesce-Logik aus Offering anwenden (wie bisher bei `insertOfferingImageWithImage`)
- **Fail-fast**: Wenn Felder für Fingerprint fehlen → API Error Response zurückgeben. orientiere dich an den anderen endpoints und client api. siehe "apiFetchUnion" in "apiClient.ts".
- Fingerprint-Felder müssen vollständig sein (material_id, form_id, surface_finish_id, construction_type_id, etc.)

**Wenn `product_def_id` gesetzt ist:**
- Coalesce-Logik aus ProductDefinition anwenden (wenn Variant-Felder NULL sind)
- Fingerprint aus gesetzten Feldern berechnen
- **Kein Error**, wenn nicht alle Felder gesetzt sind (optional)

**Implementierung:**
```typescript
// In insertImage/updateImage:
if (data.offering_id) {
  // Load offering and product def through TWO queries.

  const offering = await loadOffering...
  const productDef = await loadProductDef...

  // Apply coalesce logic
  data.material_id = data.material_id ?? offering.material_id ?? product_def?.material_id ?? null;
  // ... etc für alle Fingerprint-Felder

  ACHTUNG: Setze hier die felder in das image: data.material_id = ... // und für die anderen felder.
  ziel: Das image übernimmt beim speichern die felder des offerings.
  
  // Fail-fast: Check if all required fingerprint fields are set
  if (!data.material_id || !data.form_id || !data.surface_finish_id || !data.construction_type_id) {
    throw error(400, "All fingerprint fields must be set for offering images");
  }
}

if (data.product_def_id) {
  // Load product_def and apply coalesce logic (optional)
  const productDef = await loadProductDefinitionById(transaction, data.product_def_id);
  data.material_id = data.material_id ?? productDef.material_id ?? null;
  // ... etc
  // No error if fields are missing - fingerprint will be calculated from available fields
}
```

### Phase 4: API-Endpunkte Anpassungen

**WICHTIG:** Die Endpunkte bleiben bestehen, verwenden aber die neuen Methoden aus `image.ts`.

**Datenstruktur-Änderung:**
- **Request**: Endpunkte erwarten jetzt ein **flaches `Image`** (keine nested structures wie `{ image: Image, offering_id: ... }`)
- **Response**: Endpunkte liefern jetzt ein **flaches `Image`** (keine verschachtelten Strukturen)
- Das OOP-Inheritance-Pattern mit nested structures wird eliminiert

**Anzupassende Dateien:**
- `src/routes/api/offering-images/+server.ts` - Verwendet `loadImages` mit WHERE-Filter auf `offering_id`
- `src/routes/api/offering-images/new/+server.ts` - Verwendet `insertImage` mit `offering_id` im Request-Body
- `src/routes/api/offering-images/[id]/+server.ts` - Verwendet `loadImageById`, `updateImage`, `deleteImage`
- `src/routes/api/product-definition-images/+server.ts` - Verwendet `loadImages` mit WHERE-Filter auf `product_def_id`
- `src/routes/api/product-definition-images/new/+server.ts` - Verwendet `insertImage` mit `product_def_id` im Request-Body
- `src/routes/api/product-definition-images/[id]/+server.ts` - Verwendet `loadImageById`, `updateImage`, `deleteImage`

**Beispiel für Query-Endpunkt:**
```typescript
// Statt loadOfferingImagesWithImage (JSON-String):
const images = await loadImages(transaction, {
  where: { key: "offering_id", whereCondOp: ComparisonOperator.EQUALS, val: offeringId }
});
// Gibt Image[] zurück, nicht JSON-String
```


### Phase 5: Client API Anpassungen

**WICHTIG:** Client API muss angepasst werden, da die Datenstruktur sich ändert!

**Änderungen:**
- **Request**: Client muss jetzt **flaches `Image`** senden (keine nested structures)
- **Response**: Client erhält jetzt **flaches `Image`** (keine verschachtelten Strukturen)
- Die Typ-Aliase (`OfferingImage_Image`, `ProductDefinitionImage_Image`) bleiben für Rückwärtskompatibilität im Code, aber die tatsächliche Datenstruktur ist flach

**Anzupassende Dateien:**
- `src/lib/api/client/offeringImage.ts` - Erwartet/liefert flaches `Image` mit `offering_id`
- `src/lib/api/client/productDefinitionImage.ts` - Erwartet/liefert flaches `Image` mit `product_def_id`
- `src/lib/api/client/imageApi.ts` - Kann unverändert bleiben oder erweitert werden

**Beispiel:**
```typescript
// Vorher (nested):
const data = { image: { filepath: "...", ... }, offering_id: 123 };

// Nachher (flach):
const data = { filepath: "...", offering_id: 123, ... };
``` 


### Phase 6: Dependency Checks Anpassungen

#### Schritt 6.1: `dependencyChecks.ts` anpassen
**Datei:** `src/lib/backendQueries/dependencyChecks.ts`

- `checkProductDefinitionImageDependencies` (Zeile 480-502) - entfernen oder vereinfachen
- `checkOfferingImageDependencies` (Zeile 512-534) - entfernen oder vereinfachen
- Neue generische Funktion: `checkImageDependencies(imageId, transaction)`

### Phase 7: Weitere Anpassungen
KEINE Anpassungen in tools, views, usw. notwendig!

### Phase 8: Migration und Cleanup

#### Schritt 8.1: Daten-Migration ausführen
1. ALTER TABLE Script ausführen (Schritt 1.1)


#### Schritt 8.2: Code-Migration
1. Domain Types anpassen (Phase 2)
2. Entity Operations anpassen (Phase 3)
3. Dependency Checks anpassen (Phase 6)


#### Schritt 8.4: DDL.sql aktualisieren
**Datei:** `pureenergy-schema/DDL.sql`

- `CREATE TABLE dbo.offering_images` entfernen (Zeile 532-574)
- `CREATE TABLE dbo.product_definition_images` entfernen (Zeile 482-523)
- `CREATE TABLE dbo.images` erweitern um neue Felder (Zeile 433-473)

### Offene Fragen
1. **Standalone Images**: Sollen Images ohne `offering_id` und `product_def_id` erlaubt sein? (CHECK-Constraint erlaubt das)
=> JA 
1. **Rückwärtskompatibilität**: Sollen alte API-Endpunkte beibehalten werden?
=> JA, siehe oben. Möglichst wenig Änderungen! Die API-Punkte rufen einfach die neuen image.ts funktionen auf. 

