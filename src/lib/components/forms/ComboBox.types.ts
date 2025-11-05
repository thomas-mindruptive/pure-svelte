import type { NonEmptyPath } from "$lib/utils/pathUtils.types";

export type ComboboxProps<T extends Record<string, any>, TLabelPath extends NonEmptyPath<T> = NonEmptyPath<T>, TValuePath extends NonEmptyPath<T> = NonEmptyPath<T>> = {
    // Array of items to display in dropdown
    items: T[];

    // Currently selected value (bindable)
    value?: T | null;

    // Optional custom label formatter function (overrides labelPath)
    getLabel?: (item: T) => string;

    // Path to label property (required, supports nested paths like ["address", "city"])
    labelPath: readonly [...TLabelPath];

    // Path to value property for unique keys (required, supports nested paths)
    valuePath: readonly [...TValuePath];

    // Placeholder text for search input
    placeholder?: string;

    // Label text for the combobox
    label?: string | null;

    required?: boolean | undefined;

    // Callback when selection changes
    onChange?: (value: T | null) => void;

    // Optional external filter function for async/custom filtering
    filterFn?: (item: T, searchValue: string) => boolean;

    // Minimum characters required before filtering (for external filters)
    minSearchLength?: number;

    // Show dropdown toggle button (disabled for external filters)
    showDropdownButton?: boolean;
  };
