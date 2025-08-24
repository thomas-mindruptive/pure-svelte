<script lang="ts">
    // CategoryAssignment.svelte (Svelte 5 + Runes)
    //
    // PURPOSE:
    // Simple UI component for assigning categories to suppliers (n:m relationship).
    // This is NOT a form for creating category objects - it only creates relationships
    // between existing suppliers and existing categories.
    //
    // WORKFLOW:
    // 1. Shows dropdown of available (unassigned) categories
    // 2. User selects category and clicks "Assign"
    // 3. Creates wholesaler_categories entry
    // 4. NO navigation - stays on current level
    // 5. Updates UI to reflect new assignment
    //
    // ARCHITECTURE:
    // - Uses callback props for Svelte 5 pattern
    // - Handles loading states and error feedback
    // - Integrates with existing CSS design system

    import { log } from "$lib/utils/logger";
    import type { ProductCategory } from "$lib/domain/types";
    import "$lib/components/styles/form.css";

    // ===== COMPONENT PROPS =====

    const {
        // Data
        supplierId, // Current supplier being edited
        availableCategories = [] as ProductCategory[], // Categories not yet assigned

        // State
        loading = false, // Whether assignment operation is in progress
        disabled = false, // Whether the entire UI should be disabled

        // Callbacks (Svelte 5 pattern)
        onAssigned, // Called when assignment succeeds: (category) => void
        onError, // Called when assignment fails: (error) => void
    } = $props<{
        supplierId: number;
        availableCategories?: ProductCategory[];
        loading?: boolean;
        disabled?: boolean;
        onAssigned?: (category: ProductCategory) => void;
        onError?: (error: string) => void;
    }>();

    // ===== LOCAL STATE =====

    // Currently selected category ID in the dropdown
    let selectedCategoryId = $state<number | null>(null);

    // Assignment operation in progress (local loading state)
    let assigning = $state(false);

    // ===== COMPUTED PROPERTIES =====

    // Get the full category object for the currently selected ID
    const selectedCategory = $derived(
        selectedCategoryId
            ? availableCategories.find(
                  (cat: ProductCategory) =>
                      cat.category_id === selectedCategoryId,
              )
            : null,
    );

    // Whether the assign button should be enabled
    const canAssign = $derived(
        !loading &&
            !disabled &&
            !assigning &&
            selectedCategoryId !== null &&
            selectedCategory !== undefined,
    );

    // ===== ASSIGNMENT LOGIC =====

    /**
     * Calls the API to assign a category to a supplier.
     * @param aSupplierId
     * @param aCategoryId
     */
    async function callAssignApi(
        aSupplierId: number,
        aCategoryId: number,
    ): Promise<Response> {
        const mock = true;

        if (mock) {
            const response = await new Promise<Response>((resolve) =>
                setTimeout(
                    () =>
                        resolve({
                            ok: true,
                            json: async () => ({ success: true }),
                            text: async () => "Assignment successful",
                        } as Response),
                    1000,
                ),
            );
            return response
        } else {
            // Build form data for the assignment request
            const formData = new FormData();
            formData.append("supplierId", aSupplierId.toString());
            formData.append("categoryId", aCategoryId.toString());

            // Make API request to create the relationship
            // Note: In real implementation, this would hit an actual API endpoint
            const response = await fetch("/api/supplier-categories", {
                method: "POST",
                body: formData,
            });
            return response;
        }
    }

    /**
     * Performs the category assignment operation.
     * Creates a new wholesaler_categories relationship entry.
     * Handles success/error feedback via callback props.
     */
    async function handleAssign() {
        // Validation: ensure we have a valid category selected
        if (!selectedCategory || !supplierId) {
            log.error(
                {
                    component: "CategoryAssignment",
                    supplierId,
                    selectedCategoryId,
                },
                "Invalid assignment state",
            );
            onError?.("Invalid selection - please select a category");
            return;
        }

        // Prevent double-submission
        if (assigning) return;

        assigning = true;

        try {
            log.info(
                {
                    component: "CategoryAssignment",
                    supplierId,
                    categoryId: selectedCategory.category_id,
                    categoryName: selectedCategory.name,
                },
                "ASSIGNMENT_REQUESTED",
            );

            const response = await callAssignApi(
                supplierId,
                selectedCategory.category_id,
            );

            if (!response.ok) {
                const errorText = await response
                    .text()
                    .catch(() => "Assignment failed");
                throw new Error(errorText);
            }

            // Parse successful response
            const result = await response.json().catch(() => ({}));

            log.info(
                {
                    component: "CategoryAssignment",
                    supplierId,
                    categoryId: selectedCategory.category_id,
                    result,
                },
                "ASSIGNMENT_SUCCESS",
            );

            // Notify parent component of successful assignment
            onAssigned?.(selectedCategory);

            // Reset UI state for next assignment
            selectedCategoryId = null;
        } catch (error) {
            log.error(
                {
                    component: "CategoryAssignment",
                    supplierId,
                    categoryId: selectedCategory?.category_id,
                    error: String(error),
                },
                "ASSIGNMENT_FAILED",
            );

            // Notify parent component of failure
            onError?.(
                error instanceof Error ? error.message : "Assignment failed",
            );
        } finally {
            assigning = false;
        }
    }

    /**
     * Handles dropdown selection change.
     * Updates selected category and logs selection for debugging.
     */
    function handleCategorySelect(event: Event) {
        const target = event.target as HTMLSelectElement;
        const value = target.value;

        selectedCategoryId = value ? Number(value) : null;

        log.debug(
            {
                component: "CategoryAssignment",
                selectedCategoryId,
                categoryName: selectedCategory?.name,
            },
            "Category selected",
        );
    }

    /**
     * Handles form submission (Enter key in dropdown).
     * Provides keyboard accessibility for the assignment action.
     */
    function handleSubmit(event: Event) {
        event.preventDefault();
        if (canAssign) {
            handleAssign();
        }
    }
