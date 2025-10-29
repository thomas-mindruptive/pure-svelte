// File: src/lib/domain/domainTypes.ts

import { log } from "$lib/utils/logger";
import { z } from "zod";

// ===== SCHEMA META HELPER =====

type WithMeta<T, M> = T & { readonly __brandMeta: M };
export type ExtractSchemaMeta<T> = T extends { readonly __brandMeta: infer M } ? M : never;
export type GetSchemaAlias<T> = ExtractSchemaMeta<T> extends { alias: infer A } ? A : never;

/**
 * Add metadata to the schema itself (not a copy!) and return the schema.
 * @param schema
 * @param meta
 * @returns
 */
function createSchemaWithMeta<T extends z.ZodObject<any>, M extends { alias: string; tableName: string; dbSchema: string }>(
  schema: T,
  meta: M,
): WithMeta<T, M> {
  (schema as any).__brandMeta = meta;
  log.debug(`Added metadata to ${schema.description} - ${JSON.stringify(meta)}`);
  return schema as WithMeta<T, M>;
}

/**
 * Copies metadata from a source schema to a target schema.
 * CRUCIAL: It returns a new type that TypeScript understands,
 * combining the target schema's structure with the source schema's metadata type.
 * @param from The source schema with metadata.
 * @param to The target schema that will receive the metadata.
 * @returns The target schema, now correctly typed with the added metadata.
 */
export function copyMetaFrom<F extends z.ZodObject<any>, T extends z.ZodObject<any>>(from: F, to: T): WithMeta<T, ExtractSchemaMeta<F>> {
  const fromMeta = (from as any).__brandMeta;
  if (fromMeta) {
    (to as any).__brandMeta = { ...(to as any).__brandMeta, ...fromMeta };
  }
  return to as WithMeta<T, ExtractSchemaMeta<F>>;
}

// ===== GENERAL =====

export const NameOrTitle = z.string().max(200);
export const LongDescription = z.string().max(4000);
export const ShortDescription = z.string().max(500);
export const OptionalLongDescription = LongDescription.nullable().optional();
export const OptionalShortDescription = ShortDescription.nullable().optional();

// ===== WHOLESALER (dbo.wholesalers) =====

export const WholesalerPriceRangeSchema = z
  .enum(["very expensive", "expensive", "medium", "cheap", "very cheap"])
  .describe("WholesalerPriceRangeSchema");

export const WholesalerRelevanceSchema = z.enum(["lowest", "low", "medium", "high", "highest"]).describe("WholesalerRelevanceSchema");

export type WholesalerPriceRange = z.infer<typeof WholesalerPriceRangeSchema>;
export type WholesalerRelevance = z.infer<typeof WholesalerRelevanceSchema>;

const WholesalerSchemaBase = z
  .object({
    wholesaler_id: z.number().int().positive(),
    name: NameOrTitle,
    country: z.string().max(200).nullable().optional(),
    region: z.string().max(200).nullable().optional(),
    b2b_notes: z.string().max(1000).nullable().optional(),
    status: z.string().max(200).nullable().optional(),
    dropship: z.boolean().nullable().optional().default(false),
    website: z.string().url().max(2048).nullable().optional(),
    email: z.string().email().max(200).nullable().optional(),
    price_range: WholesalerPriceRangeSchema.nullable().optional(),
    relevance: WholesalerRelevanceSchema.nullable().optional(),
    created_at: z.string().optional(),
  })
  .describe("WholesalerSchema");

export const WholesalerSchema = createSchemaWithMeta(WholesalerSchemaBase, {
  alias: "w",
  tableName: "wholesalers",
  dbSchema: "dbo",
} as const);

/**
 * Schema for creating a new Wholesaler.
 * Omits server-generated fields like the primary key and timestamps.
 */
const tempWholesalerForCreate = WholesalerSchema.omit({
  wholesaler_id: true,
  created_at: true,
}).describe("WholesalerForCreateSchema");
export const WholesalerForCreateSchema = copyMetaFrom(WholesalerSchema, tempWholesalerForCreate);

