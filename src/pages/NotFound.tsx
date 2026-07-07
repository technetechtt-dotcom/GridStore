import React from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Compass, ArrowLeft } from 'lucide-react';
import { Button } from '../components/ui/button';
export function NotFound() {
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
        className="max-w-md w-full text-center">
        
        <div className="relative mx-auto mb-8 w-24 h-24">
          <div className="absolute inset-0 bg-primary/15 rounded-3xl blur-xl" />
          <div className="relative w-24 h-24 rounded-3xl bg-card border border-border shadow-soft flex items-center justify-center">
            <Compass className="w-10 h-10 text-primary" />
          </div>
        </div>
        <p className="font-display font-bold text-5xl tracking-tight mb-2">
          404
        </p>
        <h1 className="text-2xl font-semibold mb-3">Page not found</h1>
        <p className="text-muted-foreground mb-8">
          The page you’re looking for has moved or doesn’t exist.
        </p>
        <Button asChild size="lg">
          <Link to="/">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Home
          </Link>
        </Button>
      </motion.div>
    </section>);

}