# SupplierBrowser - Architectural Specification & Developer Guide

**Single source of truth for the project's architecture. All development must adhere to the patterns and principles defined herein.**

---

## The Vision: What is the SupplierBrowser?

The SupplierBrowser suppliers/wholesalers. Its primary purpose is to provide a fast and intuitive interface for navigating and editing complex relationships between business entities.

### The 5 Levels of the Hierarchy

The application's logic is built around hierarchical data model. Understanding the distinction between **Master Data**, **Hierarchical Real Objects**, and **Relationships** is critical.

#### Level 1: Suppliers (Master Data)
- **Entity**: `dbo.wholesalers`
- **Purpose**: Independent master data entities that can be queried flexibly.
- **API Pattern**: QueryPayload for lists + Standard CRUD for individuals.
- **Creation**: `/api/suppliers/new` POST with direct entity data.

#### Level 2: Categories (Relationship - Simple Assignment)  
- **Entity**: `dbo.wholesaler_categories`
- **Purpose**: Pure n:m relationship between suppliers and global categories.
- **Properties**: `comment`, `link` (simple metadata).
- **API Pattern**: `/api/supplier-categories` CREATE/DELETE with `AssignmentRequest`.
- **Master Data**: Category definitions via `/api/categories/new`.

#### Level 3: Offerings (Attributed n:m Relationship)
- **Entity**: `dbo.wholesaler_item_offerings`
- **Purpose**: A central master data entity that realizes the n:m relationship between a `Wholesaler` and a `ProductDefinition`, carrying its own attributes like `price` and `size`.
- **Key Characteristic**: While being a master data entity with its own CRUD endpoints, it is logically dependent on its parents (`Wholesaler`, `ProductCategory`, `ProductDefinition`) for context. A supplier can have multiple offerings for the same product definition (e.g., different sizes or conditions).
- **API Pattern**: Centralized CRUD via `/api/offerings/[id]`. Creation via `POST /api/offerings/new` with a body containing all required foreign keys (`wholesaler_id`, `category_id`, `product_def_id`).
- **Master Data**: Product definitions via `/api/product-definitions/new`.

#### Level 4: Attributes (Relationship - Attributed)
- **Entity**: `dbo.wholesaler_offering_attributes`  
- **Purpose**: n:m relationship between offerings and attributes WITH business data (`value`).
- **Key Distinction**: Not just a link - stores attribute values (e.g., Color="Red").
- **API Pattern**: `/api/offering-attributes` CREATE/UPDATE/DELETE with `AssignmentRequest`.
- **Master Data**: Attribute definitions via `/api/attributes/new`.

#### Level 5: Links (Relationship - 1:n Composition)
- **Entity**: `dbo.wholesaler_offering_links`
- **Purpose**: Links that belong to specific offerings.
- **API Pattern**: `/api/offering-links` CREATE/UPDATE/DELETE with `CreateChildRequest`.

The API patterns mentioned above, such as `AssignmentRequest` and `CreateChildRequest`, utilize a set of universal, type-safe structures. These are defined in detail in the **Generic Type System - FINALIZED ARCHITECTURE** chapter.

### The User Experience: SvelteKit-Powered 

The application leverages SvelteKit's file-based routing to provide a robust and bookmarkable user experience. The state of the application is primarily driven by the URL's path, creating a seamless, app-like feel with client-side navigation. This approach replaces the previous query-parameter-based state management. See the Frontend Architecture section for a detailed breakdown.

---

## Do / Don't (Enforced)

- **Do:**
  - Use `validateAndInsertEntity` / `validateAndUpdateEntity` for all create/update flows.
  - Keep view alias names and report schema names exactly aligned (1:1).
  - Use `onQueryChange` for Datagrid (filters + sort combined); persist with `gridId`.
  - Write idempotent ALTER scripts; update the view safely.
- **Don't:**
  - Don't write INSERT/UPDATE SQL in API routes.
  - Don't add report grid columns without matching view + report schema fields.
  - Don't use `onSort` for new code (legacy).
  - Don't add UI fields that do not exist in the schema.

---

## Generic Type System 

### Core Generic Types with Request Pattern Distinction

```typescript
// Automatic ID field extraction from entity types
type IdField<T> = Extract<keyof T, `${string}_id`>;

// 1:n Hierarchical Creation (one parent ID, child exists in parent context)
export type CreateChildRequest<TParent, TChild> = {
    parentId: TParent[IdField<TParent>];
    data: TChild;
}

// Assignment between two master entities (n:m relationships)
export type AssignmentRequest<TParent1, TParent2, TChild> = {
    parent1Id: TParent1[IdField<TParent1>];
    parent2Id: TParent2[IdField<TParent2>];
    data?: TChild
}

// Update assignment between two master entities
export type AssignmentUpdateRequest<TParent1, TParent2,TChild> = {
    parent1Id: TParent1[IdField<TParent1>];
    parent2Id: TParent2[IdField<TParent2>];
    data?: TChild
}

// Remove assignment between two master entities
export type RemoveAssignmentRequest<TParent1, TParent2> = {
    parent1Id: TParent1[IdField<TParent1>];
    parent2Id: TParent2[IdField<TParent2>];
    cascade?: boolean;
};

// Deletion of an entity by its ID
export type DeleteRequest<T> = {
    id: T[IdField<T>];
    cascade?: boolean;
    forceCascade?: boolean;
};
```

### Request Pattern Decision Matrix

| Relationship Type | Pattern | Use Case | Example |
|---|---|---|---|
| **Master Data Creation** | Direct Entity Data | Independent entities | `POST /api/suppliers/new` with `Omit<Wholesaler, 'wholesaler_id'>` |
| **1:n Hierarchical Creation**| `CreateChildRequest<Parent, Child>` | Child exists only in parent context | `POST /api/offering-links` |
| **n:m Assignment** | `AssignmentRequest` | Link two existing entities | `POST /api/supplier-categories` |
| **Generic Query** | **`QueryRequest<T>`** | Flexible querying for lists or complex joins | `POST /api/query` |


### Redundancy Handling in `CreateChildRequest`

For hierarchical relationships, the API accepts controlled redundancy between the parent context and the child's foreign key in the request body.

```typescript
// Client sends a request to POST /api/offering-links
// The parentId (123) is provided in the body for consistency.
CreateChildRequest<WholesalerItemOffering, Partial<Omit<WholesalerOfferingLink, 'link_id'>>> = {
  parentId: 123,           // Parent offering_id context
  data: {
    offering_id: 123,      // May be redundant - server validates consistency
    url: "https://..."
  }
}

// Server-side logic ensures consistency:
if (requestData.parentId !== requestData.data.offering_id) {
  throw new Error("Parent ID mismatch");
}
```

---

## API Architecture Patterns

### The Generic Query Endpoint: `/api/query`

The `/api/query` endpoint is a central architectural component that handles all complex relational data access. It expects a `QueryPayload` object and validates it on the server against a central `aliasedTablesConfig`.

#### Purpose
- **Complex JOINs**: Multi-table operations that require predefined, optimized query structures.
- **Named Queries**: Predefined query configurations (see `queryConfig.ts`):
  - `supplier_categories` - Suppliers with assigned categories
  - `category_offerings` - Categories with offerings and product definitions
  - `offering->product_def->category->wholesaler` - Complete offering data with all relations
  - `order->wholesaler` - Orders with wholesaler information
  - `order->order_items->product_def->category` - Orders with items and product details
  - `offering_attributes`, `offering_links` - Offering relationships
- **Security**: All table and alias access is validated against a central `aliasedTablesConfig` on the server to prevent unauthorized data access.

### Master Data Pattern: QueryPayload + Individual CRUD

Master data entities follow a consistent pattern for API interactions. List queries are initiated by the client sending a complete `QueryPayload`.

```typescript
// List with flexible querying
POST /api/suppliers with QueryRequest<Wholesaler>

// Individual operations
GET    /api/suppliers/[id]      // Read a single entity
POST   /api/suppliers/[id]      // Flexible single query with QueryPayload (for specific field selection)
POST   /api/suppliers/new       // Create a new entity
PUT    /api/suppliers/[id]      // Update an existing entity
DELETE /api/suppliers/[id]      // Delete an entity
```

#### Complete API Pattern for New Entities (Implementation Reference)
When implementing a new entity, follow this exact 5-endpoint structure:
- **List queries**: `POST /api/entity` with QueryPayload
- **Individual read**: `GET /api/entity/[id]` (all fields, simple response)
- **Flexible individual**: `POST /api/entity/[id]` (custom fields via QueryPayload)
- **Create**: `POST /api/entity/new` with entity data
- **Update**: `PUT /api/entity/[id]` with partial updates
- **Delete**: `DELETE /api/entity/[id]` with cascade/forceCascade flags

#### Server Create/Update Pattern (Canonical)

**MANDATORY:** All create/update operations must use the generic validation helpers. Never write manual SQL in API routes.

- **Create:**
```ts
return validateAndInsertEntity(WholesalerItemOfferingForCreateSchema, requestData, "offering", validateOfferingConstraints);
```
- **Update:**
```ts
return validateAndUpdateEntity(Wio_Schema, offering_id, "offering_id", requestData, "offering", validateOfferingConstraints);
```

The schema and the generic helpers are the single source of truth. After schema changes, no code changes are needed in POST/PUT handlers.

### Relationship Endpoint Pattern: `/api/<parent>-<child>`

All relationship endpoints follow a consistent naming pattern that makes the parent-child relationship explicit.

#### 1:n Hierarchical Relationships (`CreateChildRequest`)
- `/api/offering-links`: An Offering has many Links.

```typescript
// Example: Create a Link for an Offering
POST /api/offering-links
{
  "parentId": 123,
  "data": { "url": "https://..." }
}
```

#### n:m Assignment Relationships (`AssignmentRequest`)
- `/api/supplier-categories`: Assign a Supplier to a Category.
- `/api/offering-attributes`: Assign an Attribute to an Offering.

```typescript
// Example: Assign a Category to a Supplier
POST /api/supplier-categories
{
  "parent1Id": 1,
  "parent2Id": 5,
  "data": {
    "comment": "High priority",
    "link": "https://..."
  }
}
```

### Centralized Deletion Logic: `dataModel/deletes.ts`

To ensure consistency, robustness, and transaction safety, all complex deletion logic is centralized in server-side helper functions within `lib/dataModel/deletes.ts`.

-   **Pattern:** Each master data entity (e.g., `ProductDefinition`, `Supplier`) has a corresponding `delete...` function (e.g., `deleteProductDefinition`).
-   **Parameters:** These functions accept the `id` of the entity to delete, a `cascade: boolean` flag, and an active database `Transaction` object.
-   **Responsibility:** The function is solely responsible for executing the correct SQL `DELETE` statements. If `cascade` is true, it performs a multi-statement, CTE-based batch delete to remove all dependent records in the correct order. If `cascade` is false, it attempts to delete only the master record.
-   **Transaction Control:** These helpers do **not** commit or roll back the transaction. This responsibility remains with the calling API endpoint, making the helpers reusable and testable.
-   **Return Value:** On success, the function queries and returns the data of the resource that was just deleted, enabling the API to build a rich `DeleteSuccessResponse`.

#### TransWrapper Pattern (Critical Implementation Detail)
**MANDATORY:** All deletion functions and dependency checks MUST use the TransWrapper pattern for transaction safety:

```typescript
import { TransWrapper } from "$lib/backendQueries/transactionWrapper";

const transWrapper = new TransWrapper(transaction, null);
transWrapper.begin();

try {
  // Database operations with transWrapper.request()
  const result = await transWrapper.request().input("id", id).query(`...`);
  transWrapper.commit();
} catch {
  transWrapper.rollback();
}
```

**Reference Examples:**
- `src/lib/dataModel/dependencyChecks.ts:43` (TransWrapper usage)
- `src/lib/dataModel/deletes.ts` (All delete functions)

