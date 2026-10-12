type ProductPriceProps = {
  price: number | string | null | undefined;
  originalPrice?: number | string | null | undefined;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
};

export function formatRs(value: number | string | null | undefined): string {
  const numeric = Number(value ?? 0);
  if (!Number.isFinite(numeric)) return 'Rs. 0';
  return `Rs.${numeric.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
}

export function discountPercent(
  price: number | string | null | undefined,
  originalPrice: number | string | null | undefined,
): number | null {
  const sale = Number(price ?? 0);
  const original = Number(originalPrice ?? 0);
  if (!Number.isFinite(sale) || !Number.isFinite(original) || original <= 0 || sale >= original) return null;
  return Math.round(((original - sale) / original) * 100);
}

/**
 * Reference layout: large orange sale price on top, smaller crossed-out
 * original price + discount percent underneath.
 */
export default function ProductPrice({ price, originalPrice, size = 'md', className = '' }: ProductPriceProps) {
  const percent = discountPercent(price, originalPrice);
  const hasDiscount = percent !== null;
  const sizes = {
    sm: { sale: 'text-lg', meta: 'text-xs' },
    md: { sale: 'text-2xl', meta: 'text-sm' },
    lg: { sale: 'text-3xl', meta: 'text-base' },
  }[size];

  return (
    <span className={`inline-flex flex-col leading-none ${className}`}>
      <span className={`${sizes.sale} font-semibold text-[#e65c00]`}>{formatRs(price)}</span>
      {hasDiscount ? (
        <span className={`${sizes.meta} mt-1 inline-flex items-center gap-2`}>
          <span className="text-[#9a9a9a] line-through decoration-[#e11d48] decoration-2">
            {formatRs(originalPrice)}
          </span>
          <span className="font-semibold text-[#111111]">-{percent}%</span>
        </span>
      ) : null}
    </span>
  );
}
