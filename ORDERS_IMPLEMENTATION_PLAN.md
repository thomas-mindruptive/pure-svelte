# Orders Entity - Vollständiger Implementierungsplan (Schritt 1: Top-Level)

## VOLLSTÄNDIGER IMPLEMENTATION GUIDE

### **1. Database Schema (DDL Ergänzung zu ../pureenergy-schema/DDL.sql)**

**Am Anfang bei DROP Statements hinzufügen:**
```sql
DROP TABLE IF EXISTS dbo.order_items;
DROP TABLE IF EXISTS dbo.orders;
```

**Orders Tabellen hinzufügen:**
```sql
------------------------------------------------------------
-- Orders (Master Data)
------------------------------------------------------------
CREATE TABLE dbo.orders (
  order_id INT IDENTITY(1,1) PRIMARY KEY,
  order_date DATE NOT NULL,
  order_number NVARCHAR(100) NULL,
  status NVARCHAR(50) NOT NULL
    CHECK (status IN ('pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled')),

  -- Customer Information
  customer_name NVARCHAR(200) NULL,
  customer_email NVARCHAR(200) NULL,
  customer_phone NVARCHAR(50) NULL,

  -- Supplier Information (optional - order can be independent)
  supplier_id INT NULL,
  supplier_contact NVARCHAR(200) NULL,

  -- Financial Information
  subtotal_amount DECIMAL(18,2) NULL,
  tax_amount DECIMAL(18,2) NULL,
  shipping_amount DECIMAL(18,2) NULL,
  discount_amount DECIMAL(18,2) NULL,
  total_amount DECIMAL(18,2) NULL,
  currency CHAR(3) NULL DEFAULT('EUR'),

  -- Shipping Information
  shipping_address NVARCHAR(500) NULL,
  shipping_city NVARCHAR(100) NULL,
  shipping_postal_code NVARCHAR(20) NULL,
  shipping_country NVARCHAR(100) NULL,
  shipping_method NVARCHAR(100) NULL,
  expected_delivery_date DATE NULL,
  actual_delivery_date DATE NULL,

  -- Payment Information
  payment_status NVARCHAR(50) NULL
    CHECK (payment_status IN ('unpaid', 'partial', 'paid', 'refunded', 'cancelled') OR payment_status IS NULL),
  payment_method NVARCHAR(50) NULL,
  payment_date DATE NULL,
  payment_reference NVARCHAR(200) NULL,

  -- Order Processing
  priority NVARCHAR(20) NULL
    CHECK (priority IN ('low', 'normal', 'high', 'urgent') OR priority IS NULL)
    DEFAULT('normal'),
  assigned_to NVARCHAR(100) NULL, -- Employee or department handling the order

  -- Metadata
  notes NVARCHAR(1000) NULL,
  internal_notes NVARCHAR(1000) NULL, -- Not visible to customer
  tags NVARCHAR(500) NULL, -- JSON array or comma-separated tags
  source NVARCHAR(50) NULL, -- 'web', 'phone', 'email', 'api', etc.

  created_at DATETIME2(3) NOT NULL DEFAULT SYSUTCDATETIME(),
  updated_at DATETIME2(3) NOT NULL DEFAULT SYSUTCDATETIME(),

  -- Foreign Keys
  CONSTRAINT FK_orders_supplier FOREIGN KEY (supplier_id)
    REFERENCES dbo.wholesalers(wholesaler_id)
);

------------------------------------------------------------
-- Order Items (1:n zu Orders)
------------------------------------------------------------
CREATE TABLE dbo.order_items (
  order_item_id INT IDENTITY(1,1) PRIMARY KEY,
  order_id INT NOT NULL,

  -- Product Reference (flexible - can link to offerings or be standalone)
  offering_id INT NULL, -- Optional FK zu wholesaler_item_offerings
  product_name NVARCHAR(200) NOT NULL, -- Always required, even if offering_id is set
  product_sku NVARCHAR(100) NULL,
  product_description NVARCHAR(500) NULL,

  -- Quantity and Pricing
  quantity INT NOT NULL DEFAULT(1) CHECK (quantity > 0),
  unit_price DECIMAL(18,2) NOT NULL CHECK (unit_price >= 0),
  line_total DECIMAL(18,2) NULL, -- Calculated field, can be null and computed
  discount_amount DECIMAL(18,2) NULL DEFAULT(0) CHECK (discount_amount >= 0),
  tax_rate DECIMAL(5,4) NULL, -- e.g., 0.1900 for 19%
  tax_amount DECIMAL(18,2) NULL,

  -- Product Details
  unit_of_measure NVARCHAR(20) NULL DEFAULT('pcs'), -- 'pcs', 'kg', 'm', 'l', etc.
  weight DECIMAL(10,3) NULL, -- For shipping calculations
  dimensions NVARCHAR(100) NULL, -- LxWxH format

  -- Item Status
  item_status NVARCHAR(50) NULL
    CHECK (item_status IN ('pending', 'confirmed', 'backordered', 'shipped', 'delivered', 'cancelled', 'returned') OR item_status IS NULL)
    DEFAULT('pending'),
  expected_ship_date DATE NULL,
  actual_ship_date DATE NULL,

  -- References and Notes
  item_notes NVARCHAR(500) NULL,
  supplier_item_code NVARCHAR(100) NULL, -- Supplier's internal code
  manufacturer_part_number NVARCHAR(100) NULL,

  created_at DATETIME2(3) NOT NULL DEFAULT SYSUTCDATETIME(),
  updated_at DATETIME2(3) NOT NULL DEFAULT SYSUTCDATETIME(),

  -- Foreign Keys
  CONSTRAINT FK_order_items_order FOREIGN KEY (order_id)
    REFERENCES dbo.orders(order_id) ON DELETE CASCADE,
  CONSTRAINT FK_order_items_offering FOREIGN KEY (offering_id)
    REFERENCES dbo.wholesaler_item_offerings(offering_id)
);

------------------------------------------------------------
-- Order Status History (Track status changes)
------------------------------------------------------------
CREATE TABLE dbo.order_status_history (
  history_id INT IDENTITY(1,1) PRIMARY KEY,
  order_id INT NOT NULL,
  old_status NVARCHAR(50) NULL,
  new_status NVARCHAR(50) NOT NULL,
  changed_by NVARCHAR(100) NULL, -- User who made the change
  change_reason NVARCHAR(500) NULL,
  created_at DATETIME2(3) NOT NULL DEFAULT SYSUTCDATETIME(),

  CONSTRAINT FK_order_status_history_order FOREIGN KEY (order_id)
    REFERENCES dbo.orders(order_id) ON DELETE CASCADE
);

------------------------------------------------------------
-- Order Documents (Invoices, Receipts, etc.)
------------------------------------------------------------
CREATE TABLE dbo.order_documents (
  document_id INT IDENTITY(1,1) PRIMARY KEY,
  order_id INT NOT NULL,
  document_type NVARCHAR(50) NOT NULL
    CHECK (document_type IN ('invoice', 'receipt', 'shipping_label', 'return_label', 'contract', 'other')),
  file_name NVARCHAR(255) NOT NULL,
  file_path NVARCHAR(500) NOT NULL,
  file_size_bytes BIGINT NULL,
  mime_type NVARCHAR(100) NULL,
  description NVARCHAR(500) NULL,
  uploaded_by NVARCHAR(100) NULL,
  created_at DATETIME2(3) NOT NULL DEFAULT SYSUTCDATETIME(),

  CONSTRAINT FK_order_documents_order FOREIGN KEY (order_id)
    REFERENCES dbo.orders(order_id) ON DELETE CASCADE
);

-- Performance Indexes
CREATE INDEX IX_orders_date ON dbo.orders(order_date);
CREATE INDEX IX_orders_status ON dbo.orders(status);
CREATE INDEX IX_orders_supplier ON dbo.orders(supplier_id);
CREATE INDEX IX_orders_customer_email ON dbo.orders(customer_email);
CREATE INDEX IX_orders_payment_status ON dbo.orders(payment_status);
CREATE INDEX IX_orders_priority ON dbo.orders(priority);
CREATE INDEX IX_orders_created_at ON dbo.orders(created_at);

CREATE INDEX IX_order_items_order ON dbo.order_items(order_id);
CREATE INDEX IX_order_items_offering ON dbo.order_items(offering_id);
CREATE INDEX IX_order_items_status ON dbo.order_items(item_status);
CREATE INDEX IX_order_items_sku ON dbo.order_items(product_sku);
CREATE INDEX IX_order_items_ship_date ON dbo.order_items(expected_ship_date);

CREATE INDEX IX_order_status_history_order ON dbo.order_status_history(order_id);
CREATE INDEX IX_order_status_history_created ON dbo.order_status_history(created_at);

CREATE INDEX IX_order_documents_order ON dbo.order_documents(order_id);
CREATE INDEX IX_order_documents_type ON dbo.order_documents(document_type);

-- Computed Column for line_total (optional - can be calculated in application)
ALTER TABLE dbo.order_items ADD line_total_computed AS
  (quantity * unit_price - ISNULL(discount_amount, 0)) PERSISTED;

-- Trigger to update updated_at columns
CREATE TRIGGER TR_orders_updated_at
ON dbo.orders
AFTER UPDATE
AS
BEGIN
  SET NOCOUNT ON;
  UPDATE dbo.orders
  SET updated_at = SYSUTCDATETIME()
  FROM inserted
  WHERE dbo.orders.order_id = inserted.order_id;
END;

CREATE TRIGGER TR_order_items_updated_at
ON dbo.order_items
AFTER UPDATE
AS
BEGIN
  SET NOCOUNT ON;
  UPDATE dbo.order_items
  SET updated_at = SYSUTCDATETIME()
  FROM inserted
  WHERE dbo.order_items.order_item_id = inserted.order_item_id;
END;
```

