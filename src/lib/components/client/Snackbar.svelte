<!-- src/lib/components/Snackbar.svelte -->
<script lang="ts">
  import { notifications } from "$lib/stores/notifications";
</script>

<!-- Der Container für alle Benachrichtigungen -->
<div class="snackbar-container">
  <!-- $notifications ist die magische Svelte-Syntax, um einen Store zu abonnieren -->
  {#each $notifications as notification (notification.id)}
    <div class="snackbar {notification.type}">
      {notification.message}
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
    z-index: 9999;
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