// ===== PRODUCT CATEGORY (dbo.product_categories) =====

const ProductCategorySchemaBase = z
  .object({
    category_id: z.number().int().positive(),
    product_type_id: z.number().int().positive(),
    name: NameOrTitle,
    description: z.string().max(500).nullable().optional(),
  })
  .describe("ProductCategorySchema");

export const ProductCategorySchema = createSchemaWithMeta(ProductCategorySchemaBase, {
  alias: "pc",
  tableName: "product_categories",
  dbSchema: "dbo",
} as const);

/**
 * Schema for creating a new ProductCategory.
 * Omits the server-generated primary key.
 */
const tempProductCategoryForCreate = ProductCategorySchema.omit({
  category_id: true,
}).describe("ProductCategoryForCreateSchema");
export const ProductCategoryForCreateSchema = copyMetaFrom(ProductCategorySchema, tempProductCategoryForCreate);

// ===== ATTRIBUTE (dbo.attributes) =====

const AttributeSchemaBase = z
  .object({
    attribute_id: z.number().int().positive(),
    name: NameOrTitle,
    description: z.string().max(500).nullable().optional(),
  })
  .describe("AttributeSchema");

export const AttributeSchema = createSchemaWithMeta(AttributeSchemaBase, {
  alias: "a",
  tableName: "attributes",
  dbSchema: "dbo",
} as const);

/**
 * Schema for creating a new Attribute.
 * Omits the server-generated primary key.
 */
const tempAttributeForCreate = AttributeSchema.omit({
  attribute_id: true,
}).describe("AttributeForCreateSchema");
export const AttributeForCreateSchema = copyMetaFrom(AttributeSchema, tempAttributeForCreate);

// ===== PRODUCT DEFINITION (dbo.product_definitions) =====

const ProductDefinitionSchemaBase = z
  .object({
    product_def_id: z.number().int().positive(),
    category_id: z.number().int().positive(),
    title: z.string().max(200),
    description: z.string().max(4000).nullable().optional(),
    material_id: z.number().int().positive().nullable().optional(),
    form_id: z.number().int().positive().nullable().optional(),
    construction_type_id: z.number().int().positive().nullable().optional(),
    surface_finish_id: z.number().int().positive().nullable().optional(),
    for_liquids: z.boolean().optional().nullable(),
    created_at: z.string().optional(),
  })
  .describe("ProductDefinitionSchema");

export const ProductDefinitionSchema = createSchemaWithMeta(ProductDefinitionSchemaBase, {
  alias: "pd",
  tableName: "product_definitions",
  dbSchema: "dbo",
} as const);

/**
 * Schema for creating a new ProductDefinition.
 * Omits server-generated fields.
 */
const tempProductDefinitionForCreate = ProductDefinitionSchema.omit({
  product_def_id: true,
  created_at: true,
}).describe("ProductDefinitionForCreateSchema");
export const ProductDefinitionForCreateSchema = copyMetaFrom(ProductDefinitionSchema, tempProductDefinitionForCreate);

// ===== WHOLESALER CATEGORY (dbo.wholesaler_categories) =====

const WholesalerCategorySchemaBase = z
  .object({
    wholesaler_id: z.number().int().positive(),
    category_id: z.number().int().positive(),
    comment: z.string().max(4000).nullable().optional(),
    link: z.string().url().max(2048).nullable().optional(),
    created_at: z.string().optional(),
  })
  .describe("WholesalerCategorySchema");

export const WholesalerCategorySchema = createSchemaWithMeta(WholesalerCategorySchemaBase, {
  alias: "wc",
  tableName: "wholesaler_categories",
  dbSchema: "dbo",
} as const);

/**
 * Schema for creating a new WholesalerCategory assignment.
 * Client provides foreign keys and data, but not the timestamp.
 */
const tempWholesalerCategoryForCreate = WholesalerCategorySchema.omit({
  created_at: true,
}).describe("WholesalerCategoryForCreateSchema");
export const WholesalerCategoryForCreateSchema = copyMetaFrom(WholesalerCategorySchema, tempWholesalerCategoryForCreate);

