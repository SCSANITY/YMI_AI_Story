# YMI Story — Email Design Spec & Supabase Auth Templates

This is the single source of truth for the YMI Story email visual system. Use it to
(a) keep React Email templates (`components/emails/`) consistent, and (b) replicate
the look in **Supabase Auth → Email Templates** (which Supabase renders itself — it
cannot use our React components, so paste the HTML below).

---

## 1. Brand Shell Anatomy (top → bottom)

1. Outer canvas — solid `#f1e6d2`, 36px vertical padding
2. Card — max-width **920px**, `#fffdf6`, 20px radius, **2px** border `#ecc987`, soft shadow
3. Inner frame — 10px inset, **1px** border `#f3deba`, parchment texture background
4. Banner illustration — full width (`banner.png`, "A Memory to Keep")
5. Logo — `logo-full.png`, 132px, centered
6. Gold hairline divider — fading lines + `⊰ ✦ ⊰` star (code-drawn)
7. Optional title (serif, `#9a5b10`) + subtitle
8. Body content
9. Footer — social icons row → Contact Us → copyright (all `#9a5b10`)

## 2. Color Tokens

| Token | Hex | Use |
|---|---|---|
| canvas | `#f1e6d2` | outer background |
| parchment | `#fffdf6` | card fill |
| parchmentShade | `#fbf4e4` | inner cards (summary, steps) |
| frame | `#ecc987` | outer 2px border |
| frameSoft | `#f3deba` | inner 1px border |
| ink | `#5d4a33` | body text |
| inkDark | `#4a3826` | strong text |
| heading | `#9a5b10` | titles, links, footer |
| accentWarm | `#c05621` | greeting / labels |
| button gradient | `#f59e0b → #f97316` | primary CTA (amber-500→orange-500, = site Hero) |
| button fallback | `#f59e0b` | Outlook (no gradient) |

## 3. Typography

- **Serif** (headings, prose, buttons): `'Cormorant Garamond','Playfair Display',Georgia,'Times New Roman',serif`
- **Sans** (all digits — codes, prices, IDs, tracking): `Inter,'Segoe UI',Roboto,Arial,sans-serif`
- Rule: digits ALWAYS use the sans stack — Georgia's old-style figures look uneven.
- Webfonts don't load in most clients, so Cormorant falls back to Georgia by design.

## 4. Hosted Assets (live after deploy)

All under `https://www.ymistory.com/email-assets/`:
`banner.png`, `logo-full.png`, `texture.jpg`, `seal.png`, `cover-placeholder.png`,
`icon-instagram.png`, `icon-facebook.png`, `icon-tiktok.png`.

Source pipeline: `scripts/prepare-email-assets.mjs` (de-checkerboards raw art,
crops logo, generates social icons from SVG). These files must be deployed for
production emails (including Supabase) to show images.

## 5. Client Constraints (apply everywhere)

- Table layout + inline styles only (Supabase HTML and React Email both compile to this).
- No flexbox/grid. Two-column = a `<table>` with two `<td>`.
- Background images: Gmail/Apple Mail OK; Outlook ignores → always set a `bgcolor`/solid fallback.
- An empty `<td>` with a background paints full row height — put a 1px `<div>` inside instead.
- Media queries work in Gmail/Apple Mail, ignored by Outlook desktop (which shows the desktop layout).

## 6. Social / Footer Links

| Link | URL |
|---|---|
| Instagram | https://www.instagram.com/ymi.story/ |
| Facebook | https://www.facebook.com/profile.php?id=61587283844755 |
| TikTok | https://www.tiktok.com (no account yet — temporary) |
| Contact Us | https://www.ymistory.com/support |

Social links open in a new tab (`target="_blank" rel="noopener noreferrer"`).

---

## 7. Supabase Auth Email Template (paste-ready)

Supabase Dashboard → **Authentication → Email Templates**. Paste the HTML below
into each template and swap the body line per template variable:

