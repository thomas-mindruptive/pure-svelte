const generatedRoot = "scaffolding-generated";

export const scaffoldingConfig = {
  generatedRoot: generatedRoot,
  pagesRoot: `${generatedRoot}/src/lib/pages`,
  routesRoot: `${generatedRoot}/src/routes`,
  overwriteExisting: true,
  deleteGeneratedFolderBeforeGeneration: true
};

// Die innere Konfiguration braucht jetzt kein `baseDir` mehr.
export interface PageDefinition {
  pageName: string;
  paramName: string;
}

// Der äußere Schlüssel (z.B. "suppliers") ist jetzt der baseDir.
export const pages: Record<string, Record<string, PageDefinition>> = {
  
  suppliers: {
    list: {
      pageName: 'SupplierListPage',
      paramName: '',
    },
    detail: {
      pageName: 'SupplierDetailPage',
      paramName: 'supplierId',
    }
  },

  categories: {
    detail: {
      pageName: 'CategoryDetailPage',
      paramName: 'categoryId',
    }
  },

  offerings: {
    attributes: {
      pageName: 'OfferDetailAttributesPage',
      paramName: 'offerId',
    },
    links: {
      pageName: 'OfferDetailLinksPage',
      paramName: 'offerId',
    }
  }
};