### **2. Zod Schemas (src/lib/domain/domainTypes.ts)**

**AllEntitiesSchema erweitern:**
```typescript
export const AllEntitiesSchema = z.enum(["wholesalers", "categories", "product_definitions", "offerings", "attributes", "links", "orders"]).describe("AllEntitiesSchema");
```

**Order Schemas hinzufügen:**
```typescript
// ===== ORDER (dbo.orders) =====
export const OrderStatusSchema = z.enum(["pending", "confirmed", "processing", "shipped", "delivered", "cancelled"]).describe("OrderStatusSchema");

export type OrderStatus = z.infer<typeof OrderStatusSchema>;

export const OrderSchema = z.object({
  order_id: z.number().int().positive(),
  order_date: z.string(), // ISO date string
  order_number: z.string().max(100).nullable().optional(),
  status: OrderStatusSchema,
  total_amount: z.number().multipleOf(0.01).nullable().optional(),
  currency: z.string().length(3).nullable().optional(),
  notes: z.string().max(1000).nullable().optional(),
  created_at: z.string().optional(),
}).describe("OrderSchema");

export const OrderForCreateSchema = OrderSchema.omit({
  order_id: true,
  created_at: true,
}).describe("OrderForCreateSchema");

// ===== ORDER ITEM (dbo.order_items) =====
export const OrderItemSchema = z.object({
  order_item_id: z.number().int().positive(),
  order_id: z.number().int().positive(),
  offering_id: z.number().int().positive().nullable().optional(),
  quantity: z.number().int().positive().default(1),
  unit_price: z.number().multipleOf(0.01),
  line_total: z.number().multipleOf(0.01).nullable().optional(),
  item_notes: z.string().max(500).nullable().optional(),
  created_at: z.string().optional(),
}).describe("OrderItemSchema");

export const OrderItemForCreateSchema = OrderItemSchema.omit({
  order_item_id: true,
  created_at: true,
}).describe("OrderItemForCreateSchema");
```

### **3. Schema-basierte Query Validation (src/lib/backendQueries/queryBuilder.ts)**

**Current System Analysis:**
- QueryBuilder currently validates aliases and table names via `aliasedTablesConfig`
- Column validation happens at compile-time through TypeScript's type system
- `QueryPayload<T>` uses `select: Array<keyof T | AllQualifiedColumns | AllAliasedColumns>`
- No runtime column validation against schemas currently exists
- `allowedTables` in queryConfig is only used for table-level permission checking

**Problem:**
- Duplicate maintenance between Zod schemas and queryConfig column lists
- No runtime validation that SELECT columns exist in target schema
- queryConfig.allowedTables hardcodes column names that are already defined in Zod schemas

**Proposed Solution:** Add runtime schema validation to QueryBuilder

