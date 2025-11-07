<script lang="ts">
  /**
   * ReportsListPage Component
   *
   * Landing page for the Reports section.
   * Lists available reports with descriptions and links.
   *
   * Pattern: Simple index page (no complex state management needed)
   */
  type Props = {
    data: any;  // Currently unused, but required by Page Delegation Pattern
  };

  // Accept data prop from route delegator (unused for now)
  let { data: _data }: Props = $props();
</script>

<div class="page-container">
  <h1>Reports</h1>
  <p>Select a report from the navigation menu.</p>

  <div class="report-links">
    <a href="/reports/offerings" class="report-link">
      <h2>Offerings Report</h2>
      <p>View all offerings with filtering and sorting capabilities</p>
    </a>
  </div>
</div>

<style>
  .page-container {
    padding: 2rem;
  }

  .report-links {
    display: grid;
    gap: 1rem;
    margin-top: 2rem;
    grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  }

  .report-link {
    padding: 1.5rem;
    border: 1px solid var(--color-border);
    border-radius: 8px;
    text-decoration: none;
    color: inherit;
    transition: all 0.2s;
  }

  .report-link:hover {
    border-color: var(--color-primary);
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  }

  .report-link h2 {
    margin-top: 0;
    margin-bottom: 0.5rem;
    font-size: 1.25rem;
  }

  .report-link p {
    margin: 0;
    color: var(--color-text-secondary);
  }
</style>
