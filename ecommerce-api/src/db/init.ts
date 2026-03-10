import { pool } from "./connection";

export async function initDatabase() {
  const conn = await pool.getConnection();
  try {
    await conn.query(`
      CREATE TABLE IF NOT EXISTS products (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        description TEXT,
        price DECIMAL(10, 2) NOT NULL,
        stock INT NOT NULL DEFAULT 0,
        category VARCHAR(100),
        image_url VARCHAR(500),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `);

    await conn.query(`
      CREATE TABLE IF NOT EXISTS customers (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        email VARCHAR(255) NOT NULL UNIQUE,
        address TEXT,
        phone VARCHAR(50),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `);

    await conn.query(`
      CREATE TABLE IF NOT EXISTS orders (
        id INT AUTO_INCREMENT PRIMARY KEY,
        customer_id INT NOT NULL,
        status ENUM('pending', 'processing', 'shipped', 'delivered', 'cancelled') DEFAULT 'pending',
        total DECIMAL(10, 2) NOT NULL DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (customer_id) REFERENCES customers(id)
      )
    `);

    await conn.query(`
      CREATE TABLE IF NOT EXISTS order_items (
        id INT AUTO_INCREMENT PRIMARY KEY,
        order_id INT NOT NULL,
        product_id INT NOT NULL,
        quantity INT NOT NULL,
        price DECIMAL(10, 2) NOT NULL,
        FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
        FOREIGN KEY (product_id) REFERENCES products(id)
      )
    `);

    // Seed data if tables are empty
    const [rows] = await conn.query("SELECT COUNT(*) as count FROM products");
    if ((rows as any)[0].count === 0) {
      await conn.query(`
        INSERT INTO products (name, description, price, stock, category) VALUES
        ('Wireless Headphones', 'Premium noise-cancelling Bluetooth headphones', 79.99, 150, 'Electronics'),
        ('Organic Cotton T-Shirt', 'Soft and sustainable everyday tee', 24.99, 300, 'Clothing'),
        ('Stainless Steel Water Bottle', 'Double-walled insulated 750ml bottle', 34.99, 200, 'Accessories'),
        ('Running Shoes', 'Lightweight performance running shoes', 119.99, 80, 'Footwear'),
        ('Ceramic Coffee Mug', 'Handcrafted 350ml coffee mug', 18.99, 500, 'Home'),
        ('Laptop Backpack', 'Water-resistant backpack with laptop compartment', 59.99, 120, 'Accessories'),
        ('Yoga Mat', 'Non-slip eco-friendly yoga mat', 39.99, 250, 'Fitness'),
        ('Mechanical Keyboard', 'RGB mechanical keyboard with Cherry MX switches', 89.99, 60, 'Electronics'),
        ('Scented Candle Set', 'Set of 3 soy wax scented candles', 29.99, 400, 'Home'),
        ('Sunglasses', 'Polarized UV400 protection sunglasses', 49.99, 180, 'Accessories')
      `);

      await conn.query(`
        INSERT INTO customers (name, email, address, phone) VALUES
        ('Alice Johnson', 'alice@example.com', '123 Main St, Springfield, IL', '555-0101'),
        ('Bob Smith', 'bob@example.com', '456 Oak Ave, Portland, OR', '555-0102'),
        ('Carol White', 'carol@example.com', '789 Pine Rd, Austin, TX', '555-0103')
      `);

      console.log("✅ Database seeded with sample data");
    }

    console.log("✅ Database tables initialized");
  } finally {
    conn.release();
  }
}

// Allow running standalone
if (import.meta.main) {
  await initDatabase();
  await pool.end();
}
