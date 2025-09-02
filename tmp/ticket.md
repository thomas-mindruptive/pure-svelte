### **Title: DX: Non-local changes in `+layout.ts` can break type safety, and static analysis is bypassed in snippets**

**Describe the bug or feature request**

This issue covers two related and critical problems with SvelteKit's type system that harm the developer experience (DX) for large, professionally developed applications:

1.  Refactoring a parent `+layout.ts` can cause unexpected, non-local TypeScript errors in child routes.
2.  TypeScript's static analysis is bypassed or overly lenient within snippets passed to generic components, allowing code with clear type errors to compile, which leads to runtime bugs.

Both issues violate fundamental principles of locality and static safety, making the system feel unpredictable and difficult to debug.

**The Core DX Problem: "Global Magic Chaos" and Bypassed Type Safety**

SvelteKit's `PageData` object, which merges data from all parent layouts, is a powerful feature to avoid prop drilling. However, it introduces a pattern that can feel like **"global magic chaos,"** reminiscent of older server-side technologies where data was implicitly injected into a global context. This leads to severe architectural challenges:

*   **Loss of Locality:** A component's correctness no longer depends solely on its own code. It develops an implicit, invisible dependency on the implementation details of a parent layout. A logical cleanup in a `+layout.ts` file can break a child component, even if the component's code and its direct `+page.ts` file are untouched. The root cause of an error is often far removed from where the error is reported.
*   **Bypassed Static Typing in Snippets:** The static analysis within Svelte templates is not as robust as it should be, undermining the safety provided by TypeScript.

**Critical Example: Bypassed Type Safety in a Generic Form Snippet**

This problem becomes severe when using generic components with slots/snippets, a common pattern for reusable building blocks like forms. The type safety of this pattern is undermined because type information from a "smart parent" is lost when passed through a "dumb generic child" and back into a snippet.

Consider a reusable `FormShell.svelte` component that manages generic form state and a specific `OfferingForm.svelte` that uses it.

1.  `OfferingForm` is used in "create" mode, so `FormShell` is initialized with `initial={{}}`. The internal `data` state of `FormShell` is a generic `Record<string, any>`.
2.  `OfferingForm` provides a `header` snippet to `FormShell`.
3.  `FormShell` renders this snippet, passing its generic `data` object (`{}`) to it.

The snippet in `OfferingForm.svelte` contains the following code:

```svelte
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
```

This code **should fail to compile**. The compiler should flag that `data.product_def_title` does not exist on the generic `data` object provided by `FormShell`. The fact that it compiles means that the type safety promised by TypeScript is not being enforced within the snippet's context. This forces developers to use explicit `as` casts inside the snippet to regain type information, which is a workaround, not a robust solution.

**How the Non-Local Error is Triggered**

The above type error can remain latent and undetected for a long time. It can then be suddenly exposed by an unrelated change in a parent `+layout.ts`:

1.  Start with a parent `+layout.ts` that has a `load` function with complex or ambiguous logic.
2.  The child page (`.../[id]/+page.ts`) has its own `load` function with a slight type flaw (e.g., omitting a required property that the component expects).
3.  **Observe:** The project often compiles successfully, presumably because the complex layout logic leads to a "looser" inferred `PageData` type that doesn't flag the mismatch.
4.  **The Trigger:** Refactor the parent `+layout.ts` `load` function to be logically simpler, while keeping the final return type signature identical.
5.  **The Result:** Compilation now fails with non-local errors in the child page component. The new, cleaner layout logic seems to enable a more precise type inference by SvelteKit, which now correctly exposes the pre-existing bug in the child page's data loading.

**Expected behavior**

1.  **Consistent Static Analysis:** The strictness of TypeScript checking should not depend on the implementation details of a parent layout's `load` function. Latent type errors should be caught consistently.
2.  **Robust Template Typing:** The compiler should enforce types within snippets based on the props passed to them, even from generic components. Accessing a property that is not defined on a generic object type should be a compile-time error.
3.  **Locality:** Refactoring a file should ideally only produce errors within that same file or in files that directly import it.

**System Info**
*   SvelteKit version: [Your version here, e.g., `@sveltejs/kit@2.5.0`]
*   Svelte version: [Your version here, e.g., `svelte@5.0.0-next.123`]
*   TypeScript version: [Your version here, e.g., `5.4.5`]
*   OS: [Your OS]
*   `tsconfig.json` settings: `strict: true`, `exactOptionalPropertyTypes: true`

This combination of behaviors forces developers to adopt defensive patterns to work around the framework's magic, which seems to contradict the goal of a streamlined developer experience. We believe a more predictable and transparent type system would greatly enhance SvelteKit for professional, large-scale application development.

Thank you for your consideration.
**System Info**
*   SvelteKit version: ^2.22.0
*   Svelte version: ^5.0.0
*   TypeScript version: ^5.0.0
*   OS: win 11, 10.0.22631
*   `tsconfig.json` settings: `strict: true`, `exactOptionalPropertyTypes: true`

Thank you for looking into this. The automatic type generation is a fantastic feature, and improving the predictability of the type inference would make it even more powerful and intuitive.