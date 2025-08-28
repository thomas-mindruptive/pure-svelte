# SupplierBrowser - Architectural Specification & Developer Guide

**Single source of truth for the project's architecture. All development must adhere to the patterns and principles defined herein.**

*Updated: 28. August 2025 - Generic Type System & Hierarchical Patterns Finalized*

---

## 1. The Vision: What is the SupplierBrowser?

The SupplierBrowser is a specialized, high-performance tool for managing a 5-level data hierarchy. Its primary purpose is to provide a fast and intuitive interface for navigating and editing complex relationships between business entities.

### 1.1. The 5 Levels of the Hierarchy

The application's logic is built around a clear, five-level data model. Understanding the distinction between **Master Data**, **Hierarchical Real Objects**, and **Relationships** is critical.

#### Level 1: Suppliers (Master Data)
- **Entity**: `dbo.wholesalers`
- **Purpose**: Independent master data entities that can be queried flexibly
- **API Pattern**: QueryPayload for lists + Standard CRUD for individuals
- **Creation**: `/api/suppliers/new` POST with direct entity data

#### Level 2: Categories (Relationship - Simple Assignment)  
- **Entity**: `dbo.wholesaler_categories`
- **Purpose**: Pure n:m relationship between suppliers and global categories
- **Properties**: `comment`, `link` (simple metadata)
- **API Pattern**: `/api/supplier-categories` CREATE/DELETE with AssignmentRequest
- **Master Data**: Category definitions via `/api/categories/new`

#### Level 3: Offerings (Relationship - 1:n Hierarchical)
- **Entity**: `dbo.wholesaler_item_offerings`
- **Purpose**: Products that exist only in [supplier + category] context
- **Key Characteristic**: Cannot be created independently - always require parent context
- **API Pattern**: `/api/category-offerings` CREATE/UPDATE/DELETE with CreateChildRequest
- **NO** `/api/offerings/new` - violates hierarchical principle

#### Level 4: Attributes (Relationship - Attributed)
- **Entity**: `dbo.wholesaler_offering_attributes`  
- **Purpose**: n:m relationship between offerings and attributes WITH business data (`value`)
- **Key Distinction**: Not just a link - stores attribute values (e.g., Color="Red")
- **API Pattern**: `/api/offering-attributes` CREATE/UPDATE/DELETE with AssignmentRequest
- **Master Data**: Attribute definitions via `/api/attributes/new`

#### Level 5: Links (Relationship - 1:n Composition)
- **Entity**: `dbo.wholesaler_offering_links`
- **Purpose**: Links that belong to specific offerings
- **API Pattern**: `/api/offering-links` CREATE/UPDATE/DELETE with CreateChildRequest

### 1.2. The User Experience: A URL-Driven Single-Page Application

The entire application exists on a single route (`/supplierbrowser`) and creates a seamless, app-like experience.

- **URL-Driven State**: The UI is a direct, reactive reflection of the URL's search parameters (`level`, `supplierId`, `categoryId`, `offeringId`). We use Svelte 5 Runes (`$derived`) to listen to URL changes.
- **Hierarchical Sidebar**: A persistent sidebar creates a guided, foolproof workflow.
- **Dynamic Content Pane**: The main content area renders different grids and forms based on the current `level`.

---

## 2. Generic Type System - FINALIZED ARCHITECTURE

### 2.1. Core Generic Types with Request Pattern Distinction

**The architecture distinguishes between two fundamental relationship patterns:**

```typescript
// Automatic ID field extraction
type IdField<T> = Extract<keyof T, `${string}_id`>;

// 1:n Hierarchical Creation (one parent ID, child exists in parent context)
export type CreateChildRequest<TParent, TChild> = {
  id: TParent[IdField<TParent>];
  data: TChild;
};

// n:m Assignment between existing entities (two entity IDs)
export type AssignmentRequest<TParent, TChild, TMetadata = object> = {
  parentId: TParent[IdField<TParent>];
  childId: TChild[IdField<TChild>];
} & TMetadata;

// Update assignment between two master entities
export type AssignmentUpdateRequest<TParent, TChild, TMetadata = object> = {
  parentId: TParent[IdField<TParent>];
  childId: TChild[IdField<TChild>];
} & TMetadata;

// Removal of assignment relationship
export type RemoveAssignmentRequest<TParent, TChild> = {
  parentId: TParent[IdField<TParent>];
  childId: TChild[IdField<TChild>];
  cascade?: boolean;
};

// Deletion of entity by its ID
export type DeleteRequest<T> = {
  id: T[IdField<T>];
  cascade?: boolean;
};
```

