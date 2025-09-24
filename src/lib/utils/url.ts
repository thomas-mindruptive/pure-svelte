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