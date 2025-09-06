<script lang="ts">
	/**
	 * SupplierForm Component (Svelte 5 + Runes)
	 */

	import FormShell from "$lib/components/forms/FormShell.svelte";
	import { log } from "$lib/utils/logger";
	import { WholesalerSchema, type Wholesaler } from "$lib/domain/domainTypes";
	import "$lib/components/styles/form.css";
	import "$lib/components/styles/grid.css";
	import { ApiClient } from "$lib/api/client/ApiClient";
	import { getSupplierApi } from "$lib/api/client/supplier";
	import type {
		SubmittedCallback,
		SubmitErrorCallback,
		CancelledCallback,
		ChangedCallback,
		ValidateResult,
	} from "$lib/components/forms/forms.types";
	import ValidationWrapper from "$lib/components/validation/ValidationWrapper.svelte";
	import { assertDefined } from "$lib/utils/validation/assertions";

	type ValidationErrors = Record<string, string[]>;

	// ===== PROPS =====

	const {
		initial,
		disabled = false,
		onSubmitted,
		onSubmitError,
		onCancelled,
		onChanged,
	} = $props<{
		initial?: Wholesaler | undefined | null;
		disabled?: boolean;
		onSubmitted?: SubmittedCallback;
		onSubmitError?: SubmitErrorCallback;
		onCancelled?: CancelledCallback;
		onChanged?: ChangedCallback;
	}>();

	type SupplierFormData = Partial<Wholesaler>;

		
	// ===== API =====

	const client = new ApiClient(fetch);
	const supplierApi = getSupplierApi(client);

	// ===== VALIDATE TO SCHEMA =====

	let { initialValidateSupplierData, errors, validatedData } = $derived.by(
		() => {
			// NOTE: our initial data is ONLY a wholesaler, not the complete SupplierDetail_LoadDataSchema.
			const result = WholesalerSchema.nullable().safeParse(initial);
			if (result.error) {
				log.error(`Validation of supplier data to WholesalerSchema failed.`, result.error);
			}
			return {
				validatedData: result.success ? result.data : null,
				errors: result.success ? null : result.error.issues,
				isValid: result.success,
				initialValidateSupplierData: result.success
					? (result.data ?? null)
					: null,
			};
		},
	);

	// ===== STATE =====

	const isCreateMode = $derived(!initialValidateSupplierData);

	// ===== VALIDATE =====

	// Diese Funktion bleibt für Geschäftslogik, die HTML nicht kann.
	function validateWholesaler(raw: Record<string, any>): ValidateResult {
		const data = raw as SupplierFormData;
		const errors: ValidationErrors = {};

		// Beispiel für eine Regel, die HTML nicht kann:
		if (data.name?.toLowerCase() === "test") {
			errors.name = ['"Test" is not a valid supplier name.'];
		}

		// Die 'required' Checks sind jetzt redundant, aber schaden nicht als zweite Verteidigungslinie.
		if (!data.name?.trim()) {
			errors.name = ["Name is required"];
		}
		if (!data.country?.trim()) {
			errors.country = ["Country is required"];
		}
		if (!data.status?.trim()) {
			errors.status = ["Status is required"];
		}

		return {
			valid: Object.keys(errors).length === 0,
			errors,
		};
	}

	// ===== FORM CALLBACKS =====

	async function submitWholesaler(raw: Record<string, any>) {
		log.debug(`Submitting wholesaler`, raw);
		const data = raw as SupplierFormData;
		const isUpdate = !isCreateMode;
		try {
			if (isUpdate) {
				const { wholesaler_id, created_at, ...updateData } = data;
				assertDefined(
					wholesaler_id,
					"wholesaler_id is required for update",
				);
				return await supplierApi.updateSupplier(
					wholesaler_id,
					updateData,
				);
			} else {
				return await supplierApi.createSupplier(data);
			}
		} catch (e) {
			log.error(
				{ component: "SupplierForm", error: String(e) },
				"SUBMIT_FAILED",
			);
			throw e;
		}
	}

	function handleSubmitted(p: {
		data: Record<string, any>;
		result: unknown;
	}) {
		onSubmitted?.(p);
	}

	function handleSubmitError(p: {
		data: Record<string, any>;
		error: unknown;
	}) {
		onSubmitError?.(p);
	}

	function handleCancelled(p: {
		data: Record<string, any>;
		reason?: string;
	}) {
		onCancelled?.(p);
	}

	function handleChanged(p: { data: Record<string, any>; dirty: boolean }) {
		onChanged?.(p);
	}
</script>