// ===== WHOLESALER CATEGORY including joins (dbo.wholesaler_categories) =====

export const WholesalerCategory_Category_Schema = WholesalerCategorySchema.extend({
  category_name: NameOrTitle,
  category_description: z.string().nullable().optional(),
}).describe("WholesalerCategory_Category_Schema");

const tempWholesalerCategoryNested = WholesalerCategorySchema.extend({
  category: ProductCategorySchema,
}).describe("WholesalerCategory_Category_NestedSchema");

export const WholesalerCategory_Category_Nested_Schema = copyMetaFrom(WholesalerCategorySchema, tempWholesalerCategoryNested);

// ===== EXTENDED TYPES FOR MOCK DATA =====

export const WholesalerCategoryWithCountSchema = WholesalerCategory_Category_Schema.extend({
  offering_count: z.number().int().nonnegative().optional(),
}).describe("WholesalerCategoryWithCountSchema");

// ===== MATERIAL (dbo.materials) =====

const MaterialSchemaBase = z
  .object({
    material_id: z.number().int().positive(),
    name: NameOrTitle,
  })
  .describe("MaterialSchema");

export const MaterialSchema = createSchemaWithMeta(MaterialSchemaBase, {
  alias: "m",
  tableName: "materials",
  dbSchema: "dbo",
} as const);

/**
 * Schema for creating a new Material.
 */
const tempMaterialForCreate = MaterialSchema.omit({
  material_id: true,
}).describe("MaterialForCreateSchema");
export const MaterialForCreateSchema = copyMetaFrom(MaterialSchema, tempMaterialForCreate);

// ===== FORM (dbo.forms) =====

const FormSchemaBase = z
  .object({
    form_id: z.number().int().positive(),
    name: NameOrTitle,
  })
  .describe("FormSchema");

export const FormSchema = createSchemaWithMeta(FormSchemaBase, {
  alias: "f",
  tableName: "forms",
  dbSchema: "dbo",
} as const);

/**
 * Schema for creating a new Form.
 */
const tempFormForCreate = FormSchema.omit({
  form_id: true,
}).describe("FormForCreateSchema");
export const FormForCreateSchema = copyMetaFrom(FormSchema, tempFormForCreate);

// ===== ConstructionType (dbo.construction_types) =====

const ConstructionTypeSchemaBase = z
  .object({
    construction_type_id: z.number().int().positive(),
    name: NameOrTitle,
    description: OptionalShortDescription,
  })
  .describe("ConstructionTypeSchema");

export const ConstructionTypeSchema = createSchemaWithMeta(ConstructionTypeSchemaBase, {
  alias: "ct",
  tableName: "construction_types",
  dbSchema: "dbo",
} as const);

// ===== SurfaceFinish (dbo.surface_finishes) =====

const SurfaceFinishSchemaBase = z
  .object({
    surface_finish_id: z.number().int().positive(),
    name: NameOrTitle,
    description: OptionalShortDescription,
  })
  .describe("SurfaceFinishSchema");

export const SurfaceFinishSchema = createSchemaWithMeta(SurfaceFinishSchemaBase, {
  alias: "sf",
  tableName: "surface_finishes",
  dbSchema: "dbo",
} as const);

// ===== PRODUCT DEFINITION WITH LOOKUPS (for image generation analysis) =====

/**
 * NESTED SCHEMA with all lookup data for product definitions.
 * Used for image generation analysis when offerings inherit from product_def.
 */
const tempProdDefMatFormSurfConstrNested = ProductDefinitionSchema.extend({
  material: MaterialSchema.nullable().optional(),
  form: FormSchema.nullable().optional(),
  surface_finish: SurfaceFinishSchema.nullable().optional(),
  construction_type: ConstructionTypeSchema.nullable().optional(),
}).describe("ProductDefinition_Material_Form_SurfaceFinish_ConstructionType_NestedSchema");
export const ProdDef_mat_form_surf_constr_Nested_Schema = copyMetaFrom(ProductDefinitionSchema, tempProdDefMatFormSurfConstrNested);

