import type { HierarchyTree, HierarchyTreeNode, Hierarchy } from "$lib/components/sidebarAndNav/HierarchySidebar.types";

// === LEVEL INITIALIZATION UTILITY =============================================================

/**
 * Recursively sets the level property on all nodes in a hierarchy tree
 * This ensures that each node has the correct level for the NavigationState logic
 *
 * Level meanings:
 * - Level 0: Root node (e.g., "suppliers")
 * - Level 1: First child level (e.g., "categories")
 * - Level 2: Second child level (e.g., "offerings")
 * - Level 3+: Deeper child levels (e.g., "attributes", "links")
 *
 * @param tree The hierarchy tree to process
 * @returns The same tree with levels properly set on all nodes
 */
export function initLevels(tree: HierarchyTree): HierarchyTree {
  /**
   * Recursively sets levels starting from the given node
   *
   * @param node The current node to set level for
   * @param level The level to assign to this node
   */
  function setNodeLevels(node: HierarchyTreeNode, level: number): void {
    // Set the level on this node's item
    node.item.level = level;

    // Recursively set levels on all children (if any)
    if (node.items && node.items.length > 0) {
      for (const childNode of node.items) {
        setNodeLevels(childNode, level + 1);
      }
    }
  }

  // Start setting levels from the root node at level 0
  setNodeLevels(tree.rootItem, 0);

  return tree;
}

// === HIERARCHY DEFINITIONS ====================================================================

/**
 * Supplier hierarchy tree definition
 * Defines the navigation structure for supplier-related pages
 *
 * Structure:
 * Suppliers (level 0)
 *   └── Categories (level 1)
 *       └── Offerings (level 2)
 *           ├── Attributes (level 3)
 *           └── Links (level 3)
 *
 * Note: The level properties will be set automatically by initLevels()
 * Note: disabled and href properties are set based on current navigation context in +layout.ts
 */
export const supplierHierarchyTemplate: HierarchyTree = {
  name: "suppliers",
  rootItem: {
    item: {
      key: "suppliers",
      label: "Suppliers",
      disabled: false,
      level: undefined, // Will be set by initLevels()
      href: "/suppliers",
    },
    items: [
      {
        item: {
          key: "categories",
          label: "Categories",
          disabled: false, // Will be updated based on context
          level: undefined, // Will be set by initLevels()
          href: "#", // Will be updated based on context
        },
        items: [
          {
            item: {
              key: "offerings",
              label: "Offerings",
              disabled: false, // Will be updated based on context
              level: undefined, // Will be set by initLevels()
              href: "#", // Will be updated based on context
            },
            items: [
              {
                item: {
                  key: "attributes",
                  label: "Attributes",
                  disabled: false, // Will be updated based on context
                  level: undefined, // Will be set by initLevels()
                  href: "#", // Will be updated based on context
                },
              },
              {
                item: {
                  key: "links",
                  label: "Links",
                  disabled: false, // Will be updated based on context
                  level: undefined, // Will be set by initLevels()
                  href: "#", // Will be updated based on context
                },
              },
            ],
          },
        ],
      },
    ],
  },
};

// === HIERARCHY BUILDER ========================================================================

/**
 * Creates the supplier hierarchy with proper context-sensitive properties
 * This function builds the hierarchy tree with the correct disabled states and hrefs
 * based on the current navigation path
 *
 * @param finalUiPath The current navigation path containing IDs for supplier, category, offering
 * @returns Complete hierarchy tree ready for use
 */
export function buildSupplierHierarchy(finalUiPath: {
  supplierId: number | null;
  categoryId: number | null;
  offeringId: number | null;
}): HierarchyTree {
  // Build the dynamic paths based on current navigation context
  const supplierPath = finalUiPath.supplierId ? `/suppliers/${finalUiPath.supplierId}` : "#";
  const categoryPath =
    finalUiPath.supplierId && finalUiPath.categoryId ? `/suppliers/${finalUiPath.supplierId}/categories/${finalUiPath.categoryId}` : "#";
  const offeringPathBase =
    finalUiPath.supplierId && finalUiPath.categoryId && finalUiPath.offeringId
      ? `/suppliers/${finalUiPath.supplierId}/categories/${finalUiPath.categoryId}/offerings/${finalUiPath.offeringId}`
      : "#";

  // Create the hierarchy with context-sensitive properties
  const supplierHierarchy: HierarchyTree = {
    name: "suppliers",
    rootItem: {
      item: {
        key: "suppliers",
        label: "Suppliers",
        disabled: false,
        level: undefined, // Will be set by initLevels()
        href: "/suppliers",
      },
      items: [
        {
          item: {
            key: "categories",
            label: "Categories",
            disabled: !finalUiPath.supplierId, // Disabled if no supplier selected
            level: undefined, // Will be set by initLevels()
            href: supplierPath,
          },
          items: [
            {
              item: {
                key: "offerings",
                label: "Offerings",
                disabled: !finalUiPath.categoryId, // Disabled if no category selected
                level: undefined, // Will be set by initLevels()
                href: categoryPath,
              },
              items: [
                {
                  item: {
                    key: "attributes",
                    label: "Attributes",
                    disabled: !finalUiPath.offeringId, // Disabled if no offering selected
                    level: undefined, // Will be set by initLevels()
                    href: offeringPathBase === "#" ? "#" : `${offeringPathBase}/attributes`,
                  },
                },
                {
                  item: {
                    key: "links",
                    label: "Links",
                    disabled: !finalUiPath.offeringId, // Disabled if no offering selected
                    level: undefined, // Will be set by initLevels()
                    href: offeringPathBase === "#" ? "#" : `${offeringPathBase}/links`,
                  },
                },
              ],
            },
          ],
        },
      ],
    },
  };

  // Initialize levels before returning
  return initLevels(supplierHierarchy);
}

// === EXPORTED HIERARCHY =======================================================================

/**
 * Main hierarchy array containing all available trees
 * Currently only contains the supplier hierarchy, but can be extended
 *
 * To add more trees:
 * 1. Create a new tree definition (like supplierHierarchyTemplate)
 * 2. Create a builder function (like buildSupplierHierarchy)
 * 3. Add the built tree to this array in +layout.ts
 *
 * Example future trees:
 * - Product categories hierarchy
 * - Settings/configuration hierarchy
 * - User management hierarchy
 */
export function buildHierarchy(finalUiPath: {
  supplierId: number | null;
  categoryId: number | null;
  offeringId: number | null;
}): Hierarchy {
  return [
    buildSupplierHierarchy(finalUiPath),
    // Add more trees here in the future:
    // buildProductHierarchy(productPath),
    // buildSettingsHierarchy(settingsPath)
  ];
}