```typescript
// Schema-to-Table Mapping in queryBuilder.ts
import { AllSchemas } from '$lib/domain/domainTypes';
import type { TableNameToEntityMap } from '$lib/domain/tableToEntityMap';

const SCHEMA_TABLE_MAP = {
  "dbo.orders": AllSchemas.orders,
  "dbo.order_items": AllSchemas.order_items,
  "dbo.wholesalers": AllSchemas.wholesalers,
  "dbo.product_categories": AllSchemas.categories,
  "dbo.product_definitions": AllSchemas.product_definitions,
  "dbo.wholesaler_item_offerings": AllSchemas.offerings,
  "dbo.attributes": AllSchemas.attributes,
  "dbo.wholesaler_offering_links": AllSchemas.links,
} as const;

// Add runtime column validation function
function validateSelectColumns(tableName: string, selectColumns: string[]): void {
  const schema = SCHEMA_TABLE_MAP[tableName as keyof typeof SCHEMA_TABLE_MAP];
  if (!schema) return; // Skip validation for unknown tables

  const allowedColumns = Object.keys(schema.shape);

  for (const column of selectColumns) {
    // Handle qualified columns (e.g., "w.wholesaler_id")
    const cleanColumn = column.includes('.') ? column.split('.')[1] : column;

    // Skip AS clauses (e.g., "w.name AS supplier_name")
    const baseColumn = cleanColumn.includes(' AS ') ? cleanColumn.split(' AS ')[0].trim() : cleanColumn;

    if (!allowedColumns.includes(baseColumn)) {
      throw new Error(`Column '${baseColumn}' not found in schema for table '${tableName}'`);
    }
  }
}

// Modify buildQuery function to include validation
export function buildQuery<T>(
  payload: QueryPayload<T>,
  config: QueryConfig,
  namedQuery?: string,
  fixedFrom?: FromClause
) {
  // ... existing logic ...

  // Add schema validation after FROM clause is determined
  if (fromTableForMetadata && fromTableForMetadata.startsWith('dbo.')) {
    validateSelectColumns(fromTableForMetadata, select as string[]);
  }

  // ... rest of function ...
}
```

**Benefits:**
- Eliminates duplicate column maintenance
- Runtime validation catches schema mismatches
- Maintains backward compatibility
- Single Source of Truth: Zod schemas

**Migration Path:**
1. Add schema validation to QueryBuilder
2. Gradually remove hardcoded column lists from queryConfig.allowedTables
3. Keep queryConfig for table-level permissions and join configurations

### **4. Dependency Checks (src/lib/dataModel/dependencyChecks.ts)**

**checkOrderDependencies Funktion hinzufügen:**
```typescript
import { TransWrapper } from "$lib/backendQueries/transactionWrapper";

export async function checkOrderDependencies(
  orderId: number,
  transaction: Transaction | null,
): Promise<{ hard: string[]; soft: string[] }> {
  const soft: string[] = [];
  const hard: string[] = []; // Aktuell leer, Struktur für Zukunft

  log.info(`(dependencyChecks) Checking dependencies for orderId: ${orderId}`);

  const transWrapper = new TransWrapper(transaction, null);
  transWrapper.begin();

  try {
    // Check order_items (soft dependency)
    const orderItemsCheck = await transWrapper.request()
      .input('orderId', orderId)
      .query(`SELECT COUNT(*) as count FROM dbo.order_items WHERE order_id = @orderId`);

    if (orderItemsCheck.recordset[0].count > 0) {
      soft.push(`${orderItemsCheck.recordset[0].count} order items`);
    }

    transWrapper.commit();
  } catch {
    transWrapper.rollback();
  }

  log.info(`(dependencyChecks) Found dependencies for orderId: ${orderId}`, { hard, soft });
  return { hard, soft };
}
```

### **5. Deletion Logic (src/lib/dataModel/deletes.ts)**

**deleteOrder Funktion hinzufügen:**
```typescript
import { TransWrapper } from "$lib/backendQueries/transactionWrapper";
import type { DeletedOrderData } from "$lib/api/app/appSpecificTypes";

export async function deleteOrder(
  id: number,
  cascade: boolean,
  transaction: Transaction,
): Promise<{ deleted: DeletedOrderData; stats: Record<string, number> }> {
  assertDefined(id, `id must be defined for deleteOrder`);
  log.info(`(delete) Preparing to delete Order ID: ${id} with cascade=${cascade}`);

  const orderIdParam = "orderId";
  const transWrapper = new TransWrapper(transaction, null);

  // 1) Read order first (existence check + data for return)
  const selectResult = await transWrapper.request()
    .input(orderIdParam, id)
    .query<DeletedOrderData>(`
      SELECT order_id, order_number, order_date
      FROM dbo.orders
      WHERE order_id = @${orderIdParam};
    `);

  if (selectResult.recordset.length === 0) {
    throw new Error(`Order with ID ${id} not found.`);
  }
  const deletedOrderData = selectResult.recordset[0];
  log.debug(`(delete) Found order to delete: "${deletedOrderData.order_number}" (ID: ${id})`);

  let stats: Record<string, number> = {};

  // 2) Execute delete path
  if (cascade) {
    log.debug(`(delete) Executing CASCADE delete for Order ID: ${id}`);

    // Delete order_items first
    const deleteItemsResult = await transWrapper.request()
      .input(orderIdParam, id)
      .query(`DELETE FROM dbo.order_items WHERE order_id = @${orderIdParam}`);
    stats.order_items = deleteItemsResult.rowsAffected[0] || 0;
  }

  // Delete order
  const deleteOrderResult = await transWrapper.request()
    .input(orderIdParam, id)
    .query(`DELETE FROM dbo.orders WHERE order_id = @${orderIdParam}`);
  stats.orders = deleteOrderResult.rowsAffected[0] || 0;

  return { deleted: deletedOrderData, stats };
}
```

**DeletedOrderData Type in appSpecificTypes.ts hinzufügen:**
```typescript
export type DeletedOrderData = {
  order_id: number;
  order_number?: string;
  order_date: string;
};

export type DeleteOrderSuccessResponse = ApiSuccessResponse<{
  deleted_resource: DeletedOrderData;
  cascade_performed: boolean;
  dependencies_cleared: number;
}>;

export type DeleteOrderApiResponse = DeleteOrderSuccessResponse | DeleteConflictResponse<string[]>;
```

### **6. API Server Endpoints**

