import type { WholesalerItemOffering_ProductDef_Category } from "$lib/domain/domainTypes";

export type OfferingFormData = Omit<
    Partial<WholesalerItemOffering_ProductDef_Category>,
    "supplier_id"
>;
