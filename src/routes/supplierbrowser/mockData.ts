import type {
    Wholesaler,
    ProductCategory,
    WholesalerItemOffering_ProductDef_Category,
    WholesalerCategoryWithCount,
    WholesalerOfferingAttribute_Attribute
} from "$lib/domain/domainTypes";


export type MockData = {
    wholesalers: Wholesaler[];
    assignedCategories: { [key: number]: WholesalerCategoryWithCount[] };
    allCategories: ProductCategory[];
    wholesalerItemOfferings: WholesalerItemOffering_ProductDef_Category[];
    wholesalerItemOfferingsAttributes: WholesalerOfferingAttribute_Attribute[];
};

// ===== MOCK DATA =====
export const mockData: MockData = {
    wholesalers: [
        {
            wholesaler_id: 1,
            name: "Global Tech Supply",
            region: "USA",
            status: "active",
            dropship: true,
            website: "https://globaltech.example",
            created_at: "2024-01-15T10:00:00Z",
        },
        {
            wholesaler_id: 2,
            name: "Euro Electronics",
            region: "Germany",
            status: "new",
            dropship: false,
            website: "https://euroelec.example",
            created_at: "2024-02-20T14:30:00Z",
        },
        {
            wholesaler_id: 3,
            name: "Asia Components Ltd",
            region: "China",
            status: "inactive",
            dropship: true,
            website: "https://asiacomp.example",
            created_at: "2024-01-05T08:15:00Z",
        },
    ],

    assignedCategories: {
        1: [
            {
                wholesaler_id: 1,
                category_id: 1,
                category_name: "Laptops",
                comment: "High demand products",
                link: "https://example.com/laptops",
                created_at: "2024-01-16T10:00:00Z",
                offering_count: 15,
            },
            {
                wholesaler_id: 1,
                category_id: 2,
                category_name: "Smartphones",
                comment: "Fast moving inventory",
                created_at: "2024-01-17T10:00:00Z",
                offering_count: 25,
            },
        ],
        2: [
            {
                wholesaler_id: 2,
                category_id: 4,
                category_name: "Tablets",
                comment: "European market focus",
                created_at: "2024-02-21T14:30:00Z",
                offering_count: 8,
            },
            {
                wholesaler_id: 2,
                category_id: 5,
                category_name: "Gaming Equipment",
                comment: "Growing segment",
                link: "https://example.com/gaming",
                created_at: "2024-02-22T14:30:00Z",
                offering_count: 12,
            },
        ],
        3: [
            {
                wholesaler_id: 3,
                category_id: 3,
                category_name: "Accessories",
                comment: "Various tech accessories",
                created_at: "2024-01-06T08:15:00Z",
                offering_count: 45,
            },
        ],
    },

    wholesalerItemOfferings: [
        { offering_id: 1, wholesaler_id: 1, product_def_id: 1, category_id: 1, price: 10.5, product_def_title: "Laptop", product_def_description: "HP Business", currency: "USD", size: "15 inch", dimensions: "15x10x1 inch", comment: "laptop", created_at: "2024-01-16T10:00:00Z" },
        { offering_id: 2, wholesaler_id: 1, product_def_id: 1, category_id: 1, price: 10.5, product_def_title: "Laptop", product_def_description: "HP Business", currency: "USD", size: "10 inch", dimensions: "15x10x1 inch", comment: "laptop", created_at: "2024-01-16T10:00:00Z" },
        { offering_id: 3, wholesaler_id: 2, product_def_id: 1, category_id: 1, price: 10.5, product_def_title: "Laptop", product_def_description: "HP Business", currency: "USD", size: "15 inch", dimensions: "15x10x1 inch", comment: "laptop", created_at: "2024-01-16T10:00:00Z" },
        { offering_id: 4, wholesaler_id: 2, product_def_id: 1, category_id: 1, price: 10.5, product_def_title: "Laptop", product_def_description: "HP Business", currency: "USD", size: "13 inch", dimensions: "15x10x1 inch", comment: "High-end laptop", created_at: "2024-01-16T10:00:00Z" },
        { offering_id: 5, wholesaler_id: 3, product_def_id: 1, category_id: 1, price: 10.5, product_def_title: "Laptop", product_def_description: "HP Business", currency: "USD", size: "13 inch", dimensions: "15x10x1 inch", comment: "High-end laptop", created_at: "2024-01-16T10:00:00Z" },
        { offering_id: 6, wholesaler_id: 3, product_def_id: 1, category_id: 1, price: 10.5, product_def_title: "Laptop", product_def_description: "HP Business", currency: "USD", size: "13 inch", dimensions: "15x10x1 inch", comment: "High-end laptop", created_at: "2024-01-16T10:00:00Z" },
    ],

    wholesalerItemOfferingsAttributes: [
        { offering_id: 1, attribute_id: 1, value: "16GB RAM", attribute_name: "RAM", attribute_description: "The amount of RAM in the laptop" },
        { offering_id: 1, attribute_id: 2, value: "512GB SSD", attribute_name: "Storage", attribute_description: "The storage capacity of the laptop" },
        { offering_id: 2, attribute_id: 1, value: "8GB RAM", attribute_name: "RAM", attribute_description: "The amount of RAM in the laptop" },
        { offering_id: 2, attribute_id: 2, value: "256GB SSD", attribute_name: "Storage", attribute_description: "The storage capacity of the laptop" },
        { offering_id: 3, attribute_id: 1, value: "32GB RAM", attribute_name: "RAM", attribute_description: "The amount of RAM in the laptop" },
        { offering_id: 3, attribute_id: 2, value: "1TB SSD", attribute_name: "Storage", attribute_description: "The storage capacity of the laptop" },
        { offering_id: 4, attribute_id: 1, value: "32GB RAM", attribute_name: "RAM", attribute_description: "The amount of RAM in the laptop" },
        { offering_id: 4, attribute_id: 2, value: "1TB SSD", attribute_name: "Storage", attribute_description: "The storage capacity of the laptop" },
        { offering_id: 4, attribute_id: 1, value: "32GB RAM", attribute_name: "RAM", attribute_description: "The amount of RAM in the laptop" },
        { offering_id: 4, attribute_id: 2, value: "1TB SSD", attribute_name: "Storage", attribute_description: "The storage capacity of the laptop" },
        { offering_id: 5, attribute_id: 1, value: "32GB RAM", attribute_name: "RAM", attribute_description: "The amount of RAM in the laptop" },
        { offering_id: 5, attribute_id: 2, value: "1TB SSD", attribute_name: "Storage", attribute_description: "The storage capacity of the laptop" },
        { offering_id: 6, attribute_id: 1, value: "32GB RAM", attribute_name: "RAM", attribute_description: "The amount of RAM in the laptop" },
        { offering_id: 6, attribute_id: 2, value: "1TB SSD", attribute_name: "Storage", attribute_description: "The storage capacity of the laptop" },
    ],

    // 🆕 ALL available categories in the system
    allCategories: [
        { category_id: 1, name: "Laptops", description: "Portable computers" },
        { category_id: 2, name: "Smartphones", description: "Mobile phones" },
        { category_id: 3, name: "Accessories", description: "Tech accessories" },
        { category_id: 4, name: "Tablets", description: "Tablet computers" },
        { category_id: 5, name: "Gaming Equipment", description: "Gaming gear" },
        { category_id: 6, name: "Audio", description: "Headphones and speakers" },
    ],
}



export default mockData;