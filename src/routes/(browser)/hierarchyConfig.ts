import type { HierarchyTree, HierarchyTreeNode, Hierarchy } from "$lib/components/sidebarAndNav/HierarchySidebar.types";
import { initLevels, buildUrlFromNavigationPath } from "$lib/components/sidebarAndNav/hierarchyUtils";

// === SUPPLIER HIERARCHY BUILDER ===============================================================

/**
 * Creates the supplier hierarchy with proper context-sensitive properties
 * This function builds the hierarchy tree with the correct disabled states and hrefs
 * based on the current navigation path
 *
 * IMPORTANT: The 'key' properties in this hierarchy MUST match URL path segments exactly
 * for routing to work correctly. For example:
 * - key: "suppliers" → URL segment "/suppliers"
 * - key: "categories" → URL segment "/categories"
 * - key: "offerings" → URL segment "/offerings"
 *
 * @param finalUiPath The current navigation path containing IDs for supplier, category, offering
 * @returns Complete hierarchy tree ready for use with levels and hrefs set
 */
export function buildSupplierHierarchy(finalUiPath: {
  supplierId: number | null;
  categoryId: number | null;
  offeringId: number | null;
}): HierarchyTree {
  // Create the base hierarchy structure
  // Note: levels will be set by initLevels(), hrefs will be built dynamically

  // prettier-ignore
  const supplierHierarchy: HierarchyTree = {
    name: "suppliers",
    rootItem: {
      item: {
        key: "suppliers",                               // ⚠️ MUST match URL segment: /suppliers
        label: "Suppliers",
        disabled: false,
        level: undefined,                               // Will be set by initLevels()
        href: "/suppliers",                             // Static - always goes to suppliers list
        urlParamName: "supplierId",                     // ⚠️ Parameter name for IDs at this level - MUST match route url param name!
      },
      items: [
        {
          item: {
            key: "categories",                          // ⚠️ MUST match URL segment: /categories
            label: "Categories",
            disabled: !finalUiPath.supplierId,          // Disabled if no supplier selected
            level: undefined,                           // Will be set by initLevels()
            href: "#",                                  // Will be set dynamically below
            urlParamName: "categoryId",                 //  ⚠️Parameter name for IDs at this level - MUST match route url param name!
          },
          items: [
            {
              item: {
                key: "offerings",                        // ⚠️MUST match URL segment: /offerings
                label: "Offerings",
                disabled: !finalUiPath.categoryId,       // Disabled if no category selected
                level: undefined,                        // Will be set by initLevels()
                href: "#",                               // Will be set dynamically below
                urlParamName: "offeringId",              //  ⚠️Parameter name for IDs at this level - MUST match route url param name!
              },
              items: [
                {
                  item: {
                    key: "attributes",                   // MUST match URL segment: /attributes
                    label: "Attributes",
                    disabled: !finalUiPath.offeringId,   // Disabled if no offering selected
                    level: undefined,                    // Will be set by initLevels()
                    href: "#",                           // Will be set dynamically below
                    urlParamName: undefined,             // Leaf pages don't have IDs
                  },
                },
                {
                  item: {
                    key: "links",                       // MUST match URL segment: /links
                    label: "Links",
                    disabled: !finalUiPath.offeringId,  // Disabled if no offering selected
                    level: undefined,                   // Will be set by initLevels()
                    href: "#",                          // Will be set dynamically below
                    urlParamName: undefined,            // Leaf pages don't have IDs
                  },
                },
              ],
            },
          ],
        },
      ],
    },
  };

  // Initialize levels first so we can use them for href building
  const hierarchyWithLevels = initLevels(supplierHierarchy);

  // Now build hrefs for each node based on current context
  // We need to traverse the tree and set hrefs dynamically
  function setHrefsRecursively(node: HierarchyTreeNode, pathSoFar: HierarchyTreeNode[]): void {
    const currentPath = [...pathSoFar, node];

    // Build href for this node - it should link to this node's level
    // preserving context from higher levels
    // Level "0" is always without context
    if (node.item.level === 0) {
      node.item.href = `/${node.item.key}`; // /suppliers
    } else {
      node.item.href = buildUrlFromNavigationPath(currentPath, {
        supplierId: finalUiPath.supplierId,
        categoryId: finalUiPath.categoryId,
        offeringId: finalUiPath.offeringId,
      });
    }

    // Recursively set hrefs for children
    if (node.items) {
      for (const childNode of node.items) {
        setHrefsRecursively(childNode, currentPath);
      }
    }
  }

  // Set hrefs starting from root with empty path
  setHrefsRecursively(hierarchyWithLevels.rootItem, []);

  return hierarchyWithLevels;
}

