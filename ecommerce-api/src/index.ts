import { Hono } from "hono";
import { logger } from "hono/logger";
import { cors } from "hono/cors";
import { pool } from "./db/connection";
import { initDatabase } from "./db/init";
import productsRouter from "./routes/products";
import customersRouter from "./routes/customers";
import ordersRouter from "./routes/orders";

const app = new Hono();

app.use("*", logger());
app.use("*", cors());

app.get("/", (c) =>
  c.json({
    name: "E-Commerce API",
    version: "1.0.0",
    endpoints: {
      products: "/api/products",
      customers: "/api/customers",
      orders: "/api/orders",
    },
  })
);

app.get("/health", async (c) => {
  try {
    await pool.query("SELECT 1");
    return c.json({ status: "ok", database: "connected" });
  } catch {
    return c.json({ status: "error", database: "disconnected" }, 503);
  }
});

app.route("/api/products", productsRouter);
app.route("/api/customers", customersRouter);
app.route("/api/orders", ordersRouter);

// Initialize database then start server
await initDatabase();

export default {
  port: 3000,
  fetch: app.fetch,
};

console.log("🚀 E-Commerce API running on http://0.0.0.0:3000");
