### Wie das Ticket formulieren?

Ein gutes Bug-Ticket ist präzise, reproduzierbar und enthält alle relevanten Informationen.

**Titel:**
Ein guter Titel ist spezifisch und beschreibt das Problem klar.
> **Bug: Refactoring "Rename Symbol" (F2) in a `.ts` file corrupts Svelte components code that uses the renamed type**

**Body (Inhalt):**
Strukturieren Sie den Body mit den folgenden Abschnitten.

---

#### **1. Description**
*Describe the bug clearly and concisely.*

When using the "Rename Symbol" (F2) refactoring feature in VS Code on a TypeScript type within a `.ts` file, the Svelte language extension incorrectly modifies and corrupts the code of a `.svelte` file that imports and uses this type. Instead of just updating the type name, the refactoring injects malformed code and extraneous function calls throughout the Svelte component's script block, rendering it syntactically invalid.

#### **2. To Reproduce**
*Provide a minimal, step-by-step guide to reproduce the issue.*

1.  **Create a `forms.types.ts` file** with several exported TypeScript types:
    ```typescript
    // src/lib/forms.types.ts
    export type SubmitCallback<T = any> = (data: T) => unknown | Promise<unknown>;
    // ... other types
    ```

2.  **Create a `FormShell.svelte` component** that imports and uses these types in its props definition:
    ```svelte
    <!-- src/lib/components/FormShell.svelte -->
    <script lang="ts" generics="T extends Record<string, any>">
      import type { SubmitCallback, /* other types */ } from '$lib/forms.types';

      interface FormShellProps<T> {
        submitCbk: SubmitCallback<T>;
        // ... other props
      }

      const { submitCbk }: FormShellProps<T> = $props();
      // ... component logic
    </script>
    ```

3.  **Perform the refactoring:**
    *   Open the `forms.types.ts` file.
    *   Place the cursor on the `SubmitCallback` type name.
    *   Press `F2` to trigger "Rename Symbol".
    *   Rename it to `SubmitFn` and press Enter.

#### **3. Expected behavior**
*Describe what you expected to happen.*

I expected the refactoring to only change the type name `SubmitCallback` to `SubmitFn` within the `FormShell.svelte` component, leaving the rest of the code untouched.

The expected result in `FormShell.svelte` should be:
```svelte
<script lang="ts" generics="T extends Record<string, any>">
  import type { SubmitFn, /* other types */ } from '$lib/forms.types';

  interface FormShellProps<T> {
    submitCbk: SubmitFn<T>; // Correctly renamed
    // ... other props
  }
  // ...
</script>
```

#### **4. Actual behavior**
*Describe what actually happened. Include code snippets of the corrupted file.*

The `FormShell.svelte` file was corrupted with multiple syntax errors. The refactoring tool seems to have incorrectly injected code fragments into various places within the `<script>` block.

Here is a snippet of the corrupted code:

```svelte
// ...
import type {
  Errors,
  ValidateFn, // This was renamed from ValidateCallback
  SubmitFn,   // This was renamed from SubmitCallback
  CancelFn,   // This was renamed from CancelCallback
  // ...
} from "./forms.types";
  

// ...

function internalSet<P extends NonEmptyPath<T>>(
  path: readonly [...P],
  value: PathValue<T, P>,
) {
  try {
    coerceErrorMessage[it added additional characters here].set<T, P>(formState.data, path, value); // ERROR
  } catch (e) {
    // ...
  }
} 

function get<P extends NonEmptyPath<T>>(
  path: readonly [...P],
): PathValue<T, P> | undefined {
  try {
    return pathUtils.get(formState.data, path);
  } catch (e) {
    log.error("get failed", {
      //...
      error: coerceErrorMessage(e),coerceErrorMessage 
    });
    return undefined;
  }
}

function markTouched(path: string) {
  formState.touched.add(path);
  if (autoValidate === "blur") {
    void runValidate(path);
  }
}coerceErrorMessage // ERROR!

// ....
log.error("get failed", {
    // ...
    error: coerceErrorMessage(e),coerceErrorMessage // Error
});
```

#### **5. System Info**
*Provide details about your environment.*

*   **Svelte for VS Code extension version:** 109.11.0
*   **VS Code version:** v103.2.0
*   **OS:** Windows 11
*   **SvelteKit version:** ^2.22.0"
*   **Node.js version:** 24.4.1

#### **6. Additional context**
*Add any other context about the problem here.*

This issue makes refactoring TypeScript types that are consumed by Svelte components very unreliable and potentially destructive. It seems to be related to how the language server processes changes across `.ts` and `.svelte` file boundaries, especially when dealing with generic types.