- **Confirm signup / Magic Link / Invite**: button `href="{{ .ConfirmationURL }}"`
- **OTP code** (if used): replace the button with the code block, showing `{{ .Token }}`
- Reset password / Change email: same shell, adjust the headline + button label

> Note: in the current product, guest checkout OTP is sent by **our own** `OtpEmail`
> via Resend, not Supabase. Supabase Auth emails only fire on the `signInWithOtp` /
> account-auth path. Brand them anyway for consistency.

```html
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f1e6d2;font-family:Inter,-apple-system,'Segoe UI',Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f1e6d2;">
    <tr><td align="center" style="padding:36px 14px;">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;background:#fffdf6;border:2px solid #ecc987;border-radius:20px;overflow:hidden;">
        <tr><td style="padding:10px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #f3deba;border-radius:13px;overflow:hidden;background:#fffdf6;">
            <!-- Banner -->
            <tr><td><img src="https://www.ymistory.com/email-assets/banner.png" width="100%" alt="A Memory to Keep — YMI Story" style="display:block;width:100%;height:auto;"></td></tr>
            <!-- Body -->
            <tr><td style="padding:28px 40px 30px;">
              <img src="https://www.ymistory.com/email-assets/logo-full.png" width="132" alt="YMI Story" style="display:block;margin:0 auto 16px;">
              <p style="text-align:center;color:#c8923f;font-size:13px;letter-spacing:1px;margin:0 0 24px;">─────&nbsp;&nbsp;&#10022;&nbsp;&nbsp;─────</p>

              <h1 style="margin:0 0 10px;text-align:center;color:#9a5b10;font-family:'Cormorant Garamond',Georgia,serif;font-size:27px;font-weight:600;">Welcome to the Magic &#10022;</h1>
              <p style="margin:0 0 24px;text-align:center;color:#5d4a33;font-family:'Cormorant Garamond',Georgia,serif;font-size:15px;line-height:1.65;">Confirm your email to begin creating your child&rsquo;s personalized storybook.</p>

              <!-- PRIMARY CTA (Confirm signup / Magic link) -->
              <table role="presentation" align="center" cellpadding="0" cellspacing="0" style="margin:0 auto;">
                <tr><td style="border-radius:999px;background:#f59e0b;background-image:linear-gradient(95deg,#f59e0b 0%,#f97316 100%);">
                  <a href="{{ .ConfirmationURL }}" style="display:inline-block;padding:13px 32px;border-radius:999px;color:#fffdf6;font-family:'Cormorant Garamond',Georgia,serif;font-size:14.5px;font-weight:700;letter-spacing:.06em;text-decoration:none;">Confirm Email</a>
                </td></tr>
              </table>

              <!-- OTP VARIANT: replace the CTA above with this block when using {{ .Token }}
              <table role="presentation" align="center" cellpadding="0" cellspacing="0" style="margin:8px auto 0;border:1px solid #ecc987;border-radius:14px;background:#fbf4e4;">
                <tr><td style="padding:26px 40px;text-align:center;">
                  <div style="font-family:Inter,Arial,sans-serif;font-size:40px;font-weight:700;letter-spacing:12px;color:#4a3826;">{{ .Token }}</div>
                  <div style="font-family:'Cormorant Garamond',Georgia,serif;font-style:italic;font-size:12.5px;color:#8a7253;margin-top:12px;">Enter this code to verify your email</div>
                </td></tr>
              </table>
              -->
            </td></tr>
            <!-- Footer -->
            <tr><td style="padding:0 40px 28px;">
              <p style="text-align:center;color:#c8923f;font-size:13px;margin:0 0 14px;">─────&nbsp;&nbsp;&#10022;&nbsp;&nbsp;─────</p>
              <p style="text-align:center;margin:0 0 10px;">
                <a href="https://www.instagram.com/ymi.story/" target="_blank" style="margin:0 9px;"><img src="https://www.ymistory.com/email-assets/icon-instagram.png" width="32" alt="Instagram" style="vertical-align:middle;"></a>
                <a href="https://www.facebook.com/profile.php?id=61587283844755" target="_blank" style="margin:0 9px;"><img src="https://www.ymistory.com/email-assets/icon-facebook.png" width="32" alt="Facebook" style="vertical-align:middle;"></a>
                <a href="https://www.tiktok.com" target="_blank" style="margin:0 9px;"><img src="https://www.ymistory.com/email-assets/icon-tiktok.png" width="32" alt="TikTok" style="vertical-align:middle;"></a>
              </p>
              <p style="text-align:center;margin:0 0 12px;font-family:'Cormorant Garamond',Georgia,serif;font-size:13.5px;"><a href="https://www.ymistory.com/support" style="color:#9a5b10;text-decoration:none;font-weight:600;">Contact&nbsp;Us</a></p>
              <p style="text-align:center;margin:0;color:#9a5b10;font-family:'Cormorant Garamond',Georgia,serif;font-size:12px;">&#10022;&nbsp;&nbsp;&copy; 2026 YMI Story. All rights reserved.&nbsp;&nbsp;&#10022;</p>
            </td></tr>
          </table>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>
```

