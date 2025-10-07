<!-- Using Svelte 5 generics syntax -->
<script generics="T" lang="ts">
	// -----------------------------------------------------------------------------
	// 100% SVELTE 5 WITH RUNES & TYPESCRIPT (Final Robust Build)
	// -----------------------------------------------------------------------------
	// FINAL ATTEMPT: The persistent tooling errors with `$derived` and generics
	// indicate a severe language-server issue. This version abandons the `$derived`
	// rune for `filteredItems` and implements a more explicit, robust pattern using
	// `$state` and `$effect`. This defines the type `T[]` unambiguously, which
	// should resolve the "unknown" type errors in the template once and for all.
	// -----------------------------------------------------------------------------

	type ComboboxProps = {
		items: T[];
		value?: T | null;
		getLabel?: (item: T) => string;
		labelField?: keyof T;
		valueField?: keyof T;
		placeholder?: string;
		label?: string;
	};

	let {
		items,
		value = $bindable(),
		getLabel,
		labelField,
		valueField,
		placeholder = 'Search...',
		label = 'Selection',
	}: ComboboxProps = $props();

	let isOpen = $state(false);
	let searchTerm = $state('');
	let isPositionCalculated = $state(false);

	let containerEl: HTMLDivElement | null = $state(null);
	let dropdownEl: HTMLUListElement | null = $state(null);

	// Using $state and $effect instead of $derived for robustness against tooling errors.
	let filteredItems = $state<T[]>(items);

	$effect(() => {
		const localSearchTerm = searchTerm.toLowerCase();
		if (!localSearchTerm) {
			filteredItems = items;
		} else {
			filteredItems = items.filter((item) =>
				getItemLabel(item).toLowerCase().includes(localSearchTerm)
			);
		}
	});

	function getItemKey(item: T): string | T {
		if (typeof item === 'object' && item && valueField) {
			return item[valueField] as string;
		}
		return item;
	}

	function getItemLabel(item: T | null | undefined): string {
		if (item === null || item === undefined) return '';
		if (getLabel) return getLabel(item);
		if (typeof item === 'object' && labelField) return String(item[labelField] ?? '');
		return String(item);
	}

	function select(item: T) {
		value = item;
		isOpen = false;
	}

	function open() {
		isPositionCalculated = false;
		isOpen = true;
	}

	function close() {
		searchTerm = getItemLabel(value);
		isOpen = false;
	}

	function handleFocus(event: FocusEvent) {
		(event.currentTarget as HTMLInputElement).select();
		open();
	}

	$effect(() => {
		if (isOpen) {
			const handleClickOutside = (event: MouseEvent) => {
				if (containerEl && !containerEl.contains(event.target as Node)) {
					close();
				}
			};
			document.addEventListener('mousedown', handleClickOutside);
			return () => document.removeEventListener('mousedown', handleClickOutside);
		}
	});

	$effect(() => {
		if (isOpen && containerEl && dropdownEl && !isPositionCalculated) {
			const containerRect = containerEl.getBoundingClientRect();
			const spaceBelow = window.innerHeight - containerRect.bottom;
			const dropdownHeight = dropdownEl.offsetHeight;
			if (spaceBelow < dropdownHeight && containerRect.top > dropdownHeight) {
				dropdownEl.classList.add('drop-up');
			} else {
				dropdownEl.classList.remove('drop-up');
			}
			isPositionCalculated = true;
		}
	});

	$effect(() => {
		searchTerm = getItemLabel(value);
	});
</script>

<div class="combobox-container" bind:this={containerEl}>
	<label class="sr-only" for="combobox-input">{label}</label>
	<input
		type="text"
		id="combobox-input"
		class="combobox-input"
		{placeholder}
		bind:value={searchTerm}
		onfocus={handleFocus}
		oninput={open}
		onkeydown={(e) => {
			if (e.key === 'Escape') close();
		}}
		autocomplete="off"
		role="combobox"
		aria-expanded={isOpen}
		aria-controls="combobox-list"
	/>

	{#if isOpen}
		<ul class="dropdown" bind:this={dropdownEl} id="combobox-list" role="listbox">
			<!-- The type of `filteredItems` is now a clear `T[]`, which should resolve all LSP errors. -->
			{#each filteredItems as item (getItemKey(item))}
				<li role="presentation">
					<button
						type="button"
						class="dropdown-item"
						onclick={() => select(item)}
						role="option"
						aria-selected={item === value}
					>
						{getItemLabel(item)}
					</button>
				</li>
			{:else}
				<li class="no-results" role="option" aria-disabled="true" aria-selected="false">
					No results found
				</li>
			{/each}
		</ul>
	{/if}
</div>

<style>
	.combobox-container {
		position: relative;
		width: 300px;
		font-family: system-ui, sans-serif;
	}
	.sr-only {
		position: absolute;
		width: 1px;
		height: 1px;
		padding: 0;
		margin: -1px;
		overflow: hidden;
		clip: rect(0, 0, 0, 0);
		border: 0;
	}
	.combobox-input {
		width: 100%;
		padding: 8px 12px;
		font-size: 16px;
		border: 1px solid #ccc;
		border-radius: 4px;
		box-sizing: border-box;
	}
	.combobox-input:focus {
		outline: none;
		border-color: #007bff;
		box-shadow: 0 0 0 2px rgba(0, 123, 255, 0.25);
	}
	.dropdown {
		position: absolute;
		width: 100%;
		top: 100%;
		left: 0;
		margin-top: 4px;
		padding: 0;
		list-style: none;
		background: white;
		border: 1px solid #ccc;
		border-radius: 4px;
		box-shadow: 0 4px 8px rgba(0, 0, 0, 0.1);
		max-height: 200px;
		overflow-y: auto;
		z-index: 1000;
	}
	/* The svelte-ignore is placed correctly to suppress the static analysis warning. */
	/* svelte-ignore css_unused_selector */
	.dropdown.drop-up {
		top: auto;
		bottom: 100%;
		margin-top: 0;
		margin-bottom: 4px;
	}
	.dropdown li {
		padding: 0;
		margin: 0;
	}
	.dropdown-item {
		all: unset;
		box-sizing: border-box;
		display: block;
		width: 100%;
		padding: 8px 12px;
		text-align: left;
		cursor: pointer;
	}
	.dropdown-item:hover,
	.dropdown-item:focus {
		background-color: #f0f0f0;
	}
	.dropdown .no-results {
		padding: 8px 12px;
		color: #888;
		cursor: default;
	}
</style>