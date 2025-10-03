import type { WhereConditionGroup, SortDescriptor } from "$lib/backendQueries/queryGrammar";
import type { QualifiedColumnsFromBrandedSchemaWithJoins } from "$lib/domain/domainTypes.utils";
import type z from "zod";

// ===== COLUMNS ==================================================================================

// If an accessor is present: key can be anything (as accessor handles the logic)
export type ColumnDefWithAccessor<T> = {
  key: keyof T;
  header: string;
  accessor: ((row: T) => unknown) | null;
  sortable?: boolean;
  width?: string;
  class?: string;
};

// If no accessor: key must be a valid property name
export type ColumnDefDirect<T> = {
  key: keyof T; // ONLY valid property names
  header: string;
  accessor?: never; // no accessor allowed
  sortable?: boolean;
  width?: string;
  class?: string;
};

export type ColumnDefBase<S extends z.ZodObject<any>> = {
  key: QualifiedColumnsFromBrandedSchemaWithJoins<S>;
  header: string;
  accessor?: ((row: z.infer<S>) => unknown) | null;
  sortable?: boolean;
  width?: string;
  class?: string;
};

export type ColumnDefDirect_<S extends z.ZodObject<any>> = ColumnDefBase<S> & {
  accessor?: never; // no accessor allowed
}

export type ColumnDefWithAccessor_<S extends z.ZodObject<any>> = ColumnDefBase<S> & {
  accessor?: ((row: z.infer<S>) => unknown) | null;
}

// Union: either direct access OR accessor
export type ColumnDef<T> = ColumnDefWithAccessor<T> | ColumnDefDirect<T>;

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
export type SortFunc<T> = (sortState: SortDescriptor<T>[]) => void | Promise<void>;


