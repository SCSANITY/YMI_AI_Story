'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ShoppingCart } from 'lucide-react';
import { useGlobalContext } from '@/contexts/GlobalContext';
import { Button } from '@/components/Button';
import { useI18n } from '@/lib/useI18n';
import { useCustomizeNavigation } from '@/components/useCustomizeNavigation';
import { CartItemsList } from './CartItemsList';
import { CartSummaryPanel } from './CartSummaryPanel';
import type { CartItem } from '@/types';
import { useDedicationChoices } from '@/lib/use-dedication-choices';
import { cartItemUnitPrice, hasCartItemPrice, CART_PRICE_LOAD_ERROR } from '@/lib/cart-price';

type PendingCartAction = {
  itemId: string;
  action: 'quantity' | 'remove' | 'preview' | 'edit';
} | null;

function CartLoadingContent() {
  return (
    <div className="grid gap-8 lg:grid-cols-[1.6fr_1fr]" aria-label="Loading cart">
      <div className="space-y-4">
        <div className="h-5 w-28 animate-pulse rounded-full bg-slate-100" />
        {Array.from({ length: 2 }).map((_, index) => (
          <div key={index} className="glass-panel flex gap-3 rounded-2xl p-4 sm:gap-4 md:p-6">
            <div className="mt-2 h-5 w-5 shrink-0 animate-pulse rounded bg-amber-100/80" />
            <div className="h-28 w-20 shrink-0 animate-pulse rounded-xl bg-amber-50 sm:h-32 sm:w-24" />
            <div className="min-w-0 flex-1 space-y-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0 flex-1 space-y-2">
                  <div className="h-5 w-48 max-w-full animate-pulse rounded-full bg-slate-200" />
                  <div className="h-3 w-24 animate-pulse rounded-full bg-slate-100" />
                </div>
                <div className="h-6 w-20 animate-pulse rounded-full bg-slate-200" />
              </div>
              <div className="space-y-2">
                <div className="h-3 w-36 animate-pulse rounded-full bg-slate-100" />
                <div className="h-3 w-28 animate-pulse rounded-full bg-slate-100" />
                <div className="h-3 w-32 animate-pulse rounded-full bg-slate-100" />
              </div>
              <div className="flex gap-3">
                <div className="h-8 w-24 animate-pulse rounded-full bg-slate-100" />
                <div className="h-8 w-24 animate-pulse rounded-full bg-rose-50" />
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="glass-panel h-fit rounded-2xl p-6">
        <div className="h-6 w-28 animate-pulse rounded-full bg-slate-200" />
        <div className="mt-5 space-y-3">
          <div className="h-4 w-full animate-pulse rounded-full bg-slate-100" />
          <div className="h-4 w-full animate-pulse rounded-full bg-slate-100" />
          <div className="h-4 w-full animate-pulse rounded-full bg-slate-100" />
          <div className="border-t border-gray-100 pt-4">
            <div className="h-5 w-36 animate-pulse rounded-full bg-amber-100/80 ml-auto" />
          </div>
        </div>
        <div className="mt-6 h-11 w-full animate-pulse rounded-full bg-amber-100/80" />
      </div>
    </div>
  );
}

export default function CartPage() {
  const { t } = useI18n();
  const router = useRouter();
  const {
    cart,
    cartLoadError,
    refreshCart,
    displayCurrency,
    isHydrated,
    removeFromCart,
    prepareCheckout,
    resumePersonalization,
    updateCartQuantity,
  } = useGlobalContext();
  const { navigateToCustomize, pendingCustomizeHref, prefetchCustomizeHref } = useCustomizeNavigation();

  // Until the user changes selection, include every item as the cart hydrates.
  const [selectedIdsDraft, setSelectedIdsDraft] = useState<string[] | null>(null);
  const [pendingAction, setPendingAction] = useState<PendingCartAction>(null);
  const [cartActionError, setCartActionError] = useState<string | null>(null);
  const dedicationIds = useMemo(() => cart.map(item => item.creationId || item.personalization?.creationId || '').filter(Boolean), [cart]);
  const { choices: dedicationChoices } = useDedicationChoices(dedicationIds);
  const selectedIds = useMemo(() => {
    if (selectedIdsDraft === null) return cart.map((item) => item.id);
    const cartIds = new Set(cart.map((item) => item.id));
    return selectedIdsDraft.filter((id) => cartIds.has(id));
  }, [cart, selectedIdsDraft]);

  const selectedItems = useMemo(
    () => cart.filter(item => selectedIds.includes(item.id)),
    [cart, selectedIds],
  );
  const priceLoadError = cartLoadError || (cart.some(item => !hasCartItemPrice(item)) ? CART_PRICE_LOAD_ERROR : null);
  const selectedTotal = useMemo(
    () => priceLoadError ? 0 : selectedItems.reduce((sum, item) => sum + cartItemUnitPrice(item) * (item.quantity ?? 1), 0),
    [selectedItems, priceLoadError]
  );

  const subtotal = priceLoadError ? 0 : cart.reduce((sum, item) => sum + cartItemUnitPrice(item) * (item.quantity ?? 1), 0);
  const allSelected = cart.length > 0 && selectedIds.length === cart.length;

  const toggleSelectAll = () => {
    if (allSelected) setSelectedIdsDraft([]);
    else setSelectedIdsDraft(cart.map(item => item.id));
  };

  const toggleSelection = (id: string) => {
    setSelectedIdsDraft(prev => {
      const current = prev ?? cart.map(item => item.id);
      return current.includes(id) ? current.filter(itemId => itemId !== id) : [...current, id];
    });
  };

  const handleCheckout = async () => {
    const items = selectedItems;
    if (!items.length) return false;
    prepareCheckout(items);
    const ids = items.map(item => item.id).join(',');
    const suffix = ids ? `?ids=${encodeURIComponent(ids)}` : '';
    router.push(`/checkout${suffix}`);
    return true;
  };

  const goToPreview = (itemId: string, bookID: string, dedication = false) => {
    if (pendingAction) return;
    const target = cart.find(entry => entry.id === itemId);
    const creationId = target?.creationId;
    const previewJobId = target?.personalization?.previewJobId;
    const params = new URLSearchParams({ view: 'preview' });
    if (creationId) params.set('creationId', creationId);
    if (previewJobId) params.set('jobId', previewJobId);
    if (dedication) { params.set('dedication', '1'); params.set('returnTo', 'cart'); }
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
    setCartActionError(null);
    setPendingAction({ itemId, action: 'quantity' });
    try {
      const didUpdate = await updateCartQuantity(itemId, quantity);
      if (!didUpdate) {
        setCartActionError(t('cart.quantityUpdateError'));
      }
    } finally {
      setPendingAction(null);
    }
  };

  const handleRemove = async (itemId: string) => {
    if (pendingAction) return;
    setCartActionError(null);
    setPendingAction({ itemId, action: 'remove' });
    try {
      const didRemove = await removeFromCart(itemId);
      if (!didRemove) {
        setCartActionError(t('cart.removeItemError'));
      }
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

      {isHydrated && cartActionError ? (
        <div
          role="alert"
          className="mb-5 rounded-2xl border border-rose-200/80 bg-rose-50/80 px-4 py-3 text-sm font-medium text-rose-700"
        >
          {cartActionError}
        </div>
      ) : null}

      {!isHydrated ? (
        <CartLoadingContent />
      ) : priceLoadError ? (
        <div role="alert" className="rounded-2xl border border-rose-200 bg-rose-50 p-6 text-center text-rose-700">
          <p>{priceLoadError}</p>
          <Button className="mt-4" onClick={() => void refreshCart()}>Try again</Button>
        </div>
      ) : cart.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-gray-200 bg-white/70 p-8 text-center">
          <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-amber-100">
            <ShoppingCart className="h-6 w-6 text-amber-600" />
          </div>
          <h2 className="text-xl md:text-2xl font-title text-gray-900">{t('cart.emptyTitle')}</h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-gray-600">{t('cart.emptyDescription')}</p>
          <Button size="lg" onClick={() => router.push('/')} className="mt-6 rounded-full px-8">{t('common.browseBooks')}</Button>
        </div>
      ) : (
      <div className="grid lg:grid-cols-[1.6fr_1fr] gap-8">
        <CartItemsList
          items={cart}
          selectedIds={selectedIds}
          allSelected={allSelected}
          pendingAction={pendingAction}
          pendingCustomizeHref={pendingCustomizeHref}
          dedicationChoices={dedicationChoices}
          displayCurrency={displayCurrency}
          t={t}
          onToggleSelectAll={toggleSelectAll}
          onToggleSelection={toggleSelection}
          onPreview={(itemId, bookId) => goToPreview(itemId, bookId)}
          onFinishDedication={(itemId, bookId) => goToPreview(itemId, bookId, true)}
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
      )}
    </div>
    </div>
  );
}
