// Local synthetic UI only. HTTP endpoints use the real routes with in-memory data.
import React, { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { AddressFormSection } from '../../app/checkout/AddressFormSection'
import { CheckoutSummaryPanel } from '../../app/checkout/CheckoutSummaryPanel'
import { ShippingDiscountControl } from '../../components/admin/sections/discounts/ShippingDiscountControl'
import { DiscountManagementSection } from '../../components/admin/sections/DiscountManagementSection'
import { DiscountSectionTabs } from '../../components/admin/sections/discounts/DiscountSectionTabs'
import { AdminPage, AdminPageHeader } from '../../components/admin/AdminUi'
import { formatCurrencyAmount } from '../../src/lib/locale-pricing'
import { getUiMessage as t } from '../../src/lib/i18n-messages'

const nativeFetch = window.fetch.bind(window)
window.fetch = (url, init) => {
  if (!String(url).startsWith('/api/')) throw new Error('External fixture request blocked')
  return nativeFetch(url, init)
}
const form = { firstName: 'Test', lastName: 'Reader', email: 'reader@example.test', country: 'HK', region: 'Hong Kong', city: 'Hong Kong', zip: '000000', addressLine1: '1 Example Street', phone: '+85212345678', shippingRegionKey: '', shippingDestinationLabel: 'Hong Kong', addressLine2: '', addressLine3: '', company: '', recipientEmail: '', vatNumber: '', eoriNumber: '', iossNumber: '' }

function Preview() {
  const [currency, setCurrency] = useState('USD'), [quote, setQuote] = useState(null), [free, setFree] = useState(false), [version, setVersion] = useState(0)
  const option = quote?.options.find(option => option.methodCode === quote.selectedMethod)
  const shipping = option?.amountUsd ?? 0
  return (
    <main className="mx-auto max-w-6xl p-4 sm:p-8">
      <h1 className="text-2xl font-bold text-slate-900">Checkout shipping · local preview</h1>
      <p className="mt-2 text-sm text-slate-500">Synthetic address and rates. No production access or payment.</p>
      <div className="my-5 flex flex-wrap items-center gap-4">
        <label>Currency <select aria-label="Currency" value={currency} onChange={event => setCurrency(event.target.value)} className="rounded border bg-white p-2"><option>USD</option><option>JPY</option><option>HKD</option></select></label>
        <label className="flex items-center gap-2"><input type="checkbox" checked={free} onChange={event => setFree(event.target.checked)} />Free shipping voucher</label>
        <button className="rounded border bg-white px-3 py-2" onClick={() => { setVersion(value => value + 1); setQuote(null) }}>Refresh quote</button>
      </div>
      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
        <section className="space-y-5 rounded-3xl border border-white bg-white/60 p-4 sm:p-6">
          <AddressFormSection key={version} initialForm={form} checkoutEmail={form.email} selectedCurrency={currency} isAuthResolved={true} t={t} onComplete={({ shippingQuote }) => setQuote(shippingQuote)} />
        </section>
        <CheckoutSummaryPanel hiddenOnPaymentStep={false} isPriceReady={true} showShipping={true} shippingStatus={quote ? 'available' : 'missing'}
          discountTotalUsd={0} shippingDiscountTotalUsd={free ? shipping : 0} shippingAmountUsd={shipping} shippingRateSnapshot={option?.snapshot} currency={currency}
          formattedSubtotal={formatCurrencyAmount(39, currency)} formattedShipping={formatCurrencyAmount(shipping, currency)} formattedNetShipping={formatCurrencyAmount(free ? 0 : shipping, currency)}
          formattedDiscount={formatCurrencyAmount(0, currency)} formattedShippingDiscount={formatCurrencyAmount(free ? shipping : 0, currency)} formattedTotal={formatCurrencyAmount(39 + (free ? 0 : shipping), currency)} t={t} />
      </div>
      <p className="mt-8"><a href="/admin/discounts" className="font-semibold text-amber-800 underline">Open Admin Discounts preview</a></p>
    </main>
  )
}
function AdminPreview() {
  const activeSection = new URLSearchParams(location.search).get('view') === 'shipping' ? 'shipping' : 'instruments'
  return <main className="ymi-admin-theme min-h-dvh p-4 sm:p-8"><AdminPage className="mx-auto max-w-6xl space-y-5">
    <AdminPageHeader eyebrow="Commercial tools" title="Discounts" />
    <DiscountSectionTabs activeSection={activeSection} />
    {activeSection === 'shipping' ? <ShippingDiscountControl /> : <DiscountManagementSection />}
  </AdminPage></main>
}
createRoot(document.getElementById('root')).render(location.pathname === '/admin/discounts' ? <AdminPreview /> : <Preview />)
