import { z } from 'zod';

// ===== LEVEL =====
export const LevelSchema = z.enum(['wholesalers', 'categories', 'offerings', 'attributes', 'links']);

// ===== WHOLESALER (dbo.wholesalers) =====
export const WholesalerSchema = z.object({
  wholesaler_id: z.number().int().positive(),
  name: z.string().max(200),
  region: z.string().max(200).nullable().optional(),
  b2b_notes: z.string().max(1000).nullable().optional(),
  status: z.string().max(100).nullable().optional(),
  dropship: z.boolean().default(false),
  website: z.string().url().max(2048).nullable().optional(),
  email: z.string().email().max(200).nullable().optional(),
  created_at: z.string().optional()
});

// ===== PRODUCT CATEGORY (dbo.product_categories) =====
export const ProductCategorySchema = z.object({
  category_id: z.number().int().positive(),
  name: z.string().max(200),
  description: z.string().max(500).nullable().optional()
});

// ===== ATTRIBUTE (dbo.attributes) =====
export const AttributeSchema = z.object({
  attribute_id: z.number().int().positive(),
  name: z.string().max(200),
  description: z.string().max(500).nullable().optional()
});

// ===== PRODUCT DEFINITION (dbo.product_definitions) =====
export const ProductDefinitionSchema = z.object({
  product_def_id: z.number().int().positive(),
  category_id: z.number().int().positive(),
  title: z.string().max(200),
  description: z.string().max(1000).nullable().optional(),
  material_id: z.number().int().positive().nullable().optional(),
  form_id: z.number().int().positive().nullable().optional(),
  created_at: z.string().optional()
});

// ===== WHOLESALER CATEGORY (dbo.wholesaler_categories) =====
export const WholesalerCategorySchema = z.object({
  wholesaler_id: z.number().int().positive(),
  category_id: z.number().int().positive(),
  comment: z.string().max(1000).nullable().optional(),
  link: z.string().url().max(2048).nullable().optional(),
  created_at: z.string().optional()
});

// ===== WHOLESALER CATEGORY including joins (dbo.wholesaler_categories) =====
export const WholesalerCategory_CategorySchema = WholesalerCategorySchema.extend({
  category_name: z.string(),
  category_description: z.string().nullable().optional()
});

// ===== EXTENDED TYPES FOR MOCK DATA =====
export const WholesalerCategoryWithCountSchema = WholesalerCategory_CategorySchema.extend({
  offering_count: z.number().int().nonnegative().optional()
});

// ===== WHOLESALER ITEM OFFERING (dbo.wholesaler_item_offerings) =====
export const WholesalerItemOfferingSchema = z.object({
  offering_id: z.number().int().positive(),
  wholesaler_id: z.number().int().positive(),
  category_id: z.number().int().positive(),
  product_def_id: z.number().int().positive(),
  size: z.string().max(50).nullable().optional(),
  dimensions: z.string().max(100).nullable().optional(),
  price: z.number().multipleOf(0.01).nullable().optional(), // precision [18,2]
  currency: z.string().length(3).nullable().optional(),
  comment: z.string().max(1000).nullable().optional(),
  created_at: z.string().optional()
});

// ===== WHOLESALER ITEM OFFERING including joins (dbo.wholesaler_item_offerings) =====
export const WholesalerItemOffering_ProductDef_CategorySchema = WholesalerItemOfferingSchema.extend({
  product_def_title: z.string().optional(),
  product_def_description: z.string().nullable().optional(),
  category_name: z.string().optional(),
  category_description: z.string().nullable().optional()
});

// ===== WHOLESALER OFFERING LINK (dbo.wholesaler_offering_links) =====
export const WholesalerOfferingLinkSchema = z.object({
  link_id: z.number().int().positive(),
  offering_id: z.number().int().positive(),
  url: z.string().url().max(2048),
  notes: z.string().max(500).nullable().optional(),
  created_at: z.string().optional()
});

// ===== WHOLESALER OFFERING ATTRIBUTE (dbo.wholesaler_offering_attributes) =====
export const WholesalerOfferingAttributeSchema = z.object({
  offering_id: z.number().int().positive(),
  attribute_id: z.number().int().positive(),
  value: z.string().max(200).nullable().optional()
});

// ===== WHOLESALER OFFERING ATTRIBUTE including joins (dbo.wholesaler_offering_attributes) =====
export const WholesalerOfferingAttribute_AttributeSchema = WholesalerOfferingAttributeSchema.extend({
  attribute_name: z.string().optional(),
  attribute_description: z.string().nullable().optional()
});

// ===== MATERIAL (dbo.materials) =====
export const MaterialSchema = z.object({
  material_id: z.number().int().positive(),
  name: z.string().max(100)
});

// ===== FORM (dbo.forms) =====
export const FormSchema = z.object({
  form_id: z.number().int().positive(),
  name: z.string().max(100)
});

// ===== TYPE EXPORTS =====
export type Level = z.infer<typeof LevelSchema>;
export type Wholesaler = z.infer<typeof WholesalerSchema>;
export type ProductCategory = z.infer<typeof ProductCategorySchema>;
export type Attribute = z.infer<typeof AttributeSchema>;
export type ProductDefinition = z.infer<typeof ProductDefinitionSchema>;
export type WholesalerCategory = z.infer<typeof WholesalerCategorySchema>;
export type WholesalerCategory_Category = z.infer<typeof WholesalerCategory_CategorySchema>;
export type WholesalerCategoryWithCount = z.infer<typeof WholesalerCategoryWithCountSchema>;
export type WholesalerItemOffering = z.infer<typeof WholesalerItemOfferingSchema>;
export type WholesalerItemOffering_ProductDef_Category = z.infer<typeof WholesalerItemOffering_ProductDef_CategorySchema>;
export type WholesalerOfferingLink = z.infer<typeof WholesalerOfferingLinkSchema>;
export type WholesalerOfferingAttribute = z.infer<typeof WholesalerOfferingAttributeSchema>;
export type WholesalerOfferingAttribute_Attribute = z.infer<typeof WholesalerOfferingAttribute_AttributeSchema>;
export type Material = z.infer<typeof MaterialSchema>;
export type Form = z.infer<typeof FormSchema>;