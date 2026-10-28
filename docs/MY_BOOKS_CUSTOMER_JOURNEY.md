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
- The fixed `source=my-books` survives version URL updates and the
  Preview -> Cart -> Preview round trip, along with the selected Creation/Job.
  There is no purchased-origin variant or return-history stack.
- **Add to Cart** keeps the customer on My Books and gives explicit success or
  failure feedback. Success includes a View Cart action.
- **Buy Now** starts a one-copy order and enters Checkout directly. The action
  stays locked during navigation so rapid repeated clicks cannot create
  duplicate pending orders.
- Optional dedication reads (including loading or failure) never gate Buy Now.
  The explicit **Finish in Preview** message-editor entry remains available.
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
- Both purchase actions use the Creation's saved edition and any draft message
  or recording. They do not copy the latest paid-line materials back into the
  Creation, open the message editor, generate a Preview, or require a recording.
  The payment-time initializer snapshots the draft through the existing chain.
- The server remains authoritative for the creation's product, package, and
  price snapshot; the client supplies only the creation ID and quantity `1`.
- A failed order start leaves the customer in place with a visible retryable
  error. A failed optional cart hydration does not block navigation because
  Checkout can recover from the returned order and cart-item IDs.
- Purchase-state query failures are returned as service errors and are never
  presented as an empty shelf or an unpurchased creation.

The shared text beside both purchase buttons is:

> We'll use your saved edition and any saved message or recording. After payment, you can add or update your message and Voice Edition recording within 48 hours, before shipment. If your recording is still missing, you can upload it later, before shipment.

The optional-message status is **Optional message — add it now or after purchase.**
These prompts do not change paid-line deadlines, consent, shipment eligibility
or the materials page. Purchase errors remain in place for a user-initiated retry;
there is no automatic checkout replay.

Saving a Creation draft message does not retrieve/expire a Stripe Session or
clear its order lock. The private RPC still checks Creation ownership, content
and revision CAS; stale revisions return PT409. The payment-time initializer
reads a complete draft body/revision pair once per line. A later Creation edit
never overwrites a paid line. Commercial Checkout locks are unchanged.

## Safe removal (issue28 S1, offline candidate)

- Both archive and hard-delete revoke preview share links in the same owner-scoped
  transaction. An existing public link then returns not found; share routes do
  not add a second archive-state rule.
- Photo-version members archive, retain ancestry/consumed changes, and disappear
  from the picker. Only an independent original without transaction history may
  hard-delete. Shared sources and paid facts remain protected.
- Files are queued inside the transaction and removed only by the existing
  post-commit cleanup consumer. The customer always sees "Removed from My Books."
  Queue status is internal; this feedback is not a claim of physical erasure.
- Manual history deletion and eight-photo pruning use the same face-reference
  protection. The visible history stays bounded; an old referenced source is
  retained even if it falls outside the latest eight history entries.
