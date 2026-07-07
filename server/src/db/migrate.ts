import { requireSql } from './client.js';

export async function migrate() {
  const db = requireSql();

  await db`
    CREATE TABLE IF NOT EXISTS gridstore_users (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      role TEXT NOT NULL CHECK (role IN ('buyer', 'seller', 'moderator', 'admin')),
      verified BOOLEAN NOT NULL DEFAULT false,
      password_hash TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;

  await db`
    CREATE TABLE IF NOT EXISTS gridstore_orders (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES gridstore_users(id) ON DELETE CASCADE,
      status TEXT NOT NULL,
      payment_status TEXT NOT NULL,
      total NUMERIC(12,2) NOT NULL,
      delivery_address TEXT NOT NULL,
      receipt_number TEXT NOT NULL,
      created_at TEXT NOT NULL
    )
  `;

  await db`
    CREATE TABLE IF NOT EXISTS gridstore_order_lines (
      id SERIAL PRIMARY KEY,
      order_id TEXT NOT NULL REFERENCES gridstore_orders(id) ON DELETE CASCADE,
      product_id TEXT NOT NULL,
      title TEXT NOT NULL,
      seller TEXT NOT NULL,
      quantity INT NOT NULL CHECK (quantity > 0),
      unit_price NUMERIC(12,2) NOT NULL
    )
  `;

  await db`
    CREATE TABLE IF NOT EXISTS gridstore_listings (
      id TEXT PRIMARY KEY,
      seller_id TEXT NOT NULL REFERENCES gridstore_users(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      category TEXT NOT NULL,
      price NUMERIC(12,2) NOT NULL,
      rating NUMERIC(3,2) NOT NULL DEFAULT 0,
      reviews INT NOT NULL DEFAULT 0,
      seller TEXT NOT NULL,
      location TEXT NOT NULL,
      badge TEXT,
      image TEXT NOT NULL,
      description TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('active', 'draft', 'paused', 'flagged')),
      inventory INT NOT NULL DEFAULT 0,
      risk_score INT NOT NULL DEFAULT 10,
      verified BOOLEAN NOT NULL DEFAULT false
    )
  `;

  await db`CREATE INDEX IF NOT EXISTS idx_gridstore_orders_user_id ON gridstore_orders(user_id)`;
  await db`CREATE INDEX IF NOT EXISTS idx_gridstore_listings_seller_id ON gridstore_listings(seller_id)`;
  await db`CREATE INDEX IF NOT EXISTS idx_gridstore_listings_status ON gridstore_listings(status)`;
}
