import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import {
  Sparkles,
  Search,
  TrendingUp,
  Car,
  Home as HomeIcon,
  Briefcase,
  Smartphone,
  Wrench,
  Shirt,
  Star,
  Zap,
  ArrowRight,
  Heart,
  User } from
'lucide-react';
import { Button } from '../components/ui/button';
import {
  Card,
  CardContent } from
'../components/ui/card';
import { Badge } from '../components/ui/badge';
import { AI_FEATURES, ANALYTICS, BRAND, FLASH_DEALS, NEARBY_LISTINGS, TESTIMONIALS } from '../data/mock/platform';
import { SectionShell } from '../components/design-system/PageHeader';
import { askAiAssistant } from '../services/mockApi';
import { useApp } from '../context/AppContext';
const CATEGORIES = [
{
  name: 'Electronics',
  icon: Smartphone,
  color: 'bg-blue-500/10 text-blue-500',
  to: '/marketplace?category=Electronics'
},
{
  name: 'Vehicles',
  icon: Car,
  color: 'bg-orange-500/10 text-orange-500',
  to: '/marketplace?category=Vehicles'
},
{
  name: 'Real Estate',
  icon: HomeIcon,
  color: 'bg-green-500/10 text-green-500',
  to: '/rentals?q=property'
},
{
  name: 'Services',
  icon: Wrench,
  color: 'bg-purple-500/10 text-purple-500',
  to: '/services'
},
{
  name: 'Jobs',
  icon: Briefcase,
  color: 'bg-pink-500/10 text-pink-500',
  to: '/jobs'
},
{
  name: 'Fashion',
  icon: Shirt,
  color: 'bg-rose-500/10 text-rose-500',
  to: '/marketplace?category=Fashion'
}];

const TRENDING_PRODUCTS = [
{
  id: 'prod-sony-a7iv',
  title: 'Sony Alpha a7 IV Mirrorless Camera',
  price: 'R 45,999',
  rating: 4.9,
  reviews: 128,
  image:
  'https://images.unsplash.com/photo-1516035069371-29a1b244cc32?auto=format&fit=crop&q=80&w=800',
  badge: 'Top Rated',
  seller: 'CameraWorld ZA'
},
{
  id: 'prod-macbook-m3',
  title: 'MacBook Pro M3 Max 16"',
  price: 'R 74,999',
  rating: 5.0,
  reviews: 84,
  image:
  'https://images.unsplash.com/photo-1517336714731-489689fd1ca8?auto=format&fit=crop&q=80&w=800',
  badge: 'Trending',
  seller: 'iStore Verified'
},
{
  id: 'prod-aeron-chair',
  title: 'Herman Miller Aeron Chair',
  price: 'R 22,500',
  rating: 4.8,
  reviews: 312,
  image:
  'https://images.unsplash.com/photo-1505843490538-5133c6c7d0e1?auto=format&fit=crop&q=80&w=800',
  badge: 'Almost Gone',
  seller: 'ErgoOffice'
},
{
  id: 'prod-dji-mini4',
  title: 'DJI Mini 4 Pro Drone',
  price: 'R 18,999',
  rating: 4.7,
  reviews: 95,
  image:
  'https://images.unsplash.com/photo-1507582020474-9a35b7d455d9?auto=format&fit=crop&q=80&w=800',
  badge: 'New',
  seller: 'DroneTech'
}];

const POPULAR_SERVICES = [
{
  id: 'svc-photo',
  title: 'Professional Photography',
  provider: 'Sarah Jenkins',
  rating: 4.9,
  price: 'From R1,500/hr',
  image:
  'https://images.unsplash.com/photo-1554048612-b6a8a4099446?auto=format&fit=crop&q=80&w=800'
},
{
  id: 'svc-renovation',
  title: 'Home Renovation & Design',
  provider: 'BuildRight Co.',
  rating: 4.8,
  price: 'Custom Quote',
  image:
  'https://images.unsplash.com/photo-1503387762-592deb58ef4e?auto=format&fit=crop&q=80&w=800'
},
{
  id: 'svc-web-dev',
  title: 'Full Stack Development',
  provider: 'TechFlow Agency',
  rating: 5.0,
  price: 'From R850/hr',
  image:
  'https://images.unsplash.com/photo-1498050108023-c5249f4df085?auto=format&fit=crop&q=80&w=800'
}];