### 2.1. a) Option: Adjust AssignmentReqeust to same semantics as ChreateChildRequest:
```
export type AssignmentRequest<TParent, TChild> = {
  parentId: TParent[IdField<TParent>];
  childId: TChild[IdField<TChild>];
  data?: object // "Attributes" oder additonalData for the relationship.
};
```


### 2.2. Request Pattern Decision Matrix

| Relationship Type | Pattern | Use Case | Example |
|------------------|---------|----------|---------|
| **Master Data Creation** | Direct Entity Data | Independent entities | `POST /api/suppliers/new` with `Omit<Wholesaler, 'wholesaler_id'>` |
| **1:n Hierarchical Creation** | `CreateChildRequest<Parent, Child>` | Child exists only in parent context | `POST /api/category-offerings` with parent categoryId |
| **n:m Assignment** | `AssignmentRequest<Parent, Child>` | Link two existing entities | `POST /api/supplier-categories` with supplierID + categoryId |

### 2.3. Redundancy Handling in CreateChildRequest (Option B)

For hierarchical relationships, we accept controlled redundancy between parent context and child FK:

```typescript
// Client sends:
CreateChildRequest<ProductCategory, Partial<Omit<WholesalerItemOffering, 'offering_id'>>> = {
  id: 5,           // category_id as parent context  
  data: {
    category_id: 5,  // May be redundant - server validates consistency
    wholesaler_id: 1,
    product_def_id: 10
  }
}

// Server logic:
if (requestData.id !== requestData.data.category_id) {
  throw new Error("Category ID mismatch");
}
// OR auto-set if missing:
if (!requestData.data.category_id) {
  requestData.data.category_id = requestData.id;
}
```

**Benefits of Option B:**
- Stays close to DB reality and constraints
- Allows flexible client behavior (explicit or implicit parent FK)
- Server validates consistency without complex entity assembly

---

## 3. API Architecture Patterns

### 3.1. The Generic Query Endpoint: /api/query

The `/api/query` endpoint is a central architectural component that handles all complex JOIN operations and hierarchical data access.

#### Purpose
- **Complex JOINs**: Multi-table operations that require predefined, optimized query structures
- **Named Queries**: Predefined query configurations like `supplier_categories`, `category_offerings`, `offering_attributes`
- **Hierarchical Access**: The ONLY way to query offerings (which exist in [supplier + category] context)
- **Security**: All JOINs are predefined in `queryConfig.ts` to prevent arbitrary JOIN injections

#### Available Named Queries
- `supplier_categories`: Suppliers with their assigned categories and offering counts
- `category_offerings`: Offerings within [supplier + category] context with product details  
- `offering_attributes`: Offering-attribute assignments with attribute details
- `offering_links`: Offering links with context information

### 3.2. Master Data Pattern: QueryPayload + Individual CRUD

Master data entities follow a consistent pattern:

```typescript
// List with flexible querying
POST /api/suppliers with QueryRequest<Wholesaler>

// Individual operations
GET /api/suppliers/[id]           // Read single
POST /api/suppliers/new           // Create new with Omit<Entity, 'id_field'>
PUT /api/suppliers/[id]           // Update with Partial<Entity>  
DELETE /api/suppliers/[id]        // Delete with dependency checking
```

### 3.3. Relationship Endpoint Pattern: `/api/<parent>-<child>`

All relationship endpoints follow a consistent naming pattern that makes the parent-child relationship explicit.

#### 1:n Hierarchical Relationships (CreateChildRequest)
- `/api/category-offerings`: Category has Offerings 
- `/api/offering-links`: Offering has Links

```typescript
// CreateChildRequest pattern
POST /api/category-offerings
{
  id: 5,                    // parent category_id
  data: {                   // child offering data (may include category_id for validation)
    wholesaler_id: 1,
    product_def_id: 10,
    price: 100
  }
}
```

#### n:m Assignment Relationships (AssignmentRequest)
- `/api/supplier-categories`: Supplier assigned to Categories
- `/api/offering-attributes`: Offering assigned to Attributes

```typescript
// AssignmentRequest pattern  
POST /api/supplier-categories
{
  parentId: 1,              // supplier_id
  childId: 5,               // category_id
  comment: "High priority", // metadata
  link: "https://..."
}
```

---

## 4. Current Implementation Status

