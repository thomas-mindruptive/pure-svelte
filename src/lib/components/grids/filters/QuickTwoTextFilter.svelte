<script lang="ts">
  export type TwoTextValue = { material?: string; form?: string; constructionType?: string };
  export type Props = {
    value?: TwoTextValue;
    onChange: (value: TwoTextValue) => void;
    materialLabel?: string;
    formLabel?: string;
    constructionTypeLabel?: string;
  };
  let {
    value = {},
    onChange,
    materialLabel = 'Material',
    formLabel = 'Form',
    constructionTypeLabel = 'Const. Type'
  }: Props = $props();

  function onMaterialInput(e: Event) {
    const v = (e.target as HTMLInputElement).value;
    onChange({ ...value, material: v });
  }
  function onFormInput(e: Event) {
    const v = (e.target as HTMLInputElement).value;
    onChange({ ...value, form: v });
  }
  function onConstructionTypeInput(e: Event) {
    const v = (e.target as HTMLInputElement).value;
    onChange({ ...value, constructionType: v });
  }
</script>

<div class="qtworow">
  <!-- Label row with single AND separators -->
  <div class="qtworow__labels">
    <div class="qtworow__labelwrap">
      <span class="qtworow__label">{materialLabel}</span>
      <span class="qtworow__and" aria-hidden="true">AND</span>
    </div>
    <div class="qtworow__labelwrap">
      <span class="qtworow__label">{formLabel}</span>
      <span class="qtworow__and" aria-hidden="true">AND</span>
    </div>
    <div class="qtworow__labelwrap">
      <span class="qtworow__label">{constructionTypeLabel}</span>
    </div>
  </div>

  <!-- Inputs row without AND -->
  <div class="qtworow__inputs">
    <label class="qtworow__field">
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
      <input
        type="text"
        class="qtworow__input"
        value={value?.form ?? ''}
        oninput={onFormInput}
        onkeydown={(e) => { if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); } }}
        placeholder="e.g. sphere"
      />
    </label>
    <label class="qtworow__field">
      <input
        type="text"
        class="qtworow__input"
        value={value?.constructionType ?? ''}
        oninput={onConstructionTypeInput}
        onkeydown={(e) => { if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); } }}
        placeholder="e.g. carved"
      />
    </label>
  </div>
</div>

<style>
  .qtworow {
    display: grid;
    gap: 0.25rem 0.75rem;
    align-items: start;
  }
  .qtworow__labels {
    display: grid;
    grid-template-columns: 1fr 1fr 1fr;
    align-items: end;
    gap: 0.75rem;
  }
  .qtworow__labelwrap {
    display: flex;
    align-items: flex-end;
    gap: 0.4rem;
  }
  .qtworow__and {
    align-self: end;
    padding: 0 0.25rem 0.1rem;
    color: var(--color-text-muted, #6c757d);
    font-size: 0.8rem;
    letter-spacing: 0.06em;
    user-select: none;
  }
  .qtworow__label {
    font-size: 0.875rem;
    font-weight: 500;
  }
  .qtworow__inputs {
    display: grid;
    grid-template-columns: 1fr 1fr 1fr;
    gap: 0.75rem;
    align-items: end;
  }
  .qtworow__field {
    display: flex;
    flex-direction: column;
  }
  .qtworow__input {
    width: 100%;
  }
</style>


