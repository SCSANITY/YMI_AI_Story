/**
 * Renders all email templates to static HTML for visual design review.
 *
 * Usage:  npm run emails:preview
 * Output: email-previews/index.html  (open in a browser)
 *
 * Each template is rendered with realistic sample data. The index page
 * provides a sidebar to switch templates and a desktop/mobile width toggle.
 */
import * as React from 'react'
import { render } from '@react-email/render'
import { copyFileSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

// Resolve email assets relative to the preview folder instead of production URL.
// emailAsset() reads this env at render time, so setting it here (before main runs) works.
process.env.EMAIL_ASSET_BASE = '.'

import { OtpEmail } from '../components/emails/OtpEmail'
import { OrderReceiptEmail } from '../components/emails/OrderReceiptEmail'
import { DeliveryEmail } from '../components/emails/DeliveryEmail'
import { AbandonmentEmail } from '../components/emails/AbandonmentEmail'
import { LogisticsUpdateEmail } from '../components/emails/LogisticsUpdateEmail'

const __dirname = dirname(fileURLToPath(import.meta.url))
const OUT_DIR = join(__dirname, '..', 'email-previews')

const SAMPLE_ORDER_URL = 'https://www.ymistory.com/orders/a1b2c3d4'
/** Stand-in for the real face-swapped cover (relative to email-previews/) */
const SAMPLE_COVER = 'sample-cover.webp'
const SAMPLE_ITEMS = [
  { name: 'The Musical Adventure — Personalized Storybook (eBook)', quantity: 1, unitPrice: 29.99 },
  { name: 'The Little Seed — Personalized Storybook (eBook)', quantity: 1, unitPrice: 29.99 },
]

type Variant = {
  /** filename without extension */
  slug: string
  /** label shown in the preview sidebar */
  label: string
  /** which trigger node sends it */
  trigger: string
  node: React.ReactElement
}

const variants: Variant[] = [
  {
    slug: 'otp',
    label: 'OTP Verification',
    trigger: 'Guest requests checkout verification code',
    node: <OtpEmail code="482916" expiresInMinutes={10} />,
  },
  {
    slug: 'order-receipt',
    label: 'Order Confirmation',
    trigger: 'Payment succeeds (finalizeOrderPayment)',
    node: (
      <OrderReceiptEmail
        orderId="a1b2c3d4-0000-0000-0000-000000000000"
        displayId="YMI-2026-0611"
        items={SAMPLE_ITEMS}
        total={59.98}
        currency="USD"
        address={{ firstName: 'Sophie', lastName: 'Walker', address: '12 Bookbinder Lane', city: 'London', zip: 'N1 9GU' }}
        trackUrl={SAMPLE_ORDER_URL}
      />
    ),
  },
  {
    slug: 'logistics-production',
    label: 'Logistics — Printing',
    trigger: 'Admin sets order_status → production',
    node: (
      <LogisticsUpdateEmail
        orderUrl={SAMPLE_ORDER_URL}
        status="production"
        statusLabel="Printing"
        displayId="YMI-2026-0611"
        coverImageUrl={SAMPLE_COVER}
      />
    ),
  },
  {
    slug: 'logistics-shipped',
    label: 'Logistics — Shipped',
    trigger: 'Admin sets order_status → shipped',
    node: (
      <LogisticsUpdateEmail
        orderUrl={SAMPLE_ORDER_URL}
        status="shipped"
        statusLabel="Shipped"
        displayId="YMI-2026-0611"
        trackingCarrier="DHL Express"
        trackingNumber="JD014600003756123456"
        trackingUrl="https://www.dhl.com/track?id=JD014600003756123456"
        note="Your package left our print partner today."
        coverImageUrl={SAMPLE_COVER}
      />
    ),
  },
  {
    slug: 'logistics-delivered',
    label: 'Logistics — Delivered',
    trigger: 'Admin sets order_status → delivered',
    node: (
      <LogisticsUpdateEmail
        orderUrl={SAMPLE_ORDER_URL}
        status="delivered"
        statusLabel="Delivered"
        displayId="YMI-2026-0611"
        coverImageUrl={SAMPLE_COVER}
      />
    ),
  },
  {
    slug: 'delivery',
    label: 'Final PDF Delivery',
    trigger: 'Admin releases final job (/admin/finals)',
    node: (
      <DeliveryEmail
        orderUrl={SAMPLE_ORDER_URL}
        displayId="YMI-2026-0611"
        downloadUrl="https://www.ymistory.com/api/orders/a1b2c3d4/download"
        coverImageUrl={SAMPLE_COVER}
      />
    ),
  },
  {
    slug: 'abandonment',
    label: 'Unpaid Reminder',
    trigger: 'Cron: order unpaid past reminder threshold',
    node: (
      <AbandonmentEmail
        resumeUrl="https://www.ymistory.com/checkout?resume=a1b2c3d4"
        items={[
          { name: SAMPLE_ITEMS[0].name, quantity: 1, coverImageUrl: SAMPLE_COVER },
          { name: SAMPLE_ITEMS[1].name, quantity: 1 },
        ]}
        displayId="YMI-2026-0611"
      />
    ),
  },
]

function viewerHtml(list: Variant[]): string {
  const nav = list
    .map(
      (v, i) => `
      <button class="nav-item${i === 0 ? ' active' : ''}" data-src="${v.slug}.html">
        <span class="nav-label">${v.label}</span>
        <span class="nav-trigger">${v.trigger}</span>
      </button>`
    )
    .join('')

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>YMI Story — Email Previews</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: Inter, -apple-system, 'Segoe UI', sans-serif; background: #f4f1ec; height: 100vh; display: flex; overflow: hidden; }
  aside { width: 280px; min-width: 280px; background: #1f1b16; color: #e8e2d9; display: flex; flex-direction: column; }
  .side-head { padding: 20px 18px 14px; border-bottom: 1px solid rgba(255,255,255,0.08); }
  .side-head h1 { font-size: 15px; font-weight: 700; letter-spacing: 0.04em; }
  .side-head p { font-size: 11px; color: #9a917f; margin-top: 4px; }
  nav { flex: 1; overflow-y: auto; padding: 10px; }
  .nav-item { display: block; width: 100%; text-align: left; background: none; border: 0; border-radius: 10px; padding: 11px 12px; cursor: pointer; color: inherit; margin-bottom: 2px; }
  .nav-item:hover { background: rgba(255,255,255,0.06); }
  .nav-item.active { background: rgba(245, 158, 11, 0.18); }
  .nav-item.active .nav-label { color: #fbbf24; }
  .nav-label { display: block; font-size: 13px; font-weight: 600; }
  .nav-trigger { display: block; font-size: 10.5px; color: #8d8472; margin-top: 3px; line-height: 1.35; }
  main { flex: 1; display: flex; flex-direction: column; min-width: 0; }
  .toolbar { display: flex; align-items: center; gap: 10px; padding: 12px 18px; background: #fffdf9; border-bottom: 1px solid #e7e0d4; }
  .toolbar .title { font-size: 13px; font-weight: 600; color: #44403c; margin-right: auto; }
  .seg { display: flex; background: #eee8dd; border-radius: 999px; padding: 3px; }
  .seg button { border: 0; background: none; padding: 6px 16px; border-radius: 999px; font-size: 12px; font-weight: 600; color: #78716c; cursor: pointer; }
  .seg button.on { background: #fff; color: #b45309; box-shadow: 0 1px 4px rgba(0,0,0,0.08); }
  .stage { flex: 1; overflow: auto; padding: 0; }
  /* Desktop: emulate a mail client reading pane — full available width */
  .stage.desktop iframe { border: 0; display: block; width: 100%; height: 100%; }
  /* Mobile: real phone viewport (390 × 844). The shell keeps TRUE dimensions so the
     email renders at genuine mobile width; transform:scale fits it to the monitor
     without distorting proportions. Content scrolls inside, like a real phone. */
  .stage.mobile { display: flex; align-items: center; justify-content: center; padding: 22px; overflow: hidden; }
  .stage.mobile .phone { width: 390px; height: 844px; flex: none; border-radius: 38px; border: 10px solid #1c1917; background: #1c1917; box-shadow: 0 24px 60px rgba(0,0,0,0.35); overflow: hidden; transform-origin: center center; }
  .stage.mobile iframe { border: 0; display: block; width: 100%; height: 100%; border-radius: 28px; background: #f1e6d2; }
</style>
</head>
<body>
  <aside>
    <div class="side-head">
      <h1>YMI STORY EMAILS</h1>
      <p>7 variants · 5 trigger nodes</p>
    </div>
    <nav>${nav}</nav>
  </aside>
  <main>
    <div class="toolbar">
      <span class="title" id="current-title">${list[0].label}</span>
      <div class="seg">
        <button id="btn-desktop" class="on">💻 Desktop</button>
        <button id="btn-mobile">📱 Mobile 390×844</button>
      </div>
    </div>
    <div class="stage desktop" id="stage">
      <div class="phone" id="phone-shell" style="display: contents;">
        <iframe id="frame" src="${list[0].slug}.html"></iframe>
      </div>
    </div>
  </main>
<script>
  const frame = document.getElementById('frame');
  const title = document.getElementById('current-title');
  const stage = document.getElementById('stage');
  const phoneShell = document.getElementById('phone-shell');
  document.querySelectorAll('.nav-item').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      frame.src = btn.dataset.src;
      title.textContent = btn.querySelector('.nav-label').textContent;
    });
  });
  document.getElementById('btn-desktop').addEventListener('click', e => {
    stage.className = 'stage desktop';
    phoneShell.style.display = 'contents';
    e.target.classList.add('on');
    document.getElementById('btn-mobile').classList.remove('on');
  });
  document.getElementById('btn-mobile').addEventListener('click', e => {
    stage.className = 'stage mobile';
    phoneShell.style.display = 'block';
    e.target.classList.add('on');
    document.getElementById('btn-desktop').classList.remove('on');
    fitPhone();
  });
  function fitPhone() {
    if (!stage.classList.contains('mobile')) return;
    const r = stage.getBoundingClientRect();
    // phone outer box = 410 × 864 (incl. bezel); scale proportionally, never up
    const s = Math.min(1, (r.width - 40) / 410, (r.height - 40) / 864);
    phoneShell.style.transform = 'scale(' + s + ')';
  }
  window.addEventListener('resize', fitPhone);
</script>
</body>
</html>`
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true })
  copyFileSync(join(__dirname, '..', 'public', 'hero-poster.webp'), join(OUT_DIR, SAMPLE_COVER))
  // Mirror production email assets so relative URLs resolve in the preview iframes.
  const assetsDir = join(__dirname, '..', 'public', 'email-assets')
  for (const f of readdirSync(assetsDir)) {
    copyFileSync(join(assetsDir, f), join(OUT_DIR, f))
  }
  for (const v of variants) {
    const html = await render(v.node)
    writeFileSync(join(OUT_DIR, `${v.slug}.html`), html, 'utf8')
    console.log(`  rendered ${v.slug}.html`)
  }
  writeFileSync(join(OUT_DIR, 'index.html'), viewerHtml(variants), 'utf8')
  console.log(`\nDone. Open email-previews/index.html in a browser.`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
