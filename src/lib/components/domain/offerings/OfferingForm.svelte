<!-- src/lib/components/domain/offerings/OfferingForm.svelte -->
<script lang="ts">
  /**
   * OfferingForm Component (Svelte 5 + Runes)
   */

  // ===== IMPORTS =====
  import { ApiClient } from "$lib/api/client/apiClient";
  import { getOfferingApi } from "$lib/api/client/offering";
  import { OfferingDetail_LoadDataSchema, type OfferingDetail_LoadData } from "$lib/components/domain/offerings/offeringDetail.types";
  import Field from "$lib/components/forms/Field.svelte";
  import FormComboBox2 from "$lib/components/forms/FormComboBox2.svelte";
  import type {
    CancelledCallback,
    ChangedCallback,
    SubmitErrorCallback,
    SubmittedCallback,
    ValidateResult,
  } from "$lib/components/forms/forms.types";
  import FormShell, { type FieldsSnippetProps } from "$lib/components/forms/FormShell.svelte";
  import "$lib/components/styles/form.css";
  import "$lib/components/styles/grid.css";
  import type { ValidationErrors } from "$lib/components/validation/validation.types";
  import ValidationWrapper from "$lib/components/validation/ValidationWrapper.svelte";
  import {
    Wio_Schema,
    WholesalerItemOfferingForCreateSchema,
    type WholesalerItemOffering,
    type Wio_PDef_Cat_Supp_Nested_WithLinks,
  } from "$lib/domain/domainTypes";
  import { zodToValidationErrors } from "$lib/domain/domainTypes.utils";
  import { assertDefined } from "$lib/utils/assertions";
  import { log } from "$lib/utils/logger";
  import { addNotification } from "$lib/stores/notifications";

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
        initialValidatedOfferingData: initialLoadedData.offering ?? null,
        availableProducts: initialLoadedData.availableProducts ?? [],
        availableSuppliers: initialLoadedData.availableSuppliers ?? [],
        materials: initialLoadedData.materials ?? [],
        forms: initialLoadedData.forms ?? [],
        constructionTypes: initialLoadedData.constructionTypes ?? [],
        surfaceFinishes: initialLoadedData.surfaceFinishes ?? [],
      };
    }

    const data = result.data;
    let finalInitialData = data.offering ?? null;
    let finalErrors: any[] = [];

    if (data.isCreateMode) {
      // Allow offering with only product_def (for /categories/... route validation)
      // But not a full offering object with offering_id (which would be an error)
      if (finalInitialData && finalInitialData.offering_id) {
        finalErrors.push({
          message: "In create mode, initialValidatedOfferingData should not have offering_id",
          code: "custom",
          path: ["initialValidatedOfferingData"],
        });
      } else {
        // ⚠️⚠️⚠️ NOTE: This initialisation is key. Otherwise form validation and submit fails!
        // Create mode: NESTED structure with empty nested objects
        // On /categories/... route, data.offering includes product_def for validation
        // IMPORTANT: Only spread product_def from data.offering (if it exists)
        // We can't spread the whole offering object because it doesn't have all required fields
        const productDefFromOffering = data.offering?.product_def;
        log.debug(`[OfferingForm] Initializing finalInitialData for create mode`, {
          hasProductDefFromOffering: !!productDefFromOffering,
          productDefId: data.productDefId,
          productDefTitle: productDefFromOffering?.title,
        });
        finalInitialData = {
          category_id: data.categoryId,
          product_def_id: data.productDefId,
          wholesaler_id: data.supplierId,
          ...(productDefFromOffering ? { product_def: productDefFromOffering } : {}),
        } as Wio_PDef_Cat_Supp_Nested_WithLinks;
        log.debug(`[OfferingForm] finalInitialData initialized`, {
          hasProductDef: !!finalInitialData.product_def,
          productDefId: finalInitialData.product_def_id,
        });
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

  // Copy operation state
  let copiedOfferingId = $state<number | null>(null);
  let isCopying = $state(false);

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
    }
  });

  // ===== FORM VALIDATION LOGIC =====

  /**
   * Performs custom business rule validation.
   * This is a pure function: it receives data and returns a validation result
   * without any DOM side effects. It handles rules that HTML cannot.
   * Uses different schema for create vs. update mode:
   * - Create mode: nested objects (product_def, category, wholesaler) are optional
   * - Update mode: nested objects are required
   * @param data The current form data.
   * @returns A ValidateResult object containing any errors for custom rules.
   */
  function validateOfferingForSubmit(raw: Record<string, any>): ValidateResult<Wio_PDef_Cat_Supp_Nested_WithLinks> {
    log.debug(`[validateOfferingForSubmit] Validating offering form data (isCreateMode: ${isCreateMode})`, {
      raw,
      hasProductDef: !!raw.product_def,
      productDefId: raw.product_def_id,
      productDefTitle: raw.product_def?.title,
    });
    assertDefined(raw, "validateOfferingForSubmit");
    const data = raw as Wio_PDef_Cat_Supp_Nested_WithLinks;

    // Schema validation: Only validate editable fields, not nested objects
    // Nested objects (product_def, category, wholesaler) are only used for custom validation, not schema validation
    const schema = isCreateMode 
      ? WholesalerItemOfferingForCreateSchema 
      : Wio_Schema;
    
    const offeringVal = schema.safeParse(data);

    // Initialize errors from schema validation
    let errors: ValidationErrors<Wio_PDef_Cat_Supp_Nested_WithLinks> | undefined = undefined;
    if (offeringVal.error) {
      log.error(`Validation of offering failed: `, offeringVal.error);
      errors = zodToValidationErrors(offeringVal.error);
    } else {
      // Initialize empty errors object if no schema errors
      errors = {} as ValidationErrors<Wio_PDef_Cat_Supp_Nested_WithLinks>;
    }

    // IMPORTANT: Custom validation for Material/Form (only runs on submit, not on initialization)
    // product_def must always be present for validation
    // On /categories/... route: loaded during initialization → should always be present (if missing = internal error)
    // On /suppliers/... route: set via combobox onChange → should be present on submit (if missing = validation error)
    if (!data.product_def) {
      // Internal error: product_def should always be present
      const errorMessage = isCategoriesRoute 
        ? 'Internal error: Product definition not loaded. Please refresh the page.'
        : 'Product definition is required. Please select a product.';
      
      log.error(`Internal error: product_def missing in validateOfferingForSubmit`, { 
        isCreateMode, 
        isCategoriesRoute, 
        isSuppliersRoute,
        productDefId: data.product_def_id 
      });
      
      addNotification(
        isCategoriesRoute 
          ? 'Internal error: Product definition not loaded. Please refresh the page.' 
          : 'Please select a product before submitting.',
        'error'
      );
      
      // Add validation error to prevent form submission
      if (!errors.product_def) errors.product_def = [];
      errors.product_def.push(errorMessage);
      
      return {
        valid: false,
        errors,
      };
    }

    // Material validation
    // SPECIAL CASE: If ProductDef has material_id = 2 (Halbedelstein), it's a generic placeholder
    // and the Offering MUST set a specific material (not 2)
    const productDefMaterialId = data.product_def.material_id;
    const offeringMaterialId = data.material_id;
    
    // Special case: Material ID 2 (Halbedelstein) is a generic placeholder
    // If ProductDef has material_id = 2, Offering MUST have a different material
    if (productDefMaterialId === 2) {
      if (!offeringMaterialId || offeringMaterialId === 2) {
        if (!errors.material_id) errors.material_id = [];
        errors.material_id.push('Material is required. The ProductDefinition has "Halbedelstein" as a generic placeholder - you must specify the actual material.');
      }
    } else if (!productDefMaterialId && !offeringMaterialId) {
      // Normal case: If ProductDef has no material, Offering MUST have material
      if (!errors.material_id) errors.material_id = [];
      errors.material_id.push('Material is required because the ProductDefinition has no material');
    }
    
    // Form validation
    // Check: If ProductDef has no form, Offering MUST have form
    const productDefFormId = data.product_def.form_id;
    const offeringFormId = data.form_id;
    
    if (!productDefFormId && !offeringFormId) {
      if (!errors.form_id) errors.form_id = [];
      errors.form_id.push('Form is required because the ProductDefinition has no form');
    }

    // Check if we have any errors
    const hasErrors = errors && Object.keys(errors).length > 0;

    return {
      valid: offeringVal.success && !hasErrors,
      errors: hasErrors ? errors : undefined,
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

      // CRITICAL: If optional fields were deleted (missing in formStateClone but present in initial data),
      // explicitly set them to null so the backend knows to clear them.
      // Without this, missing properties are ignored by PATCH semantics (backend doesn't change them).
      const initialData = initialValidatedOfferingData;
      if (initialData) {
        // List of optional fields that can be cleared (nullable/optional in schema)
        const optionalFields: (keyof WholesalerItemOffering)[] = [
          'price_per_piece',
          'price',
          'weight_grams',
          'sub_seller',
          'wholesaler_article_number',
          'material_id',
          'form_id',
          'construction_type_id',
          'surface_finish_id',
          'color_variant',
          'title',
          'size',
          'dimensions',
          'packaging',
          'weight_range',
          'package_weight',
          'origin',
          'currency',
          'comment',
          'quality',
          'is_assortment',
          'shopify_product_id',
          'shopify_variant_id',
          'shopify_sku',
          'shopify_price',
          'wholesaler_price',
          'shopify_synced_at',
        ];

        for (const field of optionalFields) {
          // If field existed in initial data (was not null/undefined) but is missing in updateData,
          // explicitly set it to null to signal "clear this field"
          if (initialData[field] != null && !(field in updateData)) {
            (updateData as any)[field] = null;
            log.debug(`(OfferingForm) Field ${String(field)} was deleted, explicitly setting to null in update payload`);
          }
        }
      }

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

  /**
   * Handles copying the current offering
   */
  async function handleCopy() {
    const offeringId = initialLoadedData.offering?.offering_id;

    if (!offeringId) {
      log.error("(OfferingForm) Cannot copy: No offering ID");
      addNotification("Cannot copy: No offering ID available", "error");
      return;
    }

    isCopying = true;
    copiedOfferingId = null;

    try {
      log.info("(OfferingForm) Copying offering", { offeringId });

      // Use API client instead of direct fetch
      const newOfferingId = await offeringApi.copyOffering(offeringId);
      copiedOfferingId = newOfferingId;

      log.info("(OfferingForm) Offering copied successfully", {
        sourceId: offeringId,
        newId: copiedOfferingId,
      });

      addNotification(`Offering successfully copied! New ID: ${copiedOfferingId}`, "success");
    } catch (error) {
      log.error("(OfferingForm) Failed to copy offering", { error });
      copiedOfferingId = null;
      addNotification(`Failed to copy offering: ${error}`, "error", 5000);
    } finally {
      isCopying = false;
    }
  }

  /**
   * Navigates to the copied offering
   */
  function handleGoto() {
    if (!copiedOfferingId) {
      log.error("(OfferingForm) Cannot navigate: No copied offering ID");
      return;
    }

    // Navigate to the copied offering detail page
    // Keep the same route context (suppliers or categories)
    const basePath = initialLoadedData.urlPathName.replace(/\/offerings\/.*$/, "");
    window.location.href = `${basePath}/offerings/${copiedOfferingId}`;
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
      
      // IMPORTANT: Set the nested product_def object for validation
      // The FormComboBox2 only sets product_def_id, but validation needs the full product_def object
      if (product && formShell) {
        formShell.set(["product_def"], product);
        log.debug("Set product_def object for validation", product);
      }
      // Note: If product is null, we don't clear product_def - let FormShell handle it
      // Setting to null/undefined would cause type errors
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
    required
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
          {:else if data.product_def?.title}
            <h3>{data.product_def.title} ➜ New Offering</h3>
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
      {@const { getS } = fieldProps}
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
            <!-- <refact01> CHANGED: Product def combo ALWAYS editable (no wholesaler_categories constraint) -->
            {@render productDefinitionCombo(fieldProps)}
          </div>
        </div>
        <!-- end row ----------------------------------------------------------------------------->

        <div class="form-row-grid">
          <!-- "suppliers" combo ----------------------------------------------------------------->
          <div class="control-group span-2">
            <!--- <refact01> CHANGED: Supplier can now be changed (wholesaler_categories constraint removed) --->
            {#if isCategoriesRoute}
              {@render supplierCombo(fieldProps)}
            {/if}
          </div>

          <!-- subseller ---------------------------------------------------------------------->
          <Field
            {fieldProps}
            path={["sub_seller"]}
            label="Subseller"
            type="text"
            placeholder="Subseller"
            class="span-1"
          />

          <!-- supplier article number --------------------------------------------------------->
          <Field
            {fieldProps}
            path={["wholesaler_article_number"]}
            label="Supplier Article Nr."
            type="text"
            required
            placeholder="Supplier Article Number"
            class="span-1"
          />

          <!-- qiality --------------------------------------------------------------------------->
          <Field
            {fieldProps}
            path={["quality"]}
            label="Quality"
            type="text"
            placeholder="Quality"
            class="span-1"
          />


        </div>
        <!-- end row ----------------------------------------------------------------------------->

        <div class="form-row-grid">
          <!-- material -------------------------------------------------------------------------->
          <div class="control-group span-1">
            {@render materialCombo2(fieldProps)}
          </div>

          <!-- override_material checkbox --------------------------------------------------------->
          <Field
            {fieldProps}
            path={["override_material"]}
            label="override Material"
            type="checkbox"
            class="span-1"
          />

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
          <!-- price -----------------------------------------------------------------------------
          -->
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

          <!-- price_per_piece ------------------------------------------------------------------->
          <Field
            {fieldProps}
            path={["price_per_piece"]}
            label="Price per piece"
            type="number"
            step="0.01"
            min="0"
            placeholder="e.g., 3.50"
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
            placeholder="Unit required: 3cm, 1-3cm, 10mm"
            class="span-1"
          />

          <!-- packaging ------------------------------------------------------------------------->
          <Field
            {fieldProps}
            path={["packaging"]}
            label="Packaging"
            placeholder="e.g., Box, Bag, Tube"
            class="span-1"
          />

          <!-- weight_grams ------------------------------------------------------------------------>
          <Field
            {fieldProps}
            path={["weight_grams"]}
            label="Weight (g)"
            type="number"
            step="0.01"
            placeholder="e.g., 250"
            class="span-1"
          />

          <!-- weight_range ------------------------------------------------------------------------>
          <Field
            {fieldProps}
            path={["weight_range"]}
            label="Weight Range"
            type="text"
            placeholder="Unit required: 250g, 50-80g, ca. 100g"
            class="span-1"
          />

          <!-- package_weight ------------------------------------------------------------------------>
          <Field
            {fieldProps}
            path={["package_weight"]}
            label="Package Weight"
            type="text"
            placeholder="Unit required: 250g, 50-80g, ca. 100g"
            class="span-1"
          />

          <!-- origin ------------------------------------------------------------------------------>
          <Field
            {fieldProps}
            path={["origin"]}
            label="Origin"
            type="text"
            placeholder="e.g., origin / source"
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
          <!-- end row -----------------------------------------------------------------------------
          -->

          <div class="form-row-grid">
            <!-- wholesaler_price ------------------------------------------------------------------>
            <Field
              {fieldProps}
              path={["wholesaler_price"]}
              label="Wholesaler Price"
              type="number"
              step="0.01"
              min="0"
              placeholder="Desired/max price at wholesaler"
              class="span-2"
            />
          </div>
          <!-- end row -----------------------------------------------------------------------------
          -->

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
        <!-- Cancel and Save buttons -->
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

        <!-- Spacer -->
        <div style="flex: 1;"></div>

        <!-- Copy and Goto buttons (only in edit mode) -->
        {#if !isCreateMode && initialLoadedData.offering?.offering_id}
          <button
            class="secondary-button"
            type="button"
            onclick={handleCopy}
            disabled={submitting || isCopying}
            aria-busy={isCopying}
          >
            {#if isCopying}
              <span
                class="pc-grid__spinner"
                aria-hidden="true"
              ></span>
            {/if}
            Copy
          </button>

          {#if copiedOfferingId}
            <button
              class="primary-button"
              type="button"
              onclick={handleGoto}
            >
              Goto Copy
            </button>
          {/if}
        {/if}
      </div>
    {/snippet}
  </FormShell>
</ValidationWrapper>
