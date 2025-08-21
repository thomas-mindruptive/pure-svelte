# SupplierBrowser - Hierarchische Navigation Spezifikation

## Überblick
Das SupplierBrowser System ist eine **5-Ebenen hierarchische Navigation** durch Supplier-Daten. Unterscheidung zwischen **"echte Objekte erstellen"** (→ Navigation + Form) vs **"nur Relationships herstellen"** (→ Dropdown).

## Ebenen-Struktur

### **Ebene 1: Suppliers**
- **Grid:** `SupplierGrid`
- **Datenquelle:** `dbo.wholesalers` Tabelle
- **Add-Button:** "Add Supplier" 
  - **Typ:** ECHTES OBJEKT erstellen
  - **Aktion:** Navigiert zu Ebene 2 UND zeigt `SupplierForm` oben (create mode)
- **Row-Click:** Navigiert zu Ebene 2 mit gewähltem Supplier (edit mode)

### **Ebene 2: Categories**  
- **Layout:** `SupplierForm` oben + `CategoryGrid` unten
- **SupplierForm:** 
  - Zeigt/editiert Supplier (create wenn von Add-Button, edit wenn von Row-Click)
- **CategoryGrid:**
  - **Datenquelle:** Assigned categories für diesen Supplier
  - **Query:** `wholesaler_categories` JOIN `product_categories`
- **Add-Button:** "Assign Category"
  - **Typ:** NUR RELATIONSHIP herstellen
  - **UI:** Dropdown mit verfügbaren `product_categories` 
  - **Aktion:** Erstellt n:m Eintrag in `wholesaler_categories` - **KEINE Navigation!**
- **Row-Click:** Navigiert zu Ebene 3 mit gewählter Category

### **Ebene 3: Offerings**
- **Layout:** Kategoriename als Header + `OfferingGrid`
- **Header:** "Category: [Name]" (readonly Info)
- **OfferingGrid:**
  - **Datenquelle:** `wholesaler_item_offerings` für diese Category + Supplier
- **Add-Button:** "Add Offering"
  - **Typ:** ECHTES OBJEKT erstellen
  - **Aktion:** Navigiert zu Ebene 4 UND zeigt `OfferingForm` oben (create mode)
- **Row-Click:** Navigiert zu Ebene 4 mit gewähltem Offering (edit mode)

### **Ebene 4: Attributes ODER Links (umschaltbar)**
- **Layout:** `OfferingForm` oben + **umschaltbares Grid** unten
- **OfferingForm:**
  - Zeigt/editiert Offering (create wenn von Add-Button, edit wenn von Row-Click)
- **Sidebar Toggle:** 
  - **"Attributes" Button** → Zeigt `AttributeGrid`
  - **"Links" Button** → Zeigt `LinkGrid`
  - **Wichtig:** Nur EIN Grid sichtbar zur Zeit!

#### **Attributes Modus:**
- **Grid:** `AttributeGrid`
- **Datenquelle:** `wholesaler_offering_attributes` für dieses Offering
- **Row-Click:** Navigiert zu Ebene 5 mit `AttributeForm`

#### **Links Modus:**
- **Grid:** `LinkGrid` 
- **Datenquelle:** `wholesaler_offering_links` für dieses Offering
- **Row-Click:** Navigiert zu Ebene 5 mit `LinkForm`

### **Ebene 5: Detail Forms**
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

## Add-Button Verhalten

### **ECHTE OBJEKTE (Navigation + Form):**
```
Ebene 1: Add Supplier   → Navigation zu Ebene 2 + SupplierForm (create)
Ebene 3: Add Offering   → Navigation zu Ebene 4 + OfferingForm (create)  
Ebene 4: Row-Click      → Navigation zu Ebene 5 + AttributeForm/LinkForm
```

### **NUR RELATIONSHIPS (Dropdown, keine Navigation):**
```
Ebene 2: Assign Category → Dropdown von existing categories, bleibt auf Ebene 2
```

## Sidebar Navigation

```
Suppliers (5)                  ← Ebene 1
├─ Categories (3)              ← Ebene 2 (disabled bis Supplier gewählt)
   ├─ Product Offerings (0)    ← Ebene 3 (disabled bis Category gewählt)
      ├─ Attributes (0)        ← Ebene 4a (disabled bis Offering gewählt)  
      └─ Links (0)             ← Ebene 4b (disabled bis Offering gewählt)
```

## Navigation Flow Beispiele

### **Neuen Supplier mit Categories erstellen:**
1. **Ebene 1** → "Add Supplier" button
2. **→ Ebene 2:** `SupplierForm` (create mode) + leeres `CategoryGrid`
3. Supplier speichern → Form wird zu edit mode
4. **"Assign Category"** dropdown → Category auswählen → **bleibt auf Ebene 2**
5. `CategoryGrid` zeigt jetzt assigned category

### **Neues Offering mit Attributen erstellen:**
1. **Ebene 1** → Supplier row click 
2. **→ Ebene 2** → Category row click
3. **→ Ebene 3** → "Add Offering" button
4. **→ Ebene 4:** `OfferingForm` (create mode) + leeres Grid
5. Offering speichern → Form wird zu edit mode
6. Sidebar "Attributes" click → `AttributeGrid` anzeigen  
7. Attribute row click → **Ebene 5:** `AttributeForm`

## Technische Implementation

### **State Management:**
```typescript
currentLevel: 'suppliers' | 'categories' | 'offerings' | 'attributes' | 'links'
selectedSupplier: Supplier | null  
selectedCategory: Category | null
selectedOffering: Offering | null
```

### **Add-Button Logik:**
```typescript
// ECHTE OBJEKTE → Navigation
if (level === 'suppliers' || level === 'offerings') {
  navigateToNextLevel();
  showFormInCreateMode();
}

// NUR RELATIONSHIPS → Dropdown  
if (level === 'categories') {
  showAssignmentDropdown();
  // KEINE Navigation!
}
```

Diese Unterscheidung ist kritisch für das korrekte Verhalten des Systems.

# Clientseitige Navigation
* Die einzelnen Ebenen sollen bookmarkable sein.