#### Dependency Check Structure
All dependency check functions must return: `{ hard: string[], soft: string[] }`
- **Soft dependencies**: Can be deleted with `cascade=true`
- **Hard dependencies**: Require `forceCascade=true` with additional user confirmation

### Deletion Patterns for Relationships vs. Master Data

To ensure API consistency, deletion operations adhere to one of three distinct patterns based on the type of resource being deleted.

| Deletion Type | Endpoint | Method | Body Content | Purpose |
| :--- | :--- | :--- | :--- | :--- |
| **Master Data** | `/api/[entity]/[id]` | `DELETE` | `DeleteRequest<T>` containing `id`, `cascade`, and `forceCascade` flags. | Deletes a top-level entity. The ID in the URL is used for routing, while the body carries the full request payload for consistency. |
| **n:m Assignment** | `/api/[parent]-[child]` | `DELETE` | `RemoveAssignmentRequest` | Removes a link between two entities. Requires both IDs to identify the unique relationship. |
| **1:n Child** | `/api/[parent]-[child]` | `DELETE` | `DeleteRequest<{id}>` | Deletes a child entity that has its own unique ID. Follows the standard `DeleteRequest` pattern. |

### Deletion Pattern: Centralized, Multi-Stage Optimistic Delete

The client implements a highly robust **Optimistic Delete** pattern managed by a centralized `cascadeDelete` helper function. This provides a safe and context-aware user experience by clearly distinguishing between soft and hard dependencies.

**Workflow:**
1.  **Step 1 (API Call):** The client calls the generic `cascadeDelete` helper, which sends a **non-cascading** `DELETE` request.
2.  **Step 2 (Conflict Path):** If the server responds with `409 Conflict`, it returns a structured `dependencies` object: `{ hard: string[], soft: string[] }`.
3.  **Step 3 (Context-Aware Confirmation):**
    *   If only **soft** dependencies exist, the UI displays a specific confirmation dialog detailing the consequences. If confirmed, the client sends a second `DELETE` request with `cascade=true`.
    *   If **hard** dependencies exist (`cascade_available: false`), the UI displays a more urgent dialog. This dialog requires the user to check an additional "force cascade" box to confirm they understand the destructive nature of the action. Only then is a second `DELETE` request sent with both `cascade=true` and `forceCascade=true`.

---

## Endpoint Overview

| Entity/Operation | Endpoint | Generic Type | Server Status | Client Status | Notes |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **SUPPLIERS (Master Data)** | | | | | |
| Query List | `POST /api/suppliers` | `QueryRequest<Wholesaler>` | ✅ | ✅ | |
| Read Single | `GET /api/suppliers/[id]` | - | ✅ | ✅ | |
| Create | `POST /api/suppliers/new` | `Omit<Wholesaler, 'wholesaler_id'>` | ✅ | ✅ | |
| Update | `PUT /api/suppliers/[id]` | `Partial<Wholesaler>` | ✅ | ✅ | |
| Delete | `DELETE /api/suppliers/[id]` | - | ✅ | ✅ | |
| **ATTRIBUTES (Master Data)** | | | | | |
| Query List | `POST /api/attributes` | `QueryRequest<Attribute>` | ✅ | ✅ | |
| ... | ... | ... | ✅ | ✅ | |
| **CATEGORIES (Master Data)** | | | | | |
| Query List | `POST /api/categories` | `QueryRequest<ProductCategory>` | ✅ | ✅ | |
| ... | ... | ... | ✅ | ✅ | |
| **PRODUCT DEFINITIONS (Master Data)** | | | | | |
| Query List | `POST /api/product-definitions` | `QueryRequest<ProductDefinition>` | ✅ | ✅ | |
| ... | ... | ... | ✅ | ✅ | |
| **OFFERINGS (Master Data)** | | | | | **REFACTORED** |
| Query List | `POST /api/offerings` | `QueryRequest<Offering>` | ✅ | ✅ | |
| Read Single | `GET /api/offerings/[id]` | - | ✅ | ✅ | |
| Create | `POST /api/offerings/new` | `Omit<Offering, 'offering_id'>` | ✅ | ✅ | Body must contain all FKs. |
| Update | `PUT /api/offerings/[id]` | `Partial<Offering>` | ✅ | ✅ | |
| Delete | `DELETE /api/offerings/[id]` | - | ✅ | ✅ | |
| **ORDERS (Master Data)** | | | | | |
| Query List | `POST /api/orders` | `QueryRequest<Order>` | ✅ | ✅ | |
| Read Single | `GET /api/orders/[id]` | - | ✅ | ✅ | |
| Create | `POST /api/orders/new` | `Omit<Order, 'order_id'>` | ✅ | ✅ | |
| Update | `PUT /api/orders/[id]` | `Partial<Order>` | ✅ | ✅ | |
| Delete | `DELETE /api/orders/[id]` | `DeleteRequest<Order>` | ✅ | ✅ | |
| **ORDER ITEMS (Hierarchical - 1:n)** | | | | | |
| Query via JOINs | `POST /api/query` | `namedQuery: 'order->order_items->product_def->category'` | ✅ | ✅ | |
| Read Single | `GET /api/order-items/[id]` | - | ✅ | ✅ | |
| Create | `POST /api/order-items/new` | `Omit<OrderItem, 'order_item_id'>` | ✅ | ✅ | |
| Update | `PUT /api/order-items/[id]` | `Partial<OrderItem>` | ✅ | ✅ | |
| Delete | `DELETE /api/order-items/[id]` | `DeleteRequest<OrderItem>` | ✅ | ✅ | |
| **SUPPLIER-CATEGORIES (Assignment - n:m)** | | | | | |
| Query via JOINs | `POST /api/query` | `namedQuery: 'supplier_categories'` | ✅ | ✅ | |
| Create Assignment | `POST /api/supplier-categories` | `AssignmentRequest` | ✅ | ✅ | |
| Remove Assignment | `DELETE /api/supplier-categories` | `RemoveAssignmentRequest` | ✅ | ✅ | |
| **OFFERING-ATTRIBUTES (Assignment - n:m Attributed)** | | | | | |
| Query via JOINs | `POST /api/query` | `namedQuery: 'offering_attributes'` | ✅ | ✅ | |
| Create Assignment | `POST /api/offering-attributes` | `AssignmentRequest` | ✅ | ✅ | |
| Update Assignment | `PUT /api/offering-attributes` | `AssignmentUpdateRequest` | ✅ | ✅ | |
| Delete Assignment | `DELETE /api/offering-attributes` | `RemoveAssignmentRequest` | ✅ | ✅ | |
| **OFFERING-LINKS (Composition - 1:n)** | | | | | |
| Query via JOINs | `POST /api/query` | `namedQuery: 'offering_links'` | ✅ | ✅ | |
| Read Single | `GET /api/offering-links/[id]` | - | ✅ | ✅ | For forms only |
| Create | `POST /api/offering-links` | `CreateChildRequest<WholesalerItemOffering, LinkData>` | ✅ | ✅ | |
| Update | `PUT /api/offering-links` | Update pattern | ✅ | ✅ | |
| Delete | `DELETE /api/offering-links` | `DeleteRequest<WholesalerOfferingLink>` | ✅ | ✅ | |

---

## Architectural Decisions & Ongoing Work

### Architectural Decision: Loading Entities for New Offerings

A core business rule is that a supplier can have **multiple, distinct offerings for the same product definition** (e.g., to represent different sizes, colors, or conditions). To support this rule, the system follows a context-aware loading pattern for creating new offerings. A simple SQL anti-join (`LEFT JOIN` / `IS NULL`) to find "available" products would be logically incorrect, as it would filter out a product as soon as the first offering was created, preventing the creation of variants.

The architectural solution is a context-aware loading pattern implemented in the UI's `load` function, which fetches the complete list of valid parent entities depending on the user's navigation context.

1.  **Supplier Context (`/suppliers/.../offerings/new`):**
    *   When a user creates an offering for a specific supplier, the UI must present a choice of all possible products.
    *   **Action:** The `load` function calls the API to fetch **all** `ProductDefinitions` that belong to the selected `ProductCategory`.
    *   **UI:** The `OfferingForm` renders a dropdown list of these products.

2.  **Product Context (`/categories/.../productdefinitions/.../offerings/new`):**
    *   When a user creates an offering for a specific product, the UI must present a choice of all possible suppliers.
    *   **Action:** The `load` function calls the `categoryApi.loadSuppliersForCategory()` function to fetch **all** `Wholesalers` assigned to the `ProductCategory` of the current `ProductDefinition`.
    *   **UI:** The `OfferingForm` renders a dropdown list of these suppliers.

This approach simplifies the client-side API, aligns perfectly with the business requirements, and removes complex, misuse-prone queries. This architecture is supported in the data layer by the absence of a restrictive `UNIQUE INDEX` on the `dbo.wholesaler_item_offerings` table, which allows for the creation of multiple offerings for the same product.

### Future Architectural Enhancements

#### Recursive Sidebar Component
- **Current State:** The `HierarchySidebar` component currently renders a flat list of `HierarchyItem` objects. The hierarchical structure is simulated using a `level` property, which is used to calculate CSS padding for indentation.
- **Potential Improvement:** A future refactoring could change the data structure from a flat list to a true tree structure, where each node object contains an optional `children` array of child nodes.
- **Benefits:** The `HierarchySidebar` component could then be refactored to render itself recursively using `<svelte:self>`. This would make the component more robust, capable of handling infinitely deep hierarchies, and would rely on semantically correct nested `<ul>` lists for indentation instead of dynamic styling.

---

## Technical Architecture Pillars

### Type Safety Architecture
The project is built on nine pillars of type safety that work together to ensure correctness from the database to the UI.
- **Pillar I: Generic API Types:** Universal request/response envelopes in `lib/api/api.types.ts`.
- **Pillar II: Query Grammar:** A structured object (`QueryPayload`) for defining database queries in a type-safe manner.
- **Pillar III: Table Registry:** Schema-based security system with automatic type generation. Zod schemas are the single source of truth for table access and column validation.
- **Pillar IV: Query Builder:** A server-side utility that converts the `QueryPayload` grammar into parameterized SQL.
- **Pillar V: Data Validation & Contracts with Zod:** A new pillar ensuring runtime data integrity on the frontend.
- **Pillar VI: Enhanced Component Type Safety:** Key generic components like the `Datagrid` have been improved for stricter type safety.
- **Pillar VII: Enhanced Datagrid Component:** See [`src/lib/components/grids/README-Datagrid.md`](src/lib/components/grids/README-Datagrid.md) for complete documentation.
- **Pillar VIII: Schema-Based Column Generation:** Automatic generation of qualified SQL column names from Zod schemas with dependency injection.
- **Pillar IX: Type-Safe Recordset Transformation:** Secure transformation of flat database results into structured TypeScript objects.

### Pillar II: Query Grammar & Core Structures (`QueryPayload`)
The architecture relies on a well-defined, type-safe object structure called `QueryPayload` to describe database queries. This approach ensures that all query definitions are declarative, serializable, and can be easily validated.

**Example `QueryPayload`:**

```typescript
const payload: QueryPayload<Wholesaler> = {
  from: { table: 'dbo.wholesalers', alias: 'w' },
  select: ['wholesaler_id', 'name', 'status'],
  where: { 
    whereCondOp: 'AND',
    conditions: [
      { key: 'w.status', whereCondOp: '=', val: 'active' }
    ]
  },
  orderBy: [{ key: 'name', direction: 'asc' }],
  limit: 50
};
```
This payload is sent from the client to a server endpoint (e.g., `/api/suppliers` or `/api/query`), where it is parsed, validated against the security configuration (`queryConfig.ts`), and safely converted into a parameterized SQL statement by the Query Builder.

### Pillar V: Data Validation & Contracts with Zod

Zod is the sole source of truth for the **shape** and **rules** of data throughout the system, on both the frontend and backend. The schemas defined in `src/lib/domain/domainTypes.ts` are used directly in API endpoints for robust server-side validation.

