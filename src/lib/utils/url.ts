// src/lib/utils/url.ts

/**
 * Parses URL segments from full URLs or pathnames.
 * Supports both full URLs and pathname.
 * @param url - Full URL (https://...) or pathname (/path/to/resource)
 */
export function parseUrlSegments(url: URL | string): string[] {
  try {
    let pathname: string;
    
    if (url instanceof URL) {
      pathname = url.pathname;
    } else if (url.startsWith('/')) {
      pathname = url; // ist bereits ein pathname
    } else {
      // Vollständige URL - extrahiere pathname
      const urlObj = new URL(url);
      pathname = urlObj.pathname;
    }
    
    const segments = pathname
      .split('/')
      .filter((segment: string): segment is string => segment !== '') 
      .map((segment: string): string => {
        try {
          return decodeURIComponent(segment);
        } catch {
          return segment;
        }
      });
    
    return segments;
  } catch (error) {
    console.error('URL parsing failed:', error);
    return [];
  }
}

/**
 * Returns the parent path by removing the last segment.
 * @param url - URL object or pathname string
 * @returns Parent path (always starts with '/')
 * @example
 * getParentPath('/suppliers/1/orders/new') // '/suppliers/1/orders'
 * getParentPath('/orders') // '/'
 * getParentPath('/') // '/'
 */
export function getParentPath(url: URL | string): string {
  const pathname = typeof url === "string" ? url : url.pathname;
  const parent = pathname.replace(/\/[^\/]+$/, '');
  return parent || '/';
}

  /**
   * Builds a child URL, avoiding duplicate segments when the child key is already present.
   * @param currentPathname - Current URL pathname (e.g. "/suppliers/1" or "/suppliers/1/categories")
   * @param childKey - The child list key (e.g. "categories", "orderitems")
   * @param childSegment - ID or "new" (e.g. "new", "123")
   * @returns Complete child URL without duplicates
   * @example
   * buildChildUrl("/suppliers/1", "categories", "new") → "/suppliers/1/categories/new"
   * buildChildUrl("/suppliers/1/categories", "categories", "new") → "/suppliers/1/categories/new" (kein Duplikat!)
   * buildChildUrl("/suppliers/1/categories", "categories", "5") → "/suppliers/1/categories/5"
   */
  export function buildChildUrl(currentPathname: string, childKey: string, childSegment: string | number): string {
    const segments = currentPathname.split('/').filter(Boolean);
    const lastSegment = segments[segments.length - 1];

    // Wenn childKey bereits letztes Segment ist, nicht doppelt hinzufügen
    if (lastSegment === childKey) {
      return `${currentPathname}/${childSegment}`;
    }

    // Sonst childKey einfügen
    return `${currentPathname}/${childKey}/${childSegment}`;
  }

  /**
   * Builds a sibling URL by replacing the last segment with a new one.
   * Used primarily for navigation after CREATE operations (e.g., /categories/new → /categories/123)
   * @param currentPathname - Current URL pathname
   * @param newSegment - The new segment to replace the last one (e.g., newly created ID)
   * @returns URL with last segment replaced
   * @example
   * buildSiblingUrl("/categories/new", "123") → "/categories/123"
   * buildSiblingUrl("/suppliers/1/orders/new", "456") → "/suppliers/1/orders/456"
   */
  export function buildSiblingUrl(currentPathname: string, newSegment: string | number): string {
    const parent = getParentPath(currentPathname);
    return `${parent}/${newSegment}`;
  }