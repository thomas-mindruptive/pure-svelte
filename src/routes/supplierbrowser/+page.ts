// routes/supplierbrowser/+page.ts
import type { PageLoad } from './$types';

export const load: PageLoad = async () => {
  // Dummy data - in a real app this would come from your API/database
  
  const wholesalers = [
    { wholesaler_id: 1, name: "Global Tech Supply", region: "USA", status: "active", dropship: true },
    { wholesaler_id: 2, name: "Euro Electronics", region: "Germany", status: "active", dropship: false },
    { wholesaler_id: 3, name: "Asia Components Ltd", region: "China", status: "inactive", dropship: true },
    { wholesaler_id: 4, name: "Nordic Supplies", region: "Sweden", status: "active", dropship: true },
    { wholesaler_id: 5, name: "South Tech Corp", region: "Australia", status: "active", dropship: false },
  ];

  const categories = [
    { category_id: 1, wholesaler_id: 1, name: "Laptops", description: "Portable computers and notebooks" },
    { category_id: 2, wholesaler_id: 1, name: "Smartphones", description: "Mobile phones and devices" },
    { category_id: 3, wholesaler_id: 1, name: "Accessories", description: "Tech accessories and peripherals" },
    { category_id: 4, wholesaler_id: 2, name: "Tablets", description: "Tablet computers and e-readers" },
    { category_id: 5, wholesaler_id: 2, name: "Gaming", description: "Gaming equipment and consoles" },
    { category_id: 6, wholesaler_id: 2, name: "Audio", description: "Headphones and speakers" },
    { category_id: 7, wholesaler_id: 3, name: "Components", description: "Electronic components" },
    { category_id: 8, wholesaler_id: 3, name: "Cables", description: "Various cables and connectors" },
  ];

  const itemOfferings = [
    // Global Tech Supply - Laptops
    { offering_id: 1, category_id: 1, product_name: "MacBook Pro 14\"", price: 1999.99, stock: 25, status: "active" },
    { offering_id: 2, category_id: 1, product_name: "Dell XPS 13", price: 1299.99, stock: 15, status: "active" },
    { offering_id: 3, category_id: 1, product_name: "ThinkPad X1 Carbon", price: 1599.99, stock: 8, status: "active" },
    
    // Global Tech Supply - Smartphones  
    { offering_id: 4, category_id: 2, product_name: "iPhone 15 Pro", price: 999.99, stock: 50, status: "active" },
    { offering_id: 5, category_id: 2, product_name: "Samsung Galaxy S24", price: 899.99, stock: 30, status: "active" },
    
    // Global Tech Supply - Accessories
    { offering_id: 6, category_id: 3, product_name: "USB-C Hub", price: 49.99, stock: 100, status: "active" },
    { offering_id: 7, category_id: 3, product_name: "Wireless Mouse", price: 29.99, stock: 75, status: "active" },
    
    // Euro Electronics - Tablets
    { offering_id: 8, category_id: 4, product_name: "iPad Air", price: 599.99, stock: 20, status: "active" },
    { offering_id: 9, category_id: 4, product_name: "Surface Pro 9", price: 999.99, stock: 12, status: "active" },
    
    // Euro Electronics - Gaming
    { offering_id: 10, category_id: 5, product_name: "PlayStation 5", price: 499.99, stock: 5, status: "active" },
    { offering_id: 11, category_id: 5, product_name: "Xbox Series X", price: 499.99, stock: 7, status: "active" },
    
    // Asia Components - Components
    { offering_id: 12, category_id: 7, product_name: "Arduino Uno R3", price: 24.99, stock: 200, status: "active" },
    { offering_id: 13, category_id: 7, product_name: "Raspberry Pi 4", price: 75.99, stock: 150, status: "active" },
  ];

  const attributes = [
    // MacBook Pro attributes
    { attribute_id: 1, offering_id: 1, name: "Color", value: "Space Gray", category: "Physical" },
    { attribute_id: 2, offering_id: 1, name: "RAM", value: "16GB", category: "Technical" },
    { attribute_id: 3, offering_id: 1, name: "Storage", value: "512GB SSD", category: "Technical" },
    { attribute_id: 4, offering_id: 1, name: "Processor", value: "M3 Pro", category: "Technical" },
    { attribute_id: 5, offering_id: 1, name: "Weight", value: "1.6kg", category: "Physical" },
    
    // Dell XPS 13 attributes
    { attribute_id: 6, offering_id: 2, name: "Color", value: "Silver", category: "Physical" },
    { attribute_id: 7, offering_id: 2, name: "RAM", value: "16GB", category: "Technical" },
    { attribute_id: 8, offering_id: 2, name: "Storage", value: "256GB SSD", category: "Technical" },
    { attribute_id: 9, offering_id: 2, name: "Processor", value: "Intel i7-1355U", category: "Technical" },
    
    // iPhone 15 Pro attributes
    { attribute_id: 10, offering_id: 4, name: "Color", value: "Natural Titanium", category: "Physical" },
    { attribute_id: 11, offering_id: 4, name: "Storage", value: "128GB", category: "Technical" },
    { attribute_id: 12, offering_id: 4, name: "Screen Size", value: "6.1 inch", category: "Technical" },
    { attribute_id: 13, offering_id: 4, name: "Camera", value: "48MP Main", category: "Technical" },
    
    // USB-C Hub attributes
    { attribute_id: 14, offering_id: 6, name: "Ports", value: "4x USB-A, 2x USB-C", category: "Technical" },
    { attribute_id: 15, offering_id: 6, name: "Color", value: "Space Gray", category: "Physical" },
    { attribute_id: 16, offering_id: 6, name: "Material", value: "Aluminum", category: "Physical" },
  ];

  const offeringLinks = [
    // MacBook Pro links
    { link_id: 1, offering_id: 1, url: "https://apple.com/macbook-pro", type: "Product Page", description: "Official Apple product page" },
    { link_id: 2, offering_id: 1, url: "https://support.apple.com/macbook-pro", type: "Support", description: "Apple support documentation" },
    { link_id: 3, offering_id: 1, url: "https://apple.com/macbook-pro/specs", type: "Specifications", description: "Technical specifications" },
    
    // Dell XPS 13 links
    { link_id: 4, offering_id: 2, url: "https://dell.com/xps13", type: "Product Page", description: "Dell official product page" },
    { link_id: 5, offering_id: 2, url: "https://dell.com/support/xps13", type: "Support", description: "Dell support resources" },
    
    // iPhone 15 Pro links
    { link_id: 6, offering_id: 4, url: "https://apple.com/iphone", type: "Product Page", description: "iPhone product page" },
    { link_id: 7, offering_id: 4, url: "https://apple.com/iphone/specs", type: "Specifications", description: "iPhone technical specs" },
    { link_id: 8, offering_id: 4, url: "https://apple.com/support/iphone", type: "Support", description: "iPhone support" },
    
    // USB-C Hub links  
    { link_id: 9, offering_id: 6, url: "https://example.com/usb-hub-manual.pdf", type: "Documentation", description: "User manual PDF" },
    { link_id: 10, offering_id: 6, url: "https://example.com/usb-hub-warranty", type: "Support", description: "Warranty information" },
  ];

  // Return all the dummy data
  return {
    wholesalers,
    categories, 
    itemOfferings,
    attributes,
    offeringLinks
  };
};