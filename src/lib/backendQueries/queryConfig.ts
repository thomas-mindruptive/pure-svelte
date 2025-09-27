// src/lib/clientAndBack/queryConfig.ts

/**
 * @file Domain-Specific Query Configuration with FINAL, CORRECTED Type Safety
 * @description This object contains all security whitelists for database queries.
 * It is now strictly validated against the UNMODIFIED `domain/types.ts`.
 */

import { ComparisonOperator, JoinType, LogicalOperator, type JoinClause, type QueryPayload } from "$lib/backendQueries/queryGrammar";
import type { ValidFromClause } from "./tableRegistry";

export interface QueryConfig {
  joinConfigurations: {
    [viewName: string]: {
      from: ValidFromClause;
      joins: JoinClause[];
      exampleQuery?: QueryPayload<unknown>;
    };
  };
}

// --- The Configuration Object ---

export const supplierQueryConfig: QueryConfig = {
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
    "order->order_items->product_def->category": {
      from: { table: "dbo.orders", alias: "ord" },
      joins: [
        {
          type: JoinType.INNER,
          table: "dbo.order_items",
          alias: "ori",
          on: {
            joinCondOp: "AND",
            conditions: [{ columnA: "ord.order_id", op: "=", columnB: "ori.order_id" }],
          },
        },
        {
          type: JoinType.INNER,
          table: "dbo.wholesaler_item_offerings",
          alias: "wio",
          on: {
            joinCondOp: "AND",
            conditions: [{ columnA: "ori.offering_id", op: "=", columnB: "ori.offering_id" }],
          },
        },
        {
          type: JoinType.INNER,
          table: "dbo.product_definitions",
          alias: "pd",
          on: {
            joinCondOp: "AND",
            conditions: [{ columnA: "pd.product_def_id", op: "=", columnB: "wio.product_def_id" }],
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
      ],
    },
  },
} as const satisfies QueryConfig;
