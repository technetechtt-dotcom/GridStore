import { jobs, products, rentals, services, stores } from '../../../src/data/catalog.js';
import type { Job, Product, Rental, Service, StoreProfile } from '../types.js';

export const seedProducts: Product[] = products;
export const seedServices: Service[] = services;
export const seedRentals: Rental[] = rentals;
export const seedJobs: Job[] = jobs;
export const seedStores: StoreProfile[] = stores;
