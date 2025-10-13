<!-- File: src/lib/components/forms/Field.svelte -->
<script
  lang="ts"
  generics="TEntity extends Record<string, any>, TPath extends NonEmptyPath<TEntity>"
>
  import type { FieldsSnippetProps } from "./FormShell.svelte";
  import type { NonEmptyPath, PathValue } from "$lib/utils/pathUtils";
    import type { FullAutoFill } from "svelte/elements";

  // === PROPS ====================================================================================

  interface FieldProps<TEntity, TPath extends NonEmptyPath<TEntity>> {
    // The field manipulation props from FormShell
    fieldProps: FieldsSnippetProps<TEntity>;

    // The field path as readonly tuple, e.g., ["order_date"] or ["address", "city"]
    path: readonly [...TPath];

    // Label text for the field
    label: string;

    // Input type
    type?: "text" | "email" | "url" | "number" | "date" | "textarea" | "checkbox";

    // Placeholder text
    placeholder?: string;

    // Whether the field is required
    required?: boolean;

    // Additional CSS classes
    class?: string;

    // HTML id attribute (defaults to path joined with dashes)
    id?: string;

    // Rows for textarea
    rows?: number;

    // Min/max for number/date inputs
    min?: string | number;
    max?: string | number;

    // Step for number inputs
    step?: string | number;

    // Pattern for regex validation
    pattern?: string;

    // Max length for text inputs
    maxlength?: number;

    // Min length for text inputs
    minlength?: number;

    // Readonly state
    readonly?: boolean;

    // Disabled state
    disabled?: boolean;

    // Autocomplete attribute
    autocomplete?: FullAutoFill | null | undefined;

    // Input mode (for mobile keyboards)
    inputmode?: "none" | "text" | "decimal" | "numeric" | "tel" | "search" | "email" | "url";

    // Title attribute (for tooltip)
    title?: string;

    // Spellcheck
    spellcheck?: boolean;

    // Optional callback when value changes
    onInput?: (value: PathValue<TEntity, TPath>) => void;
  }

  const {
    fieldProps,
    path,
    label,
    type = "text",
    placeholder,
    required = false,
    class: className = "",
    id,
    rows = 4,
    min,
    max,
    step,
    pattern,
    maxlength,
    minlength,
    readonly = false,
    disabled = false,
    autocomplete,
    inputmode,
    title,
    spellcheck,
    onInput,
  }: FieldProps<TEntity, TPath> = $props();

  // === DESTRUCTURE FIELD PROPS ==================================================================

  const { get, set, validationErrors: errors, markTouched } = fieldProps;

  // === DERIVED ==================================================================================

  // Join path segments with dots for error lookup (e.g., ["address", "city"] → "address.city")
  const fieldName = path.join(".");
  const htmlId = id ?? path.join("-");
  const checkboxValue = $derived(!!get(path));
  const textValue = $derived(get(path) ?? "");
  const hasError = $derived(!!errors[fieldName]);
  const errorMessage = $derived(errors[fieldName]?.[0]);

  // === HANDLERS =================================================================================

  function handleInput(e: Event) {
    const target = e.currentTarget as HTMLInputElement | HTMLTextAreaElement;
    let value: any;

    // Handle checkbox
    if (type === "checkbox") {
      value = (target as HTMLInputElement).checked;
    } else {
      value = target.value;

      // Parse number inputs to actual numbers
      if (type === "number" && value !== "") {
        value = parseFloat(value);
        if (isNaN(value)) {
          value = null;
        }
      }
    }

    set(path, value as PathValue<TEntity, TPath>);

    // Call onInput callback if provided
    if (onInput) {
      onInput(value as PathValue<TEntity, TPath>);
    }
  }

  function handleBlur() {
    markTouched(fieldName);
  }
</script>

<!-- TEMPLATE ------------------------------------------------------------------------------------->

<div class="form-group {className}">
  {#if type === "checkbox"}
    <label for={htmlId}>
      <input
        id={htmlId}
        name={fieldName}
        type="checkbox"
        checked={checkboxValue}
        {required}
        {disabled}
        {title}
        onchange={handleInput}
        onblur={handleBlur}
      />
      {label}
    </label>
  {:else}
    <label for={htmlId}>{label}</label>

    {#if type === "textarea"}
      <textarea
        id={htmlId}
        name={fieldName}
        value={textValue}
        {placeholder}
        {rows}
        {required}
        {readonly}
        {disabled}
        {maxlength}
        {minlength}
        {autocomplete}
        {title}
        {spellcheck}
        oninput={handleInput}
        onblur={handleBlur}
      ></textarea>
    {:else}
      <input
        id={htmlId}
        name={fieldName}
        type={type}
        value={textValue}
        {placeholder}
        {required}
        {readonly}
        {disabled}
        {min}
        {max}
        {step}
        {pattern}
        {maxlength}
        {minlength}
        {autocomplete}
        {inputmode}
        {title}
        {spellcheck}
        oninput={handleInput}
        onblur={handleBlur}
      />
    {/if}
  {/if}

  {#if hasError}
    <div class="error-text">{errorMessage}</div>
  {/if}
</div>
