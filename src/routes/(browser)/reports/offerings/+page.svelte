<!-- src/routes/(browser)/reports/offerings/+page.svelte -->
<script lang="ts">
  /**
   * Route Delegator (UI)
   *
   * This file adheres to the Page Delegation Pattern.
   * Its only purpose is to import and render the actual page component,
   * passing down the data loaded by its sibling `+page.ts`.
   */
  import OfferingReportListPage from '$lib/components/domain/reports/offerings/OfferingReportListPage.svelte';

  let { data } = $props();
</script>

<OfferingReportListPage {data} />
