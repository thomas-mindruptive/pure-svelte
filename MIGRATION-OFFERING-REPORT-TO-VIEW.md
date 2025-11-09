# Migration: OfferingReportListPage auf view_offerings_pt_pc_pd umstellen

## Ziel
Die OfferingReportListPage soll den DB-View `view_offerings_pt_pc_pd` verwenden, um die "komplette Breite" der Offering-Daten abzufragen (inkl. Product Type, Product Category, Product Definition mit allen Lookups).

## Übersicht

**Aktueller Stand:**
- OfferingReportListPage → API `/api/offerings/nested` → `loadNestedOfferingsOptimized()` → Complex JOIN mit FOR JSON PATH
- Rückgabe: `Wio_PDef_Cat_Supp_Nested_WithLinks[]` (nested structure)

**Ziel-Stand:**
- OfferingReportListPage → API `/api/offerings/report` → `loadOfferingsFromView()` → SELECT * FROM view_offerings_pt_pc_pd
- Rückgabe: `OfferingReportRow[]` (flat structure from view)

## View-Struktur (view_offerings_pt_pc_pd)

Der View enthält folgende Spalten (alle FLAT, keine Nested Objects):

### Wholesaler (w)
- `wsId` (wholesaler_id)
- `wsName` (name)

### Product Type (pt)
- `ptName` (name)

### Product Category (pc)
- `pcId` (category_id)
- `catName` (name)
- `catDescription` (description)

### Product Definition (pd)
- `pdefId` (product_def_id)
- `pdefTitle` (title)
- `pdefFormId`, `pdefFormName`
- `pdefMatId`, `pdefMatName`
- `pdConstrTypeId`, `pdConstrTypeName`
- `pdSurfFinId`, `pdSurfFinName`

### Offering (wio)
- `wioId` (offering_id)
- `wioTitle` (title)
- `wioPrice` (price)
- `wioSize` (size)
- `wioFormId`, `wioFormName`
- `wioMatId`, `wioMaterialName`
- `wioConstrTypeId`, `wioConstrTypeName`
- `wioSurfFinId`, `wioSurfFinishName`
- `wioDimensions` (dimensions)
- `wioComment` (comment)
- `wioWeightGrams` (weight_grams)

## Migrations-Schritte

### 1. Zod Schema für View erstellen

**Datei:** `src/lib/domain/domainTypes.ts`

**Aufgabe:** Neues Schema hinzufügen für die View-Daten (flat structure):

```typescript
// ===== OFFERING REPORT VIEW (dbo.view_offerings_pt_pc_pd) =====

const OfferingReportViewSchemaBase = z.object({
  // Wholesaler
  wsId: z.number().int().positive(),
  wsName: z.string().max(200),

  // Product Type
  ptName: z.string().max(200),

  // Product Category
  pcId: z.number().int().positive(),
  catName: z.string().max(200),
  catDescription: z.string().max(500).nullable().optional(),

  // Product Definition
  pdefId: z.number().int().positive(),
  pdefTitle: z.string().max(500),
  pdefFormId: z.number().int().positive().nullable().optional(),
  pdefFormName: z.string().max(200).nullable().optional(),
  pdefMatId: z.number().int().positive().nullable().optional(),
  pdefMatName: z.string().max(200).nullable().optional(),
  pdConstrTypeId: z.number().int().positive().nullable().optional(),
  pdConstrTypeName: z.string().max(200).nullable().optional(),
  pdSurfFinId: z.number().int().positive().nullable().optional(),
  pdSurfFinName: z.string().max(200).nullable().optional(),

  // Offering
  wioId: z.number().int().positive(),
  wioTitle: z.string().max(500),
  wioPrice: z.number().nullable().optional(),
  wioSize: z.string().max(200).nullable().optional(),
  wioFormId: z.number().int().positive().nullable().optional(),
  wioFormName: z.string().max(200).nullable().optional(),
  wioMatId: z.number().int().positive().nullable().optional(),
  wioMaterialName: z.string().max(200).nullable().optional(),
  wioConstrTypeId: z.number().int().positive().nullable().optional(),
  wioConstrTypeName: z.string().max(200).nullable().optional(),
  wioSurfFinId: z.number().int().positive().nullable().optional(),
  wioSurfFinishName: z.string().max(200).nullable().optional(),
  wioDimensions: z.string().max(200).nullable().optional(),
  wioComment: z.string().max(4000).nullable().optional(),
  wioWeightGrams: z.number().nullable().optional(),
}).describe("OfferingReportViewSchema");

export const OfferingReportViewSchema = createSchemaWithMeta(OfferingReportViewSchemaBase, {
  alias: "v",
  tableName: "view_offerings_pt_pc_pd",
  dbSchema: "dbo",
} as const);

export type OfferingReportView = z.infer<typeof OfferingReportViewSchema>;
```