**a) src/routes/api/orders/+server.ts:**
```typescript
import { json, error, type RequestHandler } from '@sveltejs/kit';
import { log } from '$lib/utils/logger';
import { buildQuery, executeQuery } from '$lib/backendQueries/queryBuilder';
import { orderQueryConfig } from '$lib/backendQueries/queryConfig';
import { mssqlErrorMapper } from '$lib/backendQueries/mssqlErrorMapper';
import type { Order } from '$lib/domain/domainTypes';
import type { QueryRequest, QuerySuccessResponse, ApiErrorResponse } from '$lib/api/api.types';
import { v4 as uuidv4 } from 'uuid';

export const POST: RequestHandler = async (event) => {
  log.infoHeader("POST /api/orders");
  const operationId = uuidv4();

  try {
    const requestBody = (await event.request.json()) as QueryRequest<Order>;
    const clientPayload = requestBody.payload;

    if (!clientPayload) {
      const errRes: ApiErrorResponse = {
        success: false, message: 'Request body must be a valid QueryRequest object containing a `payload`.',
        status_code: 400, error_code: 'BAD_REQUEST', meta: { timestamp: new Date().toISOString() }
      };
      return json(errRes, { status: 400 });
    }

    const { sql, parameters, metadata } = buildQuery(clientPayload, orderQueryConfig, undefined, { table: 'dbo.orders', alias: 'o' });
    const results = await executeQuery(sql, parameters);

    const response: QuerySuccessResponse<Order> = {
      success: true,
      message: 'Orders retrieved successfully.',
      data: {
        results: results as Partial<Order>[],
        meta: {
          retrieved_at: new Date().toISOString(),
          result_count: results.length,
          columns_selected: metadata.selectColumns,
          has_joins: metadata.hasJoins,
          has_where: metadata.hasWhere,
          parameter_count: metadata.parameterCount,
          table_fixed: 'dbo.orders',
          sql_generated: sql.replace(/\s+/g, ' ').trim()
        }
      },
      meta: { timestamp: new Date().toISOString() }
    };

    return json(response);

  } catch (err: unknown) {
    const { status, message } = mssqlErrorMapper.mapToHttpError(err);
    log.error(`[${operationId}] FN_EXCEPTION: Unhandled error during orders query.`, { error: err });
    throw error(status, message);
  }
};
```

**b) src/routes/api/orders/[id]/+server.ts:**
```typescript
import { json, error, type RequestHandler } from "@sveltejs/kit";
import { db } from "$lib/backendQueries/db";
import { log } from "$lib/utils/logger";
import { mssqlErrorMapper } from "$lib/backendQueries/mssqlErrorMapper";
import { checkOrderDependencies } from "$lib/dataModel/dependencyChecks";
import { validateEntity, OrderSchema, type Order } from "$lib/domain/domainTypes";
import { v4 as uuidv4 } from "uuid";
import type { ApiErrorResponse, ApiSuccessResponse, DeleteConflictResponse, DeleteRequest } from "$lib/api/api.types";
import { deleteOrder } from "$lib/dataModel/deletes";
import type { DeleteOrderSuccessResponse } from "$lib/api/app/appSpecificTypes";

export const GET: RequestHandler = async ({ params }) => {
  const id = parseInt(params.id ?? "", 10);
  if (isNaN(id) || id <= 0) {
    throw error(400, "Invalid order ID. It must be a positive number.");
  }

  try {
    const result = await db.request().input("id", id).query("SELECT * FROM dbo.orders WHERE order_id = @id");

    if (result.recordset.length === 0) {
      throw error(404, `Order with ID ${id} not found.`);
    }

    const order = result.recordset[0] as Order;
    const response: ApiSuccessResponse<{ order: Order }> = {
      success: true,
      message: "Order retrieved successfully.",
      data: { order },
      meta: { timestamp: new Date().toISOString() },
    };

    return json(response);
  } catch (err: unknown) {
    const { status, message } = mssqlErrorMapper.mapToHttpError(err);
    throw error(status, message);
  }
};

export const PUT: RequestHandler = async ({ params, request }) => {
  const id = parseInt(params.id ?? "", 10);
  if (isNaN(id) || id <= 0) {
    const errRes: ApiErrorResponse = {
      success: false, message: "Invalid order ID.", status_code: 400, error_code: "BAD_REQUEST",
      meta: { timestamp: new Date().toISOString() }
    };
    return json(errRes, { status: 400 });
  }

  try {
    const requestData = await request.json();
    const validation = validateEntity(OrderSchema, { ...requestData, order_id: id });

    if (!validation.isValid) {
      const errRes: ApiErrorResponse = {
        success: false, message: "Validation failed.", status_code: 400, error_code: "VALIDATION_ERROR",
        errors: validation.errors, meta: { timestamp: new Date().toISOString() }
      };
      return json(errRes, { status: 400 });
    }

    const { order_date, order_number, status, total_amount, currency, notes } = validation.sanitized as Partial<Order>;
    const result = await db
      .request()
      .input("id", id)
      .input("order_date", order_date)
      .input("order_number", order_number)
      .input("status", status)
      .input("total_amount", total_amount)
      .input("currency", currency)
      .input("notes", notes)
      .query(
        "UPDATE dbo.orders SET order_date=@order_date, order_number=@order_number, status=@status, total_amount=@total_amount, currency=@currency, notes=@notes OUTPUT INSERTED.* WHERE order_id = @id"
      );

    if (result.recordset.length === 0) {
      const errRes: ApiErrorResponse = {
        success: false, message: `Order with ID ${id} not found.`, status_code: 404, error_code: "NOT_FOUND",
        meta: { timestamp: new Date().toISOString() }
      };
      return json(errRes, { status: 404 });
    }

    const response: ApiSuccessResponse<{ order: Order }> = {
      success: true, message: "Order updated successfully.",
      data: { order: result.recordset[0] as Order },
      meta: { timestamp: new Date().toISOString() }
    };
    return json(response);
  } catch (err: unknown) {
    const { status, message } = mssqlErrorMapper.mapToHttpError(err);
    throw error(status, message);
  }
};

export const DELETE: RequestHandler = async ({ params, request }) => {
  const id = parseInt(params.id ?? "", 10);
  const body: DeleteRequest<Order> = await request.json();
  const cascade = body.cascade || false;
  const forceCascade = body.forceCascade || false;

  if (isNaN(id) || id <= 0) {
    const errRes: ApiErrorResponse = {
      success: false, message: "Invalid order ID.", status_code: 400, error_code: "BAD_REQUEST",
      meta: { timestamp: new Date().toISOString() }
    };
    return json(errRes, { status: 400 });
  }

  const transaction = db.transaction();
  await transaction.begin();

  try {
    const { hard, soft } = await checkOrderDependencies(id, transaction);
    let cascade_available = hard.length === 0;

    if ((soft.length > 0 && !cascade) || (hard.length > 0 && !forceCascade)) {
      const conflictResponse: DeleteConflictResponse<string[]> = {
        success: false, message: "Cannot delete order: dependencies exist.", status_code: 409, error_code: "DEPENDENCY_CONFLICT",
        dependencies: { soft, hard }, cascade_available, meta: { timestamp: new Date().toISOString() }
      };
      return json(conflictResponse, { status: 409 });
    }

    const deletedOrderStats = await deleteOrder(id, cascade || forceCascade, transaction);
    await transaction.commit();

    const response: DeleteOrderSuccessResponse = {
      success: true, message: `Order deleted successfully.`,
      data: {
        deleted_resource: deletedOrderStats.deleted,
        cascade_performed: cascade || forceCascade,
        dependencies_cleared: deletedOrderStats.stats.total || 0,
      },
      meta: { timestamp: new Date().toISOString() }
    };
    return json(response);
  } catch (err) {
    await transaction.rollback();
    const { status, message } = mssqlErrorMapper.mapToHttpError(err);
    throw error(status, message);
  }
};
```

