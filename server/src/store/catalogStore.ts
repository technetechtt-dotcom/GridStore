import { matchesQuery } from '../lib/search.js';
import {
  seedJobs,
  seedProducts,
  seedRentals,
  seedServices,
  seedStores,
} from '../data/seed.js';
import type { Job, Product, Rental, Service, StoreProfile } from '../types.js';

class CatalogStore {
  private products: Product[];
  private services: Service[];
  private rentals: Rental[];
  private jobs: Job[];
  private stores: StoreProfile[];

  constructor() {
    this.products = [...seedProducts];
    this.services = [...seedServices];
    this.rentals = [...seedRentals];
    this.jobs = [...seedJobs];
    this.stores = [...seedStores];
  }

  listProducts(query = '', category = ''): Product[] {
    return this.products.filter((item) => {
      const matchesCategory = !category || category === 'all' || item.category === category;
      const matchesSearch = matchesQuery(
        [item.title, item.category, item.seller, item.location],
        query
      );
      return matchesCategory && matchesSearch;
    });
  }

  getProduct(id: string): Product | undefined {
    return this.products.find((item) => item.id === id);
  }

  listServices(query = ''): Service[] {
    return this.services.filter((item) =>
      matchesQuery([item.title, item.provider, item.category, item.location], query)
    );
  }

  getService(id: string): Service | undefined {
    return this.services.find((item) => item.id === id);
  }

  listRentals(query = ''): Rental[] {
    return this.rentals.filter((item) =>
      matchesQuery([item.title, item.owner, item.category, item.location], query)
    );
  }

  getRental(id: string): Rental | undefined {
    return this.rentals.find((item) => item.id === id);
  }

  listJobs(query = ''): Job[] {
    return this.jobs.filter((item) =>
      matchesQuery([item.title, item.company, item.location, item.type], query)
    );
  }

  getJob(id: string): Job | undefined {
    return this.jobs.find((item) => item.id === id);
  }

  listStores(query = ''): StoreProfile[] {
    return this.stores.filter((item) =>
      matchesQuery([item.name, item.category, item.location], query)
    );
  }

  getStore(id: string): StoreProfile | undefined {
    return this.stores.find((item) => item.id === id);
  }
}

export const catalogStore = new CatalogStore();
