// tools/scaffoldConfig.ts

const generatedRoot = "generated";

/**
 * Defines the root directories for scaffolding.
 * Change these values if you decide to restructure your project.
 */
export const scaffoldingConfig = {

  generatedRoot,
  
  /** The root directory for reusable page components. */
  pagesRoot: `${generatedRoot}/src/lib/pages`,

  /** The root directory for SvelteKit routes. */
  routesRoot: `${generatedRoot}/src/routes`,

  overwriteExisting: true,

  deleteGeneratedFolderBeforeGeneration: true
};

export interface PageConfig {
  /** The base directory within the root directories.
   * Example: 'categories' */
  baseDir: string;
  
  /** The full component name.
   * Example: 'CategoryDetailPage' */
  pageName: string;
  
  /** The dynamic parameter for the route.
   * Example: 'categoryId' */
  paramName: string;
}

/**
 * This is the single source of truth for all scaffoldable pages.
 * The key (e.g., 'categoryDetail') is the short name you'll use in the CLI.
 */
export const pages: Record<string, PageConfig> = {
  
  supplierList: {
    baseDir: 'suppliers',
    pageName: 'SupplierListPage',
    paramName: '', // No dynamic parameter for a list page
  },

  supplierDetail: {
    baseDir: 'suppliers',
    pageName: 'SupplierDetailPage',
    paramName: 'supplierId',
  },

  categoryDetail: {
    baseDir: 'categories',
    pageName: 'CategoryDetailPage',
    paramName: 'categoryId',
  },

  offerDetailAttributes: {
    baseDir: 'offerings',
    pageName: 'OfferDetailAttributesPage',
    paramName: 'offerId',
  },

  offerDetailLinks: {
    baseDir: 'offerings',
    pageName: 'OfferDetailLinksPage',
    paramName: 'offerId',
  }
};