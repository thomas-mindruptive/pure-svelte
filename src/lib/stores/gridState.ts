// Grid State Manager - localStorage persistence for filter, sort, and UI state

import type { WhereCondition, WhereConditionGroup, SortDescriptor } from '$lib/backendQueries/queryGrammar';

export type GridStateData<T = any> = {
  version: number;
  filters: WhereCondition<T> | WhereConditionGroup<T> | null;
  sort: SortDescriptor<T>[] | null;
  ui: {
    filterExpanded?: boolean;
    columnWidths?: Record<string, string>;
    pageSize?: number;
  };
};

export class GridStateManager<T = any> {
  private gridId: string;
  private version = 1;
  private key: string;

  constructor(gridId: string) {
    this.gridId = gridId;
    this.key = `grid:${gridId}`;
  }

  /**
   * Load complete state from localStorage
   */
  load(): GridStateData<T> {
    try {
      const stored = localStorage.getItem(this.key);
      if (!stored) return this.getDefaults();

      const parsed: GridStateData<T> = JSON.parse(stored);

      // Migration wenn alte Version
      if (parsed.version < this.version) {
        return this.migrate(parsed);
      }

      return parsed;
    } catch (error) {
      console.error(`Failed to load grid state for ${this.gridId}:`, error);
      return this.getDefaults();
    }
  }

  /**
   * Save complete or partial state to localStorage
   */
  save(state: Partial<GridStateData<T>>): void {
    try {
      const current = this.load();
      const merged = { ...current, ...state, version: this.version };
      localStorage.setItem(this.key, JSON.stringify(merged));
    } catch (error) {
      console.error(`Failed to save grid state for ${this.gridId}:`, error);
    }
  }

  /**
   * Save filters
   */
  saveFilters(filters: GridStateData<T>['filters']): void {
    this.save({ filters });
  }

  /**
   * Save sort
   */
  saveSort(sort: GridStateData<T>['sort']): void {
    this.save({ sort });
  }

  /**
   * Save UI state (merged with existing UI state)
   */
  saveUI(ui: Partial<GridStateData<T>['ui']>): void {
    const current = this.load();
    this.save({ ui: { ...current.ui, ...ui } });
  }

  /**
   * Clear all state for this grid
   */
  clear(): void {
    try {
      localStorage.removeItem(this.key);
    } catch (error) {
      console.error(`Failed to clear grid state for ${this.gridId}:`, error);
    }
  }

  /**
   * Get default state
   */
  private getDefaults(): GridStateData<T> {
    return {
      version: this.version,
      filters: null,
      sort: null,
      ui: { filterExpanded: true }
    };
  }

  /**
   * Migrate old state versions to current version
   */
  private migrate(old: GridStateData<T>): GridStateData<T> {
    // Future migration logic goes here
    // For now, just return with updated version
    return {
      ...old,
      version: this.version
    };
  }
}

/**
 * Factory function to create a grid state manager
 */
export function createGridState<T = any>(gridId: string): GridStateManager<T> {
  return new GridStateManager<T>(gridId);
}
