/** The expected structure for a single validation error */
export type ValidationError = {
  path: (string | symbol | number)[];
  message: string;
  code?: string;
};
