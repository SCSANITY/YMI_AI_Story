'use client';

import { memo } from 'react';
import { CheckSquare, Loader2, Pencil, Square, Trash2 } from 'lucide-react';
import { Button } from '@/components/Button';
import OrderCoverImage from '@/components/OrderCoverImage';
import { formatDisplayCurrency } from '@/lib/locale-pricing';
import type { CartItem, DisplayCurrency } from '@/types';

type CartItemsListProps = {
  items: CartItem[];
  selectedIds: string[];
  allSelected: boolean;
  pendingAction: PendingCartAction;
  pendingCustomizeHref: string | null;
  displayCurrency: DisplayCurrency;
  t: (key: string, params?: Record<string, string | number | null | undefined>) => string;
  onToggleSelectAll: () => void;
  onToggleSelection: (itemId: string) => void;
  onPreview: (itemId: string, bookId: string) => void;
  onPreviewHover: (item: CartItem) => void;
  onCustomizeEdit: (itemId: string) => void;
  onCustomizeHover: (bookId: string) => void;
  onQuantityChange: (itemId: string, quantity: number) => void | Promise<void>;
  onRemove: (itemId: string) => void | Promise<void>;
};

type PendingCartAction = {
  itemId: string;
  action: 'quantity' | 'remove' | 'preview' | 'edit';
} | null;

type CartItemCardProps = {
  item: CartItem;
  isSelected: boolean;
  pendingAction: PendingCartAction;
  pendingCustomizeHref: string | null;
  displayCurrency: DisplayCurrency;
  t: CartItemsListProps['t'];
  onToggleSelection: (itemId: string) => void;
  onPreview: (itemId: string, bookId: string) => void;
  onPreviewHover: (item: CartItem) => void;
  onCustomizeEdit: (itemId: string) => void;
  onCustomizeHover: (bookId: string) => void;
  onQuantityChange: (itemId: string, quantity: number) => void;
  onRemove: (itemId: string) => void;
};

