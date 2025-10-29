// Polyfill for $app/environment in Node.js tools
export const dev = process.env.NODE_ENV !== 'production';
export const building = false;
export const browser = false;