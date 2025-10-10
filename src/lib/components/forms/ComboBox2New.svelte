<!-- File: src/lib/components/forms/ComboBox2.svelte -->
<script
  lang="ts"
  generics="T extends Record<string, any>, TLabelPath extends NonEmptyPath<T> = NonEmptyPath<T>, TValuePath extends NonEmptyPath<T> = NonEmptyPath<T>"
>
  import type { NonEmptyPath } from "$lib/utils/pathUtils";
  import { get as getPath } from "$lib/utils/pathUtils";
  import type { ComboboxProps } from "./ComboBox.types";

  // === PROPS ====================================================================================

  // ./ComboBox.types.ts  

  // === PROPS DESTRUCTURE ========================================================================

  let {
    items,
    value = $bindable(),
    getLabel,
    labelPath,
    valuePath,
    placeholder = "Search...",
    label = "Selection",
    onChange,
    filterFn,
    minSearchLength = 2,
    showDropdownButton = true,
  }: ComboboxProps<T, TLabelPath, TValuePath> = $props();

  // === STATE ====================================================================================

  let isOpen = $state(false);
  let searchTerm = $state("");
  let isPositionCalculated = $state(false);
  let showAllMode = $state(false);

  let containerEl: HTMLDivElement | null = $state(null);
  let dropdownEl: HTMLUListElement | null = $state(null);

  // Using $state and $effect instead of $derived for robustness against tooling errors
  let filteredItems = $state<T[]>(items);

  // === EFFECTS ==================================================================================

  // Filter items based on search term or external filter
  $effect(() => {
    // EXTERNAL FILTER: Use provided filterFn, require minimum search length
    if (filterFn) {
      if (searchTerm.length < minSearchLength) {
        filteredItems = [];
      } else {
        filteredItems = items.filter((item) => filterFn(item, searchTerm));
      }
      return;
    }

    // LOCAL FILTER: Show all items in dropdown mode or filter by search term
    if (showAllMode || searchTerm === "") {
      filteredItems = items;
    } else {
      const localSearchTerm = searchTerm.toLowerCase();
      filteredItems = items.filter((item) => getItemLabel(item).toLowerCase().includes(localSearchTerm));
    }
  });

  // Close dropdown when clicking outside
  $effect(() => {
    if (isOpen) {
      const handleClickOutside = (event: MouseEvent) => {
        if (containerEl && !containerEl.contains(event.target as Node)) {
          close();
        }
      };
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  });

  // Position dropdown above or below based on available space
  $effect(() => {
    if (isOpen && containerEl && dropdownEl && !isPositionCalculated) {
      const containerRect = containerEl.getBoundingClientRect();
      const spaceBelow = window.innerHeight - containerRect.bottom;
      const dropdownHeight = dropdownEl.offsetHeight;
      if (spaceBelow < dropdownHeight && containerRect.top > dropdownHeight) {
        dropdownEl.classList.add("drop-up");
      } else {
        dropdownEl.classList.remove("drop-up");
      }
      isPositionCalculated = true;
    }
  });

  // Sync search term with selected value
  $effect(() => {
    searchTerm = getItemLabel(value);
  });

  // === HELPERS ==================================================================================

  function getItemKey(item: T): string | T {
    if (typeof item === "object" && item && valuePath) {
      const value = getPath(item, valuePath);
      return String(value);
    }
    return item;
  }

  function getItemLabel(item: T | null | undefined): string {
    if (item === null || item === undefined) return "";
    if (getLabel) return getLabel(item);
    if (typeof item === "object" && labelPath) {
      const value = getPath(item, labelPath);
      return String(value ?? "");
    }
    return String(item);
  }

  // === HANDLERS =================================================================================

  function select(item: T) {
    value = item;
    isOpen = false;
    if (onChange) {
      onChange(item);
    }
  }

  function open() {
    isPositionCalculated = false;
    isOpen = true;
  }

  function close() {
    searchTerm = getItemLabel(value);
    showAllMode = false;
    isOpen = false;
  }

  function toggleDropdown() {
    if (isOpen) {
      close();
    } else {
      // Only allow "show all" for local filtering (no external filterFn)
      if (!filterFn) {
        showAllMode = true;
        searchTerm = "";
        open();
      }
    }
  }

  function handleFocus(event: FocusEvent) {
    (event.currentTarget as HTMLInputElement).select();
    open();
  }
</script>

<!-- TEMPLATE --------------------------------------------------------------------------------------->

<div
  class="combobox-container"
  bind:this={containerEl}
>
  <label for="combobox-input">{label}</label>
  <div class="combobox-input-wrapper">
    <input
      type="text"
      id="combobox-input"
      class="combobox-input"
      class:combobox-input--no-button={!showDropdownButton}
      {placeholder}
      bind:value={searchTerm}
      onfocus={handleFocus}
      oninput={() => {
        showAllMode = false;
        open();
      }}
      onkeydown={(e) => {
        if (e.key === "Escape") close();
      }}
      autocomplete="off"
      role="combobox"
      aria-expanded={isOpen}
      aria-controls="combobox-list"
    />
    {#if showDropdownButton}
      <button
        type="button"
        class="dropdown-toggle-button"
        onclick={toggleDropdown}
        aria-label="Toggle dropdown"
        disabled={!!filterFn}
      >
        ⯆
      </button>
    {/if}
  </div>

  {#if isOpen}
    {#if filterFn && searchTerm.length < minSearchLength}
      <!-- Show hint for external filter when minimum length not reached -->
      <div class="dropdown dropdown-hint">
        Please enter at least {minSearchLength} character{minSearchLength !== 1 ? "s" : ""} to search
      </div>
    {:else}
      <!-- Show filtered items -->
      <ul
        class="dropdown"
        bind:this={dropdownEl}
        id="combobox-list"
        role="listbox"
      >
        {#each filteredItems as item (getItemKey(item))}
          <li role="presentation">
            <button
              type="button"
              class="dropdown-item"
              onclick={() => select(item)}
              role="option"
              aria-selected={item === value}
            >
              {getItemLabel(item)}
            </button>
          </li>
        {:else}
          <li
            class="no-results"
            role="option"
            aria-disabled="true"
            aria-selected="false"
          >
            No results found
          </li>
        {/each}
      </ul>
    {/if}
  {/if}
</div>

<style>
  .combobox-container {
    position: relative;
    width: 100%;
    font-family: inherit;
  }
  .combobox-input-wrapper {
    position: relative;
    display: flex;
    align-items: flex-end;
    width: 100%;
  }
  .combobox-input {
    flex: 1;
    /* Material Design: underline style */
    border: none;
    border-bottom: 1px solid var(--color-border, #cbd5e1);
    border-radius: 0;
    background-color: transparent;
    padding: 0.6rem 2rem 0.6rem 0.2rem;
    font-size: 0.875rem;
    transition: border-bottom 0.2s ease-in-out;
    font-family: inherit;
    box-sizing: border-box;
  }
  .combobox-input--no-button {
    padding-right: 0.2rem;
  }
  .combobox-input:focus {
    outline: none;
    border-bottom: 2px solid var(--color-primary, #4f46e5);
    padding-bottom: calc(0.6rem - 1px);
    z-index: 1;
  }
  .combobox-input::placeholder {
    color: var(--color-muted, #64748b);
  }
  .dropdown-toggle-button {
    /* Material Design: minimalistic button aligned with underline */
    position: absolute;
    right: 0;
    bottom: 0;
    padding: 0.6rem 0.5rem;
    font-size: 0.875rem;
    background: transparent;
    border: none;
    border-bottom: 1px solid var(--color-border, #cbd5e1);
    cursor: pointer;
    transition: all 0.2s ease;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--color-muted, #64748b);
  }
  .dropdown-toggle-button:hover:not(:disabled) {
    color: var(--color-primary, #4f46e5);
    background: transparent;
  }
  .dropdown-toggle-button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  .combobox-input:focus ~ .dropdown-toggle-button {
    border-bottom: 2px solid var(--color-primary, #4f46e5);
    padding-bottom: calc(0.6rem - 1px);
  }
  .dropdown {
    position: absolute;
    width: 100%;
    top: 100%;
    left: 0;
    margin-top: 4px;
    padding: 0;
    list-style: none;
    background: white;
    border: 1px solid #ccc;
    border-radius: 4px;
    box-shadow: 0 4px 8px rgba(0, 0, 0, 0.1);
    max-height: 200px;
    overflow-y: auto;
    z-index: 1000;
  }
  .dropdown-hint {
    padding: 12px;
    color: #6c757d;
    font-size: 14px;
    font-style: italic;
    text-align: center;
    list-style: none;
    overflow-y: visible;
  }
  .dropdown li {
    padding: 0;
    margin: 0;
  }
  .dropdown-item {
    all: unset;
    box-sizing: border-box;
    display: block;
    width: 100%;
    padding: 0.375rem 0.75rem;
    text-align: left;
    cursor: pointer;
    font-size: 0.8rem;
    line-height: 1.4;
  }
  .dropdown-item:hover,
  .dropdown-item:focus {
    background-color: #f0f0f0;
  }
  .dropdown .no-results {
    padding: 8px 12px;
    color: #888;
    cursor: default;
  }
</style>