**Export hinzufügen:** Am Ende der Datei das neue Schema exportieren.

---

### 2. Backend-Funktion für View-Query erstellen

**Datei:** `src/lib/backendQueries/entityOperations/offering.ts`

**Aufgabe:** Neue Funktion hinzufügen, die den View abfragt:

```typescript
import type { OfferingReportView } from "$lib/domain/domainTypes";

/**
 * Loads offerings from the view_offerings_pt_pc_pd view.
 * This provides the complete "breadth" of offering data including product type, category, and all lookups.
 *
 * @param transaction - Active database transaction
 * @param aWhere - Optional WHERE conditions (use view column names like "wioMaterialName", "pdefMatName")
 * @param aOrderBy - Optional sort descriptors (use view column names)
 * @param aLimit - Optional limit for pagination
 * @param aOffset - Optional offset for pagination
 * @returns Array of flat offering report rows
 */
export async function loadOfferingsFromView(
  transaction: Transaction,
  aWhere?: WhereConditionGroup<OfferingReportView> | WhereCondition<OfferingReportView>,
  aOrderBy?: SortDescriptor<OfferingReportView>[],
  aLimit?: number,
  aOffset?: number,
): Promise<OfferingReportView[]> {
  assertDefined(transaction, "transaction");
  log.debug(`loadOfferingsFromView`, { aWhere, aOrderBy, aLimit, aOffset });

  const ctx: BuildContext = {
    parameters: {},
    paramIndex: 0,
  };

  let whereClause = "";
  if (aWhere) {
    whereClause = `WHERE ${buildWhereClause(aWhere, ctx, false)}`; // hasJoins = false (view, not table joins)
  }

  // Build ORDER BY clause
  let orderByClause = "";
  if (aOrderBy && aOrderBy.length > 0) {
    orderByClause = `ORDER BY ${aOrderBy.map((s) => `${String(s.key)} ${s.direction}`).join(", ")}`;
  } else if (aLimit || aOffset) {
    orderByClause = "ORDER BY wioId ASC"; // Default order for pagination
  }

  // Build LIMIT/OFFSET clause
  let limitClause = "";
  if (aLimit && aLimit > 0) {
    limitClause = `OFFSET ${aOffset || 0} ROWS FETCH NEXT ${aLimit} ROWS ONLY`;
  } else if (aOffset && aOffset > 0) {
    limitClause = `OFFSET ${aOffset} ROWS`;
  }

  const request = transaction.request();

  // Bind parameters
  for (const [key, value] of Object.entries(ctx.parameters)) {
    request.input(key, value);
  }

  const sql = `
    SELECT *
    FROM dbo.view_offerings_pt_pc_pd
    ${whereClause}
    ${orderByClause}
    ${limitClause}
  `;

  log.debug('========================================');
  log.debug('VIEW QUERY SQL:');
  log.debug(sql);
  log.debug('PARAMETERS:', ctx.parameters);
  log.debug('========================================');

  const t0 = Date.now();
  const result = await request.query(sql);
  log.debug(`[VIEW] Query took: ${Date.now() - t0}ms`);

  if (!result.recordset?.length) {
    return [];
  }

  return result.recordset as OfferingReportView[];
}
```

