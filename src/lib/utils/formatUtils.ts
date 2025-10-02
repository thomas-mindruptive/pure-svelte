
/**
 * Sanitize HTML without DOM parsing.
 * 
 * - Keeps only whitelisted tags
 * - Keeps only whitelisted attributes
 * - Removes dangerous URL schemes
 */
export function sanitizeHtml(input: string): string {
  // Whitelisted tags
  const allowedTags = new Set([
    "b", "i", "em", "strong", "u",
    "p", "br", "ul", "ol", "li",
    "blockquote", "code", "pre",
    "h1", "h2", "h3",
    "a"
  ]);

  // Whitelisted attributes per tag
  const allowedAttrs: Record<string, string[]> = {
    a: ["href", "title"],
  };

  // 1. Remove dangerous tags entirely
  let out = input.replace(/<\/?(script|style|iframe|object|embed)[^>]*>/gi, "");

  // 2. Process all tags
  out = out.replace(
    /<([^>\s/]+)([^>]*)>/gi,
    (match: string, tag: string, attrs: string): string => {
      const tagName = tag.toLowerCase();

      // Drop disallowed tags
      if (!allowedTags.has(tagName)) return "";

      let safeAttrs = "";
      const attrWhitelist = allowedAttrs[tagName] || [];

      attrs.replace(
        /([a-z0-9-]+)\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi,
        (m: string, name: string, value: string): string => {
          const attrName = name.toLowerCase();

          // Skip non-whitelisted attributes
          if (!attrWhitelist.includes(attrName)) return "";

          // Strip surrounding quotes
          const cleanValue = value.replace(/^['"]|['"]$/g, "");

          // Skip dangerous schemes
          if (/^(javascript:|data:|vbscript:)/i.test(cleanValue)) return "";

          safeAttrs += ` ${attrName}="${cleanValue}"`;
          return "";
        }
      );

      return `<${tagName}${safeAttrs}>`;
    }
  );

  return out;
}

/**
 * Convert string to HTML. 
 * Converts newLines to <br>.
 * @param str 
 * @returns 
 */
export function convertToHtml(str: string | undefined) {
    if (!str) return "undefined";
    // NOTE: Use this only if you need more than keeping whitespaces, newlines etc.:
    //   const replaced = str.replace(/\n/g, "<br>")
    // "<pre>" keeps whitespaces, tabs, and newlines.
    const res= `<pre>${sanitizeHtml(str)}</pre>`;
    return res;
}

export function stringifyForHtml(thing: unknown) {
    const json = JSON.stringify(thing, null, 4);
    const hmtl = convertToHtml(json);
    return hmtl;
}

  /**
   * Formats an ISO date string to YYYY-MM-DD for HTML5 date input
   */
  export function formatDateForInput(dateString: string | null | undefined): string {
    if (!dateString) return "";
    return new Date(dateString).toISOString().split('T')[0];
  }

  /**
   * Converts YYYY-MM-DD to ISO string for API consistency
   */
  export function formatDateForApi(dateString: string): string {
    if (!dateString) return "";
    // Create date at midnight UTC
    return new Date(dateString + 'T00:00:00.000Z').toISOString();
  }

