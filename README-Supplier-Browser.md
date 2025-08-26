# Architectural Specification & Developer Guide: SupplierBrowser

This document serves as the **single source of truth** for the project's architecture. All future development **must** adhere to the patterns and principles defined herein.

## 1. The Vision: What is the SupplierBrowser?

The SupplierBrowser is a specialized, high-performance tool for managing a 5-level data hierarchy. Its primary purpose is to provide a fast and intuitive interface for navigating and editing complex relationships between business entities.

### 1.1. The 5 Levels of the Hierarchy

The application's logic is built around a clear, five-level data model. Understanding the distinction between **Real Objects** (master data) and **Assignments** (relationship data) is critical.

-   **Level 1: Suppliers (Real Object)**
    -   **Entity**: `dbo.wholesalers`
    -   **Purpose**: The root of the hierarchy. Manages the master data of supplier entities.
    -   **API Pattern**: Standard REST (`GET [id]`, `POST /new`, `PUT [id]`, `DELETE [id]`).

-   **Level 2: Categories (Assignment)**
    -   **Entity**: `dbo.wholesaler_categories`
    -   **Purpose**: Manages the **n:m relationship** between a selected Supplier and a global `ProductCategory`. This level does not edit the categories themselves, but rather the *link* between a supplier and a category.
    -   **API Pattern**: Dedicated n:m assignment endpoints (`POST` and `DELETE` on `/api/supplier-categories`).

-   **Level 3: Offerings (Real Object)**
    -   **Entity**: `dbo.wholesaler_item_offerings`
    -   **Purpose**: Manages the master data of products offered by the selected Supplier *within* the selected Category.
    -   **API Pattern**: Standard REST.

-   **Level 4: Attributes (Assignment)**
    -   **Entity**: `dbo.wholesaler_offering_attributes`
    -   **Purpose**: Manages the **n:m relationship** between a selected Offering and a global `Attribute`, storing the specific `value` for that link.
    -   **API Pattern**: Dedicated n:m assignment endpoints.

-   **Level 5: Links (Real Object)**
    -   **Entity**: `dbo.wholesaler_offering_links`
    -   **Purpose**: Manages URL links that are directly associated with a selected Offering.
    -   **API Pattern**: Standard REST.

### 1.2. The User Experience: A URL-Driven Single-Page Application

The entire application exists on a single route (`/supplierbrowser`) and creates a seamless, app-like experience.

-   **URL-Driven State**: The UI is a direct, reactive reflection of the URL's search parameters (`level`, `supplierId`, `categoryId`, `offeringId`). We use Svelte 5 Runes (`$derived`) to listen to URL changes. This eliminates complex client-side state management.
-   **Hierarchical Sidebar**: A persistent sidebar (`HierarchySidebar.svelte`) is the main navigation. Its levels are dynamically enabled or disabled based on the current selections in the URL, creating a guided, foolproof workflow for the user.
-   **Dynamic Content Pane**: The main content area renders different grids and forms based on the current `level` in the URL, providing the correct context and actions for the user's position in the hierarchy.

---

## 2. The Architecture Deep Dive: From Type to Server

This section details the four pillars of our technical architecture.

### Pillar I: The Foundation - Generic API Types (`lib/api/types/common.ts`)

This file is the **heart of our type safety**. It defines the generic building blocks ("envelopes") for ALL API communication.

-   **Universal Response Envelope**: Every API response is either an `ApiSuccessResponse<TData>` or an `ApiErrorResponse`.
-   **Generic Request Envelopes**: `common.ts` defines the wrappers for our request bodies: `QueryRequest<T>`, `PredefinedQueryRequest`, `CreateRequest<T>`, and `UpdateRequest<TId, TData>`.
-   **Generic Operation Patterns**: It defines the full response unions for complex operations, like `DeleteApiResponse<T, D>`, and the type guards to handle them (`isDeleteConflict`).

### Pillar II: The Language - The Split Query Grammar (`lib/clientAndBack/queryGrammar.ts`)

This file defines the "language" for all queries by providing **two distinct, purpose-built payload types**:

-   **`QueryPayload<T>` (Strictly Generic):** Used for queries against a **single entity**. It is strictly typed to `keyof T`, providing **compile-time safety** against typos and invalid fields (e.g., `QueryPayload<Wholesaler>` will not allow `select: ['color']`).
-   **`JoinQueryPayload` (Flexibly Typed):** Used for **predefined JOIN queries**. Its fields are `string`, as the columns (`'w.name'`) do not belong to a single entity. Its safety is guaranteed by the server-side validation against `queryConfig.ts`.

