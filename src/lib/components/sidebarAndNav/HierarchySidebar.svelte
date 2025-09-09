<!-- HierarchySidebar -->
 
<script lang="ts">
  // Simple, typed sidebar for the SupplierBrowser
  // Props-only, no slots. Emits a single "select" event.
  // Use onselect={e => handle(e.detail.key)} in parent.

  import "$lib/components/styles/sidebar.css";
  import { log } from "$lib/utils/logger";

  // === TYPES ====================================================================================

  export type Hierarchy = HierarchyTree[];

  export type HierarchyTree = {
    root: string;
    items: HierarchyItem[];
  };

  export type HierarchyItem = {
    key: "suppliers" | "categories" | "offerings" | "attributes" | "links" | (string & {});
    label: string; // already includes counts if you want (e.g. "Suppliers (5)")
    count?: number | null; // optional separate count, shows as a badge if provided
    disabled?: boolean;
    level?: number; // 0..3 for indentation
    href: string;
  };

  // === PROPS ====================================================================================

  export type SelectCbk = (selectedItem: HierarchyItem) => void;

  export type HierarchySidebarProps = {
    hierarchy?: Hierarchy;
    active?: string | null;
    ariaLabel?: string;
    onselect?: SelectCbk;
  };

  const {
    hierarchy = [] as Hierarchy,
    active = null as string | null,
    ariaLabel = "Navigation",
    onselect,
  }:HierarchySidebarProps = $props();

  // === EVENTS HANDLERS =========================================================================

  function handleSelect(item: HierarchyItem) {
    log.debug("Clicked item", item);
    try {
      onselect?.(item);
    } catch (error: unknown) {
      log.error("onselect callback failed:", error);
      /* no-throw */
    }
  }
</script>

<!--- TEMPLATE------------------------------------------------------------------------------------>

<nav
  class="hb"
  aria-label={ariaLabel}
>
  <!-- 1. ÄUSSERE SCHLEIFE: Iteriert über jeden Baum in der Hierarchie -->
  {#each hierarchy as tree (tree.root)}
    <div class="hb__tree">
      <!-- Zeige den Titel des Baumes an, wenn er existiert -->
      {#if tree.root}
        <h3 class="hb__root-title">{tree.root}</h3>
      {/if}

      <ul class="hb__list">
        <!-- 2. INNERE SCHLEIFE: Iteriert über die Items des aktuellen Baumes -->
        {#each tree.items as it (it.key)}
          <li class="hb__li">
            <!-- Der Button-Code bleibt exakt gleich wie vorher -->
            <button
              type="button"
              class="hb__item {active === it.key ? 'is-active' : ''}"
              disabled={!!it.disabled}
              aria-current={active === it.key ? "page" : undefined}
              style={"padding-left:" + (it.level ?? 0) * 14 + "px"}
              onclick={() => !it.disabled && handleSelect(it)}
            >
              <span class="hb__label">{it.label}</span>
              {#if it.count != null}
                <span class="hb__count">{it.count}</span>
              {/if}
            </button>
          </li>
        {/each}
      </ul>
    </div>
  {/each}
</nav>
