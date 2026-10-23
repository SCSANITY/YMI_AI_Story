# Shipping pricing and promotion

`shipping_pricing_rules.discount_percent` is the promotion authority. It means
percent **off**: 60 means the customer pays 40%, and 0 removes the promotion.
There is no hardcoded customer discount, separate settings row or schema migration.

Admin **Discounts** has separate **Promo codes & vouchers** (the default) and
**Shipping discount** sections. The former keeps its existing creation/management
workspace;`/admin/discounts?view=shipping` opens only shipping controls. The
selected section is reflected in the URL,so refresh/back keep normal navigation.
Unselected controls are not mounted or fetched. The shipping section reads all existing rules and writes only
their `discount_percent`, in one statement, including disabled rules. The rate is
an integer from 0 to 100. Mixed existing rates are shown as mixed until an Admin
chooses a uniform value. Loading never writes or activates a promotion. New rules
created outside this editor must carry the intended discount themselves.

Both methods and every destination continue through `calculateShippingQuote`.
Its existing rule precedence, fuel, handling, margin, FX adjustment, minimum
charge and no-rule behavior are unchanged. A minimum can reduce the effective
saving; the Admin warns and the customer badge uses the actual saving. Setting
the launch promotion requires checking the current rules and saving 60 through
the Admin after a separately authorized release. Do not change base-rate costs.

The server quote snapshot adds `originalCostHkd` and `originalShippingAmountUsd`
using the same formula with the discount removed. The discounted amount remains
`amountUsd` / `shippingAmountUsd`. Checkout options and Summary share one
`ShippingPrice` component and the existing currency formatter. Old snapshots
without an original price stay single-price; rounded equal prices show no badge.

Session creation still re-quotes server-side, persists the selected amount and
snapshot, refreshes existing coupons, and converts the resulting shipping charge
to Stripe minor units. Free-shipping coupons deduct the promotional shipping
amount; the promotion is not deducted a second time as an order coupon. Existing
Session reuse/locks/fingerprints, payment finalization, receipts, order reads and
paid snapshots are unchanged. Changing the Admin setting affects fresh quotes;
an existing valid locked Stripe Session retains its agreed amount.

Offline checks:

```text
node --test tests/shipping-discount-runtime.test.mjs tests/shipping-price-presentation.test.mjs
node tests/shipping-discount-preview.mjs
```

The local fixture uses real Checkout components and Admin/quote/Session handlers
with synthetic in-memory database and Stripe transports. No environment values,
Production DB/Storage or payment are used. Fixture browser settings never affect
the live site. A full live payment is not claimed by these checks.