#### Implemented: Schema-based Table Registry System

**Challenge Solved:** The previous queryConfig system required duplicate column maintenance - once in Zod schemas and again in hardcoded column lists.

**Implemented Solution:** A **Table Registry System** that eliminates code duplication:

```typescript
// Implemented: src/lib/backendQueries/tableRegistry.ts
export interface TableDefinition {
  schema: z.ZodObject<any>;  // Direct reference to Zod schema
  tableName: string;         // e.g., "orders"
  dbSchema: string;          // e.g., "dbo"
  alias: string;             // e.g., "ord"
}

export const TableRegistry = {
  "wholesalers": {
    schema: WholesalerSchema,
    tableName: "wholesalers",
    dbSchema: "dbo",
    alias: "w"
  },
  "orders": {
    schema: OrderSchema,      // Single source of truth
    tableName: "orders",
    dbSchema: "dbo",
    alias: "ord"
  },
  // ... all entities implemented
} as const satisfies Record<string, TableDefinition>;

// Automatic type generation from schemas
type ExtractSchemaKeys<T extends z.ZodObject<any>> = Extract<keyof z.infer<T>, string>;

export type AllQualifiedColumns = {
  [K in keyof typeof TableRegistry]: `${(typeof TableRegistry)[K]["alias"]}.${ExtractSchemaKeys<(typeof TableRegistry)[K]["schema"]>}`;
}[keyof typeof TableRegistry];

// Runtime column validation using Zod 4.x API
export function validateJoinSelectColumns(selectColumns: string[]): void {
  for (const column of selectColumns) {
    if (column.includes('.')) {
      const [alias, columnName] = column.split('.');
      const tableConfig = getTableConfigByAlias(alias);
      if (tableConfig) {
        const allowedColumns = tableConfig.schema.keyof().options;
        if (!allowedColumns.includes(cleanColumn)) {
          throw new Error(`Column '${cleanColumn}' not found in schema for alias '${alias}'`);
        }
      }
    }
  }
}
```

#### Current Query Config Pattern (Updated)
QueryConfig now focuses purely on JOIN configurations, with table security handled by Table Registry:

```typescript
// In src/lib/backendQueries/queryConfig.ts - Updated Architecture
export interface QueryConfig {
  joinConfigurations: {
    [viewName: string]: {
      from: ValidFromClause;
      joins: JoinClause[];
      exampleQuery?: QueryPayload<unknown>;
    };
  };
}

export const supplierQueryConfig: QueryConfig = {
  joinConfigurations: {
    supplier_categories: {
      from: { table: "dbo.wholesalers", alias: "w" },
      joins: [
        {
          type: JoinType.INNER,
          table: "dbo.wholesaler_categories",
          alias: "wc",
          on: {
            joinCondOp: LogicalOperator.AND,
            conditions: [{ columnA: "w.wholesaler_id", op: ComparisonOperator.EQUALS, columnB: "wc.wholesaler_id" }],
          },
        },
        // ... more joins
      ],
    },
    // ... other JOIN configurations
  },
};
```

**Security is now handled by the Table Registry system - no more hardcoded column lists needed.**

#### Enhanced QueryPayload Type Safety

The `QueryPayload<T>` interface now provides comprehensive type safety for database queries:

```typescript
// In src/lib/backendQueries/queryGrammar.ts
export interface QueryPayload<T> {
  select: Array<keyof T | AllQualifiedColumns | AllAliasedColumns>;
  from?: ValidFromClause;
  joins?: JoinClause[];
  where?: WhereCondition<T> | WhereConditionGroup<T>;
  orderBy?: SortDescriptor<T>[];
  limit?: number;
  offset?: number;
}
```

**Key Features:**
- **✅ Entity Columns:** `keyof T` for simple entity column names like `"name"`, `"status"`
- **✅ Qualified Columns:** `AllQualifiedColumns` for aliased columns like `"w.name"`, `"pc.category_id"`
- **✅ Aliased Columns:** `AllAliasedColumns` for AS clauses like `"w.name AS supplier_name"`
- **✅ Auto-Completion:** Perfect IntelliSense for all valid column combinations
- **✅ Runtime Validation:** `validateJoinSelectColumns()` ensures query safety

**Example Usage:**
```typescript
const payload: QueryPayload<Wholesaler> = {
  select: [
    "wholesaler_id",           // keyof Wholesaler
    "w.name",                  // AllQualifiedColumns
    "w.status",                // AllQualifiedColumns
    "pc.name AS category_name" // AllAliasedColumns
  ],
  from: { table: "dbo.wholesalers", alias: "w" },
  joins: [...],
  where: { key: "w.status", whereCondOp: "=", val: "active" }
};
```

#### Unified Error Structure: ValidationErrorTree

The application uses a unified, hierarchical error structure for both Zod validation errors and custom validation logic (e.g., hierarchy validation).

**Core Type Definition:**
```typescript
// In src/lib/components/validation/validation.types.ts
export type ValidationErrorTree = {
  errors?: string[];  // Errors at this level
  [key: string]: ValidationErrorTree | string[] | undefined;  // Nested errors
};
```

**Conversion Functions:**

1. **Zod Error Conversion** - `zodToValidationErrorTree()`:
```typescript
// In src/lib/domain/domainTypes.utils.ts
import { zodToValidationErrorTree } from '$lib/domain/domainTypes.utils';

const result = SomeSchema.safeParse(data);
if (!result.success) {
  const errorTree = zodToValidationErrorTree(result.error);
  // errorTree is now in unified ValidationErrorTree format
}
```

2. **Custom Validation** - `validateTreeAsTree()`, `validateHierarchiesAsTree()`:
```typescript
// In src/lib/components/sidebarAndNav/hierarchyUtils.ts
const errors = validateTreeAsTree(hierarchyTree);
// Returns ValidationErrorTree | null
```

**Benefits:**
- ✅ Unified error format across all validation domains
- ✅ Hierarchical structure matches data structure
- ✅ Easy to display with nested components (ValidationWrapper)
- ✅ JSON-serializable for logging and debugging
- ✅ Properties only present when errors exist (clean JSON.stringify output)

**Usage Pattern:**
```typescript
const errors = $state<Record<string, ValidationErrorTree>>({});

// Zod validation
const supplierVal = WholesalerSchema.safeParse(supplier);
if (supplierVal.error) {
  errors.supplier = zodToValidationErrorTree(supplierVal.error);
}

// Display with ValidationWrapper
<ValidationWrapper {errors}>
  <!-- Component content -->
</ValidationWrapper>
```

#### **Server-Side Validation in API Endpoints**

Instead of a custom validator, each API endpoint imports the required Zod schema directly and applies schema methods to adapt it for the specific use case. This pattern is explicit, type-safe, and avoids unnecessary abstractions.

**Create Pattern (`POST /api/.../new`):**
The `...ForCreateSchema` variant is used, which omits server-generated fields (like IDs and timestamps).

```typescript
// In: /api/suppliers/new/+server.ts
import { WholesalerForCreateSchema } from '$lib/domain/domainTypes';
import { validateEntity } from '$lib/domain/domainTypes'; // Or adapter

const validation = validateEntity(WholesalerForCreateSchema, requestData);
```

**Update Pattern (`PUT /api/.../[id]`):**
The base schema is modified inline with `.omit()` and then `.partial()`. The `.partial()` method makes all fields optional, which is perfect for PATCH/PUT requests where only the changed data is sent.

```typescript
// In: /api/suppliers/[id]/+server.ts
import { WholesalerSchema } from '$lib/domain/domainTypes';
import { validateEntity } from '$lib/domain/domainTypes'; // Or adapter

const WholesalerForUpdateSchema = WholesalerSchema.omit({ wholesaler_id: true, created_at: true }).partial();
const validation = validateEntity(WholesalerForUpdateSchema, requestData);
```

### Frontend Architecture: Domain-Driven Structure & Page Delegation
The frontend follows a **Domain-Driven file structure** combined with a **Page Delegation Pattern**. The core principle is **Co-Location**: All files related to a specific business domain are located in a single directory (`src/lib/domain/suppliers/`).

#### Page Delegation Pattern (Critical Implementation Detail)
**MANDATORY structure** for all new entities:

1. **Route `+page.ts`**: Pure delegation → `export { load } from '$lib/components/domain/entity/entityListPage';`
2. **Route `+page.svelte`**: Pure delegation → `<EntityListPage {data} />`
3. **Domain `entityListPage.ts`**: Contains actual load logic with `export function load({ fetch })`
4. **Domain `EntityListPage.svelte`**: Contains UI logic with Promise handling via `$effect`

**Reference Examples:**
- `src/routes/(browser)/suppliers/+page.ts` (Route delegation)
- `src/lib/components/domain/suppliers/supplierListPage.ts` (Domain load logic)
- `src/lib/components/domain/suppliers/SupplierListPage.svelte` (Domain UI component)

#### 2 Choices for  "DetailPages" displaying "1:n children"
In our usecases, a DetailPage displays not only the respective master data, like "Supplier". It also displays 1:n child relationships, e.g. "Supplier->Product Categories". <br>
Since there can be several 1:n child relationships, we have to provide a UI that easily enables switsching between them.

**Option A** - Page per 1:n child
* Create a page for each relationship: Each page contains the masterdata (preferably as reusable component) and the relationship chosen in the hierary sidebar.
* Create a route delegator for each page, e.g. for `/suppliers/[id]/productcategories` and `/suppliers/[id]/orders` delegate to the "SupplierProductCatagories" and "SupplierOrders" page.

**Option B** - Dynamic page and conditional rendering
* Create **one** page containing the master data and conditionally render the chil-relationship selected in the hierary sidebar. One can use snippets to render the respective child blocks.
* Create a route delegator which always points to this one page, e.g. "SupplierPage".

#### Component-Based Data Loading Pattern (Detail Pages)

For complex detail pages with nested data loading, the architecture has evolved from Promise-based loading to component-based loading:

**Philosophy:** Since components must use `async/await` in `$effect` anyway (the Shell/Async pattern already requires this), we can simplify by doing ALL data loading directly in the component.

**Pattern:**
1. **Load function returns ONLY metadata:**
   - IDs extracted from URL params
   - `loadEventFetch` for SSR-safe API calls
   - Route context (flags like `isCreateMode`, `activeChildPath`)
   - **CRITICAL:** Explicit return type annotation (see Type Safety section below)

2. **Component loads ALL data in `$effect`:**
   - Creates `ApiClient` with `loadEventFetch`
   - Performs all async API calls directly
   - Handles loading states, errors, and cleanup

3. **Runtime validation of critical props:**
   - Components validate required props (like `loadEventFetch`) at mount
   - Throws `error()` if validation fails - crashes early with clear message

**Example:**
```typescript
// supplierDetailPage.ts - ONLY metadata
export function load({ params, fetch }): SupplierDetailPageProps {
  return {
    supplierId: Number(params.id),
    isCreateMode: params.id === 'new',
    activeChildPath: extractPath(url),
    loadEventFetch: fetch,
    params
  };
}

// SupplierDetailPage.svelte - ALL data loading
const client = new ApiClient(data.loadEventFetch);
const supplierApi = getSupplierApi(client);

$effect(() => {
  let aborted = false;

  const processPromises = async () => {
    isLoading = true;
    try {
      supplier = await supplierApi.loadSupplier(data.supplierId);
      if (aborted) return;

      assignedCategories = await supplierApi.loadCategoriesForSupplier(data.supplierId);
      if (aborted) return;

      // ... more loading
    } finally {
      if (!aborted) isLoading = false;
    }
  };

  processPromises();
  return () => { aborted = true; };
});
```

**Type Safety Through Explicit Return Types:**

**CRITICAL PATTERN:** Load functions MUST use explicit return type annotations to ensure type errors appear at the source.

**Why this matters with Route Delegation:**
- Domain file (`supplierDetailPage.ts`) contains the `load()` function
- Route file (`+page.ts`) delegates: `export { load } from '$lib/.../supplierDetailPage'`
- **Problem:** Svelte's magic means type errors in `load()` don't show up there
- **Problem:** Instead, errors appear in `+page.svelte` at `let { data } = $props()` - far from the actual bug