| Entity/Operation                                      | Endpoint                          | Generic Type                                                 | Server Status | Client Status | Notes                    |
|-------------------------------------------------------|-----------------------------------|--------------------------------------------------------------|---------------|---------------|--------------------------|
| **SUPPLIERS (Master Data)**                           |                                   |                                                              |               |               |                          |
| Query List                                            | `POST /api/suppliers`             | `QueryRequest<Wholesaler>`                                   | ✅             | ✅             |                          |
| Read Single                                           | `GET /api/suppliers/[id]`         | -                                                            | ✅             | ✅             |                          |
| Create                                                | `POST /api/suppliers/new`         | `Omit<Wholesaler, 'wholesaler_id'>`                         | ✅             | ✅             | **Fixed**                |
| Update                                                | `PUT /api/suppliers/[id]`         | `Partial<Wholesaler>`                                        | ✅             | ✅             |                          |
| Delete                                                | `DELETE /api/suppliers/[id]`      | -                                                            | ✅             | ✅             |                          |
| **ATTRIBUTES (Master Data)**                          |                                   |                                                              |               |               |                          |
| Query List                                            | `POST /api/attributes`            | `QueryRequest<Attribute>`                                    | ✅             | ✅             |                          |
| Read Single                                           | `GET /api/attributes/[id]`        | -                                                            | ✅             | ✅             |                          |
| Create                                                | `POST /api/attributes/new`        | `Omit<Attribute, 'attribute_id'>`                           | ✅             | ✅             | **Fixed**                |
| Update                                                | `PUT /api/attributes/[id]`        | `Partial<Attribute>`                                         | ✅             | ✅             |                          |
| Delete                                                | `DELETE /api/attributes/[id]`     | -                                                            | ✅             | ✅             |                          |
| **CATEGORIES (Master Data)**                          |                                   |                                                              |               |               |                          |
| Query List                                            | `POST /api/categories`            | `QueryRequest<ProductCategory>`                              | ✅             | ✅             | For assignment dropdowns |
| Create                                                | `POST /api/categories/new`        | `Omit<ProductCategory, 'category_id'>`                      | ✅             | ✅             | **Added**                |
| **SUPPLIER-CATEGORIES (Assignment - n:m)**            |                                   |                                                              |               |               |                          |
| Query via JOINs                                       | `POST /api/query`                 | `namedQuery: 'supplier_categories'`                          | ✅             | ✅             |                          |
| Create Assignment                                     | `POST /api/supplier-categories`   | `AssignmentRequest<Wholesaler, ProductCategory>`             | ✅             | ✅             | **Finalized**            |
| Remove Assignment                                     | `DELETE /api/supplier-categories` | `RemoveAssignmentRequest<Wholesaler, ProductCategory>`       | ✅             | ✅             | **Finalized**            |
| **CATEGORY-OFFERINGS (Hierarchical - 1:n)**           |                                   |                                                              |               |               |                          |
| Query via JOINs                                       | `POST /api/query`                 | `namedQuery: 'category_offerings'`                           | ✅             | ✅             |                          |
| Create                                                | `POST /api/category-offerings`    | `CreateChildRequest<ProductCategory, OfferingData>`          | ✅             | ✅             | **Finalized**            |
| Update                                                | `PUT /api/category-offerings`     | `{offering_id, ...updates}`                                  | ✅             | ✅             | **Fixed**                |
| Delete                                                | `DELETE /api/category-offerings`  | `DeleteRequest<WholesalerItemOffering>`                      | ✅             | ✅             | **Fixed**                |
| **~~OFFERINGS/NEW (Deprecated)~~**                     | ~~`POST /api/offerings/new`~~     | ~~Violates hierarchical principle~~                          | ❌             | ❌             | **Removed - Use category-offerings** |
| **OFFERING-ATTRIBUTES (Assignment - n:m Attributed)** |                                   |                                                              |               |               |                          |
| Query via JOINs                                       | `POST /api/query`                 | `namedQuery: 'offering_attributes'`                          | ✅             | ✅             |                          |
| Create Assignment                                     | `POST /api/offering-attributes`   | `AssignmentRequest<WholesalerItemOffering, Attribute>`       | ✅             | ✅             | **Finalized**            |
| Update Assignment                                     | `PUT /api/offering-attributes`    | `AssignmentUpdateRequest<WholesalerItemOffering, Attribute>` | ✅             | ✅             | **Finalized**            |
| Delete Assignment                                     | `DELETE /api/offering-attributes` | `RemoveAssignmentRequest<WholesalerItemOffering, Attribute>` | ✅             | ✅             | **Finalized**            |
| **OFFERING-LINKS (Composition - 1:n)**                |                                   |                                                              |               |               |                          |
| Query via JOINs                                       | `POST /api/query`                 | `namedQuery: 'offering_links'`                               | ✅             | ✅             |                          |
| Read Single                                           | `GET /api/offering-links/[id]`    | -                                                            | ✅             | ✅             | For forms only           |
| Create                                                | `POST /api/offering-links`        | `CreateChildRequest<WholesalerItemOffering, LinkData>`       | ✅             | ✅             | **Finalized**            |
| Update                                                | `PUT /api/offering-links`         | Update pattern                                               | ✅             | ✅             | **Finalized**            |
| Delete                                                | `DELETE /api/offering-links`      | `DeleteRequest<WholesalerOfferingLink>`                      | ✅             | ✅             | **Finalized**            |