---

### 3. API Endpoint erstellen

**Datei:** `src/routes/api/offerings/report/+server.ts` (NEU)

**Aufgabe:** Neuen Endpoint erstellen, der die View-Funktion aufruft:

```typescript
// src/routes/api/offerings/report/+server.ts

/**
 * @file Offering Report API Endpoint (uses view_offerings_pt_pc_pd)
 * @description Provides POST operation for querying the offering report view with all product/category/lookup data.
 */

import type { ApiSuccessResponse, QueryResponseData } from "$lib/api/api.types";
import { db } from "$lib/backendQueries/db";
import { loadOfferingsFromView } from "$lib/backendQueries/entityOperations/offering";
import { buildUnexpectedError } from "$lib/backendQueries/genericEntityOperations";
import type { QueryPayload } from "$lib/backendQueries/queryGrammar";
import { rollbackTransaction } from "$lib/backendQueries/transactionWrapper";
import { type OfferingReportView } from "$lib/domain/domainTypes";
import { log } from "$lib/utils/logger";
import { json, type RequestHandler } from "@sveltejs/kit";
import { v4 as uuidv4 } from "uuid";

/**
 * POST /api/offerings/report
 * @description Retrieves offerings from view_offerings_pt_pc_pd with flexible filtering and sorting.
 */
export const POST: RequestHandler = async ({ request }) => {
  const operationId = uuidv4();
  const info = `POST /api/offerings/report - ${operationId}`;
  log.infoHeader(info);

  const transaction = db.transaction();

  try {
    const payload: QueryPayload<OfferingReportView> = await request.json();
    log.info(`[${operationId}] Parsed request payload`, {
      hasWhere: !!payload.where,
      hasOrderBy: !!payload.orderBy,
      limit: payload.limit,
      offset: payload.offset,
    });

    await transaction.begin();
    log.info(`[${operationId}] Transaction started for view query.`);

    try {
      const t0 = Date.now();
      const offeringsArray = await loadOfferingsFromView(
        transaction,
        payload.where,
        payload.orderBy,
        payload.limit,
        payload.offset,
      );
      console.log(`[PERF] [${operationId}] View query took: ${Date.now() - t0}ms`);
      log.debug(`[${operationId}] Loaded ${offeringsArray.length} offerings from view.`);

      await transaction.commit();
      log.info(`[${operationId}] Transaction committed successfully.`);

      const responseData: QueryResponseData<OfferingReportView> = {
        results: offeringsArray,
        meta: {
          retrieved_at: new Date().toISOString(),
          result_count: offeringsArray.length,
          columns_selected: ["*"],
          has_joins: false, // View handles joins
          has_where: !!payload.where,
          parameter_count: 0,
          table_fixed: "view_offerings_pt_pc_pd",
          sql_generated: "view query",
        },
      };

      const response: ApiSuccessResponse<QueryResponseData<OfferingReportView>> = {
        success: true,
        message: "Offering report data retrieved successfully.",
        data: responseData,
        meta: { timestamp: new Date().toISOString() },
      };

      log.info(`[${operationId}] FN_SUCCESS: Returning ${offeringsArray.length} offerings from view.`);
      return json(response);
    } catch (err) {
      await rollbackTransaction(transaction);
      log.error(`[${operationId}] Transaction failed, rolling back.`, { error: err });
      throw err;
    }
  } catch (err: unknown) {
    if ((err as { status?: number })?.status === 404) {
      throw err;
    }
    return buildUnexpectedError(err, info);
  }
};
```

---

### 4. API Client-Methode hinzufügen

**Datei:** `src/lib/api/client/offering.ts`

**Aufgabe:** Neue Methode im `getOfferingApi` Factory hinzufügen:

