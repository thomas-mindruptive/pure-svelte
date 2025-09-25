<script
  lang="ts"
  generics="T"
>
  // DataGrid (Svelte 5 + Runes)
  //
  // MAIN PURPOSE:
  // Generic, reusable data grid component with advanced features:
  // - Row selection (single/multiple/none)
  // - Delete operations with dry-run, confirmation, and execution phases
  // - Clickable rows with strategy pattern
  // - Sortable columns
  // - Loading states and error handling
  // - Customizable via snippets (toolbar, cells, row actions, empty state)
  // - Robust exception handling with structured logging
  // - CSS-based styling via global grid.css classes

  import type { Snippet } from "svelte";
  import { log } from "$lib/utils/logger";
  import { requestConfirmation } from "$lib/stores/confirmation";
  import { fade } from "svelte/transition";
  import "$lib/components/styles/grid.css";
  import type { ID, ColumnDef, DeleteStrategy, RowActionStrategy, DryRunResult, ConfirmResult, ApiLoadFunc } from "./Datagrid.types";

  import "$lib/components/styles/loadingIndicator.css";
  import type { SortDescriptor } from "$lib/backendQueries/queryGrammar";
  import { assertDefined } from "$lib/utils/assertions";
  import { addNotification } from "$lib/stores/notifications";
  import type { AllQualifiedColumns } from "$lib/backendQueries/queryConfig.types";

  // ===== PROP TYPES =====

  export type DataGridProps<T> = {
    // ID and entity name
    gridId?: string;
    entity?: string;

    // Layout
    maxBodyHeight?: string | undefined;

    // Parent defines initial data and loading status.
    loading?: boolean;
    rows: any[];

    // Data API if grid should load its own data, e.g. for sorting.
    apiLoadFunc?: ApiLoadFunc<T> | undefined;

    // Columns and row ids.
    columns: ColumnDef<any>[];
    getId: (row: any) => number;

    // Select and delte indicator
    selection?: "none" | "single" | "multiple";
    canDelete?: (row: any) => boolean;

    // Row strategies
    deleteStrategy: DeleteStrategy<any>;
    rowActionStrategy?: RowActionStrategy<any> | undefined | null;

    toolbar?: Snippet<[ToolbarSnippetProps]>;
    cell?: Snippet<[CellSnippetProps]>;
    rowActions?: Snippet<[RowActionsSnippetProps]>;
    empty?: Snippet<[]>;
    meta?: Snippet<[MetaSnippetProps]>;
  };

  // These define the data passed to customizable snippets

  type ToolbarSnippetProps = {
    selectedIds: Set<ID>; // Currently selected row IDs
    deletingObjectIds: Set<ID>; // IDs currently being deleted (for loading states)
    deleteSelected: () => Promise<void> | void; // Function to delete all selected rows
  };

  type CellSnippetProps = {
    row: any; // Current row data object
    col: ColumnDef<any>; // Column definition for this cell
  };

  type RowActionsSnippetProps = {
    row: any; // Current row data object
    id: ID | null; // Row ID (null if getId failed)
    isDeleting: (id: ID) => boolean; // Function to check if this row is being deleted
  };

  type MetaSnippetProps = {
    selectedIds: Set<ID>; // Currently selected row IDs
    deletingObjectIds: Set<ID>; // IDs currently being deleted
    deleteSelected: () => Promise<void> | void; // Function to delete all selected rows
  };

  // ===== COMPONENT PROPS =====

  const {
    // Metadata
    gridId = "grid", // Unique identifier for this grid instance
    entity = "item", // Human-readable entity name for messages

    maxBodyHeight,

    // Core data
    rows = [] as any[],
    columns = [] as ColumnDef<any>[],
    getId,

    // Selection behavior
    selection = "multiple" as "none" | "single" | "multiple", // Row selection mode
    canDelete = (_row: any) => true, // Function to determine if a row can be deleted

    // State
    loading = false, // Whether grid is in loading state

    // API
    apiLoadFunc,

    // Strategies
    deleteStrategy,
    rowActionStrategy,

    // Customization snippets (all optional)
    toolbar, // Custom toolbar content
    cell, // Custom cell rendering
    rowActions, // Custom row action buttons
    empty, // Custom empty state
    meta, // Additional metadata display
  }: DataGridProps<T> = $props();

  // ===== LOCAL STATE =====

  // Track which rows are currently being deleted (for loading indicators)
  const deletingObjectIds = $state<Set<ID>>(new Set());

  // Track which rows are currently selected (for bulk operations)
  const selectedIds = $state<Set<ID>>(new Set());

  // Sorting
  let sortState = $state<SortDescriptor<T>[]>([]);
  let internalRows = $state<T[]>(rows);
  let isSorting = $state(false); // Loading indicator for sorting operation

  // We need to use the internal rows, because we trigger data loading after sort.
  $effect(() => {
    internalRows = rows;
  });

  // ===== UTILITY FUNCTIONS =====

  /**
   * Generates a unique batch ID for correlating log entries across a single delete operation.
   * This is NOT a security token, just for debugging and monitoring.
   *
   * @returns Unique string identifier
   */
  function newBatchId(): string {
    // Use crypto.randomUUID if available (modern browsers), otherwise fallback to Math.random
    // @ts-ignore - globalThis typing issue
    return globalThis?.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2);
  }

  /**
   * Gets current timestamp in milliseconds for performance timing.
   * Uses performance.now() if available (more precise), otherwise Date.now().
   *
   * @returns Current timestamp in milliseconds
   */
  function nowMs(): number {
    // @ts-ignore - globalThis typing issue
    return globalThis?.performance?.now?.() ?? Date.now();
  }

  /**
   * Safely extracts ID from a row object using the provided getId function.
   * Handles and logs any exceptions thrown by getId.
   *
   * @param row - Data object to extract ID from
   * @returns ID if successful, null if getId throws or returns invalid value
   */
  function safeGetId(row: any): ID | null {
    try {
      return getId(row);
    } catch (error) {
      log.error({ component: "DataGrid", gridId, entity, error: String(error) }, "getId threw");
      return null;
    }
  }

  /**
   * Generates a stable key for each table row, required by Svelte's {#each} keying.
   * Uses row ID if available, otherwise falls back to array index.
   *
   * @param row - Data object
   * @param i - Array index
   * @returns Stable key for Svelte keying
   */
  function keyForRow(row: any, i: number): string | number {
    const id = safeGetId(row);
    return id ?? `__idx_${i}`;
  }

  /**
   * Safely extracts cell value from a row using column definition.
   * Handles custom accessor functions and direct property access.
   * Returns fallback value if extraction fails.
   *
   * @param row - Data object
   * @param col - Column definition with key and optional accessor
   * @returns Cell value or fallback "—" if extraction fails
   */
  function safeAccessor(row: any, col: ColumnDef<any>): any {
    try {
      const colName = String(col.key);
      // Not needed currently: let colInfo = `col name: ${colName}`;

      // Use custom accessor function if provided, otherwise direct property access
      if (col.accessor) {
        if (typeof col.accessor !== "function") {
          throw new Error(`Column accessor for ${colName} is not a function`);
        }
        const val = col.accessor!(row);
        if (undefined === val) {
          log.debug(`safeAccessor: Cell accessor for ${colName} returned undefined`);
          return `<not set>`;
        }
        return val;
      } else {
        // @ts-ignore - dynamic property access
        const val = row?.[col.key];
        // log.debug(
        //   `safeAccessor: safeAccessor: Direct access for ${colName} returned: ${val}`,
        // );
        if (undefined === val) {
          log.detdebug(`safeAccessor: Cell accessor for ${colName} returned undefined`);
          return `<not set>`;
        }
        return val;
      }
    } catch (error) {
      log.error(
        {
          component: "DataGrid",
          gridId,
          entity,
          column: col.key,
          error: String(error),
        },
        "Cell accessor threw",
      );
      return "—"; // Em dash as fallback for failed cell extraction
    }
  }

  /**
   * Safely checks if a row can be deleted using the provided canDelete function.
   * Handles exceptions and defaults to false (not deletable) on error.
   *
   * @param row - Data object to check
   * @returns true if row can be deleted, false if not or if canDelete throws
   */
  function isRowDeletable(row: any): boolean {
    try {
      return !!canDelete(row);
    } catch (error) {
      log.warn({ component: "DataGrid", gridId, entity, error: String(error) }, "canDelete threw; treating as not deletable");
      return false; // Fail safe - if we can't determine, assume not deletable
    }
  }

  // ===== ROW STATE HELPER FUNCTIONS =====

  /**
   * Checks if a specific ID is currently being deleted.
   *
   * @param id - Row ID to check
   * @returns true if row is currently being deleted
   */
  function isDeleting(id: ID): boolean {
    return deletingObjectIds.has(id);
  }

  /**
   * Checks if a specific row is currently being deleted.
   * Safely handles rows without valid IDs.
   *
   * @param row - Data object to check
   * @returns true if row is currently being deleted
   */
  function rowIsDeleting(row: any): boolean {
    const id = safeGetId(row);
    const result = id != null && isDeleting(id);
    return result;
  }

  /**
   * Checks if a specific row is currently selected.
   * Respects the selection mode setting.
   *
   * @param row - Data object to check
   * @returns true if row is currently selected
   */
  function rowIsSelected(row: any): boolean {
    if (selection === "none") return false; // No selection allowed
    const id = safeGetId(row);
    return id != null && selectedIds.has(id);
  }

  /**
   * Generates CSS class string for a table row based on its state.
   * Used for visual feedback (dimming during deletion, etc.).
   *
   * @param row - Data object
   * @returns CSS class string
   */
  function rowClass(row: any): string {
    return rowIsDeleting(row) ? "is-deleting" : "";
  }

  /**
   * Adds or removes multiple IDs from the "currently deleting" set.
   * Used to show/hide loading indicators during delete operations.
   *
   * @param ids - Array of IDs to modify
   * @param on - true to add to set, false to remove from set
   */
  function markDeleting(ids: ID[], on: boolean): void {
    log.info("markDeleting called:", {
      ids,
      on,
      idTypes: ids.map((id) => typeof id),
      currentSet: Array.from(deletingObjectIds),
      currentSetTypes: Array.from(deletingObjectIds).map((id) => typeof id),
    });

    ids.forEach((id: ID) => (on ? deletingObjectIds.add(id) : deletingObjectIds.delete(id)));
  }

  // ===== SELECTION MANAGEMENT =====

  /**
   * Toggles selection state of a single row.
   * Handles different selection modes (single vs multiple).
   *
   * @param id - Row ID to toggle
   */
  function toggleSelect(id: ID): void {
    try {
      if (selection === "none") return; // Selection disabled

      if (selection === "single") {
        // Single selection: clear all others and select this one
        selectedIds.clear();
        selectedIds.add(id);
        return;
      }

      // Multiple selection: toggle this ID
      selectedIds.has(id) ? selectedIds.delete(id) : selectedIds.add(id);
    } catch (error) {
      log.error({ component: "DataGrid", gridId, entity, id, error: String(error) }, "toggleSelect failed");
    }
  }

  /**
   * Selects or deselects all rows in the grid.
   * Only works in multiple selection mode.
   *
   * @param on - true to select all, false to deselect all
   */
  function selectAll(on: boolean): void {
    try {
      if (selection !== "multiple") return; // Only works in multiple mode

      selectedIds.clear();

      if (on) {
        // Add all valid row IDs to selection
        for (const r of rows as any[]) {
          const id = safeGetId(r);
          if (id != null) selectedIds.add(id);
        }
      }
    } catch (error) {
      log.error({ component: "DataGrid", gridId, entity, error: String(error) }, "selectAll failed");
    }
  }

  /**
   * Gets the full row objects for all currently selected IDs.
   * Used for bulk operations like delete.
   *
   * @returns Array of selected row objects
   */
  function currentSelectionRows(): any[] {
    try {
      const set = new Set(selectedIds);
      return (rows as any[]).filter((r: any) => {
        const id = safeGetId(r);
        return id != null && set.has(id);
      });
    } catch (error) {
      log.error({ component: "DataGrid", gridId, entity, error: String(error) }, "currentSelectionRows failed");
      return [];
    }
  }

  // ===== ROW INTERACTION HANDLERS =====

  /**
   * Handles primary click on a table row (first column).
   * Uses the rowActionStrategy if provided, otherwise logs a warning.
   * This is the main way users navigate from the grid to detail views.
   *
   * @param row - Data object that was clicked
   */
  function handleRowClick(row: any) {
    try {
      if (rowActionStrategy?.click) {
        // Use provided strategy (typically navigation to detail page)
        rowActionStrategy.click(row);
        log.debug(
          {
            component: "DataGrid: handleRowClick",
            gridId,
            entity,
            rowId: safeGetId(row),
          },
          "Row clicked via strategy",
        );
      } else {
        // No strategy provided - this indicates a configuration issue
        log.warn(
          {
            component: "DataGrid:handleRowClick",
            gridId,
            entity,
            rowId: safeGetId(row),
          },
          "No rowActionStrategy provided for row click",
        );
      }
    } catch (error) {
      log.error(
        {
          component: "DataGrid:handleRowClick",
          gridId,
          entity,
          error: String(error),
        },
        "handleRowClick failed",
      );
    }
  }

  /**
   * Handles double-click on a table row.
   * Uses the rowActionStrategy if provided (e.g., quick edit mode).
   *
   * @param row - Data object that was double-clicked
   */
  function handleRowDoubleClick(row: any) {
    try {
      if (rowActionStrategy?.doubleClick) {
        rowActionStrategy.doubleClick(row);
        log.debug(
          {
            component: "DataGrid:handleRowDoubleClick",
            gridId,
            entity,
            rowId: safeGetId(row),
          },
          "Row double-clicked",
        );
      }
    } catch (error) {
      log.error(
        {
          component: "DataGrid:handleRowDoubleClick",
          gridId,
          entity,
          error: String(error),
        },
        "handleRowDoubleClick failed",
      );
    }
  }

  // ===== SORTING LOGIC =====

  /**
   * Handles a click on a sortable column header.
   * It calculates the next logical sort state and calls the `onSort` callback.
   * This component does NOT sort the data itself.
   * @param key The key of the column header that was clicked.
   */
  async function handleSortRequest(key: AllQualifiedColumns) {
    assertDefined(key, "key");

    isSorting = true;

    try {
      let descriptor = sortState.find((descriptor) => descriptor.key === key);
      if (!descriptor) {
        descriptor = { key, direction: "asc" };
        sortState.push(descriptor);
        log.detdebug(`Adding new descriptor to sortState:${JSON.stringify(sortState)}`);
        // throw new Error(`Cannot find sort descriptor for column ${key}`);
      } else {
        if ("asc" === descriptor.direction) {
          descriptor.direction = "desc";
        } else if ("desc" === descriptor.direction) {
          // Cycle from 'desc' back to removing the sort descriptor
          const index = sortState.findIndex((d) => d.key === key);
          if (index > -1) {
            sortState.splice(index, 1);
          }
        } else {
          throw new Error(`Invalid sort direction in current sort descriptor: ${JSON.stringify(descriptor)}`);
        }
      }
      //await delay(1000);
      log.debug(`Sorting - Calling apiLoadFunc - sortState: ${JSON.stringify(sortState)}`);

      if (!apiLoadFunc) {
        const msg = `Missing apiLoadFunc for ${JSON.stringify(descriptor)}`;
        addNotification(msg, "info");
        log.warn(msg);
      } else {
        const sortedRows = await apiLoadFunc(null, sortState);
        internalRows = sortedRows;
        addNotification(`Succesfully sorted - ${JSON.stringify(sortState)}`, "success");
      }
    } finally {
      isSorting = false;
    }
  }

  // ===== DELETE ORCHESTRATION =====

  /**
   * Main delete orchestration function - handles the complete delete workflow.
   *
   * WORKFLOW:
   * 1. Validation: Check if delete is possible
   * 2. Dry-run: Analyze impact (optional)
   * 3. Confirmation: Get user approval (with fallback dialog)
   * 4. Execution: Perform the actual deletion
   * 5. Cleanup: Update UI state and clear selections
   *
   * This function implements a robust, enterprise-grade delete pattern with
   * proper error handling, logging, and user feedback.
   *
   * @param targetRows - Array of row objects to delete
   */
  async function orchestrateDelete(targetRows: any[]): Promise<void> {
    // === PHASE 1: VALIDATION ===

    // Ensure delete strategy is properly configured
    if (!deleteStrategy || typeof deleteStrategy.execute !== "function") {
      log.warn({ component: "DataGrid:orchestrateDelete", gridId, entity }, "Delete requested but deleteStrategy.execute is missing");
      return; // Fail gracefully - don't show error to user
    }

    // Extract valid IDs from target rows
    const idsRaw: (ID | null)[] = targetRows.map((r: any) => safeGetId(r));
    const ids: ID[] = idsRaw.filter((x: ID | null): x is ID => x !== null);

    // Filter out IDs that are already being deleted (prevent double-deletion)
    const pendingIds: ID[] = ids.filter((id: ID) => !deletingObjectIds.has(id));

    if (pendingIds.length === 0) {
      return; // Nothing to delete or all already in progress
    }

    // Generate unique batch ID for correlation across log entries
    const batchId = newBatchId();
    log.info("DELETE_REQUESTED", {
      component: "DataGrid:orchestrateDelete",
      gridId,
      entity,
      batchId,
      count: pendingIds.length,
      selection,
    });

    // === PHASE 2: DRY-RUN (Optional Impact Analysis) ===

    let dryRun: DryRunResult | undefined | null;

    if (deleteStrategy?.dryRun) {
      const t0 = nowMs();
      try {
        // Run impact analysis to see what would be affected
        dryRun = await deleteStrategy.dryRun(pendingIds, targetRows);
        log.debug(
          {
            component: "DataGrid:orchestrateDelete",
            gridId,
            entity,
            batchId,
            total: dryRun?.total,
            durationMs: Math.round(nowMs() - t0),
          },
          "DELETE_DRYRUN_OK",
        );
      } catch (error) {
        log.warn(
          {
            component: "DataGrid:orchestrateDelete",
            gridId,
            entity,
            batchId,
            error: String(error),
          },
          "DELETE_DRYRUN_FAILED",
        );
        return; // If dry-run fails, abort delete operation
      }
    } else {
      log.debug(`DataGrid:orchestrateDelete: deleteStrategy.dryRun not defined - skipping impact analysis`);
    }

    // === PHASE 3: CONFIRMATION ===

    let confirmResult: ConfirmResult = { ok: true };

    if (deleteStrategy?.confirm) {
      // Use custom confirmation handler (may show dependency info, etc.)
      const t1 = nowMs();
      try {
        confirmResult = await deleteStrategy.confirm({
          ids: pendingIds,
          rows: targetRows,
          dryRun,
          gridId,
          entity,
        });

        log.info(confirmResult.ok ? "DELETE_CONFIRMED" : "DELETE_REJECTED", {
          component: "DataGrid",
          gridId,
          entity,
          batchId,
          ok: confirmResult.ok,
          durationMs: Math.round(nowMs() - t1),
        });

        if (!confirmResult.ok) {
          log.info(`DataGrid:orchestrateDelete: confirmResult.ok == false - aborting`);
          return; // User cancelled or confirmation failed
        }
      } catch (error) {
        log.error(`DataGrid:orchestrateDelete: confirmation error: %O`, error);
        return; // If confirmation fails, abort
      }
    } else {
      // Fallback to built-in confirmation dialog
      try {
        const confirmed = await requestConfirmation(
          `Delete ${pendingIds.length} ${entity}${pendingIds.length > 1 ? "s" : ""}?`,
          "Confirm Removal",
        );

        if (!confirmed.confirmed) {
          log.debug(`DataGrid:orchestrateDelete: Built-in confirm => user cancelled`);
          return; // User cancelled
        }

        log.info(`DataGrid:orchestrateDelete: Built-in confirm => confirmed`, {
          component: "DataGrid",
          gridId,
          entity,
          batchId,
        });
      } catch (error) {
        log.error(
          {
            component: "DataGrid",
            gridId,
            entity,
            batchId,
            error: String(error),
          },
          "DELETE_CONFIRM_BUILTIN_FAILED",
        );
        return; // If even built-in confirmation fails, abort
      }
    }

    // === PHASE 4: EXECUTION ===

    // Mark rows as "deleting" to show loading indicators
    markDeleting(pendingIds, true);

    try {
      const t2 = nowMs();

      // Execute the actual deletion
      await deleteStrategy.execute(pendingIds, confirmResult.options);

      log.info(
        {
          component: "DataGrid",
          gridId,
          entity,
          batchId,
          count: pendingIds.length,
          durationMs: Math.round(nowMs() - t2),
        },
        "DELETE_EXECUTED",
      );

      // === PHASE 5: CLEANUP ===
      // Remove deleted IDs from selection (they no longer exist)
      pendingIds.forEach((id: ID) => selectedIds.delete(id));
    } catch (error) {
      // Delete execution failed - log error but don't crash the UI
      log.error(
        {
          component: "DataGrid",
          gridId,
          entity,
          batchId,
          error: String(error),
        },
        "DELETE_FAILED",
      );
      // Note: We don't re-throw here - the parent grid should handle UI error feedback
    } finally {
      log.info("FINALLY: Clearing deleting state for IDs:", pendingIds);
      // Always remove loading indicators, even if delete failed
      markDeleting(pendingIds, false);
      log.info("FINALLY: deletingObjectIds after clear:", Array.from(deletingObjectIds));
    }
  }

  // ===== PUBLIC API FOR SNIPPETS =====

  /**
   * Deletes all currently selected rows.
   * Exposed to toolbar and other snippets for bulk operations.
   *
   * @returns Promise that resolves when delete operation completes
   */
  function deleteSelected(): Promise<void> | void {
    return orchestrateDelete(currentSelectionRows());
  }

  /**
   * Deletes a single specific row.
   * Exposed to row action snippets for individual row operations.
   *
   * @param row - Row object to delete
   * @returns Promise that resolves when delete operation completes
   */
  function deleteOne(row: any): Promise<void> | void {
    return orchestrateDelete([row]);
  }

  // ===== LIFECYCLE =====

  /**
   * Logs grid configuration for debugging and validates required props.
   */
  $effect(() => {
    // Diese Funktion wird einmal nach dem ersten Rendern ausgeführt,
    // genau wie onMount.
    try {
      const multiselect = selection === "multiple";
      log.info(
        "Grid mounted (via $effect)", // Geänderte Log-Nachricht zur Überprüfung
        {
          component: "DataGrid",
          gridId,
          entity,
          selection,
          multiselect,
          columns: (columns as ColumnDef<any>[]).map((c: ColumnDef<any>) => c.key),
        },
      );

      if (!deleteStrategy || typeof deleteStrategy.execute !== "function") {
        log.warn({ component: "DataGrid", gridId, entity }, "deleteStrategy.execute missing; delete actions will be disabled");
      }
    } catch (error) {
      console.error("DataGrid mount log failed", error);
    }

    // Ein leerer return-Wert für einen $effect bedeutet, dass er keine Cleanup-Funktion hat.
    return () => {};
  });
