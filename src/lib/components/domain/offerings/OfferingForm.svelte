<!-- src/lib/components/domain/offerings/OfferingForm.svelte -->
<script lang="ts">
	/**
	 * OfferingForm Component (Svelte 5 + Runes)
	 *
	 * @description A form for creating and editing product offerings (WholesalerItemOffering).
	 * It follows the "Dumb Shell / Smart Parent" pattern, using FormShell for state management.
	 *
	 * @architecture
	 * - Requires `supplierId` and `categoryId` context for creating new offerings.
	 * - Requires a list of `availableProducts` for the product definition dropdown.
	 * - Implements offering-specific validation and submission logic.
	 * - Uses the ApiClient factory pattern for type-safe, SSR-safe API calls.
	 */

	// ===== IMPORTS =====
	import FormShell from "$lib/components/forms/FormShell.svelte";
	import { log } from "$lib/utils/logger";
	import type {
		WholesalerItemOffering,
		ProductDefinition,
		WholesalerItemOffering_ProductDef_Category,
	} from "$lib/domain/domainTypes";
	import { ApiClient } from "$lib/api/client/ApiClient";
	import { getCategoryApi } from "$lib/api/client/category";

	import "$lib/components/styles/form.css";
	import "$lib/components/styles/grid.css";
	import type {
		SubmittedCallback,
		SubmitErrorCallback,
		CancelledCallback,
		ChangedCallback,
		ValidateResult,
	} from "$lib/components/forms/forms.types";
	import {
		type OfferingDetail_LoadData,
		OfferingDetail_LoadDataSchema,
	} from "$lib/pages/offerings/offeringDetail.types";
	import ValidationWrapper from "$lib/components/validation/ValidationWrapper.svelte";
    import { assertDefined } from "$lib/utils/validation/assertions";

	// ===== INTERNAL TYPES =====

	type ValidationErrors = Record<string, string[]>;

	/**
	 * Component Props Interface
	 *
	 * Handles both CREATE and EDIT modes for offerings:
	 * - CREATE mode: initial is undefined/null, requires categoryId + availableProducts
	 * - EDIT mode: initial contains existing offering data, availableProducts may be null
	 */
	interface OfferingFormProps {
		// Initial loaded data - will be validated against schema
		initialLoadedData: OfferingDetail_LoadData;

		// Available products for CREATE mode dropdown. Is null or undefined in EDIT mode
		availableProducts?: ProductDefinition[] | null | undefined;

		// Form disabled state
		disabled?: boolean;

		// Svelte 5 component-callback props
		onSubmitted?: SubmittedCallback;
		onSubmitError?: SubmitErrorCallback;
		onCancelled?: CancelledCallback;
		onChanged?: ChangedCallback;
	}

	// ===== COMPONENT PROPS =====

	let {
		initialLoadedData,
		availableProducts = [] as ProductDefinition[],
		disabled = false,
		onSubmitted,
		onSubmitError,
		onCancelled,
		onChanged,
	}: OfferingFormProps = $props();

	log.debug(`(OfferingForm) Loaded props:`, {
		initialLoadedData,
		availableProducts,
		disabled,
	});

	/**
	 * The schema validates all keys and also conditional dependencies:
	 * - In CREATE mode (no initial offering), availableProducts are required.
	 * - In EDIT mode (initial offering), availableProducts must be null or undefined or empty.
	 */
	let {
		supplierId,
		categoryId,
		initialValidatedOfferingData,
		errors,
		validatedData,
	} = $derived.by(() => {
		const result =
			OfferingDetail_LoadDataSchema.safeParse(initialLoadedData);
		return {
			validatedData: result.success ? result.data : null,
			errors: result.success ? null : result.error.issues,
			isValid: result.success,
			initialValidatedOfferingData: result.success
				? (result.data?.offering ?? null)
				: null,
			supplierId: result.success
				? (result.data?.supplierId ?? null)
				: null,
			categoryId: result.success
				? (result.data?.categoryId ?? null)
				: null,
		};
	});

	$effect(() => {
		if (errors) {
			log.error(`(OfferingForm) Validation errors:`, errors);
		} else {
			log.debug(
				`(OfferingForm) Validated data OK:`,
				validatedData,
			);
		}
	});

	// ===== DERIVED STATE =====

	const isCreateMode = $derived(!initialValidatedOfferingData);

	// ===== API CLIENT SETUP =====

	const client = new ApiClient(fetch);
	const categoryApi = getCategoryApi(client);

	// ===== VALIDATION LOGIC =====

	/**
	 * Validates the offering form data against business rules.
	 */
	function validateOfferingForSubmit(
		raw: Record<string, any>,
	): ValidateResult {
		assertDefined(raw, "validateOfferingForSubmit");

		const data = raw as WholesalerItemOffering_ProductDef_Category;
		const errors: ValidationErrors = {};

		if (!data.product_def_id) {
			errors.product_def_id = ["A product must be selected."];
		}

		if (data.price != null) {
			if (isNaN(Number(data.price)) || Number(data.price) < 0) {
				errors.price = ["Price must be a valid, non-negative number."];
			}
		}

		if (!data.currency || String(data.currency).trim().length !== 3) {
			errors.currency = [
				"A 3-letter currency code (e.g., USD) is required.",
			];
		}

		return {
			valid: Object.keys(errors).length === 0,
			errors,
		};
	}

	// ===== SUBMISSION LOGIC =====

	/**
	 * Handles form submission, detecting create vs. update mode.
	 */
	async function submitOffering(raw: Record<string, any>) {
		assertDefined(raw, "submitOffering");

		const isUpdateMode = !isCreateMode;

		if (!supplierId || !categoryId) {
			const errorMsg =
				"Cannot submit offering: Missing supplierId or categoryId context. " +
				"This should never happen if the component is used correctly." +
				" => OfferingDetail_LoadDataSchema validation should have caught it. ";
			log.error(`(OfferingForm) ${errorMsg}`, { raw });
			throw new Error(errorMsg);
		}

		// Ensure contextual IDs are included in the data payload.
		const dataToSubmit: Omit<WholesalerItemOffering, "offering_id"> = {
			...(raw as WholesalerItemOffering),
			wholesaler_id: supplierId,
			category_id: categoryId,
		};

		log.info(`(OfferingForm) Submitting to category API...`, {
			isUpdate: isUpdateMode,
			raw,
		});

		try {
			let offering;
			if (isUpdateMode) {
				offering = await categoryApi.updateOffering(
					raw.id!,
					dataToSubmit,
				);
			} else {
				offering = await categoryApi.createOfferingForCategory(
					categoryId,
					dataToSubmit,
				);
			}
			log.info(`(OfferingForm) Submitted successfully to category API`, {
				isUpdate: isUpdateMode,
				raw,
			});
			return offering;
		} catch (e) {
			log.error(`(OfferingForm) Submit failed`, { error: String(e) });
			throw e; // Re-throw for FormShell to handle
		}
	}

	// ===== EVENT HANDLERS (LOGGING & DELEGATION) =====

	function handleSubmitted(p: {
		data: Record<string, any>;
		result: unknown;
	}) {
		assertDefined(p, "handleSubmitted");
		log.info(
			{ component: "OfferingForm", event: "submitted" },
			"FORM_EVENT",
		);
		onSubmitted?.(p);
	}

	function handleSubmitError(p: {
		data: Record<string, any>;
		error: unknown;
	}) {
		assertDefined
		log.warn(`Submit error: ${String(p.error)}`, {
			component: "OfferingForm",
			event: "submitError",
		});
		onSubmitError?.(p);
	}

	function handleCancelled(p: {
		data: Record<string, any>;
		reason?: string;
	}) {
		assertDefined(p, "handleCancelled");
		log.debug(
			{ component: "OfferingForm", event: "cancelled" },
			"FORM_EVENT",
		);
		onCancelled?.(p);
	}

	function handleChanged(p: { data: Record<string, any>; dirty: boolean }) {
		assertDefined(p, "handleChanged");
		log.debug(
			{ component: "OfferingForm", event: "changed", dirty: p.dirty },
			"FORM_EVENT",
		);
		onChanged?.(p);
	}
