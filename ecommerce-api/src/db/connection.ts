import mysql from "mysql2/promise";

export const pool = mysql.createPool({
  host: process.env.MYSQL_SERVICE_HOST || "mysql",
  port: Number(process.env.MYSQL_SERVICE_PORT_MYSQL) || 3306,
  user: "ecommerce",
  password: "ecommerce123",
  database: "ecommerce_db",
  waitForConnections: true,
  connectionLimit: 10,
  ssl: false,
});