**Solution:**
```typescript
// ❌ WRONG - Error shows in +page.svelte, hard to debug
export function load({ params, fetch }) {
  return {
    supplierId: Number(params.id),
    wrongProp: "oops"  // Bug! But error appears elsewhere
  };
}

// ✅ CORRECT - Error shows HERE in supplierDetailPage.ts
export function load({ params, fetch }): SupplierDetailPageProps {
  return {
    supplierId: Number(params.id),
    wrongProp: "oops"  // TypeScript error shows immediately!
  };
}
```

**Benefits:**
- ✅ Type errors appear at source (supplierDetailPage.ts), not in route delegation
- ✅ Immediate feedback during development
- ✅ Props interface serves as explicit contract
- ✅ Refactoring is safer - breaking changes caught immediately

**Reference Examples:**
- `SupplierDetailPage.svelte:74-152` (Component loading pattern)
- `OrderDetailPage.svelte:70` (Component loading pattern)
- `supplierDetailPage.ts:8` (Metadata-only load with explicit return type)
- `orderDetailPage.ts:8` (Metadata-only load with explicit return type)

### Client-side deletion helpers 
To handle different deletion scenarios in a type-safe manner, the generic `cascadeDelete` helper has been refactored into two specialized functions:

*   **`cascadeDelete`**: Used for deleting **master data entities** (Suppliers, Categories, Offerings, Attributes). It takes an array of simple `ID`s and a `DeleteApiFunction` like `supplierApi.deleteSupplier`.

*   **`cascadeDeleteAssignments`**: Used exclusively for deleting **n:m assignments** (e.g., removing a category from a supplier). It takes an array of composite IDs (e.g., `{ parent1Id, parent2Id }`) and a `RemoveAssignmentApiFunction`.

Both helpers now correctly support the full dependency-checking workflow, including the `forceCascade` option, by calling a shared internal function that manages the user confirmation dialogs. This makes the UI component code cleaner, more predictable, and strictly typed.

- A SvelteKit **Route** (`src/routes/...`) acts as a simple "delegator". Its only job is to load data and render the corresponding page module from `src/lib/domain/...`.

### Frontend Form Architecture: The "Dumb Shell / Smart Parent" Pattern
To create reusable yet fully type-safe forms, the project uses this robust pattern.

#### The "Dumb" State Manager: `FormShell.svelte`
- A generic component that manages core form mechanics: tracking data, "dirty" state, submission, and validation lifecycle via Svelte 5 callback props.

#### The "Smart" Parent: `SupplierForm.svelte`
- A specific component that knows everything about a `Wholesaler`. It provides the domain-specific `validate` and `submit` functions to the `FormShell`.

#### Props Validation Pattern (Critical Implementation Detail)
**MANDATORY** for all form components - client-side Zod validation of loaded data:

```typescript
// In EntityForm.svelte
import { EntityLoadDataSchema } from './entityDetail.types';

let { validatedData, errors } = $derived.by(() => {
  const result = EntityLoadDataSchema.safeParse(initialLoadedData);
  if (!result.success) {
    return {
      validatedData: null,
      errors: result.error.issues,
      isValid: false
    };
  }
  return {
    validatedData: result.data,
    errors: null,
    isValid: true
  };
});
```

Forms must validate their received props using Zod schemas, not trust raw data from load functions.

**Reference Example:** `src/lib/components/domain/offerings/OfferingForm.svelte:51`

#### Context-Aware Reusability Pattern
Forms detect their usage context via boolean flags in props:
- `isCreateMode`: true for `/new` routes, false for `/edit/[id]`
- `isEntityRoute`: true when accessed from entity-specific routes
- Route-specific flags: `isSuppliersRoute`, `isCategoriesRoute`, etc.

#### Validation Strategy: Zod-Driven with HTML5 UX Enhancement

The form architecture leverages the strengths of Zod and native browser validation for a robust and performant user experience.

*   **Server-Side Zod Schemas as "Single Source of Truth":** The Zod schemas used in the API endpoints are the ultimate authority for data integrity.
*   **Standard Rules in HTML:** Simple validations (`required`, `minlength`, `pattern`, `type="email"`) are declared directly as attributes on the `<input>` elements. This enables instant, performant feedback from the browser.
*   **Styling via Pure CSS:** Visual feedback for invalid fields is handled exclusively by the CSS `:invalid` pseudo-class.
*   **"Smart Parent" for Complex UX Rules:** The "Smart Parent" component (e.g., `SupplierForm`) can optionally provide a `validate` function to check complex business rules (e.g., cross-field validation) *before submission* on the client. This serves to improve UX, not for data security.
*   **"Dumb Shell" as Orchestrator:** The `FormShell` uses the browser's `checkValidity()` and `reportValidity()` APIs to determine the final validation status before submission and to control UI feedback.

### Case Study: Context-Aware Reusable Forms (`OfferingForm`)
The `OfferingForm` is a prime example of the "Smart Parent / Dumb Shell" pattern applied to a complex, reusable component. It is designed to be used from two different navigation contexts: creating an offering for a specific supplier, or creating an offering for a specific product.

- **Context Detection:** The form receives a comprehensive `initialLoadedData` prop from its parent wrapper. It uses Svelte 5's `$derived` rune to determine its context from boolean flags within this data (e.g., `isSuppliersRoute`, `isCategoriesRoute`).
- **Conditional UI:** Based on the detected context, the form conditionally renders the appropriate UI. In the "Supplier Context", it displays a dropdown of available products. In the "Product Context", it displays a dropdown of available suppliers.
- **Intelligent State Preparation:** A `$derived.by` block prepares a consistent `initial` data object for the underlying `FormShell`. In "Create" mode, this object is pre-populated with the fixed context IDs (e.g., `supplier_id` or `product_def_id`) received from the props.
- **Contextual Submission Logic:** The `submitOffering` function contains the final piece of intelligence. In "Create" mode, it correctly assembles the final data payload for the API by combining the fixed context IDs with the IDs selected by the user in the dropdown.

This pattern makes the `OfferingForm` highly reusable and decouples it from the specific routes, while keeping all context-specific logic clearly organized within the component itself.

### Pillar VII: Enhanced Datagrid Component

See [`src/lib/components/grids/README-Datagrid.md`](src/lib/components/grids/README-Datagrid.md) for complete documentation on the Datagrid component, including:
- Autonomous sorting and data loading lifecycle
- Scrollable body with sticky header
- Grid Query Pattern (canonical usage)
- QuickFilter mechanism and pitfalls
- Report View + Report Grid Contract

### Frontend Navigation Architecture: Context Conservation
The application employs a **"Context Conservation"** pattern to create an intuitive hierarchical browsing experience. The system remembers the deepest path the user has explored and reflects this state consistently across the `HierarchySidebar` and `Breadcrumb` components, only pruning the path when the user explicitly changes context on a higher level.

---

## Understanding Svelte's Reactivity in the SupplierBrowser App

Svelte's reactivity is understood on three distinct levels:

1.  **Architectural Reactivity (`load` Function):** SvelteKit's `load` function is the highest level of reactivity, triggered by navigation.
2.  **Global Reactivity (Svelte Stores):** For state shared across components, like `navigationState.ts`.
3.  **Component-Level Reactivity (Svelte 5 Runes):** Runes (`$state`, `$props`, `$derived`) make reactivity explicit and granular inside components. Svelte is a compiler; when state changes, it does not re-render the entire component. Instead, it generates highly-optimized code that **surgically updates only the affected DOM elements.**

#### Best Practice: Avoiding the Global `$page` Store in Components

Directly importing and using `import { page } from '$app/stores'` in reusable components is an anti-pattern in Svelte 5 and can be unreliable. It may lead to errors where `$page.url` is `undefined`, especially in deeply nested components.

**The Correct Svelte 5 Architecture:**

1.  The `load` function in `+page.ts` or `+layout.ts` is the only place that should access the `url`.
2.  Required URL data (like `url.pathname`) is explicitly returned as part of the `data` object from the `load` function.
3.  This data is received by the page component as a prop (`let { data } = $props()`) and passed down to child components as needed.

This (`load` -> `props` -> `props`) pattern is explicit, type-safe, and guarantees that all components receive the correct, up-to-date data.

---

## New Entity Implementation Checklist

When implementing a new entity (e.g., Orders), follow this comprehensive checklist to ensure consistency with existing patterns:

### 1. Database & Domain Layer
- [ ] Create DDL tables following existing naming conventions (`dbo.entity_name`)
- [ ] Add Zod schemas to `src/lib/domain/domainTypes.ts`
- [ ] Include both base schema and `ForCreateSchema` variant
- [ ] Add entity to `AllEntitiesSchema` enum
- [ ] Update `AllSchemas` mapping object

#### End-to-End Field Change (Authoritative Checklist)

When adding or modifying fields in existing entities (e.g., `wholesaler_item_offerings`):

1) **Database**
- Write an idempotent ALTER script (check `INFORMATION_SCHEMA.COLUMNS` or use `sp_rename` for renames).
- If a report needs the field, extend `dbo.view_offerings_pt_pc_pd` with stable aliases that match our TS schema (e.g., `wioPricePerPiece`, `wsRelevance`, `wsPriceRange`).

2) **Zod Schemas (TS)**
- Entity data: extend `Wio_Schema` (e.g., `origin`, `price_per_piece`, `wholesaler_price`).
- Report data: extend `OfferingReportViewSchema` to mirror view aliases exactly.
- Do not omit the new field from `WholesalerItemOfferingForCreateSchema` unless it is server-generated.

3) **Backend Queries**
- If a loader uses `wio.*`, the new column comes automatically.
- If a loader has an explicit `SELECT` list, add the column (e.g., `loadOfferingsForImageAnalysis`).

4) **API (Server)**
- Use only:
  - `validateAndInsertEntity(schema, body, "offering")`
  - `validateAndUpdateEntity(schema, id, "offering_id", body, "offering")`
- No ad‑hoc SQL in routes.

5) **UI**
- Grids: add column definitions with `filterable` + `filterType` and wire `onQueryChange`.
- Forms: add 1:1 fields that exist in the schema.

6) **Checks**
- Run `npm run check`. Manually verify filter/sort on new columns if applicable.

#### Naming Conventions (Authoritative)

- **Table aliases and qualified keys (nested data/grids):**
  - `wio.*` → `wholesaler_item_offerings`
  - `w.*` → `wholesalers`
  - `pd.*` → `product_definitions`
  - `pc.*` → `product_categories`
- **Report view (flat model):**
  - `wioXxx` (offerings), `wsXxx` (wholesaler), `pdefXxx` (product def), `catXxx` (category), `ptXxx` (product type)
- **Schema fields must match view aliases exactly** (case-sensitive for consistency).

### 2. Table Registry & Query Configuration
- [ ] **Table Registry:** Add entity to `src/lib/backendQueries/tableRegistry.ts` in the `TableRegistry` object with schema reference, table name, DB schema, and alias
- [ ] **Security:** Table access is automatically secured through Table Registry - no manual column lists needed
- [ ] **Query Config:** Add any required JOIN configurations to `queryConfig.ts` for complex queries (optional)

### 3. API Endpoints (5-endpoint structure)
- [ ] `POST /api/entity` - List queries with QueryPayload
- [ ] `GET /api/entity/[id]` - Single entity read
- [ ] **TODO:** All `GET /api/entity/[id]` endpoints must validate retrieved DB records with `validateEntity()` before returning (see `src/routes/api/offerings/[id]/+server.ts:60-74` for reference implementation)
- [ ] `POST /api/entity/[id]` - Flexible single query
- [ ] `POST /api/entity/new` - Create new entity
- [ ] `PUT /api/entity/[id]` - Update entity
- [ ] `DELETE /api/entity/[id]` - Delete with cascade support