const containerVariants = {
  hidden: {
    opacity: 0
  },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1
    }
  }
};
const itemVariants = {
  hidden: {
    opacity: 0,
    y: 20
  },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      type: 'spring',
      stiffness: 300,
      damping: 24
    }
  }
};
export function Home() {
  const navigate = useNavigate();
  const { addToCart, toggleWishlist, isInWishlist } = useApp();
  const [heroQuery, setHeroQuery] = useState('');
  const [aiLoading, setAiLoading] = useState(false);

  return (
    <div className="flex flex-col min-h-screen">
      {/* Hero Section */}
      <section className="relative pt-24 pb-32 overflow-hidden">
        {/* Background Elements */}
        <div className="absolute inset-0 bg-grid-white/[0.02] bg-[size:32px_32px]" />
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[1000px] h-[500px] opacity-30 pointer-events-none">
          <div className="absolute inset-0 bg-gradient-to-r from-primary/30 to-accent/30 blur-[100px] rounded-full mix-blend-screen" />
        </div>

        <div className="container mx-auto px-4 relative z-10">
          <motion.div
            initial={{
              opacity: 0,
              y: 30
            }}
            animate={{
              opacity: 1,
              y: 0
            }}
            transition={{
              duration: 0.8,
              ease: 'easeOut'
            }}
            className="max-w-4xl mx-auto text-center">
            
            <Badge
              variant="secondary"
              className="mb-6 px-4 py-1.5 text-sm border-primary/20 bg-primary/10 text-primary">
              
              <Sparkles className="w-4 h-4 mr-2 inline-block" />
              South Africa's Smartest AI Marketplace
            </Badge>

            <h1 className="text-5xl md:text-7xl font-display font-bold tracking-tight mb-8 leading-[1.1]">
              Find anything. <br className="hidden md:block" />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary via-accent to-primary animate-gradient-x">
                Build everything.
              </span>
            </h1>

            <p className="text-xl text-muted-foreground mb-12 max-w-2xl mx-auto leading-relaxed">
              Buy, sell, rent, hire, and grow with GridMarket AI — the premium
              marketplace built for South Africa and ready to compete globally.
            </p>

            {/* Big Search Bar */}
            <motion.form
              initial={{
                opacity: 0,
                scale: 0.95
              }}
              animate={{
                opacity: 1,
                scale: 1
              }}
              transition={{
                delay: 0.2,
                duration: 0.5
              }}
              onSubmit={(event) => {
                event.preventDefault();
                const query = heroQuery.trim();
                navigate(query ? `/marketplace?q=${encodeURIComponent(query)}` : '/marketplace');
              }}
              className="relative max-w-3xl mx-auto group">
              
              <div className="absolute -inset-1 bg-gradient-to-r from-primary to-accent rounded-2xl blur opacity-25 group-hover:opacity-50 transition duration-1000 group-hover:duration-200" />
              <div className="relative flex items-center bg-card rounded-2xl p-2 shadow-soft-lg border border-border/50">
                <div className="pl-4 pr-2 text-muted-foreground">
                  <Search className="w-6 h-6" />
                </div>
                <input
                  type="text"
                  value={heroQuery}
                  onChange={(event) => setHeroQuery(event.target.value)}
                  placeholder="Ask AI to find anything... e.g., 'I need a reliable plumber in Cape Town'"
                  className="flex-1 bg-transparent border-none outline-none text-lg px-2 py-4 placeholder:text-muted-foreground/70" />
                
                <Button type="submit" size="lg" className="rounded-xl px-8 h-14 text-base gap-2">
                  <Sparkles className="w-5 h-5" />
                  Search
                </Button>
              </div>
            </motion.form>

            <div className="mt-8 flex flex-wrap justify-center gap-4 text-sm text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <Zap className="w-4 h-4 text-warning" /> Trending:
              </span>
              <Link
                to="/marketplace?q=solar"
                className="hover:text-primary transition-colors underline underline-offset-4 decoration-border">
                
                Solar Inverters
              </Link>
              <Link
                to="/services?q=web"
                className="hover:text-primary transition-colors underline underline-offset-4 decoration-border">
                
                Web Designers
              </Link>
              <Link
                to="/marketplace?q=suv"
                className="hover:text-primary transition-colors underline underline-offset-4 decoration-border">
                
                Used SUVs
              </Link>
              <Link
                to="/rentals?q=apartments"
                className="hover:text-primary transition-colors underline underline-offset-4 decoration-border">
                
                Apartments CPT
              </Link>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Featured Categories */}
      <section className="py-20 bg-secondary/30">
        <div className="container mx-auto px-4">
          <div className="flex items-center justify-between mb-10">
            <h2 className="text-2xl md:text-3xl font-display font-bold">
              Explore Categories
            </h2>
            <Button asChild variant="ghost" className="hidden sm:flex group">
              <Link to="/marketplace">
                View All{' '}
                <ArrowRight className="ml-2 w-4 h-4 group-hover:translate-x-1 transition-transform" />
              </Link>
            </Button>
          </div>

          <motion.div
            variants={containerVariants}
            initial="hidden"
            whileInView="visible"
            viewport={{
              once: true,
              margin: '-100px'
            }}
            className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            
            {CATEGORIES.map((category, idx) =>
            <motion.div key={idx} variants={itemVariants}>
                <Link to={category.to}>
                  <Card className="group cursor-pointer hover:border-primary/50 hover:-translate-y-0.5 transition-all bg-card/50 backdrop-blur-sm border-border/50">
                    <CardContent className="p-6 flex flex-col items-center text-center gap-4">
                      <div
                      className={`p-4 rounded-2xl ${category.color} group-hover:scale-110 transition-transform duration-300`}>
                      
                        <category.icon className="w-8 h-8" />
                      </div>
                      <span className="font-medium">{category.name}</span>
                    </CardContent>
                  </Card>
                </Link>
              </motion.div>
            )}
          </motion.div>
        </div>
      </section>

      {/* Trending Products */}
      <section className="py-20">
        <div className="container mx-auto px-4">
          <div className="flex items-center justify-between mb-10">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-destructive/10 text-destructive rounded-lg">
                <TrendingUp className="w-5 h-5" />
              </div>
              <h2 className="text-2xl md:text-3xl font-display font-bold">
                Trending Now
              </h2>
            </div>
            <Button asChild variant="outline" className="hidden sm:flex">
              <Link to="/marketplace">See More Deals</Link>
            </Button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {TRENDING_PRODUCTS.map((product) =>
            <Card
              key={product.id}
              className="group overflow-hidden flex flex-col">
              
                <div className="relative aspect-square overflow-hidden bg-muted">
                  <Link
                  to={`/product/${product.id}`}
                  className="block w-full h-full">
                  
                    <img
                    src={product.image}
                    alt={product.title}
                    className="object-cover w-full h-full group-hover:scale-105 transition-transform duration-500" />
                  
                  </Link>
                  <div className="absolute top-3 left-3">
                    <Badge
                    variant="secondary"
                    className="bg-background/80 backdrop-blur-md">
                    
                      {product.badge}
                    </Badge>
                  </div>
                  <button
                  type="button"
                  aria-label="Add to wishlist"
                  onClick={() => {
                    toggleWishlist(product.id);
                    toast.success(
                      isInWishlist(product.id)
                        ? `${product.title} removed from wishlist`
                        : `${product.title} saved to wishlist`
                    );
                  }}
                  className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity glass border border-white/10 h-8 w-8 rounded-full flex items-center justify-center">
                  
                    <Heart className="w-4 h-4" />
                  </button>
                </div>
                <CardContent className="p-5 flex-1 flex flex-col">
                  <div className="flex items-center gap-1 mb-2">
                    <Star className="w-4 h-4 fill-warning text-warning" />
                    <span className="text-sm font-medium">
                      {product.rating}
                    </span>
                    <span className="text-sm text-muted-foreground">
                      ({product.reviews})
                    </span>
                  </div>
                  <Link
                  to={`/product/${product.id}`}
                  className="font-medium line-clamp-2 mb-1 hover:text-primary transition-colors">
                  
                    {product.title}
                  </Link>
                  <p className="text-sm text-muted-foreground mb-4">
                    {product.seller}
                  </p>
                  <div className="mt-auto flex items-center justify-between">
                    <span className="text-lg font-bold">{product.price}</span>
                    <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => {
                      addToCart(product.id);
                      toast.success(`${product.title} added to cart`);
                    }}>
                    
                      Add to Cart
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </section>

      {/* AI Feature Highlight */}
      <section className="py-24 relative overflow-hidden">
        <div className="absolute inset-0 bg-primary/5" />
        <div className="container mx-auto px-4 relative">
          <div className="bg-card border border-border/50 rounded-3xl p-8 md:p-12 shadow-soft-lg flex flex-col md:flex-row items-center gap-12 overflow-hidden relative">
            <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-primary/10 blur-[100px] rounded-full pointer-events-none" />

            <div className="flex-1 space-y-6 relative z-10">
              <Badge variant="outline" className="border-primary text-primary">
                AI Shopping Assistant
              </Badge>
              <h2 className="text-3xl md:text-4xl font-display font-bold">
                Not sure what you need? Let AI find it.
              </h2>
              <p className="text-lg text-muted-foreground">
                Describe your problem, upload a photo, or set a budget. Our AI
                analyzes millions of listings across products, services, and
                rentals to find your perfect match.
              </p>
              <ul className="space-y-3">
                {[
                'Price estimation & negotiation',
                'Fraud detection & trust scoring',
                'Personalized bundle suggestions'].
                map((item, i) =>
                <li
                  key={i}
                  className="flex items-center gap-3 text-sm font-medium">
                  
                    <div className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center text-primary">
                      <Sparkles className="w-3 h-3" />
                    </div>
                    {item}
                  </li>
                )}
              </ul>
              <Button
                size="lg"
                className="mt-4"
                disabled={aiLoading}
                onClick={async () => {
                  setAiLoading(true);
                  try {
                    const response = await askAiAssistant(heroQuery);
                    toast('AI Assistant', { description: response });
                  } finally {
                    setAiLoading(false);
                  }
                }}>
                
                {aiLoading ? 'Thinking...' : 'Try AI Assistant'}
              </Button>
            </div>

            <div className="flex-1 w-full relative z-10">
              <div className="bg-background rounded-2xl border border-border shadow-soft p-4 space-y-4">
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center shrink-0">
                    <User className="w-4 h-4" />
                  </div>
                  <div className="bg-secondary rounded-2xl rounded-tl-none p-3 text-sm">
                    I'm starting a podcast and have R5000. What do I need?
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center shrink-0 text-primary-foreground">
                    <Sparkles className="w-4 h-4" />
                  </div>
                  <div className="bg-primary/10 border border-primary/20 rounded-2xl rounded-tr-none p-4 text-sm space-y-3 w-full">
                    <p>
                      Here's a complete starter bundle within your R5000 budget:
                    </p>
                    <div className="bg-background rounded-xl p-3 border border-border flex items-center gap-3">
                      <div className="w-12 h-12 bg-muted rounded-lg flex items-center justify-center">
                        🎤
                      </div>
                      <div className="flex-1">
                        <p className="font-medium text-xs">
                          Fifine AM8 Dynamic Mic
                        </p>
                        <p className="text-muted-foreground text-[10px]">
                          R 1,299 • Top Rated
                        </p>
                      </div>
                      <Button
                        size="sm"
                        variant="secondary"
                        className="h-7 text-xs"
                        onClick={() => {
                          addToCart('prod-fifine-mic');
                          toast.success('Microphone bundle item added to cart');
                        }}>
                        
                        Add
                      </Button>
                    </div>
                    <div className="bg-background rounded-xl p-3 border border-border flex items-center gap-3">
                      <div className="w-12 h-12 bg-muted rounded-lg flex items-center justify-center">
                        🎧
                      </div>
                      <div className="flex-1">
                        <p className="font-medium text-xs">
                          Audio-Technica M20x
                        </p>
                        <p className="text-muted-foreground text-[10px]">
                          R 1,150 • 24h Delivery
                        </p>
                      </div>
                      <Button
                        size="sm"
                        variant="secondary"
                        className="h-7 text-xs"
                        onClick={() => {
                          addToCart('prod-audio-m20x');
                          toast.success('Audio bundle item added to cart');
                        }}>
                        
                        Add
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground pt-2">
                      Plus an audio interface and boom arm. Want me to add all
                      to cart?
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Popular Services */}
      <section className="py-20">
        <div className="container mx-auto px-4">
          <div className="flex items-center justify-between mb-10">
            <h2 className="text-2xl md:text-3xl font-display font-bold">
              Hire Professionals
            </h2>
            <Button asChild variant="ghost" className="hidden sm:flex group">
              <Link to="/services">
                Browse Services{' '}
                <ArrowRight className="ml-2 w-4 h-4 group-hover:translate-x-1 transition-transform" />
              </Link>
            </Button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {POPULAR_SERVICES.map((service) =>
            <Card
              key={service.id}
              className="group cursor-pointer overflow-hidden">
              
                <Link
                to={`/services/${service.id}`}
                className="block relative h-48 overflow-hidden">
                
                  <img
                  src={service.image}
                  alt={service.title}
                  className="object-cover w-full h-full group-hover:scale-105 transition-transform duration-500" />
                
                  <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
                  <div className="absolute bottom-4 left-4 right-4">
                    <h3 className="text-white font-medium text-lg mb-1">
                      {service.title}
                    </h3>
                    <div className="flex items-center text-white/80 text-sm gap-2">
                      <Star className="w-4 h-4 fill-warning text-warning" />
                      <span>{service.rating}</span>
                      <span>•</span>
                      <span>{service.provider}</span>
                    </div>
                  </div>
                </Link>
                <CardContent className="p-4 flex items-center justify-between">
                  <span className="font-semibold">{service.price}</span>
                  <Button asChild variant="outline" size="sm">
                    <Link to={`/services/${service.id}`}>Book Now</Link>
                  </Button>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </section>

      {/* Platform stats */}
      <section className="border-y bg-muted/30 py-12">
        <div className="container mx-auto grid grid-cols-2 gap-6 px-4 md:grid-cols-4">
          {[
            { label: 'Monthly GMV', value: ANALYTICS.gmv },
            { label: 'Active users', value: ANALYTICS.activeUsers },
            { label: 'Live listings', value: ANALYTICS.listings },
            { label: 'Trust score', value: ANALYTICS.trustScore },
          ].map((stat) => (
            <div key={stat.label} className="text-center">
              <p className="font-display text-2xl font-bold md:text-3xl">{stat.value}</p>
              <p className="mt-1 text-sm text-muted-foreground">{stat.label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Flash sales */}
      <section className="py-20 bg-secondary/20">
        <div className="container mx-auto px-4">
          <SectionShell title="Flash Sales" description="Limited-time deals across electronics, home, and more." action={<Button asChild variant="outline"><Link to="/flash-sales">View all deals</Link></Button>}>
            <div className="grid gap-4 md:grid-cols-3">
              {FLASH_DEALS.map((deal) => (
                <Card key={deal.id} className="overflow-hidden border-border/60 shadow-soft">
                  <CardContent className="p-6">
                    <Badge className="mb-3">{deal.discount}</Badge>
                    <h3 className="font-display text-lg font-semibold">{deal.title}</h3>
                    <p className="mt-2 text-2xl font-bold">R {deal.price.toLocaleString('en-ZA')}</p>
                    <p className="mt-2 text-sm text-muted-foreground">Ends in {deal.endsIn}</p>
                    <Button className="mt-4 w-full" asChild><Link to="/flash-sales">Shop deal</Link></Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          </SectionShell>
        </div>
      </section>

      {/* Nearby listings */}
      <section className="py-20">
        <div className="container mx-auto px-4">
          <SectionShell title="Nearby Listings" description="Discover products, rentals, and services close to you." action={<Button asChild variant="ghost"><Link to="/marketplace">Explore map view</Link></Button>}>
            <div className="grid gap-4 md:grid-cols-3">
              {NEARBY_LISTINGS.map((item) => (
                <Card key={item.id} className="border-border/60 shadow-soft">
                  <CardContent className="flex items-center justify-between p-5">
                    <div>
                      <p className="font-medium">{item.title}</p>
                      <p className="text-sm text-muted-foreground">{item.area} · {item.distance}</p>
                    </div>
                    <p className="font-display font-bold">R {item.price.toLocaleString('en-ZA')}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </SectionShell>
        </div>
      </section>

      {/* AI features grid */}
      <section className="py-20 bg-secondary/20">
        <div className="container mx-auto px-4">
          <SectionShell title="AI-Powered Commerce" description={`${BRAND.name} ${BRAND.suffix} intelligence built into every workflow.`}>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {AI_FEATURES.map((feature) => (
                <Link key={feature.title} to={feature.to} className="group rounded-2xl border bg-card p-5 shadow-soft transition hover:-translate-y-0.5 hover:border-primary/40">
                  <div className="mb-3 inline-flex rounded-xl bg-primary/10 p-2 text-primary"><Sparkles className="h-4 w-4" /></div>
                  <h3 className="font-display font-semibold group-hover:text-primary">{feature.title}</h3>
                  <p className="mt-2 text-sm text-muted-foreground">{feature.description}</p>
                </Link>
              ))}
            </div>
          </SectionShell>
        </div>
      </section>

      {/* Testimonials */}
      <section className="py-20">
        <div className="container mx-auto px-4">
          <SectionShell title="Success Stories" description="Trusted by buyers, sellers, and businesses across South Africa.">
            <div className="grid gap-6 md:grid-cols-3">
              {TESTIMONIALS.map((item) => (
                <Card key={item.name} className="border-border/60 shadow-soft">
                  <CardContent className="p-6">
                    <p className="text-sm leading-relaxed text-muted-foreground">"{item.quote}"</p>
                    <div className="mt-6 flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">{item.avatar}</div>
                      <div>
                        <p className="font-medium">{item.name}</p>
                        <p className="text-xs text-muted-foreground">{item.role}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </SectionShell>
        </div>
      </section>

      {/* Newsletter */}
      <section className="pb-24">
        <div className="container mx-auto px-4">
          <Card className="overflow-hidden border-border/60 shadow-soft-lg">
            <CardContent className="flex flex-col items-center gap-6 p-10 text-center md:p-14">
              <Badge variant="secondary">Newsletter</Badge>
              <h2 className="font-display text-3xl font-bold tracking-tight">Stay ahead of the marketplace</h2>
              <p className="max-w-xl text-muted-foreground">Weekly deals, AI product drops, seller tips, and platform updates.</p>
              <form className="flex w-full max-w-md flex-col gap-3 sm:flex-row" onSubmit={(e) => { e.preventDefault(); toast.success('Subscribed to GridMarket AI updates'); }}>
                <input type="email" required placeholder="you@email.com" className="h-11 flex-1 rounded-md border border-input bg-background px-3 text-sm" />
                <Button type="submit">Subscribe</Button>
              </form>
            </CardContent>
          </Card>
        </div>
      </section>
    </div>);

}
