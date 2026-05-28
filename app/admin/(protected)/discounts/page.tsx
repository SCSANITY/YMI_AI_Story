import { DiscountManagementSection } from '@/components/admin/sections/DiscountManagementSection'

export default function DiscountsPage() {
  return (
    <>
      <header className="mb-6">
        <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-slate-500">YMI Admin</p>
        <h1 className="mt-0.5 text-2xl font-bold text-white">Discounts</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">
          Create and manage promo codes and account vouchers for checkout.
        </p>
      </header>
      <div className="max-w-5xl">
        <DiscountManagementSection />
      </div>
    </>
  )
}
