// Wenn accessor vorhanden: key kann beliebig sein (da accessor die Logik übernimmt)
export type ColumnDefWithAccessor<T> = {
  key: keyof T;
  header: string;
  accessor: ((row: T) => unknown) | null;
  sortable?: boolean;
  width?: string;
  class?: string;
};

// Wenn kein accessor: key muss gültiges Property sein
export type ColumnDefDirect<T> = {
  key: keyof T; // NUR gültige Property-Namen
  header: string;
  accessor?: never; // kein accessor erlaubt
  sortable?: boolean;
  width?: string;
  class?: string;
};

// Union: entweder direct access ODER accessor
export type ColumnDef<T> = ColumnDefWithAccessor<T> | ColumnDefDirect<T>;

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
