# **Hierarchy Navigation System - Aktueller Status**

## **📁 Fertige Artifacts**

### **1. HierarchySidebar.svelte** ✅
- **Flattened Rendering**: `{#each}` über flache Liste statt Rekursion
- **Tree References**: Jedes `FlattenedItem` hat `treeRef` + `nodeRef` Pointer
- **Svelte 5 Runes**: `$props()`, `$derived()`
- **Click Handler**: `onselect(tree, node)` mit echten Object-Referenzen

### **2. NavigationState.ts** ✅
- **Simple Memory-Only**: Keine SessionStorage Persistence (zu komplex)
- **Context Preservation**: Gleiche Logic wie original +layout.ts, aber generisch
- **Multiple Trees**: `treePaths` Map behält Context pro Tree
- **Core API**: `selectNode()`, `switchToTree()`, `setActiveTreePath()`

### **3. HierarchyUrlBuilder.ts** ❌ **NEEDS REWORK**
- **Problem**: Over-engineered mit separater `TreeUrlConfig`
- **Lösung**: Info direkt in `HierarchyItem` properties
- **Status**: Muss neu gemacht werden

---

## **🏗️ Architektur-Entscheidungen**

### **Single Source of Truth: HierarchyTree**
```typescript
// Alles definiert sich aus dieser Struktur:
const supplierHierarchy: HierarchyTree = { ... }

// NavigationState arbeitet mit Object-Referenzen darauf
// Sidebar rendert flache View davon  
// URLs werden daraus generiert
```

### **Context Preservation Logic**
```typescript
// Original: supplierId ≠ conservedPath.supplierId → reset categoryId, offeringId
// Neu: nodeAtLevel ≠ currentPath[level] → reset levels > level
// Gleiche Semantik, generisch für beliebige Hierarchien
```

### **Array-Position = Navigation-Level**
```typescript
activePath = [rootNode, supplierNode, categoryNode]
// Position:    0         1            2
// Level:       0         1            2  (automatisch via initLevels)
```

### **No Persistence = Simplicity**
- **Innerhalb Session**: Alles funktioniert perfekt (Memory-basiert)
- **Nach Browser-Reload**: Fresh start (acceptable trade-off)
- **80% weniger Code-Komplexität**

---

## **🔄 Aktueller Workflow**

### **Navigation Flow:**
```
1. User klickt Node in Sidebar
2. Sidebar: onselect(tree, node) 
3. NavigationState: selectNode(node)
4. Context Preservation Logic applied
5. UI updates basierend auf new activePath
```

### **Tree Switching Flow:**
```
1. User wechselt Tree (z.B. Suppliers → Products)
2. NavigationState: switchToTree(newTree)
3. Aktueller Path wird in treePaths gespeichert
4. Vorheriger Path für newTree wird restored
5. Context zwischen Trees erhalten!
```

---

## **📋 Noch zu erledigen**

### **1. HierarchyUrlBuilder korrigieren** 🔴
```typescript
// ❌ Aktuell: Separate TreeUrlConfig
// ✅ Ziel: Info in HierarchyItem
export type HierarchyItem = {
  key: string;        // = URL segment
  paramName?: string; // "supplierId", "categoryId"
  // ...
}
```

### **2. HierarchyConfig.ts erstellen** 🔴
```typescript
// buildSupplierHierarchy() mit korrigierten URL-Builder
// initLevels() function
// Ausgelagert aus +layout.ts
```

### **3. Neue +layout.ts** 🔴
```typescript
// 90% weniger Code als Original
// 1. Build hierarchy (via hierarchyConfig)
// 2. Parse URL → NavigationState.selectNode()
// 3. Load entities, build breadcrumbs
// 4. Return clean data
```

### **4. Integration testen** 🔴
- Sidebar + NavigationState + Layout zusammen
- Context Preservation testen
- Multiple Trees testen

---

## **⚠️ Aktuelle Probleme**

### **URLBuilder Over-Engineering**
- Separate `TreeUrlConfig` ist unnötig
- Duplicate zwischen `HierarchyItem.key` und `TreeUrlConfig.segment`
- Soll direkt HierarchyItem properties verwenden

### **Missing Integration**
- Einzelne Teile sind fertig, aber noch nicht zusammengebaut
- +layout.ts fehlt noch (wichtigste Integration-Datei)

---

## **🎯 Nächste Schritte**

1. **HierarchyUrlBuilder neu** (HierarchyItem-basiert) 
2. **HierarchyConfig.ts** mit korrigiertem URL-Builder
3. **+layout.ts** als Integration-Hub
4. **Testing der kompletten Chain**

**Status**: **~60% Complete** - Core Logic steht, Integration fehlt noch.