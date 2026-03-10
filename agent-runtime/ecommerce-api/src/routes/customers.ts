import { Hono } from "hono";
import { pool } from "../db/connection";
import type { ResultSetHeader, RowDataPacket } from "mysql2";

const router = new Hono();

// List all customers
router.get("/", async (c) => {
  const [rows] = await pool.query<RowDataPacket[]>(
    "SELECT * FROM customers ORDER BY id"
  );
  return c.json(rows);
});

// Get a single customer
router.get("/:id", async (c) => {
  const id = c.req.param("id");
  const [rows] = await pool.query<RowDataPacket[]>(
    "SELECT * FROM customers WHERE id = ?",
    [id]
  );
  if (rows.length === 0) return c.json({ error: "Customer not found" }, 404);
  return c.json(rows[0]);
});

// Create a customer
router.post("/", async (c) => {
  const body = await c.req.json();
  const { name, email, address, phone } = body;

  if (!name || !email) {
    return c.json({ error: "name and email are required" }, 400);
  }

  try {
    const [result] = await pool.query<ResultSetHeader>(
      "INSERT INTO customers (name, email, address, phone) VALUES (?, ?, ?, ?)",
      [name, email, address || null, phone || null]
    );

    const [rows] = await pool.query<RowDataPacket[]>(
      "SELECT * FROM customers WHERE id = ?",
      [result.insertId]
    );
    return c.json(rows[0], 201);
  } catch (err: any) {
    if (err.code === "ER_DUP_ENTRY") {
      return c.json({ error: "A customer with this email already exists" }, 409);
    }
    throw err;
  }
});

// Update a customer
router.put("/:id", async (c) => {
  const id = c.req.param("id");
  const body = await c.req.json();
  const { name, email, address, phone } = body;

  const [result] = await pool.query<ResultSetHeader>(
    "UPDATE customers SET name = COALESCE(?, name), email = COALESCE(?, email), address = COALESCE(?, address), phone = COALESCE(?, phone) WHERE id = ?",
    [name, email, address, phone, id]
  );

  if (result.affectedRows === 0) return c.json({ error: "Customer not found" }, 404);

  const [rows] = await pool.query<RowDataPacket[]>(
    "SELECT * FROM customers WHERE id = ?",
    [id]
  );
  return c.json(rows[0]);
});

// Delete a customer
router.delete("/:id", async (c) => {
  const id = c.req.param("id");
  try {
    const [result] = await pool.query<ResultSetHeader>(
      "DELETE FROM customers WHERE id = ?",
      [id]
    );
    if (result.affectedRows === 0) return c.json({ error: "Customer not found" }, 404);
    return c.json({ message: "Customer deleted" });
  } catch (err: any) {
    if (err.code === "ER_ROW_IS_REFERENCED_2") {
      return c.json({ error: "Cannot delete customer with existing orders" }, 409);
    }
    throw err;
  }
});

export default router;
