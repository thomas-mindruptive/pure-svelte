import type { WhereConditionGroup, WhereCondition, SortDescriptor, ComparisonOperator } from "$lib/backendQueries/queryGrammar";
import type { QualifiedColumnsFromBrandedSchemaWithJoins } from "$lib/domain/domainTypes.utils";
import type z from "zod";

// ===== COLUMNS ==================================================================================

export type ColumnDef<S extends z.ZodObject<any>> =
  // Case 1: A standard, sortable column with a key from the schema.
  | {
      key: QualifiedColumnsFromBrandedSchemaWithJoins<S>;
      header: string;
      accessor?: ((row: z.infer<S>) => unknown) | null; // Accessor is optional
      sortable?: boolean; // Sortable is optional
      width?: string;
      class?: string;
      isLink?: boolean;
      onClick?: ((row: z.infer<S>, col: ColumnDef<any>) => unknown) | null | undefined;
      // Filter-related fields (DataGrid2)
      filterable?: boolean;
      filterType?: 'text' | 'number' | 'boolean' | 'select';
      filterOperator?: ComparisonOperator;
      filterOptions?: { label: string; value: unknown }[];
    }
  // Case 2: A special, non-sortable column for computed values.
  | {
      key: "<computed>"; // The key is one of the allowed literals
      header: string;
      accessor: (row: z.infer<S>) => unknown; // Accessor is REQUIRED
      sortable: false; // Sortable MUST be false
      width?: string;
      class?: string;
      isLink?: boolean;
     onClick?: ((row: z.infer<S>, col: ColumnDef<any>) => unknown) | null | undefined;
    };

// ===== DELETE ===================================================================================

// Result from a delete dry-run - provides impact analysis before actual deletion
export type DryRunResult = {
  total: number; // Number of related records that would be affected
  details?: Record<string, number>; // Breakdown by category (e.g., {"orders": 5, "invoices": 2})
  recommendsCascade?: boolean; // Whether system recommends cascade delete
  [k: string]: unknown; // Extensible for domain-specific data
};

export type ID = string | number; // Universal ID type for row identification

// Context passed to delete confirmation handlers
export type ConfirmContext<T = unknown> = {
  ids: ID[]; // IDs of items being deleted
  rows: T[]; // Full row objects being deleted
  dryRun?: DryRunResult | undefined | null; // Results from dry-run analysis
  gridId?: string; // Grid identifier for logging
  entity?: string; // Entity type for user messages
};

// Result from delete confirmation - controls whether deletion proceeds
export type ConfirmResult = {
  ok: boolean; // Whether user confirmed the deletion
  options?: Record<string, unknown>; // Additional options (e.g., {cascade: true})
  reason?: string; // Why confirmation failed (for logging)
};

// ===== ROW STRATEGIES ===========================================================================

// Strategy pattern for handling row interactions
export type RowActionStrategy<T = unknown> = {
  click?: (row: T) => void; // Primary click action (usually navigation)
  doubleClick?: (row: T) => void; // Double-click action
  hover?: (row: T) => void; // Hover action (e.g., preview)
};

// Strategy pattern for delete operations - allows customization of the entire delete flow
export type DeleteStrategy<T = unknown> = {
  dryRun?: (ids: ID[], rows: T[]) => Promise<DryRunResult>; // Optional: analyze impact before deletion
  confirm?: (ctx: ConfirmContext<T>) => Promise<ConfirmResult>; // Optional: custom confirmation dialog
  execute: (ids: ID[], options?: Record<string, unknown>) => Promise<void>; // Required: perform the actual deletion
};

// ===== DATA API =================================================================================

/**
 * Loads the data for the DataGrid.
 */
export type ApiLoadFunc<T> = (where: WhereConditionGroup<T> | null, sort: SortDescriptor<T>[] | null) => Promise<T[]>;

export type ApiLoadFuncWithId<T> = (id: number, where: WhereConditionGroup<T> | null, sort: SortDescriptor<T>[] | null) => Promise<T[]>;

/**
 * Sort callback for the DataGrid.
 */
export type SortFunc<T> = (sortState: SortDescriptor<T>[] | null) => void | Promise<void>;

/**
 * Filter callback for DataGrid2.
 * Receives WhereCondition or WhereConditionGroup based on active filters.
 */
export type FilterFunc<T> = (where: WhereCondition<T> | WhereConditionGroup<T> | null) => void | Promise<void>;