### Pillar III: The Contract - The Self-Validating Query Config (`lib/clientAndBack/queryConfig.ts`)

This file is the central "contract" that validates itself against our domain models at compile time.

-   **`BaseTableConfig` Type**: Strictly maps a table name (e.g., `'dbo.wholesalers'`) to an array of keys of its domain type (`(keyof Wholesaler)[]`). **This makes it impossible to add a misspelled column like `'wholesaler_idxxxxx'` without a TypeScript error.**
-   **`PredefinedQueryConfig` Type**: Strictly maps a named query (e.g., `supplier_categories`) to an array of valid, auto-generated JOIN columns. **This makes it impossible to add an invalid JOIN column like `'woa.fake_column'` without a TypeScript error.**

### Pillar IV: The API Lifecycle - Endpoints & Patterns

This table summarizes the final implementation for all CRUD operations, reflecting the "Real Object vs. Assignment" logic.

| Operation | Method & URL | Request Body Type | Architectural Rationale |
| :--- | :--- | :--- | :--- |
| **Query List** | `POST /api/suppliers` | `QueryRequest<T>` | **Pragmatic Choice.** `POST` avoids `GET` URL length limits for complex filters. The endpoint is specific to the entity for security. |
| **Read Single** | `GET /api/suppliers/[id]` | *(none)* | **Pure REST.** Canonical way to fetch a resource by its unique identifier. |
| **Create** | `POST /api/suppliers/new` | `CreateRequest<T>` | **Pure REST.** Uses a special identifier (`new`). The request body *is* the new resource data, wrapped for consistency. |
| **Update** | `PUT /api/suppliers/[id]` | `UpdateRequest<TId, TData>`| **Pure REST.** The body contains the resource ID and the partial data for the update. |
| **Delete Single**| `DELETE /api/suppliers/[id]`| *(none)* | **Pure REST.** Resource identified by URL. Options (`cascade`) are passed via query parameters. |
| **Add n:m** | `POST /api/supplier-categories`| `AssignmentRequest` | **Pure REST.** `POST` creates a new *relationship*. The body contains the composite key. |
| **Remove n:m** | `DELETE /api/supplier-categories`| `RemoveAssignmentRequest`| **Pragmatic Choice.** A complex URL is avoided by passing the composite key in the body. |
| **Complex JOINs**| `POST /api/query` | `PredefinedQueryRequest` | **Secure & Explicit.** The client requests a `namedQuery`. The server uses a secure, predefined SQL template from `queryConfig.ts`. |

---

## 3. How to Use This Architecture: A Developer's Guide

### Example 1: Querying a Simple Entity (Full Type Safety)

To fetch active suppliers, the client function `loadSuppliers` constructs a **`QueryPayload<Wholesaler>`**.
```typescript
// This code lives in `lib/api/client/supplier.ts`
const query: QueryPayload<Wholesaler> = {
    select: ['wholesaler_id', 'name'], // Autocomplete for Wholesaler fields.
    // select: ['wholesaler_idxxxxx'], // <-- This would be an immediate TypeScript ERROR.
    where: { op: 'AND', conditions: [{ key: 'status', op: '=', val: 'active' }] }
};
// The function then sends this in a `QueryRequest<Wholesaler>` to `POST /api/suppliers`.
```

### Example 2: Executing a Complex JOIN Query

To fetch categories for a supplier, the client function `loadSupplierCategories` constructs a **`PredefinedQueryRequest`**.

```typescript
// This code lives in `lib/api/client/supplier.ts`
const request: PredefinedQueryRequest = {
    namedQuery: 'supplier_categories',
    payload: { // This is a `JoinQueryPayload`
        select: ['pc.name AS category_name', 'oc.offering_count'],
        // select: ['pc.naem'], // <-- This is NOT a TS error here, but will be caught
                                //     by the server, which validates it against `queryConfig.ts`.
        where: { op: 'AND', conditions: [{ key: 'w.wholesaler_id', op: '=', val: 123 }] }
    }
};
// The function sends this to the generic `/api/query` endpoint.
```

---

## 4. Next Steps: The Refactoring Plan

Verstanden. Sie haben vollkommen recht, der bisherige Fokus war unvollständig. Die Architektur muss sich über alle Ebenen erstrecken, um ihren Wert zu beweisen. Der von Ihnen vorgegebene Grundsatz – **"die höhere Ebene lädt immer die 'zu N'-Beziehungen der nächsten Ebene mit"** – ist eine exzellente und entscheidende architektonische Leitlinie. Sie verwandelt die Anwendung von einem reaktiven "Klick-und-lade"-Modell in ein proaktives "Kontext-und-lade"-Modell.

