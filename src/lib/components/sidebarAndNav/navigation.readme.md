# **Hierarchy Navigation System - Complete Documentation**

## **Begriffsdefinitionen**

1. **URL/Route** - Browser address bar, bestimmt Page Component
2. **NavigationContext** - Gespeicherte Parameter-IDs in `activeTree.paths[].urlParamValue`
3. **Navigation** - URL-Wechsel, löst +layout.ts load() aus
4. **Level/Tier** - Hierarchy-Stufe im Sidebar (0=suppliers, 1=categories, etc.)
5. **Context Preservation** - NavigationContext bleibt unverändert trotz URL-Wechsel
6. **Context Reset** - NavigationContext wird überschrieben bei anderer Entity auf gleicher Ebene
7. **Sidebar markiert** - UI highlight, zeigt aktuelle Position
8. **Enabled tree** - Klickbare Sidebar-Elemente basierend auf NavigationContext
9. **Entity Selection** - User wählt spezifische Entity in DataGrid/Liste (z.B. Supplier 3)
10. **Sidebar Navigation** - User klickt Level-Element in Sidebar (z.B. "categories")
11. **defaultChild** - Automatisch markiertes child-Level bei Entity Selection

---

## **Kompletter Navigation Flow - Beispiel mit Siblings**

### **Schritt 1: User auf `/suppliers` (Supplier Liste)**
- **URL:** `/suppliers`
- **NavigationContext:** `activeTree.paths = []`
- **Sidebar markiert:** "suppliers"
- **Enabled tree:**
  - suppliers

### **Schritt 2: User wählt Supplier 3 (Entity Selection)**
- **URL:** `/suppliers/3` (SupplierDetailPage mit Categories DataGrid)
- **NavigationContext:** `[{node: suppliersNode, urlParamValue: 3}]`
- **Sidebar markiert:** "categories" (automatisch via defaultChild)
- **Enabled tree:**
  - suppliers
    - categories
    - addresses

### **Schritt 3: User wählt Category 5 (Entity Selection)**
- **URL:** `/suppliers/3/categories/5` (CategoryDetailPage mit Offerings DataGrid)
- **NavigationContext:** `[{node: suppliersNode, urlParamValue: 3}, {node: categoriesNode, urlParamValue: 5}]`
- **Sidebar markiert:** "offerings" (automatisch via defaultChild)
- **Enabled tree:**
  - suppliers
    - categories
      - offerings
        - attributes
        - links
    - addresses

### **Schritt 4: User klickt "categories" in Sidebar (Zurück-Navigation)**
- **URL:** `/suppliers/3/categories` (Categories Liste)
- **NavigationContext:** **UNVERÄNDERT** (Context Preservation)
- **Sidebar markiert:** "categories"
- **Enabled tree:**
  - suppliers
    - categories
      - offerings
        - attributes
        - links
    - addresses

### **Schritt 5: User klickt "addresses" in Sidebar (Sibling-Wechsel)**
- **URL:** `/suppliers/3/addresses` (Addresses Liste)
- **NavigationContext:** **UNVERÄNDERT** (Context Preservation)
- **Sidebar markiert:** "addresses"
- **Enabled tree:**
  - suppliers
    - categories
      - offerings
        - attributes
        - links
    - addresses

### **Schritt 6: User wählt Supplier 7 (Entity Selection, Context Reset)**
- **URL:** `/suppliers/7` 
- **NavigationContext:** `[{node: suppliersNode, urlParamValue: 7}]` (Context Reset)
- **Sidebar markiert:** "categories" (automatisch via defaultChild)
- **Enabled tree:**
  - suppliers
    - categories
    - addresses

### **Kern-Regeln:**

1. **Entity Selection** → NavigationContext erweitern/reset + automatische Sidebar-Markierung via defaultChild
2. **Sidebar Navigation** → URL-Wechsel mit Context Preservation
3. **Context Preservation** → NavigationContext bleibt bei Level-Navigation erhalten
4. **Context Reset** → Nur bei neuer Entity-Auswahl auf gleicher Ebene
5. **Enabled Tree** → Alle Levels mit Parametern in NavigationContext + deren Children
6. **Marked Element** → Aktueller UI-Focus-Level (oft defaultChild des letzten Entity-Levels)

