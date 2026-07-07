import { Router } from 'express';
import { catalogStore } from '../store/catalogStore.js';

export const productsRouter = Router();

productsRouter.get('/', (req, res) => {
  const q = typeof req.query.q === 'string' ? req.query.q : '';
  const category = typeof req.query.category === 'string' ? req.query.category : '';
  res.json(catalogStore.listProducts(q, category));
});

productsRouter.get('/:id', (req, res) => {
  const product = catalogStore.getProduct(req.params.id);
  if (!product) {
    res.status(404).json({ error: 'Product not found' });
    return;
  }
  res.json(product);
});
