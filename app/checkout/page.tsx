'use client';

import React, { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { CreditCard, Lock, Sparkles, CheckCircle2 } from 'lucide-react';
import { useGlobalContext } from '@/contexts/GlobalContext';
import { Button } from '@/components/Button';
import { AnimatePresence, motion } from 'framer-motion';

type CheckoutStep = 'address' | 'payment' | 'success';

type PaymentMethod = 'card' | 'paypal' | 'wallet';

export default function CheckoutPage() {
  const router = useRouter();
  const {
    user,
    cart,
    checkoutItems,
    removeFromCheckout,
    removeOrderedItems,
    clearCheckout,
    addOrder,
    openLoginModal,
  } = useGlobalContext();

  const items = checkoutItems.length > 0 ? checkoutItems : cart;
  const total = useMemo(
    () => items.reduce((sum, item) => sum + (item.priceAtPurchase ?? item.book.price), 0),
    [items]
  );

  const [step, setStep] = useState<CheckoutStep>('address');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('card');
  const [orderId, setOrderId] = useState<string | null>(null);
  const [completedOrder, setCompletedOrder] = useState<{ id: string; total: number } | null>(null);

  const [form, setForm] = useState({
    firstName: '',
    lastName: '',
    address: '',
    city: '',
    zip: '',
  });

  const updateField = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm(prev => ({ ...prev, [key]: e.target.value }));
  };

  const handleNext = () => {
    setStep('payment');
  };

  const handlePlaceOrder = () => {
    if (!user) {
      openLoginModal();
      return;
    }

    const newOrderId = `ord_${Date.now().toString(36)}`;
    setOrderId(newOrderId);

    addOrder({
      id: newOrderId,
      date: new Date().toISOString(),
      items,
      total,
      status: 'Processing',
      shippingAddress: {
        firstName: form.firstName || 'Alex',
        lastName: form.lastName || 'Rivera',
        address: form.address || '123 Story Lane',
        city: form.city || 'Booktown',
        zip: form.zip || '00000',
      },
    });

    removeOrderedItems(items.map(item => item.id));
    setCompletedOrder({ id: newOrderId, total });
    clearCheckout();
    setStep('success');
  };

  if (items.length === 0 && step !== 'success') {
    return (
      <div className="min-h-[70vh] flex items-center justify-center p-8">
        <div className="max-w-lg text-center space-y-6">
          <div className="mx-auto w-16 h-16 rounded-full bg-amber-100 flex items-center justify-center">
            <CreditCard className="h-7 w-7 text-amber-600" />
          </div>
          <h1 className="text-2xl md:text-3xl font-serif font-bold text-gray-900">Nothing to checkout</h1>
          <p className="text-gray-600">Add a personalized book to your cart first.</p>
          <Button size="lg" className="rounded-full px-8" onClick={() => router.push('/cart')}>Go to Cart</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-4 md:px-8 py-10">
      <div className="flex items-center gap-3 mb-8">
        <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center">
          <Lock className="h-5 w-5 text-amber-600" />
        </div>
        <div>
          <h1 className="text-2xl md:text-3xl font-serif font-bold text-gray-900">Secure Checkout</h1>
          <p className="text-gray-500 text-sm">Step {step === 'address' ? '1' : '2'} of 2</p>
        </div>
      </div>

      <div className="grid lg:grid-cols-[1.2fr_1fr] gap-8">
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-6">
          {step === 'address' && (
            <>
              <h2 className="text-lg font-bold text-gray-900">Shipping Details</h2>
              <div className="grid md:grid-cols-2 gap-4">
                <input className="h-11 rounded-lg border border-gray-200 px-3 text-sm" placeholder="First name" value={form.firstName} onChange={updateField('firstName')} />
                <input className="h-11 rounded-lg border border-gray-200 px-3 text-sm" placeholder="Last name" value={form.lastName} onChange={updateField('lastName')} />
                <input className="md:col-span-2 h-11 rounded-lg border border-gray-200 px-3 text-sm" placeholder="Street address" value={form.address} onChange={updateField('address')} />
                <input className="h-11 rounded-lg border border-gray-200 px-3 text-sm" placeholder="City" value={form.city} onChange={updateField('city')} />
                <input className="h-11 rounded-lg border border-gray-200 px-3 text-sm" placeholder="ZIP" value={form.zip} onChange={updateField('zip')} />
              </div>
              <Button size="lg" className="w-full rounded-full" onClick={handleNext}>
                Continue to Payment
              </Button>
            </>
          )}

          {step === 'payment' && (
            <>
              <h2 className="text-lg font-bold text-gray-900">Payment Method</h2>
              <div className="space-y-3">
                {([
                  { id: 'card', label: 'Credit / Debit Card' },
                  { id: 'paypal', label: 'PayPal' },
                  { id: 'wallet', label: 'Digital Wallet' },
                ] as { id: PaymentMethod; label: string }[]).map(option => (
                  <button
                    key={option.id}
                    onClick={() => setPaymentMethod(option.id)}
                    className={`w-full text-left border rounded-xl px-4 py-3 text-sm font-medium transition-all ${paymentMethod === option.id ? 'border-amber-500 bg-amber-50 text-amber-700' : 'border-gray-200 text-gray-600 hover:border-amber-300'}`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
              <Button size="lg" className="w-full rounded-full" onClick={handlePlaceOrder}>
                <Sparkles className="h-5 w-5 mr-2" /> Place Demo Order
              </Button>
              <p className="text-xs text-gray-500">Payment integration will connect to Stripe later.</p>
            </>
          )}

          <div className="pt-4 border-t border-gray-100">
            <h2 className="text-lg font-bold text-gray-900 mb-3">Items</h2>
            <div className="space-y-3">
              {items.map(item => (
                <div key={item.id} className="flex items-center gap-3">
                  <img src={item.book.coverUrl} alt={item.book.title} className="w-16 h-20 rounded-lg object-cover" />
                  <div className="flex-1">
                    <div className="font-semibold text-gray-900 text-sm">{item.book.title}</div>
                    <div className="text-xs text-gray-500">Hero: {item.personalization?.childName || 'Unknown'}</div>
                  </div>
                  <div className="text-sm font-semibold text-gray-900">${(item.priceAtPurchase ?? item.book.price).toFixed(2)}</div>
                  <button className="text-xs text-red-500" onClick={() => removeFromCheckout(item.id)}>Remove</button>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 h-fit">
          <h3 className="text-lg font-bold text-gray-900 mb-4">Payment Summary</h3>
          <div className="space-y-2 text-sm text-gray-600">
            <div className="flex items-center justify-between">
              <span>Subtotal</span>
              <span className="text-gray-900 font-semibold">${total.toFixed(2)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span>Shipping</span>
              <span className="text-gray-900 font-semibold">Free</span>
            </div>
            <div className="border-t border-gray-100 pt-3 flex items-center justify-between text-base">
              <span className="font-bold text-gray-900">Total</span>
              <span className="font-bold text-gray-900">${total.toFixed(2)}</span>
            </div>
          </div>
          <p className="text-xs text-gray-500 mt-3">This checkout is a demo flow.</p>
        </div>
      </div>

      <AnimatePresence>
        {step === 'success' && completedOrder && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[120] flex items-center justify-center bg-black/40 backdrop-blur-sm p-6"
          >
            <motion.div
              initial={{ scale: 0.96, opacity: 0, y: 10 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.98, opacity: 0, y: 6 }}
              transition={{ duration: 0.25, ease: 'easeOut' }}
              className="max-w-2xl w-full text-center bg-white rounded-[32px] border border-amber-100 shadow-2xl p-10 relative overflow-hidden"
            >
              <div className="absolute -top-12 -right-12 w-40 h-40 bg-amber-200/40 rounded-full blur-2xl" />
              <div className="absolute -bottom-16 -left-12 w-44 h-44 bg-orange-200/40 rounded-full blur-2xl" />

              <div className="relative z-10 space-y-6">
                <div className="mx-auto w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center shadow-inner">
                  <CheckCircle2 className="h-8 w-8 text-emerald-600" />
                </div>
                <div>
                  <h1 className="text-3xl md:text-4xl font-serif font-bold text-gray-900">Purchase complete!</h1>
                  <p className="text-gray-600 mt-2">Your storybook is officially in production.</p>
                </div>
                <div className="text-sm font-semibold text-gray-900 bg-amber-50 border border-amber-100 rounded-full px-4 py-2 inline-block">
                  Order ID: {completedOrder.id}
                </div>
                <div className="flex flex-col sm:flex-row gap-3 justify-center pt-2">
                  <Button size="lg" className="rounded-full px-8" onClick={() => router.push(`/orders/${completedOrder.id}`)}>
                    Track Order
                  </Button>
                  <Button size="lg" variant="outline" className="rounded-full px-8" onClick={() => router.push('/')}>
                    Back to Home
                  </Button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
