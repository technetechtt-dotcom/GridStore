let storesReady = true;

export function setStoresReady(ready: boolean) {
  storesReady = ready;
}

export function areStoresReady() {
  return storesReady;
}
