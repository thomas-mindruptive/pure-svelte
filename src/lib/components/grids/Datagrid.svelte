<script
  lang="ts"
  generics="T"
>
  // DataGrid (Svelte 5 + Runes) - REBUILT
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

  import "$lib/components/styles/grid.css";
  import { requestConfirmation } from "$lib/stores/confirmation";
  import { log } from "$lib/utils/logger";
  import type { Snippet } from "svelte";
  import { fade } from "svelte/transition";
  import type { ColumnDef, ConfirmResult, DeleteStrategy, DryRunResult, ID, RowActionStrategy, SortFunc } from "./Datagrid.types";

  import type { SortDescriptor } from "$lib/backendQueries/queryGrammar";
  import "$lib/components/styles/loadingIndicator.css";
  import type { AllQualifiedColumns } from "$lib/domain/domainTypes.utils";
  import { addNotification } from "$lib/stores/notifications";
  import { assertDefined } from "$lib/utils/assertions";

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

    // Callback when sort state changes - parent loads data
    onSort?: SortFunc<T> | undefined;

    // Columns and row ids.
    columns: ColumnDef<any>[];
    getId: (row: any) => number;

    // Select and delte indicator
    selection?: "none" | "single" | "multiple";
    canDelete?: (row: any) => boolean;

    // Row strategies
    deleteStrategy: DeleteStrategy<any>;
    rowActionStrategy?: RowActionStrategy<any> | undefined | null;

    // Snippets
    toolbar?: Snippet<[ToolbarSnippetProps]> | undefined;
    cell?: Snippet<[CellSnippetProps]> | undefined;
    rowActions?: Snippet<[RowActionsSnippetProps]> | undefined;
    empty?: Snippet<[]> | undefined;
    meta?: Snippet<[MetaSnippetProps]> | undefined;
  };

  // These define the data passed to customizable snippets

  type ToolbarSnippetProps = {
    selectedIds: Set<ID>;
    deletingObjectIds: Set<ID>;
    deleteSelected: () => Promise<void> | void;
  };

  type CellSnippetProps = {
    row: any;
    col: ColumnDef<any>;
  };

  type RowActionsSnippetProps = {
    row: any;
    id: ID | null;
    isDeleting: (id: ID) => boolean;
  };

  type MetaSnippetProps = {
    selectedIds: Set<ID>;
    deletingObjectIds: Set<ID>;
    deleteSelected: () => Promise<void> | void;
  };

  // ===== COMPONENT PROPS =====

  const {
    gridId = "grid",
    entity = "item",

    maxBodyHeight,

    rows = [] as any[],
    columns = [] as ColumnDef<any>[],
    getId,

    selection = "multiple" as "none" | "single" | "multiple",
    canDelete = (_row: any) => true,

    loading = false,

    onSort,

    deleteStrategy,
    rowActionStrategy,

    toolbar,
    cell,
    rowActions,
    empty,
    meta,
  }: DataGridProps<T> = $props();

  // ===== LOCAL STATE =====

  const deletingObjectIds = $state<Set<ID>>(new Set());
  const selectedIds = $state<Set<ID>>(new Set());

  // Sorting
  let sortState = $state<SortDescriptor<T>[]>([]);
  let isSorting = $state(false);

  // ===== UTILITY FUNCTIONS =====

  function newBatchId(): string {
    // @ts-ignore
    return globalThis?.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2);
  }

  function nowMs(): number {
    // @ts-ignore
    return globalThis?.performance?.now?.() ?? Date.now();
  }

  function safeGetId(row: any): ID | null {
    try {
      return getId(row);
    } catch (error) {
      log.error({ component: "DataGrid", gridId, entity, error: String(error) }, "getId threw");
      return null;
    }
  }

  function keyForRow(row: any, i: number): string | number {
    const id = safeGetId(row);
    return id ?? `__idx_${i}`;
  }

  function safeAccessor(row: any, col: ColumnDef<any>): any {
    try {
      const colName = String(col.key);

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
        // @ts-ignore
        const val = row?.[col.key];
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
      return "—";
    }
  }

  function isRowDeletable(row: any): boolean {
    try {
      return !!canDelete(row);
    } catch (error) {
      log.warn({ component: "DataGrid", gridId, entity, error: String(error) }, "canDelete threw; treating as not deletable");
      return false;
    }
  }

  // ===== ROW STATE HELPER FUNCTIONS =====

  function isDeleting(id: ID): boolean {
    return deletingObjectIds.has(id);
  }

  function rowIsDeleting(row: any): boolean {
    const id = safeGetId(row);
    const result = id != null && isDeleting(id);
    return result;
  }

  function rowIsSelected(row: any): boolean {
    if (selection === "none") return false;
    const id = safeGetId(row);
    return id != null && selectedIds.has(id);
  }

  function rowClass(row: any): string {
    return rowIsDeleting(row) ? "is-deleting" : "";
  }

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

  function toggleSelect(id: ID): void {
    try {
      if (selection === "none") return;

      if (selection === "single") {
        selectedIds.clear();
        selectedIds.add(id);
        return;
      }

      selectedIds.has(id) ? selectedIds.delete(id) : selectedIds.add(id);
    } catch (error) {
      log.error({ component: "DataGrid", gridId, entity, id, error: String(error) }, "toggleSelect failed");
    }
  }

  function selectAll(on: boolean): void {
    try {
      if (selection !== "multiple") return;

      selectedIds.clear();

      if (on) {
        for (const r of rows as any[]) {
          const id = safeGetId(r);
          if (id != null) selectedIds.add(id);
        }
      }
    } catch (error) {
      log.error({ component: "DataGrid", gridId, entity, error: String(error) }, "selectAll failed");
    }
  }

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

  function handleRowClick(row: any) {
    try {
      if (rowActionStrategy?.click) {
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

  async function handleSort(key: AllQualifiedColumns) {
    assertDefined(key, "key");

    isSorting = true;

    try {
      let descriptor = sortState.find((descriptor) => descriptor.key === key);
      if (!descriptor) {
        descriptor = { key, direction: "asc" };
        sortState.push(descriptor);
        log.detdebug(`Adding new descriptor to sortState:${JSON.stringify(sortState)}`);
      } else {
        if ("asc" === descriptor.direction) {
          descriptor.direction = "desc";
        } else if ("desc" === descriptor.direction) {
          const index = sortState.findIndex((d) => d.key === key);
          if (index > -1) {
            sortState.splice(index, 1);
          }
        } else {
          throw new Error(`Invalid sort direction in current sort descriptor: ${JSON.stringify(descriptor)}`);
        }
      }

      log.debug(`Sorting - Calling onSort - sortState: ${JSON.stringify(sortState)}`);

      if (!onSort) {
        const msg = `Missing onSort callback for ${JSON.stringify(descriptor)}`;
        addNotification(msg, "info");
        log.warn(msg);
      } else {
        if (sortState.length == 0) {
          await onSort(null);
        } else {
          await onSort(sortState);
        }
        addNotification(`Successfully sorted - ${JSON.stringify(sortState)}`, "success");
      }
    } finally {
      isSorting = false;
    }
  }

  // ===== DELETE ORCHESTRATION =====

  async function orchestrateDelete(targetRows: any[]): Promise<void> {
    if (!deleteStrategy || typeof deleteStrategy.execute !== "function") {
      log.warn({ component: "DataGrid:orchestrateDelete", gridId, entity }, "Delete requested but deleteStrategy.execute is missing");
      return;
    }

    const idsRaw: (ID | null)[] = targetRows.map((r: any) => safeGetId(r));
    const ids: ID[] = idsRaw.filter((x: ID | null): x is ID => x !== null);
    const pendingIds: ID[] = ids.filter((id: ID) => !deletingObjectIds.has(id));

    if (pendingIds.length === 0) {
      return;
    }

    const batchId = newBatchId();
    log.info("DELETE_REQUESTED", {
      component: "DataGrid:orchestrateDelete",
      gridId,
      entity,
      batchId,
      count: pendingIds.length,
      selection,
    });

    // ===== DRY-RUN =====

    let dryRun: DryRunResult | undefined | null;

    if (deleteStrategy?.dryRun) {
      const t0 = nowMs();
      try {
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
        return;
      }
    } else {
      log.debug(`DataGrid:orchestrateDelete: deleteStrategy.dryRun not defined - skipping impact analysis`);
    }

    // ===== CONFIRMATION =====

    let confirmResult: ConfirmResult = { ok: true };

    if (deleteStrategy?.confirm) {
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
          return;
        }
      } catch (error) {
        log.error(`DataGrid:orchestrateDelete: confirmation error: %O`, error);
        return;
      }
    } else {
      try {
        const confirmed = await requestConfirmation(
          `Delete ${pendingIds.length} ${entity}${pendingIds.length > 1 ? "s" : ""}?`,
          "Confirm Removal",
        );

        if (!confirmed.confirmed) {
          log.debug(`DataGrid:orchestrateDelete: Built-in confirm => user cancelled`);
          return;
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
        return;
      }
    }

    // ===== EXECUTION =====

    markDeleting(pendingIds, true);

    try {
      const t2 = nowMs();

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

      pendingIds.forEach((id: ID) => selectedIds.delete(id));
    } catch (error) {
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
    } finally {
      log.info("FINALLY: Clearing deleting state for IDs:", pendingIds);
      markDeleting(pendingIds, false);
      log.info("FINALLY: deletingObjectIds after clear:", Array.from(deletingObjectIds));
    }
  }

  // ===== PUBLIC API FOR SNIPPETS =====

  function deleteSelected(): Promise<void> | void {
    return orchestrateDelete(currentSelectionRows());
  }

  function deleteOne(row: any): Promise<void> | void {
    return orchestrateDelete([row]);
  }

  // ===== LIFECYCLE =====

  $effect(() => {
    try {
      const multiselect = selection === "multiple";
      log.info("Grid mounted (via $effect)", {
        component: "DataGrid",
        gridId,
        entity,
        selection,
        multiselect,
        columns: (columns as ColumnDef<any>[]).map((c: ColumnDef<any>) => c.key),
      });

      if (!deleteStrategy || typeof deleteStrategy.execute !== "function") {
        log.warn({ component: "DataGrid", gridId, entity }, "deleteStrategy.execute missing; delete actions will be disabled");
      }
    } catch (error) {
      console.error("DataGrid mount log failed", error);
    }

    return () => {};
  });

  // ===== COMPUTED =====

  const totalColumns = $derived(columns.length + (selection !== "none" ? 1 : 0) + 1);
</script>

<div
  class="pc-grid pc-grid--comfortable pc-grid--scroll-body"
  style={maxBodyHeight ? `--pc-grid-body-max-height:${maxBodyHeight};` : ""}
>
  <!-- TOOLBAR ----------------------------------------------------------------------------------->
  <div class="pc-grid__toolbar">
    {#if toolbar}
      {@render toolbar({ selectedIds, deletingObjectIds, deleteSelected })}
    {:else}
      {#if selection !== "none" && selection === "multiple"}
        <label class="inline-flex items-center gap-2">
          <input
            type="checkbox"
            aria-label="Select all rows in the grid"
            onchange={(e: Event) => selectAll((e.target as HTMLInputElement).checked)}
          />
          <span>Select all</span>
        </label>
      {/if}

      <!-- DELETE SELECTED ----------------------------------------------------------------------->
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

      <!-- CLEAR SORTING ------------------------------------------------------------------------->
      <button
        class="pc-grid__btn"
        disabled={sortState.length === 0 || loading || isSorting}
        onclick={() => {
          log.debug(`Clearing all sortings: ${JSON.stringify(sortState)}`);
          sortState = [];
        }}
        title={`Clear all sortings: ${JSON.stringify(sortState)}`}
      >
        Clear all sortings ({sortState.length})
      </button>

      <!-- DELETE SPINNER ------------------------------------------------------------------------>
      {#if Array.from(selectedIds).some((id: ID) => isDeleting(id))}
        <span
          class="pc-grid__spinner"
          aria-hidden="true"
        ></span>
      {/if}

      <!-- LOADING SPINNER ----------------------------------------------------------------------->
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

  <!-- TABLE CONTAINER --------------------------------------------------------------------------->
  <div class="pc-grid__scroller">
    <table class="pc-grid__table">
      <!---->
      <!-- COLGROUP: Define column widths once --------------------------------------------------->
      <colgroup>
        {#if selection !== "none"}
          <col style="width: 3.5rem;" />
        {/if}
        {#each columns as col}
          <!-- NEU: Fallback auf minmax statt leer -->
          <col style={col.width ? `width: ${col.width};` : "width: minmax(80px, 1fr);"} />
        {/each}
        <col style="width: 180px;" />
        <!-- Actions: Feste Breite statt auto -->
      </colgroup>

      <!-- HEAD ---------------------------------------------------------------------------------->
      <thead class="pc-grid__thead">
        <tr>
          {#if selection !== "none"}
            <th
              class="pc-grid__th--center"
              aria-label="Row selection"
            >
              <!-- Empty for selection column -->
            </th>
          {/if}

          {#each columns as col}
            {@const descriptorForCol = sortState.find((descriptor) => descriptor.key === col.key)}
            <th
              class={col.class}
              aria-sort={col.sortable ? "none" : undefined}
              title={col.sortable ? `Click to sort by ${col.header}` : undefined}
            >
              {#if col.sortable}
                <button
                  class="pc-grid__sort-btn"
                  onclick={() => handleSort(String(col.key) as AllQualifiedColumns)}
                >
                  <span>{col.header}</span>
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
                {col.header}
              {/if}
            </th>
          {/each}

          <th
            class="pc-grid__th--right"
            aria-label="Row actions"
          >
            Actions
          </th>
        </tr>
      </thead>

      <!-- BODY ---------------------------------------------------------------------------------->
      <tbody class="pc-grid__tbody">
        {#if rows.length === 0}
          <tr>
            <td
              class="pc-grid__empty"
              colspan={totalColumns}
            >
              {#if empty}
                {@render empty()}
              {:else}
                No data
              {/if}
            </td>
          </tr>
        {:else}
          {#each rows as row, i (keyForRow(row, i))}
            <tr
              onclick={() => handleRowClick(row)}
              ondblclick={() => handleRowDoubleClick(row)}
              data-deleting={rowIsDeleting(row) ? "true" : undefined}
              aria-selected={rowIsSelected(row) ? "true" : undefined}
              class={rowClass(row)}
              aria-rowindex={i + 2}
            >
              <!-- SELECTION BOX ----------------------------------------------------------------->
              {#if selection !== "none"}
                <td class="pc-grid__td--center">
                  {#if safeGetId(row) != null}
                    <input
                      type={selection === "single" ? "radio" : "checkbox"}
                      checked={rowIsSelected(row)}
                      onclick={(e) => {
                        e.stopPropagation();
                      }}
                      onchange={(e) => {
                        e.stopPropagation();
                        const id = safeGetId(row);
                        if (id != null) toggleSelect(id);
                      }}
                      aria-label={`Select ${entity} ${safeGetId(row)}`}
                      disabled={rowIsDeleting(row)}
                    />
                  {:else}
                    <span
                      class="pc-grid__badge pc-grid__badge--warn"
                      title="This row has no valid ID and cannot be selected"
                    >
                      n/a
                    </span>
                  {/if}
                </td>
              {/if}

              <!-- COLUMN ------------------------------------------------------------------------>
              {#each columns as col, colIndex}
                <td class={col.class}>
                  {#if cell}
                    {@render cell({ row, col })}
                  {:else if colIndex === 0}
                    <button
                      class="pc-grid__link-btn"
                      type="button"
                      disabled={rowIsDeleting(row)}
                      title={`Open ${entity} details`}
                      aria-label={`View details for ${safeAccessor(row, col)}`}
                    >
                      {safeAccessor(row, col)}
                    </button>
                  {:else if col.isLink}
                    <button
                      class="pc-grid__link-btn"
                      onclick={(e) => {
                        e.stopPropagation();
                        col.onClick?.(row, col);
                      }}
                    >
                      {safeAccessor(row, col)}
                    </button>
                  {:else}
                    {safeAccessor(row, col)}
                  {/if}
                </td>
              {/each}

              <!-- ROW ACTIONS ------------------------------------------------------------------->
              <td class="pc-grid__actions">
                {#if rowActions}
                  {@render rowActions({ row, id: safeGetId(row), isDeleting })}
                {:else}
                  <!-- DELETE -------------------------------------------------------------------->
                  <button
                    class="pc-grid__btn pc-grid__btn--danger"
                    disabled={!(safeGetId(row) != null && isRowDeletable(row)) ||
                      !deleteStrategy ||
                      typeof deleteStrategy.execute !== "function"}
                    onclick={(e) => {
                      e.stopPropagation();
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

  <!-- META SECTION -->
  {#if meta}
    {@render meta({ selectedIds, deletingObjectIds, deleteSelected })}
  {/if}
</div>
