<!-- src/lib/components/Snackbar.svelte -->
<script lang="ts">
  import { notifications } from "$lib/stores/notifications";

  let containerRef: HTMLDivElement;

  // Show/hide popover based on notifications
  $effect(() => {
    if (!containerRef) return;

    if ($notifications.length > 0) {
      // Check if popover API is supported
      if (containerRef.showPopover) {
        containerRef.showPopover();
      }
    } else {
      if (containerRef.hidePopover) {
        try {
          containerRef.hidePopover();
        } catch {
          // Ignore if already hidden
        }
      }
    }
  });
</script>

<!-- Der Container für alle Benachrichtigungen - now with popover support -->
<div
  bind:this={containerRef}
  popover="manual"
  class="snackbar-container"
>
  <!-- $notifications ist die magische Svelte-Syntax, um einen Store zu abonnieren -->
  {#each $notifications as notification (notification.id)}
    <div class="snackbar {notification.type}">
      {@html notification.message}
    </div>
  {/each}
</div>

<style>
  .snackbar-container {
    position: fixed;
    bottom: 20px;
    left: 50%;
    transform: translateX(-50%);
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    z-index: 99999; /* Higher than dialog elements (10000+) */

    /* Reset popover defaults */
    margin: 0;
    padding: 0;
    border: none;
    background: none;
    width: auto;
    max-width: 90vw;
  }

  /* Ensure position stays the same when shown as popover */
  .snackbar-container:popover-open {
    inset: unset; /* Reset browser's default inset */
    position: fixed;
    bottom: 20px;
    left: 50%;
    transform: translateX(-50%);
  }
  .snackbar {
    padding: 1rem 2rem;
    border-radius: 8px;
    color: white;
    box-shadow: 0 4px 10px rgba(0, 0, 0, 0.2);
  }
  .snackbar.success {
    background-color: #28a745;
  }
  .snackbar.error {
    background-color: #dc3545;
  }
  .snackbar.info {
    background-color: #17a2b8;
  }
</style>
