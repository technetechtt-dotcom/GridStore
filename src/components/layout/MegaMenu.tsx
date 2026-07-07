import React from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ShoppingBag,
  Tag,
  Wrench,
  Car,
  Briefcase,
  Store,
  BoxIcon } from
'lucide-react';
interface MegaColumn {
  title: string;
  icon: BoxIcon;
  to: string;
  items: {
    label: string;
    to: string;
  }[];
}
const COLUMNS: MegaColumn[] = [
{
  title: 'Buy',
  icon: ShoppingBag,
  to: '/marketplace',
  items: [
  {
    label: 'Electronics',
    to: '/marketplace?category=Electronics'
  },
  {
    label: 'Fashion',
    to: '/marketplace?category=Fashion'
  },
  {
    label: 'Home & Garden',
    to: '/marketplace?category=Home%20%26%20Garden'
  },
  {
    label: 'Flash Sales',
    to: '/flash-sales'
  },
  {
    label: 'Live Auctions',
    to: '/auctions'
  }]

},
{
  title: 'Sell',
  icon: Tag,
  to: '/seller',
  items: [
  {
    label: 'List an item',
    to: '/seller'
  },
  {
    label: 'AI Listing Generator',
    to: '/seller/ai-listing'
  },
  {
    label: 'Seller Dashboard',
    to: '/seller'
  },
  {
    label: 'Pricing tools',
    to: '/seller/pricing'
  }]

},
{
  title: 'Services',
  icon: Wrench,
  to: '/services',
  items: [
  {
    label: 'Photographers',
    to: '/services?q=photography'
  },
  {
    label: 'Developers',
    to: '/services?q=development'
  },
  {
    label: 'Home Services',
    to: '/services?q=home'
  },
  {
    label: 'Book a pro',
    to: '/services'
  }]

},
{
  title: 'Rentals',
  icon: Car,
  to: '/rentals',
  items: [
  {
    label: 'Vehicles',
    to: '/rentals?q=vehicles'
  },
  {
    label: 'Equipment',
    to: '/rentals?q=equipment'
  },
  {
    label: 'Property',
    to: '/rentals?q=property'
  },
  {
    label: 'Tools',
    to: '/rentals'
  }]

},
{
  title: 'Jobs',
  icon: Briefcase,
  to: '/jobs',
  items: [
  {
    label: 'Browse jobs',
    to: '/jobs'
  },
  {
    label: 'Upload CV',
    to: '/jobs/cv-upload'
  },
  {
    label: 'Company profiles',
    to: '/store'
  },
  {
    label: 'For employers',
    to: '/employers'
  }]

},
{
  title: 'Businesses',
  icon: Store,
  to: '/store',
  items: [
  {
    label: 'Featured stores',
    to: '/store'
  },
  {
    label: 'Create storefront',
    to: '/store/create'
  },
  {
    label: 'Verified businesses',
    to: '/store'
  },
  {
    label: 'Local near you',
    to: '/store?q=local'
  }]

}];

export function MegaMenu({ open }: {open: boolean;}) {
  return (
    <AnimatePresence>
      {open &&
      <motion.div
        initial={{
          opacity: 0,
          y: -8
        }}
        animate={{
          opacity: 1,
          y: 0
        }}
        exit={{
          opacity: 0,
          y: -8
        }}
        transition={{
          duration: 0.18,
          ease: [0.16, 1, 0.3, 1]
        }}
        className="absolute left-0 right-0 top-full z-50">
        
          <div className="container mx-auto px-4">
            <div className="glass border border-border rounded-2xl shadow-soft-lg p-6 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-6">
              {COLUMNS.map((col) =>
            <div key={col.title}>
                  <Link
                to={col.to}
                className="flex items-center gap-2 mb-3 font-semibold text-sm group">
                
                    <span className="p-1.5 rounded-lg bg-primary/10 text-primary group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                      <col.icon className="w-4 h-4" />
                    </span>
                    {col.title}
                  </Link>
                  <ul className="space-y-2">
                    {col.items.map((item) =>
                <li key={item.label}>
                        <Link
                    to={item.to}
                    className="text-sm text-muted-foreground hover:text-primary transition-colors">
                    
                          {item.label}
                        </Link>
                      </li>
                )}
                  </ul>
                </div>
            )}
            </div>
          </div>
        </motion.div>
      }
    </AnimatePresence>);

}
