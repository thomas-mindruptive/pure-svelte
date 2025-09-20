<!-- src/lib/components/domain/offerings/OfferingForm.svelte -->
<script lang="ts">
  /**
   * OfferingForm Component (Svelte 5 + Runes)
   */

  // ===== IMPORTS =====
  import FormShell from "$lib/components/forms/FormShell.svelte";
  import { log } from "$lib/utils/logger";
  import type { WholesalerItemOffering, WholesalerItemOffering_ProductDef_Category_Supplier } from "$lib/domain/domainTypes";
  import { ApiClient } from "$lib/api/client/ApiClient";
  import "$lib/components/styles/form.css";
  import "$lib/components/styles/grid.css";
  import type {
    SubmittedCallback,
    SubmitErrorCallback,
    CancelledCallback,
    ChangedCallback,
    ValidateResult,
  } from "$lib/components/forms/forms.types";
  import { type OfferingDetail_LoadData, OfferingDetail_LoadDataSchema } from "$lib/components/domain/offerings/offeringDetail.types";
  import ValidationWrapper from "$lib/components/validation/ValidationWrapper.svelte";
  import { assertDefined } from "$lib/utils/validation/assertions";
  import { getOfferingApi } from "$lib/api/client/offering";

  // ===== INTERNAL TYPES =====

  type ValidationErrors = Record<string, string[]>;

  // ===== COMPONENT PROPS =====

  interface OfferingFormProps {
    // initialLoadData.isCreateMode/isSuppliersRoute/isCategoriesRoute must be set correctly!
    initialLoadedData: OfferingDetail_LoadData;
    disabled?: boolean;
    onSubmitted?: SubmittedCallback;
    onSubmitError?: SubmitErrorCallback;
    onCancelled?: CancelledCallback;
    onChanged?: ChangedCallback;
  }

  const { initialLoadedData, disabled = false, onSubmitted, onSubmitError, onCancelled, onChanged }: OfferingFormProps = $props();

  log.debug(`(OfferingForm) Loaded props:`, {
    initialLoadedData,
    disabled,
  });

  // ===== LOAD DATA ASYNC =====

  let { initialValidatedOfferingData, errors, validatedData, availableProducts, availableSuppliers } = $derived.by(() => {
    const result = OfferingDetail_LoadDataSchema.safeParse(initialLoadedData);
    if (!result.success) {
      return {
        validatedData: null,
        errors: result.error.issues,
        isValid: false,
        initialValidatedOfferingData: null,
        supplierId: null,
        categoryId: null,
        productDefId: null,
        availableProducts: null,
        availableSuppliers: null,
      };
    }

    const data = result.data;
    let finalInitialData = data.offering ?? null;
    let finalErrors: any[] = [];

    if (data.isCreateMode) {
      if (finalInitialData) {
        finalErrors.push({
          message: "In create mode, initialValidatedOfferingData should be null",
          code: "custom",
          path: ["initialValidatedOfferingData"],
        });
      } else {
        // ⚠️⚠️⚠️ NOTE: This initialisation is key. Otherwise form validation and submit fails!
        finalInitialData = {
          category_id: data.categoryId,
          product_def_id: data.productDefId,
          wholesaler_id: data.supplierId,
        } as WholesalerItemOffering_ProductDef_Category_Supplier;
      }
    }

    return {
      validatedData: data,
      errors: finalErrors.length > 0 ? finalErrors : null,
      isValid: true,
      initialValidatedOfferingData: finalInitialData,
      supplierId: data.supplierId ?? null,
      categoryId: data.categoryId ?? null,
      productDefId: data.productDefId ?? null,
      availableProducts: data.availableProducts ?? null,
      availableSuppliers: data.availableSuppliers ?? null,
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

  // NOTE: This flags MUST be derived from the original data, because they are set independently of the other data.
  const isCreateMode = $derived(initialLoadedData.isCreateMode);
  const isSuppliersRoute = $derived(initialLoadedData.isSuppliersRoute);
  const isCategoriesRoute = $derived(initialLoadedData.isCategoriesRoute);
  let formShell: InstanceType<typeof FormShell<WholesalerItemOffering_ProductDef_Category_Supplier>>;

  // ===== API =====

  const client = new ApiClient(fetch);
  const offeringApi = getOfferingApi(client);

  // Set the default product definition in create mode.
  $effect(() => {
    if (isCreateMode && availableProducts && availableProducts.length > 0) {
      // We are on route "/suppliers/1/categories/3/offerings/..."
      if (isSuppliersRoute) {
        const firstProduct = availableProducts[0];
        if (firstProduct && formShell) {
          log.debug(`(OfferingForm) Initializing product_def_id to first available product: ${firstProduct.product_def_id}`);
          formShell.set(["product_def_id"], firstProduct.product_def_id);
        }
      }

      // We are on route "/categories/1/productdefinitions/5/offerings/..."
      if (isCategoriesRoute) {
        const firstSupplier = availableSuppliers?.[0];
        if (firstSupplier && formShell) {
          log.debug(`(OfferingForm) Initializing wholesaler_id to first available supplier: ${firstSupplier.wholesaler_id}`);
          formShell.set(["wholesaler_id"], firstSupplier.wholesaler_id);
        }
      }
    }
  });

  // ===== FORM VALIDATION LOGIC =====

  /**
   * Performs custom business rule validation.
   * This is a pure function: it receives data and returns a validation result
   * without any DOM side effects. It handles rules that HTML cannot.
   * @param data The current form data.
   * @returns A ValidateResult object containing any errors for custom rules.
   */
  function validateOfferingForSubmit(raw: Record<string, any>): ValidateResult {
    log.debug(`Validating offering form data`, raw)
    assertDefined(raw, "validateOfferingForSubmit");
    const data = raw as WholesalerItemOffering_ProductDef_Category_Supplier;
    const errors: ValidationErrors = {};

    // Sample for a complex business rule involving multiple fields ---
    // Example: Prices in Japanese Yen (JPY) cannot have decimals.
    const isJpy = data.currency?.toUpperCase() === "JPY";
    const hasDecimals = data.price != null && data.price % 1 !== 0;
    if (isJpy && hasDecimals) {
      // Return an error for the 'price' field. FormShell will handle applying it.
      errors.price = ["Prices in JPY cannot have decimals."];
      log.debug("(OfferingForm) Custom validation failed: JPY price has decimals.");
    }

    // Validate the base ids. They mus be there even if there are no visible fields.
    if (!data.wholesaler_id) {
      errors.wholesaler_id = ["OfferingForm.validateOfferingForSubmit: A supplier must be selected."];
    }
    if (!data.product_def_id) {
      errors.product_def_id = ["OfferingForm.validateOfferingForSubmit: A product must be selected."];
    }
    if (!data.category_id) {
      errors.category_id = ["OfferingForm.validateOfferingForSubmit: A category must be defined."];
    }
    if (data.price != null) {
      if (isNaN(Number(data.price)) || Number(data.price) < 0) {
        errors.price = ["Price must be a valid, non-negative number."];
      }
    }
    if (!data.currency || String(data.currency).trim().length !== 3) {
      errors.currency = ["A 3-letter currency code (e.g., USD) is required."];
    }
    return {
      valid: Object.keys(errors).length === 0,
      errors,
    };
  }

  // ===== SUBMISSION LOGIC =====

  /**
   * Handles the submission logic for both creating a new offering and updating an existing one.
   * It relies on the 'isCreateMode' flag to decide which API endpoint to call.
   * The formStateClone is trusted to contain all necessary IDs for the operation.
   * @param formStateClone A deep clone of the current form state.
   * @returns A promise that resolves to the created or updated offering object.
   */
  async function submitOffering(formStateClone: Record<string, any>): Promise<WholesalerItemOffering> {
    // We trust that the formStateClone is a valid object, as FormShell creates it.
    assertDefined(formStateClone, "submitOffering: formStateClone cannot be null.");

    // Cast the generic record to our specific type for type safety.
    const dataToSubmit = formStateClone as WholesalerItemOffering;

    if (isCreateMode) {
      // --- CREATE MODE ---
      // In create mode, the object in formStateClone was built by our $derived.by logic.
      // It already contains the correct context IDs (supplier_id, category_id, product_def_id).
      log.info(`(OfferingForm) Submitting CREATE to API...`, { dataToSubmit });
      assertDefined(
        dataToSubmit,
        `Must be defined: "wholesaler_id", "category_id", "product_def_id"`,
        ["wholesaler_id"],
        ["category_id"],
        ["product_def_id"],
      );
      return await offeringApi.createOffering(dataToSubmit);
    } else {
      // --- UPDATE MODE ---
      // In update mode, the formStateClone contains the full offering object, including its real ID.
      log.info("(OfferingForm) Submitting in UPDATE mode...");

      // Use assertDefined to ensure the offering_id exists and is a valid number for the update operation.
      // This is a crucial runtime check.
      assertDefined(dataToSubmit, "submitOffering: offering_id must be defined for an update.", ["offering_id"]);

      // Safety check against placeholder ID, even though it shouldn't happen in update mode.
      if (dataToSubmit.offering_id === 0) {
        throw new Error("Cannot update offering with a placeholder ID of 0.");
      }

      const updateData = dataToSubmit as Partial<WholesalerItemOffering>;

      log.warn(`(OfferingForm) Submitting UPDATE to API...`, { id: dataToSubmit.offering_id, updateData });
      return await offeringApi.updateOffering(dataToSubmit.offering_id, updateData);
    }
  }

  // ===== EVENT HANDLERS =====

  function handleSubmitted(p: { data: Record<string, any>; result: unknown }) {
    assertDefined(p, "handleSubmitted");
    log.info({ component: "OfferingForm", event: "submitted" }, "FORM_EVENT");
    onSubmitted?.(p);
  }
  function handleSubmitError(p: { data: Record<string, any>; error: unknown }) {
    assertDefined(p, "handleSubmitError");
    log.warn(`Submit error: ${String(p.error)}`, {
      component: "OfferingForm",
      event: "submitError",
    });
    onSubmitError?.(p);
  }
  function handleCancelled(p: { data: Record<string, any>; reason?: string }) {
    assertDefined(p, "handleCancelled");
    log.debug({ component: "OfferingForm", event: "cancelled" }, "FORM_EVENT");
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

<ValidationWrapper
  {errors}
  renderChildrenInCaseOfErrors={true}
>
  <FormShell
    bind:this={formShell}
    autoValidate="blur"
    entity="Offering"
    initial={initialValidatedOfferingData as WholesalerItemOffering_ProductDef_Category_Supplier}
    validate={validateOfferingForSubmit}
    submitCbk={submitOffering}
    {disabled}
    onSubmitted={handleSubmitted}
    onSubmitError={handleSubmitError}
    onCancelled={handleCancelled}
    onChanged={handleChanged}
  >
    <!--- HEADER --------------------------------------------------------------------------------->
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
            <span class="pc-grid__badge pc-grid__badge--warn">Unsaved changes</span>
          {/if}
        </div>
      </div>
    {/snippet}

    <!--- FIELDS --------------------------------------------------------------------------------->
    {#snippet fields({ getS, set, markTouched })}
      <div class="form-body">
        <div class="form-grid">
          <!-- "product defs" combo -------------------------------------------------------------->
          <div class="form-group span-2">
            <!--- Create mode and suppliers route => render "productdefs" combo --->
            {#if isCreateMode}
              {#if isSuppliersRoute}
                <label for="offering-product">####Product *</label>
                <select
                  id="offering-product"
                  name="product_def_id"
                  required
                  value={getS("product_def_id")}
                  onchange={(e) => {
                    log.debug(`onchange: Product selected: ${(e.currentTarget as HTMLSelectElement).value}`);
                    set(["product_def_id"], Number((e.currentTarget as HTMLSelectElement).value));
                  }}
                  onblur={() => markTouched("product_def_id")}
                >
                  <option
                    value=""
                    disabled
                  >
                    Select a product...
                  </option>
                  {#each availableProducts ?? [] as product (product.product_def_id)}
                    <option value={product.product_def_id}>{product.title}</option>
                  {/each}
                </select>
              {/if}
            {:else}
              <!--- Not create mode => Render static text for prodcuct def --->
              <p>
                {getS("product_def_title") ?? "product_def_title missing"}
              </p>
              <p class="field-hint">The product cannot be changed for an existing offering.</p>
            {/if}
          </div>

          <!-- "suppliers" combo ----------------------------------------------------------------->
          <div class="form-group span-2">
            <!--- Create mode and categories route => render "suppliers" combo --->
            {#if isCreateMode}
              {#if isCategoriesRoute}
                <label for="offering-supplier">+++Supplier *</label>
                <select
                  id="offering-supplier"
                  name="wholesaler_id"
                  required
                  value={getS("wholesaler_id")}
                  onchange={(e) => {
                    log.debug(`onchange: Supplier selected: ${(e.currentTarget as HTMLSelectElement).value}`);
                    set(["wholesaler_id"], Number((e.currentTarget as HTMLSelectElement).value));
                  }}
                  onblur={() => markTouched("wholesaler_id")}
                >
                  <option
                    value=""
                    disabled
                  >
                    Select a product...
                  </option>
                  {#each availableSuppliers ?? [] as supplier (supplier.wholesaler_id)}
                    <option value={supplier.wholesaler_id}>{supplier.name}</option>
                  {/each}
                </select>
              {/if}
            {:else}
              <!--- Not create mode => Render static text for supplier --->
              <p>
                {getS("wholesaler_name") ?? "supplier_name missing"}
              </p>
              <p class="field-hint">The supplier cannot be changed for an existing offering.</p>
            {/if}
          </div>

          <!-- price ----------------------------------------------------------------------------->
          <div class="form-group span-2">
            <label for="offering-price">Price*</label>
            <input
              id="offering-price"
              name="price"
              type="number"
              step="0.01"
              min="0"
              required
              placeholder="e.g., 199.99"
              value={getS("price") ?? ""}
              oninput={(e) => set(["price"], (e.currentTarget as HTMLInputElement).valueAsNumber)}
              onblur={() => markTouched("price")}
            />
          </div>

          <!-- curreny --------------------------------------------------------------------------->
          <div class="form-group span-2">
            <label for="offering-currency">Currency</label>
            <input
              id="offering-currency"
              name="currency"
              type="text"
              placeholder="e.g., USD"
              maxlength="3"
              minlength="3"
              pattern={"[A-Za-z]{3}"}
              title="Enter a 3-letter currency code"
              value={getS("currency") ?? ""}
              oninput={(e) => {
                const value = e.currentTarget.value.toUpperCase();
                set(["currency"], value);
              }}
              onblur={() => markTouched("currency")}
            />
          </div>

          <!-- size ------------------------------------------------------------------------------>
          <div class="form-group span-2">
            <label for="offering-size">Size</label>
            <input
              id="offering-size"
              name="size"
              type="text"
              placeholder="e.g., 15 inch, Large"
              value={getS("size") ?? ""}
              oninput={(e) => set(["size"], (e.currentTarget as HTMLInputElement).value)}
              onblur={() => markTouched("size")}
            />
          </div>

          <!-- dimensions ------------------------------------------------------------------------>
          <div class="form-group span-2">
            <label for="offering-dimensions">Dimensions</label>
            <input
              id="offering-dimensions"
              name="dimensions"
              type="text"
              placeholder="e.g., 10x20x5 cm"
              value={getS("dimensions") ?? ""}
              oninput={(e) => set(["dimensions"], (e.currentTarget as HTMLInputElement).value)}
              onblur={() => markTouched("dimensions")}
            />
          </div>

          <!-- comment --------------------------------------------------------------------------->
          <!-- NOTE: the closing "</textarea>" must follow "{getS("comment") ?? ""}" immediately-->
          <div class="form-group span-4">
            <label for="offering-comment">Comment</label>
            <textarea
              id="offering-comment"
              name="comment"
              rows="3"
              placeholder="Internal notes about this specific offering..."
              oninput={(e) => set(["comment"], (e.currentTarget as HTMLTextAreaElement).value)}
              onblur={() => markTouched("comment")}
            >{getS("comment") ?? ""}</textarea>
          </div>
        </div>
      </div>
    {/snippet}

    <!-- ACTIONS --------------------------------------------------------------------------------->
    {#snippet actions({ submitAction, cancel, submitting, dirty })}
      {assertDefined(submitAction, "OfferingForm, actions snippet, submitAction")}
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
            <span
              class="pc-grid__spinner"
              aria-hidden="true"
            ></span>
          {/if}
          Save Offering
        </button>
      </div>
    {/snippet}
  </FormShell>
</ValidationWrapper>