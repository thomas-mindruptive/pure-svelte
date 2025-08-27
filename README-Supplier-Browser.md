# Architectural Specification & Developer Guide: SupplierBrowser

This document serves as the **single source of truth** for the project's architecture. All development **must** adhere to the patterns and principles defined herein.

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

## 2. The Architecture Deep Dive: API Patterns

### 2.1. The Generic Query Endpoint: /api/query

The `/api/query` endpoint is a central architectural component that handles all complex JOIN operations and hierarchical data access.

#### Purpose
- **Complex JOINs**: Multi-table operations that require predefined, optimized query structures
- **Named Queries**: Predefined query configurations like `supplier_categories`, `category_offerings`, `offering_attributes`
- **Hierarchical Access**: The ONLY way to query offerings (which exist in [supplier + category] context)
- **Security**: All JOINs are predefined in `queryConfig.ts` to prevent arbitrary JOIN injections

#### Usage Pattern
```typescript
// Example: Load offerings for a specific supplier + category
const request: PredefinedQueryRequest = {
  namedQuery: 'category_offerings',
  payload: {
    select: ['wio.offering_id', 'pd.title', 'wio.price'],
    where: {
      op: LogicalOperator.AND,
      conditions: [
        { key: 'wio.wholesaler_id', op: ComparisonOperator.EQUALS, val: supplierId },
        { key: 'wio.category_id', op: ComparisonOperator.EQUALS, val: categoryId }
      ]
    }
  }
};
```

#### Available Named Queries
- `supplier_categories`: Suppliers with their assigned categories and offering counts
- `category_offerings`: Offerings within [supplier + category] context with product details  
- `offering_attributes`: Offering-attribute assignments with attribute details
- `offering_links`: Offering links with context information

### 2.2. The QueryPayload Pattern (NOT Pure REST)

**Critical**: Our API does NOT follow pure REST for list operations. Master data uses the flexible `QueryPayload<T>` pattern:

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

### 2.3. Relationship Endpoint Pattern: `/api/<parent>-<child>`

All relationship endpoints follow a consistent naming pattern that makes the parent-child relationship explicit.

#### Pattern Structure
```
/api/<parent-entity>-<child-entity>
```

#### Current Relationships
- `/api/supplier-categories`: Supplier has Categories (n:m assignment)
- `/api/category-offerings`: Category has Offerings (1:n hierarchical)
- `/api/offering-attributes`: Offering has Attributes (n:m attributed relationship) 
- `/api/offering-links`: Offering has Links (1:n composition)

#### Relationship Types

**n:m Assignment (Pure Relationship)**
```http
POST /api/supplier-categories
{
  "parentId": 123,    // supplierId
  "childId": 45,      // categoryId  
  "comment": "...",   // optional metadata
  "link": "..."       // optional metadata
}
```

**n:m Attributed Relationship (With Business Logic)**
```http
POST /api/offering-attributes  
{
  "parentId": 789,    // offeringId
  "childId": 12,      // attributeId
  "value": "red"      // business data
}
```

**1:n Composition (Child belongs to Parent)**
```http
POST /api/offering-links
{
  "parentId": 789,    // offeringId  
  "url": "https://...",
  "notes": "..."
}
```

### 2.4. Hierarchical Data Access

Some entities exist only within a hierarchical context and cannot be queried independently.

#### Key Principle: Context-Bound Entities
- **Offerings**: Only exist within [supplier + category] context
- No independent `/api/offerings` list endpoint
- Always queried via `/api/query` with contextual WHERE clauses

#### Why This Pattern
- **Business Logic**: Reflects real-world constraints (offerings belong to supplier+category)
- **Performance**: Prevents expensive full-table scans
- **Security**: Enforces proper data access patterns
- **UX**: Matches user mental model of hierarchical navigation

---

## 3. API Lifecycle - IMPLEMENTATION STATUS

