const generatedRoot = "scaffolding-generated";
export const scaffoldingConfig = {
    generatedRoot: generatedRoot,
    pagesRoot: `${generatedRoot}/src/lib/pages`,
    routesRoot: `${generatedRoot}/src/routes`,
    overwriteExisting: true,
    deleteGeneratedFolderBeforeGeneration: true
};
// Der äußere Schlüssel (z.B. "suppliers") ist jetzt der baseDir.
export const pages = {
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
//# sourceMappingURL=scaffoldConfig.js.map