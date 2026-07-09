import { createId } from '../lib/ids.js';
import { matchesQuery } from '../lib/search.js';
import {
  seedJobs,
  seedProducts,
  seedRentals,
  seedServices,
  seedStores,
} from '../data/seed.js';
import type {
  CatalogItemStatus,
  Job,
  Product,
  Rental,
  Service,
  StoreProfile,
} from '../types.js';

function isPublicStatus(status?: CatalogItemStatus) {
  return !status || status === 'active';
}

class CatalogStore {
  private products: Product[];
  private services: Service[];
  private rentals: Rental[];
  private jobs: Job[];
  private stores: StoreProfile[];

  constructor() {
    this.products = seedProducts.map((item) => ({ ...item, status: 'active' as const }));
    this.services = seedServices.map((item) => ({ ...item, status: 'active' as const }));
    this.rentals = seedRentals.map((item) => ({ ...item, status: 'active' as const }));
    this.jobs = seedJobs.map((item) => ({ ...item, status: 'active' as const }));
    this.stores = [...seedStores];
  }

  listProducts(query = '', category = '') {
    return this.products.filter((item) => {
      if (!isPublicStatus(item.status)) return false;
      const matchesCategory = !category || category === 'all' || item.category === category;
      const matchesSearch = matchesQuery(
        [item.title, item.category, item.seller, item.location],
        query
      );
      return matchesCategory && matchesSearch;
    });
  }

  listAllProductsAdmin() {
    return [...this.products];
  }

  getProduct(id: string) {
    const product = this.products.find((item) => item.id === id);
    if (!product || !isPublicStatus(product.status)) return undefined;
    return product;
  }

  updateProductAdmin(id: string, patch: Partial<Product> & { status?: CatalogItemStatus }) {
    const product = this.products.find((item) => item.id === id);
    if (!product) throw new Error('Product not found');
    Object.assign(product, {
      ...patch,
      title: patch.title?.trim() ?? product.title,
      category: patch.category?.trim() ?? product.category,
      seller: patch.seller?.trim() ?? product.seller,
      location: patch.location?.trim() ?? product.location,
      description: patch.description?.trim() ?? product.description,
    });
    return product;
  }

  listServices(query = '') {
    return this.services.filter(
      (item) =>
        isPublicStatus(item.status) &&
        matchesQuery([item.title, item.provider, item.category, item.location], query)
    );
  }

  listAllServicesAdmin() {
    return [...this.services];
  }

  getService(id: string) {
    const service = this.services.find((item) => item.id === id);
    if (!service || !isPublicStatus(service.status)) return undefined;
    return service;
  }

  updateServiceAdmin(id: string, patch: Partial<Service> & { status?: CatalogItemStatus }) {
    const service = this.services.find((item) => item.id === id);
    if (!service) throw new Error('Service not found');
    Object.assign(service, {
      ...patch,
      title: patch.title?.trim() ?? service.title,
      provider: patch.provider?.trim() ?? service.provider,
      category: patch.category?.trim() ?? service.category,
      location: patch.location?.trim() ?? service.location,
      description: patch.description?.trim() ?? service.description,
      priceLabel: patch.priceLabel?.trim() ?? service.priceLabel,
    });
    return service;
  }

  listRentals(query = '') {
    return this.rentals.filter(
      (item) =>
        isPublicStatus(item.status) &&
        matchesQuery([item.title, item.owner, item.category, item.location], query)
    );
  }

  listAllRentalsAdmin() {
    return [...this.rentals];
  }

  getRental(id: string) {
    const rental = this.rentals.find((item) => item.id === id);
    if (!rental || !isPublicStatus(rental.status)) return undefined;
    return rental;
  }

  updateRentalAdmin(id: string, patch: Partial<Rental> & { status?: CatalogItemStatus }) {
    const rental = this.rentals.find((item) => item.id === id);
    if (!rental) throw new Error('Rental not found');
    Object.assign(rental, {
      ...patch,
      title: patch.title?.trim() ?? rental.title,
      owner: patch.owner?.trim() ?? rental.owner,
      category: patch.category?.trim() ?? rental.category,
      location: patch.location?.trim() ?? rental.location,
      description: patch.description?.trim() ?? rental.description,
    });
    return rental;
  }

  listJobs(query = '') {
    return this.jobs.filter(
      (item) =>
        isPublicStatus(item.status) &&
        matchesQuery([item.title, item.company, item.location, item.type], query)
    );
  }

  listAllJobsAdmin() {
    return [...this.jobs];
  }

  getJob(id: string) {
    const job = this.jobs.find((item) => item.id === id);
    if (!job || !isPublicStatus(job.status)) return undefined;
    return job;
  }

  updateJobAdmin(id: string, patch: Partial<Job> & { status?: CatalogItemStatus }) {
    const job = this.jobs.find((item) => item.id === id);
    if (!job) throw new Error('Job not found');
    Object.assign(job, {
      ...patch,
      title: patch.title?.trim() ?? job.title,
      company: patch.company?.trim() ?? job.company,
      location: patch.location?.trim() ?? job.location,
      type: patch.type?.trim() ?? job.type,
      salaryLabel: patch.salaryLabel?.trim() ?? job.salaryLabel,
      description: patch.description?.trim() ?? job.description,
    });
    return job;
  }

  countProducts() {
    return this.products.length;
  }

  countServices() {
    return this.services.length;
  }

  countRentals() {
    return this.rentals.length;
  }

  countJobs() {
    return this.jobs.length;
  }

  listStores(query = '') {
    return this.stores.filter((item) =>
      matchesQuery([item.name, item.category, item.location], query)
    );
  }

  getStore(id: string) {
    return this.stores.find((item) => item.id === id);
  }
}

export const catalogStore = new CatalogStore();

export function createCatalogId(prefix: string) {
  return createId(prefix);
}
