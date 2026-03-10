import { Hono } from "hono";
import { pool } from "../db/connection";
import type { ResultSetHeader, RowDataPacket } from "mysql2";

const router = new Hono();

// List all products (with optional category filter)
router.get("/", async (c) => {
  const category = c.req.query("category");
  let query = "SELECT * FROM products";
  const params: string[] = [];

  if (category) {
    query += " WHERE category = ?";
    params.push(category);
  }
  query += " ORDER BY id";

  const [rows] = await pool.query<RowDataPacket[]>(query, params);
  return c.json(rows);
});

// Get a single product
router.get("/:id", async (c) => {
  const id = c.req.param("id");
  const [rows] = await pool.query<RowDataPacket[]>(
    "SELECT * FROM products WHERE id = ?",
    [id]
  );
  if (rows.length === 0) return c.json({ error: "Product not found" }, 404);
  return c.json(rows[0]);
});

// Create a product
router.post("/", async (c) => {
  const body = await c.req.json();
  const { name, description, price, stock, category, image_url } = body;

  if (!name || price == null) {
    return c.json({ error: "name and price are required" }, 400);
  }

  const [result] = await pool.query<ResultSetHeader>(
    "INSERT INTO products (name, description, price, stock, category, image_url) VALUES (?, ?, ?, ?, ?, ?)",
    [name, description || null, price, stock || 0, category || null, image_url || null]
  );

  const [rows] = await pool.query<RowDataPacket[]>(
    "SELECT * FROM products WHERE id = ?",
    [result.insertId]
  );
  return c.json(rows[0], 201);
});

// Update a product
router.put("/:id", async (c) => {
  const id = c.req.param("id");
  const body = await c.req.json();
  const { name, description, price, stock, category, image_url } = body;

  const [result] = await pool.query<ResultSetHeader>(
    "UPDATE products SET name = COALESCE(?, name), description = COALESCE(?, description), price = COALESCE(?, price), stock = COALESCE(?, stock), category = COALESCE(?, category), image_url = COALESCE(?, image_url) WHERE id = ?",
    [name, description, price, stock, category, image_url, id]
  );

  if (result.affectedRows === 0) return c.json({ error: "Product not found" }, 404);

  const [rows] = await pool.query<RowDataPacket[]>(
    "SELECT * FROM products WHERE id = ?",
    [id]
  );
  return c.json(rows[0]);
});

// Delete a product
router.delete("/:id", async (c) => {
  const id = c.req.param("id");
  const [result] = await pool.query<ResultSetHeader>(
    "DELETE FROM products WHERE id = ?",
    [id]
  );
  if (result.affectedRows === 0) return c.json({ error: "Product not found" }, 404);
  return c.json({ message: "Product deleted" });
});

export default router;
