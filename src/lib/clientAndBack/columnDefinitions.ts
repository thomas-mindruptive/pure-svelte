// src/lib/clientAndBack/columnDefinitions.ts
export interface ColumnDefinition {
    key: string;
    title: string;
    sortable?: boolean;
    type?: 'string' | 'number' | 'date';
    // in "fr"
    width?: string;
  };

  export interface ColumnDefinitionInclDB extends ColumnDefinition {
    databaseCol?: string;
  }

  export function extractDbCols(columns: ColumnDefinitionInclDB[]): string[] {
    return columns.map(col => col.databaseCol || col.key);
  }
