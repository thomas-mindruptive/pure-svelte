<script lang="ts">
  // DataGrid (Svelte 5 + Runes) - Updated with clickable first column
  // - English comments
  // - Uses global grid.css (.pc-grid*) imported in your root layout
  // - Centralized delete flow (dry-run → confirm → execute)
  // - Robust exception handling with structured logging via $lib/utils/logger
  // - Emits DOM CustomEvents from the root element:
  //     'deleted'         detail: { ids, rows }
  //     'deleteError'     detail: { ids, rows, error }
  //     'deleteCancelled' detail: { ids, rows, reason }
  //     'rowclick'        detail: row (NEW)

  import { onMount } from 'svelte';
  import type { Snippet } from 'svelte';
  import { log } from '$lib/utils/logger';

  type ID = string | number;

  export type ColumnDef<T = any> = {
    key: string;
    header: string;
    accessor?: (row: T) => any; // if omitted, uses row[key]
    sortable?: boolean;
    width?: string;
    class?: string;
  };

  export type DryRunResult = {
    total: number;
    details?: Record<string, number>;
    recommendsCascade?: boolean;
    [k: string]: any;
  };

  export type ConfirmContext<T = any> = {
    ids: ID[];
    rows: T[];
    dryRun?: DryRunResult;
    gridId?: string;
    entity?: string;
  };

  export type ConfirmResult = {
    ok: boolean;
    options?: Record<string, any>;
    reason?: string;
  };

  export type RowActionStrategy<T = any> = {
    click?: (row: T) => void;
    doubleClick?: (row: T) => void;
    hover?: (row: T) => void;
  };

  export type DeleteStrategy<T = any> = {
    dryRun?: (ids: ID[], rows: T[]) => Promise<DryRunResult>;
    confirm?: (ctx: ConfirmContext<T>) => Promise<ConfirmResult>;
    execute: (ids: ID[], options?: Record<string, any>) => Promise<void>;
  };

  // ----- Snippet prop types -----
  type ToolbarSnippetProps = {
    selectedIds: Set<ID>;
    deletingObjectIds: Set<ID>;
    deleteSelected: () => Promise<void> | void;
  };
  type CellSnippetProps = { row: any; col: ColumnDef<any> };
  type RowActionsSnippetProps = { row: any; id: ID | null; isDeleting: (id: ID) => boolean };
  type MetaSnippetProps = { selectedIds: Set<ID>; deletingObjectIds: Set<ID>; deleteSelected: () => Promise<void> | void };

  // ----- Props (Runes) -----
  const {
    rows = [] as any[],
    columns = [] as ColumnDef<any>[],
    getId,
    selection = 'multiple' as 'none' | 'single' | 'multiple',
    canDelete = (_row: any) => true,
    loading = false,
    deleteStrategy,
    rowActionStrategy,
    gridId = 'grid',
    entity = 'item',

    // Snippets (all optional)
    toolbar,
    cell,
    rowActions,
    empty,
    meta
  } = $props<{
    rows: any[];
    columns: ColumnDef<any>[];
    getId: (row: any) => ID;
    selection?: 'none' | 'single' | 'multiple';
    canDelete?: (row: any) => boolean;
    loading?: boolean;
    deleteStrategy: DeleteStrategy<any>;
    rowActionStrategy?: RowActionStrategy<any>;
    gridId?: string;
    entity?: string;

    toolbar?: Snippet<[ToolbarSnippetProps]>;
    cell?: Snippet<[CellSnippetProps]>;
    rowActions?: Snippet<[RowActionsSnippetProps]>;
    empty?: Snippet<[]>;
    meta?: Snippet<[MetaSnippetProps]>;
  }>();

  // ----- Local state (Runes) -----
  const deletingObjectIds = $state<Set<ID>>(new Set());
  const selectedIds        = $state<Set<ID>>(new Set());

  // Root element (for DOM event dispatch)
  let rootEl: HTMLElement;

  // ----- Utilities (guarded) -----
  function dispatchSafe(name: string, detail: any) {
    try {
      rootEl?.dispatchEvent(new CustomEvent(name, { detail }));
    } catch (error) {
      log.error({ component: 'DataGrid', gridId, entity, event: name, error: String(error) }, 'Event dispatch failed');
    }
  }

  function newBatchId(): string {
    // Correlates log lines across one delete operation (not a security token)
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
      log.error({ component: 'DataGrid', gridId, entity, error: String(error) }, 'getId threw');
      return null;
    }
  }

  function keyForRow(row: any, i: number): string | number {
    const id = safeGetId(row);
    return id ?? `__idx_${i}`;
  }

  function safeAccessor(row: any, col: ColumnDef<any>): any {
    try {
      if (col.accessor) return col.accessor(row);
      // @ts-ignore
      return row?.[col.key];
    } catch (error) {
      log.error({ component: 'DataGrid', gridId, entity, column: col.key, error: String(error) }, 'Cell accessor threw');
      return '—';
    }
  }

  function isRowDeletable(row: any): boolean {
    try {
      return !!canDelete(row);
    } catch (error) {
      log.warn({ component: 'DataGrid', gridId, entity, error: String(error) }, 'canDelete threw; treating as not deletable');
      return false;
    }
  }

  function isDeleting(id: ID): boolean { return deletingObjectIds.has(id); }
  function rowIsDeleting(row: any): boolean {
    const id = safeGetId(row);
    return id != null && isDeleting(id);
  }
  function rowIsSelected(row: any): boolean {
    if (selection === 'none') return false;
    const id = safeGetId(row);
    return id != null && selectedIds.has(id);
  }
  function rowClass(row: any): string {
    return rowIsDeleting(row) ? 'is-deleting' : '';
  }
  function markDeleting(ids: ID[], on: boolean): void {
    ids.forEach((id: ID) => (on ? deletingObjectIds.add(id) : deletingObjectIds.delete(id)));
  }

  function toggleSelect(id: ID): void {
    try {
      if (selection === 'none') return;
      if (selection === 'single') {
        selectedIds.clear();
        selectedIds.add(id);
        return;
      }
      selectedIds.has(id) ? selectedIds.delete(id) : selectedIds.add(id);
    } catch (error) {
      log.error({ component: 'DataGrid', gridId, entity, id, error: String(error) }, 'toggleSelect failed');
    }
  }

  function selectAll(on: boolean): void {
    try {
      if (selection !== 'multiple') return;
      selectedIds.clear();
      if (on) {
        for (const r of rows as any[]) {
          const id = safeGetId(r);
          if (id != null) selectedIds.add(id);
        }
      }
    } catch (error) {
      log.error({ component: 'DataGrid', gridId, entity, error: String(error) }, 'selectAll failed');
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
      log.error({ component: 'DataGrid', gridId, entity, error: String(error) }, 'currentSelectionRows failed');
      return [];
    }
  }

  // Handle row click (first column) - use ActionStrategy
  function handleRowClick(row: any) {
    try {
      if (rowActionStrategy?.click) {
        rowActionStrategy.click(row);
        log.debug({ component: 'DataGrid', gridId, entity, rowId: safeGetId(row) }, 'Row clicked via strategy');
      } else {
        // Fallback: dispatch event for backward compatibility
        dispatchSafe('rowclick', row);
        log.debug({ component: 'DataGrid', gridId, entity, rowId: safeGetId(row) }, 'Row clicked via event');
      }
    } catch (error) {
      log.error({ component: 'DataGrid', gridId, entity, error: String(error) }, 'handleRowClick failed');
    }
  }

  // Handle row double click
  function handleRowDoubleClick(row: any) {
    try {
      if (rowActionStrategy?.doubleClick) {
        rowActionStrategy.doubleClick(row);
        log.debug({ component: 'DataGrid', gridId, entity, rowId: safeGetId(row) }, 'Row double-clicked');
      }
    } catch (error) {
      log.error({ component: 'DataGrid', gridId, entity, error: String(error) }, 'handleRowDoubleClick failed');
    }
  }

  // ----- Delete Orchestration -----
  async function orchestrateDelete(targetRows: any[]): Promise<void> {
    if (!deleteStrategy || typeof deleteStrategy.execute !== 'function') {
      log.warn({ component: 'DataGrid', gridId, entity }, 'Delete requested but deleteStrategy.execute is missing');
      dispatchSafe('deleteCancelled', { ids: [], rows: targetRows, reason: 'no-execute' });
      return;
    }

    const idsRaw: (ID | null)[] = targetRows.map((r: any) => safeGetId(r));
    const ids: ID[] = idsRaw.filter((x: ID | null): x is ID => x !== null);
    const pendingIds: ID[] = ids.filter((id: ID) => !deletingObjectIds.has(id));
    if (pendingIds.length === 0) return;

    const batchId = newBatchId();
    log.info({ component: 'DataGrid', gridId, entity, batchId, count: pendingIds.length, selection }, 'DELETE_REQUESTED');

    // 1) Dry-run (optional)
    let dryRun: DryRunResult | undefined;
    if (deleteStrategy?.dryRun) {
      const t0 = nowMs();
      try {
        dryRun = await deleteStrategy.dryRun(pendingIds, targetRows);
        log.debug({ component: 'DataGrid', gridId, entity, batchId, total: dryRun?.total, durationMs: Math.round(nowMs() - t0) }, 'DELETE_DRYRUN_OK');
      } catch (error) {
        log.warn({ component: 'DataGrid', gridId, entity, batchId, error: String(error) }, 'DELETE_DRYRUN_FAILED');
        dispatchSafe('deleteCancelled', { ids: pendingIds, rows: targetRows, reason: 'dry-run-failed' });
        return;
      }
    }

    // 2) Confirm
    let confirmResult: ConfirmResult = { ok: true };
    if (deleteStrategy?.confirm) {
      const t1 = nowMs();
      try {
        confirmResult = await deleteStrategy.confirm({ ids: pendingIds, rows: targetRows, dryRun, gridId, entity });
        log.info({ component: 'DataGrid', gridId, entity, batchId, ok: confirmResult.ok, durationMs: Math.round(nowMs() - t1) }, confirmResult.ok ? 'DELETE_CONFIRMED' : 'DELETE_REJECTED');
        if (!confirmResult.ok) {
          dispatchSafe('deleteCancelled', { ids: pendingIds, rows: targetRows, reason: confirmResult.reason ?? 'user-cancelled' });
          return;
        }
      } catch (error) {
        log.warn({ component: 'DataGrid', gridId, entity, batchId, error: String(error) }, 'DELETE_CONFIRM_FAILED');
        dispatchSafe('deleteCancelled', { ids: pendingIds, rows: targetRows, reason: 'confirm-error' });
        return;
      }
    } else {
      // Minimal built-in confirm (SSR-safe)
      try {
        const ok = typeof window !== 'undefined'
          ? window.confirm(`Delete ${pendingIds.length} ${entity}${pendingIds.length > 1 ? 's' : ''}?`)
          : true;
        if (!ok) {
          log.info({ component: 'DataGrid', gridId, entity, batchId }, 'DELETE_REJECTED');
          dispatchSafe('deleteCancelled', { ids: pendingIds, rows: targetRows, reason: 'user-cancelled' });
          return;
        }
        log.info({ component: 'DataGrid', gridId, entity, batchId }, 'DELETE_CONFIRMED');
      } catch (error) {
        log.warn({ component: 'DataGrid', gridId, entity, batchId, error: String(error) }, 'DELETE_CONFIRM_BUILTIN_FAILED');
        dispatchSafe('deleteCancelled', { ids: pendingIds, rows: targetRows, reason: 'confirm-error' });
        return;
      }
    }

    // 3) Execute
    markDeleting(pendingIds, true);
    try {
      const t2 = nowMs();
      await deleteStrategy.execute(pendingIds, confirmResult.options);
      log.info({ component: 'DataGrid', gridId, entity, batchId, count: pendingIds.length, durationMs: Math.round(nowMs() - t2) }, 'DELETE_EXECUTED');
      pendingIds.forEach((id: ID) => selectedIds.delete(id));
      dispatchSafe('deleted', { ids: pendingIds, rows: targetRows });
    } catch (error) {
      log.error({ component: 'DataGrid', gridId, entity, batchId, error: String(error) }, 'DELETE_FAILED');
      dispatchSafe('deleteError', { ids: pendingIds, rows: targetRows, error });
    } finally {
      markDeleting(pendingIds, false);
    }
  }

  // Public helpers (exposed to snippets)
  function deleteSelected(): Promise<void> | void { return orchestrateDelete(currentSelectionRows()); }
  function deleteOne(row: any): Promise<void> | void { return orchestrateDelete([row]); }

  // Mount logging
  onMount(() => {
    try {
      const multiselect = selection === 'multiple';
      log.info(
        {
          component: 'DataGrid',
          gridId,
          entity,
          selection,
          multiselect,
          columns: (columns as ColumnDef<any>[]).map((c: ColumnDef<any>) => c.key)
        },
        'Grid mounted'
      );
      if (!deleteStrategy || typeof deleteStrategy.execute !== 'function') {
        log.warn({ component: 'DataGrid', gridId, entity }, 'deleteStrategy.execute missing; delete actions will be disabled');
      }
    } catch (error) {
      // Never let mount logging throw
      console.error('DataGrid mount log failed', error);
    }
  });
