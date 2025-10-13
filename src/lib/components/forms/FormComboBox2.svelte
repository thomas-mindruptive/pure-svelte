<!-- File: src/lib/components/forms/FormComboBox2.svelte -->
<script
  lang="ts"
  generics="TEntity extends Record<string, any>, TOption extends Record<string, any>, TPath extends NonEmptyPath<TEntity>, TLabelPath extends NonEmptyPath<TOption> = NonEmptyPath<TOption>, TValuePath extends NonEmptyPath<TOption> = NonEmptyPath<TOption>"
>
  import type { FieldsSnippetProps } from "./FormShell.svelte";
  import type { NonEmptyPath, PathValue } from "$lib/utils/pathUtils";
  import { get as getPath } from "$lib/utils/pathUtils";
  import ComboBox2New from "./ComboBox2New.svelte";
  import type { ComboboxProps } from "./ComboBox.types";

  // === PROPS ====================================================================================

  type FormComboBox2Props = Omit<ComboboxProps<TOption, TLabelPath, TValuePath>, 'value' | 'onChange'> & {
    // The field manipulation props from FormShell
    fieldProps: FieldsSnippetProps<TEntity>;

    // The field path as readonly tuple, e.g., ["material_id"]
    path: readonly [...TPath];

    // Additional CSS classes
    class?: string;

    // Optional callback when value changes
    onChange?: (value: PathValue<TEntity, TPath>, item: TOption | null) => void;
  };

  const {
    fieldProps,
    path,
    class: className = "",
    onChange,
    ...comboBoxProps
  }: FormComboBox2Props = $props();

  // === DESTRUCTURE FIELD PROPS ==================================================================

  const { get, set, validationErrors: errors, markTouched } = fieldProps;

  // === DERIVED ==================================================================================

  const fieldName = path.join(".");
  const currentValue = $derived(get(path));
  const hasError = $derived(!!errors[fieldName]);
  const errorMessage = $derived(errors[fieldName]?.[0]);

  // Find the selected item based on current value - use $state to allow binding
  let selectedItem = $state<TOption | null>(null);

  // Sync selectedItem with currentValue
  $effect(() => {
    if (currentValue == null) {
      selectedItem = null;
    } else {
      selectedItem =
        comboBoxProps.items.find((item) => {
          const itemValue = getPath(item, comboBoxProps.valuePath);
          return itemValue === currentValue;
        }) ?? null;
    }
  });

  // === HANDLERS =================================================================================

  function handleChange(newItem: TOption | null) {
    const newValue = (newItem ? getPath(newItem, comboBoxProps.valuePath) : null) as PathValue<TEntity, TPath>;
    set(path, newValue);
    markTouched(fieldName);

    if (onChange) {
      onChange(newValue, newItem);
    }
  }
</script>

<!-- TEMPLATE --------------------------------------------------------------------------------------->

<div class="form-group {className}">
  <ComboBox2New
    {...comboBoxProps}
    bind:value={selectedItem}
    onChange={handleChange}
  />

  {#if hasError}
    <div class="error-text">{errorMessage}</div>
  {/if}
</div>