</script>

<!-- 
  ROOT CONTAINER
  Uses .pc-grid classes from global grid.css for consistent styling
  The pc-grid--comfortable variant provides adequate padding for data-heavy grids
-->
<div class="pc-grid pc-grid--comfortable pc-grid--scroll-body"
     style={maxBodyHeight ? `--pc-grid-body-max-height:${maxBodyHeight};` : ""}
>
  <!-- 
    TOOLBAR SECTION
    Contains selection controls, bulk actions, and custom toolbar content
    Uses flexbox layout for responsive arrangement
  -->
  <div class="pc-grid__toolbar">
    {#if toolbar}
      <!-- Custom toolbar provided via snippet -->
      {@render toolbar({ selectedIds, deletingObjectIds, deleteSelected })}
    {:else}
      <!-- Default toolbar with standard selection and delete controls -->

      {#if selection !== "none" && selection === "multiple"}
        <!-- Select All checkbox - only shown in multiple selection mode -->
        <label class="inline-flex items-center gap-2">
          <input
            type="checkbox"
            aria-label="Select all rows in the grid"
            onchange={(e: Event) => selectAll((e.target as HTMLInputElement).checked)}
          />
          <span>Select all</span>
        </label>
      {/if}

      <!-- Bulk delete button - disabled when nothing selected or delete not available -->
      <button
        class="pc-grid__btn"
        disabled={selectedIds.size === 0 || loading || isSorting || !deleteStrategy || typeof deleteStrategy.execute !== "function"}
        onclick={() => deleteSelected()}
        aria-busy={Array.from(selectedIds).some((id: ID) => isDeleting(id))}
        title={selectedIds.size === 0
          ? `Select ${entity}s to delete`
          : `Delete ${selectedIds.size} selected ${entity}${selectedIds.size > 1 ? "s" : ""}`}
      >
        Delete selected ({selectedIds.size})
      </button>

      <!-- Clear all sortings -->
      <button
        class="pc-grid__btn"
        disabled={sortState.length === 0 || loading || isSorting}
        onclick={() => {
          log.debug(`Clearing all sortings: ${JSON.stringify(sortState)}`)
          sortState = [];
        }}
        title={`Clear all sortings: ${JSON.stringify(sortState)}`}
      >
        Clear all sortings ({sortState.length})
      </button>

      <!-- Loading spinner when any selected items are being deleted -->
      {#if Array.from(selectedIds).some((id: ID) => isDeleting(id))}
        <span
          class="pc-grid__spinner"
          aria-hidden="true"
        ></span>
      {/if}

      <!-- General loading spinner for entire data grid -->
      {#if loading || isSorting}
        <div
          class="loader-wrapper"
          transition:fade={{ duration: 150, delay: 200 }}
        >
          <div class="spinner"></div>
        </div>
      {/if}
    {/if}
  </div>

  <!-- 
    TABLE CONTAINER
    Includes horizontal scrolling for tables wider than container
    The pc-grid__scroller handles overflow with smooth scrolling
  -->
  <div class="pc-grid__scroller">
    <table class="pc-grid__table">
      <!-- 
        TABLE HEADER
        Sticky positioning keeps headers visible during vertical scrolling
        Dynamic column structure based on selection mode and column definitions
      -->
      <thead class="pc-grid__thead">
        <tr>
          <!-- Selection column header - only shown when selection is enabled -->
          {#if selection !== "none"}
            <th
              class="w-8 pc-grid__th--center"
              aria-label="Row selection"
            >
              <!-- Empty header - selection checkboxes are in body rows -->
            </th>
          {/if}

          <!-- Data column headers - generated from column definitions -->
          {#each columns as col}
            {@const descriptorForCol = sortState.find((descriptor) => descriptor.key === col.key)}
            <th
              style={"width:" + (col.width ?? "auto")}
              class={col.class}
              aria-sort={col.sortable ? "none" : undefined}
              title={col.sortable ? `Click to sort by ${col.header}` : undefined}
            >
              {#if col.sortable}
                <!-- Sortable header is a button for accessibility -->
                <button
                  class="pc-grid__sort-btn"
                  onclick={() => handleSortRequest(String(col.key) as AllQualifiedColumns)}
                >
                  <span>{col.header}</span>
                  <!-- Sort indicator icon -->
                  {#if descriptorForCol}
                    <span
                      class="pc-grid__sort-indicator"
                      aria-hidden="true"
                    >
                      {#if descriptorForCol.direction === "asc"}▲{:else}▼{/if}
                    </span>
                  {/if}
                </button>
              {:else}
                <!-- Non-sortable header remains plain text -->
                {col.header}
              {/if}
            </th>
          {/each}

          <!-- Actions column header - for row-specific buttons -->
          <th
            class="pc-grid__th--right"
            aria-label="Row actions"
          >
            Actions
          </th>
        </tr>
      </thead>

      <!-- 
        TABLE BODY
        Contains all data rows or empty state
        Each row can be selected, deleted, or clicked for navigation
      -->
      <tbody class="pc-grid__tbody">
        {#if rows.length === 0}
          <!-- EMPTY STATE - shown when no data is available -->
          <tr>
            <td
              class="pc-grid__empty"
              colspan={columns.length + (selection !== "none" ? 2 : 1)}
            >
              {#if empty}
                <!-- Custom empty state via snippet -->
                {@render empty()}
              {:else}
                <!-- Default empty message -->
                No data
              {/if}
            </td>
          </tr>
        {:else}
          <!-- DATA ROWS - one row per data object -->

          {#each internalRows as row, i (keyForRow(row, i))}
            <tr
              data-deleting={rowIsDeleting(row) ? "true" : undefined}
              aria-selected={rowIsSelected(row) ? "true" : undefined}
              class={rowClass(row)}
              aria-rowindex={i + 2}
            >
              <!-- SELECTION CELL - checkbox/radio for row selection -->
              {#if selection !== "none"}
                <td class="pc-grid__td--center">
                  {#if safeGetId(row) != null}
                    <!-- Selection input - type depends on selection mode -->
                    <input
                      type={selection === "single" ? "radio" : "checkbox"}
                      checked={rowIsSelected(row)}
                      onchange={() => {
                        const id = safeGetId(row);
                        if (id != null) toggleSelect(id);
                      }}
                      aria-label={`Select ${entity} ${safeGetId(row)}`}
                      disabled={rowIsDeleting(row)}
                    />
                  {:else}
                    <!-- Warning badge for rows without valid IDs -->
                    <span
                      class="pc-grid__badge pc-grid__badge--warn"
                      title="This row has no valid ID and cannot be selected"
                    >
                      n/a
                    </span>
                  {/if}
                </td>
              {/if}

              <!-- DATA CELLS - one cell per column definition -->
              {#each columns as col, colIndex}
                <td class={col.class}>
                  {#if cell}
                    <!-- Custom cell rendering via snippet -->
                    {@render cell({ row, col })}
                  {:else if colIndex === 0}
                    <!-- FIRST COLUMN: Clickable for navigation -->
                    <button
                      class="pc-grid__link-btn"
                      type="button"
                      onclick={() => handleRowClick(row)}
                      ondblclick={() => handleRowDoubleClick(row)}
                      disabled={rowIsDeleting(row)}
                      title={`Open ${entity} details`}
                      aria-label={`View details for ${safeAccessor(row, col)}`}
                    >
                      {safeAccessor(row, col)}
                    </button>
                  {:else}
                    <!-- REGULAR DATA CELL: Display value only -->
                    {safeAccessor(row, col)}
                  {/if}
                </td>
              {/each}

              <!-- ACTIONS CELL - row-specific action buttons -->
              <td class="pc-grid__actions">
                {#if rowActions}
                  <!-- Custom row actions via snippet -->
                  {@render rowActions({ row, id: safeGetId(row), isDeleting })}
                {:else}
                  <!-- Default delete button -->
                  <button
                    class="pc-grid__btn pc-grid__btn--danger"
                    disabled={!(safeGetId(row) != null && isRowDeletable(row)) ||
                      !deleteStrategy ||
                      typeof deleteStrategy.execute !== "function"}
                    onclick={() => {
                      const id = safeGetId(row);
                      if (id != null) deleteOne(row);
                    }}
                    aria-busy={(() => {
                      const id = safeGetId(row);
                      return id != null && isDeleting(id);
                    })()}
                    title={`Delete this ${entity}`}
                    aria-label={`Delete ${entity} ${safeAccessor(row, columns[0])}`}
                  >
                    <!-- Loading spinner during deletion -->
                    {#if (() => {
                      const id = safeGetId(row);
                      return id != null && isDeleting(id);
                    })()}
                      <span
                        class="pc-grid__spinner"
                        aria-hidden="true"
                      ></span>
                    {/if}
                    Delete
                  </button>
                {/if}
              </td>
            </tr>
          {/each}
        {/if}
      </tbody>
    </table>
  </div>

  <!-- 
    META SECTION
    Optional additional content below the table (pagination, summary info, etc.)
  -->
  {#if meta}
    {@render meta({ selectedIds, deletingObjectIds, deleteSelected })}
  {/if}
</div>

<style>
  /* 
    CLICKABLE FIRST COLUMN STYLES
    Makes the first column look and behave like links for navigation
    Follows system accent color for consistency
  */
  .pc-grid__link-btn {
    background: none;
    border: none;
    color: var(--pc-grid-accent, #0ea5e9); /* Uses system accent color */
    cursor: pointer;
    text-align: left;
    font: inherit;
    text-decoration: none;
    padding: 0;
    width: 100%;
    transition: all 0.2s ease; /* Smooth hover transitions */
  }

  /* Hover state for clickable cells */
  .pc-grid__link-btn:hover:not(:disabled) {
    text-decoration: underline;
    color: var(--pc-grid-accent, #0ea5e9);
    transform: translateX(2px); /* Subtle movement on hover */
  }

  /* Focus state for keyboard navigation */
  .pc-grid__link-btn:focus-visible {
    outline: 2px solid var(--pc-grid-accent, #0ea5e9);
    outline-offset: 2px;
    border-radius: 4px;
  }

  /* Disabled state for rows being deleted */
  .pc-grid__link-btn:disabled {
    opacity: 0.6;
    cursor: not-allowed;
    color: var(--pc-grid-muted, #64748b);
  }
</style>
