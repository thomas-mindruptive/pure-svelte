<script lang="ts">
  export type Props = {
    value?: string;
    onChange: (value: string) => void;
  };
  let { value = '', onChange }: Props = $props();

  function handleInput(event: Event) {
    const v = (event.target as HTMLInputElement).value;
    onChange(v);
  }
</script>

<div class="quick-text-like">
  <input
    type="text"
    placeholder="Search materials..."
    value={value}
    oninput={handleInput}
    onkeydown={(e) => { if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); } }}
  />
</div>

<style>
  .quick-text-like {
    display: inline-flex;
    align-items: center;
  }
  .quick-text-like input {
    width: 220px;
  }
</style>