```typescript
import type { OfferingReportView } from "$lib/domain/domainTypes";

// In getOfferingApi Factory:

/**
 * Loads offerings for report using the view_offerings_pt_pc_pd view.
 * Provides complete breadth of data (product type, category, lookups).
 */
async loadOfferingsForReport(
  aWhere?: WhereConditionGroup<OfferingReportView> | WhereCondition<OfferingReportView> | null,
  aOrderBy?: SortDescriptor<OfferingReportView>[] | null,
  aLimit?: number | null,
  aOffset?: number | null,
): Promise<OfferingReportView[]> {
  const operationId = `loadOfferingsForReport`;
  offeringLoadingManager.start(operationId);
  try {
    const payload: QueryPayload<OfferingReportView> = {
      select: [],
      ...(aWhere && { where: aWhere }),
      ...(aOrderBy && { orderBy: aOrderBy }),
      ...(aLimit && { limit: aLimit }),
      ...(aOffset && { offset: aOffset }),
    };

    const responseData = await client.apiFetch<QueryResponseData<OfferingReportView>>(
      "/api/offerings/report",
      { method: "POST", body: createJsonBody(payload) },
      { context: operationId },
    );
    return responseData.results;
  } catch (err) {
    log.error(`[${operationId}] Failed.`, { error: getErrorMessage(err) });
    throw err;
  } finally {
    offeringLoadingManager.finish(operationId);
  }
},
```

---

### 5. OfferingReportListPage anpassen

**Datei:** `src/lib/components/domain/reports/offerings/OfferingReportListPage.svelte`

**Aufgabe:** Typ und API-Aufruf ändern:

```typescript
// VORHER:
import type { Wio_PDef_Cat_Supp_Nested_WithLinks } from "$lib/domain/domainTypes";

type Props = {
  data: {
    offerings: Promise<Wio_PDef_Cat_Supp_Nested_WithLinks[]>;
    loadEventFetch: typeof fetch;
  };
};

let resolvedOfferings = $state<Wio_PDef_Cat_Supp_Nested_WithLinks[]>([]);

// NACHHER:
import type { OfferingReportView } from "$lib/domain/domainTypes";

type Props = {
  data: {
    offerings: Promise<OfferingReportView[]>;
    loadEventFetch: typeof fetch;
  };
};

let resolvedOfferings = $state<OfferingReportView[]>([]);

// API-Aufrufe ändern:
// VORHER:
resolvedOfferings = await offeringApi.loadNestedOfferingsWithLinks(where, currentSort);

// NACHHER:
resolvedOfferings = await offeringApi.loadOfferingsForReport(where, currentSort);
```

---

### 6. OfferingReportGrid anpassen

**Datei:** `src/lib/components/domain/reports/offerings/OfferingReportGrid.svelte`

**Aufgabe:** Spalten-Definitionen für View-Struktur anpassen:

