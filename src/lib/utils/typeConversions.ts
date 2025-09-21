export function stringsToNumbers(strings: string[]): number[] {
  const result: number[] = [];
  
  for (let i = 0; i < strings.length; i++) {
    const str = strings[i].trim();
    
    if (str === '') {
      throw new Error(`Empty string at index ${i} cannot be converted to number`);
    }
    
    const num = Number(str);
    
    if (isNaN(num)) {
      throw new Error(`Invalid number format at index ${i}: "${strings[i]}"`);
    }
    
    if (!isFinite(num)) {
      throw new Error(`Number out of range at index ${i}: "${strings[i]}"`);
    }
    
    result.push(num);
  }
  
  return result;
}