---

## 5. Technical Architecture Pillars

### 5.1. Type Safety Architecture

#### Pillar I: Generic API Types (`lib/api/types/common.ts`)
- Universal response envelopes
- Generic request patterns with compile-time validation
- Distinct patterns for Master Data, Hierarchical Children, and Assignments
- Type guards for union responses

#### Pillar II: Query Grammar (`lib/clientAndBack/queryGrammar.ts`)  
- `QueryPayload<T>` for type-safe queries
- Strictly typed to `keyof T` for compile-time safety

#### Pillar III: Query Config (`lib/clientAndBack/queryConfig.ts`)
- Security whitelist for all table access
- Predefined JOIN configurations
- ALL queries must use query config

#### Pillar IV: Query Builder (`lib/server/queryBuilder.ts`)
- Only for SELECT statements
- Converts QueryPayload to parameterized SQL
- Individual CRUD uses direct SQL with mssqlErrorMapper

### 5.2. Request Pattern Architecture

#### Master Data Pattern
```typescript
// Create
POST /api/{entity}/new
Body: Omit<Entity, 'id_field'>

// Update  
PUT /api/{entity}/[id]
Body: Partial<Entity>
```

#### Hierarchical Child Pattern  
```typescript
// Create child in parent context
POST /api/{parent}-{child}
Body: CreateChildRequest<Parent, Omit<Child, 'id_field'>>

// Update child (individual)
PUT /api/{parent}-{child}
Body: { child_id, ...updates }
```

#### Assignment Pattern
```typescript
// Create assignment
POST /api/{parent}-{child}  
Body: AssignmentRequest<Parent, Child, Metadata>

// Remove assignment
DELETE /api/{parent}-{child}
Body: RemoveAssignmentRequest<Parent, Child>
```

---

## 6. Architecture Validation Checklist

### Generic Type System (Completed)
- [x] Generic request types defined with clear pattern distinction
- [x] All server endpoints use correct generic patterns
- [x] All client endpoints use correct generic patterns  
- [x] CreateChildRequest handles redundancy appropriately

### Optional: Adjust Typesyste
- See 2.1. a): Adjust "AssignmentRequest" and related types.

### API Consistency 
- [x] QueryPayload pattern ONLY for Master Data (suppliers, attributes, categories)
- [x] Relationship endpoints use consistent `/api/<parent>-<child>` pattern  
- [x] Hierarchical creation uses CreateChildRequest with parent context
- [x] Assignment operations use AssignmentRequest with two entity IDs
- [x] Individual reads for forms use GET on individual endpoints where needed
- [x] Hierarchical data only via `/api/query` with named queries

### Client-Server Alignment (Completed)
- [x] Client calls match server endpoint patterns with generic types
- [x] All relationship operations use appropriate request patterns
- [x] Complete flow testing with corrected architecture
- [x] Removed deprecated `/api/offerings/new` endpoint

### Type Safety
- [x] No `any` types in production code
- [x] Compile-time query validation via QueryPayload<T>
- [x] Generic API response types with pattern-specific structures
- [x] `exactOptionalPropertyTypes: true` configuration

### Security  
- [x] SQL injection prevention via parameterized queries
- [x] Column whitelist validation in queryConfig
- [x] No client-side table name control

### Performance & Maintainability
- [x] LoadingState for UI feedback
- [x] Composition pattern for code organization
- [x] Centralized error handling
- [x] Structured logging

---

## 7. Examples of Generic Type Usage

### 7.1. Master Data Creation
```typescript
// Category Master Data
POST /api/categories/new
Body: Omit<ProductCategory, 'category_id'>
// → { name: "Laptops", description: "Portable computers" }
```

