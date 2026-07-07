export const BRAND = {
  name: 'GridMarket',
  suffix: 'AI',
  tagline: "South Africa's smartest AI-powered marketplace",
  description: 'Buy, sell, rent, hire, and grow — powered by intelligent commerce.',
};

export const ANALYTICS = {
  gmv: 'R 48.2M',
  activeUsers: '128,400',
  listings: '54,200',
  trustScore: '4.9',
};

export const TESTIMONIALS = [
  {
    name: 'Thandi M.',
    role: 'Small business owner, Soweto',
    quote:
      'GridMarket AI helped me launch my store in a weekend. The AI listing generator and pricing tools are unreal.',
    avatar: 'TM',
  },
  {
    name: 'James K.',
    role: 'Buyer, Cape Town',
    quote:
      'It feels like Takealot meets Airbnb — but smarter. I found a photographer, rented gear, and bought electronics in one app.',
    avatar: 'JK',
  },
  {
    name: 'Nomsa D.',
    role: 'Seller, Durban',
    quote:
      'Trust scores and verified badges changed everything. My conversion rate doubled in 30 days.',
    avatar: 'ND',
  },
];

export const FLASH_DEALS = [
  { id: 'deal-1', title: 'Sony a7 IV Bundle', discount: '18% off', endsIn: '02:14:33', price: 45999 },
  { id: 'deal-2', title: 'Solar 5kW Kit', discount: 'R 4,000 off', endsIn: '05:42:11', price: 38999 },
  { id: 'deal-3', title: 'MacBook Pro M3', discount: '12% off', endsIn: '01:08:55', price: 74999 },
];

export const NEARBY_LISTINGS = [
  { id: 'near-1', title: 'BMW 320i M Sport', distance: '2.4 km', area: 'Sandton', price: 485000 },
  { id: 'near-2', title: 'Studio Apartment', distance: '5.1 km', area: 'Rosebank', price: 12500 },
  { id: 'near-3', title: 'Professional Camera Kit', distance: '1.2 km', area: 'Melville', price: 850 },
];

export const ADMIN_STATS = [
  { label: 'Total GMV', value: 'R 48.2M', change: '+12.4% vs last month', trend: 'up' as const },
  { label: 'Active Users', value: '128,400', change: '+8.1%', trend: 'up' as const },
  { label: 'Open Disputes', value: '23', change: '-18%', trend: 'down' as const },
  { label: 'AI Interventions', value: '1,842', change: 'Fraud prevented', trend: 'neutral' as const },
];

export const ADMIN_USERS = [
  { id: 'u1', name: 'Thandi Mokoena', email: 'thandi@example.co.za', role: 'seller', status: 'verified', trust: 96 },
  { id: 'u2', name: 'James Khumalo', email: 'james@example.co.za', role: 'buyer', status: 'active', trust: 88 },
  { id: 'u3', name: 'PowerSmart Energy', email: 'ops@powersmart.co.za', role: 'business', status: 'verified', trust: 99 },
];

export const PAYMENT_METHODS = [
  { id: 'card', label: 'Visa ending 4242', type: 'card', default: true },
  { id: 'eft', label: 'Instant EFT', type: 'bank', default: false },
  { id: 'wallet', label: 'GridMarket Wallet', type: 'wallet', balance: 2450, default: false },
];

export const DELIVERY_ORDERS = [
  { id: 'TRK-9281', status: 'In transit', eta: 'Today, 16:30', courier: 'Courier Guy', destination: 'Cape Town' },
  { id: 'TRK-9280', status: 'Out for delivery', eta: 'Today, 14:00', courier: 'Pargo Pickup', destination: 'Johannesburg' },
  { id: 'TRK-9279', status: 'Delivered', eta: 'Yesterday', courier: 'RAM', destination: 'Durban' },
];

export const AI_FEATURES = [
  { title: 'AI Shopping Assistant', description: 'Natural language search across products, services, and rentals.', to: '/marketplace' },
  { title: 'AI Listing Generator', description: 'Create optimized listings with titles, tags, and pricing.', to: '/seller/ai-listing' },
  { title: 'AI Price Estimator', description: 'Market-aware pricing for faster sales.', to: '/seller/pricing' },
  { title: 'AI Fraud Detection', description: 'Real-time trust scoring and risk alerts.', to: '/trust-safety' },
  { title: 'AI Business Insights', description: 'Forecast sales and inventory needs.', to: '/seller' },
  { title: 'AI Customer Support', description: '24/7 intelligent help across the platform.', to: '/help' },
];
