<!-- SupplierListPage.svelte -->
<script lang="ts">
  import "$lib/components/styles/list-page-layout.css";
  import ComboBox2 from "../forms/ComboBox2New.svelte";

  // === TEST combo ===============================================================================

  // -----------------------------------------------------
  // BEISPIEL 2: KOMPLEXER FALL (Array aus Objekten)
  // -----------------------------------------------------
  type User = {
    id: number;
    firstName: string;
    lastName: string;
    email: string;
  };

  const users: User[] = [
    { id: 101, firstName: "Alice", lastName: "Smith", email: "alice@example.com" },
    { id: 102, firstName: "Bob", lastName: "Johnson", email: "bob@example.com" },
    { id: 103, firstName: "Charlie", lastName: "Williams", email: "charlie@example.com" },
    { id: 104, firstName: "Diana", lastName: "Brown", email: "diana@example.com" },
  ];

  // Hier wird das *gesamte* ausgewählte Objekt gespeichert, nicht nur eine ID oder ein Name.
  let selectedUser = $state<User | null>(null);
</script>

<!----- TEMPLATE ----->

<div class="list-page-content-wrapper">
  <ComboBox2
    items={users}
    labelPath={["lastName"]}
    bind:value={selectedUser}
    valuePath={["id"]}
    placeholder="Benutzer suchen..."
    label="Benutzer auswählen"
  />
  <!-- We could override the label by: getLabel={(user) => `${user.firstName} ${user.lastName}`} -->
  <div class="result">
    {#if selectedUser}
      <p>Ausgewähltes Benutzer-Objekt:</p>
      <pre>{JSON.stringify(selectedUser, null, 2)}</pre>
    {:else}
      <p><i>Noch kein Benutzer ausgewählt.</i></p>
    {/if}
  </div>
</div>

<style>
</style>