Ich werde jetzt einen detaillierten, vollständigen Plan vorlegen, der beschreibt, wie wir die restlichen Endpunkte und Client-Funktionen erstellen und wie die `supplierbrowser/+page.svelte` angepasst werden muss, um diese neue, proaktive Ladelogik über alle fünf Ebenen hinweg umzusetzen.

**Ich werde keinen Code generieren, bis Sie diesen Plan geprüft und Ihr explizites `OK` gegeben haben.**

---

# Detaillierter Plan zur Fertigstellung der Architektur

## Das Gesamtkonzept: Proaktives Laden von Kontextdaten

Die zentrale Änderung in unserem Vorgehen ist, wie wir das Laden von Daten verstehen. Anstatt nur auf den Klick auf eine neue Ebene zu warten, laden wir die relevanten Daten, sobald der *Kontext* für eine Ebene hergestellt ist.

*   **Kontext "Supplier":** Sobald ein `supplierId` in der URL ist, laden wir **proaktiv** dessen Master-Daten (`SupplierForm`) UND die Liste seiner "zu N"-Beziehungen, die Kategorien (`CategoryGrid`).
*   **Kontext "Category":** Sobald ein `categoryId` in der URL ist, laden wir **proaktiv** die Liste seiner "zu N"-Beziehungen, die Offerings (`OfferingGrid`).
*   **Kontext "Offering":** Sobald ein `offeringId` in der URL ist, laden wir **proaktiv** dessen Master-Daten (`OfferingForm`) UND die Listen seiner "zu N"-Beziehungen, die Attributes und Links (`AttributeGrid`, `LinkGrid`).

Dies führt zu einer Kaskade von Lade-Effekten, die perfekt mit Svelte 5 Runes abgebildet werden kann.

---

## Schritt 1: Level 3 (Offerings) implementieren

Offerings sind "Real Objects" und folgen dem Muster der Suppliers.

### A. Backend: Server-Endpunkte (`/routes/api/`)

1.  **Neue Endpunkte für Offerings erstellen:**
    *   `src/routes/api/offerings/new/+server.ts` (`POST`): Erstellt ein neues Offering in `dbo.wholesaler_item_offerings`. Nutzt `validateOffering` zur Validierung.
    *   `src/routes/api/offerings/[id]/+server.ts` (`GET`, `PUT`, `DELETE`):
        *   `GET`: Lädt die Master-Daten eines einzelnen Offerings.
        *   `PUT`: Aktualisiert ein Offering nach `validateOffering`.
        *   `DELETE`: Löscht ein Offering und prüft vorher auf Abhängigkeiten zu Attributes und Links (`checkOfferingDependencies`). Implementiert die Kaskadierungslogik.

2.  **`queryConfig.ts` erweitern:**
    *   Eine neue `PredefinedQueryConfig` namens `'category_offerings'` hinzufügen. Diese Query führt einen `JOIN` zwischen `dbo.wholesaler_item_offerings` und `dbo.product_definitions` durch, um die Angebotsdaten mit den Produkttiteln anzureichern.

### B. API-Client: Eine neue Datei für Offerings

Um die Trennung der Zuständigkeiten sauber zu halten, erstellen wir eine neue Client-Datei.

1.  **Neue Datei erstellen: `src/lib/api/client/offering.ts`**
2.  **Folgende Funktionen implementieren:**
    *   `loadOfferingsForCategory(supplierId: number, categoryId: number): Promise<OfferingWithDetails[]>`: Ruft `/api/query` mit `namedQuery: 'category_offerings'` und den entsprechenden `where`-Bedingungen auf.
    *   `loadOffering(offeringId: number): Promise<OfferingWithDetails>`: Ruft `GET /api/offerings/[id]` auf.
    *   `createOffering(data: ...)`: Ruft `POST /api/offerings/new` auf.
    *   `updateOffering(id: number, data: ...)`: Ruft `PUT /api/offerings/[id]` auf.
    *   `deleteOffering(id: number, cascade: boolean)`: Ruft `DELETE /api/offerings/[id]` auf und nutzt `apiFetchUnion`.

### C. Frontend: Anpassung von `supplierbrowser/+page.svelte`

1.  **Imports:** Die neuen Funktionen aus `offering.ts` importieren.
2.  **State:** Neue `$state`-Variablen für Offerings hinzufügen.
    ```typescript
    let offerings = $state<OfferingWithDetails[]>([]);
    let loadingOfferings = $state(false);
    ```