```typescript
// VORHER:
import type { Wio_PDef_Cat_Supp_Nested_WithLinks } from "$lib/domain/domainTypes";
import { Wio_PDef_Cat_Supp_Nested_WithLinks_Schema } from "$lib/domain/domainTypes";

type Props = {
  rows: Wio_PDef_Cat_Supp_Nested_WithLinks[];
  loading: boolean;
  onFilter: FilterFunc<Wio_PDef_Cat_Supp_Nested_WithLinks>;
  onSort: SortFunc<Wio_PDef_Cat_Supp_Nested_WithLinks>;
};

// NACHHER:
import type { OfferingReportView } from "$lib/domain/domainTypes";
import { OfferingReportViewSchema } from "$lib/domain/domainTypes";

type Props = {
  rows: OfferingReportView[];
  loading: boolean;
  onFilter: FilterFunc<OfferingReportView>;
  onSort: SortFunc<OfferingReportView>;
};

// Spalten-Definitionen komplett neu (view column names):
const columns: ColumnDef<typeof OfferingReportViewSchema>[] = [
  {
    key: "wioId",
    header: "ID",
    accessor: (row) => row.wioId,
    sortable: true,
    filterable: true,
    filterType: "number",
    width: "80px"
  },
  {
    key: "wioTitle",
    header: "Offering Title",
    accessor: (row) => row.wioTitle || "-",
    sortable: true,
    filterable: true,
    filterType: "text",
    width: "200px",
    isLink: true,
    onClick: handleOfferingClick
  },
  {
    key: "ptName",
    header: "Product Type",
    accessor: (row) => row.ptName || "-",
    sortable: true,
    filterable: true,
    filterType: "text",
    width: "150px"
  },
  {
    key: "catName",
    header: "Category",
    accessor: (row) => row.catName || "-",
    sortable: true,
    filterable: true,
    filterType: "text",
    width: "150px"
  },
  {
    key: "pdefTitle",
    header: "Product Def",
    accessor: (row) => row.pdefTitle || "-",
    sortable: true,
    filterable: true,
    filterType: "text",
    width: "200px"
  },
  {
    key: "wsName",
    header: "Wholesaler",
    accessor: (row) => row.wsName || "-",
    sortable: true,
    filterable: true,
    filterType: "text",
    width: "150px"
  },
  {
    key: "pdefMatName",
    header: "PDef Material",
    accessor: (row) => row.pdefMatName || "-",
    sortable: true,
    filterable: true,
    filterType: "text",
    width: "120px"
  },
  {
    key: "wioMaterialName",
    header: "WIO Material",
    accessor: (row) => row.wioMaterialName || "-",
    sortable: true,
    filterable: true,
    filterType: "text",
    width: "120px"
  },
  {
    key: "pdefFormName",
    header: "PDef Form",
    accessor: (row) => row.pdefFormName || "-",
    sortable: true,
    filterable: true,
    filterType: "text",
    width: "120px"
  },
  {
    key: "wioFormName",
    header: "WIO Form",
    accessor: (row) => row.wioFormName || "-",
    sortable: true,
    filterable: true,
    filterType: "text",
    width: "120px"
  },
  {
    key: "pdConstrTypeName",
    header: "PDef Constr Type",
    accessor: (row) => row.pdConstrTypeName || "-",
    sortable: true,
    filterable: true,
    filterType: "text",
    width: "150px"
  },
  {
    key: "wioConstrTypeName",
    header: "WIO Constr Type",
    accessor: (row) => row.wioConstrTypeName || "-",
    sortable: true,
    filterable: true,
    filterType: "text",
    width: "150px"
  },
  {
    key: "pdSurfFinName",
    header: "PDef Surface",
    accessor: (row) => row.pdSurfFinName || "-",
    sortable: true,
    filterable: true,
    filterType: "text",
    width: "120px"
  },
  {
    key: "wioSurfFinishName",
    header: "WIO Surface",
    accessor: (row) => row.wioSurfFinishName || "-",
    sortable: true,
    filterable: true,
    filterType: "text",
    width: "120px"
  },
  {
    key: "wioPrice",
    header: "Price",
    accessor: (row) => row.wioPrice ? row.wioPrice.toFixed(2) : "-",
    sortable: true,
    filterable: true,
    filterType: "number",
    width: "100px"
  },
  {
    key: "wioSize",
    header: "Size",
    accessor: (row) => row.wioSize || "-",
    sortable: true,
    filterable: true,
    filterType: "text",
    width: "100px"
  },
  {
    key: "wioDimensions",
    header: "Dimensions",
    accessor: (row) => row.wioDimensions || "-",
    sortable: true,
    filterable: true,
    filterType: "text",
    width: "120px"
  },
  {
    key: "wioWeightGrams",
    header: "Weight (g)",
    accessor: (row) => row.wioWeightGrams ? row.wioWeightGrams.toString() : "-",
    sortable: true,
    filterable: true,
    filterType: "number",
    width: "100px"
  },
  {
    key: "wioComment",
    header: "Comment",
    accessor: (row) => row.wioComment ? row.wioComment.substring(0, 50) + "..." : "-",
    sortable: false,
    filterable: true,
    filterType: "text",
    width: "200px"
  },
];

// Navigation handler anpassen:
function handleOfferingClick(row: OfferingReportView) {
  const categoryId = row.pcId;
  const productDefId = row.pdefId;
  const offeringId = row.wioId;

  if (categoryId && productDefId && offeringId) {
    const url = `/categories/${categoryId}/productdefinitions/${productDefId}/offerings/${offeringId}`;
    log.info(`[OfferingReportGrid] Navigating to: ${url}`);
    goto(url);
  } else {
    log.warn(`[OfferingReportGrid] Cannot navigate - missing IDs`, { categoryId, productDefId, offeringId });
  }
}

// getId function anpassen:
function getId(row: OfferingReportView): number {
  return row.wioId;
}
```

