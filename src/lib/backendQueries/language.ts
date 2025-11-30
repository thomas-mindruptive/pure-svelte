/**
 * Supported language codes for translation tables.
 * 
 * These codes correspond to the suffix in translation table names,
 * e.g., 'en' for materials_en, 'fr' for materials_fr, etc.
 */
export type LanguageCode = 'en' | 'fr' | 'de' | 'es' | 'it' | 'pt' | 'nl' | 'pl' | 'ru' | 'zh' | 'ja' | 'ko';

/**
 * Union type for language codes (can be extended as needed).
 * 
 * @example
 * const lang: LanguageCode = 'en';
 * const tableName = `materials_${lang}`; // 'materials_en'
 */
export const LANGUAGE_CODES = ['en', 'fr', 'de', 'es', 'it', 'pt', 'nl', 'pl', 'ru', 'zh', 'ja', 'ko'] as const;

/**
 * Validates if a string is a valid language code.
 * 
 * @param code - The string to validate
 * @returns True if the code is a valid language code
 */
export function isValidLanguageCode(code: string): code is LanguageCode {
  return LANGUAGE_CODES.includes(code as LanguageCode);
}

