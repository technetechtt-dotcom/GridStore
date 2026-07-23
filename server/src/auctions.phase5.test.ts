import request from 'supertest';
import { beforeAll, describe, expect, it } from 'vitest';
import { createApp } from './app.js';
import { initPlatformStore } from './store/index.js';
import { platformStore } from './store/index.js';

describe('phase 5 auctions and offers', () => {
  const app = createApp();

  beforeAll(async () => {
    await initPlatformStore();
  });

  async function login(email: string) {
    const response = await request(app)
      .post('/api/auth/login')
      .send({ email, password: 'DemoSeed-ChangeMe1' });
    return (response.body.accessToken || response.body.sessionToken) as string;
  }

  it('blocks seller self-bids and supports bid idempotency', async () => {
    const sellerToken = await login('seller@gridstore.local');
    const buyerToken = await login('buyer@gridstore.local');
    const auctions = await request(app).get('/api/auctions');
    const auction = auctions.body[0];
    expect(auction).toBeTruthy();

    const selfBid = await request(app)
      .post(`/api/auctions/${auction.id}/bids`)
      .set('Authorization', `Bearer ${sellerToken}`)
      .send({ amount: (auction.startingBid ?? auction.price) + 100 });
    expect(selfBid.status).toBe(400);
    expect(String(selfBid.body.error)).toMatch(/own auctions/i);

    const key = `bid-${Date.now()}`;
    const amount = (auction.startingBid ?? auction.price) + 150;
    const first = await request(app)
      .post(`/api/auctions/${auction.id}/bids`)
      .set('Authorization', `Bearer ${buyerToken}`)
      .set('Idempotency-Key', key)
      .send({ amount });
    expect(first.status).toBe(201);

    const second = await request(app)
      .post(`/api/auctions/${auction.id}/bids`)
      .set('Authorization', `Bearer ${buyerToken}`)
      .set('Idempotency-Key', key)
      .send({ amount: amount + 500 });
    expect(second.status).toBe(201);
    expect(second.body.bid.id).toBe(first.body.bid.id);
    expect(second.body.bid.amount).toBe(first.body.bid.amount);
  });

  it('blocks seller self-offers and reserves inventory on accept', async () => {
    const sellerToken = await login('seller@gridstore.local');
    const buyerToken = await login('buyer@gridstore.local');
    const listings = await request(app).get('/api/listings?status=active');
    const haggle = listings.body.find((item: { haggleEnabled?: boolean }) => item.haggleEnabled);
    expect(haggle).toBeTruthy();
    const beforeInventory = Number(haggle.inventory);

    const selfOffer = await request(app)
      .post('/api/offers')
      .set('Authorization', `Bearer ${sellerToken}`)
      .send({ listingId: haggle.id, amount: Math.round(haggle.price * 0.7) });
    expect(selfOffer.status).toBe(400);

    const offer = await request(app)
      .post('/api/offers')
      .set('Authorization', `Bearer ${buyerToken}`)
      .send({ listingId: haggle.id, amount: Math.round(haggle.price * 0.7) });
    expect(offer.status).toBe(201);
    expect(offer.body.expiresAt).toBeTruthy();

    const competing = await request(app)
      .post('/api/offers')
      .set('Authorization', `Bearer ${buyerToken}`)
      .send({ listingId: haggle.id, amount: Math.round(haggle.price * 0.65) });
    expect(competing.status).toBe(201);

    const accepted = await request(app)
      .patch(`/api/offers/${offer.body.id}/respond`)
      .set('Authorization', `Bearer ${sellerToken}`)
      .send({ action: 'accept' });
    expect(accepted.status).toBe(200);
    expect(accepted.body.status).toBe('accepted');
    expect(accepted.body.inventoryReserved).toBe(true);

    const listing = platformStore.getListing(haggle.id);
    expect(listing?.inventory).toBe(beforeInventory - 1);

    const declinedAction = await request(app)
      .patch(`/api/offers/${competing.body.id}/respond`)
      .set('Authorization', `Bearer ${sellerToken}`)
      .send({ action: 'decline' });
    expect(declinedAction.status).toBe(400);
  });

  it('closes expired auctions through the closing worker stub', async () => {
    const adminToken = await login('admin@gridstore.local');
    const sellerToken = await login('seller@gridstore.local');

    const created = await request(app)
      .post('/api/listings')
      .set('Authorization', `Bearer ${sellerToken}`)
      .send({
        title: 'Closing Worker Auction',
        category: 'Electronics',
        price: 1000,
        inventory: 1,
        description: 'Temporary auction for close worker test.',
        location: 'Cape Town',
        saleMode: 'auction',
        startingBid: 500,
        bidIncrement: 50,
        auctionDurationHours: 1,
      });
    expect(created.status).toBe(201);

    await request(app)
      .patch(`/api/admin/listings/${created.body.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'active' });

    await platformStore.updateListingTradeFields(created.body.id, {
      auctionStatus: 'live',
      auctionEndsAt: new Date(Date.now() - 60_000).toISOString(),
    });

    const closed = await request(app)
      .post('/api/auctions/close-due')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(closed.status).toBe(200);

    const listing = platformStore.getListing(created.body.id);
    expect(listing?.auctionStatus).toBe('ended');
  });
});
