// src/routes/suppliers/+page.ts

/**
 * Route Delegator (Logic)
 *
 * This file adheres to the Page Delegation Pattern.
 * Its only purpose is to import and re-export the `load` function
 * from the actual page logic module.
 */
export { load } from '$lib/pages/suppliers/supplierListPage';