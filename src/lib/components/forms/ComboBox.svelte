<!-- File: src/lib/components/forms/FormCombobox.svelte -->
<script
  lang="ts"
  generics="TEntity extends Record<string, any>, TOption extends Record<string, any>, TPath extends NonEmptyPath<TEntity>"
>
  import type { FieldsProps } from "./FormShell.svelte";
  import type { NonEmptyPath, PathValue } from "$lib/utils/pathUtils";

  // === PROPS ====================================================================================
  
  interface FormComboboxProps<TEntity, TOption, TPath extends NonEmptyPath<TEntity>> {
    // The field manipulation props from FormShell
    fieldProps: FieldsProps<TEntity>;
    
    // The field path as readonly tuple, e.g., ["material_id"] or ["address", "city"]
    path: readonly [...TPath];
    
    // Array of options to display - can be updated dynamically for async loading
    items: TOption[];
    
    // Which property of the option represents the value (typically an ID field)
    optionValue: keyof TOption & string;
    
    // Which property of the option to display as the label (used if formatLabel not provided)
    optionLabel: keyof TOption & string;
    
    // Label text for the combobox
    label: string;
    
    // Placeholder text
    placeholder?: string;
    
    // Whether the field is required
    required?: boolean;
    
    // Additional CSS classes
    class?: string;
    
    // HTML id attribute (defaults to first key in path)
    id?: string;
    
    // Optional callback when value changes - receives the new value and the selected option item
    onChange?: (value: PathValue<TEntity, TPath>, item: TOption | null) => void;
    
    // Optional formatter function to customize the display label
    formatLabel?: (option: TOption) => string;
    
    // Optional: custom filter function
    filterFn?: (item: TOption, searchValue: string) => boolean;
  }

  const {
    fieldProps,
    path,
    items,
    optionValue,
    optionLabel,
    label,
    placeholder = "Select...",
    required = false,
    class: className = "",
    id,
    onChange,
    formatLabel,
    filterFn,
  }: FormComboboxProps<TEntity, TOption, TPath> = $props();

  // === DESTRUCTURE FIELD PROPS ==================================================================
  
  const { get, set, errors, markTouched } = fieldProps;

  // === DERIVED ==================================================================================
  
  const fieldName = String(path[0]);
  const htmlId = id ?? fieldName;
  const currentValue = $derived(get(path) ?? "");
  const hasError = $derived(!!errors[fieldName]);
  const errorMessage = $derived(errors[fieldName]?.[0]);
  
  let filterText = $state("");
  
  // === FILTERING ================================================================================
  
  const filteredItems = $derived.by(() => {
    if (filterText === "") return items;
    
    return items.filter(item => {
      if (filterFn) {
        return filterFn(item, filterText);
      }
      // Default: search in label
      const label = getDisplayLabel(item);
      return label.toLowerCase().includes(filterText.toLowerCase());
    });
  });
  
  // === HELPERS ==================================================================================
  
  function getDisplayLabel(item: TOption): string {
    return formatLabel ? formatLabel(item) : String(item[optionLabel]);
  }
  
  // === HANDLERS =================================================================================
  
  function handleChange(e: Event) {
    const rawValue = (e.currentTarget as HTMLSelectElement).value;
    
    let parsedValue: any;
    let selectedItem: TOption | null = null;
    
    // Leerer String = nichts ausgewählt
    if (rawValue === "") {
      parsedValue = null;
    } else {
      // Parse to number if the value looks like a number
      parsedValue = /^\d+$/.test(rawValue) ? parseInt(rawValue, 10) : rawValue;
      
      // Find the selected item for onChange callback
      selectedItem = items.find(item => String(item[optionValue]) === rawValue) ?? null;
    }
    
    // Update form state
    set(path, parsedValue as PathValue<TEntity, TPath>);
    
    // Call onChange callback if provided
    if (onChange) {
      onChange(parsedValue as PathValue<TEntity, TPath>, selectedItem);
    }
  }
</script>

<!-- TEMPLATE ------------------------------------------------------------------------------------->

<div class="form-group {className}">
  <label for={htmlId}>{label}</label>
  
  <!-- Filter Input -->
  <input
    type="text"
    id="{htmlId}-filter"
    placeholder="Filter..."
    bind:value={filterText}
    class="filter-input"
  />
  
  <!-- Native Select -->
  <select
    id={htmlId}
    name={fieldName}
    value={currentValue}
    class:invalid={hasError}
    onchange={handleChange}
    onblur={() => markTouched(fieldName)}
    {required}
  >
    <option value="">{placeholder}</option>
    {#each filteredItems as item (item[optionValue])}
      <option value={item[optionValue]}>
        {getDisplayLabel(item)}
      </option>
    {/each}
  </select>
  
  {#if hasError}
    <div class="error-text">{errorMessage}</div>
  {/if}
</div>

<style>
  .filter-input {
    margin-bottom: 0.25rem;
    font-size: 0.875rem;
    font-style: italic;
  }
</style>