// === MAIN HIERARCHY BUILDER ===================================================================

/**
 * Main function to build the complete hierarchy array
 * Currently only contains the supplier hierarchy, but designed to be extensible
 *
 * To add more trees:
 * 1. Create a new builder function (like buildSupplierHierarchy)
 * 2. Add it to the returned array
 *
 * @param finalUiPath The current navigation context for building context-sensitive properties
 * @returns Complete hierarchy array with all available trees
 *
 * @example
 * // Future expansion:
 * return [
 *   buildSupplierHierarchy(finalUiPath),
 *   buildProductHierarchy(productPath),
 *   buildSettingsHierarchy(settingsPath)
 * ];
 */
export function buildHierarchy(finalUiPath: {
  supplierId: number | null;
  categoryId: number | null;
  offeringId: number | null;
  leaf: string | null;
}): Hierarchy {
  return [
    buildSupplierHierarchy(finalUiPath),
    // Add more trees here in the future:
    // buildProductHierarchy(productPath),
    // buildSettingsHierarchy(settingsPath)
  ];
}

// === URL PARSING UTILITIES ====================================================================

/**
 * Parses a URL path and extracts parameters for the supplier hierarchy
 * This is the reverse operation of buildUrlFromNavigationPath
 *
 * @param urlPath The URL path to parse (e.g., "/suppliers/123/categories/456/offerings/789/attributes")
 * @returns Object containing the extracted parameters
 *
 * @example
 * parseSupplierUrl("/suppliers/123/categories/456/offerings/789/attributes")
 * // → { supplierId: 123, categoryId: 456, offeringId: 789, leaf: "attributes" }
 */
export function parseSupplierUrl(urlPath: string): {
  supplierId: number | null;
  categoryId: number | null;
  offeringId: number | null;
  leaf: "attributes" | "links" | null;
} {
  const segments = urlPath.split("/").filter((segment) => segment.length > 0);

  const result = {
    supplierId: null as number | null,
    categoryId: null as number | null,
    offeringId: null as number | null,
    leaf: null as "attributes" | "links" | null,
  };

  // Parse segments in expected order: suppliers, {id}, categories, {id}, offerings, {id}, {leaf}
  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i];

    if (segment === "suppliers" && i + 1 < segments.length) {
      const idStr = segments[i + 1];
      const id = parseInt(idStr, 10);
      if (!isNaN(id)) {
        result.supplierId = id;
        i++; // Skip the ID segment
      }
    } else if (segment === "categories" && i + 1 < segments.length) {
      const idStr = segments[i + 1];
      const id = parseInt(idStr, 10);
      if (!isNaN(id)) {
        result.categoryId = id;
        i++; // Skip the ID segment
      }
    } else if (segment === "offerings" && i + 1 < segments.length) {
      const idStr = segments[i + 1];
      const id = parseInt(idStr, 10);
      if (!isNaN(id)) {
        result.offeringId = id;
        i++; // Skip the ID segment
      }
    } else if (segment === "attributes" || segment === "links") {
      result.leaf = segment;
    }
  }

  return result;
}