// ===== WHOLESALER OFFERING LINK (dbo.wholesaler_offering_links) =====

const WholesalerOfferingLinkSchemaBase = z
  .object({
    link_id: z.number().int().positive(),
    offering_id: z.number().int().positive(),
    url: z.string().url().max(2048),
    notes: z.string().max(500).nullable().optional(),
    created_at: z.string().optional(),
  })
  .describe("WholesalerOfferingLinkSchema");

export const WholesalerOfferingLinkSchema = createSchemaWithMeta(WholesalerOfferingLinkSchemaBase, {
  alias: "wol",
  tableName: "wholesaler_offering_links",
  dbSchema: "dbo",
} as const);

/**
 * Schema for creating a new WholesalerOfferingLink.
 * Omits server-generated fields.
 */
const tempWholesalerOfferingLinkForCreate = WholesalerOfferingLinkSchema.omit({
  link_id: true,
  created_at: true,
}).describe("WholesalerOfferingLinkForCreateSchema");
export const WholesalerOfferingLinkForCreateSchema = copyMetaFrom(WholesalerOfferingLinkSchema, tempWholesalerOfferingLinkForCreate);

// ===== WHOLESALER ITEM OFFERING (dbo.wholesaler_item_offerings) =====

const Wio_BaseSchema = z
  .object({
    offering_id: z.number().int().positive(),
    wholesaler_id: z.number().int().positive(),
    category_id: z.number().int().positive(),
    product_def_id: z.number().int().positive(),
    sub_seller: z.string().max(255).nullable().optional(),
    material_id: z.number().int().positive().nullable().optional(),
    form_id: z.number().int().positive().nullable().optional(),
    construction_type_id: z.number().int().positive().nullable().optional(),
    surface_finish_id: z.number().int().positive().nullable().optional(),
    color_variant: z.string().max(100).nullable().optional(), // For image matching
    title: z.string().max(255).nullable().optional(),
    size: z.string().max(50).nullable().optional(),
    dimensions: z.string().max(100).nullable().optional(),
    price: z.number().multipleOf(0.01).nullable().optional(), // precision [18,2]
    weight_grams: z.number().positive().nullable().optional(),
    currency: z.string().length(3).nullable().optional(),
    comment: z.string().max(4000).nullable().optional(),
    is_assortment: z.boolean().nullable().optional(),
    created_at: z.string().optional(),
  })
  .describe("WholesalerItemOfferingSchema");

export const Wio_Schema = createSchemaWithMeta(Wio_BaseSchema, {
  alias: "wio",
  tableName: "wholesaler_item_offerings",
  dbSchema: "dbo",
} as const);

/**
 * Schema for creating a new WholesalerItemOffering.
 * Omits server-generated fields.
 */
const tempWholesalerItemOfferingForCreate = Wio_Schema.omit({
  offering_id: true,
  created_at: true,
}).describe("WholesalerItemOfferingForCreateSchema");
export const WholesalerItemOfferingForCreateSchema = copyMetaFrom(Wio_Schema, tempWholesalerItemOfferingForCreate);

// ===== WHOLESALER ITEM OFFERING including join to product_def  =====

export const Wio_PDef_Schema = Wio_Schema.extend({
  product_def_title: z.string().optional(),
  product_def_description: z.string().nullable().optional(),
}).describe("WholesalerItemOffering_ProductDefSchema");

// ===== WHOLESALER ITEM OFFERING including joins (dbo.wholesaler_item_offerings) to product_def and category =====

/**
 * FLAT SCHEMA (LEGACY): Direct properties for joined data.
 */
export const Wio_PDef_Cat_Supp_Schema = Wio_Schema.extend({
  product_def_title: z.string().optional(),
  product_def_description: z.string().nullable().optional(),
  category_name: NameOrTitle.optional(),
  category_description: z.string().nullable().optional(),
  wholesaler_name: NameOrTitle.optional(),
}).describe("WholesalerItemOffering_ProductDef_Category_SupplierSchema");

