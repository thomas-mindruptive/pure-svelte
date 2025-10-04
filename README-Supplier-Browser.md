# SupplierBrowser - Architectural Specification & Developer Guide

**Single source of truth for the project's architecture. All development must adhere to the patterns and principles defined herein.**

---

## The Vision: What is the SupplierBrowser?

The SupplierBrowser is a specialized, high-performance tool for managing a 5-level data hierarchy. Its primary purpose is to provide a fast and intuitive interface for navigating and editing complex relationships between business entities.

### The 5 Levels of the Hierarchy

The application's logic is built around a clear, five-level data model. Understanding the distinction between **Master Data**, **Hierarchical Real Objects**, and **Relationships** is critical.

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

### The User Experience: A SvelteKit-Powered Application

The application leverages SvelteKit's file-based routing to provide a robust and bookmarkable user experience. The state of the application is primarily driven by the URL's path, creating a seamless, app-like feel with client-side navigation. This approach replaces the previous query-parameter-based state management. See the Frontend Architecture section for a detailed breakdown.

---

## Generic Type System - FINALIZED ARCHITECTURE

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
- **Pillar VII: Enhanced Datagrid Component:** Autonomous sorting and scrollable body with sticky headers.
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

**Benefits Achieved:**
- **✅ Single Source of Truth:** Column definitions only exist in Zod schemas
- **✅ Runtime Validation:** QueryBuilder validates SELECT columns against schemas
- **✅ Type Safety:** Compile-time types automatically derived from schemas
- **✅ JOIN Support:** Complex queries with schema-based column validation
- **✅ Auto-Completion:** Perfect IntelliSense for all qualified columns like "w.name", "pc.category_id"

**Migration Completed:**
1. **✅ Phase 1:** Table Registry implemented with automatic type generation
2. **✅ Phase 2:** QueryBuilder enhanced with schema-based validation
3. **✅ Phase 3:** Hardcoded column lists removed from queryConfig
4. **✅ Phase 4:** Type system fully generated from Table Registry
5. **✅ Phase 5:** Legacy queryConfig.types.ts removed

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

The generic `Datagrid.svelte` component has been enhanced to be more autonomous and feature-rich, simplifying its usage in list pages across the application.

#### Autonomous Sorting

The Datagrid now manages its own sorting state and data loading lifecycle. This is achieved through a new architectural pattern where the responsibility for sorting is moved into the component itself.

-   **`apiLoadFunc` Prop:** A parent component (e.g., `SupplierListPage.svelte`) can now pass an `apiLoadFunc` property to the Datagrid. This function serves as a callback that the Datagrid can invoke whenever a new data state is required.
-   **Internal State Management:** The Datagrid maintains its own internal `sortState`, which is an array of `SortDescriptor` objects to support multi-column sorting. When a user clicks a column header, the Datagrid updates this internal state.
-   **Data-Driven Reloading:** After updating its `sortState`, the Datagrid calls the provided `apiLoadFunc` with the new sort descriptors. This is where the seamless integration with the **Query Grammar** happens: the parent-provided function is responsible for translating the `SortDescriptor[]` array into the `orderBy` clause of a `QueryPayload` object and executing the API call. The Datagrid then updates its internal `rows` with the new, sorted data from the server.
-   **Simplified Parent Components:** This new architecture drastically simplifies the parent list pages. They are now only responsible for providing the initial data set and the `apiLoadFunc` callback. All subsequent sorting-related state management and data fetching is encapsulated within the Datagrid.

#### Implementation Pattern for Datagrid Integration
**MANDATORY structure** for entity grids:

```typescript
// EntityGrid.svelte - Thin wrapper
const columns: ColumnDef<Entity>[] = [
  { key: "name", header: "Name", sortable: true },
  // Define all columns with proper typing
];

const getId = (r: Entity) => r.entity_id;
```

```svelte
<Datagrid
  {rows}
  {columns}
  {getId}
  gridId="entities"
  entity="entity"
  {deleteStrategy}
  {rowActionStrategy}
  {apiLoadFunc}
  maxBodyHeight="550px"
/>
```

**Reference Example:** `src/lib/components/domain/suppliers/SupplierGrid.svelte`

#### Scrollable Body with Sticky Header

