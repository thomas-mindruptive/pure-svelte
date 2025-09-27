import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { transformToNestedObjects } from './recordsetTransformer';

describe('recordsetTransformer', () => {
  // Define schemas
  const OrderItemSchema = z.object({
    order_item_id: z.number(),
    quantity: z.number(),
    order_id: z.number()
  });

  const ProductDefSchema = z.object({
    product_def_id: z.number(),
    name: z.string(),
    description: z.string().nullable()
  });

  const CategorySchema = z.object({
    category_id: z.number(),
    name: z.string()
  });

  const ExtendedSchema = OrderItemSchema.extend({
    product_def: ProductDefSchema,
    category: CategorySchema
  });

  // Create mock AliasedTableRegistry
  const mockAliasedTableRegistry = {
    "ori": {
      schema: OrderItemSchema,
      tableName: "order_items",
      dbSchema: "dbo",
      alias: "ori"
    },
    "pd": {
      schema: ProductDefSchema,
      tableName: "product_definitions",
      dbSchema: "dbo",
      alias: "pd"
    },
    "pc": {
      schema: CategorySchema,
      tableName: "categories",
      dbSchema: "dbo",
      alias: "pc"
    }
  } as const;

  describe('transformToNestedObjects', () => {
    it('should transform flat recordset to nested objects', () => {
      const recordset = [
        {
          order_item_id: 1,
          quantity: 5,
          order_id: 100,
          "pd.product_def_id": 10,
          "pd.name": "Widget Pro",
          "pd.description": "High quality widget",
          "pc.category_id": 2,
          "pc.name": "Electronics"
        },
        {
          order_item_id: 2,
          quantity: 3,
          order_id: 101,
          "pd.product_def_id": 11,
          "pd.name": "Gadget Plus",
          "pd.description": null,
          "pc.category_id": 3,
          "pc.name": "Tools"
        }
      ];

      const result = transformToNestedObjects(recordset, ExtendedSchema, mockAliasedTableRegistry);

      expect(result).toEqual([
        {
          order_item_id: 1,
          quantity: 5,
          order_id: 100,
          product_def: {
            product_def_id: 10,
            name: "Widget Pro",
            description: "High quality widget"
          },
          category: {
            category_id: 2,
            name: "Electronics"
          }
        },
        {
          order_item_id: 2,
          quantity: 3,
          order_id: 101,
          product_def: {
            product_def_id: 11,
            name: "Gadget Plus",
            description: null
          },
          category: {
            category_id: 3,
            name: "Tools"
          }
        }
      ]);
    });

    it('should handle empty recordset', () => {
      const result = transformToNestedObjects([], ExtendedSchema, mockAliasedTableRegistry);
      expect(result).toEqual([]);
    });

    it('should handle recordset with only direct fields', () => {
      const recordset = [
        {
          order_item_id: 1,
          quantity: 5,
          order_id: 100
        }
      ];

      const result = transformToNestedObjects(recordset, OrderItemSchema, mockAliasedTableRegistry);

      expect(result).toEqual([
        {
          order_item_id: 1,
          quantity: 5,
          order_id: 100
        }
      ]);
    });

    it('should throw error for unexpected qualified column', () => {
      const recordset = [
        {
          order_item_id: 1,
          quantity: 5,
          "unknown.field": "value"
        }
      ];

      expect(() => transformToNestedObjects(recordset, ExtendedSchema, mockAliasedTableRegistry))
        .toThrow("Row 0: Unexpected column 'unknown.field' not defined in schema");
    });

    it('should throw error for unexpected direct column', () => {
      const recordset = [
        {
          order_item_id: 1,
          quantity: 5,
          unexpected_field: "value"
        }
      ];

      expect(() => transformToNestedObjects(recordset, OrderItemSchema, mockAliasedTableRegistry))
        .toThrow("Row 0: Unexpected column 'unexpected_field' not defined in schema");
    });

    it('should throw error for qualified column with wrong alias', () => {
      const recordset = [
        {
          order_item_id: 1,
          quantity: 5,
          "pd.product_def_id": 10,
          "wrongalias.name": "Something"
        }
      ];

      expect(() => transformToNestedObjects(recordset, ExtendedSchema, mockAliasedTableRegistry))
        .toThrow("Row 0: Unexpected column 'wrongalias.name' not defined in schema");
    });

    it('should throw error for qualified column with wrong field name', () => {
      const recordset = [
        {
          order_item_id: 1,
          quantity: 5,
          "pd.product_def_id": 10,
          "pd.wrong_field": "Something"
        }
      ];

      expect(() => transformToNestedObjects(recordset, ExtendedSchema, mockAliasedTableRegistry))
        .toThrow("Row 0: Unexpected column 'pd.wrong_field' not defined in schema");
    });

    it('should handle partial nested objects', () => {
      const recordset = [
        {
          order_item_id: 1,
          quantity: 5,
          order_id: 100,
          "pd.product_def_id": 10,
          "pd.name": "Widget Pro"
          // Missing pd.description and all category fields
        }
      ];

      const result = transformToNestedObjects(recordset, ExtendedSchema, mockAliasedTableRegistry);

      expect(result).toEqual([
        {
          order_item_id: 1,
          quantity: 5,
          order_id: 100,
          product_def: {
            product_def_id: 10,
            name: "Widget Pro"
          }
          // category object not created if no fields present
        }
      ]);
    });
  });
});