import { assertDefined } from "$lib/utils/assertions";
import type { OfferingEnrichedView, WholesalerItemOffering } from "./domainTypes";


/**
 * Copy fields from wioCoalesced to a newly created WIO.
 * 
 * @param wioCoalesced 
 * @returns A new WIO object.
 */
export function wioFromWioCoalesced(wioCoalesced: OfferingEnrichedView): WholesalerItemOffering {
    assertDefined(wioCoalesced, "wioCoalesced");

    const wio: WholesalerItemOffering = {
        // Pflichtfelder
        offering_id: wioCoalesced.offeringId,
        wholesaler_id: wioCoalesced.wholesalerId,
        category_id: wioCoalesced.categoryId,
        product_def_id: wioCoalesced.productDefId,

        // Gemappte Felder aus OfferingEnrichedView
        material_id: wioCoalesced.finalMaterialId ?? null,
        form_id: wioCoalesced.finalFormId ?? null,
        surface_finish_id: wioCoalesced.finalSurfaceFinishId ?? null,
        construction_type_id: wioCoalesced.finalConstructionTypeId ?? null,
        title: wioCoalesced.offeringTitle ?? null,
        size: wioCoalesced.offeringSize ?? null,
        dimensions: wioCoalesced.offeringDimensions ?? null,
        packaging: wioCoalesced.offeringPackaging ?? null,
        price: wioCoalesced.offeringPrice ?? null,
        price_per_piece: wioCoalesced.offeringPricePerPiece ?? null,
        weight_grams: wioCoalesced.offeringWeightGrams ?? null,
        weight_range: wioCoalesced.offeringWeightRange ?? null,
        package_weight: wioCoalesced.offeringPackageWeight ?? null,
        origin: wioCoalesced.offeringOrigin ?? null,
        comment: wioCoalesced.offeringComment ?? null,
        imagePromptHint: wioCoalesced.offeringImagePromptHint ?? null,
        quality: wioCoalesced.offeringQuality ?? null,
        color_variant: wioCoalesced.offeringColorVariant ?? null,
        wholesaler_price: wioCoalesced.offeringWholesalerPrice ?? null,

        // Felder, die nicht in OfferingEnrichedView vorhanden sind
        sub_seller: null,
        wholesaler_article_number: null,
        currency: null,
        is_assortment: null,
        override_material: false, // Default-Wert
        shopify_product_id: null,
        shopify_variant_id: null,
        shopify_sku: null,
        shopify_price: null,
        shopify_synced_at: null,
        created_at: undefined, // Optional, kann undefined sein
    };

    return wio;
}