---

## **Architektur-Entscheidungen**

### **Type-Safe Hierarchy System**
```typescript
// Generic types mit compile-time validation für defaultChild
export type HierarchyItem<K extends string> = {
  key: K;
  label: string;
  count?: number | null;
  disabled?: boolean;
  urlParamName: "leaf" | string;
};

export type HierarchyTreeNode<
  K extends string,
  C extends readonly HierarchyTreeNode<any, any>[] | undefined
> = {
  item: HierarchyItem<K>;
  defaultChild?: C extends readonly any[] ? C[number]['item']['key'] : never;
  children?: C;
};

// Helper function für type inference
const createHierarchyNode = <
  const K extends string,
  const C extends readonly HierarchyTreeNode<any, any>[] | undefined
>(node: {
  item: HierarchyItem<K>,
  defaultChild?: C extends readonly any[] ? C[number]['item']['key'] : never,
  children?: C
}): HierarchyTreeNode<K, C> => node;

// Static configuration (configure-time)
const supplierHierarchyConfig: HierarchyTree = {
  name: "suppliers",
  rootItem: createHierarchyNode({
    item: { key: "suppliers", label: "Suppliers", urlParamName: "supplierId" },
    defaultChild: "categories", // ✅ Type-safe - nur existierende children
    children: [/* nested structure */]
  })
};

// Runtime transformation
const runtimeHierarchy: RuntimeHierarchyTree[] = buildRuntimeHierarchy(staticConfigs, urlParams);
```

### **Configure-Time vs Runtime Separation**
- **Configure-Time**: `HierarchyTree` mit statischen Definitionen + type-safe defaultChild
- **Runtime**: `RuntimeHierarchyTree` mit urlParamValues + levels + computed properties
- **Transform**: `buildRuntimeHierarchy()` konvertiert static → runtime mit Parameter-Injection

### **NavigationState Architecture**
```typescript
interface NavigationState {
  activeTree: NavigationPathTree | null;           // Current tree with paths
  allTrees: Map<HierarchyTree, NavigationPathTree>; // Context für tree switching
}

type NavigationPathTree = {
  tree: RuntimeHierarchyTree;                      // Tree structure
  paths: RuntimeHierarchyTreeNode[];               // Current navigation path mit urlParamValues
}

type RuntimeHierarchyItem = HierarchyItem & {
  urlParamValue: string | number | "leaf";
  level: number | undefined; // Set by initLevels()
}
```

### **defaultChild System**
- **Entity Selection**: `/suppliers/3` → automatisch markiert defaultChild "categories"
- **Type Safety**: defaultChild kann nur auf existierende children verweisen
- **UX Pattern**: Ein Klick gespart durch automatische Level-Selection
- **Compile-Time Validation**: TypeScript verhindert ungültige defaultChild-Referenzen

### **Separation of Concerns**
- **hierarchyConfig.ts**: Static HierarchyTree definitions mit createHierarchyNode()
- **hierarchyUtils.ts**: Generic transform functions (static→runtime) + URL building
- **navigationState.ts**: NavigationPathTree state management + Context Preservation
- **HierarchySidebar.svelte**: RuntimeHierarchyTree rendering
- **+layout.ts**: Static→Runtime transformation + NavigationState integration

### **No Persistence = Simplicity**
- **Innerhalb Session**: Alles funktioniert perfekt (Memory-basiert)
- **Nach Browser-Reload**: Fresh start (acceptable trade-off)
- **Massive Code-Reduktion** durch Wegfall von Serialization

---

## **selectNode() Logic Documentation**

### **Context Preservation vs Context Reset Rules:**