### 4. Deletion & Dependencies
- [ ] Add dependency check function to `src/lib/dataModel/dependencyChecks.ts`
- [ ] Add deletion function to `src/lib/dataModel/deletes.ts`
- [ ] Use TransWrapper pattern for all database operations
- [ ] Return `{ hard: string[], soft: string[] }` from dependency checks

### 5. API Client
- [ ] Create `entityApi.ts` with all CRUD methods
- [ ] Implement proper error handling and type safety
- [ ] Use context-aware fetch for SSR compatibility

### 6. Frontend Routes (Page Delegation Pattern)
- [ ] `src/routes/(browser)/entity/+page.ts` - Pure delegation
- [ ] `src/routes/(browser)/entity/+page.svelte` - Pure delegation
- [ ] `src/routes/(browser)/entity/new/+page.ts` - Form route delegation
- [ ] `src/routes/(browser)/entity/new/+page.svelte` - Form route delegation
- [ ] `src/routes/(browser)/entity/[id]/+page.ts` - Edit route delegation
- [ ] `src/routes/(browser)/entity/[id]/+page.svelte` - Edit route delegation

### 7. Domain Components
- [ ] `entityListPage.ts` - Load function with proper validation
- [ ] `EntityListPage.svelte` - UI component with Promise handling
- [ ] `entityFormPage.ts` - Form load function with context detection
- [ ] `EntityForm.svelte` - Smart parent form component
- [ ] `EntityGrid.svelte` - Thin wrapper around Datagrid

### 8. Form Implementation
- [ ] Implement Props Validation Pattern in load function
- [ ] Add context-aware reusability with boolean flags
- [ ] Use "Dumb Shell / Smart Parent" pattern
- [ ] Implement proper Zod validation strategy

### 9. Grid Implementation
- [ ] Define proper ColumnDef with types
- [ ] Implement getId function
- [ ] Configure apiLoadFunc for autonomous sorting
- [ ] Set appropriate maxBodyHeight

### 10. Navigation Integration
- [ ] Update navigation structures if applicable
- [ ] Add breadcrumb support
- [ ] Update hierarchy sidebar if relevant

**Reference Implementation:** Use existing Suppliers implementation as the gold standard for all patterns.

---

## Critical Bugs to Avoid - Lessons Learned




### Prevention Checklist for New Code

When writing new API client methods:
- [ ] Test with 0 results
- [ ] Test with exactly 1 result
- [ ] Test with multiple results
- [ ] Add explicit comments for edge cases

When creating new forms:
- [ ] Set `autoValidate` explicitly
- [ ] Apply defaults in `$derived.by` before FormShell
- [ ] Test create mode with empty initial data
- [ ] Verify FormShell debug shows expected values

When using array operations:
- [ ] Ask: "What if the array is empty?"
- [ ] Ask: "What if there's exactly one element?"
- [ ] Use `length > 0` for "any items", not `length > 1`
- [ ] Use `length === 1` for "exactly one", not `length > 0`

---

## sveltekit load function and the and streaming/shell pattern
Of course. Here is a rewritten, technically precise chapter for your documentation, framed as a general technical article. It clarifies the distinction between blocking loads, streaming with promises, and component-driven fetching, and explains the trade-offs.

You can copy and paste the Markdown content directly.

---

### Architectural Deep Dive: Data Loading Strategies in SvelteKit

In SvelteKit, the `load` function is the primary mechanism for providing data to routes. However, how this function is used has profound implications for Server-Side Rendering (SSR), performance, and user experience. This section details the three fundamental data loading patterns and explains the architectural decision for this project.

#### 1. The Blocking Pattern: `await` in `load`

This is the simplest pattern for fetching data. The `load` function is marked as `async` and it `await`s the result of a data fetch before returning.

**Principle:**
```typescript
// +page.ts
export async function load({ fetch }) {
  // The function pauses here until the API responds.
  const response = await fetch('/api/data');
  const data = await response.json();

  // It returns only when the data is fully available.
  return { data };
}
```

*   **How it Works:** On the server, SvelteKit executes the `load` function and **blocks**. It will not begin rendering the page's HTML until the `await` completes and the data is returned. The fully rendered HTML, including the fetched data, is then sent to the browser in a single response.
*   **Pros:**
    *   **Optimal SEO & No Content Shift:** The initial HTML delivered to the browser is complete. Search engine crawlers see the full content immediately. The user sees no loading spinners or layout shifts.
*   **Cons:**
    *   **Blocks Time to First Byte (TTFB):** The user sees a blank white screen for the entire duration of the API call. If the API is slow, the user experience is poor. This pattern is only suitable for fetching data that is critical and extremely fast.

---

#### 2. The Streaming Pattern: Returning Promises from `load`

This is the idiomatic SvelteKit approach for handling slower data while providing an instant user response.

**Principle:**
```typescript
// +page.ts
export function load({ fetch }) {
  const slowPromise = fetch('/api/data').then(res => res.json());
  
  // The function returns IMMEDIATELY with an object containing the promise.
  return {
    streamed: { data: slowPromise }
  };
}
```

```svelte
<!-- +page.svelte -->
{#await data.streamed.data}
  <p>Loading...</p>
{:then value}
  <p>Content: {value}</p>
{:catch error}
  <p>Error: {error.message}</p>
{/await}
```

**or, alternatively, one can use reactive code to await the promise:**

```svelte
 $effect(() => {
    let aborted = false;
    const processPromises = async () => {
      isLoading = true;
      loadingError = null;
      resolvedData = null;

      try {
        const [offering, assignedAttributes, availableAttributes, availableProducts, availableSuppliers] = await Promise.all([
          data.offering,
          data.assignedAttributes,
          data.availableAttributes,
          data.availableProducts,
          data.availableSuppliers,
        ]);
        if (aborted) return;
        resolvedData = validationResult.data;

      } catch (rawError: any) {
        if (aborted) return;
        const status = rawError.status ?? 500;
        const message = rawError.message || "Failed to load or validate offering details.";
        loadingError = { message, status };
        log.error("***************** Promise processing failed", { rawError });
      } finally {
        if (!aborted) {
          isLoading = false;
        }
      }
    };

    processPromises();
    return () => {
      aborted = true;
    };
  });
```

*   **How it Works (During SSR):** This pattern initiates a multi-stage HTTP response.
    1.  **Instant Shell:** The `load` function returns immediately. SvelteKit renders the page's HTML "shell," including the `pending` state of any `{#await}` blocks (e.g., the "Loading..." paragraph). This shell is sent to the browser at once, providing an instant visual response.
    2.  **Server-Side Wait & Data Stream:** While the browser renders the shell, the server keeps the HTTP connection open and continues to wait for the `slowPromise` to resolve. Once the data is available, the server serializes it and **streams** it down the same open connection, typically within a `<script>` tag.
    3.  **Client-Side Hydration:** The SvelteKit client-side runtime sees that the data has been streamed. It doesn't need to make a new `fetch` request. It instantly uses the streamed data to "hydrate" the component, replacing the loading state with the final content.

*   **Pros:**
    *   **Excellent TTFB & Perceived Performance:** The user sees the page layout almost instantly.
    *   **Good SEO:** Because the data fetch starts on the server and is streamed with the initial response, modern crawlers can access the content faster than if they had to wait for a separate client-side `fetch` call. It avoids a full client-side network waterfall.
*   **Cons:**
    *   **SSR Fragility:** If not applied correctly, this pattern is fragile and less "developer friendly" during SSR. <br>
    ⚠️If the promise returned by `load` rejects on the server *before* it can be handled by the component's `{#await}` block, it results in an **unhandled promise rejection** that crashes the entire server process. This requires careful error handling within the `load` function itself to make the promise "safe" (i.e., by wrapping it so it never rejects).
    *   **Increased Complexity:** Requires developers to manage promise states and understand the intricacies of SSR streaming.

---

#### 3. The Component-Driven Loading Pattern

This pattern shifts the responsibility of data fetching entirely from the `load` function to the component itself.

**Principle:**
```typescript
// +page.ts - Returns only metadata
export function load({ params, fetch }) {
  return { 
    id: params.id,
    loadEventFetch: fetch // Pass the SSR-safe fetch function
  };
}
```

```svelte
<!-- +page.svelte - The component fetches its own data -->
<script>
  let { data } = $props();
  let content = $state(null);
  let isLoading = $state(true);

  $effect(() => {
    const client = new ApiClient(data.loadEventFetch);
    const loadContent = async () => {
      try {
        content = await client.loadEntity(data.id);
      } catch (e) { /* handle error */ }
      isLoading = false;
    };
    loadContent();
  });
</script>
```

*   **How it Works:** The server's `load` function is synchronous and returns instantly. The server renders the component in its initial loading state (the "shell") and sends it. Once the page hydrates on the client, the `$effect` hook runs and initiates a **new API call from the client's browser** to fetch the data.
*   **Pros:**
    *   **Maximally Robust & Simple:** This pattern is the most resilient against SSR crashes. The `load` function cannot fail. All data fetching occurs within the component's lifecycle and can be managed with standard, well-understood `try/catch` blocks. It behaves identically on the server and the client.
*   **Cons:**
    *   **No Data SSR:** The initial HTML contains no data, only a loading state. This is the worst pattern for SEO.
    *   **Client-Side Waterfall:** The data fetch only begins after the page, its JavaScript, and all parent components have loaded, creating a network waterfall that leads to the slowest Time-to-Content.

---

### Final Architectural Decision for This Project

For a public-facing website where SEO and initial load performance are paramount, the **Streaming Pattern (2)**, when implemented robustly, is the superior choice.

However, for this internal, data-intensive business application:
- SEO is irrelevant.
- Developers and users are accustomed to loading indicators.
- **Robustness, simplicity, and maintainability are the highest priorities.**

The fragility of the Streaming Pattern during SSR led to significant development friction and instability. In contrast, the **Component-Driven Loading Pattern (3)** proved to be completely stable, easier to debug, and simpler to reason about.

Therefore, the **Component-Driven Loading Pattern is the preferable standard for all detail pages in this application.** We consciously trade the theoretical performance benefits of SSR streaming for the practical benefits of stability and developer productivity.

---

## Implementation Pitfalls & Best Practices

### ApiClient: Handling the Response Body
**Problem:** A `Response` body from a `fetch` call is a stream and can only be read **once**.
**Best Practice:** Always read the body into a variable (`await response.text()` or `await response.json()`) exactly once and then reuse that variable.

### ApiClient: SSR-Safe Data Loading in `load` functions
**Problem:** Using the global `fetch` with relative URLs (e.g., `/api/suppliers`) will fail during Server-Side Rendering (SSR).
**Best Practice:** Always use the context-aware `fetch` function provided by SvelteKit's `LoadEvent` and pass it to the `ApiClient`'s constructor.

## Svelte 5 Best Practices & Pitfalls

### Correct Prop Typing with `$props()`
The official and recommended syntax for Svelte 5 is to use **destructuring with a type annotation**.

**Correct Pattern:**
```typescript
type MyComponentProps = { name: string; count?: number; };
const { name, count = 0 }: MyComponentProps = $props();
```

**Anti-Pattern:**
Using a generic type argument like `$props<MyComponentProps>()` is incorrect and will cause a compiler error.

### Understanding `$derived` vs. `$derived.by`

The primary difference lies in how complex computations are handled.

#### `$derived(...)`
- **What it is:** A compile-time macro.
- **How to use:** Used for simple, inline expressions. The value is accessed directly.
- **Example:** `const double = $derived(count * 2);`

#### `$derived.by(...)`
- **What it is:** A function that takes a callback. This is the correct choice for more complex, multi-line computations or when the logic involves creating intermediate variables.
- **How to use:** The entire calculation is wrapped in a function that returns the final derived value. The return value of `$derived.by` is the computed value itself.
- **Example from the codebase:**
  ```typescript
  let { validatedData, errors } = $derived.by(() => {
    const result = SomeSchema.safeParse(initialData);
    // ... more logic ...
    return {
      validatedData: result.success ? result.data : null,
      errors: result.success ? null : result.error.issues,
    };
  });
  ```
