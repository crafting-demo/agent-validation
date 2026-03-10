import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const API_BASE = process.env.API_BASE_URL || "http://api:3000";

async function apiRequest(
  method: string,
  path: string,
  body?: unknown
): Promise<unknown> {
  const opts: RequestInit = {
    method,
    headers: { "Content-Type": "application/json" },
  };
  if (body !== undefined) {
    opts.body = JSON.stringify(body);
  }
  const res = await fetch(`${API_BASE}${path}`, opts);
  return res.json();
}

const server = new McpServer({
  name: "ecommerce-api",
  version: "1.0.0",
});

// --- Products ---

server.tool("list_products", "List all products, optionally filtered by category", {
  category: z.string().optional().describe("Filter by category name"),
}, async ({ category }) => {
  const query = category ? `?category=${encodeURIComponent(category)}` : "";
  const data = await apiRequest("GET", `/api/products${query}`);
  return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
});

server.tool("get_product", "Get a single product by ID", {
  id: z.number().describe("Product ID"),
}, async ({ id }) => {
  const data = await apiRequest("GET", `/api/products/${id}`);
  return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
});

server.tool("create_product", "Create a new product", {
  name: z.string().describe("Product name"),
  description: z.string().optional().describe("Product description"),
  price: z.number().describe("Product price"),
  stock: z.number().optional().describe("Stock quantity"),
  category: z.string().optional().describe("Product category"),
}, async (args) => {
  const data = await apiRequest("POST", "/api/products", args);
  return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
});

server.tool("update_product", "Update an existing product", {
  id: z.number().describe("Product ID"),
  name: z.string().optional().describe("Product name"),
  description: z.string().optional().describe("Product description"),
  price: z.number().optional().describe("Product price"),
  stock: z.number().optional().describe("Stock quantity"),
  category: z.string().optional().describe("Product category"),
}, async ({ id, ...updates }) => {
  const data = await apiRequest("PUT", `/api/products/${id}`, updates);
  return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
});

server.tool("delete_product", "Delete a product by ID", {
  id: z.number().describe("Product ID"),
}, async ({ id }) => {
  const data = await apiRequest("DELETE", `/api/products/${id}`);
  return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
});

// --- Customers ---

server.tool("list_customers", "List all customers", {}, async () => {
  const data = await apiRequest("GET", "/api/customers");
  return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
});

server.tool("get_customer", "Get a single customer by ID", {
  id: z.number().describe("Customer ID"),
}, async ({ id }) => {
  const data = await apiRequest("GET", `/api/customers/${id}`);
  return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
});

server.tool("create_customer", "Create a new customer", {
  name: z.string().describe("Customer name"),
  email: z.string().describe("Customer email"),
  address: z.string().optional().describe("Customer address"),
  phone: z.string().optional().describe("Customer phone"),
}, async (args) => {
  const data = await apiRequest("POST", "/api/customers", args);
  return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
});

server.tool("update_customer", "Update an existing customer", {
  id: z.number().describe("Customer ID"),
  name: z.string().optional().describe("Customer name"),
  email: z.string().optional().describe("Customer email"),
  address: z.string().optional().describe("Customer address"),
  phone: z.string().optional().describe("Customer phone"),
}, async ({ id, ...updates }) => {
  const data = await apiRequest("PUT", `/api/customers/${id}`, updates);
  return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
});

server.tool("delete_customer", "Delete a customer by ID", {
  id: z.number().describe("Customer ID"),
}, async ({ id }) => {
  const data = await apiRequest("DELETE", `/api/customers/${id}`);
  return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
});

// --- Orders ---

server.tool("list_orders", "List all orders, optionally filtered by customer_id or status", {
  customer_id: z.number().optional().describe("Filter by customer ID"),
  status: z.enum(["pending", "processing", "shipped", "delivered", "cancelled"]).optional().describe("Filter by order status"),
}, async ({ customer_id, status }) => {
  const params = new URLSearchParams();
  if (customer_id !== undefined) params.set("customer_id", String(customer_id));
  if (status) params.set("status", status);
  const query = params.toString() ? `?${params}` : "";
  const data = await apiRequest("GET", `/api/orders${query}`);
  return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
});

server.tool("get_order", "Get a single order by ID, including its line items", {
  id: z.number().describe("Order ID"),
}, async ({ id }) => {
  const data = await apiRequest("GET", `/api/orders/${id}`);
  return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
});

server.tool("create_order", "Create a new order for a customer with line items", {
  customer_id: z.number().describe("Customer ID"),
  items: z.array(z.object({
    product_id: z.number().describe("Product ID"),
    quantity: z.number().describe("Quantity to order"),
  })).describe("Array of items to order"),
}, async (args) => {
  const data = await apiRequest("POST", "/api/orders", args);
  return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
});

server.tool("update_order_status", "Update the status of an order", {
  id: z.number().describe("Order ID"),
  status: z.enum(["pending", "processing", "shipped", "delivered", "cancelled"]).describe("New order status"),
}, async ({ id, status }) => {
  const data = await apiRequest("PATCH", `/api/orders/${id}/status`, { status });
  return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
});

server.tool("delete_order", "Delete an order by ID", {
  id: z.number().describe("Order ID"),
}, async ({ id }) => {
  const data = await apiRequest("DELETE", `/api/orders/${id}`);
  return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
});

// --- Health ---

server.tool("health_check", "Check the health of the e-commerce API and database connection", {}, async () => {
  const data = await apiRequest("GET", "/health");
  return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
});

// Start the server
const transport = new StdioServerTransport();
await server.connect(transport);
