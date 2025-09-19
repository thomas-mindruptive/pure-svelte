// src/lib/utils/url.ts
export function parseUrlSegments(url: URL | string): string[] {
  try {
    const urlObj = url instanceof URL ? url : new URL(url);
    
    const segments = urlObj.pathname
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