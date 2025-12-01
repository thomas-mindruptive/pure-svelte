# Prompt-Fingerprint System (Schema-Driven)

## Ziel

Einführung eines **schema-gesteuerten Prompt-Fingerprint-Systems**, das:

- pro Entity (z.B. `wholesaler_item_offerings`, `images`) zentral definiert, **welche Felder** in den Fingerprint einfließen,
- einen **wiederverwendbaren Fingerprint-Helper** in `utils` bereitstellt,
- einen Domain-spezifischen Wrapper in `@domain` nutzt,
- und in `genericEntityOperations.insertRecordWithTransaction` / `updateRecordWithTransaction` automatisch angewendet wird.

## Schritt 1: Meta-Typ für Branded Schemas erweitern

**Datei:** `src/lib/domain/domainTypes.ts`

1. **Neuen Meta-Typ definieren**

   - Aktuell: `createSchemaWithMeta<T, M extends { alias; tableName; dbSchema }>`
   - Neu: generischer Meta-Typ gebunden an das Schema:
     ```ts
     type SchemaMeta<S extends z.ZodObject<any>> = {
       alias: string;
       tableName: string;
       dbSchema: string;
       fingerPrintForPromptProps?: readonly (keyof z.infer<S>)[];
     };
     ```


2. **`createSchemaWithMeta` Signatur anpassen**

   - Von der bisherigen `<T, M>`-Version auf:
     ```ts
     function createSchemaWithMeta<S extends z.ZodObject<any>>(
       schema: S,
       meta: SchemaMeta<S>,
     ): WithMeta<S, SchemaMeta<S>> { ... }
     ```

   - Implementierung beibehalten (Meta auf Schema hängen, Logging), nur Typsignatur ändern.

3. **Sicherstellen, dass alle bestehenden Aufrufe kompatibel bleiben**

   - Alle `createSchemaWithMeta(..., { alias, tableName, dbSchema } as const)` sind weiterhin gültig.
   - `fingerPrintForPromptProps` ist optional und muss (noch) nicht gesetzt werden.

## Schritt 2: Fingerprint-Utility in `utils` erstellen

**Datei (NEU):** `src/lib/utils/createFingerprint.ts`

1. **Ziel:** generische Funktion, die aus einem Objekt und einer Liste von Keys einen stabilen Hash erzeugt.
2. **Implementierung:**

   - Signatur:
     ```ts
     export function createFingerprint<T extends object>(
       obj: T,
       keys: readonly (keyof T)[],
     ): string
     ```

   - Schritte:
     - Für jeden Key den Wert aus `obj` holen.
     - Null/undefined → leere Strings, Strings trimmen + lowercase, Numbers zu String.
     - Keys in der übergebenen Reihenfolge durchlaufen (keine Sortierung nötig, da Reihenfolge aus Meta fix ist).
     - Einen deterministischen String bauen (`"key=value"` Paare, mit `|` getrennt).
     - Mit Node `crypto` (z.B. `createHash("md5")`) in einen Hex-String hashen.

3. **Tests/Beispiele (optional, später):**

   - Kurzes Beispiel in Kommentar oder Testdatei, um Verhalten zu dokumentieren.

## Schritt 3: Domain-spezifischen Wrapper `createPromptFingerprint` bauen

**Datei (NEU):** `src/lib/domain/promptFingerprint.ts`

1. **Ziel:** Verbindung zwischen Branded Schema-Meta und `createFingerprint` herstellen.
2. **Typen nutzen:**

   - Über `ExtractSchemaMeta<S>` an die Meta-Informationen kommen.

