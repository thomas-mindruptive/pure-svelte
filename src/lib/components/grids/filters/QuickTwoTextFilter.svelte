<script lang="ts">
  export type TwoTextValue = { material?: string; form?: string };
  export type Props = {
    value?: TwoTextValue;
    onChange: (value: TwoTextValue) => void;
    materialLabel?: string;
    formLabel?: string;
  };
  let { value = {}, onChange, materialLabel = 'Material contains', formLabel = 'Form contains' }: Props = $props();

  function onMaterialInput(e: Event) {
    const v = (e.target as HTMLInputElement).value;
    onChange({ ...value, material: v });
  }
  function onFormInput(e: Event) {
    const v = (e.target as HTMLInputElement).value;
    onChange({ ...value, form: v });
  }
</script>

<div class="qtworow">
  <label class="qtworow__field">
    <span class="qtworow__label">{materialLabel}</span>
    <input
      type="text"
      class="qtworow__input"
      value={value?.material ?? ''}
      oninput={onMaterialInput}
      onkeydown={(e) => { if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); } }}
      placeholder="e.g. quartz"
    />
  </label>
  <label class="qtworow__field">
    <span class="qtworow__label">{formLabel}</span>
    <input
      type="text"
      class="qtworow__input"
      value={value?.form ?? ''}
      oninput={onFormInput}
      onkeydown={(e) => { if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); } }}
      placeholder="e.g. sphere"
    />
  </label>
</div>

<style>
  .qtworow {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.75rem;
    align-items: end;
  }
  .qtworow__field {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }
  .qtworow__label {
    font-size: 0.875rem;
    font-weight: 500;
  }
  .qtworow__input {
    width: 100%;
  }
</style>


