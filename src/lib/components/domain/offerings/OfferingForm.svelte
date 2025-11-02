<!-- src/lib/components/domain/offerings/OfferingForm.svelte -->
<script lang="ts">
  /**
   * OfferingForm Component (Svelte 5 + Runes)
   */

  // ===== IMPORTS =====
  import { ApiClient } from "$lib/api/client/ApiClient";
  import { getOfferingApi } from "$lib/api/client/offering";
  import { type OfferingDetail_LoadData, OfferingDetail_LoadDataSchema } from "$lib/components/domain/offerings/offeringDetail.types";
  import Field from "$lib/components/forms/Field.svelte";
  import FormComboBox2 from "$lib/components/forms/FormComboBox2.svelte";
  import type {
    CancelledCallback,
    ChangedCallback,
    Errors,
    SubmitErrorCallback,
    SubmittedCallback,
    ValidateResult,
  } from "$lib/components/forms/forms.types";
  import FormShell, { type FieldsSnippetProps } from "$lib/components/forms/FormShell.svelte";
  import "$lib/components/styles/form.css";
  import "$lib/components/styles/grid.css";
  import ValidationWrapper from "$lib/components/validation/ValidationWrapper.svelte";
  import type { WholesalerItemOffering, Wio_PDef_Cat_Supp_Nested_WithLinks } from "$lib/domain/domainTypes";
  import { assertDefined } from "$lib/utils/assertions";
  import { log } from "$lib/utils/logger";

  // ===== INTERNAL TYPES =====

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

  let {
    initialValidatedOfferingData,
    errors,
    validatedData,
    availableProducts,
    availableSuppliers,
    materials,
    forms,
    constructionTypes,
    surfaceFinishes,
  } = $derived.by(() => {
    const result = OfferingDetail_LoadDataSchema.safeParse(initialLoadedData);
    if (!result.success) {
      return {
        errors: result.error.issues,
        isValid: false,
        materials: [],
        forms: [],
        constructionTypes: [],
        surfaceFinishes: [],
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
        // Create mode: NESTED structure with empty nested objects
        finalInitialData = {
          category_id: data.categoryId,
          product_def_id: data.productDefId,
          wholesaler_id: data.supplierId,
          ...data.offering
        } as Wio_PDef_Cat_Supp_Nested_WithLinks;
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
      materials: data.materials ?? [],
      forms: data.forms ?? [],
      constructionTypes: data.constructionTypes ?? [],
      surfaceFinishes: data.surfaceFinishes ?? [],
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
  let formShell: InstanceType<typeof FormShell<Wio_PDef_Cat_Supp_Nested_WithLinks>>;

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
  function validateOfferingForSubmit(raw: Record<string, any>): ValidateResult<Wio_PDef_Cat_Supp_Nested_WithLinks> {
    log.debug(`Validating offering form data`, raw);
    assertDefined(raw, "validateOfferingForSubmit");
    const data = raw as Wio_PDef_Cat_Supp_Nested_WithLinks;
    const errors: Errors<Wio_PDef_Cat_Supp_Nested_WithLinks> = {};

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

<!-- SNIPPETS ------------------------------------------------------------------------------------>

<!--
  -- Render material combo using Combobox2 component
  -->
{#snippet materialCombo2(fieldProps: FieldsSnippetProps<Wio_PDef_Cat_Supp_Nested_WithLinks>)}
  <FormComboBox2
    {fieldProps}
    items={materials}
    path={["material_id"]}
    labelPath={["name"]}
    valuePath={["material_id"]}
    placeholder="Search materials..."
    label="Material"
    onChange={(value, material) => {
      log.debug("Material selected via Combobox2:", { value, material_name: material?.name });
    }}
  />
{/snippet}

<!--
  -- Render form combo using Combobox2 component
  -->
{#snippet formCombo2(fieldProps: FieldsSnippetProps<Wio_PDef_Cat_Supp_Nested_WithLinks>)}
  <FormComboBox2
    {fieldProps}
    items={forms}
    path={["form_id"]}
    labelPath={["name"]}
    valuePath={["form_id"]}
    placeholder="Search forms..."
    label="Form"
    onChange={(value, form) => {
      log.debug("Form selected via Combobox2:", { value, form_name: form?.name });
    }}
  />
{/snippet}

<!--
  -- Render constructionType combo 
  -->
{#snippet constructionTypeCombo(fieldProps: FieldsSnippetProps<Wio_PDef_Cat_Supp_Nested_WithLinks>)}
  <FormComboBox2
    {fieldProps}
    items={constructionTypes}
    path={["construction_type_id"]}
    labelPath={["name"]}
    valuePath={["construction_type_id"]}
    placeholder="Search construction types ..."
    label="Construction Type"
    onChange={(value, constructionType) => {
      log.debug("Construction type selected via Combobox:", { value, construction_type_name: constructionType?.name });
    }}
  />
{/snippet}

<!--
  -- Render surfaceFinish combo
  -->
{#snippet surfaceFinishCombo(fieldProps: FieldsSnippetProps<Wio_PDef_Cat_Supp_Nested_WithLinks>)}
  <FormComboBox2
    {fieldProps}
    items={surfaceFinishes}
    path={["surface_finish_id"]}
    labelPath={["name"]}
    valuePath={["surface_finish_id"]}
    placeholder="Search surface finishes..."
    label="Surface Type"
    onChange={(value, surfaceFinish) => {
      log.debug("Surface finish selected via Combobox:", { value, surface_finish_name: surfaceFinish?.name });
    }}
  />
{/snippet}

<!--
  -- Render product definition combo
  -->
{#snippet productDefinitionCombo(fieldProps: FieldsSnippetProps<Wio_PDef_Cat_Supp_Nested_WithLinks>)}
  <FormComboBox2
    {fieldProps}
    items={availableProducts ?? []}
    path={["product_def_id"]}
    labelPath={["title"]}
    valuePath={["product_def_id"]}
    placeholder="Search products..."
    label="Product"
    onChange={(value, product) => {
      log.debug("Product selected via Combobox:", { value, product_title: product?.title });
    }}
  />
{/snippet}

<!--
  -- Render supplier/wholesaler combo
  -->
{#snippet supplierCombo(fieldProps: FieldsSnippetProps<Wio_PDef_Cat_Supp_Nested_WithLinks>)}
  <FormComboBox2
    {fieldProps}
    items={availableSuppliers ?? []}
    path={["wholesaler_id"]}
    labelPath={["name"]}
    valuePath={["wholesaler_id"]}
    placeholder="Search suppliers..."
    label="Supplier"
    onChange={(value, supplier) => {
      log.debug("Supplier selected via Combobox:", { value, supplier_name: supplier?.name });
    }}
  />
{/snippet}

<!-- TEMPLATE ------------------------------------------------------------------------------------>

<ValidationWrapper
  {errors}
  renderChildrenInCaseOfErrors={true}
>
  <FormShell
    bind:this={formShell}
    autoValidate="change"
    entity="Offering"
    initial={initialValidatedOfferingData as Wio_PDef_Cat_Supp_Nested_WithLinks}
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
            <h3>{data.product_def?.title || "Unnamed Product"} ➜ {data.title || "Unnamed Product"}</h3>
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
    {#snippet fields(fieldProps)}
      {@const { getS, get } = fieldProps}
      <div class="form-body">
        <div class="form-row-grid">
          <!-- title ----------------------------------------------------------------------------->
          <Field
            {fieldProps}
            path={["title"]}
            label="Title"
            type="text"
            required
            placeholder="Title"
            class="span-2"
          />

          <Field
            {fieldProps}
            path={["is_assortment"]}
            label="Im Sortiment?"
            type="checkbox"
            placeholder="Im Sortiment?"
            class="span-1"
          />

          <!-- "product defs" combo -------------------------------------------------------------->
          <div class="control-group span-2">
            <!--- Create mode and suppliers route => render "productdefs" combo --->
            {#if isCreateMode}
              {#if isSuppliersRoute}
                {@render productDefinitionCombo(fieldProps)}
              {:else}
                <p>
                  {get(["product_def", "title"]) ?? "product_def_title missing"}
                </p>
              {/if}
            {:else}
              <!--- Not create mode => Render static text for product def --->
              <p>
                {get(["product_def", "title"]) ?? "product_def_title missing"}
              </p>
              <p class="field-hint">The product cannot be changed for an existing offering.</p>
            {/if}
          </div>
        </div>
        <!-- end row ----------------------------------------------------------------------------->

        <div class="form-row-grid">
          <!-- "suppliers" combo ----------------------------------------------------------------->
          <div class="control-group span-2">
            <!--- Create mode and categories route => render "suppliers" combo --->
            {#if isCreateMode}
              {#if isCategoriesRoute}
                {@render supplierCombo(fieldProps)}
              {/if}
            {:else}
              <!--- Not create mode => Render static text for supplier --->
              <p>
                {get(["wholesaler", "name"]) ?? "supplier_name missing"}
              </p>
              <p class="field-hint">The supplier cannot be changed for an existing offering.</p>
            {/if}
          </div>

          <!-- title ----------------------------------------------------------------------------->
          <Field
            {fieldProps}
            path={["sub_seller"]}
            label="Subseller"
            type="text"
            placeholder="Subseller"
            class="span-2"
          />
        </div>
        <!-- end row ----------------------------------------------------------------------------->

        <div class="form-row-grid">
          <!-- material -------------------------------------------------------------------------->
          <div class="control-group span-1">
            {@render materialCombo2(fieldProps)}
          </div>

          <!-- form ------------------------------------------------------------------------------>
          <div class="control-group span-1">
            {@render formCombo2(fieldProps)}
          </div>

          <!-- construction type ----------------------------------------------------------------->
          <div class="control-group span-1">
            {@render constructionTypeCombo(fieldProps)}
          </div>

          <!-- surface finish -------------------------------------------------------------------->
          <div class="control-group span-1">
            {@render surfaceFinishCombo(fieldProps)}
          </div>
        </div>
        <!-- end row ----------------------------------------------------------------------------->

        <div class="form-row-grid">
          <!-- price ----------------------------------------------------------------------------->
          <Field
            {fieldProps}
            path={["price"]}
            label="Price"
            type="number"
            step="0.01"
            min="0"
            required
            placeholder="e.g., 199.99"
            class="span-1"
          />

          <!-- currency --------------------------------------------------------------------------->
          <Field
            {fieldProps}
            path={["currency"]}
            label="Currency"
            type="text"
            placeholder="e.g., USD"
            maxlength={3}
            pattern={"[A-Za-z]{3}"}
            title="Enter a 3-letter currency code"
            class="span-1"
            required
          />

          <!-- size ------------------------------------------------------------------------------>
          <Field
            {fieldProps}
            path={["size"]}
            label="Size"
            placeholder="e.g., 15 inch, Large"
            class="span-1"
          />

          <!-- dimensions ------------------------------------------------------------------------>
          <Field
            {fieldProps}
            path={["dimensions"]}
            label="Dimensions"
            placeholder="e.g., 10x20x5 cm"
            class="span-1"
          />

          <!-- weight_grams ------------------------------------------------------------------------>
          <Field
            {fieldProps}
            path={["weight_grams"]}
            label="Weight"
            type="number"
            step="0.01"
            placeholder="e.g., 250"
            class="span-1"
          />
        </div>
        <!-- end row ----------------------------------------------------------------------------->

        <div class="form-row-grid">
          <!-- comment --------------------------------------------------------------------------->
          <Field
            {fieldProps}
            path={["comment"]}
            label="Comment"
            type="textarea"
            rows={3}
            placeholder="Internal notes about this specific offering..."
            class="span-4"
          />
        </div>
        <!-- end row ----------------------------------------------------------------------------->

        <!-- SHOPIFY FIELDS (only for Shop Offerings with wholesaler_id = 99) -------------------->
        {#if getS("wholesaler_id") === 99}
          <div class="form-row-grid">
            <!-- shopify_sku ----------------------------------------------------------------------->
            <Field
              {fieldProps}
              path={["shopify_sku"]}
              label="Shopify SKU"
              type="text"
              placeholder="e.g., AME-BALL-3CM"
              maxlength={100}
              class="span-2"
            />

            <!-- shopify_price --------------------------------------------------------------------->
            <Field
              {fieldProps}
              path={["shopify_price"]}
              label="Shop Price"
              type="number"
              step="0.01"
              min="0"
              placeholder="e.g., 15.00"
              class="span-2"
            />
          </div>
          <!-- end row ----------------------------------------------------------------------------->

          <div class="form-row-grid">
            <!-- shopify_product_id (readonly) ----------------------------------------------------->
            <Field
              {fieldProps}
              path={["shopify_product_id"]}
              label="Shopify Product ID"
              type="number"
              disabled
              placeholder="Auto-set by sync"
              class="span-1"
            />

            <!-- shopify_variant_id (readonly) ----------------------------------------------------->
            <Field
              {fieldProps}
              path={["shopify_variant_id"]}
              label="Shopify Variant ID"
              type="number"
              disabled
              placeholder="Auto-set by sync"
              class="span-1"
            />

            <!-- shopify_synced_at (readonly) ------------------------------------------------------>
            <Field
              {fieldProps}
              path={["shopify_synced_at"]}
              label="Last Synced"
              type="text"
              disabled
              placeholder="Not synced yet"
              class="span-2"
            />
          </div>
          <!-- end row ----------------------------------------------------------------------------->
        {/if}
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
