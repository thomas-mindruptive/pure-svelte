✅ 2. Backend-Funktion

  // offering.ts
  export async function loadOfferingsFromView(...)
  export async function loadOfferingsFromViewWithLinks(...) // NEU!

  loadOfferingsFromViewWithLinks() - Kombiniert View + Links:
  - Table Variable Pattern (@offering_ids)
  - 3-Step Batch Query (1 Roundtrip):
    a. IDs sammeln (WHERE/ORDER/LIMIT)
    b. View-Daten für IDs
    c. Links als FOR JSON PATH
  - Merge: Links via wioId statt offering_id

  ✅ 3. API Endpoint

  // src/routes/api/offerings/report/+server.ts
  POST /api/offerings/report

  ✅ 4. API Client

  // offering.ts
  async loadOfferingsForReport(...)

  ✅ 5-7. Frontend

  - OfferingReportListPage: Typ Wio_PDef_Cat_Supp_Nested_WithLinks → OfferingReportView
  - OfferingReportGrid: 19 Spalten neu mit View-Namen (wioId, wioTitle, wsName, ptName, etc.)
  - Route Loader: loadNestedOfferingsWithLinks() → loadOfferingsForReport()

  ✅ 8. npm run check

  0 Errors, 0 Warnings

  Wichtige Unterschiede:
  - ALT: Nested (row.wholesaler.name, row.product_def.title)
  - NEU: Flat (row.wsName, row.pdefTitle)
  - ALT: Qualified keys ("w.name", "pd.title")
  - NEU: View keys ("wsName", "pdefTitle")

  ---
  3. Architektur-Muster (zur Erinnerung)

  Type-Safe Schema System

  - Branded Schemas mit createSchemaWithMeta() - trägt __brandMeta (alias, tableName, dbSchema)
  - copyMetaFrom() nach .omit(), .extend()

  Query Grammar & SQL Generation

  - QueryPayload<T> für WHERE/ORDER BY/SELECT
  - Qualified Columns: "w.name", "pd.title" (mit Joins) vs. View-Namen: "wsName", "pdefTitle"
  - genTypedQualifiedColumns() für JOINs

  Data Loading Patterns

  - Pattern 1: load() returns Promises → Component awaits in $effect
  - Pattern 2: load() returns nur IDs → Component fetched selbst

  API Structure

  - Master Data: 5 Endpoints (list, [id], new, PUT, DELETE)
  - Relationships: /api/<parent>-<child>
  - Generic Types: CreateChildRequest, AssignmentRequest, DeleteRequest

  ---
  4. Offene Fragen (PLAN MODE)

  Der User hat gesagt "ok" zur loadOfferingsFromViewWithLinks() Funktion. Er hat NICHT explizit gesagt, ob ich diese auch:
  - Im API Endpoint verfügbar machen soll
  - Im API Client verfügbar machen soll
  - In der OfferingReportListPage verwenden soll

  Aktueller Stand: Nur Backend-Funktion erstellt, noch nicht exponiert.

  ---
  5. Wichtige Files

  - CSS: detail-page-layout.css, grid-section.css, +layout.svelte
  - Schema: domainTypes.ts (Zeile 774-823: OfferingReportViewSchema)
  - Backend: entityOperations/offering.ts (Zeile 638-848: View-Funktionen)
  - API: api/offerings/report/+server.ts
  - Client: api/client/offering.ts (Zeile 842-875: loadOfferingsForReport)
  - Frontend: OfferingReportListPage.svelte, OfferingReportGrid.svelte
  - Loader: offeringReportListPage.ts