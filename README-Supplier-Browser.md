# SupplierBrowser - Architectural Specification & Developer Guide

**Single source of truth for the project's architecture. All development must adhere to the patterns and principles defined herein.**

*Updated: 27. August 2025 - Generic Type System Implementation In Progress*

---

## 1. The Vision: What is the SupplierBrowser?

The SupplierBrowser is a specialized, high-performance tool for managing a 5-level data hierarchy. Its primary purpose is to provide a fast and intuitive interface for navigating and editing complex relationships between business entities.

### 1.1. The 5 Levels of the Hierarchy

The application's logic is built around a clear, five-level data model. Understanding the distinction between **Master Data**, **Hierarchical Real Objects**, and **Relationships** is critical.

#### Level 1: Suppliers (Master Data)
- **Entity**: `dbo.wholesalers`
- **Purpose**: Independent master data entities that can be queried flexibly
- **API Pattern**: QueryPayload for lists + Standard CRUD for individuals

#### Level 2: Categories (Relationship - Simple Assignment)  
- **Entity**: `dbo.wholesaler_categories`
- **Purpose**: Pure n:m relationship between suppliers and global categories
- **Properties**: `comment`, `link` (simple metadata)
- **API Pattern**: `/api/supplier-categories` CREATE/DELETE

#### Level 3: Offerings (Relationship - 1:n Hierarchical)
- **Entity**: `dbo.wholesaler_item_offerings`
- **Purpose**: Products that exist only in [supplier + category] context
- **Key Characteristic**: Cannot be queried independently - always contextual
- **API Pattern**: `/api/category-offerings` CREATE/UPDATE/DELETE + Individual reads

#### Level 4: Attributes (Relationship - Attributed)
- **Entity**: `dbo.wholesaler_offering_attributes`  
- **Purpose**: n:m relationship between offerings and attributes WITH business data (`value`)
- **Key Distinction**: Not just a link - stores attribute values (e.g., Color="Red")
- **API Pattern**: `/api/offering-attributes` CREATE/UPDATE/DELETE

#### Level 5: Links (Relationship - 1:n Composition)
- **Entity**: `dbo.wholesaler_offering_links`
- **Purpose**: Links that belong to specific offerings
- **API Pattern**: `/api/offering-links` CREATE/UPDATE/DELETE

### 1.2. The User Experience: A URL-Driven Single-Page Application

The entire application exists on a single route (`/supplierbrowser`) and creates a seamless, app-like experience.

- **URL-Driven State**: The UI is a direct, reactive reflection of the URL's search parameters (`level`, `supplierId`, `categoryId`, `offeringId`). We use Svelte 5 Runes (`$derived`) to listen to URL changes.
- **Hierarchical Sidebar**: A persistent sidebar creates a guided, foolproof workflow.
- **Dynamic Content Pane**: The main content area renders different grids and forms based on the current `level`.

---

## 2. Generic Type System - NEW ARCHITECTURE

### 2.1. Core Generic Types (Implementation In Progress)

**New compile-time validated type system:**

```typescript
// Automatic ID field extraction
type IdField<T> = Extract<keyof T, `${string}_id`>;

// Assignment between two master entities (n:m)
export type AssignmentRequest<TParent, TChild, TMetadata = object> = {
  parentId: TParent[IdField<TParent>];
  childId: TChild[IdField<TChild>];
} & TMetadata;

// Creation of child entity in parent context (1:n)
export type CreateRequest<TParent, TMetadata = object> = {
  id: TParent[IdField<TParent>];
} & TMetadata;

// Deletion of entity by its ID
export type DeleteRequest<T> = {
  id: T[IdField<T>];
  cascade?: boolean;
};

// Removal of assignment relationship
export type RemoveAssignmentRequest<TParent, TChild> = {
  parentId: TParent[IdField<TParent>];
  childId: TChild[IdField<TChild>];
  cascade?: boolean;
};
```

### 2.2. Benefits of Generic System

- TypeScript validates field names at compile-time
- IntelliSense shows correct field structure
- Prevents typos in request bodies
- Consistent patterns across all relationships
- Replaces specific request types like `SupplierCategoryAssignmentRequest`

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

### 3.2. The QueryPayload Pattern (NOT Pure REST)

Our API does NOT follow pure REST for list operations. Master data uses the flexible `QueryPayload<T>` pattern:

```typescript
// NOT: GET /api/suppliers?name=ABC&limit=10
// INSTEAD: POST /api/suppliers with QueryRequest<Wholesaler>
{
  "payload": {
    "select": ["wholesaler_id", "name", "region"],
    "where": { "key": "name", "op": "LIKE", "val": "%ABC%" },
    "orderBy": [{ "key": "name", "direction": "asc" }],
    "limit": 10
  }
}
```

#### When to Use QueryPayload
- **Master Data ONLY**: `POST /api/suppliers`, `POST /api/attributes`
- Entities that can be queried independently
- Need flexible column selection, filtering, sorting

