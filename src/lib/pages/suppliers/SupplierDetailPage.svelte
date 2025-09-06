<!-- src/lib/pages/suppliers/SupplierDetailPage.svelte - REFACTORED & COMPLETE -->
<script lang="ts">
	import { goto } from "$app/navigation";
	import { log } from "$lib/utils/logger";
	import { addNotification } from "$lib/stores/notifications";
	import { requestConfirmation } from "$lib/stores/confirmation";

	// Component Imports
	import "$lib/components/styles/detail-page-layout.css";
	import "$lib/components/styles/assignment-section.css";
	import "$lib/components/styles/grid-section.css";
	import SupplierForm from "$lib/components/domain/suppliers/SupplierForm.svelte";
	import CategoryGrid from "$lib/components/domain/categories/CategoryGrid.svelte";
	import CategoryAssignment from "$lib/components/domain/suppliers/CategoryAssignment.svelte";

	// API & Type Imports
	import {
		getSupplierApi,
		supplierLoadingState,
	} from "$lib/api/client/supplier";
	import type {
		ProductCategory,
		WholesalerCategory_Category,
		WholesalerCategory,
	} from "$lib/domain/domainTypes";
	import { categoryLoadingState } from "$lib/api/client/category";
	import { ApiClient } from "$lib/api/client/ApiClient";
	import type {
		ID,
		DeleteStrategy,
		RowActionStrategy,
	} from "$lib/components/grids/Datagrid.types";

	// Schemas
	import {
		SupplierDetailPage_LoadDataSchema,
		type SupplierDetailPage_LoadData,
		type SupplierDetailPage_LoadDataAsync,
	} from "./supplierDetailPage.types";

	// --- PROPS ---

	// The component now receives the object with promises from the `load` function.
	let { data } = $props<{ data: SupplierDetailPage_LoadDataAsync }>();

	// --- LOCAL REACTIVE STATE ---

	// These variables will store the result of the promise resolution.
	let resolvedData = $state<SupplierDetailPage_LoadData | null>(null);
	let isLoading = $state(true);
	let loadingError = $state<{ message: string; status?: number } | null>(
		null,
	);

	// --- DATA PROCESSING with $effect (NEW) ---
	// This is the core of the async pattern. It runs whenever the `data` prop changes.
	$effect(() => {
		let aborted = false;

		const processPromises = async () => {
			// 1. Reset state for each new load.
			isLoading = true;
			loadingError = null;
			resolvedData = null;

			try {
				// 2. Resolve all promises in parallel.
				const [supplier, assignedCategories, availableCategories] =
					await Promise.all([
						data.supplier,
						data.assignedCategories,
						data.availableCategories,
					]);

				if (aborted) return;

				// 3. Assemble the data object for validation.
				const dataToValidate = {
					supplier,
					assignedCategories,
					availableCategories,
				};

				// 4. Validate the resolved data against the Zod schema.
				const validationResult =
					SupplierDetailPage_LoadDataSchema.safeParse(dataToValidate);

				if (!validationResult.success) {
					log.error(
						"(SupplierDetailPage) Zod validation failed",
						validationResult.error.issues,
					);
					// Treat a validation failure as a loading error.
					throw new Error(
						"Received invalid data structure from the API.",
					);
				}

				// 5. On success, populate the state with the validated, resolved data.
				resolvedData = validationResult.data;
			} catch (rawError: any) {
				if (aborted) return;
				// 6. Handle any error from fetching or validation.
				const status = rawError.status ?? 500;
				const message =
					rawError.message || "Failed to load supplier details.";
				loadingError = { message, status };
				log.error("(SupplierDetailPage) Promise processing failed", {
					rawError,
				});
			} finally {
				if (!aborted) {
					// 7. Always end the loading state.
					isLoading = false;
				}
			}
		};

		processPromises();
		return () => {
			aborted = true;
		};
	});

	// --- EVENT HANDLERS & STRATEGIES (Unchanged logic, adapted to use `resolvedData`) ---

	const client = new ApiClient(fetch);
	const supplierApi = getSupplierApi(client);

	async function handleFormSubmitted(event: { data: Record<string, any> }) {
		addNotification(
			`Supplier updated successfully.`,
			"success",
		);
	}

	/**
	 * Handles the assignment of a new category.
	 */
	async function handleCategoryAssigned(
		category: ProductCategory,
		comment?: string,
		link?: string,
	) {
		if (!resolvedData) return;
		const supplierId = resolvedData.supplier?.wholesaler_id;

		if (!supplierId) {
			log.error("Cannot assign category in create mode.");
			addNotification("Cannot assign category in create mode.", "error");
			return;
		}
		try {
			const wholesalerCategory: Omit<
				WholesalerCategory,
				"wholesaler_id"
			> = {
				category_id: category.category_id,
				...(comment !== undefined ? { comment } : {}),
				...(link !== undefined ? { link } : {}),
			};
			await supplierApi.assignCategoryToSupplier(
				supplierId,
				wholesalerCategory,
			);
			addNotification(
				`Category "${category.name}" assigned successfully.`,
				"success",
			);

			// Reload the page to refresh both assigned and available category grids.
			await goto(`/suppliers/${supplierId}`, { invalidateAll: true });
		} catch (error) {
			log.error(`(SupplierDetailPage) Failed to assign category`, {
				supplierId,
				error,
			});
			addNotification("Failed to assign category.", "error");
		}
	}

	/**
	 * Executes the deletion process for category assignments.
	 */
	async function handleCategoryDelete(ids: ID[]): Promise<void> {
		if (!resolvedData?.supplier) {
			const msg = "Cannot delete catagory in create mode or when supplier not yet loaded.";
			addNotification(msg, "error");
			throw new Error(msg);
		}

		// The logic for this function remains complex and is unchanged.
		// It correctly uses the client-side API.
		let dataChanged = false;
		for (const id of ids) {
			const [supplierIdStr, categoryIdStr] = String(id).split("-");
			const supplierId = Number(supplierIdStr);
			const categoryId = Number(categoryIdStr);
			if (isNaN(supplierId) || isNaN(categoryId)) continue;

			const initialResult = await supplierApi.removeCategoryFromSupplier({
				supplierId,
				categoryId,
				cascade: false,
			});

			if (initialResult.success) {
				addNotification(`Category assignment removed.`, "success");
				dataChanged = true;
			} else if (
				"cascade_available" in initialResult &&
				initialResult.cascade_available
			) {
				const offeringCount =
					(initialResult.dependencies as any)?.offering_count ?? 0;
				const confirmed = await requestConfirmation(
					`This category has ${offeringCount} offerings for this supplier. Remove the assignment and all these offerings?`,
					"Confirm Cascade Delete",
				);
				if (confirmed) {
					const cascadeResult =
						await supplierApi.removeCategoryFromSupplier({
							supplierId,
							categoryId,
							cascade: true,
						});
					if (cascadeResult.success) {
						addNotification(
							"Category assignment and its offerings removed.",
							"success",
						);
						dataChanged = true;
					} else {
						addNotification(
							cascadeResult.message ||
								"Failed to remove assignment.",
							"error",
						);
					}
				}
			} else {
				addNotification(
					initialResult.message || "Could not remove assignment.",
					"error",
				);
			}
		}

		if (dataChanged) {
			goto(`/suppliers/${resolvedData.supplier.wholesaler_id}`, {
				invalidateAll: true,
			});
		}
	}

	/**
	 * Navigates to the next hierarchy level (offerings for a category).
	 */
	function handleCategorySelect(category: WholesalerCategory_Category) {
		goto(
			`/suppliers/${category.wholesaler_id}/categories/${category.category_id}`,
		);
	}

	// Strategy objects for the CategoryGrid component.
	const deleteStrategy: DeleteStrategy<WholesalerCategory_Category> = {
		execute: handleCategoryDelete,
	};
	const rowActionStrategy: RowActionStrategy<WholesalerCategory_Category> = {
		click: handleCategorySelect,
	};