3.  **Daten laden:**
    *   Eine neue `async function fetchOfferingsForCategory(supplierId: number, categoryId: number)` erstellen. Diese Funktion ruft `loadOfferingsForCategory` aus dem neuen Client auf und füllt den `$state`. Sie wird mit `try/catch` und Loading-Flags versehen.
    *   Einen neuen `$effect` erstellen, der auf Änderungen von `selectedCategoryId` reagiert und `fetchOfferingsForCategory` aufruft.
4.  **UI & Events:**
    *   Den `{#if currentLevel === 'offerings'}`-Block anpassen, um das `OfferingGrid` mit den echten `offerings`-Daten und dem `loadingOfferings`-Status zu füttern (Mock-Daten werden entfernt).
    *   Einen neuen Handler `handleOfferingSelect` erstellen, der die URL aktualisiert (`level=attributes`, `offeringId=...`).
    *   Einen neuen Handler `handleOfferingDelete` implementieren, der den `isDeleteConflict`-Workflow für Offerings abbildet.

---

## Schritt 2: Level 4 & 5 (Attributes & Links) implementieren

Attributes sind "Assignments" (wie Categories), Links sind "Real Objects" (wie Offerings). Beide gehören zum Kontext eines Offerings und werden gemäß dem neuen Prinzip **zusammen** geladen.

### A. Backend: Server-Endpunkte

1.  **Neue Endpunkte für Attribute (Assignment):**
    *   `src/routes/api/offering-attributes/+server.ts` (`POST`, `DELETE`): Eine Kopie der Logik von `supplier-categories`, aber für die Tabelle `dbo.wholesaler_offering_attributes`.
2.  **Neue Endpunkte für Links (Real Object):**
    *   `src/routes/api/links/new/+server.ts` (`POST`): Erstellt einen neuen Link.
    *   `src/routes/api/links/[id]/+server.ts` (`GET`, `PUT`, `DELETE`): Verwaltet einzelne Links.
3.  **`queryConfig.ts` erweitern:**
    *   Neue `PredefinedQueryConfig` `'offering_attributes'` (JOIN mit `dbo.attributes`).
    *   Neue `PredefinedQueryConfig` `'offering_links'` (einfaches SELECT auf `dbo.wholesaler_offering_links`, gefiltert nach `offering_id`).

### B. API-Client: Erweiterung von `offering.ts`

Die bestehende `offering.ts` wird erweitert, da diese Operationen im Kontext eines Offerings stattfinden.

1.  **Folgende Funktionen hinzufügen:**
    *   `loadAttributesForOffering(offeringId: number)`
    *   `assignAttributeToOffering(data: ...)`
    *   `removeAttributeFromOffering(data: ...)`
    *   `loadLinksForOffering(offeringId: number)`
    *   `createLink(data: ...)`
    *   `updateLink(id: number, data: ...)`
    *   `deleteLink(id: number)`

### C. Frontend: Finale Anpassung von `supplierbrowser/+page.svelte`

1.  **Imports:** Die neuen Funktionen aus `offering.ts` importieren.
2.  **State:**
    *   Neue `$state`-Variablen: `let attributes = $state<...>`, `let links = $state<...>`, `let loadingDetailsForOffering = $state(false)`.
    *   Einen neuen `$derived`-State: `const selectedOfferingId = $derived(...)`.
3.  **Daten laden (gemäß neuem Prinzip):**
    *   Eine neue `async function fetchDetailsForOffering(offeringId: number)` erstellen.
    *   Diese Funktion nutzt `Promise.all` um **gleichzeitig** die Master-Daten des Offerings, die Liste der Attribute und die Liste der Links zu laden:
        ```typescript
        const [offeringDetails, attributes, links] = await Promise.all([
            loadOffering(offeringId),
            loadAttributesForOffering(offeringId),
            loadLinksForOffering(offeringId)
        ]);
        ```
    *   Einen neuen `$effect` erstellen, der auf `selectedOfferingId` reagiert und `fetchDetailsForOffering` aufruft.
4.  **UI & Events:**
    *   Ein `{#if currentLevel === 'attributes' || currentLevel === 'links'}`-Block wird erstellt. Dieser Block wird die Master-Daten des ausgewählten Offerings in einem `OfferingForm` anzeigen, darunter dann das `AttributeGrid` und das `LinkGrid`.
    *   Die entsprechenden `handle...`-Funktionen für das Zuweisen/Entfernen von Attributen und das Erstellen/Löschen von Links werden implementiert.



