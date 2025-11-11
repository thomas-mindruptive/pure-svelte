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

This chapter documents fundamental principles of Svelte 5's reactivity system, common pitfalls when building reactive components, and the architectural evolution from passive to autonomous component design. The lessons are illustrated through a concrete bug we encountered: **an infinite render loop in our Datagrid during navigation**.

---

### Part 1: Svelte 5 Reactivity Fundamentals

#### Signals-Based Reactivity

Svelte 5 uses a **signals-based reactivity system** - a radical departure from Svelte 4's compile-time reactive statements. Understanding this system is crucial to avoiding reactive cycles and infinite loops.

```javascript
// 1. Signal Creation ($state)
let count = $state(0);
// Creates a reactive signal that notifies subscribers when changed

// 2. Dependency Tracking ($effect)
$effect(() => {
  console.log(count);  // This READ is tracked
  // Effect automatically subscribes to 'count' signal
});

// 3. Update Propagation
count = 5;
// → Signal notifies all subscribers
// → Effects re-run in microtask
// → DOM updates surgically (only affected nodes)
```

**Key Properties:**

1. **Runtime Dependency Tracking:** Unlike Svelte 4's compile-time analysis, Svelte 5 tracks dependencies at runtime by recording which signals are READ during effect execution.

2. **Fine-Grained Updates:** When a signal changes, only the specific DOM nodes and effects that depend on it are updated - not the entire component.

3. **Microtask Batching:** Multiple synchronous state changes are batched and applied in a single microtask, preventing cascading updates.

#### The Three Reactive Primitives

```javascript
// $state - creates reactive values
let name = $state("Alice");
let items = $state([1, 2, 3]);  // Deep reactivity via Proxies

// $derived - computed values (no side effects allowed)
let doubled = $derived(count * 2);
// Re-evaluates ONLY when count changes

// $effect - side effects (runs when dependencies change)
$effect(() => {
  document.title = `Count: ${count}`;  // Side effect
});
```

**Critical Distinction:**
- `$derived`: Pure computation, returns value
- `$effect`: Impure operation, no return value (or returns cleanup function)

#### Component Lifecycle in Svelte 5

**Initialization (happens ONCE):**
```javascript
// Component script runs ONCE when mounted
let localState = $state(0);  // ← Initialized once

onMount(() => {
  console.log("Mounted");  // ← Runs once
});

$effect(() => {
  // ← Starts tracking dependencies once mounted
});
```

**Re-render (happens on prop/state changes):**
```javascript
// When props or reactive state changes:
// - Script does NOT re-run
// - Local state persists
// - Only reactive dependencies update
// - Template re-renders surgically
```

**SvelteKit Component Reuse:**

When navigating between similar routes (`/items/1` → `/items/2`), SvelteKit **reuses** the component:
- `onMount` does NOT fire again
- Local state keeps its previous value
- Only props update

This is an **optimization**, but creates a contract: **Components must handle prop changes without re-initialization.**

---

### Part 2: Common Reactivity Pitfalls

#### Pitfall 1: Reactive Cycles

**The Problem:**

```javascript
// ❌ INFINITE LOOP
let count = $state(0);

$effect(() => {
  count = count + 1;  // Reads count → subscribes
                      // Writes count → triggers effect again
                      // → CYCLE!
});
```

**Why this happens:**
1. Effect runs, reads `count` → subscribes to `count` signal
2. Effect writes `count` → notifies subscribers (including itself!)
3. Effect re-runs → reads `count` → writes `count` → loop!

**The Solution - Guard Conditions:**

```javascript
// ✅ SAFE - with guard
let count = $state(0);
let needsUpdate = $state(true);

$effect(() => {
  if (needsUpdate) {
    count = count + 1;  // Writes count
    needsUpdate = false;  // Prevents re-trigger
  }
});
```

**When state mutation in effects is OK:**
- You have an explicit guard condition
- You use `untrack()` to prevent subscription
- You're syncing external data sources (one-way flow)

#### Pitfall 2: Multiple Conflicting Reactive Properties

**The Problem:**

```javascript
// ❌ CONFLICTING SIGNALS
let isLoading = $state(false);
let hasError = $state(false);
let data = $state(null);

// These can contradict each other!
// isLoading=true + hasError=true + data=[items]  ← Impossible state!
```

**The Solution - Single Source of Truth:**

```javascript
// ✅ SINGLE STATE MACHINE
let status = $state<'idle' | 'loading' | 'error' | 'success'>('idle');
let data = $state(null);
let error = $state(null);

// Derived booleans for convenience
let isLoading = $derived(status === 'loading');
let hasError = $derived(status === 'error');

// Impossible to have contradictory state!
```

#### Pitfall 3: Stale State After Navigation

**The Problem:**

```javascript
// Component at /items
let selectedId = $state(null);

onMount(() => {
  // Runs once on first visit
  selectedId = getIdFromUrl();
});

// User navigates: /items/1 → /items/2
// onMount doesn't fire again!
// selectedId still = 1  ← STALE!
```

