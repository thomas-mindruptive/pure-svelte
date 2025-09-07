// import type { ProductDefinition } from "$lib/domain/domainTypes";
// import { Query } from "./fluentQueryBuilder";

// // Dein komplexer Anti-JOIN mit type safety
// const antiJoinQuery = Query.for<ProductDefinition>()
//   .from('dbo.product_definitions', 'pd')
//   .select(['pd.product_def_id', 'pd.title', 'pd.description'])
//   .leftJoin('dbo.wholesaler_item_offerings', 'wio')
//     .onCondition('pd.product_def_id', '=', 'wio.product_def_id')
//     .onCondition('wio.wholesaler_id', '=', 1)
//   .where()
//     .and('wio.offering_id', 'IS NULL')
//     .and('pd.category_id', '=', 2)
//   .orderBy('pd.title', 'asc')
//   .build(); // Returns QueryPayload<ProductDefinition>