---

### 7. Route Loader anpassen

**Datei:** `src/routes/(browser)/reports/offerings/+page.ts`

**Aufgabe:** API-Aufruf und Typ ändern:

```typescript
// VORHER:
import type { Wio_PDef_Cat_Supp_Nested_WithLinks } from "$lib/domain/domainTypes";

export async function load({ fetch }) {
  const client = new ApiClient(fetch);
  const offeringApi = getOfferingApi(client);

  const offerings: Promise<Wio_PDef_Cat_Supp_Nested_WithLinks[]> = offeringApi.loadNestedOfferingsWithLinks();

  return {
    offerings,
    loadEventFetch: fetch,
  };
}

// NACHHER:
import type { OfferingReportView } from "$lib/domain/domainTypes";

export async function load({ fetch }) {
  const client = new ApiClient(fetch);
  const offeringApi = getOfferingApi(client);

  const offerings: Promise<OfferingReportView[]> = offeringApi.loadOfferingsForReport();

  return {
    offerings,
    loadEventFetch: fetch,
  };
}
```

---

## Wichtige Hinweise

### Column Keys in Filtern/Sortierung
- **WICHTIG:** View-Spaltennamen verwenden (z.B. `wioMaterialName`, `pdefMatName`)
- **NICHT** die alten qualified names (z.B. `wio.material_id`, `pd.title`)

### Navigation
- Navigation zu Offering Detail bleibt gleich (nutzt `pcId`, `pdefId`, `wioId`)

### Performance
- View ist optimiert für Reporting (denormalisiert)
- Keine JSON-Parsing mehr nötig (direkte recordset)
- Einfachere WHERE-Klauseln (keine JOINs im Query Builder)

### Struktur-Unterschied
- **ALT:** Nested objects (`row.wholesaler.name`, `row.product_def.title`)
- **NEU:** Flat structure (`row.wsName`, `row.pdefTitle`)

---

## Reihenfolge der Umsetzung

1. **Schema** (domainTypes.ts) - Basis für alle anderen Schritte
2. **Backend Function** (offering.ts) - Query-Logik
3. **API Endpoint** (+server.ts) - REST-Interface
4. **API Client** (offering.ts) - Client-Side API
5. **ListPage** (OfferingReportListPage.svelte) - State Management
6. **Grid** (OfferingReportGrid.svelte) - UI
7. **Route Loader** (+page.ts) - Initial Data Load

---

## Testing

Nach der Migration testen:
1. Report-Seite lädt ohne Fehler
2. Alle Spalten zeigen korrekte Daten
3. Filter funktionieren (z.B. nach Material, Form)
4. Sortierung funktioniert
5. Navigation zu Offering Detail funktioniert
6. Performance ist gut (sollte schneller sein als vorher)

---

## Rollback-Strategie

Falls Probleme auftreten:
- Alte API-Route bleibt erhalten (`/api/offerings/nested`)
- Alte Client-Methode bleibt erhalten (`loadNestedOfferingsWithLinks`)
- Einfach in ListPage und +page.ts zurück zur alten Methode wechseln