</script>

<!-- 
  CATEGORY ASSIGNMENT UI
  Simple form-like interface for creating supplier-category relationships
  Uses existing form.css styling for consistency with other forms
-->
<div class="category-assignment">
    <!-- Section header with context information -->
    <div class="assignment-header">
        <h4>Assign Category</h4>
        <p class="field-hint">
            Add a new category to this supplier. Categories define the product
            types this supplier offers.
        </p>
    </div>

    <!-- Assignment form - uses form styling but simpler structure than FormShell -->
    <form class="assignment-form" onsubmit={handleSubmit}>
        <div class="form-grid">
            <!-- Category selection dropdown -->
            <div class="form-group span-3">
                <label for="category-select">Available Categories</label>
                <select
                    id="category-select"
                    value={selectedCategoryId ?? ""}
                    onchange={handleCategorySelect}
                    disabled={disabled ||
                        assigning ||
                        availableCategories.length === 0}
                    required
                    aria-describedby="category-hint"
                >
                    <option value="">
                        {availableCategories.length === 0
                            ? "No categories available"
                            : "Select a category..."}
                    </option>

                    <!-- Render all available categories -->
                    {#each availableCategories as category (category.category_id)}
                        <option value={category.category_id}>
                            {category.name}
                            {#if category.description}
                                - {category.description}
                            {/if}
                        </option>
                    {/each}
                </select>

                <div id="category-hint" class="field-hint">
                    {#if availableCategories.length === 0}
                        All available categories have been assigned to this
                        supplier.
                    {:else}
                        Choose from {availableCategories.length} available categories
                    {/if}
                </div>
            </div>

            <!-- Assign button -->
            <div class="form-group">
                <label>&nbsp;</label>
                <!-- Spacer to align with select field -->
                <button
                    type="button"
                    class="primary-button"
                    onclick={handleAssign}
                    disabled={!canAssign}
                    aria-busy={assigning}
                    title={canAssign
                        ? `Assign ${selectedCategory?.name || "selected category"} to this supplier`
                        : "Select a category to assign"}
                >
                    <!-- Loading spinner during assignment -->
                    {#if assigning}
                        <span class="pc-grid__spinner" aria-hidden="true"
                        ></span>
                    {/if}

                    {assigning ? "Assigning..." : "Assign Category"}
                </button>
            </div>
        </div>
    </form>

    <!-- Assignment statistics/feedback -->
    {#if availableCategories.length > 0}
        <div class="assignment-stats">
            <span class="field-hint">
                💡 Tip: You can assign multiple categories to give suppliers
                access to different product types.
            </span>
        </div>
    {/if}
</div>

<style>
    /* 
    CATEGORY ASSIGNMENT STYLES
    Extends the existing form.css system with assignment-specific styling
    Maintains consistency with SupplierForm and other form components
  */

    .category-assignment {
        background: var(--color-background, #fff);
        border: 1px solid var(--color-border, #e2e8f0);
        border-radius: 8px;
        padding: 1.5rem;
        margin-bottom: 1.5rem;
        box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
    }

    .assignment-header {
        margin-bottom: 1.5rem;
        padding-bottom: 1rem;
        border-bottom: 1px solid var(--color-border, #e2e8f0);
    }

    .assignment-header h4 {
        margin: 0 0 0.5rem 0;
        font-size: 1.125rem;
        font-weight: 600;
        color: var(--color-heading, #0f172a);
    }

    .assignment-stats {
        margin-top: 1rem;
        padding-top: 1rem;
        border-top: 1px solid var(--color-border, #e2e8f0);
    }

    /* Ensure primary button inherits from form.css but add assignment-specific tweaks */
    .primary-button {
        min-width: 140px; /* Consistent width regardless of text content */
        justify-content: center; /* Center the spinner and text */
        display: flex;
        align-items: center;
        gap: 0.5rem;
    }

    /* Loading state adjustments */
    .primary-button[aria-busy="true"] {
        pointer-events: none; /* Prevent double-clicks during loading */
    }

    /* Responsive adjustments for smaller screens */
    @media (max-width: 768px) {
        .category-assignment {
            padding: 1rem;
            margin-bottom: 1rem;
        }

        .assignment-header h4 {
            font-size: 1rem;
        }

        .form-grid {
            grid-template-columns: 1fr; /* Stack vertically on mobile */
        }

        .form-group.span-3 {
            grid-column: span 1; /* Remove span on mobile */
        }
    }
</style>
