{#snippet header({ data })}
    <div class="form-header">
        <div>
            {#if data.offering_id}
                <!-- 
                  THIS IS THE BUG:
                  This branch is not taken at runtime in "create" mode, but it
                  MUST be type-safe at compile-time. The compiler should know that
                  the generic `data` object passed from `FormShell` does not have
                  a `product_def_title` property.
                  
                  Instead of a compile-time error, this code is allowed. If the 
                  `{#if}` logic were to fail, it would lead to a runtime error 
                  or a silent failure (rendering `undefined`). This bypasses static typing.
                -->
                <h3>{data.product_def_title || "Unnamed Product"}</h3>
            {:else}
                <h3>New Product Offering</h3>
            {/if}
            <span class="field-hint">ID: {data.offering_id}</span>
        </div>
    </div>
{/snippet}


---

## TODOS (UPDATED)
* Update SupplierDetailPage and OfferingDetail*Page to GOTO the "edit mode" link. I.e. it should not stay in crate mode because:
  * SupplierDetailPage: Cannot assign categories as long as in create mode.
  * Offering: Can modify prouct definition combo => Could render offering useless. E.g. define a filed which does not applay to product. 
* Refactor categoryDetialPAge to async load patern.
* Add routes for adding new objects: suppliers

*   **Finalize CSS Refactoring:** Ensure all pages correctly import and use the new pattern-based CSS files (`detail-page-layout.css`, etc.) and that all duplicate local styles have been removed.
*   **Audit API Clients for SSR Safety:** Verify that all `LoadingState` method calls (`.start()`, `.finish()`) are wrapped in an `if (browser)` check. **(DEFERRED: Current pattern works, but this is good practice for client-only actions).**
*   **Audit `load` Functions:** Verify that all `load` functions correctly pass the `fetch` function from the `LoadEvent` to the `ApiClient`.
*   **Audit Deletion Logic:** Verify that all `deleteStrategy` implementations use the "fire-and-forget" `invalidateAll()` pattern to prevent UI race conditions.
*   **Fix scaffolding tool:** Ensure the `+page.ts` template generates extension-less imports for module delegation.