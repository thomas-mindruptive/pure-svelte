import { createHierarchyNode, type HierarchyTree, type Hierarchy } from "$lib/components/sidebarAndNav/HierarchySidebar.types";
import { log } from "$lib/utils/logger";

// ================================================================================================
// SUPPLIER HIERARCHY CONFIGURATION (NEW DATA-DRIVEN STRUCTURE)
// ================================================================================================

/**
 * Defines the navigation hierarchy for Suppliers using an explicit List/Object pattern.
 * - "List" nodes are visible and represent collections. They do not have a urlParamName.
 * - "Object" nodes are hidden (`display: false`) and represent a single selected entity.
 *   They hold the urlParamName for context building.
 */
// prettier-ignore
export const supplierHierarchyConfig: HierarchyTree = {
  name: "suppliers",
  rootItem: createHierarchyNode({
    // LEVEL 0 (List) - Visible root. No urlParamName.
    item: { key: "suppliers", type: "list", href: "/suppliers", label: "Suppliers" },
    children: [
      createHierarchyNode({
        // LEVEL 1 (Object) - Hidden, represents the selected supplier. Has urlParamName.
        item: { key: "supplier", type: "object", href: "/suppliers/[supplierId]", label: "Supplier", display: false, urlParamName: "supplierId" },
        defaultChild: "categories",
        children: [
          createHierarchyNode({
            // LEVEL 2 (List) - In our case, the categories list is already displayed on the SupplierDetailPage
            // =>  href: "/suppliers/[supplierId]"
            item: { key: "categories", type: "list", href: "/suppliers/[supplierId]", label: "Categories", urlParamName: "supplierId" },
            children: [
              createHierarchyNode({
                // LEVEL 3 (Object) - Hidden, represents the selected category. Has urlParamName.
                item: { key: "category", type: "object", href: "/suppliers/[supplierId]/categories/[categoryId]", label: "Category", display: false, urlParamName: "categoryId" },
                defaultChild: "offerings",
                children: [
                  createHierarchyNode({
                    // LEVEL 4 (List) - Visible offerings list. 
                    // In our case, the offerings list is already displayed on the CategoryDetailPage.
                    // => gref points there
                    item: { key: "offerings", type: "list", href: "/suppliers/[supplierId]/categories/[categoryId]", label: "Offerings", urlParamName: "offeringId" },
                    children: [
                      createHierarchyNode({
                        // LEVEL 5 (Object) - Hidden, represents the selected offering. Has urlParamName.
                        item: { key: "offering", type: "object", href: "/suppliers/[supplierId]/categories/[categoryId]/offerings/[offeringId]", label: "Offering", display: false, urlParamName: "offeringId" },
                        defaultChild: "links",
                        children: [
                           createHierarchyNode({
                            // LEVEL 6 (Leaf)
                            item: { key: "attributes", type: "list", href:"/suppliers/[supplierId]/categories/[categoryId]/offerings/[offeringId]/attributes", label: "Attributes" },
                          }),
                          createHierarchyNode({
                            // LEVEL 6 (Leaf)
                            item: { key: "links", type: "list", href:"/suppliers/[supplierId]/categories/[categoryId]/offerings/[offeringId]/links", label: "Links" },
                          }),
                        ]
                      })
                    ]
                  })
                ]
              })
            ]
          }),
           // Sibling branch for addresses, just for demo purposes.
           createHierarchyNode({
            item: {
              key: "addresses",  type: "list", href:"/suppliers/[supplierId]/addresses", label: "Addresses", urlParamName: "addressId"}, // This is a leaf-like node, so urlParamName is okay here.
          }),
        ]
      })
    ]
  }),
};

// ================================================================================================
// PRODUCT CATEGORIES HIERARCHY CONFIGURATION (NEW DATA-DRIVEN STRUCTURE)
// ================================================================================================

/**
 * Defines the navigation hierarchy for global Product Categories using the same List/Object pattern.
 */
