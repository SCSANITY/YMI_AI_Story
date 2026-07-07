'use client';

import React, { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ShoppingCart } from 'lucide-react';
import { useGlobalContext } from '@/contexts/GlobalContext';
import { Button } from '@/components/Button';
import { useI18n } from '@/lib/useI18n';
import { useCustomizeNavigation } from '@/components/useCustomizeNavigation';
import { CartItemsList } from './CartItemsList';
import { CartSummaryPanel } from './CartSummaryPanel';
import type { CartItem } from '@/types';

type PendingCartAction = {
  itemId: string;
  action: 'quantity' | 'remove' | 'preview' | 'edit';
} | null;

export default function CartPage() {
  const { t } = useI18n();
  const router = useRouter();
  const {
    cart,
    displayCurrency,
    removeFromCart,
    prepareCheckout,
    resumePersonalization,
    updateCartQuantity,
  } = useGlobalContext();
  const { navigateToCustomize, pendingCustomizeHref, prefetchCustomizeHref } = useCustomizeNavigation();

  const [selectedIdsDraft, setSelectedIdsDraft] = useState<string[]>([]);
  const [pendingAction, setPendingAction] = useState<PendingCartAction>(null);
  const selectedIds = useMemo(() => {
    const cartIds = new Set(cart.map((item) => item.id));
    return selectedIdsDraft.filter((id) => cartIds.has(id));
  }, [cart, selectedIdsDraft]);

  const selectedItems = useMemo(
    () => cart.filter(item => selectedIds.includes(item.id)),
    [cart, selectedIds],
  );
  const selectedTotal = useMemo(
    () => selectedItems.reduce((sum, item) => sum + (item.priceAtPurchase ?? item.book.price) * (item.quantity ?? 1), 0),
    [selectedItems]
  );

  const subtotal = cart.reduce((sum, item) => sum + (item.priceAtPurchase ?? item.book.price) * (item.quantity ?? 1), 0);
  const allSelected = cart.length > 0 && selectedIds.length === cart.length;

  const toggleSelectAll = () => {
    if (allSelected) setSelectedIdsDraft([]);
    else setSelectedIdsDraft(cart.map(item => item.id));
  };

  const toggleSelection = (id: string) => {
    setSelectedIdsDraft(prev => prev.includes(id) ? prev.filter(itemId => itemId !== id) : [...prev, id]);
  };

  const handleCheckout = () => {
    const items = selectedItems;
    if (!items.length) return;
    prepareCheckout(items);
    const ids = items.map(item => item.id).join(',');
    const suffix = ids ? `?ids=${encodeURIComponent(ids)}` : '';
    router.push(`/checkout${suffix}`);
  };

  const goToPreview = (itemId: string, bookID: string) => {
    if (pendingAction) return;
    const target = cart.find(entry => entry.id === itemId);
    const creationId = target?.creationId;
    const previewJobId = target?.personalization?.previewJobId;
    const params = new URLSearchParams({ view: 'preview' });
    if (creationId) params.set('creationId', creationId);
    if (previewJobId) params.set('jobId', previewJobId);
    const href = `/personalize/${bookID}?${params.toString()}`;
    setPendingAction({ itemId, action: 'preview' });
    void navigateToCustomize(href, {
      onBeforeNavigate: () => {
        if (target) {
          resumePersonalization(target);
        }
        if (typeof window !== 'undefined' && creationId) {
          try {
            window.sessionStorage.setItem(
              `ymi_preview_${creationId}`,
              JSON.stringify({
                coverUrl: target?.book?.coverUrl ?? null,
                jobId: previewJobId ?? null,
              })
            );
          } catch {
            // ignore cache errors
          }
        }
      },
    }).then((didNavigate) => {
      if (!didNavigate) setPendingAction(null);
    });
  };

  const goToCustomizeEdit = (itemId: string) => {
    if (pendingAction) return;
    const item = cart.find(entry => entry.id === itemId);
    if (!item) return;
    const href = `/personalize/${item.bookID}`;
    setPendingAction({ itemId, action: 'edit' });
    void navigateToCustomize(href, {
      onBeforeNavigate: () => {
        resumePersonalization(item);
      },
    }).then((didNavigate) => {
      if (!didNavigate) setPendingAction(null);
    });
  };

  const handleQuantityChange = async (itemId: string, quantity: number) => {
    if (pendingAction) return;
    setPendingAction({ itemId, action: 'quantity' });
    try {
      await updateCartQuantity(itemId, quantity);
    } finally {
      setPendingAction(null);
    }
  };

  const handleRemove = async (itemId: string) => {
    if (pendingAction) return;
    setPendingAction({ itemId, action: 'remove' });
    try {
      await removeFromCart(itemId);
    } finally {
      setPendingAction(null);
    }
  };

  const prefetchPreview = (item: CartItem) => {
    const params = new URLSearchParams({ view: 'preview' });
    if (item.creationId) params.set('creationId', item.creationId);
    if (item.personalization?.previewJobId) params.set('jobId', item.personalization.previewJobId);
    prefetchCustomizeHref(`/personalize/${item.bookID}?${params.toString()}`);
  };

  if (cart.length === 0) {
    return (
      <div className="page-surface min-h-screen flex items-center justify-center p-8">
        <div className="max-w-lg text-center space-y-6">
          <div className="mx-auto w-16 h-16 rounded-full bg-amber-100 flex items-center justify-center">
            <ShoppingCart className="h-7 w-7 text-amber-600" />
          </div>
          <h1 className="text-2xl md:text-3xl font-title text-gray-900">{t('cart.emptyTitle')}</h1>
          <p className="text-gray-600">{t('cart.emptyDescription')}</p>
          <Button size="lg" onClick={() => router.push('/')} className="rounded-full px-8">{t('common.browseBooks')}</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="page-surface min-h-screen">
      <div className="max-w-6xl mx-auto px-4 md:px-8 pt-24 pb-16">
      <div className="flex items-center gap-3 mb-8">
        <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center">
          <ShoppingCart className="h-5 w-5 text-amber-600" />
        </div>
        <div>
          <h1 className="text-2xl md:text-3xl font-title text-gray-900">{t('cart.title')}</h1>
          <p className="text-gray-500 text-sm">{t('cart.subtitle')}</p>
        </div>
      </div>

      <div className="grid lg:grid-cols-[1.6fr_1fr] gap-8">
        <CartItemsList
          items={cart}
          selectedIds={selectedIds}
          allSelected={allSelected}
          pendingAction={pendingAction}
          pendingCustomizeHref={pendingCustomizeHref}
          displayCurrency={displayCurrency}
          t={t}
          onToggleSelectAll={toggleSelectAll}
          onToggleSelection={toggleSelection}
          onPreview={goToPreview}
          onPreviewHover={prefetchPreview}
          onCustomizeEdit={goToCustomizeEdit}
          onCustomizeHover={(bookId) => prefetchCustomizeHref(`/personalize/${bookId}`)}
          onQuantityChange={handleQuantityChange}
          onRemove={handleRemove}
        />

        <CartSummaryPanel
          subtotal={subtotal}
          selectedTotal={selectedTotal}
          selectedItemsCount={selectedItems.length}
          displayCurrency={displayCurrency}
          t={t}
          onCheckout={handleCheckout}
        />
      </div>
    </div>
    </div>
  );
}
