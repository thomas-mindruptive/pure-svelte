import { createHierarchyNode, type HierarchyTree, type Hierarchy } from "$lib/components/sidebarAndNav/HierarchySidebar.types";
import { log } from "$lib/utils/logger";

// ================================================================================================
// SUPPLIER HIERARCHY CONFIGURATION
// ================================================================================================

/**
 * Static supplier hierarchy configuration
 * Uses createHierarchyNode for type-safe defaultChild validation
 *
 * Structure:
 * suppliers (defaultChild: categories)
 * ├── categories (defaultChild: offerings)
 * │   └── offerings (defaultChild: links)
 * │       ├── attributes (leaf)
 * │       └── links (leaf)
 * └── addresses (leaf)
 *
 * NOTE: "item.disabled will be set dynamically at runtime based on context"
 */
// prettier-ignore
export const supplierHierarchyConfig: HierarchyTree = {
  name: "suppliers",
  rootItem: createHierarchyNode({
    // urlParamName is needed for url param extraction.
    item: { key: "suppliers", href: "/suppliers", label: "Suppliers", disabled: false, urlParamName: "supplierId" },
    defaultChild: "categories", // Type-safe: must be a child key
    children: [
      // Categories branch
      createHierarchyNode({
        item: { key: "categories", href: "/suppliers/[supplierId]", label: "Categories", disabled: false, urlParamName: "categoryId" },
        defaultChild: "offerings", // Type-safe: must be a child key
        children: [
          createHierarchyNode({
            item: {key: "offerings", href: "/suppliers/[supplierId]/categories/[categoryId]", label: "Offerings", disabled: false, urlParamName: "offeringId" },
            defaultChild: "links", // Type-safe: must be a child key
            children: [
              createHierarchyNode({
                item: { key: "attributes", href:"/suppliers/[supplierId]/categories/[categoryId]/offerings/[offeringId]/attributes", label: "Attributes", disabled: false, urlParamName: "leaf" },
              }),
              createHierarchyNode({
                item: { key: "links", href:"/suppliers/[supplierId]/categories/[categoryId]/offerings/[offeringId]/links", label: "Links", disabled: false, urlParamName: "leaf" },
              }),
            ],
          }),
        ],
      }),
      // Only for demo purposes: Addresses branch (sibling to categories)
      createHierarchyNode({
        item: {
          key: "addresses", label: "Addresses", disabled: false, urlParamName: "addressId"},
      }),
    ],
  }),
};

// prettier-ignore
export const productCategoriesHierarchyConfig: HierarchyTree = {
  name: "categories",
  rootItem: createHierarchyNode({
    // urlParamName is needed for url param extraction.
    item: { key: "categories", href: "/categories", label: "Product Categories", disabled: false, urlParamName: "categoryId" },
    defaultChild: "productDefinitions", // Type-safe: must be a child key
    children: [
      // Categories branch
      createHierarchyNode({
        item: { key: "productDefinitions", href: "/categories/[categoryId]", label: "Product Definitions", disabled: false, urlParamName: "productDefId" },
        defaultChild: "offerings", // Type-safe: must be a child key
        children: [
          createHierarchyNode({
            item: {key: "offerings", href: "/categories/[categoryId]/productDefinitions/[productDefId]", label: "Offerings", disabled: false, urlParamName: "offeringId" },
            defaultChild: "links", // Type-safe: must be a child key
            children: [
              createHierarchyNode({
                item: { key: "attributes", href:"/categories/[categoryId]/productDefinitions/[productDefId]/offerings/[offeringId]/attributes", label: "Attributes", disabled: false, urlParamName: "leaf" },
              }),
              createHierarchyNode({
                item: { key: "links", href:"/categories/[categoryId]/productDefinitions/[productDefId]/offerings/[offeringId]/links", label: "Links", disabled: false, urlParamName: "leaf" },
              }),
            ],
          }),
        ],
      }),
    ],
  }),
};


// ================================================================================================
// FUTURE HIERARCHIES
// ================================================================================================

/**
 * Example: Product hierarchy configuration (for future expansion)
 * Commented out as it's not implemented yet
 */
/*
export const productHierarchyConfig: HierarchyTree = {
  name: "products",
  rootItem: createHierarchyNode({
    item: {
      key: "products",
      label: "Products",
      disabled: false,
      urlParamName: "productId",
    },
    defaultChild: "variants",
    children: [
      createHierarchyNode({
        item: {
          key: "variants",
          label: "Variants",
          disabled: false,
          urlParamName: "variantId",
        },
        defaultChild: "specifications",
        children: [
          createHierarchyNode({
            item: {
              key: "specifications",
              label: "Specifications",
              disabled: false,
              urlParamName: "leaf",
            },
          }),
        ],
      }),
    ],
  }),
};
*/

// ================================================================================================
// MAIN EXPORT FUNCTIONS
// ================================================================================================

/**
 * Returns all available static hierarchy configurations for the application
 * This is the main entry point for getting hierarchy definitions
 *
 * @returns Array of static HierarchyTree configurations
 */
export function getAppHierarchies(): Hierarchy {
  return [
    supplierHierarchyConfig,
    productCategoriesHierarchyConfig
    // Add more hierarchies here as they're implemented:
    // productHierarchyConfig,
    // settingsHierarchyConfig,
  ];
}

/**
 * Gets a specific hierarchy by name
 * Useful for targeted hierarchy access
 *
 * @param name The name of the hierarchy to retrieve
 * @returns The hierarchy tree or undefined if not found
 */
export function getHierarchyByName(name: string): HierarchyTree | undefined {
  const hierarchies = getAppHierarchies();
  return hierarchies.find((tree) => tree.name === name);
}

/**
 * Validates that all hierarchies have unique names
 * Called during development to ensure no naming conflicts
 *
 * @returns true if all names are unique, throws error otherwise
 */
export function validateHierarchyNames(): boolean {
  const hierarchies = getAppHierarchies();
  const names = hierarchies.map((tree) => tree.name);
  const uniqueNames = new Set(names);

  if (names.length !== uniqueNames.size) {
    const duplicates = names.filter((name, index) => names.indexOf(name) !== index);
    throw new Error(`Duplicate hierarchy names found: ${duplicates.join(", ")}`);
  }

  return true;
}

// ================================================================================================
// DEVELOPMENT VALIDATION
// ================================================================================================

// Validate hierarchy names during development
if (import.meta.env.DEV) {
  try {
    validateHierarchyNames();
    log.info("✅ Hierarchy configuration validation passed");
  } catch (error) {
    log.error("❌ Hierarchy configuration validation failed:", error);
  }
}

// ================================================================================================
// TYPE VALIDATION EXAMPLES
// ================================================================================================

/*
// These examples demonstrate the type safety of defaultChild
// Uncomment to test TypeScript validation

// ✅ VALID: defaultChild references existing child
const validExample = createHierarchyNode({
  item: { key: "test", label: "Test", urlParamName: "testId" },
  defaultChild: "validChild", // This will be valid if "validChild" is in children
  children: [
    createHierarchyNode({
      item: { key: "validChild", label: "Valid Child", urlParamName: "leaf" }
    })
  ]
});

// ❌ INVALID: defaultChild references non-existent child
const invalidExample = createHierarchyNode({
  item: { key: "test", label: "Test", urlParamName: "testId" },
  defaultChild: "nonExistentChild", // TypeScript error: not in children
  children: [
    createHierarchyNode({
      item: { key: "validChild", label: "Valid Child", urlParamName: "leaf" }
    })
  ]
});
*/