### 3.3. Relationship Endpoint Pattern: `/api/<parent>-<child>`

All relationship endpoints follow a consistent naming pattern that makes the parent-child relationship explicit.

#### Current Relationships
- `/api/supplier-categories`: Supplier has Categories (n:m assignment)
- `/api/category-offerings`: Category has Offerings (1:n hierarchical)
- `/api/offering-attributes`: Offering has Attributes (n:m attributed relationship) 
- `/api/offering-links`: Offering has Links (1:n composition)

---

## 4. Current Implementation Status

| Entity/Operation | Endpoint | Generic Type | Server Status | Client Status | Notes |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **SUPPLIERS (Master Data)** |
| Query List | `POST /api/suppliers` | `QueryRequest<Wholesaler>` | ✅ | ✅ | |
| Read Single | `GET /api/suppliers/[id]` | - | ✅ | ✅ | |
| Create | `POST /api/suppliers/new` | `CreateRequest<Partial<Wholesaler>>` | ✅ | ✅ | |
| Update | `PUT /api/suppliers/[id]` | `Partial<Wholesaler>` | ✅ | ✅ | |
| Delete | `DELETE /api/suppliers/[id]` | - | ✅ | ✅ | |
| **ATTRIBUTES (Master Data)** |
| Query List | `POST /api/attributes` | `QueryRequest<Attribute>` | ✅ | ✅ | |
| Read Single | `GET /api/attributes/[id]` | - | ✅ | ✅ | |
| Create | `POST /api/attributes/new` | `CreateRequest<Partial<Attribute>>` | ✅ | ✅ | |
| Update | `PUT /api/attributes/[id]` | `Partial<Attribute>` | ✅ | ✅ | |
| Delete | `DELETE /api/attributes/[id]` | - | ✅ | ✅ | |
| **CATEGORIES (Master Data)** |
| Query List | `POST /api/categories` | `QueryRequest<ProductCategory>` | ✅ | ✅ | For assignment dropdowns |
| **SUPPLIER-CATEGORIES (Assignment - n:m)** |
| Query via JOINs | `POST /api/query` | `namedQuery: 'supplier_categories'` | ✅ | ✅ | |
| Create Assignment | `POST /api/supplier-categories` | `AssignmentRequest<Wholesaler, ProductCategory>` | ⚠️ | ⚠️ | **Needs generic update** |
| Remove Assignment | `DELETE /api/supplier-categories` | `RemoveAssignmentRequest<Wholesaler, ProductCategory>` | ⚠️ | ⚠️ | **Needs generic update** |
| **CATEGORY-OFFERINGS (Hierarchical - 1:n)** |
| Query via JOINs | `POST /api/query` | `namedQuery: 'category_offerings'` | ✅ | ✅ | |
| Create | `POST /api/category-offerings` | `CreateRequest<ProductCategory, OfferingData>` | ✅ | ✅ | **Fixed** |
| Update | `PUT /api/category-offerings` | `{offering_id, ...updates}` | ✅ | ✅ | **Fixed** |
| Delete | `DELETE /api/category-offerings` | `DeleteRequest<WholesalerItemOffering>` | ✅ | ✅ | **Fixed** |
| **OFFERING-ATTRIBUTES (Assignment - n:m Attributed)** |
| Query via JOINs | `POST /api/query` | `namedQuery: 'offering_attributes'` | ✅ | ✅ | |
| Create Assignment | `POST /api/offering-attributes` | `AssignmentRequest<WholesalerItemOffering, Attribute>` | ⚠️ | ⚠️ | **Needs generic update** |
| Update Assignment | `PUT /api/offering-attributes` | `AssignmentRequest<WholesalerItemOffering, Attribute>` | ⚠️ | ⚠️ | **Needs generic update** |
| Delete Assignment | `DELETE /api/offering-attributes` | `RemoveAssignmentRequest<WholesalerItemOffering, Attribute>` | ⚠️ | ⚠️ | **Needs generic update** |
| **OFFERING-LINKS (Composition - 1:n)** |
| Query via JOINs | `POST /api/query` | `namedQuery: 'offering_links'` | ✅ | ✅ | |
| Read Single | `GET /api/offering-links/[id]` | - | ✅ | ✅ | For forms only |
| Create | `POST /api/offering-links` | `CreateRequest<WholesalerItemOffering, LinkData>` | ⚠️ | ⚠️ | **Needs generic update** |
| Update | `PUT /api/offering-links` | Update pattern | ⚠️ | ⚠️ | **Needs generic update** |
| Delete | `DELETE /api/offering-links` | `DeleteRequest<WholesalerOfferingLink>` | ⚠️ | ⚠️ | **Needs generic update** |

---

## 5. Technical Architecture Pillars

### 5.1. Type Safety Architecture