| Entity/Operation | Endpoint | Pattern | REST Conformity | Server Status | Client Status | Notes |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **SUPPLIERS (Master Data)** |
| Query List | `POST /api/suppliers` | QueryPayload | Abwandlung | ✅ | ✅ | supplier.ts correct |
| Read Single | `GET /api/suppliers/[id]` | Standard GET | REST | ✅ | ✅ | |
| Create | `POST /api/suppliers/new` | CreateRequest | Abwandlung | ✅ | ✅ | |
| Update | `PUT /api/suppliers/[id]` | UpdateRequest | REST | ✅ | ✅ | |
| Delete | `DELETE /api/suppliers/[id]` | With cascade | REST | ✅ | ✅ | |
| **ATTRIBUTES (Master Data)** |
| Query List | `POST /api/attributes` | QueryPayload | Abwandlung | ✅ | ✅ | attribute.ts correct |
| Read Single | `GET /api/attributes/[id]` | Standard GET | REST | ✅ | ✅ | |
| Create | `POST /api/attributes/new` | CreateRequest | Abwandlung | ✅ | ✅ | |
| Update | `PUT /api/attributes/[id]` | UpdateRequest | REST | ✅ | ✅ | |
| Delete | `DELETE /api/attributes/[id]` | With cascade | REST | ✅ | ✅ | |
| **CATEGORIES (Master Data)** |
| Query List | `POST /api/categories` | QueryPayload | Abwandlung | ✅ | ✅ | For assignment dropdowns |
| **SUPPLIER-CATEGORIES (Relationship - n:m Assignment)** |
| Query via JOINs | `POST /api/query` | PredefinedQueryRequest | Custom | ✅ | ✅ | Named query: `supplier_categories` |
| Create Assignment | `POST /api/supplier-categories` | AssignmentRequest | REST | ✅ | ✅ | supplier.ts correct |
| Remove Assignment | `DELETE /api/supplier-categories` | RemoveAssignmentRequest | Body needed | ✅ | ✅ | |
| **CATEGORY-OFFERINGS (Relationship - 1:n Hierarchical)** |
| Query via JOINs | `POST /api/query` | PredefinedQueryRequest | Custom | ✅ | ✅ | Named query: `category_offerings` |
| Read Single | `POST /api/category-offerings/[id]` | QueryPayload | Abwandlung | ❌ | ❌ | **MISSING** - For offering forms |
| Create | `POST /api/category-offerings` | CreateRequest | REST | ❌ | ⚠️ | category.ts calls `/api/offerings/new` |
| Update | `PUT /api/category-offerings` | UpdateRequest | REST | ❌ | ⚠️ | offering.ts calls `/api/offerings/[id]` |
| Delete | `DELETE /api/category-offerings` | DeleteRequest | Body needed | ❌ | ⚠️ | offering.ts calls `/api/offerings/[id]` |
| **OFFERING-ATTRIBUTES (Relationship - n:m Attributed)** |
| Query via JOINs | `POST /api/query` | PredefinedQueryRequest | Custom | ✅ | ✅ | Named query: `offering_attributes` |
| Read Single | `GET /api/offering-attributes/[offeringId]/[attributeId]` | REST | Composite | ✅ | ❌ | **MISSING** - For attribute form |
| Create Assignment | `POST /api/offering-attributes` | CreateRequest | REST | ❌ | ✅ | Server has wrong QueryPayload |
| Update Assignment | `PUT /api/offering-attributes` | UpdateRequest | REST | ❌ | ❌ | offering.ts calls `/[id]` endpoint |
| Delete Assignment | `DELETE /api/offering-attributes` | DeleteRequest | Body needed | ❌ | ❌ | offering.ts calls `/[id]` endpoint |
| **OFFERING-LINKS (Relationship - 1:n Composition)** |
| Query via JOINs | `POST /api/query` | PredefinedQueryRequest | Custom | ✅ | ✅ | Named query: `offering_links` |
| Read Single | `POST /api/offering-links/[id]` | QueryPayload | Abwandlung | ❌ | ❌ | **MISSING** - For link forms |
| Create | `POST /api/offering-links` | CreateRequest | REST | ❌ | ⚠️ | Server has `/api/offering-links/new` |
| Update | `PUT /api/offering-links` | UpdateRequest | REST | ❌ | ⚠️ | offering.ts calls `/[id]` endpoint |
| Delete | `DELETE /api/offering-links` | DeleteRequest | Body needed | ❌ | ⚠️ | offering.ts calls `/[id]` endpoint |
| **COMPLEX MULTI-TABLE OPERATIONS** |
| Named Queries | `POST /api/query` | PredefinedQueryRequest | Custom | ✅ | ✅ | Security-validated JOINs |