/**
 * Extended schema with links for GET /id endpoint only.
 * This includes the links array.
 */
const tempWioPdcWithLinks = Wio_PDef_Cat_Supp_Schema.extend({
  links: z.array(WholesalerOfferingLinkSchema).nullable().optional(),
}).describe("WholesalerItemOffering_ProductDef_Category_Supplier_WithLinksSchema");
export const Wio_PDef_Cat_Supp_WithLinks_Schema = copyMetaFrom(Wio_Schema, tempWioPdcWithLinks);

/**
 * NESTED SCHEMA (RECOMMENDED): Uses nested branded schemas for joined data.
 */
const tempWioNestedSchema = Wio_Schema.extend({
  product_def: ProductDefinitionSchema,
  category: ProductCategorySchema,
  wholesaler: WholesalerSchema,
}).describe("WholesalerItemOffering_ProductDef_Category_Supplier_NestedSchema");
export const Wio_PDef_Cat_Supp_Nested_Schema = copyMetaFrom(Wio_Schema, tempWioNestedSchema);

/**
 * NESTED SCHEMA with links - for client-side display only.
 * Links are populated via separate query and added to the data.
 */
const tempWioNestedWithLinks = Wio_PDef_Cat_Supp_Nested_Schema.extend({
  links: z.array(WholesalerOfferingLinkSchema).nullable().optional(),
}).describe("WholesalerItemOffering_ProductDef_Category_Supplier_Nested_WithLinksSchema");
export const Wio_PDef_Cat_Supp_Nested_WithLinks_Schema = copyMetaFrom(Wio_Schema, tempWioNestedWithLinks);

/**
 * NESTED SCHEMA with all lookup data for AI image generation analysis.
 * Used by loadOfferingsForImageAnalysis() which includes JOINs for:
 * product_def (with its lookups), material, form, surface_finish, construction_type.
 */
const tempWioPdefMatFormSurfConstrNested = Wio_Schema.extend({
  product_def: ProdDef_mat_form_surf_constr_Nested_Schema,
  material: MaterialSchema.nullable().optional(),
  form: FormSchema.nullable().optional(),
  surface_finish: SurfaceFinishSchema.nullable().optional(),
  construction_type: ConstructionTypeSchema.nullable().optional(),
}).describe("WholesalerItemOffering_ProductDef_Material_Form_SurfaceFinish_ConstructionType_NestedSchema");
export const Wio_pdef_mat_form_surf_constr_Nested_Schema = copyMetaFrom(Wio_Schema, tempWioPdefMatFormSurfConstrNested);

// ===== WHOLESALER OFFERING ATTRIBUTE (dbo.wholesaler_offering_attributes) =====

const WholesalerOfferingAttributeSchemaBase = z
  .object({
    offering_id: z.number().int().positive(),
    attribute_id: z.number().int().positive(),
    value: z.string().max(200).nullable().optional(),
  })
  .describe("WholesalerOfferingAttributeSchema");

export const WholesalerOfferingAttributeSchema = createSchemaWithMeta(WholesalerOfferingAttributeSchemaBase, {
  alias: "woa",
  tableName: "wholesaler_offering_attributes",
  dbSchema: "dbo",
} as const);

/**
 * Schema for creating a new WholesalerOfferingAttribute assignment.
 */
export const WholesalerOfferingAttributeForCreateSchema = WholesalerOfferingAttributeSchema.describe(
  "WholesalerOfferingAttributeForCreateSchema",
);

// ===== WHOLESALER OFFERING ATTRIBUTE including joins (dbo.wholesaler_offering_attributes) =====

export const WholesalerOfferingAttribute_AttributeSchema = WholesalerOfferingAttributeSchema.extend({
  attribute_name: NameOrTitle.optional(),
  attribute_description: z.string().nullable().optional(),
}).describe("WholesalerOfferingAttribute_AttributeSchema");



// ===== ProductType (dbo.product_types) =====

