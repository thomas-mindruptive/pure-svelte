import { createHierarchyNode, type HierarchyTree, type Hierarchy } from "$lib/components/sidebarAndNav/HierarchySidebar.types";
import { validateHierarchiesAsTree } from "$lib/components/sidebarAndNav/hierarchyUtils";
import { log } from "$lib/utils/logger";
import { error } from "@sveltejs/kit";

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
  rootItem:
    // Supplier List - Visible root. No urlParamName.
    createHierarchyNode({
      item: { key: "suppliers", type: "list", href: "/suppliers", label: "Suppliers" },
      children: [
        // Supplier Object - Hidden, represents the selected supplier. Has urlParamName.
        createHierarchyNode({
          item: { key: "supplier", type: "object", href: "/suppliers/[supplierId]", label: "Supplier", display: false, urlParamName: "supplierId" },
          defaultChild: "categories",
          children: [
            // Category List - Visible categories list. Displayed on SupplierDetailPage.
            createHierarchyNode({
              item: { key: "categories", type: "list", href: "/suppliers/[supplierId]/categories", label: "Categories", urlParamName: "supplierId" },
              children: [
                // Category Object - Hidden, represents the selected category. Has urlParamName.
                createHierarchyNode({
                  item: { key: "category", type: "object", href: "/suppliers/[supplierId]/categories/[categoryId]", label: "Category", display: false, urlParamName: "categoryId" },
                  defaultChild: "offerings",
                  children: [
                    // Offering List - Visible offerings list. Displayed on CategoryDetailPage.
                    createHierarchyNode({
                      item: { key: "offerings", type: "list", href: "/suppliers/[supplierId]/categories/[categoryId]/offerings", label: "Offerings", urlParamName: "offeringId" },
                      children: [
                        // Offering Object - Hidden, represents the selected offering. Has urlParamName.
                        createHierarchyNode({
                          item: { key: "offering", type: "object", href: "/suppliers/[supplierId]/categories/[categoryId]/offerings/[offeringId]", label: "Offering", display: false, urlParamName: "offeringId" },
                          defaultChild: "links",
                          children: [
                            // Attribute List - Leaf node for offering attributes.
                            createHierarchyNode({
                              item: { key: "attributes", type: "list", href:"/suppliers/[supplierId]/categories/[categoryId]/offerings/[offeringId]/attributes", label: "Attributes" },
                            }),
                            // Link List - Leaf node for offering links.
                            createHierarchyNode({
                              item: { key: "links", type: "list", href:"/suppliers/[supplierId]/categories/[categoryId]/offerings/[offeringId]/links", label: "Links" },
                            }),
                            // Images List - Visible images list for offering.
                            createHierarchyNode({
                              item: { key: "offeringimages", type: "list", href:"/suppliers/[supplierId]/categories/[categoryId]/offerings/[offeringId]/images", label: "Images" },
                              children: [
                                // Image Object - Hidden, represents the selected image. Has urlParamName.
                                createHierarchyNode({
                                  item: { key: "offeringimage", type: "object", href: "/suppliers/[supplierId]/categories/[categoryId]/offerings/[offeringId]/images/[imageId]", label: "Image", display: false, urlParamName: "imageId" },
                                  children: []
                                }),
                              ]
                            }),
                            // Source Offerings List - Leaf node for shop offering sources.
                            createHierarchyNode({
                              item: { key: "source-offerings", type: "list", href:"/suppliers/[supplierId]/categories/[categoryId]/offerings/[offeringId]/source-offerings", label: "Source Offerings" },
                            }),
                          ]
                        })
                      ]
                    })
                  ]
                })
              ]
            }),
            // Order List - Visible orders list under supplier.
            createHierarchyNode({
              item: { key: "orders", type: "list", href: "/suppliers/[supplierId]/orders", label: "Orders", urlParamName: "supplierId" },
              children: [
                // Order Object - Hidden, represents the selected order. Has urlParamName.
                createHierarchyNode({
                  item: { key: "order", type: "object", href: "/suppliers/[supplierId]/orders/[orderId]", label: "Order", display: false, urlParamName: "orderId" },
                  defaultChild: "orderitems",
                  children: [
                    // OrderItem List - Visible order items list. Displayed on OrderDetailPage.
                    createHierarchyNode({
                      item: { key: "orderitems", type: "list", href: "/suppliers/[supplierId]/orders/[orderId]/orderitems", label: "Order Items", urlParamName: "orderId" },
                      children: [
                        // OrderItem Object - Hidden, represents the selected order item. Has urlParamName.
                        createHierarchyNode({
                          item: { key: "orderItemId", type: "object", href: "/suppliers/[supplierId]/orders/[orderId]/orderitems/[orderItemId]", label: "Order Item", display: false, urlParamName: "orderItemId" },
                          children: []
                        }),
                      ]
                    }),
                  ]
                })
              ]
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
  rootItem:
    // Category List - Visible root. No urlParamName.
    createHierarchyNode({
      item: { key: "categories", type: "list", href: "/categories", label: "Product Categories" },
      children: [
        // Category Object - Hidden, represents the selected category. Has urlParamName.
        createHierarchyNode({
          item: { key: "category", type: "object", href: "/categories/[categoryId]", label: "Category", display: false, urlParamName: "categoryId" },
          defaultChild: "productdefinitions",
          children: [
            // ProductDef List - Visible product definitions list. Displayed on CategoryDetailPage.
            createHierarchyNode({
              item: { key: "productdefinitions", type: "list", href: "/categories/[categoryId]/productdefinitions", label: "Product Definitions", urlParamName: "categoryId" },
              children: [
                // ProductDef Object - Hidden, represents the selected product definition. Has urlParamName.
                createHierarchyNode({
                  item: { key: "productDefinition", type: "object", href: "/categories/[categoryId]/productdefinitions/[productDefId]", label: "Product Definition", display: false, urlParamName: "productDefId" },
                  defaultChild: "offerings",
                  children: [
                    // Images List - Visible images list for product definition.
                    createHierarchyNode({
                      item: { key: "productimages", type: "list", href: "/categories/[categoryId]/productdefinitions/[productDefId]/images", label: "Images" },
                      children: [
                        // Image Object - Hidden, represents the selected image. Has urlParamName.
                        createHierarchyNode({
                          item: { key: "productimage", type: "object", href: "/categories/[categoryId]/productdefinitions/[productDefId]/images/[imageId]", label: "Image", display: false, urlParamName: "imageId" },
                          children: []
                        }),
                      ]
                    }),
                    // Offering List - Visible offerings list for product definition.
                    createHierarchyNode({
                      item: { key: "offerings", type: "list", href: "/categories/[categoryId]/productdefinitions/[productDefId]/offerings", label: "Offerings", urlParamName: "offeringId" },
                      children: [
                        // Offering Object - Hidden, represents the selected offering. Has urlParamName.
                        createHierarchyNode({
                          item: { key: "offering", type: "object", href: "/categories/[categoryId]/productdefinitions/[productDefId]/offerings/[offeringId]", label: "Offering", display: false, urlParamName: "offeringId" },
                          defaultChild: "links",
                          children: [
                            // Attribute List - Leaf node for offering attributes.
                            createHierarchyNode({
                              item: { key: "attributes", type: "list", href:"/categories/[categoryId]/productdefinitions/[productDefId]/offerings/[offeringId]/attributes", label: "Attributes" },
                            }),
                            // Link List - Leaf node for offering links.
                            createHierarchyNode({
                              item: { key: "links", type: "list", href:"/categories/[categoryId]/productdefinitions/[productDefId]/offerings/[offeringId]/links", label: "Links" },
                            }),
                            // Images List - Visible images list for offering.
                            createHierarchyNode({
                              item: { key: "offeringimages", type: "list", href:"/categories/[categoryId]/productdefinitions/[productDefId]/offerings/[offeringId]/images", label: "Images" },
                              children: [
                                // Image Object - Hidden, represents the selected image. Has urlParamName.
                                createHierarchyNode({
                                  item: { key: "offering-image", type: "object", href: "/categories/[categoryId]/productdefinitions/[productDefId]/offerings/[offeringId]/images/[imageId]", label: "Image", display: false, urlParamName: "imageId" },
                                  children: []
                                }),
                              ]
                            }),
                            // Source Offerings List - Leaf node for shop offering sources.
                            createHierarchyNode({
                              item: { key: "source-offerings", type: "list", href:"/categories/[categoryId]/productdefinitions/[productDefId]/offerings/[offeringId]/source-offerings", label: "Source Offerings" },
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
 * Navigation hierarchy for global Attributes master data.
 */
// prettier-ignore
export const attributesHierarchyConfig: HierarchyTree = {
  name: "attributes",
  rootItem:
    // Attribute List - Visible root. No urlParamName.
    createHierarchyNode({
      item: { key: "attributes", type: "list", href: "/attributes", label: "Attributes" },
      children: [
        // Attribute Object - Hidden, represents the selected attribute. Has urlParamName.
        createHierarchyNode({
          item: { key: "attribute", type: "object", href: "/attributes/[attributeId]", label: "Attribute", display: false, urlParamName: "attributeId" },
          children: []
        }),
      ],
    }),
};

/**
 * Navigation hierarchy for global Orders master data.
 */
// prettier-ignore
export const ordersHierarchyConfig: HierarchyTree = {
  name: "orders",
  rootItem:
    // Order List - Visible root. No urlParamName.
    createHierarchyNode({
      item: { key: "orders", type: "list", href: "/orders", label: "Orders" },
      children: [
        // Order Object - Hidden, represents the selected order. Has urlParamName.
        createHierarchyNode({
          item: { key: "order", type: "object", href: "/orders/[orderId]", label: "Order", display: false, urlParamName: "orderId" },
          children: [
            // OrderItem List - Visible order items list. Displayed on OrderDetailPage.
            createHierarchyNode({
              item: { key: "orderitems", type: "list", href: "/orders/[orderId]/orderitems", label: "Order Items", urlParamName: "orderId" },
              children: [
                // OrderItem Object - Hidden, represents the selected order item. Has urlParamName.
                createHierarchyNode({
                  item: { key: "orderItemId", type: "object", href: "/orders/[orderId]/orderitems/[orderItemId]", label: "Order Item", display: false, urlParamName: "orderItemId" },
                  children: []
                }),
              ]
            }),
          ]
        }),
      ],
    }),
};

/**
 * Navigation hierarchy for global Attributes master data.
 */
// prettier-ignore
export const testHierarchyConfig: HierarchyTree = {
  name: "test",
  rootItem:
    createHierarchyNode({
      item: { key: "test", type: "list", href: "/test", label: "Test" },
      children: [
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
  return [supplierHierarchyConfig, productCategoriesHierarchyConfig, attributesHierarchyConfig, ordersHierarchyConfig, testHierarchyConfig];
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

function validateHierarchies(): boolean {
  const hierarchies = getAppHierarchies();
  const validationResult = validateHierarchiesAsTree(hierarchies);
  if (validationResult) {
    const msg = `The hierarchy config is invalid: ${JSON.stringify(validationResult, null, 2)}`
    throw error(500, msg);
  }
  return true;
}

validateHierarchies();
log.info("✅ Initial hierarchy configuration validation passed");