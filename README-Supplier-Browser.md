# SupplierBrowser - Hierarchische Navigation Spezifikation

## Überblick
Das SupplierBrowser System ist eine **5-Ebenen hierarchische Navigation** durch Supplier-Daten. Unterscheidung zwischen **"echte Objekte erstellen"** (→ Navigation + Form) vs **"nur Relationships herstellen"** (→ Dropdown).

## 🚀 **AKTUELLER IMPLEMENTIERUNGSSTATUS**

### ✅ **IMPLEMENTIERT:**
- **HierarchySidebar.svelte** - Navigation mit disabled states & counts (Svelte 5 + ausgelagerte CSS)
- **SupplierGrid.svelte** - Wrapper um Datagrid für Wholesaler[]
- **SupplierForm.svelte** - Wrapper um FormShell für Wholesaler create/edit **✅ VOLLSTÄNDIG GESTYLT**
- **CategoryGrid.svelte** - Wrapper um Datagrid für WholesalerCategory[]
- **URL-driven State** - Level, supplierId, categoryId via URL-Parameter
- **Svelte 5 + Runes** - Alle Komponenten nutzen neue Syntax
- **CSS-System Integration** - Form.css, Sidebar.css, Grid.css vollständig integriert
- **Farbkonsistenz** - Einheitliches Violett (#4f46e5) durch alle UI-Komponenten

### 🔄 **IN PROGRESS:**
- **CategoryForm.svelte** - Für Category Assignment (NUR RELATIONSHIP)

### ⌘ **NOCH ZU IMPLEMENTIEREN:**
- **OfferingGrid.svelte** + **OfferingForm.svelte** (Ebene 3)
- **AttributeGrid.svelte** + **AttributeForm.svelte** (Ebene 5)
- **LinkGrid.svelte** + **LinkForm.svelte** (Ebene 5)
- **Echte API-Integration** (derzeit Mock-Daten)
- **Delete-Strategien** mit Dependency-Checks
- **Ebene 4-5 Navigation** (Attributes/Links Toggle)

### 🎨 **STYLING UPDATES:**
- **SupplierForm.svelte**: Vollständig responsive Form mit .form-grid, .form-group, Error-Styling
- **HierarchySidebar.svelte**: Ausgelagerte CSS nach sidebar.css, Svelte 5 callback props
- **CSS-System**: form.css erweitert um select-Styles, Farbvariablen harmonisiert
- **Design-Konsistenz**: --color-primary (#4f46e5) als zentrale Brand-Color

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
  - ✅ **VOLLSTÄNDIG GESTYLT** mit form.css Integration
  - Zeigt/editiert Supplier (create wenn von Add-Button, edit wenn von Row-Click)
  - Wrapper um `FormShell` mit `Wholesaler` Type
  - Responsive 4-Spalten Layout, Validation, Error-Handling
- **CategoryGrid:**
  - **Datenquelle:** Assigned categories für diesen Supplier
  - **Type:** `WholesalerCategoryWithCount[]` (erweitert um offering_count)
  - **Query:** Mock-Daten, später `wholesaler_categories` JOIN `product_categories`
- **Add-Button:** "Assign Category" 🔄 **NOCH ZU IMPLEMENTIEREN**
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

### **NUR RELATIONSHIPS (Dropdown, keine Navigation):** 🔄 **IN PROGRESS**
```
Ebene 2: Assign Category → Dropdown von existing categories, bleibt auf Ebene 2
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
4. **"Assign Category"** dropdown → Category auswählen → **bleibt auf Ebene 2** 🔄 TODO
5. `CategoryGrid` zeigt jetzt assigned category

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

// NUR RELATIONSHIPS → Dropdown 🔄 (Categories TODO)
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
- 🔄 Category Assignment (noch nicht testbar)
- ⌘ Ebene 3-5 (noch nicht implementiert)

---

## 📦 **DATEI-STRUKTUR (AKTUELL)**

```
src/lib/components/
├── browser/
│   └── HierarchySidebar.svelte           ✅ IMPLEMENTIERT + CSS ausgelagert
├── entities/suppliers/
│   ├── SupplierGrid.svelte               ✅ IMPLEMENTIERT
│   └── SupplierForm.svelte               ✅ VOLLSTÄNDIG GESTYLT
├── entities/categories/
│   ├── CategoryGrid.svelte               ✅ IMPLEMENTIERT
│   └── CategoryForm.svelte               🔄 IN PROGRESS
├── styles/                               ✅ CSS-SYSTEM
│   ├── grid.css                          ✅ BASIS-KOMPONENTE + Farbharmonisierung
│   ├── form.css                          ✅ ERWEITERT (select-styles)
│   └── sidebar.css                       ✅ NEU ERSTELLT
├── entities/offerings/                            ⌘ TODO
│   ├── OfferingGrid.svelte
│   └── OfferingForm.svelte
├── entities/attributes/                           ⌘ TODO
│   ├── AttributeGrid.svelte
│   └── AttributeForm.svelte
├── entities/links/                                ⌘ TODO
│   ├── LinkGrid.svelte
│   └── LinkForm.svelte
├── Datagrid.svelte                       ✅ BASIS-KOMPONENTE + Dokumentation
└── forms/FormShell.svelte                ✅ BASIS-KOMPONENTE

src/routes/
└── supplierbrowser/
    └── +page.svelte                      ✅ TEST-SEITE (Ebene 1-2 vollständig)
```

---

## 🎯 **NEXT STEPS**

### **1. Sofort (CategoryForm):**
- CategoryForm.svelte für Assignment-Dropdown
- Integration in supplier-browser/+page.svelte
- Test: Category Assignment funktioniert

### **2. Phase 2 (Offerings):**
- OfferingGrid.svelte + OfferingForm.svelte
- Ebene 3 Navigation
- Mock-Daten für Offerings erweitern

### **3. Phase 3 (Details):**
- AttributeGrid + AttributeForm + LinkGrid + LinkForm
- Ebene 4-5 Navigation mit Mode-Toggle
- Mock-Daten für Attributes/Links

### **4. Phase 4 (API-Integration):**
- Echte API-Calls statt Mock-Daten
- Delete-Strategien mit Dependency-Checks
- Error-Handling & Loading-States

---

## 🔧 **ARCHITEKTUR-COMPLIANCE**

### ✅ **Eingehalten:**
- **Svelte 5 + Runes** überall
- **KEINE eigenen Forms/Grids** in Pages - nur Komponenten-Orchestrierung
- **KEINE lokalen Types** - alles aus `types.ts`
- **URL-driven State** - bookmarkable
- **Thin Grid-Wrapper** - Datagrid as Basis
- **FormShell-Wrapper** - für alle Forms
- **CSS-Design-System** - Modulare, wiederverwendbare Styles
- **Callback Props** statt DOM Events (Svelte 5 Pattern)

### 📋 **Zu beachten:**
- Mock-Daten durch echte API ersetzen
- Delete-Handler implementieren  
- Loading-States & Error-Handling
- Performance-Optimierung für große Datensets

### 🎨 **Styling-Standards etabliert:**
- **Farbkonsistenz:** Einheitliches --color-primary (#4f46e5)
- **CSS-Modularität:** Getrennte .css Dateien pro Komponententyp
- **Form-Standards:** .form-grid, .form-group, konsistente Error-Behandlung
- **Responsive Design:** Mobile-first, flexible Layouts

---

**🎯 Ziel: Vollständig funktionsfähiges 5-Ebenen SupplierBrowser System mit URL-driven Navigation und konsistenter Architektur.**

**📊 Fortschritt: ~60% implementiert** (Ebene 1-2 vollständig, Ebene 3-5 ausstehend)