const ProductTypeSchemaBase = z
  .object({
    product_type_id: z.number().int().positive(),
    name: NameOrTitle,
  })
  .describe("ProductTypeSchema");

export const ProductTypeSchema = createSchemaWithMeta(ProductTypeSchemaBase, {
  alias: "pt",
  tableName: "product_types",
  dbSchema: "dbo",
} as const);



// ===== ORDER (dbo.orders) =====

export const OrderStatusSchema = z
  .enum(["pending", "confirmed", "processing", "shipped", "delivered", "cancelled"])
  .describe("OrderStatusSchema");
export type OrderStatus = z.infer<typeof OrderStatusSchema>;

const OrderSchemaBase = z
  .object({
    order_id: z.number().int().positive(),
    wholesaler_id: z.number().int().positive(),
    order_date: z.string(), // ISO date string
    order_number: z.string().max(100).nullable().optional(),
    status: OrderStatusSchema,
    total_amount: z.number().multipleOf(0.01).nullable().optional(),
    currency: z.string().length(3).nullable().optional(),
    notes: z.string().max(1000).nullable().optional(),
    created_at: z.string().optional(),
  })
  .describe("OrderSchema");

export const OrderSchema = createSchemaWithMeta(OrderSchemaBase, {
  alias: "ord",
  tableName: "orders",
  dbSchema: "dbo",
} as const);

const tempOrderForCreate = OrderSchema.omit({
  order_id: true,
  created_at: true,
}).describe("OrderForCreateSchema");
export const OrderForCreateSchema = copyMetaFrom(OrderSchema, tempOrderForCreate);

// ===== ORDER with joins =====

const tempOrderWholesaler = OrderSchema.extend({
  wholesaler: WholesalerSchema,
});
export const Order_Wholesaler_Schema = copyMetaFrom(OrderSchema, tempOrderWholesaler);

// ===== ORDER ITEM (dbo.order_items) =====

const OrderItemSchemaBase = z
  .object({
    order_item_id: z.number().int().positive(),
    order_id: z.number().int().positive(),
    offering_id: z.number().int().positive().nullable().optional(),
    quantity: z.number().int().positive().default(1),
    unit_price: z.number().multipleOf(0.01),
    line_total: z.number().multipleOf(0.01).nullable().optional(),
    item_notes: z.string().max(500).nullable().optional(),
    created_at: z.string().optional(),
  })
  .describe("OrderItemSchema");

export const OrderItemSchema = createSchemaWithMeta(OrderItemSchemaBase, {
  alias: "ori",
  tableName: "order_items",
  dbSchema: "dbo",
} as const);

const tempOrderItemForCreate = OrderItemSchema.omit({
  order_item_id: true,
  created_at: true,
}).describe("OrderItemForCreateSchema");
export const OrderItemForCreateSchema = copyMetaFrom(OrderItemSchema, tempOrderItemForCreate);

// ===== ORDER ITEM with JOINS =====

const tempOrderItemNested = OrderItemSchema.extend({
  order: OrderSchema,
  offering: Wio_Schema,
  product_def: ProductDefinitionSchema,
  category: ProductCategorySchema,
});
export const OrderItem_ProdDef_Category_Schema = copyMetaFrom(OrderItemSchema, tempOrderItemNested);

// ===== IMAGE (dbo.images) =====

const ImageSchemaBase = z
  .object({
    image_id: z.number().int().positive(),
    filename: z.string().max(255),
    filepath: z.string().max(500),
    file_hash: z.string().max(64).nullable().optional(),
    file_size_bytes: z.number().int().positive().nullable().optional(),
    width_px: z.number().int().positive().nullable().optional(),
    height_px: z.number().int().positive().nullable().optional(),
    mime_type: z.string().max(50).nullable().optional(),
    shopify_url: z.string().max(500).nullable().optional(),
    shopify_media_id: z.string().max(100).nullable().optional(),
    uploaded_to_shopify_at: z.string().nullable().optional(), // ISO datetime string
    created_at: z.string().optional(),
  })
  .describe("ImageSchema");

