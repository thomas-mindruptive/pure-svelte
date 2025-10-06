// File: src/lib/domain/domainTypes.ts

import { log } from "$lib/utils/logger";
import { z } from "zod";

// ===== SCHEMA META HELPER =====

type WithMeta<T, M> = T & { readonly _meta: M };

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
  (schema as any).__brandMeta = meta; // Einfach als normale Property
  log.debug(`Added metadata to ${schema.description} - ${JSON.stringify(meta)}`);
  return schema as WithMeta<T, M>;
}

/**
 * Copy metadata. Creates a copy of the metadata, not a reference.
 * @param from
 * @param to
 */
export function copyMetaFrom(from: z.ZodObject<any>, to: z.ZodObject<any>) {
  (to as any).__brandMeta = { ...(to as any).__brandMeta, ...(from as any).__brandMeta };
}

// ===== GENERAL =====

export const NameOrTitle = z.string().max(200);

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
export const WholesalerForCreateSchema = WholesalerSchema.omit({
  wholesaler_id: true,
  created_at: true,
}).describe("WholesalerForCreateSchema");
copyMetaFrom(WholesalerSchema, WholesalerForCreateSchema);

// ===== PRODUCT CATEGORY (dbo.product_categories) =====

const ProductCategorySchemaBase = z
  .object({
    category_id: z.number().int().positive(),
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
export const ProductCategoryForCreateSchema = ProductCategorySchema.omit({
  category_id: true,
}).describe("ProductCategoryForCreateSchema");
copyMetaFrom(ProductCategorySchema, ProductCategoryForCreateSchema);

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
export const AttributeForCreateSchema = AttributeSchema.omit({
  attribute_id: true,
}).describe("AttributeForCreateSchema");
copyMetaFrom(AttributeSchema, AttributeForCreateSchema);

// ===== PRODUCT DEFINITION (dbo.product_definitions) =====

const ProductDefinitionSchemaBase = z
  .object({
    product_def_id: z.number().int().positive(),
    category_id: z.number().int().positive(),
    title: z.string().max(200),
    description: z.string().max(1000).nullable().optional(),
    material_id: z.number().int().positive().nullable().optional(),
    form_id: z.number().int().positive().nullable().optional(),
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
export const ProductDefinitionForCreateSchema = ProductDefinitionSchema.omit({
  product_def_id: true,
  created_at: true,
}).describe("ProductDefinitionForCreateSchema");
copyMetaFrom(ProductDefinitionSchema, ProductDefinitionForCreateSchema);

// ===== WHOLESALER CATEGORY (dbo.wholesaler_categories) =====

const WholesalerCategorySchemaBase = z
  .object({
    wholesaler_id: z.number().int().positive(),
    category_id: z.number().int().positive(),
    comment: z.string().max(1000).nullable().optional(),
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
export const WholesalerCategoryForCreateSchema = WholesalerCategorySchema.omit({
  created_at: true,
}).describe("WholesalerCategoryForCreateSchema");
copyMetaFrom(WholesalerCategorySchema, WholesalerCategoryForCreateSchema);

// ===== WHOLESALER CATEGORY including joins (dbo.wholesaler_categories) =====

export const WholesalerCategory_CategorySchema = WholesalerCategorySchema.extend({
  category_name: NameOrTitle,
  category_description: z.string().nullable().optional(),
}).describe("WholesalerCategory_CategorySchema");

// ===== EXTENDED TYPES FOR MOCK DATA =====

export const WholesalerCategoryWithCountSchema = WholesalerCategory_CategorySchema.extend({
  offering_count: z.number().int().nonnegative().optional(),
}).describe("WholesalerCategoryWithCountSchema");

// ===== WHOLESALER ITEM OFFERING (dbo.wholesaler_item_offerings) =====

const Wio_BaseSchema = z
  .object({
    offering_id: z.number().int().positive(),
    wholesaler_id: z.number().int().positive(),
    category_id: z.number().int().positive(),
    product_def_id: z.number().int().positive(),
    size: z.string().max(50).nullable().optional(),
    dimensions: z.string().max(100).nullable().optional(),
    price: z.number().multipleOf(0.01).nullable().optional(), // precision [18,2]
    currency: z.string().length(3).nullable().optional(),
    comment: z.string().max(1000).nullable().optional(),
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
export const WholesalerItemOfferingForCreateSchema = Wio_Schema.omit({
  offering_id: true,
  created_at: true,
}).describe("WholesalerItemOfferingForCreateSchema");
copyMetaFrom(Wio_Schema, WholesalerItemOfferingForCreateSchema);

// ===== WHOLESALER ITEM OFFERING including join to product_def  =====

export const Wio_PDef_Schema = Wio_Schema.extend({
  product_def_title: z.string().optional(),
  product_def_description: z.string().nullable().optional(),
}).describe("WholesalerItemOffering_ProductDefSchema");

// ===== WHOLESALER ITEM OFFERING including joins (dbo.wholesaler_item_offerings) to product_def and category =====

/**
 * FLAT SCHEMA (LEGACY): Direct properties for joined data.
 * Use WholesalerItemOffering_ProductDef_Category_Supplier_NestedSchema instead for new code.
 * This schema will be deprecated once all usages are migrated to nested schema.
 */
export const Wio_PDef_Cat_Supp_Schema = Wio_Schema.extend({
  product_def_title: z.string().optional(),
  product_def_description: z.string().nullable().optional(),
  category_name: NameOrTitle.optional(),
  category_description: z.string().nullable().optional(),
  wholesaler_name: NameOrTitle.optional(),
}).describe("WholesalerItemOffering_ProductDef_Category_SupplierSchema");

/**
 * NESTED SCHEMA (RECOMMENDED): Uses nested branded schemas for joined data.
 * This schema works with genTypedQualifiedColumns() and transformToNestedObjects().
 * Follows the same pattern as OrderItem_ProdDef_Category_Schema.
 *
 * Example usage:
 * ```typescript
 * const cols = genTypedQualifiedColumns(WholesalerItemOffering_ProductDef_Category_Supplier_NestedSchema);
 * const results = await fetchData(cols);
 * const nested = transformToNestedObjects(results, WholesalerItemOffering_ProductDef_Category_Supplier_NestedSchema);
 * // Access: nested[0].product_def.title, nested[0].category.name, nested[0].wholesaler.name
 * ```
 */
export const Wio_PDef_Cat_Supp_Nested_Schema = Wio_Schema.extend({
  product_def: ProductDefinitionSchema,
  category: ProductCategorySchema,
  wholesaler: WholesalerSchema,
}).describe("WholesalerItemOffering_ProductDef_Category_Supplier_NestedSchema");
copyMetaFrom(Wio_Schema, Wio_PDef_Cat_Supp_Nested_Schema);

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
export const WholesalerOfferingLinkForCreateSchema = WholesalerOfferingLinkSchema.omit({
  link_id: true,
  created_at: true,
}).describe("WholesalerOfferingLinkForCreateSchema");
copyMetaFrom(WholesalerOfferingLinkSchema, WholesalerOfferingLinkForCreateSchema);

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
 * The client provides all fields for this relationship.
 */
export const WholesalerOfferingAttributeForCreateSchema = WholesalerOfferingAttributeSchema.describe(
  "WholesalerOfferingAttributeForCreateSchema",
);

// ===== WHOLESALER OFFERING ATTRIBUTE including joins (dbo.wholesaler_offering_attributes) =====

export const WholesalerOfferingAttribute_AttributeSchema = WholesalerOfferingAttributeSchema.extend({
  attribute_name: NameOrTitle.optional(),
  attribute_description: z.string().nullable().optional(),
}).describe("WholesalerOfferingAttribute_AttributeSchema");

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
 * Omits the server-generated primary key.
 */
export const MaterialForCreateSchema = MaterialSchema.omit({
  material_id: true,
}).describe("MaterialForCreateSchema");
copyMetaFrom(MaterialSchema, MaterialForCreateSchema);

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
 * Omits the server-generated primary key.
 */
export const FormForCreateSchema = FormSchema.omit({
  form_id: true,
}).describe("FormForCreateSchema");
copyMetaFrom(FormSchema, FormForCreateSchema);

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

export const OrderForCreateSchema = OrderSchema.omit({
  order_id: true,
  created_at: true,
}).describe("OrderForCreateSchema");
copyMetaFrom(OrderSchema, OrderForCreateSchema);

// ===== ORDER with joins =====

export const Order_Wholesaler_Schema = OrderSchema.extend ({
  wholesaler: WholesalerSchema
})
copyMetaFrom(OrderSchema, Order_Wholesaler_Schema);

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

export const OrderItemForCreateSchema = OrderItemSchema.omit({
  order_item_id: true,
  created_at: true,
}).describe("OrderItemForCreateSchema");
copyMetaFrom(OrderItemSchema, OrderItemForCreateSchema);

// ===== ORDER ITEM with JOINS =====

export const OrderItem_ProdDef_Category_Schema = OrderItemSchema.extend({
  order: OrderSchema,
  offering: Wio_Schema,
  product_def: ProductDefinitionSchema,
  category: ProductCategorySchema,
});
copyMetaFrom(OrderItemSchema, OrderItem_ProdDef_Category_Schema);

// ===== SCHEMAS => TYPES  =====

export type Wholesaler = z.infer<typeof WholesalerSchema>;
export type ProductCategory = z.infer<typeof ProductCategorySchema>;
export type Attribute = z.infer<typeof AttributeSchema>;
export type ProductDefinition = z.infer<typeof ProductDefinitionSchema>;
export type WholesalerCategory = z.infer<typeof WholesalerCategorySchema>;
export type WholesalerCategory_Category = z.infer<typeof WholesalerCategory_CategorySchema>;
export type WholesalerCategoryWithCount = z.infer<typeof WholesalerCategoryWithCountSchema>;
export type WholesalerItemOffering = z.infer<typeof Wio_Schema>;
export type Wio_PDef = z.infer<typeof Wio_PDef_Schema>;
export type Wio_PDef_Cat_Supp = z.infer<typeof Wio_PDef_Cat_Supp_Schema>;
export type WholesalerItemOffering_ProductDef_Category_Supplier_Nested = z.infer<typeof Wio_PDef_Cat_Supp_Nested_Schema>;
export type WholesalerOfferingLink = z.infer<typeof WholesalerOfferingLinkSchema>;
export type WholesalerOfferingAttribute = z.infer<typeof WholesalerOfferingAttributeSchema>;
export type WholesalerOfferingAttribute_Attribute = z.infer<typeof WholesalerOfferingAttribute_AttributeSchema>;
export type Material = z.infer<typeof MaterialSchema>;
export type Form = z.infer<typeof FormSchema>;
export type Order = z.infer<typeof OrderSchema>;
export type Order_Wholesaler = z.infer<typeof Order_Wholesaler_Schema>;
export type OrderItem = z.infer<typeof OrderItemSchema>;
export type OrderItem_ProdDef_Category = z.infer<typeof OrderItem_ProdDef_Category_Schema>;

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
} as const;

// ===== HELPER EXPORT =====
export { createSchemaWithMeta, type WithMeta };

// DEBUG: log.debug(`+++++ domainTypes.ts, Order_Wholesaler_Schema: ${JSON.stringify(Order_Wholesaler_Schema, null, 4)}`)
