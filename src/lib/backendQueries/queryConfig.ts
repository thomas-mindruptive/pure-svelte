// src/lib/clientAndBack/queryConfig.ts

/**
 * @file Domain-Specific Query Configuration with FINAL, CORRECTED Type Safety
 * @description This object contains all security whitelists for database queries.
 * It is now strictly validated against the UNMODIFIED `domain/types.ts`.
 */

import { ComparisonOperator, JoinType, LogicalOperator, type QueryPayload } from "$lib/backendQueries/queryGrammar";
import { Order_Wholesaler_Schema, OrderItem_ProdDef_Category_Schema, Wio_PDef_Cat_Supp_Nested_Schema } from "$lib/domain/domainTypes";
import { genTypedQualifiedColumns } from "$lib/domain/domainTypes.utils";

type Optional<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;

type QueryConfigEntry = Required<Pick<QueryPayload<any>, "from">> & Optional<QueryPayload<any>, "select">;

export interface QueryConfig {
  predefinedQueryies: { [viewName: string]: QueryConfigEntry };
}

// --- The Configuration Object ---

export const queryConfig: QueryConfig = {
  predefinedQueryies: {
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
    category_offerings_proddef: {
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
    "offering->product_def->category->wholesaler": {
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
      select: genTypedQualifiedColumns(Wio_PDef_Cat_Supp_Nested_Schema, true),
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
    "order->wholesaler": {
      // Fully qualify all columns. => qualifyAllColsFully = true.
      select: genTypedQualifiedColumns(Order_Wholesaler_Schema, true),
      from: { table: "dbo.orders", alias: "ord" },
      joins: [
        {
          type: JoinType.INNER,
          table: "dbo.wholesalers",
          alias: "w",
          on: {
            joinCondOp: "AND",
            conditions: [{ columnA: "ord.wholesaler_id", op: "=", columnB: "w.wholesaler_id" }],
          },
        }
      ],
      orderBy: [{ key: "ord.order_date", direction: "desc" }]
    },
    "order->order_items->product_def->category": {
      select: genTypedQualifiedColumns(OrderItem_ProdDef_Category_Schema, true),
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
            conditions: [{ columnA: "ori.offering_id", op: "=", columnB: "wio.offering_id" }],
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
