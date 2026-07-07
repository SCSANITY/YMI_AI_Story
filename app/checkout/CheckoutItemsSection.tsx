'use client';

import { useRef, useState } from 'react';
import { Button } from '@/components/Button';
import OrderCoverImage from '@/components/OrderCoverImage';
import type { CartItem } from '@/types';
import { CheckoutCurrency, formatCurrencyAmount } from '@/lib/locale-pricing';

type CoverStatus = 'ready' | 'pending' | 'unavailable';

type CheckoutItemsSectionProps = {
  items: CartItem[];
  remainingCartItems: CartItem[];
  selectedCurrency: CheckoutCurrency;
  t: (key: string, params?: Record<string, string | number | null | undefined>) => string;
  resolveCoverUrl: (item: CartItem) => string | null;
  resolveCoverStatus: (item: CartItem) => CoverStatus;
  onQuantityChange: (itemId: string, quantity: number) => void;
  onRemoveItem: (itemId: string) => Promise<boolean>;
  onAddFromCartItems: (items: CartItem[]) => Promise<boolean>;
};

export function CheckoutItemsSection({
  items,
  remainingCartItems,
  selectedCurrency,
  t,
  resolveCoverUrl,
  resolveCoverStatus,
  onQuantityChange,
  onRemoveItem,
  onAddFromCartItems,
}: CheckoutItemsSectionProps) {
  const [isAddFromCartOpen, setIsAddFromCartOpen] = useState(false);
  const [addFromCartSelection, setAddFromCartSelection] = useState<string[]>([]);
  const [removingCheckoutItemId, setRemovingCheckoutItemId] = useState<string | null>(null);
  const [isAddingFromCart, setIsAddingFromCart] = useState(false);
  const removingCheckoutItemIdRef = useRef<string | null>(null);
  const isAddingFromCartRef = useRef(false);

  const closeAddFromCart = () => {
    if (isAddingFromCartRef.current) return;
    setIsAddFromCartOpen(false);
    setAddFromCartSelection([]);
  };

  const toggleAddFromCart = (itemId: string) => {
    setAddFromCartSelection(prev =>
      prev.includes(itemId) ? prev.filter(id => id !== itemId) : [...prev, itemId]
    );
  };

  const handleRemoveItem = async (itemId: string) => {
    if (removingCheckoutItemIdRef.current) return;
    removingCheckoutItemIdRef.current = itemId;
    setRemovingCheckoutItemId(itemId);
    try {
      await onRemoveItem(itemId);
    } finally {
      removingCheckoutItemIdRef.current = null;
      setRemovingCheckoutItemId(null);
    }
  };

  const confirmAddFromCart = async () => {
    if (isAddingFromCartRef.current) return;

    const selected = remainingCartItems.filter(item => addFromCartSelection.includes(item.id));
    if (!selected.length) {
      closeAddFromCart();
      return;
    }

    isAddingFromCartRef.current = true;
    setIsAddingFromCart(true);
    try {
      const ok = await onAddFromCartItems(selected);
      if (ok) {
        setIsAddFromCartOpen(false);
        setAddFromCartSelection([]);
      }
    } finally {
      isAddingFromCartRef.current = false;
      setIsAddingFromCart(false);
    }
  };

  return (
    <>
      <div className="pt-4 border-t border-gray-100">
        <h2 className="text-lg font-bold text-gray-900 mb-3">{t('checkout.itemsTitle')}</h2>
        {items.length === 0 ? (
          <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50 px-4 py-6 text-center text-sm text-gray-500">
            {t('checkout.noBookSelected')}
          </div>
        ) : (
          <div className="space-y-3">
            {items.map(item => (
              <div key={item.id} className="rounded-[24px] border border-white/80 bg-white/72 px-3 py-3 shadow-[0_8px_24px_rgba(148,93,34,0.06)] backdrop-blur-xl sm:px-4">
                <div className="flex items-start gap-3 sm:gap-4">
                  <OrderCoverImage
                    cartItemId={item.id}
                    src={resolveCoverUrl(item)}
                    status={resolveCoverStatus(item)}
                    alt={item.book.title}
                    sizes="(max-width: 639px) 80px, 64px"
                    className="h-24 w-20 rounded-xl sm:h-20 sm:w-16"
                    imageClassName="object-cover"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold text-gray-900 text-sm sm:text-[15px] leading-snug">{item.book.title}</div>
                    <div className="mt-1 text-xs text-gray-500">{t('cart.heroLabel')}: {item.personalization?.childName || t('common.unknown')}</div>
                    <div className="mt-2 text-sm font-semibold text-gray-900 sm:hidden">
                      {formatCurrencyAmount((item.priceAtPurchase ?? item.book.price) * (item.quantity ?? 1), selectedCurrency)}
                    </div>
                  </div>
                  <div className="hidden text-sm font-semibold text-gray-900 sm:block">
                    {formatCurrencyAmount((item.priceAtPurchase ?? item.book.price) * (item.quantity ?? 1), selectedCurrency)}
                  </div>
                </div>
                <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="inline-flex w-fit items-center rounded-full border border-white/80 bg-white/90 px-1 py-0.5 shadow-sm">
                    <button
                      type="button"
                      className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-amber-50 text-amber-700 transition hover:bg-amber-100"
                      onClick={() => onQuantityChange(item.id, Math.max(1, (item.quantity ?? 1) - 1))}
                      aria-label={t('checkout.decreaseQuantity')}
                    >
                      <span className="text-base font-semibold leading-none">-</span>
                    </button>
                    <input
                      type="number"
                      min={1}
                      value={item.quantity ?? 1}
                      onChange={(event) => {
                        const nextValue = Number.parseInt(event.target.value, 10);
                        onQuantityChange(item.id, Number.isNaN(nextValue) ? 1 : nextValue);
                      }}
                      className="h-8 w-12 appearance-none bg-transparent text-center text-xs font-semibold leading-none text-gray-700 outline-none"
                    />
                    <button
                      type="button"
                      className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-amber-50 text-amber-700 transition hover:bg-amber-100"
                      onClick={() => onQuantityChange(item.id, (item.quantity ?? 1) + 1)}
                      aria-label={t('checkout.increaseQuantity')}
                    >
                      <span className="text-base font-semibold leading-none">+</span>
                    </button>
                  </div>
                  <button
                    className="w-fit text-xs font-semibold text-red-500 transition hover:text-red-600"
                    onClick={() => void handleRemoveItem(item.id)}
                    disabled={removingCheckoutItemId === item.id}
                  >
                    {removingCheckoutItemId === item.id ? t('checkout.removingItem') : t('common.remove')}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
        <div className="pt-4">
          <Button
            variant="outline"
            className="glass-action-btn glass-action-btn--neutral h-11 w-full rounded-full px-5 text-sm font-semibold text-slate-700 md:h-12 md:text-base"
            disabled={remainingCartItems.length === 0}
            onClick={() => setIsAddFromCartOpen(true)}
          >
            {t('checkout.addFromCart')}
          </Button>
        </div>
      </div>

      {isAddFromCartOpen && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="glass-panel w-full max-w-2xl overflow-hidden rounded-[28px] border border-white/70 p-4 shadow-2xl sm:p-5 md:p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-gray-900">{t('checkout.addFromCart')}</h3>
              <button
                className="text-sm text-gray-500 hover:text-gray-700"
                onClick={closeAddFromCart}
                disabled={isAddingFromCart}
              >
                {t('common.close')}
              </button>
            </div>

            {remainingCartItems.length === 0 ? (
              <p className="text-sm text-gray-500">{t('checkout.noBookSelected')}</p>
            ) : (
              <div className="max-h-[320px] overflow-y-auto space-y-3">
                {remainingCartItems.map(item => (
                  <label key={item.id} className="flex cursor-pointer flex-col gap-3 rounded-[22px] border border-white/80 bg-white/80 p-3 shadow-[0_8px_24px_rgba(148,93,34,0.06)] backdrop-blur-xl sm:flex-row sm:items-center">
                    <input
                      type="checkbox"
                      className="accent-amber-500"
                      checked={addFromCartSelection.includes(item.id)}
                      disabled={isAddingFromCart}
                      onChange={() => toggleAddFromCart(item.id)}
                    />
                    <OrderCoverImage
                      cartItemId={item.id}
                      src={resolveCoverUrl(item)}
                      status={resolveCoverStatus(item)}
                      alt={item.book.title}
                      sizes="(max-width: 639px) 80px, 56px"
                      className="h-24 w-20 rounded-xl sm:h-18 sm:w-14"
                      imageClassName="object-cover"
                    />
                    <div className="flex-1">
                      <div className="text-sm font-semibold text-gray-900">{item.book.title}</div>
                      <div className="text-xs text-gray-500">{t('cart.heroLabel')}: {item.personalization?.childName || t('common.unknown')}</div>
                    </div>
                    <div className="text-sm font-semibold text-gray-900">{formatCurrencyAmount((item.priceAtPurchase ?? item.book.price), selectedCurrency)}</div>
                  </label>
                ))}
              </div>
            )}

            <div className="flex justify-end gap-3 pt-2">
              <Button
                variant="ghost"
                className="glass-action-btn glass-action-btn--neutral h-10 rounded-full px-5 text-sm font-semibold text-slate-700"
                onClick={closeAddFromCart}
                disabled={isAddingFromCart}
              >
                {t('common.close')}
              </Button>
              <Button
                onClick={() => void confirmAddFromCart()}
                disabled={addFromCartSelection.length === 0 || isAddingFromCart}
                className="glass-action-btn glass-action-btn--brand h-10 rounded-full px-5 text-sm font-semibold"
              >
                {isAddingFromCart ? t('common.loading') : t('checkout.continue')}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
