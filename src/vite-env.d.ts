/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL?: string;
  readonly VITE_API_TIMEOUT_MS?: string;
  readonly VITE_API_PRODUCTS_PATH?: string;
  readonly VITE_API_PRODUCT_PATH?: string;
  readonly VITE_API_SERVICES_PATH?: string;
  readonly VITE_API_RENTALS_PATH?: string;
  readonly VITE_API_JOBS_PATH?: string;
  readonly VITE_API_STORES_PATH?: string;
  readonly VITE_API_AI_ASSISTANT_PATH?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
