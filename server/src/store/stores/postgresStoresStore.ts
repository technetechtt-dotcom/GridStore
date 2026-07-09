import { seedStores } from '../../data/seed.js';
import { requireSql } from '../../db/client.js';
import { migrate } from '../../db/migrate.js';
import { createId, nowLabel } from '../../lib/ids.js';
import { matchesQuery } from '../../lib/search.js';
import type { StoreProfile } from '../../types.js';
import type { StoreInput, StoresStore, AdminStorePatch } from './types.js';

const DEFAULT_STORE_IMAGE =
  'https://images.unsplash.com/photo-1441986300917-64674bd600d8?auto=format&fit=crop&q=80&w=800';

interface StoreRow {
  id: string;
  owner_id: string;
  name: string;
  category: string;
  rating: string | number;
  followers: number;
  location: string;
  description: string;
  support_email: string | null;
  status: 'active' | 'draft' | 'paused';
  verified: boolean;
  image: string | null;
  created_at?: string;
}

function rowToStore(row: StoreRow): StoreProfile {
  return {
    id: row.id,
    name: row.name,
    category: row.category,
    rating: Number(row.rating),
    followers: row.followers,
    location: row.location,
    description: row.description,
    supportEmail: row.support_email ?? undefined,
    status: row.status,
    verified: row.verified,
    image: row.image ?? undefined,
  };
}

export class PostgresStoresStore implements StoresStore {
  private seeded = false;

  async ensureSeeded() {
    if (this.seeded) return;
    const db = requireSql();
    await migrate();

    const count = await db`SELECT COUNT(*)::int AS count FROM gridstore_stores`;
    if (Number(count[0]?.count ?? 0) > 0) {
      this.seeded = true;
      return;
    }

    const sellers = await db`
      SELECT id, email, verified FROM gridstore_users WHERE role = 'seller' LIMIT 1
    `;
    const seller = sellers[0];
    if (!seller) {
      this.seeded = true;
      return;
    }

    for (const store of seedStores) {
      await db`
        INSERT INTO gridstore_stores (
          id, owner_id, name, category, rating, followers, location, description,
          support_email, status, verified, image, created_at
        ) VALUES (
          ${store.id}, ${seller.id}, ${store.name}, ${store.category},
          ${store.rating}, ${store.followers}, ${store.location}, ${store.description},
          ${seller.email}, 'active', true, ${DEFAULT_STORE_IMAGE}, ${nowLabel()}
        )
      `;
    }

    this.seeded = true;
  }

  async listPublicStores(query = '') {
    await this.ensureSeeded();
    const db = requireSql();
    const rows = await db<StoreRow[]>`
      SELECT * FROM gridstore_stores WHERE status = 'active' ORDER BY followers DESC, name ASC
    `;
    return rows
      .map(rowToStore)
      .filter((store) =>
        matchesQuery([store.name, store.category, store.location, store.description], query)
      );
  }

  async listOwnerStores(ownerId: string) {
    await this.ensureSeeded();
    const db = requireSql();
    const rows = await db<StoreRow[]>`
      SELECT * FROM gridstore_stores WHERE owner_id = ${ownerId} ORDER BY name ASC
    `;
    return rows.map(rowToStore);
  }

  async listAllStoresAdmin() {
    await this.ensureSeeded();
    const db = requireSql();
    const rows = await db<StoreRow[]>`
      SELECT * FROM gridstore_stores ORDER BY created_at DESC, name ASC
    `;
    return rows.map((row) => ({
      ...rowToStore(row),
      ownerId: row.owner_id,
      createdAt: row.created_at,
    }));
  }

  async countStores() {
    await this.ensureSeeded();
    const db = requireSql();
    const rows = await db`SELECT COUNT(*)::int AS count FROM gridstore_stores`;
    return Number(rows[0]?.count ?? 0);
  }

  async getStore(id: string) {
    await this.ensureSeeded();
    const db = requireSql();
    const rows = await db<StoreRow[]>`
      SELECT * FROM gridstore_stores WHERE id = ${id} LIMIT 1
    `;
    return rows[0] ? rowToStore(rows[0]) : undefined;
  }

  async createStore(ownerId: string, verified: boolean, input: StoreInput) {
    await this.ensureSeeded();
    const db = requireSql();
    const id = createId('store');
    const status = input.status ?? 'active';

    await db`
      INSERT INTO gridstore_stores (
        id, owner_id, name, category, rating, followers, location, description,
        support_email, status, verified, image, created_at
      ) VALUES (
        ${id}, ${ownerId}, ${input.name.trim()}, ${input.category.trim()},
        0, 0, ${input.location.trim()}, ${input.description.trim()},
        ${input.supportEmail?.trim() ?? null}, ${status}, ${verified},
        ${input.image ?? DEFAULT_STORE_IMAGE}, ${nowLabel()}
      )
    `;

    const store = await this.getStore(id);
    if (!store) throw new Error('Unable to create store');
    return store;
  }

  async updateStore(ownerId: string, storeId: string, input: Partial<StoreInput>) {
    await this.ensureSeeded();
    const existing = await this.getStore(storeId);
    if (!existing) throw new Error('Store not found');

    const db = requireSql();
    const ownerCheck = await db`
      SELECT owner_id FROM gridstore_stores WHERE id = ${storeId} LIMIT 1
    `;
    if (ownerCheck[0]?.owner_id !== ownerId) {
      throw new Error('Store not found');
    }

    await db`
      UPDATE gridstore_stores SET
        name = COALESCE(${input.name?.trim() ?? null}, name),
        category = COALESCE(${input.category?.trim() ?? null}, category),
        location = COALESCE(${input.location?.trim() ?? null}, location),
        description = COALESCE(${input.description?.trim() ?? null}, description),
        support_email = COALESCE(${input.supportEmail?.trim() ?? null}, support_email),
        status = COALESCE(${input.status ?? null}, status),
        image = COALESCE(${input.image ?? null}, image)
      WHERE id = ${storeId}
    `;

    const updated = await this.getStore(storeId);
    if (!updated) throw new Error('Store not found');
    return updated;
  }

  async adminUpdateStore(storeId: string, input: AdminStorePatch) {
    await this.ensureSeeded();
    const existing = await this.getStore(storeId);
    if (!existing) throw new Error('Store not found');

    const db = requireSql();
    await db`
      UPDATE gridstore_stores SET
        name = COALESCE(${input.name?.trim() ?? null}, name),
        category = COALESCE(${input.category?.trim() ?? null}, category),
        location = COALESCE(${input.location?.trim() ?? null}, location),
        description = COALESCE(${input.description?.trim() ?? null}, description),
        support_email = COALESCE(${input.supportEmail?.trim() ?? null}, support_email),
        status = COALESCE(${input.status ?? null}, status),
        verified = COALESCE(${input.verified ?? null}, verified)
      WHERE id = ${storeId}
    `;

    const updated = await this.getStore(storeId);
    if (!updated) throw new Error('Store not found');
    return updated;
  }
}
