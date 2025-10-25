import {
  AttributeSchema,
  ConstructionTypeSchema,
  FormSchema,
  MaterialSchema,
  ProductDefinitionSchema,
  SurfaceFinishSchema,
  WholesalerOfferingAttribute_AttributeSchema,
  WholesalerSchema,
  Wio_PDef_Cat_Supp_WithLinks_Schema
} from "$lib/domain/domainTypes";
import type { PromisifyComplex } from "$lib/utils/typeUtils";
import z from "zod";

// ===== OFFERING DETAIL ATTRIBUTES BASE DATA =====

// prettier-ignore
export const OfferingDetail_LoadDataSchema = z.object({
    urlPathName: z.string(),                                                                     // Mandatory! Passed on to nested components. 
    supplierId: z.number().int().positive().optional().nullable(),                           // Needed for the "create" in route context "/suppliers"
    categoryId: z.number().int().positive().optional().nullable(),                           // Needed for the "create" mode in both route contexts
    productDefId: z.number().int().positive().optional().nullable(),                         // Needed for the "create" in route context "/categories"
    offering: z.nullable(Wio_PDef_Cat_Supp_WithLinks_Schema).optional(),   // CREATE-mode: can be null
    availableProducts: z.array(ProductDefinitionSchema).nullable().optional(),               // This is only needed for the "create" mode: We need the available products for the combobox.
    availableSuppliers: z.array(WholesalerSchema).nullable().optional(),                     // This is only needed for the "create" mode: We need the available suppliers for the combobox.
    materials: z.array(MaterialSchema).nullable().optional(),
    forms: z.array(FormSchema).nullable().optional(),
    constructionTypes: z.array(ConstructionTypeSchema),
    surfaceFinishes: z.array(SurfaceFinishSchema),
    isCreateMode: z.boolean(),                                                               // Derived. true if we are on "new" route
    isSuppliersRoute: z.boolean(),                                                           // Derived. true if in route context "/suppliers"  
    isCategoriesRoute: z.boolean()                                                           // Derived. true if in route context "/categories"
});

export type OfferingDetail_LoadData = z.infer<typeof OfferingDetail_LoadDataSchema>;
export type OfferingDetail_LoadDataAsync = PromisifyComplex<OfferingDetail_LoadData>;

// ===== OFFERING DETAIL ATTRIBUTES LOAD DATA =====

export const OfferingDetailAttributes_LoadDataSchema = OfferingDetail_LoadDataSchema.extend({
  assignedAttributes: z.array(WholesalerOfferingAttribute_AttributeSchema),
  availableAttributes: z.array(AttributeSchema),
});

export type OfferingDetailAttributes_LoadData = z.infer<typeof OfferingDetailAttributes_LoadDataSchema>;
export type OfferingDetailAttributes_LoadDataAsync = PromisifyComplex<OfferingDetailAttributes_LoadData>;

// ===== OFFERING DETAIL LINKS LOAD DATA =====

export const OfferingDetailLinks_LoadDataSchema = OfferingDetail_LoadDataSchema.extend({
  offering: Wio_PDef_Cat_Supp_WithLinks_Schema.nullable().optional(), // CREATE-mode: can be null
  //⚠️NOTE: We load the links directly with the offering! => not needed: links: z.array(WholesalerOfferingLinkSchema),
});

export type OfferingDetailLinks_LoadData = z.infer<typeof OfferingDetailLinks_LoadDataSchema>;
export type OfferingDetailLinks_LoadDataAsync = PromisifyComplex<OfferingDetailLinks_LoadData>;

// ===== UNION OF ALL LOAD DATA - NOT needed currently =====

export const OfferingDetailLinksAndAttribute_LoadDataSchema = z
  .intersection(OfferingDetailAttributes_LoadDataSchema, OfferingDetailLinks_LoadDataSchema)
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
    });
  });

export type OfferingDetailLinksAndAttribute_LoadData = z.infer<typeof OfferingDetailLinksAndAttribute_LoadDataSchema>;
