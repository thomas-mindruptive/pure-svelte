export function stringsToNumbers(elem: (string | number)[]): number[] {
  return elem.map((item, index) => {
    
    // Wenn es bereits eine Zahl ist, direkt zurückgeben
    if (typeof item === 'number') {
      if (isNaN(item) || !isFinite(item)) {
        throw new Error(`Invalid number at index ${index}: ${item}`);
      }
      return item;
    }
  
    // String-Behandlung
    const trimmed = item.trim();
    if (trimmed === '') {
      throw new Error(`Empty string at index ${index} cannot be converted to number`);
    }
    const num = Number(trimmed);
    if (isNaN(num) || !isFinite(num)) {
      throw new Error(`Invalid number format at index ${index}: "${item}"`);
    }
    
    return num;
  });
}