import React from 'react';
import { Link } from 'react-router-dom';
import {
  Sparkles,
  Facebook,
  Twitter,
  Instagram,
  Linkedin,
  Globe } from
'lucide-react';
export function Footer() {
  return (
    <footer className="bg-card border-t border-border pt-16 pb-8">
      <div className="container mx-auto px-4">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-8 mb-12">
          <div className="lg:col-span-2">
            <Link to="/" className="flex items-center gap-2 mb-4">
              <div className="bg-primary text-primary-foreground p-1.5 rounded-lg">
                <Sparkles className="h-5 w-5" />
              </div>
              <span className="font-display font-bold text-xl tracking-tight">
                GridMarket <span className="text-primary">AI</span>
              </span>
            </Link>
            <p className="text-muted-foreground text-sm mb-6 max-w-sm">
              South Africa's smartest AI-powered commerce platform. Buy, sell, trade,
              rent, and hire with the power of artificial intelligence.
            </p>
            <div className="flex items-center gap-4">
              <a
                href="https://facebook.com/gridstore"
                target="_blank"
                rel="noopener noreferrer"
                className="text-muted-foreground hover:text-primary transition-colors">
                
                <Facebook className="h-5 w-5" />
              </a>
              <a
                href="https://twitter.com/gridstore"
                target="_blank"
                rel="noopener noreferrer"
                className="text-muted-foreground hover:text-primary transition-colors">
                
                <Twitter className="h-5 w-5" />
              </a>
              <a
                href="https://instagram.com/gridstore"
                target="_blank"
                rel="noopener noreferrer"
                className="text-muted-foreground hover:text-primary transition-colors">
                
                <Instagram className="h-5 w-5" />
              </a>
              <a
                href="https://linkedin.com/company/gridstore"
                target="_blank"
                rel="noopener noreferrer"
                className="text-muted-foreground hover:text-primary transition-colors">
                
                <Linkedin className="h-5 w-5" />
              </a>
            </div>
          </div>

          <div>
            <h4 className="font-semibold mb-4">Marketplace</h4>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li>
                <Link
                  to="/marketplace"
                  className="hover:text-primary transition-colors">
                  
                  All Categories
                </Link>
              </li>
              <li>
                <Link
                  to="/marketplace"
                  className="hover:text-primary transition-colors">
                  
                  Trending Products
                </Link>
              </li>
              <li>
                <Link
                  to="/services"
                  className="hover:text-primary transition-colors">
                  
                  Popular Services
                </Link>
              </li>
              <li>
                <Link
                  to="/rentals"
                  className="hover:text-primary transition-colors">
                  
                  Property Rentals
                </Link>
              </li>
              <li>
                <Link
                  to="/jobs"
                  className="hover:text-primary transition-colors">
                  
                  Job Board
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <h4 className="font-semibold mb-4">For Businesses</h4>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li>
                <Link
                  to="/seller"
                  className="hover:text-primary transition-colors">
                  
                  Sell on GridMarket
                </Link>
              </li>
              <li>
                <Link
                  to="/store/create"
                  className="hover:text-primary transition-colors">
                  
                  Create Storefront
                </Link>
              </li>
              <li>
                <Link
                  to="/seller/ai-listing"
                  className="hover:text-primary transition-colors">
                  
                  AI Business Tools
                </Link>
              </li>
              <li>
                <Link
                  to="/advertising"
                  className="hover:text-primary transition-colors">
                  
                  Advertising
                </Link>
              </li>
              <li>
                <Link
                  to="/seller"
                  className="hover:text-primary transition-colors">
                  
                  Seller Dashboard
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <h4 className="font-semibold mb-4">Support</h4>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li>
                <Link
                  to="/help"
                  className="hover:text-primary transition-colors">
                  
                  Help Center
                </Link>
              </li>
              <li>
                <Link
                  to="/trust-safety"
                  className="hover:text-primary transition-colors">
                  
                  Trust & Safety
                </Link>
              </li>
              <li>
                <Link
                  to="/seller"
                  className="hover:text-primary transition-colors">
                  
                  Selling Guide
                </Link>
              </li>
              <li>
                <Link
                  to="/help"
                  className="hover:text-primary transition-colors">
                  
                  Contact Us
                </Link>
              </li>
              <li>
                <Link to="/" className="hover:text-primary transition-colors">
                  AI Assistant
                </Link>
              </li>
            </ul>
          </div>
        </div>

        <div className="border-t border-border pt-8 flex flex-col md:flex-row items-center justify-between gap-4">
          <p className="text-sm text-muted-foreground">
            © 2026 GridMarket AI. All rights reserved.
          </p>
          <div className="flex items-center gap-4 text-sm text-muted-foreground">
            <Link
              to="/privacy"
              className="hover:text-primary transition-colors">
              
              Privacy Policy
            </Link>
            <Link to="/terms" className="hover:text-primary transition-colors">
              Terms of Service
            </Link>
            <Link to="/settings/region" className="flex items-center gap-1 hover:text-primary transition-colors">
              <Globe className="h-4 w-4" />
              <span>South Africa (ZAR)</span>
            </Link>
          </div>
        </div>
      </div>
    </footer>);

}