**c) src/routes/api/orders/new/+server.ts:**
```typescript
import { json, error, type RequestHandler } from '@sveltejs/kit';
import { db } from '$lib/backendQueries/db';
import { validateEntity, OrderForCreateSchema, type Order } from '$lib/domain/domainTypes';
import type { ApiSuccessResponse, ApiErrorResponse } from '$lib/api/api.types';

export const POST: RequestHandler = async ({ request }) => {
  try {
    const requestData = await request.json();
    const validation = validateEntity(OrderForCreateSchema, requestData);

    if (!validation.isValid) {
      const errRes: ApiErrorResponse = {
        success: false, message: 'Validation failed.', status_code: 400, error_code: 'VALIDATION_ERROR',
        errors: validation.errors, meta: { timestamp: new Date().toISOString() }
      };
      return json(errRes, { status: 400 });
    }

    const { order_date, order_number, status, total_amount, currency, notes } = validation.sanitized;
    const result = await db
      .request()
      .input('order_date', order_date)
      .input('order_number', order_number)
      .input('status', status)
      .input('total_amount', total_amount)
      .input('currency', currency)
      .input('notes', notes)
      .query(
        'INSERT INTO dbo.orders (order_date, order_number, status, total_amount, currency, notes) OUTPUT INSERTED.* VALUES (@order_date, @order_number, @status, @total_amount, @currency, @notes)'
      );

    const response: ApiSuccessResponse<{ order: Order }> = {
      success: true, message: 'Order created successfully.',
      data: { order: result.recordset[0] as Order },
      meta: { timestamp: new Date().toISOString() }
    };
    return json(response);
  } catch (err: unknown) {
    const { status, message } = mssqlErrorMapper.mapToHttpError(err);
    throw error(status, message);
  }
};
```

### **7. API Client (src/lib/api/client/order.ts)**

```typescript
import { log } from "$lib/utils/logger";
import { ComparisonOperator, LogicalOperator, type QueryPayload, type SortDescriptor, type WhereConditionGroup } from "$lib/backendQueries/queryGrammar";
import type { Order } from "$lib/domain/domainTypes";
import type { ApiClient } from "./ApiClient";
import { createPostBody, createQueryBody, getErrorMessage } from "./common";
import type { PredefinedQueryRequest, QueryResponseData } from "$lib/api/api.types";
import type { DeleteOrderApiResponse } from "$lib/api/app/appSpecificTypes";
import { LoadingState } from "./loadingState";

const orderLoadingManager = new LoadingState();
export const orderLoadingState = orderLoadingManager.isLoadingStore;
export const orderLoadingOperations = orderLoadingManager;

export const DEFAULT_ORDER_QUERY: QueryPayload<Order> = {
  select: ["order_id", "order_date", "order_number", "status", "total_amount", "currency", "notes", "created_at"],
  orderBy: [{ key: "order_date", direction: "desc" }],
};

export function getOrderApi(client: ApiClient) {
  const api = {
    async loadOrders(query: Partial<QueryPayload<Order>> = {}): Promise<Order[]> {
      const operationId = "loadOrders";
      orderLoadingOperations.start(operationId);
      try {
        const fullQuery: QueryPayload<Order> = { ...DEFAULT_ORDER_QUERY, ...query };
        const responseData = await client.apiFetch<QueryResponseData<Order>>(
          "/api/orders",
          { method: "POST", body: createQueryBody(fullQuery) },
          { context: operationId },
        );
        return responseData.results as Order[];
      } catch (err) {
        log.error(`[${operationId}] Failed.`, { error: getErrorMessage(err) });
        throw err;
      } finally {
        orderLoadingOperations.finish(operationId);
      }
    },

    async loadOrdersWithWhereAndOrder(where: WhereConditionGroup<Order> | null, orderBy: SortDescriptor<Order>[] | null): Promise<Order[]> {
      const queryPartial: Partial<QueryPayload<Order>> = {};
      if (where) queryPartial.where = where;
      if (orderBy) queryPartial.orderBy = orderBy;
      return api.loadOrders(queryPartial);
    },

    async loadOrder(orderId: number): Promise<Order> {
      const operationId = `loadOrder-${orderId}`;
      orderLoadingOperations.start(operationId);
      try {
        const responseData = await client.apiFetch<{ order: Order }>(
          `/api/orders/${orderId}`,
          { method: "GET" },
          { context: operationId },
        );
        return responseData.order;
      } catch (err) {
        log.error(`[${operationId}] Failed.`, { error: getErrorMessage(err) });
        throw err;
      } finally {
        orderLoadingOperations.finish(operationId);
      }
    },

    async createOrder(orderData: Partial<Omit<Order, "order_id">>): Promise<Order> {
      const operationId = "createOrder";
      orderLoadingOperations.start(operationId);
      try {
        const responseData = await client.apiFetch<{ order: Order }>(
          "/api/orders/new",
          { method: "POST", body: createPostBody(orderData) },
          { context: operationId },
        );
        return responseData.order;
      } catch (err) {
        log.error(`[${operationId}] Failed.`, { orderData, error: getErrorMessage(err) });
        throw err;
      } finally {
        orderLoadingOperations.finish(operationId);
      }
    },

    async updateOrder(orderId: number, updates: Partial<Order>): Promise<Order> {
      const operationId = `updateOrder-${orderId}`;
      orderLoadingOperations.start(operationId);
      try {
        const responseData = await client.apiFetch<{ order: Order }>(
          `/api/orders/${orderId}`,
          { method: "PUT", body: createPostBody(updates) },
          { context: operationId },
        );
        return responseData.order;
      } catch (err) {
        log.error(`[${operationId}] Failed.`, { updates, error: getErrorMessage(err) });
        throw err;
      } finally {
        orderLoadingOperations.finish(operationId);
      }
    },

    async deleteOrder(orderId: number, cascade = false, forceCascade = false): Promise<DeleteOrderApiResponse> {
      const operationId = `deleteOrder-${orderId}`;
      orderLoadingOperations.start(operationId);
      try {
        const url = `/api/orders/${orderId}`;
        const body = createPostBody({ cascade, forceCascade });
        return await client.apiFetchUnion<DeleteOrderApiResponse>(url, { method: "DELETE", body }, { context: operationId });
      } finally {
        orderLoadingOperations.finish(operationId);
      }
    },
  };
  return api;
}
```

