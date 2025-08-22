<script lang="ts">
  // Simple, typed sidebar for the SupplierBrowser
  // Props-only, no slots. Emits a single "select" event.
  // Use onselect={e => handle(e.detail.key)} in parent.

  export interface $$Events {
    select: CustomEvent<{ key: string }>;
  }

  export type HierarchyItem = {
    key: 'suppliers' | 'categories' | 'offerings' | 'attributes' | 'links' | (string & {});
    label: string;           // already includes counts if you want (e.g. "Suppliers (5)")
    count?: number | null;   // optional separate count, shows as a badge if provided
    disabled?: boolean;
    level?: number;          // 0..3 for indentation
  };

  const {
    items = [] as HierarchyItem[],
    active = null as string | null,
    ariaLabel = 'Navigation'
  } = $props<{
    items?: HierarchyItem[];
    active?: string | null;
    ariaLabel?: string;
  }>();

  let rootEl: HTMLElement;

  function emitSelect(key: string) {
    try {
      rootEl?.dispatchEvent(new CustomEvent('select', { detail: { key } }));
    } catch {
      /* no-throw */
    }
  }
</script>

<nav class="hb" aria-label={ariaLabel} bind:this={rootEl}>
  <ul class="hb__list">
    {#each items as it}
      <li class="hb__li">
        <button
          type="button"
          class="hb__item {active === it.key ? 'is-active' : ''}"
          disabled={!!it.disabled}
          aria-current={active === it.key ? 'page' : undefined}
          style={"padding-left:" + ((it.level ?? 0) * 14) + "px"}
          onclick={() => !it.disabled && emitSelect(it.key)}
        >
          <span class="hb__label">{it.label}</span>
          {#if it.count != null}
            <span class="hb__count">{it.count}</span>
          {/if}
        </button>
      </li>
    {/each}
  </ul>
</nav>

<style>
  .hb { display: block; border-right: 1px solid var(--pc-grid-border, #e5e7eb); }
  .hb__list { list-style: none; margin: 0; padding: .25rem 0; }
  .hb__li { margin: 0; }
  .hb__item {
    width: 100%;
    text-align: left;
    display: flex;
    align-items: center;
    gap: .5rem;
    padding: .5rem .75rem;
    background: none;
    border: 0;
    cursor: pointer;
    font: inherit;
    color: inherit;
  }
  .hb__item[disabled] { opacity: .5; cursor: not-allowed; }
  .hb__item:hover:not([disabled]) { background: rgba(0,0,0,.03); }
  .hb__item.is-active { background: rgba(0,0,0,.06); font-weight: 600; }
  .hb__label { flex: 1 1 auto; }
  .hb__count {
    flex: 0 0 auto;
    font-size: .75rem;
    line-height: 1;
    padding: .2rem .4rem;
    border-radius: .5rem;
    background: var(--pc-grid-badge, #eef2ff);
  }
</style>