3. **Funktion(en):**

   - Variante 1: Fingerprint direkt aus Entity und Schema berechnen:
     ```ts
     import { createFingerprint } from "$lib/utils/createFingerprint";
     import type { ExtractSchemaMeta } from "$lib/domain/domainTypes";
     import type { z } from "zod";
     
     export function createPromptFingerprint<S extends z.ZodObject<any>>(
       schema: S,
       entity: z.infer<S>,
     ): string | null {
       const meta: ExtractSchemaMeta<S> = (schema as any).__brandMeta;
       const keys = meta.fingerPrintForPromptProps as (keyof z.infer<S>)[] | undefined;
       if (!keys || keys.length === 0) return null;
       return createFingerprint(entity, keys);
     }
     ```

   - Variante 2 (optional): Übergeben eines generischen Objekts `T` plus Key-Liste, wenn du es außerhalb von Branded Schemas nutzen willst (z.B. View-Types).

## Schritt 4: `fingerPrintForPromptProps` für ausgewählte Schemas setzen

**Datei:** `src/lib/domain/domainTypes.ts`

1. **Start mit `Wio_Schema` (wholesaler_item_offerings):**

   - Meta erweitern:
     ```ts
     export const Wio_Schema = createSchemaWithMeta(Wio_BaseSchema, {
       alias: "wio",
       tableName: "wholesaler_item_offerings",
       dbSchema: "dbo",
       fingerPrintForPromptProps: [
         "material_id",
         "form_id",
         "surface_finish_id",
         "construction_type_id",
         "color_variant",
         "size",
         "quality",
         "packaging",
       ] as const,
     });
     ```

   - Liste später fein-tunen (z.B. `origin`, `imagePromptHint` nur indirekt oder gar nicht).

2. **Optional: `ImageSchema` konfigurieren:**

   - Falls du Fingerprints direkt auf `images` brauchst (z.B. für bereits generierte Bilder):
     ```ts
     export const ImageSchema = createSchemaWithMeta(ImageSchemaBase, {
       alias: "img",
       tableName: "images",
       dbSchema: "dbo",
       fingerPrintForPromptProps: [
         "material_id",
         "form_id",
         "surface_finish_id",
         "construction_type_id",
         "size_range",
         "quality_grade",
         "color_variant",
         "packaging",
       ] as const,
     });
     ```


3. **Später:** weitere Schemas (z.B. Views) nur bei Bedarf.

## Schritt 5: DB-Spalten für Fingerprint ergänzen

1. **Schema-Erweiterung:**

   - Für Tabellen, für die du Fingerprints persistieren willst (z.B. `wholesaler_item_offerings`, `images`), je eine Spalte hinzufügen, z.B.:
     - `prompt_fingerprint NVARCHAR(64) NULL`
   - Analog in `DDL.sql` und als eigenes `ALTER-...` Script.

2. **DomainTypes anpassen:**

   - Im jeweiligen Schema (`Wio_BaseSchema`, `ImageSchemaBase`) Feld ergänzen:
     ```ts
     prompt_fingerprint: z.string().max(64).nullable().optional(),
     ```


## Schritt 6: Integration in `insertRecordWithTransaction` / `updateRecordWithTransaction`

**Datei:** `src/lib/backendQueries/genericEntityOperations.ts`

1. **Meta auslesen:**

   - In beiden Funktionen (`insertRecordWithTransaction`, `updateRecordWithTransaction`) nach dem Laden von `meta`:
     ```ts
     const meta = schema.__brandMeta!;
     const fpKeys = meta.fingerPrintForPromptProps as (keyof z.infer<typeof schema>)[] | undefined;
     ```


2. **Fingerprint beim Insert berechnen:**

   - Vor dem Bauen des SQL-Statements:
     ```ts
     if (fpKeys && fpKeys.length > 0 && "prompt_fingerprint" in data) {
       const fingerprint = createPromptFingerprint(schema, data as any);
       if (fingerprint) {
         (data as any).prompt_fingerprint = fingerprint;
       }
     }
     ```

   - Achtung: Nur setzen, wenn die Spalte im `data`-Objekt existiert (oder explizit hinzugefügt werden soll).

