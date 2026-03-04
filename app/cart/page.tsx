'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ShoppingCart, Trash2, Pencil, Sparkles, CheckSquare, Square } from 'lucide-react';
import { useGlobalContext } from '@/contexts/GlobalContext';
import { Button } from '@/components/Button';

export default function CartPage() {
  const router = useRouter();
  const {
    cart,
    removeFromCart,
    prepareCheckout,
    resumePersonalization,
    updateCartQuantity,
  } = useGlobalContext();

  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  useEffect(() => {
    if (cart.length === 0) {
      setSelectedIds([]);
      return;
    }
    setSelectedIds(prev => {
      const existing = new Set(prev);
      return cart.map(item => item.id).filter(id => existing.has(id));
    });
  }, [cart]);

  const selectedItems = cart.filter(item => selectedIds.includes(item.id));
  const selectedTotal = useMemo(
    () => selectedItems.reduce((sum, item) => sum + (item.priceAtPurchase ?? item.book.price) * (item.quantity ?? 1), 0),
    [selectedItems]
  );

  const subtotal = cart.reduce((sum, item) => sum + (item.priceAtPurchase ?? item.book.price) * (item.quantity ?? 1), 0);
  const allSelected = cart.length > 0 && selectedIds.length === cart.length;

  const toggleSelectAll = () => {
    if (allSelected) setSelectedIds([]);
    else setSelectedIds(cart.map(item => item.id));
  };

  const toggleSelection = (id: string) => {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(itemId => itemId !== id) : [...prev, id]);
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
    const target = cart.find(entry => entry.id === itemId);
    if (target) {
      resumePersonalization(target);
    }
    const creationId = target?.creationId;
    const previewJobId = target?.personalization?.previewJobId;
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
    const params = new URLSearchParams({ view: 'preview' });
    if (creationId) params.set('creationId', creationId);
    if (previewJobId) params.set('jobId', previewJobId);
    router.push(`/personalize/${bookID}?${params.toString()}`);
  };

  if (cart.length === 0) {
    return (
      <div className="page-surface min-h-screen flex items-center justify-center p-8">
        <div className="max-w-lg text-center space-y-6">
          <div className="mx-auto w-16 h-16 rounded-full bg-amber-100 flex items-center justify-center">
            <ShoppingCart className="h-7 w-7 text-amber-600" />
          </div>
          <h1 className="text-2xl md:text-3xl font-title text-gray-900">Your cart is empty</h1>
          <p className="text-gray-600">Pick a storybook and start personalizing. Your magic awaits.</p>
          <Button size="lg" onClick={() => router.push('/')} className="rounded-full px-8">Browse Books</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="page-surface min-h-screen">
      <div className="max-w-6xl mx-auto px-4 md:px-8 py-10">
      <div className="flex items-center gap-3 mb-8">
        <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center">
          <ShoppingCart className="h-5 w-5 text-amber-600" />
        </div>
        <div>
          <h1 className="text-2xl md:text-3xl font-title text-gray-900">Your Cart</h1>
          <p className="text-gray-500 text-sm">Select items to checkout or edit.</p>
        </div>
      </div>

      <div className="grid lg:grid-cols-[1.6fr_1fr] gap-8">
        <div className="space-y-4">
          <button
            onClick={toggleSelectAll}
            className="flex items-center gap-2 text-sm font-semibold text-gray-600"
          >
            {allSelected ? <CheckSquare className="h-4 w-4 text-amber-600" /> : <Square className="h-4 w-4" />}
            {allSelected ? 'Unselect all' : 'Select all'}
          </button>

          {cart.map((item) => (
            <div key={item.id} className="glass-panel rounded-2xl p-4 md:p-6 flex gap-4">
              <button
                onClick={() => toggleSelection(item.id)}
                className="mt-2 text-amber-600"
                aria-label="Select item"
              >
                {selectedIds.includes(item.id) ? <CheckSquare className="h-5 w-5" /> : <Square className="h-5 w-5 text-gray-400" />}
              </button>

              <button
                type="button"
                onClick={() => goToPreview(item.id, item.bookID)}
                className="block"
              >
                <img
                  src={item.book.coverUrl}
                  alt={item.book.title}
                  className="w-24 h-32 object-cover rounded-xl shadow-sm saturate-110 contrast-110 brightness-105"
                  loading="lazy"
                  decoding="async"
                  fetchPriority="low"
                />
              </button>
              <div className="flex-1">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <button
                      type="button"
                      onClick={() => goToPreview(item.id, item.bookID)}
                      className="text-left"
                    >
                      <h2 className="font-display text-lg font-bold text-gray-900 hover:text-amber-600 transition-colors">{item.book.title}</h2>
                    </button>
                    <p className="text-xs text-gray-500 uppercase tracking-wide">{item.book.author}</p>
                  </div>
                  <div className="text-right space-y-2">
                    <div className="text-lg font-bold text-gray-900">
                      ${((item.priceAtPurchase ?? item.book.price) * (item.quantity ?? 1)).toFixed(2)}
                    </div>
                    <div className="flex items-center justify-end">
                      <div className="inline-flex items-center rounded-full border border-gray-200 bg-white shadow-sm px-1 py-0.5">
                        <button
                          type="button"
                          className="h-7 w-7 rounded-full bg-amber-50 text-amber-700 hover:bg-amber-100 inline-flex items-center justify-center"
                          onClick={() => updateCartQuantity(item.id, Math.max(1, (item.quantity ?? 1) - 1))}
                          aria-label="Decrease quantity"
                        >
                          <span className="text-base font-semibold leading-none">-</span>
                        </button>
                        <input
                          type="number"
                          min={1}
                          value={item.quantity ?? 1}
                          onChange={(event) => {
                            const nextValue = Number.parseInt(event.target.value, 10);
                            updateCartQuantity(item.id, Number.isNaN(nextValue) ? 1 : nextValue);
                          }}
                          className="w-12 h-7 bg-transparent text-center text-xs font-semibold text-gray-700 leading-none outline-none appearance-none"
                        />
                        <button
                          type="button"
                          className="h-7 w-7 rounded-full bg-amber-50 text-amber-700 hover:bg-amber-100 inline-flex items-center justify-center"
                          onClick={() => updateCartQuantity(item.id, (item.quantity ?? 1) + 1)}
                          aria-label="Increase quantity"
                        >
                          <span className="text-base font-semibold leading-none">+</span>
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="mt-3 text-sm text-gray-600 space-y-1">
                  <div><span className="font-semibold">Hero:</span> {item.personalization?.childName || 'Unknown'}</div>
                  <div><span className="font-semibold">Age:</span> {item.personalization?.childAge || 'N/A'}</div>
                  <div><span className="font-semibold">Language:</span> {item.personalization?.language || 'English'}</div>
                </div>

                <div className="mt-4 flex flex-wrap gap-3">
                  <Button
                    variant="outline"
                    size="sm"
                    className="rounded-full"
                    onClick={() => {
                      resumePersonalization(item);
                      router.push(`/personalize/${item.bookID}`);
                    }}
                  >
                    <Pencil className="h-4 w-4 mr-2" /> Edit
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="rounded-full text-red-500 hover:text-red-600"
                    onClick={() => removeFromCart(item.id)}
                  >
                    <Trash2 className="h-4 w-4 mr-2" /> Remove
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="glass-panel rounded-2xl p-6 h-fit">
          <h3 className="text-lg font-bold text-gray-900 mb-4">Order Summary</h3>
          <div className="space-y-2 text-sm text-gray-600">
            <div className="flex items-center justify-between">
              <span>Cart Total</span>
              <span className="text-gray-900 font-semibold">${subtotal.toFixed(2)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span>Selected</span>
              <span className="text-gray-900 font-semibold">${selectedTotal.toFixed(2)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span>Shipping</span>
              <span className="text-gray-900 font-semibold">Free</span>
            </div>
            <div className="border-t border-gray-100 pt-3 flex items-center justify-between text-base">
              <span className="font-bold text-gray-900">Total</span>
              <span className="font-bold text-gray-900">${(selectedItems.length > 0 ? selectedTotal : subtotal).toFixed(2)}</span>
            </div>
          </div>
          <Button
            size="lg"
            className="mt-6 w-full rounded-full"
            onClick={handleCheckout}
            disabled={selectedItems.length === 0}
          >
            <Sparkles className="h-5 w-5 mr-2" /> Checkout Selected
          </Button>
          <p className="text-xs text-gray-500 mt-3">You can select one or multiple items.</p>
          <p className="text-xs text-gray-500 mt-2">Checkout requires a verified email.</p>
        </div>
      </div>
    </div>
    </div>
  );
}
