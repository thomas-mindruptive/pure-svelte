<script lang="ts">
  // Simple, typed sidebar for the SupplierBrowser
  // Props-only, no slots. Emits a single "select" event.
  // Use onselect={e => handle(e.detail.key)} in parent.

  import "$lib/components/styles/sidebar.css";
  import { log } from "$lib/utils/logger";

  export interface $$Events {
    select: CustomEvent<{ key: string }>;
  }

  export type HierarchyItem = {
    key:
      | "suppliers"
      | "categories"
      | "offerings"
      | "attributes"
      | "links"
      | (string & {});
    label: string; // already includes counts if you want (e.g. "Suppliers (5)")
    count?: number | null; // optional separate count, shows as a badge if provided
    disabled?: boolean;
    level?: number; // 0..3 for indentation
  };

  const {
    items = [] as HierarchyItem[],
    active = null as string | null,
    ariaLabel = "Navigation",
    onselect,
  } = $props<{
    items?: HierarchyItem[];
    active?: string | null;
    ariaLabel?: string;
    onselect?: (event: CustomEvent<{ key: string }>) => void;
  }>();

  function emitSelect(key: string) {
    log.info("🚀 HierarchySidebar: emitSelect called with key:", key);
    try {
      const event = new CustomEvent("select", { detail: { key } });
      // Svelte 5 callback prop
      onselect?.(event);
      log.info(`🚀 HierarchySidebar: ✅ Event dispatched successfully`);
    } catch (error: unknown) {
      log.error("❌ Event dispatch failed:", error);
      /* no-throw */
    }
  }
</script>

<nav class="hb" aria-label={ariaLabel}>
  <ul class="hb__list">
    {#each items as it}
      <li class="hb__li">
        <button
          type="button"
          class="hb__item {active === it.key ? 'is-active' : ''}"
          disabled={!!it.disabled}
          aria-current={active === it.key ? "page" : undefined}
          style={"padding-left:" + (it.level ?? 0) * 14 + "px"}
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