</script>

<!-- Root container -->
<div class="pc-grid pc-grid--comfortable" bind:this={rootEl}>
  <!-- Toolbar -->
  <div class="pc-grid__toolbar">
    {#if toolbar}
      {@render toolbar({ selectedIds, deletingObjectIds, deleteSelected })}
    {:else}
      <!-- Default toolbar content -->
      {#if selection !== 'none' && selection === 'multiple'}
        <label class="inline-flex items-center gap-2">
          <input
            type="checkbox"
            aria-label="Select all"
            onchange={(e: Event) => selectAll((e.target as HTMLInputElement).checked)}
          />
          <span>Select all</span>
        </label>
      {/if}
      <button
        class="pc-grid__btn"
        disabled={selectedIds.size === 0 || loading || !deleteStrategy || typeof deleteStrategy.execute !== 'function'}
        onclick={() => deleteSelected()}
        aria-busy={Array.from(selectedIds).some((id: ID) => isDeleting(id))}
      >
        {#if Array.from(selectedIds).some((id: ID) => isDeleting(id))}
          <span class="pc-grid__spinner" aria-hidden="true"></span>
        {/if}
        Delete selected ({selectedIds.size})
      </button>
    {/if}
  </div>

  <!-- Table -->
  <div class="pc-grid__scroller">
    <table class="pc-grid__table">
      <thead class="pc-grid__thead">
        <tr>
          {#if selection !== 'none'}<th class="w-8 pc-grid__th--center"> </th>{/if}
          {#each columns as col}
            <th style={"width:" + (col.width ?? 'auto')} class={col.class}>{col.header}</th>
          {/each}
          <th class="pc-grid__th--right">Actions</th>
        </tr>
      </thead>

      <tbody class="pc-grid__tbody">
        {#if rows.length === 0}
          <tr>
            <td class="pc-grid__empty" colspan={(columns.length + (selection !== 'none' ? 2 : 1))}>
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
              data-deleting={rowIsDeleting(row) ? 'true' : undefined}
              aria-selected={rowIsSelected(row) ? 'true' : undefined}
              class={rowClass(row)}
            >
              {#if selection !== 'none'}
                <td class="pc-grid__td--center">
                  {#if safeGetId(row) != null}
                    <input
                      type={selection === 'single' ? 'radio' : 'checkbox'}
                      checked={rowIsSelected(row)}
                      onchange={() => { const id = safeGetId(row); if (id != null) toggleSelect(id); }}
                      aria-label="Select row"
                    />
                  {:else}
                    <span class="pc-grid__badge pc-grid__badge--warn" title="Missing ID">n/a</span>
                  {/if}
                </td>
              {/if}

              {#each columns as col, colIndex}
                <td class={col.class}>
                  {#if cell}
                    {@render cell({ row, col })}
                  {:else if colIndex === 0}
                    <!-- First column is clickable -->
                    <button 
                      class="pc-grid__link-btn" 
                      type="button"
                      onclick={() => handleRowClick(row)}
                      ondblclick={() => handleRowDoubleClick(row)}
                    >
                      {safeAccessor(row, col)}
                    </button>
                  {:else}
                    {safeAccessor(row, col)}
                  {/if}
                </td>
              {/each}

              <td class="pc-grid__actions">
                {#if rowActions}
                  {@render rowActions({ row, id: safeGetId(row), isDeleting })}
                {:else}
                  <button
                    class="pc-grid__btn pc-grid__btn--danger"
                    disabled={!(safeGetId(row) != null && isRowDeletable(row)) || !deleteStrategy || typeof deleteStrategy.execute !== 'function'}
                    onclick={() => { const id = safeGetId(row); if (id != null) deleteOne(row); }}
                    aria-busy={( () => { const id = safeGetId(row); return id != null && isDeleting(id); } )()}
                  >
                    {#if ( () => { const id = safeGetId(row); return id != null && isDeleting(id); } )()}
                      <span class="pc-grid__spinner" aria-hidden="true"></span>
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

  <!-- Meta snippet -->
  {#if meta}
    {@render meta({ selectedIds, deletingObjectIds, deleteSelected })}
  {/if}
</div>

<style>
  .pc-grid__link-btn {
    background: none;
    border: none;
    color: var(--pc-grid-accent, #0ea5e9);
    cursor: pointer;
    text-align: left;
    font: inherit;
    text-decoration: none;
    padding: 0;
    width: 100%;
    text-align: left;
  }
  
  .pc-grid__link-btn:hover {
    text-decoration: underline;
    color: var(--pc-grid-accent, #0ea5e9);
  }

  .pc-grid__link-btn:focus-visible {
    outline: 2px solid var(--pc-grid-accent, #0ea5e9);
    outline-offset: 2px;
    border-radius: 4px;
  }
</style>