import React from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Sparkles, ArrowLeft, Hammer } from 'lucide-react';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
interface ComingSoonProps {
  title: string;
  description?: string;
}
export function ComingSoon({ title, description }: ComingSoonProps) {
  return (
    <section className="container mx-auto px-4 py-24 min-h-[70vh] flex items-center justify-center">
      <motion.div
        initial={{
          opacity: 0,
          y: 16
        }}
        animate={{
          opacity: 1,
          y: 0
        }}
        transition={{
          duration: 0.5,
          ease: [0.16, 1, 0.3, 1]
        }}
        className="max-w-xl w-full text-center">
        
        <div className="relative mx-auto mb-8 w-24 h-24">
          <div className="absolute inset-0 bg-primary/15 rounded-3xl blur-xl" />
          <div className="relative w-24 h-24 rounded-3xl bg-card border border-border shadow-soft flex items-center justify-center">
            <Hammer className="w-10 h-10 text-primary" />
          </div>
        </div>

        <Badge
          variant="secondary"
          className="mb-4 bg-primary/10 text-primary border-primary/20">
          
          <Sparkles className="w-3.5 h-3.5 mr-1.5" />
          In progress
        </Badge>

        <h1 className="text-3xl md:text-4xl font-display font-bold tracking-tight mb-3">
          {title}
        </h1>
        <p className="text-muted-foreground text-lg mb-8 leading-relaxed">
          {description ??
          'This experience is being crafted with the same premium polish as the rest of GridStore AI. Check back soon.'}
        </p>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
          <Button asChild size="lg">
            <Link to="/">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Home
            </Link>
          </Button>
          <Button asChild variant="outline" size="lg">
            <Link to="/marketplace">Explore Marketplace</Link>
          </Button>
        </div>
      </motion.div>
    </section>);

}