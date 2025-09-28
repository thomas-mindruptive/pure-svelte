# Intersection Type Approach für Schema Meta Information

## Problem Statement

**Ziel:** `genTypedQualifiedColumns(OrderItem_ProdDef_Category_Schema)` soll typsichere Spalten zurückgeben, die aus Zod-Schemas und TableRegistry abgeleitet sind.

**Aktueller Zustand:**
- Runtime funktioniert perfekt
- Types zeigen Zod-interna statt echte Spalten: `"pd._zod" | "pd.def" | "pd.type" | ...`

**Ursprünglicher Ansatz gescheitert:**
- Zod's `.meta()` ist zur Runtime verfügbar, aber TypeScript kann zur Compile-Zeit nicht auf `._def.meta` zugreifen
- `FindAliasBySchema<TSchema>` funktioniert nicht, da TypeScript keine Zod-Schema-Gleichheit feststellen kann

## Lösung: Intersection Types mit Meta-Brand

### Grundkonzept

```typescript
type WithMeta<T, M> = T & { readonly _meta: M };
```

Schemas erhalten eine Type-Level Meta-Brand, die zur Compile-Zeit zugänglich ist, während die Runtime-Meta über `.meta()` weiterhin funktioniert.

### Schema-Erstellung mit Helper Function

```typescript
function createSchemaWithMeta<
  T extends z.ZodObject<any>,
  M extends { alias: string; tableName: string; dbSchema: string }
>(schema: T, meta: M): WithMeta<T, M> {
  return schema.meta(meta) as WithMeta<T, M>;
}

// Usage:
const WholesalerSchema = createSchemaWithMeta(
  z.object({
    wholesaler_id: z.number().int().positive(),
    name: z.string()
    // ...
  }), 
  {
    alias: "w",
    tableName: "wholesalers",
    dbSchema: "dbo"
  } as const
);
```

### Type-Extraction Utilities

```typescript
// Meta-Information extrahieren
type ExtractSchemaMeta<T> = T extends { readonly _meta: infer M } ? M : never;

// Spezifische Meta-Properties
type GetSchemaAlias<T> = ExtractSchemaMeta<T> extends { alias: infer A } ? A : never;
type GetSchemaTableName<T> = ExtractSchemaMeta<T> extends { tableName: infer T } ? T : never;

// Schema-Keys extrahieren (aus Daten, nicht aus Zod-Object)
type ExtractSchemaKeys<T extends z.ZodObject<any>> = Extract<keyof z.infer<T>, string>;
```

### Qualified Column Generation

```typescript
// Single Schema
type QualifiedColumnsFromBrandedSchema<T extends z.ZodObject<any> & { _meta: any }> = 
  GetSchemaAlias<T> extends string 
    ? ExtractSchemaKeys<T> | `${GetSchemaAlias<T>}.${ExtractSchemaKeys<T>}`
    : ExtractSchemaKeys<T>;

// JOIN Scenario mit verschachtelten Schemas
type QualifiedColumnsFromBrandedSchemaWithJoins<T extends z.ZodObject<any>> = 
  T extends z.ZodObject<infer Shape>
    ? {
        [K in keyof Shape]: Shape[K] extends z.ZodObject<any> & { _meta: any }
          ? GetSchemaAlias<Shape[K]> extends string
            ? `${GetSchemaAlias<Shape[K]>}.${ExtractSchemaKeys<Shape[K]>}`
            : never
          : K extends string 
            ? K
            : never;
      }[keyof Shape]
    : never;
```

### Test-Ergebnisse

**Erfolgreich getestet:**
- `TestAliasFromBrand` = `"t"` ✅
- `TestQualifiedColumnsFromBrand` = `"id" | "name" | "status" | "t.id" | "t.name" | "t.status"` ✅
- JOIN Scenarios mit verschachtelten branded schemas funktionieren ✅

## Vorteile des Approaches

1. **Compile-Time Type Safety:** Meta-Information zur Compile-Zeit verfügbar
2. **Runtime Compatibility:** `.meta()` funktioniert weiterhin für Runtime-Logic
3. **Zod Compatibility:** Schemas bleiben vollständig Zod-kompatibel
4. **Single Source of Truth:** Meta-Information wird nur einmal definiert
5. **TableRegistry wird überflüssig:** Alle Information in Schema-Meta

## Nächste Schritte

### Phase 1: Schema Migration
```typescript
// In domainTypes.ts - alle Schemas umstellen auf:
export const WholesalerSchemaBase = z.object({...});
export const WholesalerSchema = createSchemaWithMeta(WholesalerSchemaBase, {
  alias: "w", tableName: "wholesalers", dbSchema: "dbo"
} as const);
```

### Phase 2: Type System Update
```typescript
// In domainTypes.derived.ts - neue QualifiedColumnsFromSchema implementieren
export type QualifiedColumnsFromSchema<T> = QualifiedColumnsFromBrandedSchemaWithJoins<T>;
```

### Phase 3: TableRegistry Elimination
- `tableRegistry.ts` komplett entfernen
- `queryBuilder.ts` auf Schema-Meta umstellen
- `queryGrammar.ts` Types aus Schema-Collection generieren

### Phase 4: Validation
```typescript
// Testen ob das ursprüngliche Problem gelöst ist:
const testColumns = genTypedQualifiedColumns(OrderItem_ProdDef_Category_Schema);
// Should be properly typed: ("order_item_id" | "quantity" | "pd.product_def_id" | "pc.category_id" | ...)[]
```

## Architektur-Änderung

**Vorher:** `Schemas` + `TableRegistry` + `Types` (3 separate Wahrheitsquellen)

**Nachher:** `Branded Schemas` (Single Source of Truth)
- Schema-Definition: Zod Object
- Meta-Information: Type-Level Brand
- Runtime-Meta: `.meta()` für queryBuilder
- Types: Automatisch aus Schema-Meta abgeleitet

## Risiken & Mitigation

**Risiko:** Breaking Changes bei Schema-Imports
**Mitigation:** Schrittweise Migration, alte Schemas als deprecated markieren

**Risiko:** Type-Complexity steigt
**Mitigation:** Helper-Functions und klare Naming-Conventions

**Risiko:** Schema-Creation wird verbose
**Mitigation:** `createSchemaWithMeta` Helper abstrahiert Complexity