// prettier-ignore
export const productCategoriesHierarchyConfig: HierarchyTree = {
  name: "categories",
  rootItem: createHierarchyNode({
    // LEVEL 0 (List) - Visible root. No urlParamName.
    item: { key: "categories", type: "list", href: "/categories", label: "Product Categories" },
    children: [
      createHierarchyNode({
        // LEVEL 1 (Object) - Hidden, represents the selected category. Has urlParamName.
        item: { key: "category", type: "object", href: "/categories/[categoryId]", label: "Category", display: false, urlParamName: "categoryId" },
        defaultChild: "productdefinitions",
        children: [
          createHierarchyNode({
            // LEVEL 2 (List) - Visible product definitions list.
            // The CategoryDetailPage contains a list of productdefinitions => href = "/categories/[categoryId]/"
            item: { key: "productdefinitions", type: "list", href: "/categories/[categoryId]/", label: "Product Definitions", urlParamName: "categoryId" },
            children: [
                createHierarchyNode({
                item: { key: "productDefintition", type: "object", href: "/categories/[categoryId]/productdefinitions/[productDefId]", label: "Product Definition", display: false, urlParamName: "productDefId" },
                children: [
                  createHierarchyNode({
                    item: { key: "offerings", type: "list", href: "/categories/[categoryId]/productdefinitions/[productDefId]", label: "Offerings", urlParamName: "offeringId" },
                    children: [
                      createHierarchyNode({
                        item: { key: "offering", type: "object", href: "/categories/[categoryId]/productdefinitions/[productDefId]/offerings/[offeringId]", label: "Offering", display: false, urlParamName: "offeringId" },
                        defaultChild: "links",
                        children: [
                          createHierarchyNode({
                            // Leaf
                            item: { key: "attributes", type: "list", href:"/categories/[categoryId]/productdefinitions/[productDefId]/offerings/[offeringId]/attributes", label: "Attributes" },
                          }),
                          createHierarchyNode({
                            // Leaf
                            item: { key: "links", type: "list", href:"/categories/[categoryId]/productdefinitions/[productDefId]/offerings/[offeringId]/links", label: "Links" },
                          }),
                        ]
                      })
                    ]
                  })
                ]
              }),
            ],
          }),
        ],
      }),
    ],
  }),
};

/**
 * Defines the navigation hierarchy for global Attributes master data.
 */
// prettier-ignore
export const attributesHierarchyConfig: HierarchyTree = {
  name: "attributes",
  rootItem: createHierarchyNode({
    // LEVEL 0 (List) - The visible root of the hierarchy
    item: { key: "attributes", type: "list", href: "/attributes", label: "Attributes" },
    children: [
      createHierarchyNode({
        // LEVEL 1 (Object) - Hidden node representing a single selected attribute
        item: { key: "attribute", type: "object", href: "/attributes/[attributeId]", label: "Attribute", display: false, urlParamName: "attributeId" },
        // This is the end of this navigation branch, so no children are needed.
        children: []
      }),
    ],
  }),
};

// ================================================================================================
// MAIN EXPORT FUNCTIONS
// ================================================================================================

/**
 * Returns all available static hierarchy configurations for the application.
 * This is the main entry point for getting hierarchy definitions.
 */
export function getAppHierarchies(): Hierarchy {
  return [supplierHierarchyConfig, productCategoriesHierarchyConfig, attributesHierarchyConfig];
}

/**
 * Gets a specific hierarchy by name.
 * Useful for targeted hierarchy access.
 */
export function getHierarchyByName(name: string): HierarchyTree | undefined {
  const hierarchies = getAppHierarchies();
  return hierarchies.find((tree) => tree.name === name);
}

// ================================================================================================
// DEVELOPMENT VALIDATION (Unchanged)
// ================================================================================================

function validateHierarchyNames(): boolean {
  const hierarchies = getAppHierarchies();
  const names = hierarchies.map((tree) => tree.name);
  const uniqueNames = new Set(names);

  if (names.length !== uniqueNames.size) {
    const duplicates = names.filter((name, index) => names.indexOf(name) !== index);
    throw new Error(`Duplicate hierarchy names found: ${duplicates.join(", ")}`);
  }
  return true;
}

if (import.meta.env.DEV) {
  try {
    validateHierarchyNames();
    log.info("✅ Hierarchy configuration validation passed");
  } catch (error) {
    log.error("❌ Hierarchy configuration validation failed:", error);
  }
}
