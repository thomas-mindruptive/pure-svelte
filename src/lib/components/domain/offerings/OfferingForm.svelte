<!-- src/lib/components/domain/offerings/OfferingForm.svelte -->
<script lang="ts">
	/**
	 * OfferingForm Component (Svelte 5 + Runes)
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
	} from "$lib/components/domain/offerings/offeringDetail.types";
	import ValidationWrapper from "$lib/components/validation/ValidationWrapper.svelte";
	import { assertDefined } from "$lib/utils/validation/assertions";

	// ===== INTERNAL TYPES =====

	type ValidationErrors = Record<string, string[]>;

	interface OfferingFormProps {
		initialLoadedData: OfferingDetail_LoadData;
		availableProducts?: ProductDefinition[] | null | undefined;
		disabled?: boolean;
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

	// ===== LOAD DATA ASYNC =====

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
			log.debug(`(OfferingForm) Validated data OK:`, validatedData);
		}
	});

	// ===== STATE =====

	const isCreateMode = $derived(!initialValidatedOfferingData);
	let formShell: InstanceType<
		typeof FormShell<WholesalerItemOffering_ProductDef_Category>
	>;
	
	// ===== API =====

	const client = new ApiClient(fetch);
	const categoryApi = getCategoryApi(client);

	// Set the default product definition in create mode.
	$effect(() => {
		if (isCreateMode && availableProducts && availableProducts.length > 0) {
			const firstProduct = availableProducts[0];
			if (firstProduct && formShell) {
				log.debug(
					`(OfferingForm) Initializing product_def_id to first available product: ${firstProduct.product_def_id}`,
				);
				formShell.set(["product_def_id"], firstProduct.product_def_id);
			}
		}
	});

	// ===== VALIDATION LOGIC =====

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

	async function submitOffering(formStateCloneOfExistingOffering: Record<string, any>) {
		assertDefined(formStateCloneOfExistingOffering, "submitOffering");
		const isUpdateMode = !isCreateMode;
		if (!supplierId || !categoryId) {
			const errorMsg =
				"Cannot submit offering: Missing supplierId or categoryId context. This should never happen if the component is used correctly. => OfferingDetail_LoadDataSchema validation should have caught it.";
			log.error(`(OfferingForm) ${errorMsg}`, { raw: formStateCloneOfExistingOffering });
			throw new Error(errorMsg);
		}
		const dataToSubmit: Omit<WholesalerItemOffering, "offering_id"> = {
			...(formStateCloneOfExistingOffering as WholesalerItemOffering),
			wholesaler_id: supplierId,
			category_id: categoryId,
		};
		log.warn(`(OfferingForm) Submitting to API...`, {
			isUpdate: isUpdateMode,
			raw: formStateCloneOfExistingOffering,
		});
		try {
			let offering;
			if (isUpdateMode) {
				// Assert that the id exists in update mode
				const id = (formStateCloneOfExistingOffering as WholesalerItemOffering).offering_id;
				assertDefined(id, "offering_id is required for update");
				offering = await categoryApi.updateOffering(id, dataToSubmit);
			} else {
				offering = await categoryApi.createOfferingForCategory(
					categoryId,
					dataToSubmit,
				);
			}
			log.info(`(OfferingForm) Submitted successfully to category API`, {
				isUpdate: isUpdateMode,
				raw: formStateCloneOfExistingOffering,
				offering
			});
			return offering;
		} catch (e) {
			log.error(`(OfferingForm) Submit failed`, { error: String(e) });
			throw e;
		}
	}

	// ===== EVENT HANDLERS =====
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
		assertDefined(p, "handleSubmitError");
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
		//assertDefined(p, "handleChanged");
		log.info("handleChanged", {
			component: "OfferingForm",
			event: "changed",
			dirty: p.dirty,
		});
		onChanged?.(p);
	}
</script>

<ValidationWrapper {errors} >
	<FormShell
		bind:this={formShell}
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
		{#snippet header({ data, dirty })}
			<div class="form-header">
				<div>
					{#if data.offering_id}
						<h3>{data.product_def_title || "Unnamed Product"}</h3>
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

		{#snippet fields({ data, getS, set, errors, markTouched })}
			<div class="form-body">
				<div class="form-grid">
					<div class="form-group span-4">
						{#if isCreateMode}
							<label for="offering-product">Product *</label>
							<select
								id="offering-product"
								value={getS("product_def_id")}
								class:error={errors.product_def_id}
								onchange={(e) => {
									log.debug(
										`onchange: Product selected: ${(e.currentTarget as HTMLSelectElement).value}`,
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

					<div class="form-group span-2">
						<label for="offering-price">Price*</label>
						<input
							id="offering-price"
							type="number"
							step="0.01"
							min="0"
							required
							placeholder="e.g., 199.99"
							value={getS("price") ?? ""}
							class:error={errors.price}
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
						<label for="offering-currency">Currency</label>
						<input
							id="offering-currency"
							type="text"
							placeholder="e.g., USD"
							maxlength="3"
							minlength="3"
							pattern={"[A-Za-z]{3}"}
							title="Enter a 3-letter currency code"
							value={getS("currency") ?? ""}
							class:error={errors.currency}
							oninput={(e) => {
								const value =
									e.currentTarget.value.toUpperCase();
								set(["currency"], value);
							}}
							onblur={() => markTouched("currency")}
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

					<div class="form-group span-2">
						<label for="offering-size">Size</label>
						<!-- KORREKTUR 2: `get` wurde zu `getS` geändert -->
						<input
							id="offering-size"
							type="text"
							placeholder="e.g., 15 inch, Large"
							value={getS("size") ?? ""}
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

		{#snippet actions({ submitAction, cancel, submitting, dirty })}
			{assertDefined(
				submitAction,
				"OfferingForm, actions snippet, submitAction",
			)}
			{assertDefined(cancel, "OfferingForm, actions snippet, cancel")}
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
					type="submit"
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
