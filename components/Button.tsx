'use client'
import React, { forwardRef } from 'react';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'outline';
  size?: 'sm' | 'md' | 'lg';
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(({ 
  children, 
  className = '', 
  variant = 'primary', 
  size = 'md',
  ...props 
}, ref) => {
  const baseStyles = 'inline-flex items-center justify-center rounded-full font-medium transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-1 disabled:pointer-events-none disabled:opacity-50';

  const variants = {
    primary: 'bg-gradient-to-r from-amber-500 to-orange-500 text-white hover:from-amber-400 hover:to-orange-400 shadow-md shadow-amber-200/60 hover:shadow-lg hover:shadow-amber-200/70 hover:-translate-y-px active:translate-y-0',
    secondary: 'bg-amber-50 text-amber-900 border border-amber-200/60 hover:bg-amber-100 hover:-translate-y-px',
    ghost: 'text-gray-600 hover:bg-amber-50/80 hover:text-amber-800',
    outline: 'border border-amber-200 bg-white hover:bg-amber-50 text-gray-700 hover:-translate-y-px',
  };

  const sizes = {
    sm: 'h-8 px-4 text-xs',
    md: 'h-10 px-5 text-sm',
    lg: 'h-11 px-8 text-base',
  };

  return (
    <button
      ref={ref}
      className={`${baseStyles} ${variants[variant]} ${sizes[size]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
});

Button.displayName = 'Button';