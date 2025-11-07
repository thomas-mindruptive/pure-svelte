<!-- src/routes/(browser)/reports/+page.svelte -->
<script lang="ts">
  /**
   * Route Delegator (UI)
   *
   * This file adheres to the Page Delegation Pattern.
   * Its only purpose is to import and render the actual page component,
   * passing down the data loaded by its sibling `+page.ts`.
   */
  import ReportsListPage from '$lib/components/domain/reports/ReportsListPage.svelte';

  let { data } = $props();
</script>

<ReportsListPage {data} />