### 3.1. Status Legend
**Server Status:**
- ✅ Correctly implemented
- ❌ Missing or wrong implementation
- ⚠️ Partially correct

**Client Status:**
- ✅ Client calls correct endpoints
- ❌ Client calls wrong endpoints
- ⚠️ Client partially correct

**REST Conformity:**
- REST: Follows standard REST conventions
- Abwandlung: Intentional deviation for better functionality
- Custom: Custom pattern specific to this architecture
- Composite: Composite key handling
- Body needed: Requires request body where REST typically wouldn't

### 3.2. Critical Implementation Issues

**MAJOR ARCHITECTURAL INCONSISTENCIES:**

1. **Offering Endpoints Inconsistent:**
   - Server implements `/api/offerings/*` individual endpoints
   - Should implement `/api/category-offerings` relationship pattern
   - Client code spread across `category.ts` and `offering.ts`

2. **Offering-Attributes Pattern Broken:**
   - Server has QueryPayload pattern instead of CREATE/UPDATE/DELETE
   - Client calls individual `/[id]` endpoints instead of relationship endpoints
   - Creates architectural inconsistency

3. **Offering-Links Endpoints Wrong:**
   - Server implements `/api/offering-links/new` instead of `/api/offering-links`
   - Client calls individual `/[id]` endpoints
   - Should use relationship pattern consistently

**REQUIRED FIXES:**

**Server-Side:**
1. Remove `/api/offerings/*` endpoints → implement `/api/category-offerings`
2. Fix `/api/offering-attributes` from QueryPayload to CREATE/UPDATE/DELETE
3. Fix `/api/offering-links/new` → `/api/offering-links` + UPDATE/DELETE
4. Add individual read endpoints for forms: `POST /api/category-offerings/[id]`, etc.

**Client-Side:**
1. Update `offering.ts` to use relationship endpoints
2. Move offering operations from `offering.ts` to `category.ts` 
3. Update all relationship calls to use consistent `/api/<parent>-<child>` pattern

---

## 4. Client API Architecture - REQUIRED CHANGES

All API calls go through dedicated client modules in `lib/api/client/`:

### 4.1. Current Client Structure (Needs Refactoring)

**Problematic Current State:**
* **supplier.ts** ✅ Correctly implemented
* **category.ts** ⚠️ Calls `/api/offerings/new` instead of `/api/category-offerings`
* **offering.ts** ❌ Should not exist - offering operations belong in category.ts
* **attribute.ts** ✅ Correctly implemented

**Target Client Structure:**
* **supplier.ts** - Supplier master data + supplier-categories relationship
* **category.ts** - Category master data + category-offerings relationship (all offering operations)
* **attribute.ts** - Attribute master data only
* **Remove offering.ts** - Merge functionality into category.ts

### 4.2. Required Client Code Changes

**category.ts (Composition Manager for Offerings):**
```typescript
// CURRENT (wrong)
await apiFetch('/api/offerings/new', ...)
await apiFetch('/api/offerings/123', ...)

// TARGET (correct)
await apiFetch('/api/category-offerings', ...)
await apiFetch('/api/category-offerings', { method: 'PUT', body: {...} })
await apiFetch('/api/category-offerings/123', { method: 'POST', body: queryPayload })
```

**Remove offering.ts entirely:**
- Move `loadOfferingAttributes()` → category.ts
- Move `createOfferingAttribute()` → category.ts  
- Move `updateOfferingAttribute()` → category.ts
- Move `deleteOfferingAttribute()` → category.ts
- Move `loadOfferingLinks()` → category.ts
- Move all offering-related operations → category.ts

**Update all relationship calls to use request body pattern:**
```typescript
// Offering-attributes (target)
POST /api/offering-attributes { parentId: 123, childId: 45, value: "red" }
PUT /api/offering-attributes { parentId: 123, childId: 45, value: "blue" }
DELETE /api/offering-attributes { parentId: 123, childId: 45 }

// Offering-links (target)  
POST /api/offering-links { parentId: 123, url: "...", notes: "..." }
PUT /api/offering-links { linkId: 456, url: "...", notes: "..." }
DELETE /api/offering-links { linkId: 456 }
```