export const ImageSchema = createSchemaWithMeta(ImageSchemaBase, {
  alias: "img",
  tableName: "images",
  dbSchema: "dbo",
} as const);

/**
 * Schema for creating a new Image.
 * Omits server-generated fields (including auto-calculated metadata).
 */
const tempImageForCreate = ImageSchema.omit({
  image_id: true,
  created_at: true,
  // Server-calculated fields (enrichImageMetadata):
  filename: true,
  file_hash: true,
  file_size_bytes: true,
  width_px: true,
  height_px: true,
  mime_type: true,
}).describe("ImageForCreateSchema");
export const ImageForCreateSchema = copyMetaFrom(ImageSchema, tempImageForCreate);

// ===== IMAGE SIZE RANGE ENUM =====

/**
 * Size range enum for images (matching DB CHECK constraint).
 * Used for matching images to offerings based on size.
 */
export const ImageSizeRange = {
  XS: 'XS',
  S: 'S',
  M: 'M',
  L: 'L',
  XL: 'XL',
  S_M: 'S-M',
  M_L: 'M-L',
  L_XL: 'L-XL',
} as const;

export type ImageSizeRange = typeof ImageSizeRange[keyof typeof ImageSizeRange];

export const ImageSizeRangeEnum = z.enum([
  'XS', 'S', 'M', 'L', 'XL', 'S-M', 'M-L', 'L-XL'
]);

// ===== PRODUCT DEFINITION IMAGE (dbo.product_definition_images) =====
// OOP Inheritance Pattern: ProductDefinitionImage extends Image
// - image_id is PRIMARY KEY (same as the inherited Image)
// - Adds product context and variant dimensions
// - Includes variant matching fields for offering image matching

const ProductDefinitionImageSchemaBase = z
  .object({
    image_id: z.number().int().positive(), // PK + FK: OOP inheritance pattern
    product_def_id: z.number().int().positive(),

    // Variant Matching Fields (for findBestMatchingImage)
    material_id: z.number().int().positive().nullable().optional(),
    form_id: z.number().int().positive().nullable().optional(),
    surface_finish_id: z.number().int().positive().nullable().optional(),
    construction_type_id: z.number().int().positive().nullable().optional(),

    // Image Metadata
    size_range: ImageSizeRangeEnum.nullable().optional(),
    quality_grade: z.string().max(10).nullable().optional(),
    color_variant: z.string().max(50).nullable().optional(),
    image_type: z.string().max(50).nullable().optional(),
    sort_order: z.number().int().nonnegative().default(0),
    is_primary: z.boolean().default(false),
    created_at: z.string().optional(),
  })
  .describe("ProductDefinitionImageSchema");

export const ProductDefinitionImage_Schema = createSchemaWithMeta(ProductDefinitionImageSchemaBase, {
  alias: "pdi",
  tableName: "product_definition_images",
  dbSchema: "dbo",
} as const);

/**
 * Schema for creating a new ProductDefinitionImage.
 * Omits server-generated fields (created_at).
 * NOTE: image_id is required and comes from the parent Image insert.
 */
const tempProductDefinitionImageForCreate = ProductDefinitionImage_Schema.omit({
  created_at: true,
}).describe("ProductDefinitionImageForCreateSchema");
export const ProductDefinitionImageForCreateSchema = copyMetaFrom(ProductDefinitionImage_Schema, tempProductDefinitionImageForCreate);

// ===== PRODUCT DEFINITION IMAGE with JOINS =====

const tempProductDefinitionImageWithImage = ProductDefinitionImage_Schema.extend({
  image: ImageSchema,
});
export const ProductDefinitionImage_Image_Schema = copyMetaFrom(ProductDefinitionImage_Schema, tempProductDefinitionImageWithImage);

const tempProductDefinitionImageNested = ProductDefinitionImage_Schema.extend({
  image: ImageSchema,
  product_def: ProductDefinitionSchema,
});
export const ProductDefinitionImage_Image_ProductDef_Schema = copyMetaFrom(ProductDefinitionImage_Schema, tempProductDefinitionImageNested);

