import bcrypt from 'bcryptjs';
import { env } from '../config/env.js';
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
    ALTER TABLE gridstore_users
    ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN NOT NULL DEFAULT false
  `;
  await db`
    ALTER TABLE gridstore_users
    ADD COLUMN IF NOT EXISTS mfa_enabled BOOLEAN NOT NULL DEFAULT false
  `;
  await db`
    ALTER TABLE gridstore_users
    ADD COLUMN IF NOT EXISTS mfa_secret TEXT
  `;

  // Emergency: force resets for any account that ever had plaintext credentials.
  await db`
    UPDATE gridstore_users
    SET must_change_password = true
    WHERE EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_name = 'gridstore_users'
        AND column_name = 'password_plaintext'
    )
  `;

  await db`ALTER TABLE gridstore_users DROP COLUMN IF EXISTS password_plaintext`;

  if (env.enableDemoData) {
    // Demo passwords are never stored in plaintext. Hash only when demo mode is explicitly allowed.
    const demoPasswordHash = await bcrypt.hash(process.env.DEMO_SEED_PASSWORD ?? 'DemoSeed-ChangeMe1', 10);
    await db`
      UPDATE gridstore_users
      SET password_hash = ${demoPasswordHash},
          must_change_password = true
      WHERE email LIKE '%@gridstore.local'
        AND password_hash = ''
    `;
  }

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

  await db`ALTER TABLE gridstore_listings ADD COLUMN IF NOT EXISTS sale_mode TEXT NOT NULL DEFAULT 'fixed'`;
  await db`ALTER TABLE gridstore_listings ADD COLUMN IF NOT EXISTS haggle_enabled BOOLEAN NOT NULL DEFAULT false`;
  await db`ALTER TABLE gridstore_listings ADD COLUMN IF NOT EXISTS starting_bid NUMERIC(12,2)`;
  await db`ALTER TABLE gridstore_listings ADD COLUMN IF NOT EXISTS current_bid NUMERIC(12,2) DEFAULT 0`;
  await db`ALTER TABLE gridstore_listings ADD COLUMN IF NOT EXISTS bid_increment NUMERIC(12,2) DEFAULT 50`;
  await db`ALTER TABLE gridstore_listings ADD COLUMN IF NOT EXISTS reserve_price NUMERIC(12,2)`;
  await db`ALTER TABLE gridstore_listings ADD COLUMN IF NOT EXISTS auction_ends_at TIMESTAMPTZ`;
  await db`ALTER TABLE gridstore_listings ADD COLUMN IF NOT EXISTS auction_status TEXT NOT NULL DEFAULT 'none'`;
  await db`ALTER TABLE gridstore_listings ADD COLUMN IF NOT EXISTS bid_count INT NOT NULL DEFAULT 0`;

  await db`
    CREATE TABLE IF NOT EXISTS gridstore_offers (
      id TEXT PRIMARY KEY,
      listing_id TEXT NOT NULL REFERENCES gridstore_listings(id) ON DELETE CASCADE,
      listing_title TEXT NOT NULL,
      buyer_id TEXT NOT NULL REFERENCES gridstore_users(id) ON DELETE CASCADE,
      buyer_name TEXT NOT NULL,
      amount NUMERIC(12,2) NOT NULL,
      message TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      counter_amount NUMERIC(12,2),
      created_at TEXT NOT NULL
    )
  `;

  await db`
    CREATE TABLE IF NOT EXISTS gridstore_bids (
      id TEXT PRIMARY KEY,
      listing_id TEXT NOT NULL REFERENCES gridstore_listings(id) ON DELETE CASCADE,
      bidder_id TEXT NOT NULL REFERENCES gridstore_users(id) ON DELETE CASCADE,
      bidder_name TEXT NOT NULL,
      amount NUMERIC(12,2) NOT NULL,
      created_at TEXT NOT NULL
    )
  `;

  await db`CREATE INDEX IF NOT EXISTS idx_gridstore_offers_listing ON gridstore_offers(listing_id)`;
  await db`CREATE INDEX IF NOT EXISTS idx_gridstore_bids_listing ON gridstore_bids(listing_id)`;
  await db`CREATE INDEX IF NOT EXISTS idx_gridstore_listings_auction ON gridstore_listings(sale_mode, auction_status)`;

  await db`CREATE INDEX IF NOT EXISTS idx_gridstore_orders_user_id ON gridstore_orders(user_id)`;
  await db`CREATE INDEX IF NOT EXISTS idx_gridstore_listings_seller_id ON gridstore_listings(seller_id)`;
  await db`CREATE INDEX IF NOT EXISTS idx_gridstore_listings_status ON gridstore_listings(status)`;

  await db`
    CREATE TABLE IF NOT EXISTS gridstore_cart_items (
      user_id TEXT NOT NULL REFERENCES gridstore_users(id) ON DELETE CASCADE,
      product_id TEXT NOT NULL,
      quantity INT NOT NULL CHECK (quantity > 0),
      PRIMARY KEY (user_id, product_id)
    )
  `;

  await db`
    CREATE TABLE IF NOT EXISTS gridstore_wishlist_items (
      user_id TEXT NOT NULL REFERENCES gridstore_users(id) ON DELETE CASCADE,
      product_id TEXT NOT NULL,
      PRIMARY KEY (user_id, product_id)
    )
  `;

  await db`
    CREATE TABLE IF NOT EXISTS gridstore_notifications (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES gridstore_users(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      created_at TEXT NOT NULL,
      unread BOOLEAN NOT NULL DEFAULT true
    )
  `;

  await db`
    CREATE TABLE IF NOT EXISTS gridstore_message_threads (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES gridstore_users(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      participant TEXT NOT NULL
    )
  `;

  await db`
    CREATE TABLE IF NOT EXISTS gridstore_messages (
      id TEXT PRIMARY KEY,
      thread_id TEXT NOT NULL REFERENCES gridstore_message_threads(id) ON DELETE CASCADE,
      author TEXT NOT NULL CHECK (author IN ('buyer', 'seller')),
      text TEXT NOT NULL,
      created_at TEXT NOT NULL
    )
  `;

  await db`
    CREATE TABLE IF NOT EXISTS gridstore_bookings (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES gridstore_users(id) ON DELETE CASCADE,
      service_id TEXT NOT NULL,
      service_title TEXT NOT NULL,
      provider TEXT NOT NULL,
      requested_date TEXT NOT NULL,
      note TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'requested',
      created_at TEXT NOT NULL
    )
  `;

  await db`
    CREATE TABLE IF NOT EXISTS gridstore_rental_reservations (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES gridstore_users(id) ON DELETE CASCADE,
      rental_id TEXT NOT NULL,
      rental_title TEXT NOT NULL,
      start_date TEXT NOT NULL,
      end_date TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'requested',
      created_at TEXT NOT NULL
    )
  `;

  await db`
    CREATE TABLE IF NOT EXISTS gridstore_job_applications (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES gridstore_users(id) ON DELETE CASCADE,
      job_id TEXT NOT NULL,
      job_title TEXT NOT NULL,
      applicant_name TEXT NOT NULL,
      cv_file_name TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'submitted',
      created_at TEXT NOT NULL
    )
  `;

  await db`
    CREATE TABLE IF NOT EXISTS gridstore_trust_reports (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES gridstore_users(id) ON DELETE CASCADE,
      target_type TEXT NOT NULL CHECK (target_type IN ('listing', 'user', 'order')),
      target_id TEXT NOT NULL,
      reason TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'open',
      created_at TEXT NOT NULL
    )
  `;

  await db`CREATE INDEX IF NOT EXISTS idx_gridstore_notifications_user ON gridstore_notifications(user_id)`;
  await db`CREATE INDEX IF NOT EXISTS idx_gridstore_threads_user ON gridstore_message_threads(user_id)`;
  await db`CREATE INDEX IF NOT EXISTS idx_gridstore_bookings_user ON gridstore_bookings(user_id)`;

  await db`
    CREATE TABLE IF NOT EXISTS gridstore_stores (
      id TEXT PRIMARY KEY,
      owner_id TEXT NOT NULL REFERENCES gridstore_users(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      category TEXT NOT NULL,
      rating NUMERIC(3,2) NOT NULL DEFAULT 0,
      followers INT NOT NULL DEFAULT 0,
      location TEXT NOT NULL,
      description TEXT NOT NULL,
      support_email TEXT,
      status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'draft', 'paused')),
      verified BOOLEAN NOT NULL DEFAULT false,
      image TEXT,
      created_at TEXT NOT NULL
    )
  `;
  await db`CREATE INDEX IF NOT EXISTS idx_gridstore_stores_owner ON gridstore_stores(owner_id)`;
  await db`CREATE INDEX IF NOT EXISTS idx_gridstore_stores_status ON gridstore_stores(status)`;

  await db`
    CREATE TABLE IF NOT EXISTS gridstore_seller_applications (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES gridstore_users(id) ON DELETE CASCADE,
      business_name TEXT NOT NULL,
      category TEXT NOT NULL,
      location TEXT NOT NULL,
      description TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      reviewed_at TIMESTAMPTZ,
      reviewer_id TEXT REFERENCES gridstore_users(id),
      UNIQUE (user_id)
    )
  `;

  await db`
    CREATE TABLE IF NOT EXISTS gridstore_security_events (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      actor_id TEXT,
      target_id TEXT,
      ip TEXT,
      request_id TEXT,
      detail JSONB,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
  await db`CREATE INDEX IF NOT EXISTS idx_gridstore_security_events_created ON gridstore_security_events(created_at DESC)`;
}