</script>

<!-- TEMPLATE (NEW) with conditional rendering based on loading state -->
{#if loadingError}
	<div class="component-error-boundary">
		<h3>Error Loading Supplier (Status: {loadingError.status})</h3>
		<p>{loadingError.message}</p>
	</div>
{:else if isLoading || !resolvedData}
	<div class="detail-page-layout">Loading supplier details...</div>
{:else}
	<!-- The main UI is only rendered on success, using the `resolvedData` state. -->
	<div class="detail-page-layout">
		<!-- Section 1: Supplier details form -->
		<div class="form-section">
			<SupplierForm
				initial={resolvedData.supplier}
				disabled={$supplierLoadingState}
				onSubmitted={handleFormSubmitted}
				onCancelled={() => goto("/suppliers")}
				onSubmitError={() => log.warn("Supplier form submission error")}
				onChanged={() => log.debug("Supplier form changed")}
			/>
		</div>

		<!-- Section 2: Assign new categories -->
		<div class="assignment-section">
			{#if resolvedData.supplier}
			<CategoryAssignment
				supplierId={resolvedData.supplier.wholesaler_id}
				availableCategories={resolvedData.availableCategories}
				loading={$categoryLoadingState}
				onAssigned={handleCategoryAssigned}
				onError={(msg) => addNotification(msg, "error")}
			/>
			{:else}
				<p>Category assignment will be available after supplier has been saved.</p>
			{/if}
		</div>

		<!-- Section 3: Grid of assigned categories -->
		<div class="grid-section">
			<h2>Assigned Categories</h2>
			<p>
				Products this supplier can offer are organized by these
				categories. Click a category to manage its product offerings.
			</p>
			<CategoryGrid
				rows={resolvedData.assignedCategories}
				loading={$categoryLoadingState}
				{deleteStrategy}
				{rowActionStrategy}
			/>
		</div>
	</div>
{/if}

<style>
	.form-section {
		background: var(--color-background);
		border-radius: 8px;
		border: 1px solid var(--color-border);
	}
	.grid-section {
		padding: 1.5rem;
	}
	h2 {
		margin-top: 0;
	}
	p {
		margin-top: 0;
		margin-bottom: 1rem;
		color: var(--color-muted);
	}
</style>