const CartItemCard = memo(function CartItemCard({
  item,
  isSelected,
  pendingAction,
  pendingCustomizeHref,
  displayCurrency,
  t,
  onToggleSelection,
  onPreview,
  onPreviewHover,
  onCustomizeEdit,
  onCustomizeHover,
  onQuantityChange,
  onRemove,
}: CartItemCardProps) {
  const quantity = item.quantity ?? 1;
  const lineTotal = (item.priceAtPurchase ?? item.book.price) * quantity;
  const activeAction = pendingAction?.itemId === item.id ? pendingAction.action : null;
  const hasPendingAction = Boolean(activeAction);

  return (
    <div className="glass-panel rounded-2xl p-4 md:p-6 flex gap-3 sm:gap-4">
      <button
        onClick={() => onToggleSelection(item.id)}
        disabled={hasPendingAction}
        className="mt-2 shrink-0 text-amber-600"
        aria-label="Select item"
      >
        {isSelected ? <CheckSquare className="h-5 w-5" /> : <Square className="h-5 w-5 text-gray-400" />}
      </button>

      <button
        type="button"
        onClick={() => onPreview(item.id, item.bookID)}
        onPointerEnter={() => onPreviewHover(item)}
        disabled={hasPendingAction}
        className="block shrink-0"
      >
        <span className="relative block h-28 w-20 sm:h-32 sm:w-24 overflow-hidden rounded-xl bg-amber-50 shadow-sm">
          <OrderCoverImage
            cartItemId={item.id}
            src={item.book.coverUrl}
            status={item.coverStatus}
            alt={item.book.title}
            sizes="(max-width: 640px) 80px, 96px"
            className="h-full w-full"
            imageClassName="object-cover saturate-110 contrast-110 brightness-105"
          />
        </span>
      </button>

      <div className="flex-1 min-w-0">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between sm:gap-3">
          <div className="min-w-0">
            <button
              type="button"
              onClick={() => onPreview(item.id, item.bookID)}
              onPointerEnter={() => onCustomizeHover(item.bookID)}
              disabled={hasPendingAction}
              className="text-left min-w-0 w-full"
            >
              <h2 className="font-display text-base sm:text-lg font-bold text-gray-900 hover:text-amber-600 transition-colors line-clamp-2">{item.book.title}</h2>
            </button>
            <p className="text-xs text-gray-500 uppercase tracking-wide">{item.book.author}</p>
          </div>

          <div className="mt-2 sm:mt-0 sm:text-right shrink-0 space-y-2">
            <div className="text-lg font-bold text-gray-900">
              {formatDisplayCurrency(lineTotal, displayCurrency)}
            </div>
            <div className="flex items-center sm:justify-end">
              <div className="inline-flex items-center rounded-full border border-gray-200 bg-white shadow-sm px-1 py-0.5">
                <button
                  type="button"
                  className="h-7 w-7 rounded-full bg-amber-50 text-amber-700 hover:bg-amber-100 inline-flex items-center justify-center"
                  onClick={() => onQuantityChange(item.id, Math.max(1, quantity - 1))}
                  disabled={hasPendingAction}
                  aria-label="Decrease quantity"
                >
                  <span className="text-base font-semibold leading-none">-</span>
                </button>
                <input
                  type="number"
                  min={1}
                  value={quantity}
                  disabled={hasPendingAction}
                  onChange={(event) => {
                    const nextValue = Number.parseInt(event.target.value, 10);
                    onQuantityChange(item.id, Number.isNaN(nextValue) ? 1 : nextValue);
                  }}
                  className="w-12 h-7 bg-transparent text-center text-xs font-semibold text-gray-700 leading-none outline-none appearance-none"
                />
                <button
                  type="button"
                  className="h-7 w-7 rounded-full bg-amber-50 text-amber-700 hover:bg-amber-100 inline-flex items-center justify-center"
                  onClick={() => onQuantityChange(item.id, quantity + 1)}
                  disabled={hasPendingAction}
                  aria-label="Increase quantity"
                >
                  <span className="text-base font-semibold leading-none">+</span>
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-3 text-sm text-gray-600 space-y-1">
          <div><span className="font-semibold">{t('cart.heroLabel')}:</span> {item.personalization?.childName || t('common.unknown')}</div>
          <div><span className="font-semibold">{t('cart.ageLabel')}:</span> {item.personalization?.childAge || t('common.unknown')}</div>
          <div><span className="font-semibold">{t('cart.languageLabel')}:</span> {item.personalization?.language || t('language.en')}</div>
        </div>

        <div className="mt-4 flex flex-wrap gap-3">
          <Button
            variant="outline"
            size="sm"
            className="rounded-full"
            onClick={() => onCustomizeEdit(item.id)}
            disabled={hasPendingAction || pendingCustomizeHref === `/personalize/${item.bookID}`}
          >
            {activeAction === 'edit' ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Pencil className="h-4 w-4 mr-2" />}
            {t('cart.edit')}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="rounded-full text-red-500 hover:text-red-600"
            onClick={() => onRemove(item.id)}
            disabled={hasPendingAction}
          >
            {activeAction === 'remove' ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Trash2 className="h-4 w-4 mr-2" />}
            {t('common.remove')}
          </Button>
        </div>
      </div>
    </div>
  );
});

export function CartItemsList({
  items,
  selectedIds,
  allSelected,
  pendingAction,
  pendingCustomizeHref,
  displayCurrency,
  t,
  onToggleSelectAll,
  onToggleSelection,
  onPreview,
  onPreviewHover,
  onCustomizeEdit,
  onCustomizeHover,
  onQuantityChange,
  onRemove,
}: CartItemsListProps) {
  return (
    <div className="space-y-4">
      <button
        onClick={onToggleSelectAll}
        className="flex items-center gap-2 text-sm font-semibold text-gray-600"
      >
        {allSelected ? <CheckSquare className="h-4 w-4 text-amber-600" /> : <Square className="h-4 w-4" />}
        {allSelected ? t('cart.unselectAll') : t('cart.selectAll')}
      </button>

      {items.map((item) => (
        <CartItemCard
          key={item.id}
          item={item}
          isSelected={selectedIds.includes(item.id)}
          pendingAction={pendingAction}
          pendingCustomizeHref={pendingCustomizeHref}
          displayCurrency={displayCurrency}
          t={t}
          onToggleSelection={onToggleSelection}
          onPreview={onPreview}
          onPreviewHover={onPreviewHover}
          onCustomizeEdit={onCustomizeEdit}
          onCustomizeHover={onCustomizeHover}
          onQuantityChange={onQuantityChange}
          onRemove={onRemove}
        />
      ))}
    </div>
  );
}