```typescript
/**
 * SELECTNODE() LOGIC RULES:
 * 
 * Case 1: Node at existing level in current path
 *   1A: Same entity (urlParamValue unchanged) = Context Preservation (no NavigationContext change)
 *   1B: Different entity (urlParamValue changed) = Context Reset for deeper levels
 * 
 * Case 2: Node extends path to new level
 *   Add node to path with new urlParamValue
 * 
 * Case 3: Level gap (error handling)
 *   Graceful fallback with logging
 */
```

### **Wichtiger Unterschied:**
- **Sidebar Clicks** = Level-Navigation mit Context Preservation (keine Entity-Änderung)
- **Entity Selection** = Parameter-Setting mit möglichem Context Reset (neue urlParamValue)

---

## **Implementation Plan**

### **Phase 1: Type System Update ✅**
1. **HierarchySidebar.types.ts**: Generic types + createHierarchyNode helper
2. **Add**: RuntimeHierarchy types mit urlParamValue + level properties
3. **Test**: Verify type-safe defaultChild validation works

### **Phase 2: Static Configuration**
1. **hierarchyConfig.ts**: Replace buildHierarchy mit static configs
2. **Use**: createHierarchyNode für nested tree structure
3. **Export**: getAppHierarchies() function returning HierarchyTree[]
4. **Define**: Supplier hierarchy mit categories/addresses siblings

### **Phase 3: Transform Functions**
1. **hierarchyUtils.ts**: Add buildRuntimeHierarchy() + convertToRuntimeTree()
2. **Keep**: Existing functions (buildUrlFromNavigationPath, initLevels, etc.)
3. **Add**: resolveDefaultChild() for string→node resolution
4. **Add**: setUrlParamValues() basierend auf urlParams input

### **Phase 4: NavigationState Integration**
1. **navigationState.ts**: Already updated mit NavigationPathTree structure ✅
2. **+layout.ts**: Replace buildHierarchy calls mit buildRuntimeHierarchy
3. **Update**: determineActiveLevel() to use defaultChild resolution
4. **Test**: URL parsing + NavigationState updates

### **Phase 5: UI Integration**
1. **HierarchySidebar.svelte**: Support RuntimeHierarchyTree rendering
2. **Layout.svelte**: Update handleSidebarNavigation signature for RuntimeHierarchyTreeNode
3. **Test**: End-to-end navigation flow mit enabled/disabled states

### **Phase 6: selectNode() Logic Fix**
1. **selectNode()**: Fix logic to handle Entity Selection vs Sidebar Navigation
2. **Add**: Parameter für urlParamValue bei Entity Selection
3. **Test**: Context Preservation vs Context Reset scenarios

---

## **Critical Data Flow**

### **URL → NavigationState Flow:**
```
1. URL: /suppliers/3/categories/5
2. +layout.ts: parseUrlParameters(hierarchy, params) → {supplierId: 3, categoryId: 5}
3. +layout.ts: buildRuntimeHierarchy(staticConfigs, urlParams) → RuntimeHierarchyTree[]
4. +layout.ts: buildNavigationPath(tree, urlParams) → RuntimeHierarchyTreeNode[]
5. NavigationState: setActiveTreePath(tree, path)
6. Layout.svelte: activeLevel from determineActiveLevel() → "offerings" (via defaultChild)
7. Sidebar: markiert "offerings", enabled tree bis zu offerings + children
```

### **Sidebar Click → Navigation Flow:**
```
1. User klickt "categories" in Sidebar
2. Layout.svelte: handleSidebarNavigation(tree, node)
3. NavigationState: selectNode(node) → Context Preservation logic
4. Layout.svelte: goto(node.item.href) → URL built from NavigationContext
5. +layout.ts: load() triggered → repeat URL → NavigationState flow
```

### **Entity Selection → Navigation Flow:**
```
1. User klickt Supplier 7 in DataGrid
2. Page: goto(`/suppliers/7`) 
3. +layout.ts: load() → urlParams = {supplierId: 7}
4. NavigationState: Context Reset (andere supplierId)
5. determineActiveLevel(): suppliersNode.defaultChild → "categories"
6. Sidebar: markiert "categories", enabled tree reset to supplier level
```