To improve the user experience with long lists of data, the Datagrid now supports a scrollable body with a fixed (sticky) header and toolbar.

-   **Activation:** This behavior is enabled by adding the `.pc-grid--scroll-body` CSS modifier class to the Datagrid's root element.
-   **Dynamic Height Control:** The height of the scrollable area is controlled via a `maxBodyHeight` prop, which sets a `--pc-grid-body-max-height` CSS variable. This allows parent components to flexibly define the grid's dimensions (e.g., `maxBodyHeight="75vh"`).
-   **Implementation:** The component's internal structure uses a CSS Flexbox layout. The toolbar and table header (`<thead>`) have a fixed size (`flex-shrink: 0`), while the table body container (`.pc-grid__scroller`) is configured to grow and fill the remaining available space (`flex-grow: 1`) and manage its own vertical scrollbar. The `<thead>` uses `position: sticky` to remain visible within this scrollable container.

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

This section documents **actual bugs** that occurred during development. Each entry includes the bug, its impact, and the correct pattern.

### Bug #1: Off-by-One Error in Array Length Checks

**The Bug:**
```typescript
// ❌ WRONG - Returns empty array when exactly 1 item exists
if (responseData.results?.length > 1) {
  return transformToNestedObjects(responseData.results, Schema);
} else {
  return [];
}
```

**Impact:**
- First OrderItem created for an Order would not appear in the list
- Any single-item result would be lost
- Silent data loss - no error thrown

**Root Cause:** Copied code from a "warn if multiple" pattern and used `> 1` instead of `> 0`

**Correct Pattern:**
```typescript
// ✅ CORRECT - Handles 0, 1, or many items
if (responseData.results && responseData.results.length > 0) {
  return transformToNestedObjects(responseData.results, Schema);
} else {
  return [];
}

// Mental checklist for array operations:
// ✓ What happens with 0 elements?
// ✓ What happens with 1 element?
// ✓ What happens with 2+ elements?
```

**Where it occurred:** `src/lib/api/client/order.ts:197` (fixed)

**Detection:** User reported that new OrderItems didn't appear after creation

---

### Bug #2: Missing autoValidate in Forms

**The Bug:**
```typescript
// ❌ WRONG - FormShell defaults to autoValidate="submit"
<FormShell
  entity="Order"
  initial={initial}
  submitCbk={submitOrder}
  {disabled}
>
```

**Impact:**
- HTML5 validation errors don't clear when user fixes the input
- User sees stale "Please select..." messages even after selecting a value
- Poor UX - user thinks form is broken

**Root Cause:** Forgot to set `autoValidate` prop, relying on default behavior

**Correct Pattern:**
```typescript
// ✅ CORRECT - Explicitly set validation mode
<FormShell
  entity="Order"
  initial={initial}
  autoValidate="change"  // or "blur" depending on UX preference
  submitCbk={submitOrder}
  {disabled}
>

// Choose validation mode:
// - "submit": Validate only on form submission (default)
// - "blur": Validate when field loses focus (good UX for most forms)
// - "change": Validate on every input change (immediate feedback, can be noisy)
```

**Where it occurred:** `OrderForm.svelte`, `OrderItemForm.svelte` (fixed)

**Detection:** User noticed validation messages didn't update after fixing input

---

### Bug #3: UI Defaults Not Applied to Form Data

**The Bug:**
```typescript
// ❌ WRONG - Default only affects display, not actual data
<select value={getS("status") ?? "pending"}>
  <option value="pending">Pending</option>
</select>

// formState.data.status remains undefined/null!
```

**Impact:**
- Form shows "Pending" but submits `null` for status
- Database constraint violations or unexpected behavior
- Mismatch between UI and actual data

**Root Cause:** Misunderstanding - `?? "pending"` is just a display fallback, doesn't set the value in FormShell state

**Correct Pattern:**
```typescript
// ✅ CORRECT - Apply defaults BEFORE passing to FormShell
const initialWithDefaults = $derived.by(() => {
  const base = initial || {};
  return {
    ...base,
    status: base.status ?? "pending",  // Set actual default value
  } as Order;
});

<FormShell initial={initialWithDefaults} ... />
```

**Where it occurred:** `OrderForm.svelte` (fixed)

**Detection:** FormShell debug block showed `status: null` despite dropdown showing "Pending"

---

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