import { Hono } from "hono";
import { pool } from "../db/connection";
import type { ResultSetHeader, RowDataPacket } from "mysql2";

const router = new Hono();

// List all orders (with optional customer_id or status filter)
router.get("/", async (c) => {
  const customerId = c.req.query("customer_id");
  const status = c.req.query("status");
  let query = `
    SELECT o.*, c.name as customer_name, c.email as customer_email
    FROM orders o
    JOIN customers c ON o.customer_id = c.id
  `;
  const conditions: string[] = [];
  const params: (string | number)[] = [];

  if (customerId) {
    conditions.push("o.customer_id = ?");
    params.push(Number(customerId));
  }
  if (status) {
    conditions.push("o.status = ?");
    params.push(status);
  }
  if (conditions.length > 0) {
    query += " WHERE " + conditions.join(" AND ");
  }
  query += " ORDER BY o.created_at DESC";

  const [rows] = await pool.query<RowDataPacket[]>(query, params);
  return c.json(rows);
});

// Get a single order with its items
router.get("/:id", async (c) => {
  const id = c.req.param("id");
  const [orders] = await pool.query<RowDataPacket[]>(
    `SELECT o.*, c.name as customer_name, c.email as customer_email
     FROM orders o JOIN customers c ON o.customer_id = c.id
     WHERE o.id = ?`,
    [id]
  );
  if (orders.length === 0) return c.json({ error: "Order not found" }, 404);

  const [items] = await pool.query<RowDataPacket[]>(
    `SELECT oi.*, p.name as product_name
     FROM order_items oi JOIN products p ON oi.product_id = p.id
     WHERE oi.order_id = ?`,
    [id]
  );

  return c.json({ ...orders[0], items });
});

// Create an order
router.post("/", async (c) => {
  const body = await c.req.json();
  const { customer_id, items } = body;

  if (!customer_id || !items || !Array.isArray(items) || items.length === 0) {
    return c.json({ error: "customer_id and items[] are required" }, 400);
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    // Validate customer exists
    const [customers] = await conn.query<RowDataPacket[]>(
      "SELECT id FROM customers WHERE id = ?",
      [customer_id]
    );
    if (customers.length === 0) {
      await conn.rollback();
      return c.json({ error: "Customer not found" }, 404);
    }

    // Create the order
    const [orderResult] = await conn.query<ResultSetHeader>(
      "INSERT INTO orders (customer_id, total) VALUES (?, 0)",
      [customer_id]
    );
    const orderId = orderResult.insertId;

    let total = 0;
    for (const item of items) {
      const { product_id, quantity } = item;
      if (!product_id || !quantity || quantity < 1) {
        await conn.rollback();
        return c.json({ error: "Each item needs product_id and quantity >= 1" }, 400);
      }

      // Get product price and check stock
      const [products] = await conn.query<RowDataPacket[]>(
        "SELECT id, price, stock FROM products WHERE id = ?",
        [product_id]
      );
      if (products.length === 0) {
        await conn.rollback();
        return c.json({ error: `Product ${product_id} not found` }, 404);
      }

      const product = products[0];
      if (product.stock < quantity) {
        await conn.rollback();
        return c.json(
          { error: `Insufficient stock for product ${product_id}. Available: ${product.stock}` },
          409
        );
      }

      const lineTotal = product.price * quantity;
      total += lineTotal;

      await conn.query(
        "INSERT INTO order_items (order_id, product_id, quantity, price) VALUES (?, ?, ?, ?)",
        [orderId, product_id, quantity, product.price]
      );

      // Decrease stock
      await conn.query("UPDATE products SET stock = stock - ? WHERE id = ?", [
        quantity,
        product_id,
      ]);
    }

    // Update order total
    await conn.query("UPDATE orders SET total = ? WHERE id = ?", [total, orderId]);
    await conn.commit();

    // Return the created order
    const [newOrder] = await pool.query<RowDataPacket[]>(
      `SELECT o.*, c.name as customer_name FROM orders o
       JOIN customers c ON o.customer_id = c.id WHERE o.id = ?`,
      [orderId]
    );
    const [orderItems] = await pool.query<RowDataPacket[]>(
      `SELECT oi.*, p.name as product_name FROM order_items oi
       JOIN products p ON oi.product_id = p.id WHERE oi.order_id = ?`,
      [orderId]
    );

    return c.json({ ...newOrder[0], items: orderItems }, 201);
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
});

// Update order status
router.patch("/:id/status", async (c) => {
  const id = c.req.param("id");
  const { status } = await c.req.json();
  const validStatuses = ["pending", "processing", "shipped", "delivered", "cancelled"];

  if (!status || !validStatuses.includes(status)) {
    return c.json({ error: `status must be one of: ${validStatuses.join(", ")}` }, 400);
  }

  const [result] = await pool.query<ResultSetHeader>(
    "UPDATE orders SET status = ? WHERE id = ?",
    [status, id]
  );
  if (result.affectedRows === 0) return c.json({ error: "Order not found" }, 404);

  const [rows] = await pool.query<RowDataPacket[]>(
    "SELECT * FROM orders WHERE id = ?",
    [id]
  );
  return c.json(rows[0]);
});

// Delete an order
router.delete("/:id", async (c) => {
  const id = c.req.param("id");
  const [result] = await pool.query<ResultSetHeader>(
    "DELETE FROM orders WHERE id = ?",
    [id]
  );
  if (result.affectedRows === 0) return c.json({ error: "Order not found" }, 404);
  return c.json({ message: "Order deleted" });
});

export default router;
