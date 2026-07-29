export function platformFeeRate() {
  return Number(process.env.PLATFORM_FEE_RATE ?? '0.12');
}

export function computeFeeSplit(amountCents: number) {
  const platformFeeCents = Math.round(amountCents * platformFeeRate());
  return { platformFeeCents, sellerCents: amountCents - platformFeeCents };
}