In this pattern, the entire object `{ validatedData, errors }` is recomputed and its properties are destructured into reactive variables whenever `initialData` changes.

### Schema-Path vs DB-Alias Migration (See Full Guide)

**Current Challenge:** The codebase has an impedance mismatch between DB-aliases (`"pd.title"`) used in SQL and schema-paths (`"product_def.title"`) natural to JavaScript objects.

**Migration Strategy:** A comprehensive migration guide is available in [`README-Migration-Schema-Paths.md`](./README-Migration-Schema-Paths.md) that outlines:
- The problem analysis and current inconsistencies
- A phased migration approach with no breaking changes
- Support for both flat and nested data structures
- Progressive grid-by-grid migration patterns
- Type-safe conversion utilities

**Key Principle:** The migration is fully backward compatible. Existing code continues to work while new code can use the cleaner schema-path notation.

### Loading State Management: Local vs. Global

**Rule:** DetailPage components should use **local `isLoading` state** for their own data loading lifecycle, NOT global LoadingState stores.

**Why:**
- Local `isLoading` reflects the SPECIFIC component's loading state
- Set to `true` at start of `$effect`, `false` in `finally` block
- Scoped to exactly what the component is doing

**Wrong Pattern:**
```typescript
// ❌ WRONG - Using global loading state in DetailPage
<Datagrid loading={isLoading || $supplierLoadingState} ... />
```

**Problem with Global LoadingState:**
- `$supplierLoadingState` shows when ANY supplier API call happens ANYWHERE in the app
- Not scoped to this specific component's operations
- Can show false loading indicators
- Creates coupling between unrelated components

**Correct Pattern:**
```typescript
// ✅ CORRECT - Use only local state
let isLoading = $state(true);

$effect(() => {
  isLoading = true;
  try {
    // ... load data
  } finally {
    isLoading = false;
  }
});

// Use ONLY local state
<Datagrid loading={isLoading} ... />
```

**When to use Global LoadingState:**
- Grid components that trigger their own API calls via `apiLoadFunc`
- Shared UI components that need to show "API in progress" globally
- NOT for DetailPage component lifecycle management

**Reference Examples:**
- `SupplierDetailPage.svelte:68,143,346` (Local isLoading only)
- `OrderDetailPage.svelte` (Local isLoading only)

### The "Global Magic Chaos" and Type Safety
SvelteKit's `PageData` object, which merges data from all parent layouts, is powerful but can create implicit dependencies, making errors hard to trace. This is especially challenging with generic components like `FormShell.svelte`.

**Solution: The Controlled Bridge**
This application solves the problem by establishing a "Controlled Bridge" pattern where the "smart parent" component (`SupplierForm`) provides explicit type information to the generic child (`FormShell`), ensuring end-to-end type safety. This is achieved by:

1.  **Casting Props Down (`as any`):** Deliberately casting strongly-typed functions passed to the weakly-typed props of the generic shell.
2.  **Casting Data Up (`{@const}`):** Immediately casting the weakly-typed `data` object from the shell's snippet back to the specific type within the parent's template.

This guarantees that any property access is fully type-checked by the compiler, preventing runtime errors.

---

## Deep Dive: Svelte 5 Reactivity and Component State Management

This chapter explains Svelte 5's reactivity system, common pitfalls when building reactive components, and architectural patterns for avoiding infinite render loops. The lessons are illustrated through real production bugs we encountered and solved.

---

### Part 1: How Svelte 5 Reactivity Actually Works

#### Introduction

Svelte 5 introduced a signals-based reactivity system - a fundamental shift from Svelte 4's compile-time reactive statements. Understanding this system is crucial for avoiding infinite loops and reactive cycles in complex components.

#### Signals: The Foundation

A **signal** is a value container that notifies subscribers when it changes. Unlike Svelte 4, where reactivity was handled at compile-time, Svelte 5 uses runtime dependency tracking - similar to SolidJS and Vue 3.

**What actually happens when you create reactive state:**

```typescript
let count = $state(0);
```

Behind the scenes:
- Svelte creates a signal object internally
- This signal maintains a list of subscribers (effects, derived values, DOM nodes)
- When you READ `count` inside a reactive context, you're added to the subscribers list
- When you WRITE `count = 5`, all subscribers get notified

#### Dependency Tracking: How Svelte Knows What Changed

Dependency tracking happens at **runtime**, not compile-time:

1. During `$effect` execution, Svelte records every `$state` value you READ
2. If your effect reads `count` and `name`, it subscribes to both signals
3. If only `count` changes, only subscribers of `count` re-run (fine-grained updates)
4. Multiple synchronous writes are batched in a microtask before updates propagate

**Important distinction:**

```typescript
// This effect subscribes to 'count'
$effect(() => {
  console.log(count); // READ is tracked
});

// This function does NOT create subscriptions
function handleClick() {
  count++; // Just a write, no subscription
}
```

#### The Three Reactive Primitives

**$state - Reactive Values**

Creates a reactive signal. For objects and arrays, Svelte uses Proxies to enable deep reactivity:

```typescript
let items = $state([1, 2, 3]);
items.push(4); // Triggers reactivity (Proxy intercepts the push)

let user = $state({ name: "John", age: 30 });
user.age = 31; // Triggers reactivity (Proxy intercepts property write)
```

**$derived - Computed Values**

Automatically recomputes when dependencies change. Must be pure (no side effects):

```typescript
let firstName = $state("John");
let lastName = $state("Doe");

// Recomputes automatically when firstName OR lastName changes
let fullName = $derived(`${firstName} ${lastName}`);
```

**$effect - Side Effects**

Runs when dependencies change. Used for side effects like logging, API calls, or DOM manipulation. Can return a cleanup function:

```typescript
$effect(() => {
  const controller = new AbortController();

  fetch('/api/data', { signal: controller.signal })
    .then(res => res.json())
    .then(data => console.log(data));

  // Cleanup runs when effect re-runs or component unmounts
  return () => controller.abort();
});
```

#### Component Lifecycle in Svelte 5

Understanding the lifecycle is critical for avoiding bugs:

**Initialization (happens ONCE):**
```typescript
// Component script runs ONCE when mounted
let count = $state(0);  // Initialized once

onMount(() => {
  console.log("Component mounted"); // Runs once
});
```

**Re-render (happens on prop/state changes):**
- Script does NOT re-run
- Local state persists (keeps its value)
- Only reactive dependencies update
- Template re-renders surgically (only affected DOM nodes)

**SvelteKit Component Reuse (Critical for Understanding Navigation Bugs):**

When navigating between similar routes (`/items/1` → `/items/2`), SvelteKit **reuses** the component as an optimization:
- `onMount` does NOT fire again
- Local state keeps its previous value
- Only props update

**Example of the problem:**

```typescript
// Component at /items/[id]
let selectedId = $state(null);

onMount(() => {
  selectedId = getIdFromUrl(); // Only runs on first visit!
});

// User navigates: /items/1 → /items/2
// onMount doesn't fire again!
// selectedId still shows 1 (STALE!)
```

**The fix:**

```typescript
let { data } = $props(); // data.id from URL params

// Auto-updates when URL changes
let selectedId = $derived(data.id);
```

---

### Part 2: Understanding Reactive Cycles - The Core Problem

#### What is a Reactive Cycle?

A reactive cycle occurs when an effect modifies the same state it depends on. Here's the simplest example:

```typescript
let count = $state(0);

$effect(() => {
  count = count + 1; // INFINITE LOOP!
});
```

**Why this loops (step by step):**

1. Effect executes for the first time
2. It READS `count` (value: 0) → Svelte adds this effect to `count`'s subscriber list
3. It WRITES `count = 1` → `count` signal notifies all subscribers
4. This effect is a subscriber! → Effect re-runs
5. READS `count` (value: 1) → WRITES `count = 2` → Notifies subscribers → Re-runs
6. Loop continues forever, browser freezes

**Important:** This is not a bug in Svelte. This is fundamental to how signals work. YOU must prevent these cycles with guards or proper architecture.

#### Real-World Example 1: The bind:value Initialization Loop

This was the PRIMARY cause of our Datagrid infinite loop bug.

**The Scenario:**

You have filter inputs that should remember their values from localStorage. When the page loads, filters should show the saved values.

**The Broken Code:**

```typescript
// TextFilter.svelte
let { initialValue, onChange } = $props();

// Set value from localStorage (e.g., "laptop")
let value = $state(initialValue || '');

function handleInput(event) {
  value = event.target.value;
  onChange(value); // Triggers Datagrid to load data
}
```

```svelte
<input type="text" bind:value={value} oninput={handleInput} />
```

**What happens (detailed walkthrough):**

1. **Component Creation:** Svelte creates TextFilter component, executes: `value = $state("laptop")`
2. **Template Rendering:** Svelte evaluates `bind:value={value}`
3. **bind:value Behavior:** `bind:value` creates two-way binding by setting `input.value = "laptop"` in the DOM
4. **Browser Event:** When the browser programmatically sets `input.value`, it fires an `oninput` event (this is standard DOM behavior)
5. **Handler Executes:** `handleInput` runs → calls `onChange("laptop")`
6. **Parent Updates:** Datagrid receives onChange callback → loads data from API → updates its state
7. **Re-render Triggered:** Datagrid's state change causes it to re-render → Filter component gets destroyed
8. **Filter Recreated:** Datagrid creates a new TextFilter component
9. **GOTO Step 1:** Loop repeats infinitely

**Critical timing:** Step 4 (browser fires `oninput`) happens BEFORE `onMount` fires. The event is triggered during initial DOM setup, not from user interaction.

**The Fix - One-Way Binding:**

```typescript
// TextFilter.svelte
let { initialValue, onChange } = $props();
let value = $state('');

// Set initial value ONCE during script execution
// This does NOT trigger any browser events
if (initialValue !== undefined) {
  value = String(initialValue);
}

function handleInput(event: Event) {
  // Manual synchronization: read from DOM, update state
  value = (event.target as HTMLInputElement).value;
  onChange(value);
}
```

```svelte
<!-- One-way binding: Svelte → DOM only -->
<input type="text" {value} oninput={handleInput} />
```

**Why this works:**

- `{value}` is one-way binding: Svelte writes TO the DOM, but DOM doesn't write back automatically
- Setting `value = String(initialValue)` in the script does NOT cause the browser to fire events
- `oninput` only fires from actual user typing, not from programmatic value assignment
- No initialization loop possible

**Key Takeaway:** Avoid `bind:value` when initializing inputs with external data (props, localStorage, URL params). Use one-way binding with manual event handlers.

**Reference Implementation:**
- `src/lib/components/grids/filters/TextFilter.svelte`
- `src/lib/components/grids/filters/NumberFilter.svelte`
- `src/lib/components/grids/filters/BooleanFilter.svelte`

#### Real-World Example 2: The Filter Toggle Loop

**The Scenario:**

You have a `<details>` element that should remember if it was expanded, stored in localStorage.

**The Broken Code:**

```typescript
let filterExpanded = $state(true); // From localStorage

function handleToggle() {
  filterExpanded = !filterExpanded; // Manual toggle
  saveToLocalStorage(filterExpanded);
}
```

```svelte
<details open={filterExpanded} ontoggle={handleToggle}>
  <!-- Filter inputs -->
</details>
```

**What happens (detailed walkthrough):**

**Problem 1 - Initialization Event:**

1. Component renders: `<details open={true}>`
2. Browser sets `details.open = true` (DOM property)
3. Browser fires `toggle` event (standard DOM behavior when `open` attribute changes)
4. `handleToggle` executes during initialization
5. If timing is wrong, this can trigger state updates → re-render → loop

**Problem 2 - Desynchronization:**

