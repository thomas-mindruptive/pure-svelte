/** The expected structure for a single validation error */
export type ValidationError = {
  path: (string | symbol | number)[];
  message: string;
  code?: string;
};

/** Flat validation errors structure (from z.flattenError) */
export type ValidationErrors = Record<string, string[]>;

/** Tree validation errors structure (converted from z.treeifyError) */
export type ValidationErrorTree = {
  errors?: string[];
  [key: string]: ValidationErrorTree | string[] | undefined;
};
