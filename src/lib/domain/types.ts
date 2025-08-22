// src/routes/supplierbrowser/types.ts - KORREKT aus object-model.json

export type Level = 'wholesalers' | 'categories' | 'offerings' | 'attributes' | 'links';

// ===== WHOLESALER (dbo.wholesalers) =====
export type Wholesaler = {
  wholesaler_id?: number;      // autoIncrement primaryKey
  name: string;                // required, unique, maxLength: 200
  region?: string;             // nullable, maxLength: 200
  b2b_notes?: string;          // nullable, maxLength: 1000
  status?: string;             // nullable, maxLength: 100
  dropship: boolean;           // required, default: false
  website?: string;            // nullable, format: uri, maxLength: 2048
  created_at?: string;         // required, default: SYSUTCDATETIME()
};

// Alias für Kompatibilität
export type Supplier = Wholesaler;

// ===== PRODUCT CATEGORY (dbo.product_categories) =====
export type ProductCategory = {
  category_id: number;         // primaryKey, autoIncrement
  name: string;                // required, unique, maxLength: 200
  description?: string;        // nullable, maxLength: 500
};

// Alias für Kompatibilität
export type Category = ProductCategory;

// ===== WHOLESALER CATEGORY (dbo.wholesaler_categories) =====
export type WholesalerCategory = {
  name: string;                // comes from join to ProductCategory 
  wholesaler_id: number;       // primaryKey
  category_id: number;         // primaryKey
  comment?: string;            // nullable, maxLength: 1000
  link?: string;               // nullable, format: uri, maxLength: 2048
  created_at?: string;         // required, default: SYSUTCDATETIME()
};


// ===== WHOLESALER ITEM OFFERING (dbo.wholesaler_item_offerings) =====
export type WholesalerItemOffering = {
  title: string;               // comes from join to product_definition!
  offering_id: number;         // primaryKey, autoIncrement
  wholesaler_id: number;       // required
  category_id: number;         // required
  product_def_id: number;      // required
  size?: string;               // nullable, maxLength: 50
  dimensions?: string;         // nullable, maxLength: 100
  price?: number;              // nullable, precision: [18,2]
  currency?: string;           // nullable, maxLength: 3
  comment?: string;            // nullable, maxLength: 1000
  created_at?: string;         // required, default: SYSUTCDATETIME()
};

// Alias für Kompatibilität
export type Offering = WholesalerItemOffering;

// ===== WHOLESALER OFFERING LINK (dbo.wholesaler_offering_links) =====
export type WholesalerOfferingLink = {
  link_id: number;             // primaryKey, autoIncrement
  offering_id: number;         // required
  url: string;                 // required, format: uri, maxLength: 2048
  notes?: string;              // nullable, maxLength: 500
  created_at?: string;         // required, default: SYSUTCDATETIME()
};

// Alias für Kompatibilität
export type Link = WholesalerOfferingLink;

// ===== WHOLESALER OFFERING ATTRIBUTE (dbo.wholesaler_offering_attributes) =====
export type WholesalerOfferingAttribute = {
  offering_id: number;         // primaryKey
  attribute_id: number;        // primaryKey
  value?: string;              // nullable, maxLength: 200
};

// ===== ATTRIBUTE (dbo.attributes) =====
export type Attribute = {
  attribute_id: number;        // primaryKey, autoIncrement
  name: string;                // required, unique, maxLength: 200
  description?: string;        // nullable, maxLength: 500
};

// ===== PRODUCT DEFINITION (dbo.product_definitions) =====
export type ProductDefinition = {
  product_def_id: number;      // primaryKey, autoIncrement
  category_id: number;         // required
  title: string;               // required, maxLength: 200
  description?: string;        // nullable, maxLength: 1000
  material_id?: number;        // nullable
  form_id?: number;            // nullable
  created_at?: string;         // required, default: SYSUTCDATETIME()
};

// ===== MATERIAL (dbo.materials) =====
export type Material = {
  material_id: number;         // primaryKey, autoIncrement
  name: string;                // required, unique, maxLength: 100
};

// ===== FORM (dbo.forms) =====
export type Form = {
  form_id: number;             // primaryKey, autoIncrement
  name: string;                // required, unique, maxLength: 100
};

// ===== VIEW TYPES für komplexe Abfragen =====
// Diese ergeben sich aus JOINs der Base-Tables

export type WholesalerWithCategories = Wholesaler & {
  categories?: (WholesalerCategory & { category_name?: string })[];
};

export type CategoryWithOfferingsCount = ProductCategory & {
  offering_count?: number;
};

export type OfferingWithDetails = WholesalerItemOffering & {
  wholesaler_name?: string;
  category_name?: string;
  product_title?: string;
};

export type AttributeWithDetails = WholesalerOfferingAttribute & {
  attribute_name?: string;
  attribute_description?: string;
};