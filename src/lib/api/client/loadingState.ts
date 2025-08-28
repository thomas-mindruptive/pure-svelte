import { writable, derived, type Readable } from 'svelte/store';

/**
 * A reactive loading state manager using Svelte 5 stores.
 * Manages loading states for multiple concurrent API operations with full reactivity.
 */
export class LoadingState {
	private operationsStore = writable(new Set<string>());
	
	// Public reactive store for components to subscribe to
	public isLoadingStore: Readable<boolean> = derived(
		this.operationsStore, 
		$operations => $operations.size > 0
	);
	
	// Public reactive store for operation-specific loading
	public operationsReadable: Readable<Set<string>> = { subscribe: this.operationsStore.subscribe };

	/** Marks an operation as started. */
	start(operationId: string) { 
		this.operationsStore.update(operations => {
			const newOperations = new Set(operations);
			newOperations.add(operationId);
			return newOperations;
		});
	}

	/** Marks an operation as finished. */
	finish(operationId: string) { 
		this.operationsStore.update(operations => {
			const newOperations = new Set(operations);
			newOperations.delete(operationId);
			return newOperations;
		});
	}

	/** Returns true if any operation is currently in progress (non-reactive). */
	get isLoading(): boolean { 
		let current = false;
		// Get current value without subscribing
		this.isLoadingStore.subscribe(value => { current = value; })();
		return current;
	}

	/** Returns true if a specific operation is in progress (non-reactive). */
	isOperationLoading(operationId: string): boolean {
		let current = new Set<string>();
		this.operationsStore.subscribe(value => { current = value; })();
		return current.has(operationId);
	}

	/** 
	 * Legacy subscribe method for backward compatibility.
	 * @deprecated Use isLoadingStore.subscribe() directly for better performance
	 */
	subscribe(callback: () => void): () => void {
		return this.isLoadingStore.subscribe(() => callback());
	}
}

// ... rest of common.ts remains unchanged