**The Solution - React to Props:**

```javascript
let { data } = $props();  // data.id from URL

let selectedId = $derived(data.id);  // ✅ Always synced

// OR use $effect if you need side effects
$effect(() => {
  selectedId = data.id;  // Runs when data.id changes
});
```

#### Pitfall 4: Async Operations Without Cleanup

**The Problem:**

```javascript
// ❌ RACE CONDITION
let query = $state("foo");
let results = $state([]);

$effect(() => {
  const q = query;  // Track dependency
  fetch(`/api/search?q=${q}`)
    .then(res => res.json())
    .then(data => {
      results = data;  // BUG: Might be from old query!
    });
});

// User types fast: "foo" → "bar" → "baz"
// Three fetches start, but "foo" might finish last
// → Wrong results displayed!
```

**The Solution - Abort Pattern:**

```javascript
// ✅ SAFE - abort stale operations
$effect(() => {
  const q = query;
  const controller = new AbortController();

  fetch(`/api/search?q=${q}`, { signal: controller.signal })
    .then(res => res.json())
    .then(data => { results = data; })
    .catch(err => {
      if (err.name === 'AbortError') return;  // Ignore aborted
      console.error(err);
    });

  // Cleanup: abort when effect re-runs or unmounts
  return () => controller.abort();
});
```

---

### Part 3: The Concrete Bug - Infinite Render Loop

**Symptom:** During client-side navigation to a ListPage (`/suppliers`, `/offerings`), the Datagrid would enter an **infinite render loop** - continuously re-rendering, freezing the browser, consuming CPU.

**Key Observation:** Only happened on navigation, NOT on full page reload.

#### The Broken Architecture

```javascript
// OfferingReportListPage.svelte - BROKEN
let isLoading = $state(false);  // Page manages loading state
let resolvedOfferings = $state([]);

async function handleQueryChange(query) {
  isLoading = true;  // ← Page sets loading
  try {
    resolvedOfferings = await offeringApi.load(query);
  } finally {
    isLoading = false;  // ← Page clears loading
  }
}

// Page passes loading state DOWN to Grid
<OfferingReportGrid
  rows={resolvedOfferings}
  loading={isLoading}  // ← External loading signal
  onQueryChange={handleQueryChange}
/>
```

```javascript
// Datagrid.svelte - BROKEN
let { loading, onQueryChange, rows } = $props();

onMount(() => {
  // Grid calls parent's callback
  if (onQueryChange) {
    onQueryChange({ filters, sort });  // ← Triggers parent's handleQueryChange
  }
});

// Grid shows spinner based on EXTERNAL prop
{#if loading}
  <div class="spinner"></div>
{/if}
```

**The Responsibility Split:**
- **Grid**: Triggers the operation (`onQueryChange()`)
- **Page**: Manages loading state (`isLoading`)
- **Grid**: Displays loading based on Page's state

This is a **coordination anti-pattern** - two components share responsibility for one operation.

#### Why It Looped

**The Reactive Cycle:**

```
1. Navigation → Component reused (SvelteKit optimization)
2. Datagrid.onMount fires (Grid is new, even if Page is reused)
3. Grid calls onQueryChange()
4. Page.handleQueryChange() sets isLoading = true
5. Grid receives loading={true} via prop
6. Grid re-renders due to prop change
7. ???
8. Something triggers onMount again OR
   Something updates a reactive dependency
9. GOTO step 3 → LOOP!
```

The exact trigger for step 7-8 varied, but the pattern was:
- **Multiple reactive signals** (Page's isLoading + Grid's internal state)
- **Bidirectional coupling** (Grid → Page via callback, Page → Grid via prop)
- **State persisting across navigation** (stale values causing wrong decisions)

#### Attempted Fix #1: Global Loading State

```javascript
// ❌ BANDAID - doesn't solve root cause
import { offeringLoadingState } from '$lib/api/client/offering';

<OfferingReportGrid
  loading={isLoading || $offeringLoadingState}  // "Defense in depth"
/>
```

**Why this seemed to work:**
- Global state provided a "circuit breaker"
- If local state got stale, global state might save it

