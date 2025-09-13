// File: src/lib/components/sidebarAndNav/hierarchyUtils.test.mock.ts

import type { RuntimeHierarchyTree } from './HierarchySidebar.types';

// ================================================================================================
// MOCK HIERARCHY DATA
// ================================================================================================

/**
 * A comprehensive, valid mock tree for testing successful path resolutions.
 * It is 5 levels deep and includes parallel sibling branches.
 * - suppliers (L0) -> supplier (L1)
 *   - categories (L2) -> category (L3)
 *     - offerings (L4) -> offering (L5)
 *       - variants (L6) -> variant (L7)
 *         - attributes (L8)
 *       - links (L6)
 *   - addresses (L2)
 */
export const validMockTree: RuntimeHierarchyTree = {
	name: 'suppliers',
	rootItem: {
		item: { key: 'suppliers', type: 'list', label: 'Suppliers', display: true, level: 0, urlParamValue: 'leaf' },
		children: [
			{
				item: { key: 'supplier', type: 'object', label: 'Supplier', display: false, level: 1, urlParamName: 'supplierId', urlParamValue: 'leaf' },
				defaultChild: 'categories',
				children: [
					{
						item: { key: 'categories', type: 'list', label: 'Categories', display: true, level: 2, urlParamValue: 'leaf' },
						children: [
							{
								item: { key: 'category', type: 'object', label: 'Category', display: false, level: 3, urlParamName: 'categoryId', urlParamValue: 'leaf' },
								defaultChild: 'offerings',
								children: [
									{
										item: { key: 'offerings', type: 'list', label: 'Offerings', display: true, level: 4, urlParamValue: 'leaf' },
										children: [
											{
												item: { key: 'offering', type: 'object', label: 'Offering', display: false, level: 5, urlParamName: 'offeringId', urlParamValue: 'leaf' },
												defaultChild: 'variants',
												children: [
													{
														item: { key: 'variants', type: 'list', label: 'Variants', display: true, level: 6, urlParamValue: 'leaf' },
														children: [
															{
																item: { key: 'variant', type: 'object', label: 'Variant', display: false, level: 7, urlParamName: 'variantId', urlParamValue: 'leaf' },
																defaultChild: 'attributes',
																children: [
																	{
																		item: { key: 'attributes', type: 'list', label: 'Attributes', display: true, level: 8, urlParamValue: 'leaf' },
																		children: []
																	}
																]
															}
														]
													},
													// Parallel sibling to 'variants'
													{
														item: { key: 'links', type: 'list', label: 'Links', display: true, level: 6, urlParamValue: 'leaf' },
														children: []
													}
												]
											}
										]
									}
								]
							}
						]
					},
					// Parallel sibling to 'categories'
					{
						item: { key: 'addresses', type: 'list', label: 'Addresses', display: true, level: 2, urlParamValue: 'leaf' },
						// This node is a leaf-like list; it has no `object` child.
						children: []
					}
				]
			}
		]
	}
};


/**
 * A second mock tree with an intentionally "broken" or limited structure.
 * This is used to test that our path validation correctly throws errors for
 * invalid URLs. The `addresses` node here is specifically designed to not
 * accept a numeric ID.
 */
export const invalidPathTestTree: RuntimeHierarchyTree = {
	name: 'customers',
	rootItem: {
		item: { key: 'customers', type: 'list', label: 'Customers', display: true, level: 0, urlParamValue: 'leaf' },
		children: [
			{
				item: { key: 'customer', type: 'object', label: 'Customer', display: false, level: 1, urlParamName: 'customerId', urlParamValue: 'leaf' },
				children: [
					{
						item: { key: 'orders', type: 'list', label: 'Orders', display: true, level: 2, urlParamValue: 'leaf' },
						children: [] // No children, cannot go deeper
					},
					// This node has no 'object' child, so a path like /customers/1/invoices/5 should fail.
					{
						item: { key: 'invoices', type: 'list', label: 'Invoices', display: true, level: 2, urlParamValue: 'leaf' },
						children: []
					}
				]
			}
		]
	}
};