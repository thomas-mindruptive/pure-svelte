<script
  lang="ts"
  generics="T"
>
  import FormShell from "$lib/components/forms/FormShell.svelte";
  import Field from "$lib/components/forms/Field.svelte";
  import { log } from "$lib/utils/logger";
  import { Order_Wholesaler_Schema, type Order_Wholesaler, type Wholesaler } from "$lib/domain/domainTypes";
  import "$lib/components/styles/form.css";
  import "$lib/components/styles/grid.css";
  import { ApiClient } from "$lib/api/client/ApiClient";
  import type {
    SubmittedCallback,
    SubmitErrorCallback,
    CancelledCallback,
    ChangedCallback,
    ValidateResult,
    Errors,
  } from "$lib/components/forms/forms.types";
  import ValidationWrapper from "$lib/components/validation/ValidationWrapper.svelte";
  import { assertDefined } from "$lib/utils/assertions";
  import { getOrderApi } from "$lib/api/client/order";
  import { formatDateForInput, formatDateForApi } from "$lib/utils/formatUtils";
  import type { ValidationErrorTree } from "$lib/components/validation/validation.types";
  import { zodToValidationErrorTree } from "$lib/domain/domainTypes.utils";

  // === PROPS ====================================================================================

  export type Props = {
    initial?: Order_Wholesaler | undefined | null;
    // Only needed for create mode inorder to show wholesaler info, e.g. name.
    wholeSalerOfOrder?: Wholesaler | undefined | null;
    isCreateMode: boolean;
    availableWholesalers: Wholesaler[];
    isOrdersRoute: boolean;
    isSuppliersRoute: boolean;
    disabled?: boolean;
    onSubmitted?: SubmittedCallback;
    onSubmitError?: SubmitErrorCallback;
    onCancelled?: CancelledCallback;
    onChanged?: ChangedCallback;
  };

  const {
    initial,
    wholeSalerOfOrder,
    isCreateMode,
    availableWholesalers,
    isOrdersRoute,
    isSuppliersRoute,
    disabled = false,
    onSubmitted,
    onSubmitError,
    onCancelled,
    onChanged,
  }: Props = $props();
  // Silence tsc:
  isSuppliersRoute;

  // === STATE ====================================================================================

  const errors = $state<Record<string, ValidationErrorTree>>({});

  // === INIT =====================================================================================

  $effect(() => {
    log.debug(`Props: `, { initial, wholeSalerOfOrder, isCreateMode, availableWholesalers, isOrdersRoute, isSuppliersRoute });
    if (isCreateMode) {
      if (isSuppliersRoute) {
        if (!wholeSalerOfOrder) {
          const msg = `if createMode and isSuppliersRoute => wholesaler must be set.`;
          log.error(msg);
          errors.props = { wholeSalerOfOrder: [msg] };
        }
      }
    }

    const result = Order_Wholesaler_Schema.nullable().safeParse(initial);
    if (result.error) {
      log.error(`Validation to OrderSchema failed.`, result.error);
    }
    if (result.error) {
      errors.orderWholesaler = zodToValidationErrorTree(result.error);
    }
  });

  // === DEFAULTS =================================================================================

  // Apply default values
  const initialWithDefaults = $derived.by(() => {
    const base = initial || {};
    const result: Partial<Order_Wholesaler> = {
      ...base,
      status: (base as Order_Wholesaler).status ?? "pending",
    };

    // Only use wholeSalerOfOrder in CREATE mode
    if (isCreateMode && wholeSalerOfOrder) {
      result.wholesaler = wholeSalerOfOrder;
      result.wholesaler_id = wholeSalerOfOrder.wholesaler_id;
    }

    return result as Order_Wholesaler;
  });

  // === API ======================================================================================

  const client = new ApiClient(fetch);
  const orderApi = getOrderApi(client);

  // === VALIDATE =================================================================================

  //let { schemaValidationErrors } = $derived.by(() => {
  // const result = Order_Wholesaler_Schema.nullable().safeParse(initial);
  // if (result.error) {
  //   log.error(`Validation to OrderSchema failed.`, result.error);
  // }
  // if (result.error) {
  //   errors.orderWholesaler = zodToValidationErrorTree(result.error);
  // }
  // return {
  //   schemaValidationErrors: result.success  ? null : result.error.issues,
  //   isValid: result.success,
  // };
  // });

  // === STATE ====================================================================================

  // === BUSINESS FUNCTIONALITY ===================================================================

  function validateOrder(raw: Record<string, any>): ValidateResult<Order_Wholesaler> {
    const order = raw as Order_Wholesaler;
    const errors: Errors<Order_Wholesaler> = {};

    if (order.order_date) {
      const orderDate = new Date(order.order_date);
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      if (orderDate > today) {
        errors.order_date = ["Order date cannot be in the future"];
      }
    }

    if (order.total_amount && order.total_amount !== undefined && order.total_amount < 0) {
      errors.total_amount = ["Total amount cannot be negative"];
    }

    return {
      valid: Object.keys(errors).length === 0,
      errors,
    };
  }

  // ===== HELPERS =====

  // ===== FORM CALLBACKS =====

  async function submitOrder(raw: Record<string, any>) {
    log.debug(`Submitting wholesaler`, raw);
    const data = raw as Order_Wholesaler;
    const isUpdate = !isCreateMode;
    try {
      if (isUpdate) {
        assertDefined(data, "order_id is required for update", ["order_id"]);
        return await orderApi.updateOrderFromOrderWholesaler(data.order_id, data);
      } else {
        return await orderApi.createOrderFromOrderWholesaler(data);
      }
    } catch (e) {
      log.error({ component: "OrderForm", error: String(e) }, "SUBMIT_FAILED");
      throw e;
    }
  }

  function handleSubmitted(p: { data: Record<string, any>; result: unknown }) {
    onSubmitted?.(p);
  }

  function handleSubmitError(p: { data: Record<string, any>; error: unknown }) {
    onSubmitError?.(p);
  }

  function handleCancelled(p: { data: Record<string, any>; reason?: string }) {
    onCancelled?.(p);
  }

  function handleChanged(p: { data: Record<string, any>; dirty: boolean }) {
    onChanged?.(p);
  }
