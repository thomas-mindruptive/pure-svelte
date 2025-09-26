import { log } from "$lib/utils/logger";
import { z } from "zod";

// ===== ALL ENTITIES =====

export const AllEntitiesSchema = z
  .enum(["wholesalers", "categories", "product_definitions", "offerings", "attributes", "links", "orders", "order_items"])
  .describe("AllEntitiesSchema");

// ===== WHOLESALER (dbo.wholesalers) =====

export const WholesalerPriceRangeSchema = z
  .enum(["very expensive", "expensive", "medium", "cheap", "very cheap"])
  .describe("WholesalerPriceRangeSchema");

export const WholesalerRelevanceSchema = z.enum(["lowest", "low", "medium", "high", "highest"]).describe("WholesalerRelevanceSchema");

export type WholesalerPriceRange = z.infer<typeof WholesalerPriceRangeSchema>;
export type WholesalerRelevance = z.infer<typeof WholesalerRelevanceSchema>;

export const WholesalerSchema = z
  .object({
    wholesaler_id: z.number().int().positive(),
    name: z.string().max(200),
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

/**
 * Schema for creating a new Wholesaler.
 * Omits server-generated fields like the primary key and timestamps.
 */
export const WholesalerForCreateSchema = WholesalerSchema.omit({
  wholesaler_id: true,
  created_at: true,
}).describe("WholesalerForCreateSchema");

// ===== PRODUCT CATEGORY (dbo.product_categories) =====
export const ProductCategorySchema = z
  .object({
    category_id: z.number().int().positive(),
    name: z.string().max(200),
    description: z.string().max(500).nullable().optional(),
  })
  .describe("ProductCategorySchema");

/**
 * Schema for creating a new ProductCategory.
 * Omits the server-generated primary key.
 */
export const ProductCategoryForCreateSchema = ProductCategorySchema.omit({
  category_id: true,
}).describe("ProductCategoryForCreateSchema");

// ===== ATTRIBUTE (dbo.attributes) =====

export const AttributeSchema = z
  .object({
    attribute_id: z.number().int().positive(),
    name: z.string().max(200),
    description: z.string().max(500).nullable().optional(),
  })
  .describe("AttributeSchema");

/**
 * Schema for creating a new Attribute.
 * Omits the server-generated primary key.
 */
export const AttributeForCreateSchema = AttributeSchema.omit({
  attribute_id: true,
}).describe("AttributeForCreateSchema");

// ===== PRODUCT DEFINITION (dbo.product_definitions) =====

export const ProductDefinitionSchema = z
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

/**
 * Schema for creating a new ProductDefinition.
 * Omits server-generated fields.
 */
export const ProductDefinitionForCreateSchema = ProductDefinitionSchema.omit({
  product_def_id: true,
  created_at: true,
}).describe("ProductDefinitionForCreateSchema");

// ===== WHOLESALER CATEGORY (dbo.wholesaler_categories) =====

export const WholesalerCategorySchema = z
  .object({
    wholesaler_id: z.number().int().positive(),
    category_id: z.number().int().positive(),
    comment: z.string().max(1000).nullable().optional(),
    link: z.string().url().max(2048).nullable().optional(),
    created_at: z.string().optional(),
  })
  .describe("WholesalerCategorySchema");

/**
 * Schema for creating a new WholesalerCategory assignment.
 * Client provides foreign keys and data, but not the timestamp.
 */
export const WholesalerCategoryForCreateSchema = WholesalerCategorySchema.omit({
  created_at: true,
}).describe("WholesalerCategoryForCreateSchema");

// ===== WHOLESALER CATEGORY including joins (dbo.wholesaler_categories) =====

export const WholesalerCategory_CategorySchema = WholesalerCategorySchema.extend({
  category_name: z.string(),
  category_description: z.string().nullable().optional(),
}).describe("WholesalerCategory_CategorySchema");

// ===== EXTENDED TYPES FOR MOCK DATA =====

export const WholesalerCategoryWithCountSchema = WholesalerCategory_CategorySchema.extend({
  offering_count: z.number().int().nonnegative().optional(),
}).describe("WholesalerCategoryWithCountSchema");

// ===== WHOLESALER ITEM OFFERING (dbo.wholesaler_item_offerings) =====

export const WholesalerItemOfferingSchema = z
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

/**
 * Schema for creating a new WholesalerItemOffering.
 * Omits server-generated fields.
 */
export const WholesalerItemOfferingForCreateSchema = WholesalerItemOfferingSchema.omit({
  offering_id: true,
  created_at: true,
}).describe("WholesalerItemOfferingForCreateSchema");

// ===== WHOLESALER ITEM OFFERING including join to product_def  =====

export const WholesalerItemOffering_ProductDefSchema = WholesalerItemOfferingSchema.extend({
  product_def_title: z.string().optional(),
  product_def_description: z.string().nullable().optional(),
}).describe("WholesalerItemOffering_ProductDefSchema");

// ===== WHOLESALER ITEM OFFERING including joins (dbo.wholesaler_item_offerings) to product_def and category =====

export const WholesalerItemOffering_ProductDef_Category_SupplierSchema = WholesalerItemOfferingSchema.extend({
  product_def_title: z.string().optional(),
  product_def_description: z.string().nullable().optional(),
  category_name: z.string().optional(),
  category_description: z.string().nullable().optional(),
  wholesaler_name: z.string().optional(),
}).describe("WholesalerItemOffering_ProductDef_Category_SupplierSchema");

// ===== WHOLESALER OFFERING LINK (dbo.wholesaler_offering_links) =====

export const WholesalerOfferingLinkSchema = z
  .object({
    link_id: z.number().int().positive(),
    offering_id: z.number().int().positive(),
    url: z.string().url().max(2048),
    notes: z.string().max(500).nullable().optional(),
    created_at: z.string().optional(),
  })
  .describe("WholesalerOfferingLinkSchema");

/**
 * Schema for creating a new WholesalerOfferingLink.
 * Omits server-generated fields.
 */
export const WholesalerOfferingLinkForCreateSchema = WholesalerOfferingLinkSchema.omit({
  link_id: true,
  created_at: true,
}).describe("WholesalerOfferingLinkForCreateSchema");

// ===== WHOLESALER OFFERING ATTRIBUTE (dbo.wholesaler_offering_attributes) =====

export const WholesalerOfferingAttributeSchema = z
  .object({
    offering_id: z.number().int().positive(),
    attribute_id: z.number().int().positive(),
    value: z.string().max(200).nullable().optional(),
  })
  .describe("WholesalerOfferingAttributeSchema");

/**
 * Schema for creating a new WholesalerOfferingAttribute assignment.
 * The client provides all fields for this relationship.
 */
export const WholesalerOfferingAttributeForCreateSchema = WholesalerOfferingAttributeSchema.describe(
  "WholesalerOfferingAttributeForCreateSchema",
);

// ===== WHOLESALER OFFERING ATTRIBUTE including joins (dbo.wholesaler_offering_attributes) =====

export const WholesalerOfferingAttribute_AttributeSchema = WholesalerOfferingAttributeSchema.extend({
  attribute_name: z.string().optional(),
  attribute_description: z.string().nullable().optional(),
}).describe("WholesalerOfferingAttribute_AttributeSchema");

// ===== MATERIAL (dbo.materials) =====

export const MaterialSchema = z
  .object({
    material_id: z.number().int().positive(),
    name: z.string().max(100),
  })
  .describe("MaterialSchema");

/**
 * Schema for creating a new Material.
 * Omits the server-generated primary key.
 */
export const MaterialForCreateSchema = MaterialSchema.omit({
  material_id: true,
}).describe("MaterialForCreateSchema");

// ===== FORM (dbo.forms) =====

export const FormSchema = z
  .object({
    form_id: z.number().int().positive(),
    name: z.string().max(100),
  })
  .describe("FormSchema");

/**
 * Schema for creating a new Form.
 * Omits the server-generated primary key.
 */
export const FormForCreateSchema = FormSchema.omit({
  form_id: true,
}).describe("FormForCreateSchema");

// ===== ORDER (dbo.orders) =====

export const OrderStatusSchema = z
  .enum(["pending", "confirmed", "processing", "shipped", "delivered", "cancelled"])
  .describe("OrderStatusSchema");

export type OrderStatus = z.infer<typeof OrderStatusSchema>;

export const OrderSchema = z
  .object({
    order_id: z.number().int().positive(),
    order_date: z.string(), // ISO date string
    order_number: z.string().max(100).nullable().optional(),
    status: OrderStatusSchema,
    total_amount: z.number().multipleOf(0.01).nullable().optional(),
    currency: z.string().length(3).nullable().optional(),
    notes: z.string().max(1000).nullable().optional(),
    created_at: z.string().optional(),
  })
  .describe("OrderSchema");

export const OrderForCreateSchema = OrderSchema.omit({
  order_id: true,
  created_at: true,
}).describe("OrderForCreateSchema");

// ===== ORDER ITEM (dbo.order_items) =====

export const OrderItemSchema = z
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

export const OrderItemForCreateSchema = OrderItemSchema.omit({
  order_item_id: true,
  created_at: true,
}).describe("OrderItemForCreateSchema");

export type Order = z.infer<typeof OrderSchema>;
export type OrderItem = z.infer<typeof OrderItemSchema>;

// ===== SCHEMAS => TYPES  =====

export type AllEntities = z.infer<typeof AllEntitiesSchema>;
export type AllEntitiesSetType = Set<AllEntities>;

export type Wholesaler = z.infer<typeof WholesalerSchema>;
export type ProductCategory = z.infer<typeof ProductCategorySchema>;
export type Attribute = z.infer<typeof AttributeSchema>;
export type ProductDefinition = z.infer<typeof ProductDefinitionSchema>;
export type WholesalerCategory = z.infer<typeof WholesalerCategorySchema>;
export type WholesalerCategory_Category = z.infer<typeof WholesalerCategory_CategorySchema>;
export type WholesalerCategoryWithCount = z.infer<typeof WholesalerCategoryWithCountSchema>;
export type WholesalerItemOffering = z.infer<typeof WholesalerItemOfferingSchema>;
export type WholesalerItemOffering_ProductDef = z.infer<typeof WholesalerItemOffering_ProductDefSchema>;
export type WholesalerItemOffering_ProductDef_Category_Supplier = z.infer<typeof WholesalerItemOffering_ProductDef_Category_SupplierSchema>;
export type WholesalerOfferingLink = z.infer<typeof WholesalerOfferingLinkSchema>;
export type WholesalerOfferingAttribute = z.infer<typeof WholesalerOfferingAttributeSchema>;
export type WholesalerOfferingAttribute_Attribute = z.infer<typeof WholesalerOfferingAttribute_AttributeSchema>;
export type Material = z.infer<typeof MaterialSchema>;
export type Form = z.infer<typeof FormSchema>;

// ===== SCHEMA MAP =====

export const AllSchemas = {
  wholesalers: WholesalerSchema,
  categories: ProductCategorySchema,
  product_definitions: ProductDefinitionSchema,
  offerings: WholesalerItemOfferingSchema,
  attributes: AttributeSchema,
  links: WholesalerOfferingLinkSchema,
  orders: OrderSchema,
  order_items: OrderItemSchema,
} as const satisfies Record<AllEntities, z.ZodTypeAny>;

// ===== UTILS =====

/**
 * ValidationResultFor represents the outcome of validating data
 * against a specific Zod schema.
 *
 * Understanding `z.output<S>`:
 * ---------------------------------------
 * - A Zod schema describes what a valid object should look like.
 * - `z.output<S>` is the exact **TypeScript type of the object you
 *   get back after Zod has successfully checked and cleaned it**.
 * - Think of it as “the final, trustworthy data” after validation.
 *   For example, if the schema says there must be
 *     { id: number; name: string }
 *   then `z.output<S>` is exactly { id: number; name: string }.
 *
 * The type below is a union of two cases:
 * 1. **Success**:
 *      - `isValid` is true.
 *      - `sanitized` contains the cleaned data with the type
 *        guaranteed by the schema (`z.output<S>`).
 *      - `errors` is an empty object.
 * 2. **Failure**:
 *      - `isValid` is false.
 *      - `errors` holds error messages for each field (and optional
 *        global errors).
 *      - `sanitized` is undefined because there is no valid data.
 */
export type ValidationResultFor<S extends z.ZodTypeAny> =
  | {
      isValid: true;
      errors: Record<string, never>;
      sanitized: z.output<S>;
    }
  | {
      isValid: false;
      errors: Record<string, string[]>;
      sanitized: undefined;
    };

/**
 * Validate any input against a given Zod schema.
 *
 * @param schema  The Zod schema describing the required shape of the data.
 * @param data    The raw input to check.
 * @returns       A ValidationResultFor<S>:
 *                  - On success: { isValid: true, sanitized: cleaned data }
 *                  - On failure: { isValid: false, errors: detailed messages }
 */
export function validateEntity<S extends z.ZodTypeAny>(schema: S, data: unknown): ValidationResultFor<S> {
  const res = schema.safeParse(data);
  const validationResult = toValidationResult(res);
  log.debug(`Validated through ${schema.description}`, validationResult);
  return validationResult;
}

/**
 * Convert the result of schema.safeParse into our unified ValidationResultFor<S>.
 *
 * - Uses `z.flattenError` (the Zod v4 helper) to collect
 *   both field-specific errors and form-level (“global”) errors.
 */
export function toValidationResult<S extends z.ZodTypeAny>(result: z.ZodSafeParseResult<z.output<S>>): ValidationResultFor<S> {
  if (result.success) {
    return {
      isValid: true,
      errors: {} as Record<string, never>,
      sanitized: result.data,
    };
  }
  const { fieldErrors, formErrors } = z.flattenError(result.error);

  // Ensure we only keep fields that actually have messages
  const errors: Record<string, string[]> = {};
  for (const [key, arr] of Object.entries(fieldErrors as Record<string, string[] | undefined>)) {
    if (arr && arr.length) errors[key] = arr;
  }

  // Global errors (not tied to a specific field) are stored under "_root"
  if (formErrors.length) errors._root = formErrors;

  return {
    isValid: false,
    errors,
    sanitized: undefined,
  };
}

// Sample usage
const validationResult = validateEntity(WholesalerSchema, {});
const sanitized = validationResult.sanitized;
void sanitized;
