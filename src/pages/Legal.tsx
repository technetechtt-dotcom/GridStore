import React from 'react';
import { motion } from 'framer-motion';
export function Privacy() {
  return (
    <div className="container mx-auto px-4 py-16 max-w-3xl min-h-[70vh]">
      <motion.div
        initial={{
          opacity: 0,
          y: 20
        }}
        animate={{
          opacity: 1,
          y: 0
        }}
        transition={{
          duration: 0.5
        }}
        className="prose prose-slate dark:prose-invert max-w-none">
        
        <h1 className="text-4xl font-display font-bold tracking-tight mb-8">
          Privacy Policy
        </h1>
        <p className="text-muted-foreground mb-8">
          Last updated: June 30, 2026
        </p>

        <div className="space-y-8 text-foreground/80 leading-relaxed">
          <section>
            <h2 className="text-2xl font-semibold text-foreground mb-4">
              1. Introduction
            </h2>
            <p>
              Welcome to GridStore AI. We respect your privacy and are
              committed to protecting your personal data. This privacy policy
              will inform you as to how we look after your personal data when
              you visit our website and tell you about your privacy rights and
              how the law protects you.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-foreground mb-4">
              2. The Data We Collect
            </h2>
            <p className="mb-4">
              We may collect, use, store and transfer different kinds of
              personal data about you which we have grouped together as follows:
            </p>
            <ul className="list-disc pl-6 space-y-2">
              <li>
                <strong>Identity Data</strong> includes first name, last name,
                username or similar identifier.
              </li>
              <li>
                <strong>Contact Data</strong> includes billing address, delivery
                address, email address and telephone numbers.
              </li>
              <li>
                <strong>Financial Data</strong> includes bank account and
                payment card details.
              </li>
              <li>
                <strong>Transaction Data</strong> includes details about
                payments to and from you and other details of products and
                services you have purchased from us.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-foreground mb-4">
              3. How We Use Your Data
            </h2>
            <p>
              We will only use your personal data when the law allows us to.
              Most commonly, we will use your personal data to perform the
              contract we are about to enter into or have entered into with you,
              where it is necessary for our legitimate interests, or where we
              need to comply with a legal obligation.
            </p>
          </section>
        </div>
      </motion.div>
    </div>);

}
export function Terms() {
  return (
    <div className="container mx-auto px-4 py-16 max-w-3xl min-h-[70vh]">
      <motion.div
        initial={{
          opacity: 0,
          y: 20
        }}
        animate={{
          opacity: 1,
          y: 0
        }}
        transition={{
          duration: 0.5
        }}
        className="prose prose-slate dark:prose-invert max-w-none">
        
        <h1 className="text-4xl font-display font-bold tracking-tight mb-8">
          Terms of Service
        </h1>
        <p className="text-muted-foreground mb-8">
          Last updated: June 30, 2026
        </p>

        <div className="space-y-8 text-foreground/80 leading-relaxed">
          <section>
            <h2 className="text-2xl font-semibold text-foreground mb-4">
              1. Agreement to Terms
            </h2>
            <p>
              By accessing or using GridStore AI, you agree to be bound by
              these Terms of Service and all applicable laws and regulations. If
              you do not agree with any of these terms, you are prohibited from
              using or accessing this site.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-foreground mb-4">
              2. Use License
            </h2>
            <p className="mb-4">
              Permission is granted to temporarily download one copy of the
              materials (information or software) on GridStore AI's website for
              personal, non-commercial transitory viewing only. This is the
              grant of a license, not a transfer of title, and under this
              license you may not:
            </p>
            <ul className="list-disc pl-6 space-y-2">
              <li>modify or copy the materials;</li>
              <li>
                use the materials for any commercial purpose, or for any public
                display (commercial or non-commercial);
              </li>
              <li>
                attempt to decompile or reverse engineer any software contained
                on GridStore AI's website;
              </li>
              <li>
                remove any copyright or other proprietary notations from the
                materials.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-foreground mb-4">
              3. Disclaimer
            </h2>
            <p>
              The materials on GridStore AI's website are provided on an 'as
              is' basis. GridStore AI makes no warranties, expressed or
              implied, and hereby disclaims and negates all other warranties
              including, without limitation, implied warranties or conditions of
              merchantability, fitness for a particular purpose, or
              non-infringement of intellectual property or other violation of
              rights.
            </p>
          </section>
        </div>
      </motion.div>
    </div>);

}