</script>

<!-- ===== FORM SHELL COMPONENT ===== -->

<ValidationWrapper {errors} data={validatedData}>
	<FormShell
		entity="Offering"
		initial={initialValidatedOfferingData as WholesalerItemOffering_ProductDef_Category}
		validate={validateOfferingForSubmit}
		submitCbk={submitOffering}
		{disabled}
		onSubmitted={handleSubmitted}
		onSubmitError={handleSubmitError}
		onCancelled={handleCancelled}
		onChanged={handleChanged}
	>
		<!-- ===== FORM HEADER SECTION ===== -->
		{#snippet header({ data, dirty })}
			<div class="form-header">
				<div>
					{#if data.offering_id}
						<h3>
							{data.product_def_title || "Unnamed Product"}
						</h3>
					{:else}
						<h3>New Product Offering</h3>
					{/if}
					<span class="field-hint">ID: {data.offering_id}</span>
				</div>
				<div>
					{#if dirty}
						<span class="pc-grid__badge pc-grid__badge--warn"
							>Unsaved changes</span
						>
					{/if}
				</div>
			</div>
		{/snippet}

		<!-- ===== FORM FIELDS SECTION ===== -->
		{#snippet fields({ data, get, getS, set, errors, markTouched })}
			<div class="form-body">
				<div class="form-grid">
					<!-- ===== PRODUCT DEFINITION (Required) ===== -->
					<div class="form-group span-4">
						{#if false}
							If no offering_id => "CREATE" mode => Show available
							product_definitions (== all which are not yet
							assigned to this supplier+category)
						{/if}

						{#if isCreateMode}
							<label for="offering-product">Product *</label>
							<select
								id="offering-product"
								value={getS("product_def_id")}
								class={errors.product_def_id ? "error" : ""}
								onchange={(e) => {
									log.debug(
										`onchange: Product selected: ${
											(
												e.currentTarget as HTMLSelectElement
											).value
										}`,
									);
									set(
										["product_def_id"],
										Number(
											(
												e.currentTarget as HTMLSelectElement
											).value,
										),
									);
								}}
								onblur={() => markTouched("product_def_id")}
								required
								aria-invalid={!!errors.product_def_id}
								aria-describedby={errors.product_def_id
									? "err-product"
									: undefined}
							>
								<option value="" disabled
									>Select a product...</option
								>

								{#each availableProducts ?? [] as product (product.product_def_id)}
									<option value={product.product_def_id}
										>{product.title}</option
									>
								{/each}
							</select>
						{:else}
							<p>
								{getS("product_def_title") ??
									"product_def_title missing"}
							</p>
							<p class="field-hint">
								The product cannot be changed for an existing
								offering.
							</p>
						{/if}
						{#if errors.product_def_id}
							<div id="err-product" class="error-text">
								{errors.product_def_id[0]}
							</div>
						{/if}
					</div>

					<!-- ===== PRICE & CURRENCY SECTION ===== -->
					<div class="form-group span-2">
						<label for="offering-price">Price</label>
						<input
							id="offering-price"
							type="number"
							step="0.01"
							placeholder="e.g., 199.99"
							value={getS("price") ?? ""}
							class={errors.price ? "error" : ""}
							oninput={(e) =>
								set(
									["price"],
									(e.currentTarget as HTMLInputElement)
										.valueAsNumber,
								)}
							onblur={() => markTouched("price")}
							aria-invalid={!!errors.price}
							aria-describedby={errors.price
								? "err-price"
								: undefined}
						/>
						{#if errors.price}
							<div id="err-price" class="error-text">
								{errors.price[0]}
							</div>
						{/if}
					</div>
					<div class="form-group span-2">
						<label for="offering-currency">Currency *</label>
						<input
							id="offering-currency"
							type="text"
							placeholder="e.g., USD"
							maxlength="3"
							value={getS("currency") ?? ""}
							class={errors.currency ? "error" : ""}
							oninput={(e) =>
								set(
									["currency"],
									(
										e.currentTarget as HTMLInputElement
									).value.toUpperCase(),
								)}
							onblur={() => markTouched("currency")}
							required
							aria-invalid={!!errors.currency}
							aria-describedby={errors.currency
								? "err-currency"
								: undefined}
						/>
						{#if errors.currency}
							<div id="err-currency" class="error-text">
								{errors.currency[0]}
							</div>
						{/if}
					</div>

					<!-- ===== SIZE & DIMENSIONS SECTION ===== -->
					<div class="form-group span-2">
						<label for="offering-size">Size</label>
						<input
							id="offering-size"
							type="text"
							placeholder="e.g., 15 inch, Large"
							value={get(["size"]) ?? ""}
							oninput={(e) =>
								set(
									["size"],
									(e.currentTarget as HTMLInputElement).value,
								)}
							onblur={() => markTouched("size")}
						/>
					</div>
					<div class="form-group span-2">
						<label for="offering-dimensions">Dimensions</label>
						<input
							id="offering-dimensions"
							type="text"
							placeholder="e.g., 10x20x5 cm"
							value={getS("dimensions") ?? ""}
							oninput={(e) =>
								set(
									["dimensions"],
									(e.currentTarget as HTMLInputElement).value,
								)}
							onblur={() => markTouched("dimensions")}
						/>
					</div>

					<!-- ===== COMMENT SECTION ===== -->
					<div class="form-group span-4">
						<label for="offering-comment">Comment</label>
						<textarea
							id="offering-comment"
							rows="3"
							placeholder="Internal notes about this specific offering..."
							oninput={(e) =>
								set(
									["comment"],
									(e.currentTarget as HTMLTextAreaElement)
										.value,
								)}>{getS("comment") ?? ""}</textarea
						>
					</div>
				</div>
			</div>
		{/snippet}

		<!-- ===== FORM ACTIONS SECTION ===== -->
		{#snippet actions({ submitAction, cancel, submitting, dirty })}
			<div class="form-actions">
				<button
					class="secondary-button"
					type="button"
					onclick={cancel}
					disabled={submitting}
				>
					Cancel
				</button>
				<button
					class="primary-button"
					type="button"
					onclick={() => submitAction()}
					disabled={!dirty || submitting}
					aria-busy={submitting}
				>
					{#if submitting}
						<span class="pc-grid__spinner" aria-hidden="true"
						></span>
					{/if}
					Save Offering
				</button>
			</div>
		{/snippet}
	</FormShell>
</ValidationWrapper>
