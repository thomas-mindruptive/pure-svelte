import {
    WholesalerItemOffering_ProductDef_Category_SupplierSchema,
    WholesalerOfferingAttribute_AttributeSchema,
    AttributeSchema,
    ProductDefinitionSchema,
    WholesalerOfferingLinkSchema
} from "$lib/domain/domainTypes";
import type { PromisifyComplex } from "$lib/utils/typeUtils";
import z from "zod";


// ===== OFFERING DETAIL ATTRIBUTES BASE DATA =====

export const OfferingDetail_LoadDataSchema = z.object({
    supplierId: z.number().int().positive(),                                          // Mandatory: This is needed for the "create" mode anyway => Always pass it.
    categoryId: z.number().int().positive(),                                          // Mandatory: This is needed for the "create" mode anyway => Always pass it.
    offering:
        WholesalerItemOffering_ProductDef_Category_SupplierSchema.nullable().optional(),       // CREATE-mode: can be null
    availableProducts: z.array(ProductDefinitionSchema).nullable().optional(), // This is only needed for the "create" mode: We need the available products for the combobox.
});

export type OfferingDetail_LoadData = z.infer<typeof OfferingDetail_LoadDataSchema>;
export type OfferingDetail_LoadDataAsync = PromisifyComplex<OfferingDetail_LoadData>;

// ===== OFFERING DETAIL ATTRIBUTES LOAD DATA =====

export const OfferingDetailAttributes_LoadDataSchema = OfferingDetail_LoadDataSchema.extend({
    assignedAttributes: z.array(WholesalerOfferingAttribute_AttributeSchema),
    availableAttributes: z.array(AttributeSchema),
    availableProducts: z.array(ProductDefinitionSchema).nullable().optional(), // This is only needed for the "create" mode: We need the available products for the combobox.
});

export type OfferingDetailAttributes_LoadData = z.infer<
    typeof OfferingDetailAttributes_LoadDataSchema
>;
export type OfferingDetailAttributes_LoadDataAsync = PromisifyComplex<OfferingDetailAttributes_LoadData>;

// ===== OFFERING DETAIL LINKS LOAD DATA =====

export const OfferingDetailLinks_LoadDataSchema = OfferingDetail_LoadDataSchema.extend({
    offering: WholesalerItemOffering_ProductDef_Category_SupplierSchema.nullable().optional(), // CREATE-mode: can be null
    links: z.array(WholesalerOfferingLinkSchema),
    availableProducts: z.array(ProductDefinitionSchema).optional()                    // This is only needed for the "create" mode: We need the available products for the combobox.
});

export type OfferingDetailLinks_LoadData = z.infer<typeof OfferingDetailLinks_LoadDataSchema>;
export type OfferingDetailLinks_LoadDataAsync = PromisifyComplex<OfferingDetailLinks_LoadData>;

// ===== UNION OF ALL LOAD DATA - NOT needed currently =====

export const OfferingDetailLinksAndAttribute_LoadDataSchema = z.intersection(
    OfferingDetailAttributes_LoadDataSchema,
    OfferingDetailLinks_LoadDataSchema)
    .superRefine((d: OfferingDetailLinksAndAttribute_LoadData, ctx) => {
        type LoadDataKey = Extract<keyof OfferingDetailLinksAndAttribute_LoadData, string>;
        const availableProducts: LoadDataKey = "availableProducts";
        const offering: LoadDataKey = "offering";
        if (d.offering && (d.availableProducts?.length ?? 0 > 0)) {
            ctx.addIssue({
                code: "custom",
                message: "If 'offering' is present, availableProducts must be null|undefined or empty.",
                path: [offering],
            });
            ctx.addIssue({
                code: "custom",
                message: "If 'offering' is present, availableProducts must be null|undefined or empty.",
                path: [availableProducts],
            });
        }
        if (!d.offering && (!d.availableProducts || d.availableProducts.length === 0)) {
            ctx.addIssue({
                code: "custom",
                message: "If 'offering' is null|undefined, availableProducts must be a non-empty array.",
                path: [offering],
            });
        }
        ctx.addIssue({
            code: "custom",
            message: "If 'offering' is null|undefined, availableProducts must be a non-empty array.",
            path: [availableProducts],
        })
    }
    );

export type OfferingDetailLinksAndAttribute_LoadData = z.infer<typeof OfferingDetailLinksAndAttribute_LoadDataSchema>;