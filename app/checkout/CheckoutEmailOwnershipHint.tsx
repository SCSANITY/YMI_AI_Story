type CheckoutEmailOwnershipHintProps = {
  isAuthResolved: boolean;
  isSignedIn: boolean;
  t: (key: string) => string;
};

export function CheckoutEmailOwnershipHint({
  isAuthResolved,
  isSignedIn,
  t,
}: CheckoutEmailOwnershipHintProps) {
  if (!isAuthResolved) return null;

  return (
    <p className="px-1 text-xs leading-5 text-slate-500" role="note">
      {t(
        isSignedIn
          ? 'checkout.emailAccountDeliveryHint'
          : 'checkout.emailGuestOwnershipHint'
      )}
    </p>
  );
}
