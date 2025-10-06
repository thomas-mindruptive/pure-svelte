<!-- File: src/lib/components/forms/FormCombobox.svelte -->
<script
  lang="ts"
  generics="TEntity extends Record<string, any>, TOption extends Record<string, any>, TPath extends NonEmptyPath<TEntity>"
>
  import type { FieldsProps } from "./FormShell.svelte";
  import type { NonEmptyPath, PathValue } from "$lib/utils/pathUtils";

  // === PROPS ====================================================================================

  interface FormComboboxProps<TEntity, TOption, TPath extends NonEmptyPath<TEntity>> {
    /** The field manipulation props from FormShell */
    fieldProps: FieldsProps<TEntity>;

    /** The field path as readonly tuple, e.g., ["material_id"] or ["address", "city"] */
    path: readonly [...TPath];

    /** Array of options to display */
    options: TOption[];

    /** Which property of the option represents the value (typically an ID field) */
    optionValue: keyof TOption & string;

    /** Which property of the option to display as the label (used if formatLabel not provided) */
    optionLabel: keyof TOption & string;

    /** Label text for the combobox */
    label: string;

    /** Placeholder text */
    placeholder?: string;

    /** Whether the field is required */
    required?: boolean;

    /** Additional CSS classes */
    class?: string;

    /** HTML id attribute (defaults to first key in path) */
    id?: string;

    /** Optional callback when value changes - receives the new value and the selected option item */
    onChange?: (value: PathValue<TEntity, TPath>, item: TOption | null) => void;

    /** Optional formatter function to customize the display label */
    formatLabel?: (option: TOption) => string;
  }

  const {
    fieldProps,
    path,
    options,
    optionValue,
    optionLabel,
    label,
    placeholder = "Select...",
    required = false,
    class: className = "",
    id,
    onChange,
    formatLabel,
  }: FormComboboxProps<TEntity, TOption, TPath> = $props();

  // === DESTRUCTURE FIELD PROPS ==================================================================

  const { get, set, errors, markTouched } = fieldProps;

  // === DERIVED ==================================================================================

  const fieldName = String(path[0]);
  const htmlId = id ?? fieldName;
  const currentValue = $derived(get(path) ?? "");
  const hasError = $derived(!!errors[fieldName]);
  const errorMessage = $derived(errors[fieldName]?.[0]);

  // === HELPERS ==================================================================================

  function getDisplayLabel(option: TOption): string {
    return formatLabel ? formatLabel(option) : String(option[optionLabel]);
  }

  // === HANDLERS =================================================================================

  function handleChange(e: Event) {
    const rawValue = (e.currentTarget as HTMLSelectElement).value;

    // Parse to number if the value looks like a number
    const parsedValue = rawValue === "" ? null : /^\d+$/.test(rawValue) ? parseInt(rawValue, 10) : rawValue;

    // Update form state
    set(path, parsedValue as PathValue<TEntity, TPath>);

    // Call onChange callback if provided
    if (onChange) {
      // Find the selected option item
      const selectedItem = parsedValue === null ? null : (options.find((opt) => String(opt[optionValue]) === String(parsedValue)) ?? null);

      onChange(parsedValue as PathValue<TEntity, TPath>, selectedItem);
    }
  }
</script>

<!-- TEMPLATE ------------------------------------------------------------------------------------->

<div class="form-group {className}">
  <label for={htmlId}>{label}</label>
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
    {#each options as option (option[optionValue])}
      <option value={option[optionValue]}>
        {getDisplayLabel(option)}
      </option>
    {/each}
  </select>
  {#if hasError}
    <div class="error-text">{errorMessage}</div>
  {/if}
</div>