### **8. Domain Components**

**a) List Pattern - src/lib/components/domain/orders/orderListPage.ts:**
```typescript
import { log } from '$lib/utils/logger';
import { type LoadEvent } from '@sveltejs/kit';
import { ApiClient } from '$lib/api/client/ApiClient';
import { getOrderApi } from '$lib/api/client/order';

export function load({ fetch }: LoadEvent) {
  log.info(`Kicking off promise for loading orders...`);

  const client = new ApiClient(fetch);
  const orderApi = getOrderApi(client);
  const orders = orderApi.loadOrders();

  return { orders };
}
```

**b) src/lib/components/domain/orders/OrderGrid.svelte:**
```svelte
<script lang="ts">
  import Datagrid from "$lib/components/grids/Datagrid.svelte";
  import type { DeleteStrategy, RowActionStrategy, ColumnDef, ApiLoadFunc } from "$lib/components/grids/Datagrid.types";
  import type { Order } from "$lib/domain/domainTypes";

  export type OrderGridProps = {
    rows: Order[];
    loading?: boolean;
    deleteStrategy: DeleteStrategy<Order>;
    rowActionStrategy?: RowActionStrategy<Order>;
    apiLoadFunc?: ApiLoadFunc<Order>;
  };

  const { rows, loading = false, deleteStrategy, rowActionStrategy, apiLoadFunc }: OrderGridProps = $props();

  const columns: ColumnDef<Order>[] = [
    { key: "order_number", header: "Order #", sortable: true },
    { key: "order_date", header: "Date", sortable: true },
    { key: "status", header: "Status", sortable: true },
    {
      key: "total_amount",
      header: "Total",
      accessor: (r) => r.total_amount ? `${r.total_amount} ${r.currency || 'EUR'}` : "",
      sortable: true
    },
    { key: "notes", header: "Notes", accessor: (r) => r.notes ? r.notes.substring(0, 50) + '...' : "", sortable: false },
  ];

  const getId = (r: Order) => r.order_id;
</script>

<Datagrid
  {rows}
  {columns}
  {getId}
  {loading}
  gridId="orders"
  entity="order"
  {deleteStrategy}
  {rowActionStrategy}
  {apiLoadFunc}
  selection="multiple"
/>
```

**c) src/lib/components/domain/orders/OrderListPage.svelte:**
```svelte
<script lang="ts">
  import OrderGrid from "$lib/components/domain/orders/OrderGrid.svelte";
  import { orderLoadingState, getOrderApi } from "$lib/api/client/order";
  import type { Order } from "$lib/domain/domainTypes";
  import { goto } from "$app/navigation";
  import { log } from "$lib/utils/logger";

  import "$lib/components/styles/list-page-layout.css";
  import { ApiClient } from "$lib/api/client/ApiClient";
  import type { ID, DeleteStrategy, RowActionStrategy } from "$lib/components/grids/Datagrid.types";
  import { stringsToNumbers } from "$lib/utils/typeConversions";
  import { cascadeDelete } from "$lib/api/client/cascadeDelete";

  let { data }: { data: { orders: Promise<Order[]> } } = $props();

  let resolvedOrders = $state<Order[]>([]);
  let isLoading = $state(true);
  let loadingOrValidationError = $state<{ message: string; status: number } | null>(null);
  const allowForceCascadingDelete = $state(true);

  $effect(() => {
    let aborted = false;

    const processPromise = async () => {
      isLoading = true;
      loadingOrValidationError = null;
      resolvedOrders = [];

      if (!data.orders) {
        const message = `Cannot load orders because data.orders is not defined`;
        log.error(message);
        loadingOrValidationError = { message, status: 0 };
      } else {
        try {
          if (!aborted) {
            resolvedOrders = await data.orders;
            log.debug(`Orders promise resolved successfully.`);
          }
        } catch (rawError: any) {
          if (!aborted) {
            const status = rawError.status ?? 500;
            const message = rawError.body?.message || rawError.message || "An unknown error occurred while loading orders.";
            loadingOrValidationError = { message, status };
            log.error("(OrderListPage) Promise rejected while loading orders", { rawError });
          }
        } finally {
          if (!aborted) {
            isLoading = false;
          }
        }
      }
    };

    processPromise();

    return () => {
      aborted = true;
    };
  });

  // Delete Strategy
  const deleteStrategy: DeleteStrategy<Order> = {
    deleteFunction: async (ids: ID[]) => {
      const client = new ApiClient(fetch);
      const orderApi = getOrderApi(client);
      const orderIds = stringsToNumbers(ids);
      return await cascadeDelete({
        entityName: "order",
        entityIds: orderIds,
        deleteFunction: (id: number, cascade: boolean, forceCascade: boolean) =>
          orderApi.deleteOrder(id, cascade, forceCascade),
        allowForceCascadingDelete,
      });
    },
  };

  // Row Action Strategy
  const rowActionStrategy: RowActionStrategy<Order> = {
    onClick: (row: Order) => {
      goto(`/orders/${row.order_id}`);
    },
  };

  // API Load Function für autonomes Sorting
  const apiLoadFunc = async (where: any, orderBy: any) => {
    const client = new ApiClient(fetch);
    const orderApi = getOrderApi(client);
    return orderApi.loadOrdersWithWhereAndOrder(where, orderBy);
  };
</script>

<div class="page-content-wrapper">
  <h1>Orders</h1>
  <p>Manage customer orders and track their status.</p>

  {#if loadingOrValidationError}
    <div class="error-message">
      <strong>Error loading orders:</strong>
      {loadingOrValidationError.message}
    </div>
  {:else}
    <OrderGrid
      rows={resolvedOrders}
      loading={isLoading}
      {deleteStrategy}
      {rowActionStrategy}
      {apiLoadFunc}
    />
  {/if}
</div>
```