**Why this is WRONG:**
1. **Not generalizable:** What if Page loads multiple different API resources? Combine all their global states?
2. **Symptom fix:** Doesn't address the architectural problem (split responsibility)
3. **Adds complexity:** Now three sources of loading state (local, global, Grid's display)

---

### Part 4: The Correct Solution - Autonomous Components

#### Principle: Components Should Own Their Operations

**Rule:** If a component **triggers** an async operation, it should **manage** the loading state for that operation.

#### The Fix

```javascript
// Datagrid.svelte - FIXED
let { onQueryChange, rows } = $props();  // ← NO loading prop!
let isLoadingData = $state(false);  // ← Grid owns its loading state

onMount(async () => {
  if (onQueryChange) {
    isLoadingData = true;  // ← Set before operation
    try {
      await onQueryChange({ filters, sort });  // ← Await the operation
    } finally {
      isLoadingData = false;  // ← Always clear (even on error)
    }
  }
});

// Grid shows spinner based on ITS OWN state
{#if isLoadingData}
  <div class="spinner"></div>
{/if}
```

```javascript
// OfferingReportListPage.svelte - FIXED
let resolvedOfferings = $state([]);

// NO isLoading state for Grid! Grid manages its own.

async function handleQueryChange(query) {
  // Just load data, don't manage loading
  resolvedOfferings = await offeringApi.load(query);
}

// NO loading prop!
<OfferingReportGrid
  rows={resolvedOfferings}
  onQueryChange={handleQueryChange}
/>
```

#### Why This Works

**Single Responsibility:**
- Grid triggers operation → Grid manages loading → Grid displays spinner
- Page provides data source (`onQueryChange` callback)
- Page updates data (`rows` prop)
- **No coordination needed between Grid and Page for loading state**

**No Reactive Cycles:**
- Grid's `isLoadingData` is independent of Page's state
- Grid's `await onQueryChange()` naturally sequences the operation
- No bidirectional coupling

**Navigation-Resilient:**
- Even if Page component reuses and has stale state, Grid always starts fresh when IT mounts
- Grid's `onMount` is the single source of truth for initialization

#### When Page Needs Its Own Loading

```javascript
// Page loading multiple resources
let isPageLoading = $state(false);
let supplier = $state(null);
let categories = $state([]);

$effect(() => {
  isPageLoading = true;
  try {
    const [s, c] = await Promise.all([
      supplierApi.load(id),
      categoryApi.loadFor(id)
    ]);
    supplier = s;
    categories = c;
  } finally {
    isPageLoading = false;
  }
});

// Page can show ITS loading overlay
{#if isPageLoading}
  <div class="page-spinner"></div>
{:else}
  <SupplierDetails {supplier} />
  <Datagrid rows={categories} />
  <!--  ↑ Grid has ITS OWN loading, independent of page -->
{/if}
```

**Separation of Concerns:**
- `isPageLoading`: For Page-level operations (loading master data)
- `Datagrid.isLoadingData`: For Grid-level operations (loading/sorting grid data)
- **No conflation, no coordination**

---

### Part 5: Generalizable Patterns

#### Pattern 1: Component-Owned Async State

**When a component triggers async work:**

```javascript
// ✅ CORRECT
let isLoading = $state(false);

async function doWork() {
  isLoading = true;
  try {
    await someAsyncOperation();
  } finally {
    isLoading = false;  // Guaranteed cleanup
  }
}

{#if isLoading}<spinner />{/if}
```

**Don't pass loading as prop IF component controls the operation.**

#### Pattern 2: Parent-Owned Async State (When Appropriate)

**When parent loads data for child to display:**

```javascript
// Parent loads, child displays
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

// Child is PASSIVE - just displays
<DisplayComponent {data} {isLoading} />
```

**Use `loading` prop when child is purely presentational.**

#### Pattern 3: Derived Loading States

**For complex scenarios with multiple operations:**

```javascript
let loadingSupplier = $state(false);
let loadingCategories = $state(false);
let loadingOrders = $state(false);

// Derived: "Is ANYTHING loading?"
let isAnyLoading = $derived(
  loadingSupplier || loadingCategories || loadingOrders
);

// Display page-level spinner
{#if isAnyLoading}<spinner />{/if}
```

**Composition over global state.**

#### Pattern 4: Avoid State in $effect (Usually)

```javascript
// ❌ AVOID - creates dependency
$effect(() => {
  isLoading = somethingElse;  // isLoading becomes reactive to somethingElse
});

// ✅ PREFER - explicit control
$derived somethingElse;  // For pure computation
// OR
async function handleEvent() {  // For operations
  isLoading = true;
  // ...
}
```

**Only set state in $effect when:**
- You're syncing to external data (props, stores)
- You have explicit guards to prevent cycles
- You understand the dependency graph

---

### Key Takeaways

1. **Svelte 5's reactivity is powerful but requires understanding dependencies**
   - Every read in a reactive context creates a subscription
   - Every write notifies subscribers
   - Cycles are easy to create accidentally

2. **Component ownership matters**
   - Component that triggers operation should own its loading state
   - Don't split responsibility across parent/child boundaries unnecessarily

3. **SvelteKit component reuse is an optimization with tradeoffs**
   - Components must handle prop changes without re-initialization
   - Use `$derived` or `$effect` to react to prop changes
   - Don't rely on `onMount` for updates

4. **Avoid global state as a band-aid**
   - Global state can mask architectural problems
   - Fix root cause (responsibility split) instead of adding "circuit breakers"

5. **Guard against reactive cycles**
   - Be careful when setting state inside `$effect`
   - Use `untrack()` when reading without subscribing
   - Prefer `$derived` for pure computations

This pattern - component-owned async state - is the foundation for building robust, navigation-resilient Svelte 5 applications.