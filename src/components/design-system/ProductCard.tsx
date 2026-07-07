import { Heart, Star } from 'lucide-react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { cn } from '../../lib/utils';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { Card, CardContent } from '../ui/card';

export function ProductCard({
  id,
  title,
  price,
  image,
  rating,
  reviews,
  seller,
  badge,
  verified,
  onWishlist,
  wished,
  className,
}: {
  id: string;
  title: string;
  price: string | number;
  image: string;
  rating?: number;
  reviews?: number;
  seller?: string;
  badge?: string;
  verified?: boolean;
  onWishlist?: () => void;
  wished?: boolean;
  className?: string;
}) {
  const formattedPrice =
    typeof price === 'number' ? `R ${price.toLocaleString('en-ZA')}` : price;

  return (
    <motion.div
      whileHover={{ y: -4 }}
      transition={{ type: 'spring', stiffness: 400, damping: 25 }}
      className={className}
    >
      <Card className="group overflow-hidden border-border/60 shadow-soft transition-shadow hover:shadow-soft-lg">
        <Link to={`/product/${id}`} className="block">
          <div className="relative aspect-[4/3] overflow-hidden bg-muted">
            <img
              src={image}
              alt={title}
              className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
              loading="lazy"
            />
            {badge ? (
              <Badge className="absolute left-3 top-3 bg-background/90 text-foreground backdrop-blur">
                {badge}
              </Badge>
            ) : null}
            {onWishlist ? (
              <Button
                type="button"
                size="icon"
                variant="secondary"
                className="absolute right-3 top-3 h-8 w-8 rounded-full opacity-0 transition-opacity group-hover:opacity-100"
                onClick={(event) => {
                  event.preventDefault();
                  onWishlist();
                }}
                aria-label="Add to wishlist"
              >
                <Heart className={cn('h-4 w-4', wished && 'fill-destructive text-destructive')} />
              </Button>
            ) : null}
          </div>
        </Link>
        <CardContent className="p-4">
          <Link to={`/product/${id}`} className="block space-y-2">
            <h3 className="line-clamp-2 font-medium leading-snug transition-colors group-hover:text-primary">
              {title}
            </h3>
            <div className="flex items-center justify-between gap-2">
              <p className="font-display text-lg font-bold">{formattedPrice}</p>
              {rating ? (
                <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                  <Star className="h-3.5 w-3.5 fill-warning text-warning" />
                  {rating}
                  {reviews ? ` (${reviews})` : ''}
                </span>
              ) : null}
            </div>
            {seller ? (
              <p className="text-xs text-muted-foreground">
                {seller}
                {verified ? ' · Verified' : ''}
              </p>
            ) : null}
          </Link>
        </CardContent>
      </Card>
    </motion.div>
  );
}