---

## 5. Technical Architecture Pillars

### 5.1. Type Safety Architecture

#### Pillar I: Generic API Types (`lib/api/types/common.ts`)
- Universal response envelopes
- Generic request/response patterns
- Type guards for union responses

#### Pillar II: Query Grammar (`lib/clientAndBack/queryGrammar.ts`)  
- `QueryPayload<T>` for type-safe queries
- Strictly typed to `keyof T` for compile-time safety

#### Pillar III: Query Config (`lib/clientAndBack/queryConfig.ts`)
- Security whitelist for all table access
- Predefined JOIN configurations
- **ALL queries must use query config**

#### Pillar IV: Query Builder (`lib/server/queryBuilder.ts`)
- **Only for SELECT statements**
- Converts QueryPayload to parameterized SQL
- Individual CRUD uses direct SQL with mssqlErrorMapper

### 5.2. QueryBuilder Usage Rules

#### When to Use QueryBuilder
- **ONLY for SELECT statements**
- Complex filtering with WHERE clauses
- Column selection and sorting
- List endpoints with `QueryPayload<T>`

#### When to Use Direct SQL
- **All CREATE, UPDATE, DELETE operations**  
- Simple lookups by primary key
- Individual entity CRUD
- Always with parameterized queries and `mssqlErrorMapper`

#### Query Types by Endpoint Pattern
```typescript
// QueryBuilder (SELECT only)
POST /api/suppliers + QueryPayload<Wholesaler>
POST /api/query + PredefinedQueryRequest

// Direct SQL (CUD operations)
POST /api/suppliers/new + CreateRequest
PUT /api/suppliers/[id] + UpdateRequest  
DELETE /api/suppliers/[id]
GET /api/suppliers/[id]
POST /api/supplier-categories + AssignmentRequest
```

---

## 6. Next Steps: Complete Architecture Alignment

### 6.1. CRITICAL PRIORITY - Server Endpoints
1. **Remove inconsistent offering endpoints** - `/api/offerings/*`
2. **Implement `/api/category-offerings`** - CREATE/UPDATE/DELETE + individual reads
3. **Fix `/api/offering-attributes`** - Change from QueryPayload to relationship pattern
4. **Fix `/api/offering-links`** - Remove `/new` suffix, implement relationship pattern

### 6.2. CRITICAL PRIORITY - Client Code Refactoring
1. **Update `offering.ts`** - correct api endpoint
2. **Update `category.ts`** - correct api endpoint
3. **Fix all relationship calls** - Use consistent request body patterns
4. **Test complete flow** - Ensure UI works with new architecture

### 6.3. Frontend Integration
- Update `supplier-browser/+page.svelte` to use corrected client code
- Remove remaining mock data
- Ensure all levels work with consistent API pattern

---

## 7. Architecture Validation Checklist

### API Consistency (Critical Fixes Needed)
- [ ] QueryPayload pattern ONLY for Master Data (suppliers, attributes)
- [ ] Relationship endpoints use consistent `/api/<parent>-<child>` pattern  
- [ ] All relationships use CREATE/UPDATE/DELETE on main endpoint
- [ ] Individual reads for forms use `POST /api/<parent>-<child>/[id]`
- [ ] Hierarchical data only via `/api/query` with named queries

### Client-Server Alignment (Critical Fixes Needed)
- [ ] Client calls match server endpoint patterns
- [ ] No `/api/offerings/*` calls in client code
- [ ] All relationship operations use request body pattern
- [ ] offering.ts functionality merged into category.ts

### Type Safety ✅
- [x] No `any` types in production code
- [x] Compile-time query validation via QueryPayload<T>
- [x] Generic API response types

### Security ✅  
- [x] SQL injection prevention via parameterized queries
- [x] Column whitelist validation in queryConfig
- [x] No client-side table name control

### Performance & Maintainability ✅
- [x] LoadingState for UI feedback
- [x] Composition pattern for code organization
- [x] Centralized error handling
- [x] Structured logging

---

*This document reflects the target architecture. Critical server and client fixes are required to achieve full consistency.*