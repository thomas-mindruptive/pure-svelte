# SupplierBrowser - Hierarchische Navigation Spezifikation

## Überblick
Das SupplierBrowser System ist eine **5-Ebenen hierarchische Navigation** durch Supplier-Daten. Unterscheidung zwischen **"echte Objekte erstellen"** (→ Navigation + Form) vs **"nur Relationships herstellen"** (→ Dropdown).

## 🚀 **AKTUELLER IMPLEMENTIERUNGSSTATUS**

### ✅ **VOLLSTÄNDIG IMPLEMENTIERT:**
- **HierarchySidebar.svelte** - Navigation mit disabled states & counts (Svelte 5 + ausgelagerte CSS)
- **SupplierGrid.svelte** - Wrapper um Datagrid für Wholesaler[]
- **SupplierForm.svelte** - Wrapper um FormShell für Wholesaler create/edit **✅ VOLLSTÄNDIG GESTYLT + JSDoc**
- **CategoryGrid.svelte** - Wrapper um Datagrid für WholesalerCategory[]
- **CategoryAssignment.svelte** - Einfaches n:m Assignment UI für Category-Supplier Relationships **✅ VOLLSTÄNDIG IMPLEMENTIERT**
- **URL-driven State** - Level, supplierId, categoryId via URL-Parameter
- **Svelte 5 + Runes** - Alle Komponenten nutzen neue Syntax
- **CSS-System Integration** - Form.css, Sidebar.css, Grid.css vollständig integriert
- **Farbkonsistenz** - Einheitliches Violett (#4f46e5) durch alle UI-Komponenten
- **🆕 QueryBuilder Refactoring** - buildQuery() + executeQuery() Trennung für bessere Testbarkeit
- **🆕 MSSQL Error Mapper** - DB Constraints zu HTTP Status Codes Mapping
- **🆕 Suppliers API** - GET + POST mit QueryPayload Support
- **🆕 ESLint Standards** - Kein "unexpected any", "const" wo möglich

### 📄 **IN PROGRESS:**
- **Generic Domain Validation** - Type-basierte Validierung (geplant)

### ⌘ **NOCH ZU IMPLEMENTIEREN:**
- **OfferingGrid.svelte** + **OfferingForm.svelte** (Ebene 3)
- **AttributeGrid.svelte** + **AttributeForm.svelte** (Ebene 5)
- **LinkGrid.svelte** + **LinkForm.svelte** (Ebene 5)
- **Suppliers API** - PUT /api/suppliers/[id] + DELETE /api/suppliers/[id]
- **Categories/Offerings/Attributes APIs** - Weitere Domain APIs
- **Ebene 4-5 Navigation** (Attributes/Links Toggle)

### 🎨 **STYLING UPDATES:**
- **SupplierForm.svelte**: Vollständig responsive Form mit .form-grid, .form-group, Error-Styling + Comprehensive JSDoc
- **HierarchySidebar.svelte**: Ausgelagerte CSS nach sidebar.css, Svelte 5 callback props
- **CSS-System**: form.css erweitert um select-Styles, Farbvariablen harmonisiert
- **Design-Konsistenz**: --color-primary (#4f46e5) als zentrale Brand-Color

---

## 🛠️ **NEUE TECHNISCHE ARCHITEKTUR**

### **📊 QueryBuilder Refactoring (✅ IMPLEMENTIERT):**

**Problem:** Monolithische `executeGenericQuery()` schwer testbar
```typescript
// ❌ ALT: Alles in einer Funktion
executeGenericQuery(payload, config) -> results[]
```

**Lösung:** Separation of Concerns
```typescript
// ✅ NEU: Build + Execute getrennt
const { sql, parameters, metadata } = buildQuery(payload, config);
const results = await executeQuery(sql, parameters);

// ✅ Backward Compatibility
executeGenericQuery(payload, config) // Wrapper um build + execute
```

**Vorteile:**
- ✅ **Pure Functions** - buildQuery() ohne DB-Abhängigkeiten
- ✅ **Testbarkeit** - SQL-Generation unit-testbar
- ✅ **Debugging** - SQL vor Execution inspizieren
- ✅ **Flexibilität** - Query-Modifikation zwischen Build/Execute

### **🚨 MSSQL Error Mapper (✅ IMPLEMENTIERT):**

**Problem:** Redundante App-Level Constraint Checks + Race Conditions
```typescript
// ❌ ALT: App-Level Duplicate Check
const count = await checkDuplicate();
if (count > 0) throw error(409);
await insert(); // Race condition möglich!
```

**Lösung:** DB Constraints + Error Mapping
```typescript
// ✅ NEU: Optimistic Insert + DB Error Mapping
try {
  const result = await insertSupplier(data);
  return success(result);
} catch (dbError) {
  const { status, message } = mssqlErrorMapper.mapToHttpError(dbError);
  throw error(status, message);
}
```

**MSSQL Error Code Mapping:**
- **2627** (Unique Constraint) → **409 Conflict**
- **547** (Check/FK Constraint) → **400 Bad Request**
- **515** (NOT NULL) → **400 Bad Request**
- **8152** (String Truncation) → **422 Unprocessable Entity**

**Benefits:**
- ✅ **Race Condition Safe** - DB handles concurrency
- ✅ **Consistent Error Messages** - User-friendly translations
- ✅ **Performance** - Keine redundanten Queries
- ✅ **DB-Agnostic APIs** - Error handling abstracted

### **🔧 ESLint Standards (✅ IMPLEMENTIERT):**

**Strict TypeScript Configuration:**
```json
{
  "noImplicitAny": true,
  "noUnusedLocals": true,
  "exactOptionalPropertyTypes": true
}
```

**Code Quality Standards:**
- ✅ **Kein "unexpected any"** - Spezifische Types überall
- ✅ **"const" wo möglich** - Unveränderliche Werte als const
- ✅ **Type Guards** - Proper error instanceof checks
- ✅ **Comprehensive JSDoc** - @description, @example, @throws, @businessRules

**Beispiel - Vorher/Nachher:**
```typescript
// ❌ ALT: ESLint violations
function parseError(error: any): any {
  let result = { status: 500 };
  return result;
}

// ✅ NEU: ESLint konform
function parseError(error: unknown): { status: number; message: string } {
  const result = { status: 500, message: 'Unknown error' };
  if (error instanceof Error) {
    result.message = error.message;
  }
  return result;
}
```

---

## 📡 **SUPPLIERS API IMPLEMENTATION (✅ IMPLEMENTIERT)**

### **GET /api/suppliers - QueryPayload Support:**
```typescript
// Client sendet flexible Query
POST /api/suppliers
{
  "select": ["name", "region", "status", "dropship"],
  "where": {
    "op": "AND",
    "conditions": [
      {"key": "status", "op": "=", "val": "active"},
      {"key": "region", "op": "LIKE", "val": "%Europe%"}
    ]
  },
  "orderBy": [{"key": "name", "direction": "asc"}],
  "limit": 25
}
```

### **POST /api/suppliers - Transaction-Safe Creation:**
```typescript
// Optimistic insert mit DB error mapping
try {
  const supplier = await insertSupplier(data);
  return json({ success: true, data: supplier });
} catch (dbError) {
  const { status, message } = mssqlErrorMapper.mapToHttpError(dbError);
  throw error(status, message);
}
```

**Features:**
- ✅ **Flexible Client Filtering** - QueryPayload für komplexe UIs
- ✅ **Domain Validation** - Nur wholesaler queries erlaubt
- ✅ **DB Constraint Handling** - Duplicate name checks via DB
- ✅ **Type Safety** - Comprehensive TypeScript interfaces
- ✅ **Transaction Safety** - ACID compliance für data integrity

---

## 📧 **TECHNISCHE HERAUSFORDERUNGEN & LEARNINGS**

### **🔥 Mock-Daten Reaktivität (Development):**

**Problem:** Mock-Daten sind standardmäßig nicht reaktiv
```typescript
// ❌ NICHT reaktiv
const mockData = { assignedCategories: {...} };
mockData.assignedCategories[id].push(newItem); // Svelte sieht das nicht

// ✅ REAKTIV für Development
let mockData = $state({ assignedCategories: {...} });
mockData.assignedCategories[id].push(newItem); // Triggers Svelte reactivity
```

### **⚠️ StructuredClone Problem (FormShell + $state):**

**Problem:** FormShell's `structuredClone()` kann keine $state Proxies klonen
```typescript
let mockData = $state({...});
const selectedSupplier = mockData.wholesalers[0]; // ← Proxy-Objekt
<SupplierForm initial={selectedSupplier} />       // ← CRASH beim structuredClone
```

**Fix:** Entproxy beim Prop-Passing
```typescript
<SupplierForm 
  initial={selectedSupplier ? {...selectedSupplier} : undefined} 
/>
```

### **🚀 Production API-Patterns (echte API-Calls):**

**Option 1: Reload nach Assignment**
```typescript
async function handleCategoryAssigned(category) {
  await fetch('/api/supplier-categories', {...});
  await invalidate('supplier:categories'); // SvelteKit reload
}
```

**Option 2: Optimistic Updates + Rollback**
```typescript
// Separater $state für lokale Updates
let categoriesForSupplier = $state([]);

// Initial load
$effect(() => {
  if (selectedSupplier?.wholesaler_id) {
    loadCategoriesFromAPI(selectedSupplier.wholesaler_id);
  } else {
    categoriesForSupplier = [];
  }
});

// Optimistic update
async function handleCategoryAssigned(category) {
  const backup = [...categoriesForSupplier];
  categoriesForSupplier = [...categoriesForSupplier, newAssignment]; // Sofort anzeigen
  
  try {
    await fetch('/api/supplier-categories', {...});
    // Success: keep optimistic update
  } catch (error) {
    categoriesForSupplier = backup; // Rollback bei Fehler
  }
}
```

**Note:** `$state mockData` nur für Development - Production verwendet separaten $state + API-Calls

### **🎯 QueryGrammar Migration:**

**Änderung:** queryGrammar.ts verschoben für bessere Architektur
```typescript
// ✅ NEU: Shared zwischen Client und Server
import { type QueryPayload } from '$lib/clientAndBack/queryGrammar';

// ❌ ALT: War in routes/api/query/
import { type QueryPayload } from '../../routes/api/query/queryGrammar';
```

**Benefit:** Client und Server nutzen identische Query-Language für End-to-End Type Safety

---

## Ebenen-Struktur

### **Ebene 1: Suppliers** ✅ **IMPLEMENTIERT**
- **Grid:** `SupplierGrid` (um `Datagrid` wrapper)
- **Datenquelle:** `Wholesaler[]` aus Mock-Daten
- **Add-Button:** "Add Supplier" 
  - **Typ:** ECHTES OBJEKT erstellen
  - **Aktion:** Navigiert zu Ebene 2 UND zeigt `SupplierForm` oben (create mode)
- **Row-Click:** Navigiert zu Ebene 2 mit gewähltem Supplier (edit mode)
- **URL:** `?level=wholesalers`

### **Ebene 2: Categories** ✅ **IMPLEMENTIERT**  
- **Layout:** `SupplierForm` oben + `CategoryGrid` unten
- **SupplierForm:** 
  - ✅ **VOLLSTÄNDIG GESTYLT** mit form.css Integration + Comprehensive JSDoc
  - Zeigt/editiert Supplier (create wenn von Add-Button, edit wenn von Row-Click)
  - Wrapper um `FormShell` mit `Wholesaler` Type
  - Responsive 4-Spalten Layout, Validation, Error-Handling
- **CategoryGrid:**
  - **Datenquelle:** Assigned categories für diesen Supplier
  - **Type:** `WholesalerCategoryWithCount[]` (erweitert um offering_count)
  - **Query:** Mock-Daten, später `wholesaler_categories` JOIN `product_categories`
- **Add-Button:** "Assign Category" ✅ **VOLLSTÄNDIG IMPLEMENTIERT**
  - **Typ:** NUR RELATIONSHIP herstellen
  - **UI:** Dropdown mit verfügbaren `product_categories` 
  - **Aktion:** Erstellt n:m Eintrag in `wholesaler_categories` - **KEINE Navigation!**
- **Row-Click:** Navigiert zu Ebene 3 mit gewählter Category
- **URL:** `?level=categories&supplierId=1`

### **Ebene 3: Offerings** ⌘ **NOCH ZU IMPLEMENTIEREN**
- **Layout:** Kategoriename als Header + `OfferingGrid`
- **Header:** "Category: [Name]" (readonly Info)
- **OfferingGrid:**
  - **Datenquelle:** `WholesalerItemOffering[]` für diese Category + Supplier
  - **Type:** `WholesalerItemOffering` from types.ts
- **Add-Button:** "Add Offering"
  - **Typ:** ECHTES OBJEKT erstellen
  - **Aktion:** Navigiert zu Ebene 4 UND zeigt `OfferingForm` oben (create mode)
- **Row-Click:** Navigiert zu Ebene 4 mit gewähltem Offering (edit mode)
- **URL:** `?level=offerings&supplierId=1&categoryId=2`

### **Ebene 4: Attributes ODER Links (umschaltbar)** ⌘ **NOCH ZU IMPLEMENTIEREN**
- **Layout:** `OfferingForm` oben + **umschaltbares Grid** unten
- **OfferingForm:**
  - Zeigt/editiert Offering (create wenn von Add-Button, edit wenn von Row-Click)
  - Wrapper um `FormShell` mit `WholesalerItemOffering` Type
- **Sidebar Toggle:** 
  - **"Attributes" Button** → Zeigt `AttributeGrid`
  - **"Links" Button** → Zeigt `LinkGrid`
  - **Wichtig:** Nur EIN Grid sichtbar zur Zeit!
- **URL:** `?level=attributes&supplierId=1&categoryId=2&offeringId=3&mode=attributes`

#### **Attributes Modus:**
- **Grid:** `AttributeGrid`
- **Datenquelle:** `WholesalerOfferingAttribute[]` für dieses Offering
- **Row-Click:** Navigiert zu Ebene 5 mit `AttributeForm`

#### **Links Modus:**
- **Grid:** `LinkGrid` 
- **Datenquelle:** `WholesalerOfferingLink[]` für dieses Offering
- **Row-Click:** Navigiert zu Ebene 5 mit `LinkForm`

### **Ebene 5: Detail Forms** ⌘ **NOCH ZU IMPLEMENTIEREN**
- **Kein Grid** - nur Form
- **Zwei mögliche Forms:**

#### **AttributeForm:**
- **Typ:** ECHTES OBJEKT erstellen
- **Dropdown:** Verfügbare `attributes` (aus `dbo.attributes`)
- **Input:** Value für gewähltes Attribut
- **Speichern:** Erstellt `wholesaler_offering_attributes` Eintrag

#### **LinkForm:**
- **Typ:** ECHTES OBJEKT erstellen  
- **URL Input:** Link URL
- **Notes Input:** Beschreibung
- **Speichern:** Erstellt `wholesaler_offering_links` Eintrag

---

## Add-Button Verhalten

### **ECHTE OBJEKTE (Navigation + Form):** ✅ **IMPLEMENTIERT für Ebene 1-2**
```
Ebene 1: Add Supplier   → Navigation zu Ebene 2 + SupplierForm (create)  ✅
Ebene 3: Add Offering   → Navigation zu Ebene 4 + OfferingForm (create)  ⌘ TODO
Ebene 4: Row-Click      → Navigation zu Ebene 5 + AttributeForm/LinkForm ⌘ TODO
```

### **NUR RELATIONSHIPS (Dropdown, keine Navigation):** ✅ **IMPLEMENTIERT**
```
Ebene 2: Assign Category → CategoryAssignment.svelte → bleibt auf Ebene 2 ✅
```

---

## Sidebar Navigation ✅ **IMPLEMENTIERT**

```
Suppliers (3)                  ← Ebene 1 ✅
├─ Categories (2)              ← Ebene 2 ✅ (disabled bis Supplier gewählt)
   ├─ Product Offerings (0)    ← Ebene 3 ⌘ (disabled bis Category gewählt)
      ├─ Attributes (0)        ← Ebene 4a ⌘ (disabled bis Offering gewählt)  
      └─ Links (0)             ← Ebene 4b ⌘ (disabled bis Offering gewählt)
```

**✅ Implementiert:**
- `HierarchySidebar.svelte` mit dynamischen Counts
- Disabled states basierend auf Selection
- Click-Handler für Navigation zwischen Ebenen
- Live-Update der Counts basierend auf aktueller Selection
- **Svelte 5 Callback Props** statt DOM Events
- **Ausgelagerte CSS** nach sidebar.css

---

## Navigation Flow Beispiele

### **✅ Neuen Supplier mit Categories erstellen (IMPLEMENTIERT):**
1. **Ebene 1** → "Add Supplier" button
2. **→ Ebene 2:** `SupplierForm` (create mode) + leeres `CategoryGrid`
3. Supplier speichern → Form wird zu edit mode
4. **"Assign Category"** → `CategoryAssignment` Dropdown → Category auswählen → **bleibt auf Ebene 2** ✅ FUNKTIONIERT
5. `CategoryGrid` zeigt jetzt assigned category ✅ REAKTIV

### **⌘ Neues Offering mit Attributen erstellen (TODO):**
1. **Ebene 1** → Supplier row click 
2. **→ Ebene 2** → Category row click
3. **→ Ebene 3** → "Add Offering" button
4. **→ Ebene 4:** `OfferingForm` (create mode) + leeres Grid
5. Offering speichern → Form wird zu edit mode
6. Sidebar "Attributes" click → `AttributeGrid` anzeigen  
7. Attribute row click → **Ebene 5:** `AttributeForm`

---

## Technische Implementation

### **✅ State Management (IMPLEMENTIERT):**
```typescript
// URL-driven state via Svelte 5 runes
const currentLevel = $derived(($page.url.searchParams.get('level') as Level) || 'wholesalers');
const selectedSupplierId = $derived(Number($page.url.searchParams.get('supplierId')) || null);
const selectedCategoryId = $derived(Number($page.url.searchParams.get('categoryId')) || null);
const selectedOfferingId = $derived(Number($page.url.searchParams.get('offeringId')) || null);
```

### **✅ Add-Button Logik (TEILWEISE IMPLEMENTIERT):**
```typescript
// ECHTE OBJEKTE → Navigation ✅ (Suppliers)
if (level === 'suppliers' || level === 'offerings') {
  navigateToNextLevel();
  showFormInCreateMode();
}

// NUR RELATIONSHIPS → Dropdown ✅ (Categories IMPLEMENTIERT)
if (level === 'categories') {
  showAssignmentDropdown();
  // KEINE Navigation!
}
```

### **✅ Typisierung (IMPLEMENTIERT):**
- Alle Types aus `$lib/domain/types.ts` importiert
- Extended Types für Mock-Daten: `WholesalerCategoryWithCount`
- Keine inline Type-Definitionen in Komponenten
- Saubere Generics in allen Grid-Wrappern

### **✅ Event System (SVELTE 5 UPGRADE):**
```typescript
// ALT (Svelte 4)
on:select={handleSidebarNavigation}

// NEU (Svelte 5)  
onselect={handleSidebarNavigation}
```

---

## 🧪 **TESTING STATUS**

### **✅ Implementierte Test-Umgebung:**
- **Route:** `/supplierbrowser` 
- **Mock-Daten:** 3 Suppliers, Categories für jeden Supplier
- **Navigation:** Ebene 1 ↔ Ebene 2 funktioniert vollständig
- **URL-State:** Bookmarkable, alle Parameter in URL
- **Components:** SupplierGrid, SupplierForm, CategoryGrid funktionieren
- **Styling:** Vollständig responsive, konsistente Farben

### **📋 Test-Checklist:**
- ✅ Supplier row click → Category-Ebene
- ✅ Sidebar Navigation funktioniert vollständig
- ✅ URL-Parameter korrekt
- ✅ Disabled states in Sidebar
- ✅ Forms vollständig gestylt und funktional
- ✅ Farbkonsistenz durch alle Komponenten
- ✅ Category Assignment funktional (Mock-Daten)
- ⌘ Ebene 3-5 (noch nicht implementiert)

---

## 📦 **DATEI-STRUKTUR (AKTUELL)**

```
src/lib/
├── clientAndBack/
│   ├── queryGrammar.ts                   ✅ NEU - Shared Query Language
│   └── columnDefinitions.ts             ✅ BASIS-KOMPONENTE
├── components/
│   ├── browser/
│   │   └── HierarchySidebar.svelte       ✅ IMPLEMENTIERT + CSS ausgelagert
│   ├── domain/suppliers/
│   │   ├── SupplierGrid.svelte           ✅ IMPLEMENTIERT
│   │   └── SupplierForm.svelte           ✅ VOLLSTÄNDIG GESTYLT + JSDoc
│   ├── domain/categories/
│   │   ├── CategoryGrid.svelte           ✅ IMPLEMENTIERT
│   │   └── CategoryAssignment.svelte     ✅ VOLLSTÄNDIG IMPLEMENTIERT
│   ├── styles/                           ✅ CSS-SYSTEM
│   │   ├── grid.css                      ✅ BASIS-KOMPONENTE + Farbharmonisierung
│   │   ├── form.css                      ✅ ERWEITERT (select-styles)
│   │   └── sidebar.css                   ✅ NEU ERSTELLT
│   ├── domain/offerings/                 ⌘ TODO
│   │   ├── OfferingGrid.svelte           ✅ IMPLEMENTIERT (STUB)
│   │   └── OfferingForm.svelte           ⌘ TODO
│   ├── domain/attributes/                ⌘ TODO
│   │   ├── AttributeGrid.svelte          ✅ IMPLEMENTIERT (STUB)
│   │   └── AttributeForm.svelte          ⌘ TODO
│   ├── domain/links/                     ⌘ TODO
│   │   ├── LinkGrid.svelte               ✅ IMPLEMENTIERT (STUB)
│   │   └── LinkForm.svelte               ⌘ TODO
│   ├── client/
│   │   ├── Datagrid.svelte               ✅ BASIS-KOMPONENTE + Dokumentation
│   │   └── ConfirmDialog.svelte          ✅ BASIS-KOMPONENTE
│   └── forms/
│       └── FormShell.svelte              ✅ BASIS-KOMPONENTE
├── server/
│   ├── queryBuilder.ts                   ✅ NEU REFACTORED - Build + Execute Trennung
│   ├── supplierQueryConfig.ts            ✅ VEREINFACHT - Config only
│   └── errors/
│       └── mssqlErrorMapper.ts           ✅ NEU IMPLEMENTIERT - DB Error Mapping
└── routes/
    ├── api/
    │   ├── suppliers/
    │   │   └── +server.ts                ✅ NEU IMPLEMENTIERT - GET + POST mit QueryPayload
    │   └── query/
    │       └── +server.ts                ✅ BASIS-KOMPONENTE (Generic Query API)
    └── supplierbrowser/
        ├── +page.svelte                  ✅ TEST-SEITE (Ebene 1-2 vollständig)
        └── mockData.ts                   ✅ DEVELOPMENT DATEN
```

---

## 🎯 **NEXT STEPS**

### **📡 (API):**
- **PUT /api/suppliers/[id]** - Update existing supplier
- **DELETE /api/suppliers/[id]** - Delete supplier with dependencies
- **Categories/Offerings APIs** - Weitere Domain APIs implementieren
- **Generic Domain Validation** - Type-basierte Validierung system
- IMPORTANT: trenne den generische validator und den domain-spezifischen,
  beseitige fehler im domainValidator: Unnecessary escape character: \(.  

### **🚀 (Offerings):**
- **OfferingForm.svelte** - Form wrapper um FormShell
- **Ebene 3 Navigation** - Offerings Grid Integration  
- **Mock-Daten erweitern** - WholesalerItemOffering_ProductDef_Category data

### **🔧  (Details):**
- **AttributeForm + LinkForm** - Detail forms für Ebene 5
- **Ebene 4-5 Navigation** mit Mode-Toggle (Attributes/Links)
- **Mock-Daten** für Attributes/Links erweitern


### **🎨 (Polish):**
- **Loading States** - Skeleton loading für alle Grids
- **Error Boundaries** - Graceful error handling in UI
- **Performance** - Virtual scrolling für große Datasets
- **Accessibility** - ARIA labels, keyboard navigation

---

## 🏗️ **ARCHITEKTUR-COMPLIANCE**

### ✅ **Eingehalten:**
- **Svelte 5 + Runes** überall
- **KEINE eigenen Forms/Grids** in Pages - nur Komponenten-Orchestrierung
- **KEINE lokalen Types** - alles aus `types.ts`
- **URL-driven State** - bookmarkable
- **Thin Grid-Wrapper** - Datagrid as Basis
- **FormShell-Wrapper** - für alle Forms
- **CSS-Design-System** - Modulare, wiederverwendbare Styles
- **Callback Props** statt DOM Events (Svelte 5 Pattern)
- **ESLint Compliance** - Kein "unexpected any", const usage, type safety
- **DB-First Constraints** - Optimistic operations mit error mapping

### 📋 **Neue Standards etabliert:**
- **QueryBuilder Pattern** - Build/Execute Separation für Testbarkeit
- **DB Error Mapping** - SQL Constraints → HTTP Status Codes
- **Generic Validation** - Type-basierte Domain validation (geplant)
- **End-to-End Type Safety** - Shared clientAndBack interfaces

### 🎨 **Styling-Standards etabliert:**
- **Farbkonsistenz:** Einheitliches --color-primary (#4f46e5)
- **CSS-Modularität:** Getrennte .css Dateien pro Komponententyp
- **Form-Standards:** .form-grid, .form-group, konsistente Error-Behandlung
- **Responsive Design:** Mobile-first, flexible Layouts

---

**🎯 Ziel: Vollständig funktionsfähiges 5-Ebenen SupplierBrowser System mit URL-driven Navigation, konsistenter Architektur und production-ready API Backend.**

**📊 Fortschritt: ~80% implementiert** (Ebene 1-2 vollständig + Category Assignment + QueryBuilder + Error Handling + Suppliers API funktional)

**🚀 Nächster Milestone: Ebene 3 (Offerings) Implementation mit neuer QueryBuilder Architektur**