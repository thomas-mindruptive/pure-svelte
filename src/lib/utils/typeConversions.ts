export function stringsToNumbers(elem: (string | number)[]): number[] {
  return elem.map((item, index) => {
    
    // Already number
    if (typeof item === 'number') {
      if (isNaN(item) || !isFinite(item)) {
        throw new Error(`stringsToNumbers: Invalid number at index ${index}: ${item}`);
      }
      return item;
    }
  
    // String
    const trimmed = item.trim();
    if (trimmed === '') {
      throw new Error(`stringsToNumbers: Empty string at index ${index} cannot be converted to number`);
    }
    const num = Number(trimmed);
    if (isNaN(num) || !isFinite(num)) {
      throw new Error(`stringsToNumbers: Invalid number format at index ${index}: "${item}"`);
    }
    
    return num;
  });
}