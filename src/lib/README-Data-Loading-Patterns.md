# Data Loading Architecture

## Two Loading Patterns

This application uses two distinct patterns for loading data in components. Each has specific use cases and trade-offs.

## Pattern 1: SvelteKit Streaming (Promise-based)

**Used by:** `SupplierListPage`, `SupplierCategoryDetailPage`

### Characteristics

- `+page.ts` returns **Promises** directly (not awaited data)
- Component receives `data.items: Promise<T[]>`
- Component awaits promise in `$effect`
- Enables SSR streaming & progressive loading

### Example Implementation

**File: `supplierListPage.ts`**
```typescript
export function load({ fetch }: LoadEvent): SupplierListPageProps {
  const client = new ApiClient(fetch);
  const api = getSupplierApi(client);

  // ⚠️ Return the PROMISE directly (do not await!)
  return {
    suppliers: api.loadSuppliers()
  };
}
```

**File: `SupplierListPage.svelte`**
```typescript
let { data } = $props(); // data.suppliers is Promise<Supplier[]>
let resolvedSuppliers = $state<Supplier[]>([]);
let isLoading = $state(true);

$effect(() => {
  let aborted = false;

  const processPromise = async () => {
    isLoading = true;
    try {
      if (!aborted) {
        resolvedSuppliers = await data.suppliers;
      }
    } catch (err) {
      // Handle error
    } finally {
      if (!aborted) {
        isLoading = false;
      }
    }
  };

  processPromise();
  return () => { aborted = true; };
});
```

### Trade-offs

**Advantages:**
- ✅ Non-blocking navigation (user can navigate before data loads)
- ✅ SSR/streaming friendly (progressive page rendering)
- ✅ Better perceived performance for list pages

**Disadvantages:**
- ❌ Requires careful `$effect` dependency management
- ❌ More complex error handling
- ❌ Component must manage loading states

### When to Use

Use **Streaming Pattern** for:
- **List pages** with independent data
- Pages where **SSR performance** is critical
- Data that benefits from **progressive rendering**
- When data loading **doesn't block** user interaction

---

## Pattern 2: Metadata-Only Load (Component-based)

**Used by:** `SupplierDetailPage`, `OrderDetailPage`

### Characteristics

- `+page.ts` returns **only metadata** (IDs, flags, `fetch` instance)
- No data promises in `load` function
- Component loads data itself in `$effect` using the passed `fetch`
- More direct control over loading lifecycle

### Example Implementation

**File: `supplierDetailPage.ts`**
```typescript
export function load({ params, fetch, url }: LoadEvent): SupplierDetailPageProps {
  return {
    supplierId: Number(params.supplierId),
    isCreateMode: params.supplierId === 'new',
    loadEventFetch: fetch,  // Pass fetch to component
    activeChildPath: extractChildPath(url),
    params
  };
}
```

**File: `SupplierDetailPage.svelte`**
```typescript
let { data } = $props(); // data contains only metadata
let supplier = $state<Wholesaler | null>(null);
let assignedCategories = $state<Category[]>([]);

$effect(() => {
  let aborted = false;

  const processPromises = async () => {
    const client = new ApiClient(data.loadEventFetch);
    const api = getSupplierApi(client);

    try {
      // Component controls the data loading directly
      supplier = await api.loadSupplier(data.supplierId);

      if (data.activeChildPath === 'categories') {
        assignedCategories = await api.loadCategoriesForSupplier(data.supplierId);
      }
    } catch (err) {
      // Handle error
    }
  };

  processPromises();
  return () => { aborted = true; };
});
```

### Trade-offs

**Advantages:**
- ✅ Simpler component logic (data loading is explicit)
- ✅ Easier dependency management (`$effect` tracks `data` prop changes)
- ✅ Full control over load lifecycle and sequencing
- ✅ Better for **conditional loading** (e.g., tabs/child routes)

**Disadvantages:**
- ❌ No SSR streaming benefits (all loads happen in browser)
- ❌ All data loads sequentially in component
- ❌ Slightly more verbose component code

### When to Use

Use **Metadata-Only Pattern** for:
- **Detail pages** with complex interdependent loads
- Pages with **conditional data loading** logic (tabs, child routes)
- When component needs **full control** over load lifecycle
- Pages where data dependencies are **complex**

---

## Implementation Notes

### Why Pass `loadEventFetch`?

The `fetch` function from the `load` event is **context-aware** and works correctly in both SSR and browser contexts. Always use this for API calls:

```typescript
// ✅ CORRECT
const client = new ApiClient(data.loadEventFetch);

// ❌ WRONG - breaks SSR
const client = new ApiClient(fetch); // Uses browser's fetch
```

### The $effect Pattern

Both patterns use this robust `$effect` pattern for async operations:

```typescript
$effect(() => {
  let aborted = false; // Cleanup flag

  const process = async () => {
    try {
      if (!aborted) {
        // Async work here
      }
    } catch (err) {
      if (!aborted) {
        // Error handling
      }
    }
  };

  process();

  // Cleanup function prevents state updates after unmount
  return () => { aborted = true; };
});
```

### Error Handling

Both patterns should handle errors consistently:

```typescript
catch (rawError: any) {
  if (!aborted) {
    const status = rawError.status ?? 500;
    const message = rawError.body?.message || rawError.message || "An error occurred";

    // Set clean error state for UI
    loadingError = { message, status };

    // Log full error for debugging
    log.error("Load failed", { rawError });
  }
}
```

---

## Choosing a Pattern

| Scenario | Recommended Pattern | Reason |
|----------|-------------------|--------|
| Simple list page | **Streaming** | Better SSR performance |
| Detail page with tabs | **Metadata-Only** | Easier conditional loading |
| Independent data loads | **Streaming** | Progressive rendering |
| Sequential dependent loads | **Metadata-Only** | Better control |
| High SSR traffic | **Streaming** | Non-blocking navigation |
| Complex user interactions | **Metadata-Only** | Simpler state management |

---

## File Structure

```
src/
├── routes/
│   └── (browser)/
│       ├── suppliers/
│       │   ├── +page.ts              → Delegates to supplierListPage.ts
│       │   ├── +page.svelte          → Delegates to SupplierListPage.svelte
│       │   └── [supplierId]/
│       │       ├── +page.ts          → Delegates to supplierDetailPage.ts
│       │       └── +page.svelte      → Delegates to SupplierDetailPage.svelte
│       └── ...
└── lib/
    └── components/
        └── domain/
            └── suppliers/
                ├── supplierListPage.ts       → load() returns Promises
                ├── SupplierListPage.svelte   → Awaits promises
                ├── supplierDetailPage.ts     → load() returns metadata only
                └── SupplierDetailPage.svelte → Loads data itself
```

---

## Related Documentation

- See `src/lib/domain/README-Domain-Types-Schemas.md` for schema architecture
- See `src/lib/components/sidebarAndNav/README-navigation-system.md` for navigation