---

## **Migration Safety**

### **Rückwärts-Kompatibilität:**
- **Fallback**: System funktioniert auch ohne defaultChild (optional property)

### **Additive Changes:**
- **Neue Functions**: Ergänzen bestehende hierarchyUtils
- **Type Extensions**: RuntimeHierarchyItem extends HierarchyItem
- **Optional Features**: defaultChild ist optional, kein Breaking Change

### **Testing Strategy:**
- **Phase-by-Phase**: Jede Phase einzeln testen
- **Existing Routes**: Verify alle bestehenden URLs funktionieren
- **New Features**: Test defaultChild + Context Preservation
- **Edge Cases**: Level gaps, missing references, invalid URLs

---

## **Current Status: Phase-by-Phase Progress**

!!! IMPORTANT: At runtime (not config time), we always(!!!) use the RuntimeTree!
CHECK it this is true: IT MUST ALWAYS contain the complete structure of the config time tree.
=> convertToRuntimeTree must copy all props!

### **Phase 1: Type System Update ✅ COMPLETE**
- ✅ **HierarchySidebar.types.ts**: Generic types + createHierarchyNode helper fertig
- ✅ **RuntimeHierarchy types**: urlParamValue + level properties implementiert
- ✅ **Type-safe defaultChild**: Compile-time validation funktioniert

### **Phase 2: Static Configuration ✅ COMPLETE**
- ✅ **hierarchyConfig.ts**: Static configs mit createHierarchyNode implementiert
- ✅ **getAppHierarchies()**: Function returning HierarchyTree[] fertig
- ✅ **Supplier hierarchy**: Mit categories/addresses siblings + defaultChild definiert

### **Phase 3: NavigationState Integration ✅ COMPLETE**
- ✅ **navigationState.ts**: Complete rewrite mit RuntimeHierarchyTree consistency
- ✅ **selectNode() Logic**: Context Preservation vs Context Reset implementiert
- ✅ **Entity Selection vs Sidebar Navigation**: Unterscheidung durch optional urlParamValue

### **Phase 4: Transform Functions 🔶 NEEDS UPDATE**
- ✅ **hierarchyUtils.ts**: buildRuntimeHierarchy() basic implementation fertig
- ❌ **Missing**: updateTreeParameters() für parameter-only updates
- ❌ **Missing**: Parameter update logic statt complete rebuilds

### **Phase 5: +layout.ts Integration ❌ NOT STARTED**
- ❌ **Missing**: RuntimeHierarchyTree caching architecture: init runtime tree once, update it with the hierarchyUtils functions.
- ❌ **Missing**: getRuntimeHierarchies() mit cache management
- ❌ **Missing**: Integration mit NavigationState + buildNavigationPath
- ❌ **Missing**: determineActiveLevel() mit defaultChild resolution

### **Phase 6: UI Integration ❌ NOT STARTED**
- ❌ **Missing**: HierarchySidebar.svelte update für RuntimeHierarchyTree
- ❌ **Missing**: Layout.svelte handleSidebarNavigation update
- ❌ **Missing**: End-to-end navigation testing

---

## **Immediate Next Steps (Priority Order)**

### **1. Complete Phase 4: hierarchyUtils.ts**
```typescript
// Add to hierarchyUtils.ts:
export function updateTreeParameters(tree: RuntimeHierarchyTree, params): RuntimeHierarchyTree;
export function updateNodeParameters(node: RuntimeHierarchyTreeNode, params): void;
```

### **2. Implement Phase 5: +layout.ts**
```typescript
// New +layout.ts architecture:
const runtimeTreeCache = new Map<string, RuntimeHierarchyTree>();
function getRuntimeHierarchies(): RuntimeHierarchyTree[];
function updateHierarchyParameters(trees, urlParams): void;
```

### **3. Start Phase 6: UI Updates**
- Update HierarchySidebar component
- Update Layout.svelte navigation handlers
- End-to-end testing

---