1. User clicks to close details
2. Browser sets `details.open = false` internally
3. Browser fires `toggle` event
4. `handleToggle` runs: `filterExpanded = !filterExpanded`
5. But if `filterExpanded` was already updated elsewhere, or if the browser's internal state differs, we have:
   - `filterExpanded` state ≠ actual DOM `open` state
6. Next render: Svelte sees prop changed, sets `open={...}` → fires `toggle` event → desynchronizes further
7. Can create a loop where toggle state flips back and forth

**The Fix - Read from DOM + Guard:**

```typescript
let filterExpanded = $state(true);
let filterToggleReady = false; // NOT $state - just a control flag

function handleToggle(event: Event) {
  // Guard: Block events during initialization
  if (!filterToggleReady) return;

  // Read DOM as source of truth - don't toggle manually
  const detailsElement = event.target as HTMLDetailsElement;
  filterExpanded = detailsElement.open;

  saveToLocalStorage(filterExpanded);
}

onMount(() => {
  // Enable toggle handling AFTER initialization complete
  filterToggleReady = true;
});
```

**Why this works:**

- Guard blocks the `toggle` event that fires during initial render
- Reading `detailsElement.open` ensures we sync FROM the DOM's actual state, not our potentially stale `filterExpanded` variable
- No manual toggle (`!value`) that can get out of sync
- DOM is the source of truth

**Key Takeaway:** For DOM elements with internal state (details, dialog, input with browser validation), treat the DOM as source of truth. Read state from the element rather than manually toggling. Always guard against initialization events.

**Reference Implementation:** `src/lib/components/grids/Datagrid.svelte:568-582`

#### Real-World Example 3: The Svelte 5 Proxy Mutation Loop (Delete Trap)

**The Scenario:**

You have a parent form component (`FormShell`) that tracks changes to its data object using an `$effect` to trigger validation. A child component (`ProductDefinitionForm`) performs validation logic on this shared data object.

**The Broken Code:**

```typescript
// ProductDefinitionForm.svelte
function validate(rawData: Record<string, any>) {
  // ❌ BAD: Mutating the reactive object directly
  if (isCreateMode) {
     // Even if 'product_def_id' does NOT exist, the delete operator on a 
     // Svelte 5 Proxy triggers reactivity!
     delete rawData.product_def_id; 
  }
  // ... validation logic
}
```

```typescript
// FormShell.svelte
$effect(() => {
   // Tracks keys of formState.data because we read them to check for changes
   const keys = Object.keys(formState.data); 
   
   // Calls validate, which mutates the data (via delete)
   runValidate(); 
});
```

**What happens (detailed walkthrough):**

1. **Effect Runs:** `FormShell`'s `$effect` runs for the first time. It tracks `formState.data` because it reads its keys/properties.
2. **Validation Call:** The effect calls `runValidate()`, which synchronously calls `validate(formState.data)`.
3. **Mutation:** `validate` executes `delete rawData.product_def_id`.
4. **Reactivity Trigger (The Trap):** 
   - In standard JS, `delete` on a non-existent property is a no-op. 
   - **In Svelte 5 Runes:** Reactive objects (`$state`) are wrapped in Proxies. The `deleteProperty` trap is triggered *regardless* of whether the property exists.
   - Svelte marks the object as mutated ("dirty") because a delete operation occurred.
5. **Loop:** The `$effect` sees that `formState.data` has "changed" (received a mutation signal) and re-runs.
6. **Repeat:** Step 2-5 repeat infinitely, causing the browser to hang or stack overflow.

**The Fix - Copy Before Mutating:**

```typescript
// ProductDefinitionForm.svelte
function validate(rawData: Record<string, any>) {
  // ✅ GOOD: Create a shallow copy first
  // This breaks the reactivity chain. We mutate a plain object, not the proxy.
  const dataToValidate = { ...rawData };

  if (isCreateMode) {
     // Mutate the copy, not the reactive proxy
     delete dataToValidate.product_def_id; 
  }
  // ... validate dataToValidate
}
```

**Key Takeaway:**

Never mutate reactive objects (`$state`, props) inside validation functions or derived calculations if those objects are being tracked by an effect that calls the validation. Always work on a copy. **Svelte 5 Proxies are sensitive to `delete` operations even on missing keys.**

---

### Part 3: Additional Critical Pitfalls

#### Guard Variables Must Not Be Reactive

**The Problem:**

```typescript
let isMounted = $state(false); // WRONG!

onMount(() => {
  isMounted = true; // Triggers re-render DURING mount
});

// Used in template or other reactive code
if (isMounted) {
  // Do something
}
```

**Why this fails:**

- `$state` makes `isMounted` a reactive signal
- Setting it to `true` notifies all subscribers
- If the template or any `$effect` reads `isMounted`, that triggers a re-render
- Re-render during mount can cause component to re-initialize
- This can create loops or break initialization logic

**The Fix:**

```typescript
let isMounted = false; // Normal variable, NOT $state

onMount(() => {
  isMounted = true; // No notification, no re-render triggered
});
```

**When to use $state vs plain variables:**

- **Use `$state`:** When value changes should trigger UI updates or run effects
- **Don't use `$state`:** For control flow flags that just guard code execution (like `isMounted`, `isReady`, `hasInitialized`)

**Reference Implementation:** `src/lib/components/grids/Datagrid.svelte` (isMounted, filterToggleReady)

#### Async Operations Without Cleanup

**The Problem:**

```typescript
let query = $state("foo");
let results = $state([]);

$effect(() => {
  const q = query; // Track dependency

  fetch(`/api/search?q=${q}`)
    .then(res => res.json())
    .then(data => {
      results = data; // BUG: Might be from old query!
    });
});
```

**Why this fails:**

Imagine user types fast: "foo" → "bar" → "baz"

1. Effect runs with query="foo" → starts fetch #1
2. User types "bar" → query changes → effect re-runs
3. Effect runs with query="bar" → starts fetch #2
4. User types "baz" → query changes → effect re-runs
5. Effect runs with query="baz" → starts fetch #3
6. But fetch #1 might complete LAST (network timing is unpredictable)
7. When fetch #1 completes: `results = dataFromFoo` → displays wrong data!

**The Fix - AbortController Pattern:**

```typescript
$effect(() => {
  const q = query;
  const controller = new AbortController();

  fetch(`/api/search?q=${q}`, { signal: controller.signal })
    .then(res => res.json())
    .then(data => { results = data; })
    .catch(err => {
      if (err.name === 'AbortError') return; // Ignore aborted requests
      console.error(err);
    });

  // Cleanup: abort when effect re-runs or component unmounts
  return () => controller.abort();
});
```

**Why this works:**

- When query changes, effect re-runs
- Before re-running, Svelte calls the cleanup function
- Cleanup aborts the previous fetch
- Only the latest fetch can complete successfully
- Guarantees results always match the current query

---

### Part 4: The Datagrid Case Study - Multiple Root Causes Combined

Now we apply everything we learned to the real production bug that prompted this investigation.

**Symptom:** Navigate to a page with a Datagrid → browser freezes with infinite re-renders, console logs stop updating.

**Context:** Datagrid component with text/number/boolean filters, column sorting, and localStorage persistence of filter/sort state.

#### Root Cause #1: bind:value in Filter Inputs

Covered thoroughly in Part 2. This was the PRIMARY root cause. Filters initialized with saved localStorage values triggered onChange during component creation via `bind:value` → infinite loop.

#### Root Cause #2: Individual Filter Debouncing (Architecture Error)

**What we did wrong:**

Each filter component debounced its own `onChange` callback:

```typescript
// Inside TextFilter.svelte
const debouncedOnChange = debounce(onChange, 300);

function handleInput(event) {
  value = event.target.value;
  debouncedOnChange(buildCondition()); // Separate 300ms timer
}
```

**Why this is architecturally wrong:**

Imagine user types in 3 different filters quickly:

1. User types in TextFilter for "name" → starts 300ms timer #1
2. User types in NumberFilter for "price" → starts 300ms timer #2
3. User types in TextFilter for "category" → starts 300ms timer #3

Result: 3 separate API calls, each 300ms apart. The last API call completes almost 1 second after the user stopped typing. This is inefficient and creates unnecessary server load.

**The correct architecture - Centralized Debouncing:**

Filters should report changes immediately. The PARENT (Datagrid) should debounce because it sees ALL filter changes and can batch them into ONE API call:

```typescript
// TextFilter.svelte - NO debounce
function handleInput(event) {
  value = event.target.value;
  onChange(buildCondition()); // Report immediately!
}

// Datagrid.svelte - Centralized debouncing
const debouncedQueryChange = debounce(async (filters, sort) => {
  isLoadingData = true;
  try {
    await onQueryChange?.({ filters, sort });
  } finally {
    isLoadingData = false;
  }
}, 300);

function handleFilterChange(key, condition) {
  // Update internal map
  activeFilters.set(key, condition);

  // Build combined query from ALL active filters
  const allFilters = buildWhereGroup();

  // ONE timer for all filter changes
  debouncedQueryChange(allFilters, sortState);
}
```

**Result:** User types in 3 filters → ONE API call, 300ms after the last keystroke in ANY filter.

**General Principle:** Debounce at the orchestrator level (parent that coordinates), not at the leaf component level (individual filters). Leaf components report events immediately, parent decides when to act on accumulated changes.

**Reference Implementation:** `src/lib/components/grids/Datagrid.svelte:224-244`

#### Root Cause #3: Unstable Column References

**What we did wrong:**

```typescript
// OfferingReportGrid.svelte
const columns: ColumnDef[] = [
  { key: "wioId", header: "ID", sortable: true, filterable: true, ... },
  { key: "title", header: "Title", ... },
  // ... 20 more columns
];

const getId = (row) => row.wioId;

<Datagrid {columns} {getId} ... />
```

**Why this causes loops:**

Every time OfferingReportGrid re-renders:

1. `columns` constant gets re-evaluated → NEW array reference (even though content is identical)
2. `getId` constant gets re-evaluated → NEW function reference
3. Svelte's prop comparison sees: `columns` reference changed
4. Datagrid receives new `columns` prop → Datagrid re-renders
5. FilterToolbar (inside Datagrid) sees new `columns` prop
6. FilterToolbar uses `{#each columns as col (col.key)}` with keying
7. BUT the array reference changed, so Svelte destroys ALL filter components and recreates them
8. Filter components re-initialize → can trigger onChange (even with guards, timing can be wrong)
9. onChange triggers data load → Datagrid updates state → re-renders → GOTO step 1

**The fix - Module-level exports:**

```typescript
// OfferingReportGrid.columns.ts - Separate file
export function getId(row: OfferingReportViewWithLinks): number {
  return row.wioId;
}

export const columns: ColumnDef<typeof OfferingReportViewSchema>[] = [
  { key: "wioId", header: "ID", filterable: false, sortable: true, ... },
  { key: "title", header: "Title", filterable: true, ... },
  // ... all columns
];

// OfferingReportGrid.svelte
import { columns, getId } from "./OfferingReportGrid.columns";

<Datagrid {columns} {getId} ... /> // Same reference every render!
```

**Why this works:**

- Module-level constants are created ONCE when the module loads
- Importing them gives you the SAME reference every time
- Props never change (reference-wise) → no unnecessary re-renders
- Filter components are never destroyed/recreated unless actually needed

**General Principle:** Configuration objects that should remain stable across component renders must be defined at module scope, not component scope. This includes: column definitions, row ID functions, strategy objects, large constant arrays/objects.

**Reference Implementation:** `src/lib/components/domain/reports/offerings/OfferingReportGrid.columns.ts`

#### Root Cause #4: setTimeout vs await tick()

**What we did wrong:**

```typescript
onMount(() => {
  setTimeout(() => {
    // Load initial data
  }, 0);
});
```

**Why this is a hack:**

- `setTimeout` schedules on the JavaScript event loop
- It doesn't coordinate with Svelte's internal scheduler
- Svelte batches reactive updates in microtasks
- We need to wait for Svelte's scheduler to complete pending updates, not just defer to next event loop tick

**The fix - await tick():**

