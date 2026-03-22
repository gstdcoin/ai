/**
 * GSTD Ecosystem — Framer Motion Animation Presets
 *
 * Centralized animation definitions for consistent micro-animations
 * across all pages. Import and wrap components for premium UI feel.
 *
 * Usage:
 *   import { FadeIn, SlideUp, StaggerContainer, StaggerItem } from '../components/common/Animations';
 *
 *   <FadeIn>
 *     <MyComponent />
 *   </FadeIn>
 *
 *   <StaggerContainer>
 *     {items.map(item => <StaggerItem key={item.id}><Card /></StaggerItem>)}
 *   </StaggerContainer>
 */

import { motion, type Variants } from 'framer-motion';
import React from 'react';

// ═══════════════════════════════════════════════════════════════
// ANIMATION VARIANTS
// ═══════════════════════════════════════════════════════════════

const fadeInVariants: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { duration: 0.4, ease: 'easeOut' },
  },
};

const slideUpVariants: Variants = {
  hidden: { opacity: 0, y: 24 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.5, ease: [0.25, 0.46, 0.45, 0.94] },
  },
};

const slideInLeftVariants: Variants = {
  hidden: { opacity: 0, x: -30 },
  visible: {
    opacity: 1,
    x: 0,
    transition: { duration: 0.5, ease: [0.25, 0.46, 0.45, 0.94] },
  },
};

const scaleInVariants: Variants = {
  hidden: { opacity: 0, scale: 0.92 },
  visible: {
    opacity: 1,
    scale: 1,
    transition: { duration: 0.4, ease: [0.25, 0.46, 0.45, 0.94] },
  },
};

const staggerContainerVariants: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.08,
      delayChildren: 0.1,
    },
  },
};

const staggerItemVariants: Variants = {
  hidden: { opacity: 0, y: 16 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.4, ease: [0.25, 0.46, 0.45, 0.94] },
  },
};

// Pulse animation for live data indicators
const pulseVariants: Variants = {
  hidden: { opacity: 0.5, scale: 0.95 },
  visible: {
    opacity: 1,
    scale: 1,
    transition: {
      duration: 1.5,
      repeat: Infinity,
      repeatType: 'reverse',
      ease: 'easeInOut',
    },
  },
};

// ═══════════════════════════════════════════════════════════════
// ANIMATION COMPONENTS
// ═══════════════════════════════════════════════════════════════

interface AnimationProps {
  children: React.ReactNode;
  className?: string;
  delay?: number;
  id?: string;
}

/** Smooth fade-in on mount */
export function FadeIn({ children, className, delay = 0 }: AnimationProps) {
  return (
    <motion.div
      className={className}
      variants={fadeInVariants}
      initial="hidden"
      animate="visible"
      transition={{ delay }}
    >
      {children}
    </motion.div>
  );
}

/** Slide up from below with fade */
export function SlideUp({ children, className, delay = 0 }: AnimationProps) {
  return (
    <motion.div
      className={className}
      variants={slideUpVariants}
      initial="hidden"
      animate="visible"
      transition={{ delay }}
    >
      {children}
    </motion.div>
  );
}

/** Slide in from the left */
export function SlideInLeft({ children, className, delay = 0 }: AnimationProps) {
  return (
    <motion.div
      className={className}
      variants={slideInLeftVariants}
      initial="hidden"
      animate="visible"
      transition={{ delay }}
    >
      {children}
    </motion.div>
  );
}

/** Scale in from slightly smaller */
export function ScaleIn({ children, className, delay = 0 }: AnimationProps) {
  return (
    <motion.div
      className={className}
      variants={scaleInVariants}
      initial="hidden"
      animate="visible"
      transition={{ delay }}
    >
      {children}
    </motion.div>
  );
}

/** Container for staggered child animations (waterfall effect) */
export function StaggerContainer({ children, className, id }: AnimationProps) {
  return (
    <motion.div
      id={id}
      className={className}
      variants={staggerContainerVariants}
      initial="hidden"
      animate="visible"
    >
      {children}
    </motion.div>
  );
}

/** Individual item inside a StaggerContainer */
export function StaggerItem({ children, className }: AnimationProps) {
  return (
    <motion.div
      className={className}
      variants={staggerItemVariants}
    >
      {children}
    </motion.div>
  );
}

/** Pulsing indicator for live data */
export function PulseIndicator({ children, className }: AnimationProps) {
  return (
    <motion.div
      className={className}
      variants={pulseVariants}
      initial="hidden"
      animate="visible"
    >
      {children}
    </motion.div>
  );
}

/** Number counter animation — smoothly counts up to target value */
export function AnimatedNumber({ value, decimals = 0, className }: { value: number; decimals?: number; className?: string }) {
  return (
    <motion.span
      className={className}
      key={value}
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      {value.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}
    </motion.span>
  );
}

/** Hover scale effect for interactive cards */
export function HoverCard({ children, className }: AnimationProps) {
  return (
    <motion.div
      className={className}
      whileHover={{ scale: 1.02, y: -2 }}
      whileTap={{ scale: 0.98 }}
      transition={{ type: 'spring', stiffness: 400, damping: 25 }}
    >
      {children}
    </motion.div>
  );
}

/** Page transition wrapper — use in _app.tsx or individual pages */
export function PageTransition({ children, className }: AnimationProps) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.3, ease: 'easeInOut' }}
    >
      {children}
    </motion.div>
  );
}
