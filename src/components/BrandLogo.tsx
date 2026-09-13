import React from 'react';

const logo = '/brand/engineerus-logo-transparent.png';

type BrandLogoProps = {
  className?: string;
  decorative?: boolean;
  eager?: boolean;
};

export function BrandLogo({ className = '', decorative = false, eager = false }: BrandLogoProps) {
  return (
    <img
      src={logo}
      width={500}
      height={500}
      alt={decorative ? '' : 'Engineerus Quest'}
      aria-hidden={decorative || undefined}
      className={`eq-brand-logo ${className}`.trim()}
      decoding="async"
      loading={eager ? 'eager' : 'lazy'}
    />
  );
}