// ===== SCHEMAS => TYPES  =====

export type Wholesaler = z.infer<typeof WholesalerSchema>;
export type ProductCategory = z.infer<typeof ProductCategorySchema>;
export type Attribute = z.infer<typeof AttributeSchema>;
export type ProductDefinition = z.infer<typeof ProductDefinitionSchema>;
export type ProdDef_mat_form_surf_constr_Nested = z.infer<typeof ProdDef_mat_form_surf_constr_Nested_Schema>;

export type WholesalerCategory = z.infer<typeof WholesalerCategorySchema>;
export type WholesalerCategory_Category = z.infer<typeof WholesalerCategory_Category_Schema>;
export type WholesalerCategoryWithCount = z.infer<typeof WholesalerCategoryWithCountSchema>;
export type WholesalerCategory_Category_Nested = z.infer<typeof WholesalerCategory_Category_Nested_Schema>;

export type WholesalerItemOffering = z.infer<typeof Wio_Schema>;
export type Wio_PDef = z.infer<typeof Wio_PDef_Schema>;
export type Wio_PDef_Cat_Supp = z.infer<typeof Wio_PDef_Cat_Supp_Schema>;
export type Wio_PDef_Cat_Supp_Nested = z.infer<typeof Wio_PDef_Cat_Supp_Nested_Schema>;
export type Wio_PDef_Cat_Supp_WithLinks = z.infer<typeof Wio_PDef_Cat_Supp_WithLinks_Schema>;
export type Wio_PDef_Cat_Supp_Nested_WithLinks = z.infer<typeof Wio_PDef_Cat_Supp_Nested_WithLinks_Schema>;
export type Wio_pdef_mat_form_surf_constr_Nested = z.infer<typeof Wio_pdef_mat_form_surf_constr_Nested_Schema>;

export type WholesalerOfferingLink = z.infer<typeof WholesalerOfferingLinkSchema>;
export type WholesalerOfferingAttribute = z.infer<typeof WholesalerOfferingAttributeSchema>;
export type WholesalerOfferingAttribute_Attribute = z.infer<typeof WholesalerOfferingAttribute_AttributeSchema>;

export type ProductType = z.infer<typeof ProductTypeSchema>;
export type ConstructionType = z.infer<typeof ConstructionTypeSchema>;
export type SurfaceFinish = z.infer<typeof SurfaceFinishSchema>;
export type Material = z.infer<typeof MaterialSchema>;
export type Form = z.infer<typeof FormSchema>;

export type Order = z.infer<typeof OrderSchema>;
export type Order_Wholesaler = z.infer<typeof Order_Wholesaler_Schema>;
export type OrderItem = z.infer<typeof OrderItemSchema>;
export type OrderItem_ProdDef_Category = z.infer<typeof OrderItem_ProdDef_Category_Schema>;

export type Image = z.infer<typeof ImageSchema>;
export type ProductDefinitionImage = z.infer<typeof ProductDefinitionImage_Schema>;
export type ProductDefinitionImage_Image = z.infer<typeof ProductDefinitionImage_Image_Schema>;
export type ProductDefinitionImage_Image_ProductDef = z.infer<typeof ProductDefinitionImage_Image_ProductDef_Schema>;

// ===== ALL BRANDED SCHEMAS (= with meta info)  =====

export const AllBrandedSchemas = {
  WholesalerSchema,
  ProductCategorySchema,
  ProductDefinitionSchema,
  WholesalerItemOfferingSchema: Wio_Schema,
  AttributeSchema,
  WholesalerOfferingLinkSchema,
  WholesalerCategorySchema,
  WholesalerOfferingAttributeSchema,
  OrderSchema,
  OrderItemSchema,
  MaterialSchema,
  FormSchema,
  ProductTypeSchema,
  SurfaceFinishSchema,
  ConstructionTypeSchema,
  ImageSchema,
  ProductDefinitionImageSchema: ProductDefinitionImage_Schema,
} as const;

// ===== HELPER EXPORT =====
export { createSchemaWithMeta, type WithMeta };
