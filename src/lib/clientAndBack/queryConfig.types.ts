// src/lib/clientAndBack/queryConfig.types.ts

import type { JoinClause, QueryPayload } from './queryGrammar';
import type * as Domain from '$lib/domain/types';

// The helper types for qualified and aliased columns remain the same.
type AliasToEntityMap = { w: Domain.Wholesaler; pc: Domain.ProductCategory; /* ... */ };
type QualifiedColumns<A extends keyof AliasToEntityMap> = `${A}.${Extract<keyof AliasToEntityMap[A], string>}`;
type AliasedColumn<A extends keyof AliasToEntityMap> = `${QualifiedColumns<A>} AS ${string}`;
type AllQualifiedColumns = QualifiedColumns<keyof AliasToEntityMap>;
type AllAliasedColumns = AliasedColumn<keyof AliasToEntityMap>;


/**
 * The strictly typed interface for our query configuration object.
 * All allowed keys for `allowedTables` are now explicitly defined.
 */
export interface QueryConfig {
	allowedTables: {
		// Base tables are strictly mapped to their domain types.
		'dbo.wholesalers': (keyof Domain.Wholesaler)[];
		'dbo.product_categories': (keyof Domain.ProductCategory)[];
		'dbo.wholesaler_categories': (keyof Domain.WholesalerCategory)[];
		'dbo.wholesaler_item_offerings': (keyof Domain.WholesalerItemOffering)[];
		'dbo.wholesaler_offering_attributes': (keyof Domain.WholesalerOfferingAttribute)[];
		'dbo.wholesaler_offering_links': (keyof Domain.WholesalerOfferingLink)[];

		// Predefined query names are also explicitly listed.
		supplier_categories: (AllQualifiedColumns | AllAliasedColumns)[];
		// Add other predefined query names here, e.g., 'category_offerings': (...)[]
	};
	joinConfigurations?: {
		[viewName: string]: {
			from: string;
			joins: JoinClause[];
			exampleQuery?: QueryPayload<unknown>;
		};
	};
}