<script lang="ts">
  import FormShell from "$lib/components/forms/FormShell.svelte";
  import { log } from "$lib/utils/logger";
  import {
    OrderItemSchema,
    type Order,
    type OrderItem,
    type WholesalerItemOffering_ProductDef_Category_Supplier,
  } from "$lib/domain/domainTypes";
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
  import { getOrderItemApi } from "$lib/api/client/orderItem";

  type ValidationErrors = Record<string, string[]>;

  // === PROPS ====================================================================================

  export type Props = {
    initial?: OrderItem | undefined | null;
    isCreateMode: boolean;
    order: Order;
    availableOfferings: WholesalerItemOffering_ProductDef_Category_Supplier[];
    disabled?: boolean;
    onSubmitted?: SubmittedCallback;
    onSubmitError?: SubmitErrorCallback;
    onCancelled?: CancelledCallback;
    onChanged?: ChangedCallback;
  };

  const { initial, isCreateMode, order, availableOfferings, disabled = false, onSubmitted, onSubmitError, onCancelled, onChanged }: Props = $props();

  // === API ======================================================================================

  const client = new ApiClient(fetch);
  const orderItemApi = getOrderItemApi(client);

  // === VALIDATE =================================================================================

  let { schemaValidationErrors } = $derived.by(() => {
    const result = OrderItemSchema.nullable().safeParse(initial);
    if (result.error) {
      log.error(`Validation of order item data to OrderItemSchema failed.`, result.error);
    }
    return {
      schemaValidationErrors: result.success ? null : result.error.issues,
      isValid: result.success,
    };
  });

  // === BUSINESS FUNCTIONALITY ===================================================================

  function validateOrderItem(raw: Record<string, any>): ValidateResult {
    const orderItem = raw as OrderItem;
    const errors: ValidationErrors = {};

    if (!orderItem.offering_id) {
      errors.offering_id = ["Please select an offering"];
    }

    if (orderItem.quantity && orderItem.quantity < 1) {
      errors.quantity = ["Quantity must be at least 1"];
    }

    if (orderItem.unit_price && orderItem.unit_price < 0) {
      errors.unit_price = ["Unit price cannot be negative"];
    }

    return {
      valid: Object.keys(errors).length === 0,
      errors,
    };
  }

  // ===== FORM CALLBACKS =====

  async function submitOrderItem(raw: Record<string, any>) {
    log.debug(`Submitting order item`, raw);
    const data = raw as OrderItem;
    const isUpdate = !isCreateMode;
    try {
      if (isUpdate) {
        assertDefined(data, "order_item_id is required for update", ["order_item_id"]);
        return await orderItemApi.updateOrderItem(data.order_item_id, data);
      } else {
        // Ensure order_id is set
        data.order_id = order.order_id;
        return await orderItemApi.createOrderItem(data);
      }
    } catch (e) {
      log.error({ component: "OrderItemForm", error: String(e) }, "SUBMIT_FAILED");
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

<ValidationWrapper errors={schemaValidationErrors}>
  <FormShell
    entity="OrderItem"
    initial={initial as OrderItem}
    validate={validateOrderItem}
    submitCbk={submitOrderItem}
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
      {@const orderItem = data as OrderItem}
      <div class="form-header">
        <div>
          {#if isCreateMode}
            <h3>New Order Item for Order #{order.order_number || order.order_id}</h3>
          {:else}
            <h3>Order Item #{orderItem.order_item_id}</h3>
            <span class="field-hint">Order: {order.order_number || order.order_id}</span>
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

    {#snippet fields({ getS, set, errors, markTouched })}
      <div class="form-body">

        <!-- ================================================================================
          == ORDER ITEM INFORMATION
          ================================================================================ -->
        <h4 class="form-section-title">Order Item Information</h4>

        <div class="form-row-grid">
          <!-- Offering -->
          <div class="form-group span-2">
            <label for="offering">Product Offering *</label>
            <select
              id="offering"
              name="offering_id"
              value={getS("offering_id") ?? ""}
              class:invalid={errors.offering_id}
              onchange={(e) => {
                const offeringId = parseInt((e.currentTarget as HTMLSelectElement).value);
                set(["offering_id"], offeringId);
                // TODO: Change to nested schema like OrderItem_ProdDef_Category and recordSetTransformer
                // Find the offering and auto-fill unit_price
                const offering = availableOfferings.find(o => o.offering_id === offeringId);
                if (offering?.price) {
                  set(["unit_price"], offering.price);
                }
              }}
              onblur={() => markTouched("offering_id")}
              required
            >
              <option value="">Select offering...</option>
              <!-- TODO: Change to nested schema like OrderItem_ProdDef_Category and recordSetTransformer -->
              {#each availableOfferings as offeringDetail (offeringDetail.offering_id)}
                <option value={offeringDetail.offering_id}>
                  {offeringDetail.category_name} - {offeringDetail.product_def_title}
                  {#if offeringDetail.size}({offeringDetail.size}){/if}
                  - €{offeringDetail.price}
                </option>
              {/each}
            </select>
            {#if errors.offering_id}
              <div class="error-text">{errors.offering_id[0]}</div>
            {/if}
          </div>

          <!-- Quantity -->
          <div class="form-group">
            <label for="quantity">Quantity *</label>
            <input
              id="quantity"
              name="quantity"
              type="number"
              min="1"
              step="1"
              value={getS("quantity") ?? 1}
              class:invalid={errors.quantity}
              oninput={(e) => {
                const quantity = parseInt((e.currentTarget as HTMLInputElement).value) || 1;
                set(["quantity"], quantity);
                // Auto-calculate line_total
                const unitPrice = getS("unit_price");
                if (unitPrice) {
                  set(["line_total"], quantity * unitPrice);
                }
              }}
              onblur={() => markTouched("quantity")}
              required
            />
            {#if errors.quantity}
              <div class="error-text">{errors.quantity[0]}</div>
            {/if}
          </div>

          <!-- Unit Price -->
          <div class="form-group">
            <label for="unit_price">Unit Price *</label>
            <input
              id="unit_price"
              name="unit_price"
              type="number"
              step="0.01"
              min="0"
              value={getS("unit_price") ?? ""}
              class:invalid={errors.unit_price}
              oninput={(e) => {
                const unitPrice = parseFloat((e.currentTarget as HTMLInputElement).value) || 0;
                set(["unit_price"], unitPrice);
                // Auto-calculate line_total
                const quantity = getS("quantity") || 1;
                set(["line_total"], quantity * unitPrice);
              }}
              onblur={() => markTouched("unit_price")}
              required
            />
            {#if errors.unit_price}
              <div class="error-text">{errors.unit_price[0]}</div>
            {/if}
          </div>

          <!-- Line Total (calculated, read-only) -->
          <div class="form-group">
            <label for="line_total">Line Total</label>
            <input
              id="line_total"
              name="line_total"
              type="number"
              step="0.01"
              value={getS("line_total") ?? ""}
              readonly
              disabled
            />
          </div>
        </div>

        <!-- ================================================================================
          == NOTES
          ================================================================================ -->
        <h4 class="form-section-title">Additional Information</h4>

        <div class="form-row-grid">
          <!-- Item Notes -->
          <div class="form-group span-3">
            <label for="item-notes">Item Notes</label>
            <textarea
              id="item-notes"
              name="item_notes"
              rows="3"
              maxlength="500"
              placeholder="Additional notes for this item..."
              value={getS("item_notes") ?? ""}
              class:invalid={errors.item_notes}
              oninput={(e) => set(["item_notes"], (e.currentTarget as HTMLTextAreaElement).value || null)}
              onblur={() => markTouched("item_notes")}
            ></textarea>
            <div class="char-count">
              {(getS("item_notes") ?? "").length} / 500
            </div>
            {#if errors.item_notes}
              <div class="error-text">{errors.item_notes[0]}</div>
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
          Save Order Item
        </button>
      </div>
    {/snippet}
  </FormShell>
</ValidationWrapper>
