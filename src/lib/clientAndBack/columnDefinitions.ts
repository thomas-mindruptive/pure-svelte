  export interface ColumnDefinition {
    key: string;
    title: string;
    sortable?: boolean;
    type?: 'string' | 'number' | 'date';
    // in "fr"
    width?: string;
  };

  export interface ColumnDefinitionInclDB extends ColumnDefinition {
    databaseCol: string;
  }

