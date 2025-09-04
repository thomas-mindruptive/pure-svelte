import {
    WholesalerItemOffering_ProductDef_CategorySchema,
    WholesalerOfferingAttribute_AttributeSchema,
    AttributeSchema,
    ProductDefinitionSchema,
    WholesalerOfferingLinkSchema
} from "$lib/domain/domainTypes";
import z from "zod";

// ===== OFFERING DETAIL ATTRIBUTES LOAD DATA =====

export const OfferingDetailAttributes_LoadDataSchema = z.object({
    supplierId: z.number().int().positive(),                                          // Mandatory: This is needed for the "create" mode anyway => Always pass it.
    categoryId: z.number().int().positive(),                                          // Mandatory: This is needed for the "create" mode anyway => Always pass it.
    offering:
        WholesalerItemOffering_ProductDef_CategorySchema.nullable().optional(), // CREATE-mode: can be null
    assignedAttributes: z.array(WholesalerOfferingAttribute_AttributeSchema),
    availableAttributes: z.array(AttributeSchema),
    availableProducts: z.array(ProductDefinitionSchema).nullable().optional(), // This is only needed for the "create" mode: We need the available products for the combobox.
});

export type OfferingDetailAttributes_LoadData = z.infer<
    typeof OfferingDetailAttributes_LoadDataSchema
>;

// ===== OFFERING DETAIL LINKS LOAD DATA =====

export const OfferingDetailLinks_LoadDataSchema = z.object({
    supplierId: z.number().int().positive(),                                          // Mandatory: This is needed for the "create" mode anyway => Always pass it.
    categoryId: z.number().int().positive(),                                          // Mandatory: This is needed for the "create" mode anyway => Always pass it.
    offering: WholesalerItemOffering_ProductDef_CategorySchema.nullable().optional(), // CREATE-mode: can be null
    links: z.array(WholesalerOfferingLinkSchema),
    availableProducts: z.array(ProductDefinitionSchema).optional()                    // This is only needed for the "create" mode: We need the available products for the combobox.
});

export type OfferingDetailLinks_LoadData = z.infer<typeof OfferingDetailLinks_LoadDataSchema>;