</script>

<ValidationWrapper {errors}>
  <FormShell
    entity="Order"
    initial={initialWithDefaults as Order_Wholesaler}
    validate={validateOrder}
    autoValidate="change"
    submitCbk={submitOrder}
    {disabled}
    onSubmitted={handleSubmitted}
    onSubmitError={handleSubmitError}
    onCancelled={handleCancelled}
    onChanged={handleChanged}
  >
    <!-- ==========================================================================================
      -- Header  
      ========================================================================================== -->

    {#snippet header({ data, dirty })}
      {@const order = data as Order_Wholesaler}
      <div class="form-header">
        <div>
          {#if isCreateMode}
            <h3>{order.order_number || "New Order (True Faith)"}</h3>
          {:else}
            <h3>{order.order_number || "<No order number defined>"}</h3>
            <span class="field-hint">ID: {order.order_id}</span>
          {/if}
        </div>
        <div>
          {#if dirty}
            <span class="pc-grid__badge pc-grid__badge--warn">Unsaved changes</span>
          {/if}
        </div>
      </div>
    {/snippet}

    <!-- ==========================================================================================
      -- Fields 
      ========================================================================================== -->

    {#snippet fields(fieldProps)}
      {@const { getS, get, set, errors, markTouched } = fieldProps}
      <div class="form-body">
        <!-- ================================================================================
          == BASIC ORDER INFORMATION
          ================================================================================ -->
        <h4 class="form-section-title">Order Information</h4>

        <div class="form-row-grid">
          <!-- Order Date -->
          <div class="form-group">
            <label for="order-date">Order Date *</label>
            <input
              id="order-date"
              name="order_date"
              type="date"
              value={formatDateForInput(getS("order_date"))}
              class:invalid={errors.order_date}
              oninput={(e) => set(["order_date"], formatDateForApi((e.currentTarget as HTMLInputElement).value))}
              onblur={() => markTouched("order_date")}
              required
            />
            {#if errors.order_date}
              <div class="error-text">{errors.order_date[0]}</div>
            {/if}
          </div>

          <!-- Wholesaler/Supplier -->

          <div class="form-group">
            <label for="wholesaler">Supplier *</label>
            {#if isOrdersRoute}
              <select
                id="wholesaler"
                name="wholesaler_id"
                value={getS("wholesaler_id") ?? ""}
                class:invalid={errors.wholesaler_id}
                onchange={(e) => set(["wholesaler_id"], parseInt((e.currentTarget as HTMLSelectElement).value))}
                onblur={() => markTouched("wholesaler_id")}
                required
              >
                <option value="">Select supplier...</option>
                {#each availableWholesalers as wholesaler (wholesaler.wholesaler_id)}
                  <option value={wholesaler.wholesaler_id}>{wholesaler.name}</option>
                {/each}
              </select>
              {#if errors.wholesaler_id}
                <div class="error-text">{errors.wholesaler_id[0]}</div>
              {/if}
            {:else}
              <input
                id="wholesaler"
                type="text"
                disabled
                value={get(["wholesaler", "name"])}
              />
            {/if}
          </div>

          <!-- Order Number -->
          <Field
            {fieldProps}
            path={["order_number"]}
            label="Order Number"
            placeholder="e.g. ORD-2024-001"
            maxlength={100}
          />

          <!-- Status -->
          <div class="form-group">
            <label for="order-status">Status *</label>
            <select
              id="order-status"
              name="status"
              value={getS("status") ?? "pending"}
              class:invalid={errors.status}
              onchange={(e) => set(["status"], (e.currentTarget as HTMLSelectElement).value as Order_Wholesaler["status"])}
              onblur={() => markTouched("status")}
              required
            >
              <option value="pending">Pending</option>
              <option value="confirmed">Confirmed</option>
              <option value="processing">Processing</option>
              <option value="shipped">Shipped</option>
              <option value="delivered">Delivered</option>
              <option value="cancelled">Cancelled</option>
            </select>
            {#if errors.status}
              <div class="error-text">{errors.status[0]}</div>
            {/if}
          </div>

          <!-- Total Amount -->
          <Field
            {fieldProps}
            path={["total_amount"]}
            label="Total Amount"
            type="number"
            step="0.01"
            min="0"
            placeholder="0.00"
          />

          <!-- Currency -->
          <div class="form-group">
            <label for="currency">Currency</label>
            <select
              id="currency"
              name="currency"
              value={getS("currency") ?? ""}
              class:invalid={errors.currency}
              onchange={(e) => set(["currency"], (e.currentTarget as HTMLSelectElement).value || null)}
              onblur={() => markTouched("currency")}
            >
              <option value="">Select...</option>
              <option value="EUR">EUR</option>
              <option value="USD">USD</option>
              <option value="GBP">GBP</option>
              <option value="CHF">CHF</option>
            </select>
            {#if errors.currency}
              <div class="error-text">{errors.currency[0]}</div>
            {/if}
          </div>
        </div>

        <!-- ================================================================================
          == NOTES
          ================================================================================ -->
        <h4 class="form-section-title">Additional Information</h4>

        <div class="form-row-grid">
          <!-- Notes (uses span-4 for wider textarea) -->
          <div class="span-4">
            <Field
              {fieldProps}
              path={["notes"]}
              label="Notes"
              type="textarea"
              rows={4}
              maxlength={1000}
              placeholder="Additional order notes..."
            />
            <div class="char-count">
              {(getS("notes") ?? "").length} / 1000
            </div>
          </div>
        </div>
      </div>
    {/snippet}

    <!-- ==========================================================================================
      -- Actions 
      ========================================================================================== -->

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
          Save Order
        </button>
      </div>
    {/snippet}
  </FormShell>
</ValidationWrapper>
