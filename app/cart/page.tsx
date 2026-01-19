'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ShoppingCart, Trash2, Pencil, Sparkles, CheckSquare, Square } from 'lucide-react';
import { useGlobalContext } from '@/contexts/GlobalContext';
import { Button } from '@/components/Button';

export default function CartPage() {
  const router = useRouter();
  const {
    user,
    cart,
    removeFromCart,
    prepareCheckout,
    resumePersonalization,
    openLoginModal,
  } = useGlobalContext();

  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  useEffect(() => {
    if (cart.length === 0) {
      setSelectedIds([]);
      return;
    }
    setSelectedIds(prev => {
      const existing = new Set(prev);
      const next = cart.map(item => item.id).filter(id => existing.has(id));
      return next.length > 0 ? next : cart.map(item => item.id);
    });
  }, [cart]);

  const selectedItems = cart.filter(item => selectedIds.includes(item.id));
  const selectedTotal = useMemo(
    () => selectedItems.reduce((sum, item) => sum + (item.priceAtPurchase ?? item.book.price), 0),
    [selectedItems]
  );

  const subtotal = cart.reduce((sum, item) => sum + (item.priceAtPurchase ?? item.book.price), 0);
  const allSelected = cart.length > 0 && selectedIds.length === cart.length;

  const toggleSelectAll = () => {
    if (allSelected) setSelectedIds([]);
    else setSelectedIds(cart.map(item => item.id));
  };

  const toggleSelection = (id: string) => {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(itemId => itemId !== id) : [...prev, id]);
  };

  const handleCheckout = () => {
    if (!user) {
      openLoginModal();
      return;
    }

    const items = selectedItems.length > 0 ? selectedItems : cart;
    prepareCheckout(items);
    router.push('/checkout');
  };

  if (cart.length === 0) {
    return (
      <div className="min-h-[70vh] flex items-center justify-center p-8">
        <div className="max-w-lg text-center space-y-6">
          <div className="mx-auto w-16 h-16 rounded-full bg-amber-100 flex items-center justify-center">
            <ShoppingCart className="h-7 w-7 text-amber-600" />
          </div>
          <h1 className="text-2xl md:text-3xl font-serif font-bold text-gray-900">Your cart is empty</h1>
          <p className="text-gray-600">Pick a storybook and start personalizing. Your magic awaits.</p>
          <Button size="lg" onClick={() => router.push('/')} className="rounded-full px-8">Browse Books</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-4 md:px-8 py-10">
      <div className="flex items-center gap-3 mb-8">
        <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center">
          <ShoppingCart className="h-5 w-5 text-amber-600" />
        </div>
        <div>
          <h1 className="text-2xl md:text-3xl font-serif font-bold text-gray-900">Your Cart</h1>
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
            <div key={item.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 md:p-6 flex gap-4">
              <button
                onClick={() => toggleSelection(item.id)}
                className="mt-2 text-amber-600"
                aria-label="Select item"
              >
                {selectedIds.includes(item.id) ? <CheckSquare className="h-5 w-5" /> : <Square className="h-5 w-5 text-gray-400" />}
              </button>

              <img src={item.book.coverUrl} alt={item.book.title} className="w-24 h-32 object-cover rounded-xl shadow-sm" />
              <div className="flex-1">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 className="font-serif text-lg font-bold text-gray-900">{item.book.title}</h2>
                    <p className="text-xs text-gray-500 uppercase tracking-wide">{item.book.author}</p>
                  </div>
                  <div className="text-right">
                    <div className="text-lg font-bold text-gray-900">${(item.priceAtPurchase ?? item.book.price).toFixed(2)}</div>
                    <div className="text-xs text-gray-500">Qty 1</div>
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

        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 h-fit">
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
          {!user && (
            <p className="text-xs text-gray-500 mt-2">You will be asked to log in before checkout.</p>
          )}
        </div>
      </div>
    </div>
  );
}
