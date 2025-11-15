import type { WhereCondition, WhereConditionGroup, SortDescriptor, ComparisonOperator } from "$lib/backendQueries/queryGrammar";
import type { QualifiedColumnsFromBrandedSchemaWithJoins } from "$lib/domain/domainTypes.utils";
import type { SvelteComponent } from "svelte";
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
  click?: (row: T, options?: { _blankWindow?: boolean }) => void; // Primary click action (usually navigation). options._blankWindow=true opens in new tab
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

// ===== SELECTION ================================================================================

/**
 * Callback invoked when the selection state changes.
 * Receives the current set of selected IDs.
 */
export type SelectionChangeHandler = (selectedIds: Set<ID>) => void;

// ===== SNIPPETS =================================================================================

/**
 * Props passed to the toolbar snippet.
 */
export type ToolbarSnippetProps = {
  selectedIds: Set<ID>;
  deletingObjectIds: Set<ID>;
  deleteSelected: () => Promise<void> | void;
};

// ===== CUSTOM FILTERS ==========================================================================

/**
 * Callback that generates WhereCondition(s) based on custom UI state.
 * Returns null to clear/remove the filter.
 */
export type CustomFilterCallback<T> = (
  state: any
) => WhereCondition<T> | WhereConditionGroup<T> | null;

/**
 * Placement configuration for custom filters.
 */
export type CustomFilterPlacement = {
  /** Where to place the filter */
  type: 'quickfilter' | 'column';
  /** Position within that placement area (0 = first, 1 = second, etc.) */
  pos: number;
};

/**
 * Definition for a custom filter UI component.
 */
export type CustomFilterDef<T> = {
  /** Unique identifier for this custom filter (used as Map key) */
  id: string;

  /** Display label for the filter UI */
  label: string;

  /** Type of UI component to render */
  type: 'checkbox' | 'radio' | 'select' | 'custom';

  /** Options for select/radio types */
  options?: Array<{
    label: string;
    value: any;
    description?: string;
  }>;

  /** Default state value when filter is initialized */
  defaultValue?: any;

  /** Where to place this filter in the UI */
  placement: CustomFilterPlacement;

  /**
   * Callback that converts UI state into WhereCondition(s).
   * Return null to remove the filter.
   */
  buildCondition: CustomFilterCallback<T>;

  /**
   * Optional: Custom Svelte component for 'custom' type.
   * Component receives props: { value: any, onChange: (newValue: any) => void }
   */
  component?: typeof SvelteComponent;

  /**
   * Optional: Column key to synchronize with.
   * When this Quick-Filter changes, the corresponding column filter will be updated.
   * When the column filter changes, this Quick-Filter will be updated (if possible).
   * 
   * Example: If quickFilter.id = 'has_offerings' and syncToColumnKey = 'offering_count',
   * then setting the quick filter will also set offering_count > 0 in the normal filter.
   */
  syncToColumnKey?: string;
};