3. **Fingerprint beim Update berechnen:**

   - Hier ist wichtig: **vollständige Entität vs. Partial**. Optionen:
     - Minimalvariante: Fingerprint nur neu berechnen, wenn **alle** relevanten Felder im Update enthalten sind.
     - Bessere Variante: Vor dem Update die aktuelle Entität aus DB laden, mit `data` mergen und daraus Fingerprint berechnen (aufwendiger, aber korrekt).
   - Für einen ersten Schritt kannst du die Minimalvariante wählen und später auf die robuste Version erweitern.

## Schritt 7: Entity-Helfer für ProductDefinitions und Offerings

### 7.1 `entityOperations/productDefinition.ts` (NEU)

**Datei:** `src/lib/backendQueries/entityOperations/productType.ts` (analog umgesetzt für ProductDefinition, ggf. neue Datei `productDefinition.ts`)

- Funktionen:

  1. `loadProductDefinitions(transaction: Transaction | null, payload?: Partial<QueryPayload<ProductDefinition>>): Promise<ProductDefinition[]>`
     - Entspricht der Logik aus `POST /api/product-definitions` (`+server.ts`), aber als wiederverwendbare Backend-Funktion.
     - Nutzt `TransWrapper` für optionalen Transaktions-Parameter.
     - Verwendet `buildQuery`/`executeQuery` oder `loadData`.

  2. `loadProductDefinitionById(transaction: Transaction | null, id: number): Promise<ProductDefinition | null>`
     - Führt einen SELECT nach `product_def_id` aus.
     - Nutzt ebenfalls `TransWrapper`.

- Die API-Routen `product-definitions/+server.ts` und `product-definitions/[id]/+server.ts` können später intern diese Funktionen verwenden (Refactor, kein Verhaltensänderung nach außen).

### 7.2 Neue Offering-Helfer in `entityOperations/offering.ts`

**Datei:** `src/lib/backendQueries/entityOperations/offering.ts`

Neue Funktionen:

1. `loadOffering(transaction: Transaction, offeringId: number): Promise<WholesalerItemOffering | null>`
   - Lädt ein flaches Offering aus `dbo.wholesaler_item_offerings`.
   - Nutzt `loadData` mit einem einfachen `QueryPayload` (`from: { table: "dbo.wholesaler_item_offerings", alias: "wio" }`, `where` auf `offering_id`).

2. `loadOfferingWithPdefCatSupp(transaction: Transaction, offeringId: number): Promise<Wio_PDef_Cat_Supp_Nested>`
   - Lädt die verschachtelte Variante (Offering + ProductDef + Category + Wholesaler) basierend auf `Wio_PDef_Cat_Supp_Nested_Schema` bzw. `Wio_pdef_mat_form_surf_constr_Nested_Schema`.
   - Kann sich an `loadOfferingsForSupplier` (`supplier.ts` + `Wio_PDef_Cat_Supp_Nested_Schema`) orientieren und entweder
     - einen Predefined Query über `/api/query` + `transformToNestedObjects` nutzen, oder
     - direkt `loadData` + `transformToNestedObjects` verwenden.
   - Liefert genau ein Objekt (oder Fehler, wenn nicht gefunden).

Diese Helfer werden im Save-Flow und für die Coalesce-Logik benötigt.

---

## Schritt 8: Integration in `insertRecordWithTransaction` / `updateRecordWithTransaction`

**Datei:** `src/lib/backendQueries/genericEntityOperations.ts`

### 8.1 Allgemeine Logik

- In `insertRecordWithTransaction` / `updateRecordWithTransaction`:

  1. `meta = schema.__brandMeta!` lesen.
  2. `meta.fingerPrintForPromptProps` auslesen.
  3. Wenn `fingerPrintForPromptProps` gesetzt ist und das Feld `prompt_fingerprint` im Datensatz existiert:
     - Den Fingerprint berechnen und `prompt_fingerprint` setzen.

- Da der Client **immer alle Felder** sendet, können wir den Fingerprint bei Insert und Update **immer neu berechnen**, ohne vorherigen SELECT-Merge.