### 7.2. Hierarchical Child Creation (1:n)
```typescript
// Category → Offering
CreateChildRequest<ProductCategory, Partial<Omit<WholesalerItemOffering, 'offering_id'>>>
// → { id: 5, data: { wholesaler_id: 1, category_id: 5, product_def_id: 10 } }

// Offering → Link
CreateChildRequest<WholesalerItemOffering, Omit<WholesalerOfferingLink, 'link_id'>>
// → { id: 12, data: { offering_id: 12, url: "https://...", notes: "..." } }
```

### 7.3. Assignment Creation (n:m)
```typescript
// Supplier-Category Assignment
AssignmentRequest<Wholesaler, ProductCategory, { comment?: string; link?: string }>
// → { parentId: 1, childId: 5, comment: "High priority" }

// Offering-Attribute Assignment  
AssignmentRequest<WholesalerItemOffering, Attribute, { value?: string }>
// → { parentId: 12, childId: 3, value: "Red" }
```

---

## 8. Implementation Guidelines

### 8.1. Adding New Master Data

**For Independent Entities:**
```typescript
// Server endpoint: /api/{entity}/new
Body: Omit<Entity, 'id_field'>

// Client function:
create{Entity}(data: Omit<Entity, 'id_field'>): Promise<Entity>
```

### 8.2. Adding New Hierarchical Children

**For 1:n Relationships:**
```typescript
// Server endpoint: /api/{parent}-{child}
Body: CreateChildRequest<ParentEntity, Omit<ChildEntity, 'child_id'>>

// Client function:
create{Child}For{Parent}(
  parentId: number,
  childData: Omit<ChildEntity, 'child_id' | 'parent_fk'>
): Promise<ChildEntity>
```

### 8.3. Adding New Assignments

**For n:m Relationships:**
```typescript
// Server endpoint: /api/{parent}-{child}
Body: AssignmentRequest<ParentEntity, ChildEntity, MetadataType>

// Client function:
assign{Child}To{Parent}(data: {
  parentId: number,
  childId: number,
  ...metadata
}): Promise<AssignmentData>
```

---

## 9. Current Status Summary

### ✅ Completed
- Generic type system with pattern-specific structures
- All Master Data endpoints (suppliers, attributes, categories)
- All Assignment endpoints (supplier-categories, offering-attributes)
- All Hierarchical endpoints (category-offerings, offering-links)
- QueryBuilder and security framework
- Complete client-server type alignment
- Redundancy handling for hierarchical relationships

### ⚠️ In Progress  
- Frontend completion with Level 4/5 (Attributes/Links) UI
- Complete removal of mock data in favor of real API integration

### ✌ Completed Recent Fixes
- Removed `/api/offerings/new` - maintains hierarchical principle
- Finalized CreateChildRequest vs AssignmentRequest distinction
- Fixed all Master Data creation to use direct entity data
- Implemented controlled redundancy handling in hierarchical creation

---

## Svelte 5 Runes Integration - LoadingState Architecture
Erkenntnisse aus der Frontend-Integration
Bei der Integration der API-Clients mit Svelte 5 Runes traten wichtige architektonische Erkenntnisse auf, die für alle zukünftigen Implementierungen relevant sind:
Runes-Kompatibilität: Svelte 5 Runes ($state, $derived) funktionieren ausschließlich in .svelte-Dateien. Die ursprüngliche LoadingState-Klasse in lib/api/client/common.ts musste von Runes auf Svelte Stores umgestellt werden, um "rune_outside_svelte" Fehler zu vermeiden.
Store-basierte LoadingState (Finalized): Die LoadingState-Klasse verwendet jetzt writable() und derived() stores anstelle von Runes. Dies ermöglicht reactivity zwischen TypeScript-Modulen und Svelte-Komponenten. Der korrekte Zugriff erfolgt über $loadingState.isLoadingStore anstelle des non-reactive getters loadingState.isLoading.
Initial State Pattern: Für optimale Loading-UX wurde das "null initial state" Pattern implementiert. Data-Arrays starten als null (nicht []), wodurch Grid-Komponenten zwischen "loading" (null + loading=true) und "no data" ([] + loading=false) unterscheiden können. Dies verhindert das kurze "No data"-Flash beim ersten Laden.
Integration Pattern: Frontend-Komponenten konsumieren LoadingStates über $derived($apiClient.isLoadingStore), wodurch automatische Reaktivität auf API-Operationen gewährleistet ist. Der zentrale isLoading state kombiniert alle relevanten LoadingStates für globale UI-Feedback.
Diese Lösung eliminiert Race-Conditions zwischen Component-Mounting und API-Initialisierung und bietet konsistente Loading-UX für alle Hierarchie-Level.RetryClaude can make mistakes. Please double-check responses.