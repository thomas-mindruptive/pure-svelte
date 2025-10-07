<script
  lang="ts"
  generics="T"
>
  import FormShell from "$lib/components/forms/FormShell.svelte";
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
  } from "$lib/components/forms/forms.types";
  import ValidationWrapper from "$lib/components/validation/ValidationWrapper.svelte";
  import { assertDefined } from "$lib/utils/assertions";
  import { getOrderApi } from "$lib/api/client/order";
  import { formatDateForInput, formatDateForApi } from "$lib/utils/formatUtils";
    import type { ValidationErrors, ValidationErrorTree } from "$lib/components/validation/validation.types";
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
  } : Props = $props();
  // Silence tsc:
  isSuppliersRoute;

  // === STATE ====================================================================================

  const errors = $state<Record<string, ValidationErrorTree>>({});

  // === INIT =====================================================================================

  $effect(() => {
    log.debug(`Props: `, {initial, wholeSalerOfOrder, isCreateMode, availableWholesalers, isOrdersRoute, isSuppliersRoute});
    if (isCreateMode) {
      if (isSuppliersRoute) {
         if (!wholeSalerOfOrder) {
          const msg = `if createMode and isSuppliersRoute => wholesaler must be set.`;
          log.error(msg);
          errors.props = {wholeSalerOfOrder: [msg]}
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

  function validateOrder(raw: Record<string, any>): ValidateResult {
    const order = raw as Order_Wholesaler;
    const errors: ValidationErrors = {};

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

<ValidationWrapper errors={errors}>
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

    {#snippet fields({ getS, get, set, errors, markTouched })}
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
          <div class="form-group">
            <label for="order-number">Order Number</label>
            <input
              id="order-number"
              name="order_number"
              type="text"
              maxlength="100"
              value={getS("order_number") ?? ""}
              class:invalid={errors.order_number}
              placeholder="e.g. ORD-2024-001"
              oninput={(e) => set(["order_number"], (e.currentTarget as HTMLInputElement).value)}
              onblur={() => markTouched("order_number")}
            />
            {#if errors.order_number}
              <div class="error-text">{errors.order_number[0]}</div>
            {/if}
          </div>

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
          <div class="form-group">
            <label for="total-amount">Total Amount</label>
            <input
              id="total-amount"
              name="total_amount"
              type="number"
              step="0.01"
              min="0"
              value={getS("total_amount") ?? ""}
              class:invalid={errors.total_amount}
              placeholder="0.00"
              oninput={(e) => set(["total_amount"], parseFloat((e.currentTarget as HTMLInputElement).value) || null)}
              onblur={() => markTouched("total_amount")}
            />
            {#if errors.total_amount}
              <div class="error-text">{errors.total_amount[0]}</div>
            {/if}
          </div>

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
          <!-- Notes (uses span-3 for wider textarea) -->
          <div class="form-group span-4">
            <label for="order-notes">Notes</label>
            <textarea
              id="order-notes"
              name="notes"
              rows="4"
              maxlength="1000"
              placeholder="Additional order notes..."
              value={getS("notes") ?? ""}
              class:invalid={errors.notes}
              oninput={(e) => set(["notes"], (e.currentTarget as HTMLTextAreaElement).value || null)}
              onblur={() => markTouched("notes")}
            ></textarea>
            <div class="char-count">
              {(getS("notes") ?? "").length} / 1000
            </div>
            {#if errors.notes}
              <div class="error-text">{errors.notes[0]}</div>
            {/if}
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