### 8.2 Spezielle Logik für Offerings (Coalesce nach `view_offerings_enriched`)

- Ziel: Fingerprint soll auf den **finalen, coalesced Werten** basieren, analog zu `view_offerings_enriched`:
  - `finalMaterialId = offering.material_id ?? product_def.material_id`
  - `finalFormId`, `finalSurfaceFinishId`, `finalConstructionTypeId` analog.

- Vorgehen beim Speichern eines Offerings:

1. In `entityOperations/offering.ts` neue Funktionen `insertOffering` / `updateOffering` bauen:
   - Beide erhalten optionalen `Transaction`-Parameter und nutzen `TransWrapper`.
   - `insertOffering`:
     - Validiert die Daten (ggf. mit `WholesalerItemOfferingForCreateSchema`).
     - Lädt die zugehörige ProductDefinition über `loadProductDefinitionById`.
     - Lädt bei Bedarf das verschachtelte Offering über `loadOfferingWithPdefCatSupp` (oder baut die Coalesce-Basis selbst aus Offering + ProductDef).
     - Wendet die Coalesce-Regel an (Material/Form/Surface/Construction) und extrahiert exakt die Felder, die in `fingerPrintForPromptProps` konfiguriert sind.
     - Ruft `createPromptFingerprint(Wio_Schema, coalescedEntity)` auf und setzt das Ergebnis in `prompt_fingerprint`.
     - Führt den Insert via `insertRecordWithTransaction` (oder analogem SQL) aus.

   - `updateOffering`:
     - Gleicher Ablauf wie oben, aber für Updates.
     - Da der Client immer alle Felder sendet, können wir direkt mit den gelieferten Offering-Daten + ProductDefinition coalescen und den Fingerprint neu berechnen.

2. API-Routen migrieren:
   - `POST /api/offerings/new` (`routes/api/offerings/new/+server.ts`) ruft `insertOffering` statt direkt `validateAndInsertEntity`.
   - `PUT /api/offerings/[id]` (`routes/api/offerings/[id]/+server.ts`) ruft `updateOffering` statt `validateAndUpdateEntity`.
   - Die bestehenden Business-Validierungen (`validateOfferingConstraints`) werden in den neuen Helfern weiterverwendet.

### 8.3 Logik für Images

- Für `ImageSchema` ist keine Coalesce-Logik nötig:
  - Fingerprint basiert direkt auf den im Schema definierten Feldern (`material_id`, `form_id`, `surface_finish_id`, `construction_type_id`, `size_range`, `quality_grade`, `color_variant`, `packaging`).
  - Bei Insert/Update wird `prompt_fingerprint` immer neu aus `data` berechnet.

- Für **OfferingImages** (OOP-Inheritance `offering_images` + `images`):
  - In den Image-spezifischen Entity-Operationen (falls vorhanden oder später ergänzt):
    - Das zugehörige Offering via `offering_id` laden (`loadOfferingWithPdefCatSupp`).
    - Die coalesced Offering-Eigenschaften + image-spezifische Felder (z.B. `image_type`, `size_range`, `color_variant`) in einen kombinierten Fingerprint einfließen lassen.

---

**Vorgehen bei der Umsetzung:**

1. **Schritt 1–3**: Meta-Typ + `createSchemaWithMeta`-Anpassung und `createFingerprint` / `createPromptFingerprint` implementieren.
   npm run build:lib testen
2. **Schritt 4–5**: `fingerPrintForPromptProps` für `Wio_Schema` und `ImageSchema` setzen und `prompt_fingerprint`-Spalten + Zod-Felder ergänzen.
     npm run build:lib testen
3. **Schritt 7**: neue Entity-Helfer für ProductDefinitions und Offerings hinzufügen
   npm run build:lib testen
4. **Schritt 8**: `insertRecordWithTransaction` / `updateRecordWithTransaction` anpassen und Offering-Save-Flow (`insertOffering`/`updateOffering`, API-Routen) refaktorisieren.
     npm run build:lib testen