```typescript
onMount(() => {
  // IIFE (Immediately Invoked Function Expression) for async execution
  (async () => {
    await tick(); // Wait for Svelte's scheduler to complete

    isLoadingData = true;
    try {
      await onQueryChange?.({ filters, sort });
    } finally {
      isLoadingData = false;
    }
  })();

  // Cleanup function (must be returned synchronously)
  return () => {
    isMounted = false;
  };
});
```

**Why IIFE pattern:**

- `onMount` expects a synchronous function so it can register cleanup
- We need async execution for `await tick()` and `await onQueryChange()`
- Solution: Wrap async code in IIFE that executes immediately
- Return cleanup function synchronously from outer `onMount`

**General Principle:** Use `await tick()` when you need to defer execution until Svelte's scheduler completes its current batch of updates. This is the Svelte-native way to handle timing, not `setTimeout`.

**Reference Implementation:** `src/lib/components/grids/Datagrid.svelte:246-292`

#### Root Cause #5: initialFilterValues Immutability

**What we did wrong:**

```typescript
// Datagrid.svelte
const initialFilterValues = savedState.filters
  ? convertWhereToFilterValues(savedState.filters)
  : null;

function handleClearAllFilters() {
  activeFilters.clear();
  filterResetKey++; // Recreates filter components

  await onQueryChange?.({ filters: null, sort });
}
```

**The problem:**

1. User has saved filters in localStorage: `{ name: "laptop", price: ">100" }`
2. Grid loads, `initialFilterValues` Map contains these values
3. Filter components initialize with these values → inputs show "laptop" and ">100"
4. User clicks "Clear all filters"
5. `activeFilters.clear()` → backend query has no filters ✅
6. `filterResetKey++` → Filter components destroyed and recreated
7. BUT `initialFilterValues` Map still contains `{ name: "laptop", price: ">100" }`
8. New filter components initialize with `initialValue` from this Map
9. Input fields show "laptop" and ">100" even though data is unfiltered ❌

**The fix:**

```typescript
// initialFilterValues must be $state so it can be cleared
let initialFilterValues = $state<Map<string, any> | null>(
  savedState.filters ? convertWhereToFilterValues(savedState.filters) : null
);

function handleClearAllFilters() {
  activeFilters.clear();

  // CRITICAL: Clear initial values BEFORE recreating components
  initialFilterValues = null;
  filterResetKey++;

  await onQueryChange?.({ filters: null, sort });
}
```

**Why this works:**

- Setting `initialFilterValues = null` clears the Map
- THEN `filterResetKey++` destroys and recreates filter components
- New components receive `initialValue={undefined}` from the now-null Map
- Input fields are empty ✅

**General Principle:** When using `{#key}` to force component recreation, ensure initial values are cleared/updated BEFORE incrementing the key. Otherwise recreated components will receive stale initialization data.

**Reference Implementation:** `src/lib/components/grids/Datagrid.svelte:190-193, 567`

---

### Part 5: Component-Owned Loading State Pattern

This is the architectural principle that solved the original coordination problem in Part 3.

#### The Principle

**Rule:** The component that triggers an async operation should own the loading state for that operation.

#### Anti-Pattern: Split Responsibility

```typescript
// ❌ WRONG - Page manages loading for Grid's operation
// Page.svelte
let isLoading = $state(false);

async function handleQueryChange(query) {
  isLoading = true;
  try {
    const data = await api.load(query);
    rows = data;
  } finally {
    isLoading = false;
  }
}

<Grid loading={isLoading} onQueryChange={handleQueryChange} />

// Grid.svelte
let { loading, onQueryChange } = $props();

onMount(() => {
  onQueryChange({ filters, sort }); // Triggers parent's function
});

{#if loading}<spinner />{/if}
```

**Problem:** Grid triggers the operation but doesn't control the loading state. This creates:
- Coordination complexity (Grid must wait for Page to update `loading`)
- Bidirectional coupling (Grid → Page via callback, Page → Grid via prop)
- Navigation issues (stale state across route changes)

#### Correct Pattern: Component-Owned State

```typescript
// ✅ CORRECT - Grid owns both trigger AND state
// Grid.svelte
let { onQueryChange } = $props();
let isLoadingData = $state(false); // Grid owns this

onMount(() => {
  (async () => {
    await tick();

    isLoadingData = true;
    try {
      await onQueryChange?.({ filters, sort });
    } finally {
      isLoadingData = false; // Always cleared, even on error
    }
  })();
});

{#if isLoadingData}<spinner />{/if}
```

**Benefits:**

- **Single responsibility:** Grid controls when to load, when to show spinner
- **Navigation-resilient:** Fresh state on every mount
- **No coordination:** Page just provides callback, doesn't manage Grid's lifecycle

#### When Parent Loading State is OK

```typescript
// Parent loads data, child is purely presentational
let data = $state(null);
let isLoading = $state(false);

onMount(async () => {
  isLoading = true;
  try {
    data = await api.load();
  } finally {
    isLoading = false;
  }
});

// Child is PASSIVE - just displays what parent loaded
<DisplayComponent {data} {isLoading} />
```

**Use `loading` prop when child is purely presentational and doesn't trigger its own data loading.**

#### Multiple Loading States in Complex Pages

```typescript
// Complex page with multiple independent operations
let loadingSupplier = $state(false);
let loadingCategories = $state(false);
let loadingOrders = $state(false);

// Derived: "Is ANYTHING loading?"
let isAnyLoading = $derived(
  loadingSupplier || loadingCategories || loadingOrders
);

// Show page-level spinner only if something is loading
{#if isAnyLoading}
  <div class="page-spinner"></div>
{:else}
  <SupplierDetails {supplier} />
  <CategoryGrid rows={categories} /> <!-- Has ITS OWN loading state -->
  <OrderGrid rows={orders} />         <!-- Has ITS OWN loading state -->
{/if}
```

**Separation of Concerns:**
- Page loading: For initial data needed to show page structure
- Grid loading: For Grid's own operations (filtering, sorting, pagination)
- **No conflation**

---

### Part 6: Best Practices Summary

#### Filter Implementation Checklist

- [ ] Use one-way binding `{value}`, NOT `bind:value`, for inputs with external initial values
- [ ] Set initial value in script during variable initialization, NOT in `onMount`
- [ ] Call `onChange` immediately when user types, do NOT debounce in filter component
- [ ] Guard variables (`isReady`, `isMounted`) should be plain `let`, NOT `$state`

#### Grid Configuration Checklist

- [ ] Column definitions in module-level `.columns.ts` file (separate from component)
- [ ] Export `getId`, `deleteStrategy`, etc. from same module-level file
- [ ] Parent creates stable reference to `onQueryChange` callback
- [ ] Centralized debouncing in Datagrid (300ms), not in filters

#### State Management Rules

- [ ] Component-owned loading state for operations the component triggers
- [ ] Use `await tick()` in `onMount` for initialization timing
- [ ] IIFE pattern for async code inside sync `onMount` function
- [ ] Always provide cleanup function in `onMount` return

#### Common Anti-Patterns to Avoid

**Don't:**
- ❌ Use `bind:value` for inputs initialized with props/localStorage/URL params
- ❌ Make guard flags reactive with `$state` (use plain `let`)
- ❌ Manually toggle DOM element state with `!value` (read from DOM instead)
- ❌ Debounce at leaf component level (debounce at orchestrator level)
- ❌ Define columns/config objects at component level (use module level)
- ❌ Use `setTimeout` for Svelte timing (use `await tick()`)
- ❌ Use `const` for values that need runtime clearing (use `$state`)

**Do:**
- ✅ Use one-way binding with manual event handlers for controlled inputs
- ✅ Guard initialization events with non-reactive flags
- ✅ Read DOM state as source of truth for elements with internal state
- ✅ Report changes immediately from leaf components, debounce in parent
- ✅ Stable references for configuration via module-level exports
- ✅ Coordinate with Svelte's scheduler using `await tick()`
- ✅ Make values reactive when they need runtime updates

---

### Part 7: Reference Implementation

**Filter Components:**
- `src/lib/components/grids/filters/TextFilter.svelte` - One-way binding pattern
- `src/lib/components/grids/filters/NumberFilter.svelte` - One-way binding with operator selection
- `src/lib/components/grids/filters/BooleanFilter.svelte` - Select element with one-way binding

**Datagrid Core:**
- `src/lib/components/grids/Datagrid.svelte:246-292` - onMount with await tick() and IIFE pattern
- `src/lib/components/grids/Datagrid.svelte:224-244` - Centralized debouncing implementation
- `src/lib/components/grids/Datagrid.svelte:568-582` - filterToggle guard pattern
- `src/lib/components/grids/Datagrid.svelte:190-193, 567` - initialFilterValues as $state

**Grid Configuration:**
- `src/lib/components/domain/reports/offerings/OfferingReportGrid.columns.ts` - Module-level exports for stable references

---

### Key Takeaways

1. **Svelte 5's reactivity requires understanding dependencies**
   - Every READ in a reactive context creates a subscription
   - Every WRITE notifies subscribers
   - Reactive cycles are easy to create accidentally

2. **Component ownership matters**
   - Component that triggers an operation should own its loading state
   - Don't split responsibility across parent/child unnecessarily

3. **SvelteKit component reuse is an optimization with consequences**
   - Components must handle prop changes without re-initialization
   - Use `$derived` or `$effect` to react to prop changes
   - Don't rely on `onMount` for navigation updates

4. **Avoid global state as a band-aid**
   - Global state can mask architectural problems
   - Fix root cause (split responsibility) instead of adding "circuit breakers"

5. **Guard against reactive cycles**
   - Be careful setting state inside `$effect`
   - Use `untrack()` when reading without subscribing
   - Prefer `$derived` for pure computations

This pattern - component-owned async state with proper initialization guards - is the foundation for building robust, navigation-resilient Svelte 5 applications.

---

## Minimal Copy/Paste Snippets

### ALTER Add Field (Idempotent)
```sql
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='wholesaler_item_offerings' AND COLUMN_NAME='price_per_piece')
  ALTER TABLE dbo.wholesaler_item_offerings ADD price_per_piece DECIMAL(10,2) NULL;
```

### View Add Field
```sql
..., wio.price_per_piece as wioPricePerPiece, ws.relevance as wsRelevance, ws.price_range as wsPriceRange, ...
```

### Zod Schema (Entity)
```ts
price_per_piece: z.number().multipleOf(0.01).nullable().optional(),
origin: z.string().max(255).nullable().optional(),
wholesaler_price: z.number().multipleOf(0.01).nullable().optional(),
```

### Zod Schema (Report View)
```ts
wioPricePerPiece: z.number().nullable().optional(),
wsRelevance: z.number().nullable().optional(),
wsPriceRange: z.string().max(200).nullable().optional(),
```

### Grid Column Definition (Entity Grid)
```ts
{ key: "wio.price_per_piece", header: "Price/pc", filterable: true, filterType: "number", accessor: r => r.price_per_piece == null ? "—" : `${r.currency ?? "USD"} ${r.price_per_piece.toFixed(2)}` }
```

---

## Troubleshooting (Known Issues)

- **"CREATE VIEW must be the first statement":**
  - Split batches with `GO`; run DROP and CREATE separately; or use `CREATE OR ALTER VIEW`.
- **Report Grid TS error "Property X does not exist":**
  - Update `OfferingReportViewSchema` and ensure `DDL-Views.sql` has matching alias names.
- **Filters not visible:**
  - No columns with `filterable: true`, or toolbar was not mounted.
- **Sorting wired but nothing happens:**
  - You used `onSort`. Switch to `onQueryChange({ filters, sort })`.

---

## PR Checklist (Enforce Before Merge)

- [ ] ALTER script is idempotent; view updated safely.
- [ ] Zod schemas match DB/view (entity + report).
- [ ] Report aliases and TS schema names match exactly.
- [ ] Grids use `onQueryChange`; columns have correct `filterType`.
- [ ] `npm run check` passes; manual filter/sort sanity check done.