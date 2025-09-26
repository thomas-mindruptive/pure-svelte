// src/lib/clientAndBack/queryConfig.ts

/**
 * @file Domain-Specific Query Configuration with FINAL, CORRECTED Type Safety
 * @description This object contains all security whitelists for database queries.
 * It is now strictly validated against the UNMODIFIED `domain/types.ts`.
 */

import { ComparisonOperator, JoinType, LogicalOperator, type JoinClause, type QueryPayload } from "$lib/backendQueries/queryGrammar";
import type { BaseTableConfig, PredefinedQueryConfig, ValidFromClause } from "./queryConfig.types";

export interface QueryConfig {
  allowedTables: BaseTableConfig & PredefinedQueryConfig;
  joinConfigurations?: {
    [viewName: string]: {
      from: ValidFromClause;
      joins: JoinClause[];
      exampleQuery?: QueryPayload<unknown>;
    };
  };
}

// --- The Configuration Object ---

export const supplierQueryConfig: QueryConfig = {
  allowedTables: {
    // Validated against BaseTableConfig and the original domain/types.ts
    "dbo.wholesalers": ["wholesaler_id", "name", "region", "status", "dropship", "created_at", "website", "b2b_notes"],
    "dbo.product_categories": ["category_id", "name", "description"],
    "dbo.wholesaler_categories": ["wholesaler_id", "category_id", "comment", "link", "created_at"],
    "dbo.wholesaler_item_offerings": [
      "offering_id",
      "wholesaler_id",
      "category_id",
      "product_def_id",
      "size",
      "dimensions",
      "price",
      "currency",
      "comment",
      "created_at",
    ],
    "dbo.wholesaler_offering_attributes": ["offering_id", "attribute_id", "value"],
    "dbo.wholesaler_offering_links": ["link_id", "offering_id", "url", "notes", "created_at"],
    "dbo.product_definitions": ["product_def_id", "title", "description", "category_id"],
    "dbo.attributes": ["attribute_id", "name", "description"],
    "dbo.orders": ["order_id", "order_date", "order_number", "status", "total_amount", "currency", "notes", "created_at"],
    "dbo.order_items": ["order_item_id", "order_id", "offering_id", "quantity", "unit_price", "line_total", "item_notes", "created_at"],

    // Validate columns for join configurations below. Validated against typos through "PredefinedQueryConfig"
    supplier_categories: [
      "w.wholesaler_id",
      "w.name AS supplier_name",
      "wc.wholesaler_id",
      "wc.category_id",
      "pc.category_id",
      "pc.name",
      "pc.name AS category_name",
      "pc.description AS category_description",
      "wc.comment",
      "wc.link",
    ],
    category_offerings: [
      "pc.category_id",
      "pc.name AS category_name",
      "pc.description AS category_description",
      "wio.category_id",
      "wio.offering_id",
      "wio.price",
      "wio.created_at",
      "wio.wholesaler_id",
    ],
    offering_attributes: [
      "wio.offering_id",
      "wio.price",
      "wio.category_id",
      "woa.attribute_id",
      "woa.value",
      "woa.offering_id",
      "a.name",
      "a.attribute_id",
    ],
    offering_links: [
      "wio.offering_id",
      "wio.price",
      "wio.category_id",
      "wol.offering_id",
      "wol.created_at",
      "wol.link_id",
      "wol.url",
      "wol.notes",
    ],
    product_definition_offerings: [
      "wio.offering_id",
      "wio.price",
      "wio.currency",
      "wio.comment",
      "wio.product_def_id",
      "pd.title AS product_def_title",
      "pc.name AS category_name",
      "w.name AS supplier_name", // The required supplier name for the grid
    ],
    order_order_items: []
  },
  joinConfigurations: {
    supplier_categories: {
      from: { table: "dbo.wholesalers", alias: "w" },
      joins: [
        {
          type: JoinType.INNER,
          table: "dbo.wholesaler_categories",
          alias: "wc",
          on: {
            joinCondOp: LogicalOperator.AND,
            conditions: [{ columnA: "w.wholesaler_id", op: ComparisonOperator.EQUALS, columnB: "wc.wholesaler_id" }],
          },
        },
        {
          type: JoinType.INNER,
          table: "dbo.product_categories",
          alias: "pc",
          on: {
            joinCondOp: LogicalOperator.AND,
            conditions: [{ columnA: "wc.category_id", op: ComparisonOperator.EQUALS, columnB: "pc.category_id" }],
          },
        },
      ],
    },
    "supplier_category->category": {
      from: { table: "dbo.wholesaler_categories", alias: "wc" },
      joins: [
        {
          type: JoinType.INNER,
          table: "dbo.product_categories",
          alias: "pc",
          on: {
            joinCondOp: LogicalOperator.AND,
            conditions: [{ columnA: "wc.category_id", op: ComparisonOperator.EQUALS, columnB: "pc.category_id" }],
          },
        },
      ],
    },
    category_offerings: {
      from: { table: "dbo.product_categories", alias: "pc" },
      joins: [
        {
          type: JoinType.INNER,
          table: "dbo.wholesaler_item_offerings",
          alias: "wio",
          on: {
            joinCondOp: LogicalOperator.AND,
            conditions: [{ columnA: "pc.category_id", op: ComparisonOperator.EQUALS, columnB: "wio.category_id" }],
          },
        },
        {
          type: JoinType.INNER, // oder LEFT, falls ein Offering ohne Product Definition existieren könnte
          table: "dbo.product_definitions",
          alias: "pd",
          on: {
            joinCondOp: LogicalOperator.AND,
            conditions: [{ columnA: "wio.product_def_id", op: ComparisonOperator.EQUALS, columnB: "pd.product_def_id" }],
          },
        },
      ],
    },
    wholesaler_category_offerings: {
      from: { table: "dbo.wholesaler_categories", alias: "wc" },
      joins: [
        {
          type: JoinType.INNER,
          table: "dbo.wholesaler_item_offerings",
          alias: "wio",
          on: {
            joinCondOp: LogicalOperator.AND,
            conditions: [{ columnA: "wc.wholesaler_id", op: ComparisonOperator.EQUALS, columnB: "wio.wholesaler_id" }],
          },
        },
      ],
    },
    wholesaler_item_offering_product_def: {
      from: { table: "dbo.wholesaler_item_offerings", alias: "wio" },
      joins: [
        {
          type: JoinType.INNER,
          table: "dbo.product_definitions",
          alias: "pd",
          on: {
            joinCondOp: LogicalOperator.AND,
            conditions: [{ columnA: "wio.product_def_id", op: ComparisonOperator.EQUALS, columnB: "pd.product_def_id" }],
          },
        },
      ],
    },
    offering_attributes: {
      from: { table: "dbo.wholesaler_item_offerings", alias: "wio" },
      joins: [
        {
          type: JoinType.INNER,
          table: "dbo.wholesaler_offering_attributes",
          alias: "woa",
          on: {
            joinCondOp: LogicalOperator.AND,
            conditions: [{ columnA: "wio.offering_id", op: ComparisonOperator.EQUALS, columnB: "woa.offering_id" }],
          },
        },
        {
          type: JoinType.INNER,
          table: "dbo.attributes",
          alias: "a",
          on: {
            joinCondOp: LogicalOperator.AND,
            conditions: [{ columnA: "woa.attribute_id", op: ComparisonOperator.EQUALS, columnB: "a.attribute_id" }],
          },
        },
      ],
    },
    offering_links: {
      from: { table: "dbo.wholesaler_item_offerings", alias: "wio" },
      joins: [
        {
          type: JoinType.INNER,
          table: "dbo.wholesaler_offering_links",
          alias: "wol",
          on: {
            joinCondOp: LogicalOperator.AND,
            conditions: [{ columnA: "wio.offering_id", op: ComparisonOperator.EQUALS, columnB: "wol.offering_id" }],
          },
        },
      ],
    },
    product_definition_offerings: {
      from: { table: "dbo.wholesaler_item_offerings", alias: "wio" },
      joins: [
        {
          type: JoinType.INNER,
          table: "dbo.product_definitions",
          alias: "pd",
          on: {
            joinCondOp: LogicalOperator.AND,
            conditions: [{ columnA: "wio.product_def_id", op: ComparisonOperator.EQUALS, columnB: "pd.product_def_id" }],
          },
        },
        {
          type: JoinType.INNER,
          table: "dbo.product_categories",
          alias: "pc",
          on: {
            joinCondOp: LogicalOperator.AND,
            conditions: [{ columnA: "wio.category_id", op: ComparisonOperator.EQUALS, columnB: "pc.category_id" }],
          },
        },
        {
          type: JoinType.INNER,
          table: "dbo.wholesalers",
          alias: "w",
          on: {
            joinCondOp: LogicalOperator.AND,
            conditions: [{ columnA: "wio.wholesaler_id", op: ComparisonOperator.EQUALS, columnB: "w.wholesaler_id" }],
          },
        },
      ],
    },
  },
};