### **9. Detail Page Types (src/lib/components/domain/orders/orderDetailPage.types.ts)**

```typescript
import { z } from 'zod';
import { OrderSchema } from '$lib/domain/domainTypes';
import type { PromisifyComplex } from '$lib/utils/typeUtils';

export const OrderDetail_LoadDataSchema = z.object({
  urlPathName: z.string(),
  order: z.nullable(OrderSchema).optional(),
  isCreateMode: z.boolean(),
  isOrdersRoute: z.boolean(),
});

export type OrderDetail_LoadData = z.infer<typeof OrderDetail_LoadDataSchema>;
export type OrderDetail_LoadDataAsync = PromisifyComplex<OrderDetail_LoadData>;
```

### **10. Detail Page Load (src/lib/components/domain/orders/orderDetailPage.ts)**

```typescript
import { log } from '$lib/utils/logger';
import { error, type LoadEvent } from '@sveltejs/kit';
import { getOrderApi } from '$lib/api/client/order';
import { ApiClient } from '$lib/api/client/ApiClient';
import type { OrderDetail_LoadDataAsync } from './orderDetailPage.types';

export function load({ params, fetch: loadEventFetch }: LoadEvent): OrderDetail_LoadDataAsync {
  const orderId = Number(params.orderId);

  if (isNaN(orderId) && params.orderId?.toLowerCase() !== 'new') {
    throw error(400, 'Invalid Order ID');
  }

  log.info(`Kicking off non-blocking load for orderId: ${orderId}`);

  const client = new ApiClient(loadEventFetch);
  const orderApi = getOrderApi(client);

  // EDIT mode
  if (orderId) {
    const loadDataAsync: OrderDetail_LoadDataAsync = {
      order: orderApi.loadOrder(orderId),
    };
    return loadDataAsync;
  }
  // CREATE mode
  else {
    const loadDataAsync: OrderDetail_LoadDataAsync = {
      order: Promise.resolve(null),
    };
    return loadDataAsync;
  }
}
```

### **11. Order Form (src/lib/components/domain/orders/OrderForm.svelte)**