#### Pillar I: Generic API Types (`lib/api/types/common.ts`)
- Universal response envelopes
- Generic request patterns with compile-time validation
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

### 5.2. QueryBuilder Usage Rules

#### When to Use QueryBuilder
- ONLY for SELECT statements
- Complex filtering with WHERE clauses
- Column selection and sorting
- List endpoints with `QueryPayload<T>`

#### When to Use Direct SQL
- ALL CREATE, UPDATE, DELETE operations  
- Simple lookups by primary key
- Individual entity CRUD
- Always with parameterized queries and `mssqlErrorMapper`

---

## 6. Current TODO: Generic Type Migration

### 6.1. PRIORITY - Server Endpoint Updates
- [ ] Update `/api/supplier-categories` to use `AssignmentRequest<Wholesaler, ProductCategory>`
- [ ] Update `/api/offering-attributes` to use `AssignmentRequest<WholesalerItemOffering, Attribute>`
- [ ] Update `/api/offering-links` to use `CreateRequest<WholesalerItemOffering>` and `DeleteRequest<WholesalerOfferingLink>`

### 6.2. PRIORITY - Client Code Updates
- [ ] Update `supplier.ts` to use generic `AssignmentRequest`
- [ ] Update `offering.ts` to use generic request types
- [ ] Remove old specific request types from `common.ts`
- [ ] Test complete flow with generic architecture

### 6.3. Frontend Integration TODO
- [ ] Complete SupplierBrowser implementation with real API data
- [ ] Remove remaining mock data usage
- [ ] Implement Level 4 (Attributes) and Level 5 (Links) UI
- [ ] Test all levels work with consistent API pattern

---

## 7. Architecture Validation Checklist

### Generic Type System (In Progress)
- [x] Generic request types defined (`AssignmentRequest<Parent, Child>`, etc.)
- [ ] All server endpoints updated to use generic types
- [ ] All client endpoints updated to use generic types  
- [ ] Old specific request types removed

### API Consistency 
- [x] QueryPayload pattern ONLY for Master Data (suppliers, attributes)
- [x] Relationship endpoints use consistent `/api/<parent>-<child>` pattern  
- [ ] All relationships use generic CREATE/UPDATE/DELETE patterns
- [x] Individual reads for forms use GET on individual endpoints where needed
- [x] Hierarchical data only via `/api/query` with named queries

### Client-Server Alignment (Needs Work)
- [ ] Client calls match server endpoint patterns with generic types
- [ ] All relationship operations use generic request body patterns
- [ ] Complete flow testing with corrected architecture

### Type Safety
- [x] No `any` types in production code
- [x] Compile-time query validation via QueryPayload<T>
- [x] Generic API response types
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

## 8. Examples of Generic Type Usage

### 8.1. Assignment Relationships (n:m)
```typescript
// Supplier-Category Assignment
AssignmentRequest<Wholesaler, ProductCategory, { comment?: string; link?: string }>
// → parentId: number (from wholesaler_id)
// → childId: number (from category_id)

// Offering-Attribute Assignment  
AssignmentRequest<WholesalerItemOffering, Attribute, { value?: string }>
// → parentId: number (from offering_id)
// → childId: number (from attribute_id)
```

### 8.2. Composition Relationships (1:n)
```typescript
// Offering Link Creation
CreateRequest<WholesalerItemOffering, { url: string; notes?: string }>
// → id: number (from offering_id)

// Link Deletion
DeleteRequest<WholesalerOfferingLink>
// → id: number (from link_id)
```

### 8.3. Master Data
```typescript
// Uses existing patterns
QueryRequest<Wholesaler>
CreateRequest<Partial<Omit<Wholesaler, 'wholesaler_id'>>>
```

---

## 9. Implementation Guidelines

### 9.1. Adding New Relationships

**For n:m Assignments:**
```typescript
AssignmentRequest<ParentEntity, ChildEntity, MetadataType>
RemoveAssignmentRequest<ParentEntity, ChildEntity>
```

**For 1:n Compositions:**
```typescript
CreateRequest<ParentEntity, ChildDataType>
DeleteRequest<ChildEntity>
```

### 9.2. Client Code Pattern
```typescript
const requestBody: AssignmentRequest<Parent, Child, Metadata> = {
  parentId: data.parent_id,
  childId: data.child_id,
  ...metadata
};
```

---

## 10. Current Status Summary

### ✅ Completed
- Generic type system design
- Core server endpoints (suppliers, attributes, categories)
- QueryBuilder and security framework
- Basic frontend with Svelte 5

### ⚠️ In Progress  
- Migrating all endpoints to generic types
- Client API updates for generic patterns
- Frontend completion with real data integration

### ❌ TODO
- Complete SupplierBrowser UI implementation
- Remove all mock data usage
- Full end-to-end testing
- Level 4/5 UI implementation

---

*Current focus: Completing the generic type system migration across all API endpoints.*