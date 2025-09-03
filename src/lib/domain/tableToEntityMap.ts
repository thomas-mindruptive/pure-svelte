import type { Wholesaler, ProductCategory, WholesalerCategory, WholesalerItemOffering, WholesalerOfferingAttribute, WholesalerOfferingLink, ProductDefinition, Attribute } from "./domainTypes";


export type TableNameToEntityMap = {
  'dbo.wholesalers': Wholesaler;
  'dbo.product_categories': ProductCategory;
  'dbo.wholesaler_categories': WholesalerCategory;
  'dbo.wholesaler_item_offerings': WholesalerItemOffering;
  'dbo.wholesaler_offering_attributes': WholesalerOfferingAttribute;
  'dbo.wholesaler_offering_links': WholesalerOfferingLink;
  'dbo.product_definitions': ProductDefinition;
  'dbo.attributes': Attribute;
};