Supabase uses a 600px width (its emails are narrower than our 920px marketing
letters — that's fine; the shell scales). Adjust the headline, subtitle, and button
label per template; everything else (shell, colors, fonts, footer) stays identical.

---

## 8. Finalized Supabase Templates (archive)

All paste-ready into Supabase Dashboard → Authentication → Email Templates.
Dashboard sync status as of 2026-06-15: customer-facing Supabase Auth templates
have been updated manually in Supabase. Future changes should be applied in the
dashboard and mirrored back into this document when the shared shell or copy changes.

Status of the 6 Supabase auth templates:
- **Confirm sign up** — branded (in use) ✅
- **Magic link or OTP** — branded (in use) ✅
- **Change email address** — branded (insurance; fires if account email-change is enabled) ✅
- **Reset password** — branded (insurance; only fires if password auth is enabled) ✅
- **Reauthentication** — branded (insurance; rare sensitive-op verification) ✅
- **Invite user** — left default (only fires for Supabase back-office invites; not a customer flow)

All share the identical brand shell (parchment card, banner, logo, hairline divider,
amber→orange CTA, social+contact footer). Only the headline, subtitle, and the
button/code block differ. Variables: `{{ .ConfirmationURL }}` for link templates,
`{{ .Token }}` for code templates.

### Confirm sign up / Magic link / Change email / Reset password (LINK variant)

Use this shell; set the headline, subtitle, and button label per template, and keep
`href="{{ .ConfirmationURL }}"`:

| Template | Headline | Subtitle | Button |
|---|---|---|---|
| Confirm sign up | Welcome to the Magic ✦ | Confirm your email to begin creating your child's personalized storybook. | Confirm Email |
| Magic link | Your Magic Link ✦ | Tap the button below to securely sign in and continue your story. | Log In to YMI Story |
| Change email | Confirm Your New Email ✦ | Please confirm this is your new email address to keep your account secure. | Confirm New Email |
| Reset password | Reset Your Password ✦ | Tap the button below to set a new password for your YMI Story account. | Reset Password |

(Confirm sign up actually uses the CODE variant below with `{{ .Token }}` — it was
set up as an OTP confirm. Magic link / Change email / Reset password use the LINK variant.)

### Reauthentication / OTP (CODE variant)

Headline "Confirm It's You ✦", subtitle "For your security, please enter the code
below to confirm this action.", and the code block showing `{{ .Token }}`.

The full HTML for both variants is the shell documented in section 7 plus the
per-template body table; the live copies are maintained directly in the Supabase
dashboard. When editing, keep digits in the Inter stack and images pointed at
`https://www.ymistory.com/email-assets/`.