<ValidationWrapper {errors} data={validatedData}>
	<h1>Supplier Form #################</h1>
	<FormShell
		entity="Wholesaler"
		initial={initial as SupplierFormData}
		validate={validateWholesaler}
		submitCbk={submitWholesaler}
		{disabled}
		onSubmitted={handleSubmitted}
		onSubmitError={handleSubmitError}
		onCancelled={handleCancelled}
		onChanged={handleChanged}
	>
		{#snippet header({ data, dirty })}
			{@const wholesaler = data as SupplierFormData}
			<div class="form-header">
				<div>
					{#if wholesaler?.wholesaler_id}
						<h3>{wholesaler.name || "Unnamed Supplier"}</h3>
						<span class="field-hint"
							>ID: {wholesaler.wholesaler_id}</span
						>
					{:else}
						<h3>{wholesaler.name || "New Supplier"}</h3>
					{/if}
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

		{#snippet fields({ getS, set, errors, markTouched })}
			<div class="form-body">
				<div class="form-grid">
					<div class="form-group span-2">
						<label for="wh-name">Supplier Name *</label>
						<input
							id="wh-name"
							type="text"
							value={getS("name") ?? ""}
							class:error={errors.name}
							placeholder="Enter supplier name"
							oninput={(e) =>
								set(
									["name"],
									(e.currentTarget as HTMLInputElement).value,
								)}
							onblur={() => markTouched("name")}
							required
						/>
						{#if errors.name}
							<div class="error-text">{errors.name[0]}</div>
						{/if}
					</div>
					<div class="form-group">
						<label for="wh-region">Region</label>
						<input
							id="wh-region"
							type="text"
							value={getS("region") ?? ""}
							class:error={errors.region}
							placeholder="e.g. Europe, Asia"
							oninput={(e) =>
								set(
									["region"],
									(e.currentTarget as HTMLInputElement).value,
								)}
							onblur={() => markTouched("region")}
						/>
						{#if errors.region}
							<div class="error-text">{errors.region[0]}</div>
						{/if}
					</div>
					<div class="form-group">
						<label for="wh-status">Status *</label>
						<select
							id="wh-status"
							value={getS("status") ?? ""}
							class:error={errors.status}
							onchange={(e) =>
								set(
									["status"],
									(e.currentTarget as HTMLSelectElement)
										.value,
								)}
							onblur={() => markTouched("status")}
							required
						>
							<option value="">Select status…</option>
							<option value="active">Active</option>
							<option value="inactive">Inactive</option>
							<option value="new">New</option>
						</select>
						{#if errors.status}
							<div class="error-text">{errors.status[0]}</div>
						{/if}
					</div>
					<div class="form-group">
						<label for="wh-country">Country *</label>
						<select
							id="wh-country"
							value={getS("country") ?? ""}
							class:error={errors.country}
							onchange={(e) =>
								set(
									["country"],
									(e.currentTarget as HTMLSelectElement)
										.value,
								)}
							onblur={() => markTouched("country")}
							required
						>
							<option value="">Select country…</option>
							<option value="AT">Austria</option>
							<option value="DE">Germany</option>
							<option value="CH">Switzerland</option>
							<option value="US">United States</option>
							<option value="CN">China</option>
							<option value="JP">Japan</option>
						</select>
						{#if errors.country}
							<div class="error-text">{errors.country[0]}</div>
						{/if}
					</div>
					<div class="form-group">
						<label for="wh-dropship">
							<input
								id="wh-dropship"
								type="checkbox"
								checked={!!getS("dropship")}
								onchange={(e) =>
									set(
										["dropship"],
										(e.currentTarget as HTMLInputElement)
											.checked,
									)}
							/>
							Offers Dropshipping
						</label>
					</div>
				</div>
				<div class="form-grid">
					<div class="form-group span-2">
						<label for="wh-email">Email Address</label>
						<input
							id="wh-email"
							type="email"
							value={getS("email") ?? ""}
							class:error={errors.email}
							placeholder="contact@supplier.com"
							oninput={(e) =>
								set(
									["email"],
									(e.currentTarget as HTMLInputElement).value,
								)}
							onblur={() => markTouched("email")}
						/>
						{#if errors.email}
							<div class="error-text">{errors.email[0]}</div>
						{/if}
					</div>
					<div class="form-group span-2">
						<label for="wh-website">Website</label>
						<input
							id="wh-website"
							type="url"
							value={getS("website") ?? ""}
							placeholder="https://www.supplier.com"
							oninput={(e) =>
								set(
									["website"],
									(e.currentTarget as HTMLInputElement).value,
								)}
							onblur={() => markTouched("website")}
						/>
					</div>
				</div>
				<div class="form-grid">
					<div class="form-group span-4">
						<label for="wh-notes">Business Notes</label>
						<textarea
							id="wh-notes"
							rows="4"
							placeholder="Additional notes..."
							value={getS("b2b_notes") ?? ""}
							oninput={(e) =>
								set(
									["b2b_notes"],
									(e.currentTarget as HTMLTextAreaElement)
										.value,
								)}
						></textarea>
						<div class="char-count">
							{(getS("b2b_notes") ?? "").length}
						</div>
					</div>
				</div>
			</div>
		{/snippet}

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
				<!-- KORREKTUR: type="submit" und kein onclick -->
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
					Save Supplier
				</button>
			</div>
		{/snippet}
	</FormShell>
</ValidationWrapper>
