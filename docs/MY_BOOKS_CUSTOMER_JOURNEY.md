# My Books Customer Journey

This document describes only the customer-facing My Books and owned Reader
flow in the Next.js application. Platform status remains in the root governance
documentation.

## Entry and shelf selection

- `/my-books` loads the customer's creations and resolves each creation into
  either **Purchased** or **Saved Previews** from authoritative purchase and
  release state.
- The selected shelf is URL-addressable through `?shelf=purchased` or
  `?shelf=previews`, so refresh and browser navigation preserve context.
- Loading, service failure, signed-out empty, and signed-in empty states are
  distinct. A service failure offers Retry; an empty shelf offers Browse Books,
  and a signed-out empty page also offers Log In.

## Saved Preview journey

- Opening a cover resumes that saved creation in Preview mode.
- Back from a Preview opened by My Books returns directly to
  `/my-books?shelf=previews`; it does not show the Customize-draft confirmation.
- **Add to Cart** keeps the customer on My Books and gives explicit success or
  failure feedback. Success includes a View Cart action.
- **Buy Now** starts a one-copy order and enters Checkout directly. The action
  stays locked during navigation so rapid repeated clicks cannot create
  duplicate pending orders.
- Delete requires confirmation and reports success or failure. The control is
  visible and labelled on both touch and pointer layouts.

## Purchased book and Reader journey

- Opening a purchased book enters `/my-books/<creationId>` and the private
  Reader API rechecks ownership, refund state, and released Final assets.
- The Reader distinguishes sign-in, missing book, non-purchased, refunded,
  temporary service, and invalid-asset states instead of collapsing them into
  one generic failure.
- A released book must satisfy the V3 Final contract: one approved standalone
  front cover and 15 complete approved interior spreads. Unversioned, V2,
  partial, or filename-inferred Final assets fail visibly.
- Reader pages use bounded Previous/Next buttons and preload only the current
  and adjacent spreads.
- **Buy Again** starts a new one-copy order for the owned creation and goes
  directly to Checkout. It never calls the add-to-cart action, never increments
  a lingering cart quantity, and ignores rapid duplicate clicks while the
  checkout transition is in flight.
- Back always returns to the Purchased shelf.

## Commerce and failure invariants

- Existing paid-order records are not modified by Buy Again.
- The server remains authoritative for the creation's product, package, and
  price snapshot; the client supplies only the creation ID and quantity `1`.
- A failed order start leaves the customer in place with a visible retryable
  error. A failed optional cart hydration does not block navigation because
  Checkout can recover from the returned order and cart-item IDs.
- Purchase-state query failures are returned as service errors and are never
  presented as an empty shelf or an unpurchased creation.