```svelte
<script lang="ts">
  import FormShell from "$lib/components/forms/FormShell.svelte";
  import { log } from "$lib/utils/logger";
  import { OrderSchema, type Order } from "$lib/domain/domainTypes";
  import "$lib/components/styles/form.css";
  import { ApiClient } from "$lib/api/client/ApiClient";
  import { getOrderApi } from "$lib/api/client/order";
  import type { SubmittedCallback, SubmitErrorCallback, CancelledCallback, ChangedCallback, ValidateResult } from "$lib/components/forms/forms.types";
  import { type OrderDetail_LoadData, OrderDetail_LoadDataSchema } from "$lib/components/domain/orders/orderDetailPage.types";
  import ValidationWrapper from "$lib/components/validation/ValidationWrapper.svelte";
  import { assertDefined } from "$lib/utils/assertions";

  type ValidationErrors = Record<string, string[]>;

  interface OrderFormProps {
    initialLoadedData: OrderDetail_LoadData;
    disabled?: boolean;
    onSubmitted?: SubmittedCallback;
    onSubmitError?: SubmitErrorCallback;
    onCancelled?: CancelledCallback;
    onChanged?: ChangedCallback;
  }

  const { initialLoadedData, disabled = false, onSubmitted, onSubmitError, onCancelled, onChanged }: OrderFormProps = $props();

  const client = new ApiClient(fetch);
  const orderApi = getOrderApi(client);

  // Props Validation
  let { initialValidatedOrderData, errors, contextData } = $derived.by(() => {
    const result = OrderDetail_LoadDataSchema.safeParse(initialLoadedData);
    if (!result.success) {
      return {
        initialValidatedOrderData: null,
        errors: result.error.issues,
        contextData: null,
      };
    }

    const data = result.data;
    let finalInitialData = data.order ?? null;

    if (data.isCreateMode) {
      finalInitialData = {
        order_date: new Date().toISOString().split('T')[0],
        status: 'pending',
        currency: 'EUR'
      } as Order;
    }

    return {
      initialValidatedOrderData: finalInitialData,
      errors: null,
      contextData: data,
    };
  });

  const isCreateMode = $derived(!initialValidatedOrderData);

  // Business Logic Validation
  function validateOrder(raw: Record<string, any>): ValidateResult {
    const data = raw as Partial<Order>;
    const errors: ValidationErrors = {};

    if (!data.order_date?.trim()) {
      errors.order_date = ["Order date is required"];
    }
    if (!data.status?.trim()) {
      errors.status = ["Status is required"];
    }

    return {
      valid: Object.keys(errors).length === 0,
      errors,
    };
  }

  // Form Submission
  async function submitOrder(raw: Record<string, any>) {
    log.debug(`Submitting order`, raw);
    const data = raw as Partial<Order>;
    const isUpdate = !isCreateMode;

    try {
      if (isUpdate) {
        const { order_id, created_at, ...updateData } = data;
        assertDefined(order_id, "order_id is required for update");
        return await orderApi.updateOrder(order_id, updateData);
      } else {
        return await orderApi.createOrder(data);
      }
    } catch (e) {
      log.error({ component: "OrderForm", error: String(e) }, "SUBMIT_FAILED");
      throw e;
    }
  }

  function handleSubmitted(p: { data: Record<string, any>; result: unknown }) {
    onSubmitted?.(p);
  }

  function handleSubmitError(p: { data: Record<string, any>; error: unknown }) {
    onSubmitError?.(p);
  }

  function handleCancelled(p: { data: Record<string, any>; reason?: string }) {
    onCancelled?.(p);
  }

  function handleChanged(p: { data: Record<string, any>; dirty: boolean }) {
    onChanged?.(p);
  }
</script>

<ValidationWrapper {errors}>
  <FormShell
    entity="Order"
    initial={initialValidatedOrderData}
    validate={validateOrder}
    submitCbk={submitOrder}
    {disabled}
    onSubmitted={handleSubmitted}
    onSubmitError={handleSubmitError}
    onCancelled={handleCancelled}
    onChanged={handleChanged}
  >
    {#snippet header({ data, dirty })}
      {@const order = data as Partial<Order>}
      <div class="form-header">
        <div>
          {#if order?.order_id}
            <h3>{order.order_number || `Order #${order.order_id}`}</h3>
            <span class="field-hint">ID: {order.order_id}</span>
          {:else}
            <h3>New Order</h3>
          {/if}
        </div>
        <div>
          {#if dirty}
            <span class="pc-grid__badge pc-grid__badge--warn">Unsaved changes</span>
          {/if}
        </div>
      </div>
    {/snippet}

    {#snippet fields({ getS, set, errors, markTouched })}
      <div class="form-body">
        <div class="form-row-grid">
          <!-- Order Date -->
          <div class="form-group">
            <label for="order-date">Order Date *</label>
            <input
              id="order-date"
              name="order_date"
              type="date"
              value={getS("order_date") ?? ""}
              class:invalid={errors.order_date}
              oninput={(e) => set(["order_date"], (e.currentTarget as HTMLInputElement).value)}
              onblur={() => markTouched("order_date")}
              required
            />
            {#if errors.order_date}
              <div class="error-text">{errors.order_date[0]}</div>
            {/if}
          </div>

          <!-- Order Number -->
          <div class="form-group">
            <label for="order-number">Order Number</label>
            <input
              id="order-number"
              name="order_number"
              type="text"
              value={getS("order_number") ?? ""}
              placeholder="Auto-generated if empty"
              oninput={(e) => set(["order_number"], (e.currentTarget as HTMLInputElement).value)}
              onblur={() => markTouched("order_number")}
            />
          </div>

          <!-- Status -->
          <div class="form-group">
            <label for="order-status">Status *</label>
            <select
              id="order-status"
              name="status"
              value={getS("status") ?? ""}
              class:invalid={errors.status}
              onchange={(e) => set(["status"], (e.currentTarget as HTMLSelectElement).value)}
              onblur={() => markTouched("status")}
              required
            >
              <option value="">Select status…</option>
              <option value="pending">Pending</option>
              <option value="confirmed">Confirmed</option>
              <option value="processing">Processing</option>
              <option value="shipped">Shipped</option>
              <option value="delivered">Delivered</option>
              <option value="cancelled">Cancelled</option>
            </select>
            {#if errors.status}
              <div class="error-text">{errors.status[0]}</div>
            {/if}
          </div>

          <!-- Total Amount -->
          <div class="form-group">
            <label for="total-amount">Total Amount</label>
            <input
              id="total-amount"
              name="total_amount"
              type="number"
              step="0.01"
              min="0"
              value={getS("total_amount") ?? ""}
              oninput={(e) => set(["total_amount"], parseFloat((e.currentTarget as HTMLInputElement).value) || null)}
              onblur={() => markTouched("total_amount")}
            />
          </div>

          <!-- Currency -->
          <div class="form-group">
            <label for="currency">Currency</label>
            <select
              id="currency"
              name="currency"
              value={getS("currency") ?? "EUR"}
              onchange={(e) => set(["currency"], (e.currentTarget as HTMLSelectElement).value)}
              onblur={() => markTouched("currency")}
            >
              <option value="EUR">EUR</option>
              <option value="USD">USD</option>
              <option value="GBP">GBP</option>
              <option value="CHF">CHF</option>
            </select>
          </div>
        </div>

        <!-- Notes -->
        <div class="form-group">
          <label for="notes">Notes</label>
          <textarea
            id="notes"
            name="notes"
            value={getS("notes") ?? ""}
            placeholder="Additional notes about this order..."
            rows="4"
            oninput={(e) => set(["notes"], (e.currentTarget as HTMLTextAreaElement).value)}
            onblur={() => markTouched("notes")}
          ></textarea>
        </div>
      </div>
    {/snippet}

    {#snippet actions({ submitAction, cancel, submitting, valid, dirty })}
      <div class="form-actions">
        <button type="button" onclick={submitAction} disabled={submitting || !valid}>
          {#if submitting}
            {isCreateMode ? "Creating..." : "Saving..."}
          {:else}
            {isCreateMode ? "Create Order" : "Save Changes"}
          {/if}
        </button>
        <button type="button" onclick={cancel}>Cancel</button>
      </div>
    {/snippet}
  </FormShell>
</ValidationWrapper>
```

### **12. SvelteKit Routes (Page Delegation Pattern)**

**a) src/routes/(browser)/orders/+page.ts:**
```typescript
export { load } from '$lib/components/domain/orders/orderListPage';
```

**b) src/routes/(browser)/orders/+page.svelte:**
```svelte
<script lang="ts">
  import OrderListPage from '$lib/components/domain/orders/OrderListPage.svelte';
  let { data } = $props();
</script>

<OrderListPage {data} />
```

**c) src/routes/(browser)/orders/[orderId]/+page.ts:**
```typescript
export { load } from '$lib/components/domain/orders/orderDetailPage';
```

**d) src/routes/(browser)/orders/[orderId]/+page.svelte:**
```svelte
<script lang="ts">
  import OrderDetailPage from '$lib/components/domain/orders/OrderDetailPage.svelte';
  let { data } = $props();
</script>

<OrderDetailPage {data} />
```

### **13. Navigation Integration (src/routes/(browser)/navHierarchyConfig.ts)**

**ordersHierarchyConfig hinzufügen:**
```typescript
export const ordersHierarchyConfig: HierarchyTree = {
  name: "orders",
  rootItem: createHierarchyNode({
    item: { key: "orders", type: "list", href: "/orders", label: "Orders" },
    children: [
      createHierarchyNode({
        item: { key: "order", type: "object", href: "/orders/[orderId]", label: "Order", display: false, urlParamName: "orderId" },
        children: []
      })
    ]
  })
};
```

**getAppHierarchies() erweitern:**
```typescript
export function getAppHierarchies(): Hierarchy {
  return [supplierHierarchyConfig, productCategoriesHierarchyConfig, attributesHierarchyConfig, ordersHierarchyConfig];
}
```

## **ERGEBNIS**

Orders als vollständige Top-Level Master-Data Entity mit:
- ✅ Database Schema nach bestehendem Muster mit Indexes
- ✅ TransWrapper Pattern für sichere Transactions
- ✅ Dependency Check Struktur (aktuell soft dependencies, erweitbar für hard)
- ✅ Vollständige API Implementation (Query, CRUD, Delete mit Cascade)
- ✅ Type-safe Client mit Loading States
- ✅ Context-aware Forms mit Props-Validation
- ✅ Autonomous Datagrid mit Sorting
- ✅ Page Delegation Pattern für alle Routes
- ✅ Navigation Integration als 4. Top-Level Entry

**Der Plan ist 90% implementation-ready mit präzisen, konsistenten Patterns!**