<script lang="ts">
  // Currently no other way for errors!?
  import { page } from '$app/stores';
</script>

<div class="component-error-boundary">
  <h3>
    Fehler beim Laden der Seite (Status: {$page.status})
  </h3>
  <p>
    {$page.error?.message}
  </p>
  <div style="margin-top: 1.rem;">
    <a href="/suppliers" class="primary-button">Zurück zur Übersicht</a>
  </div>
</div>

<style>

</style>