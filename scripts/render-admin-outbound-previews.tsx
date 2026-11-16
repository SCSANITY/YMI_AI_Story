import * as React from 'react'
import { render } from '@react-email/render'
import { copyFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { GeneralMailLetterEmail } from '../components/emails/GeneralMailLetterEmail'
import type { GeneralMailContentBlock } from '../src/lib/general-mail-content'

const root = fileURLToPath(new URL('../', import.meta.url))
const output = resolve(root, 'email-previews', 'admin-outbound')
const paragraph = (text: string): GeneralMailContentBlock => ({ type: 'paragraph', content: [{ text }] })
const signoff = paragraph('Warmly,\nAmy\nYMI Story')

const examples: Array<{
  id: string
  subject: string
  blocks: GeneralMailContentBlock[]
}> = [
  {
    id: 'reply',
    subject: 'Re: A quick question about your book',
    blocks: [
      paragraph('Hi Sophie,'),
      paragraph('Thanks for checking in! We have your updated message and will use it for the printed copy. You do not need to send it again.'),
      signoff,
    ],
  },
  {
    id: 'new',
    subject: 'A few details about your storybook',
    blocks: [
      paragraph('Hi Sophie,'),
      paragraph('Thank you for making a storybook with us. I wanted to send you a quick note before we prepare your printed copy. It is a good moment to look at the preview and make sure the details feel right for your family.'),
      paragraph('When you have a moment, please double-check these three things:'),
      {
        type: 'bulletList',
        items: [
          [{ text: 'The spelling of your child\'s name', marks: ['bold'] }, { text: ', including any accents or capital letters.' }],
          [{ text: 'The special message you would like printed at the front of the book.' }],
          [{ text: 'The delivery address and the best name for the parcel.' }],
        ],
      },
      {
        type: 'paragraph',
        content: [
          { text: 'You can find your preview on ' },
          { text: 'your order page', href: 'https://example.test/orders/sample' },
          { text: '. If anything looks different from what you expected, reply here and tell me which page you noticed it on. It is fine to describe it in your own words.' },
        ],
      },
      paragraph('A couple of lines from your earlier message were especially helpful:'),
      { type: 'quote', content: [{ text: 'We would love the special message to sound like something we would say at bedtime.', marks: ['italic'] }] },
      paragraph('That is a lovely way to think about it. A short message in your own voice is plenty; it does not need to fill the whole page. I am happy to help if you are still deciding what to write.'),
      paragraph('Thank you again, and let me know if there is anything else I can check for you.'),
      signoff,
    ],
  },
]

const viewer = '<!doctype html>' + `
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>YMI Story | Admin Inbox stationery preview</title>
<style>
  *{box-sizing:border-box}body{margin:0;background:#f3eee7;color:#3e2c1b;font:15px system-ui,sans-serif}
  header{background:#fffdf7;padding:14px 20px;border-bottom:1px solid #e6d7bd}
  h1{font-size:18px;margin:0 0 4px}p{margin:0 0 12px;color:#685641}
  nav{display:flex;gap:8px;align-items:center;flex-wrap:wrap}nav button{font:inherit;border:1px solid #e2c599;border-radius:8px;padding:7px 12px;background:#fff;color:inherit;cursor:pointer}
  button[aria-pressed="true"]{background:#fce4b7;border-color:#c98428}
  .divider{color:#b39466} #subject{font-size:13px;margin:10px 0 0} main{padding:6px 10px 4px}
  iframe{display:block;width:100%;height:calc(100vh - 156px);min-height:440px;max-width:980px;margin:auto;border:0;background:#f1e6d2}
  iframe.phone{width:min(100%,390px);border:1px solid #ddc8a1;border-radius:12px}
</style></head><body>
<header><h1>Admin Inbox stationery</h1><p>Local sample only. Nothing is sent.</p>
<nav aria-label="Preview settings">
 <button type="button" data-example="reply" aria-pressed="true">Short reply</button>
 <button type="button" data-example="new" aria-pressed="false">Long email</button>
 <span class="divider" aria-hidden="true">|</span>
 <button type="button" data-size="desktop" aria-pressed="true">Desktop</button>
 <button type="button" data-size="phone" aria-pressed="false">Mobile</button>
</nav>
<p id="subject">Subject: Re: A quick question about your book</p></header>
<main><iframe id="preview" src="reply.html" title="Rendered email preview" sandbox></iframe></main>
<script>
 const subjects = Object.fromEntries(${JSON.stringify(examples.map(({ id, subject }) => [id, subject]))});
 const frame = document.getElementById('preview');
 for (const key of ['example','size']) {
   const buttons = [...document.querySelectorAll('button[data-'+key+']')];
   for (const button of buttons) button.addEventListener('click', () => {
     for (const peer of buttons) peer.setAttribute('aria-pressed', String(peer===button));
     if (key==='example') {
       const example=button.dataset.example;
       frame.src=example+'.html';
       document.getElementById('subject').textContent='Subject: '+subjects[example];
     } else frame.classList.toggle('phone', button.dataset.size==='phone');
   });
 }
</script></body></html>`

async function main() {
  mkdirSync(output, { recursive: true })
  // Copy the actual production artwork for an offline preview.
  for (const filename of ['banner.png', 'logo-full.png', 'seal.png', 'texture.jpg']) {
    copyFileSync(resolve(root, 'public', 'email-assets', filename), resolve(output, filename))
  }
  process.env.EMAIL_ASSET_BASE = '.'
  for (const { id, blocks } of examples) {
    const html = await render(<GeneralMailLetterEmail bodyDocument={{ version: 1, blocks }} />)
    writeFileSync(resolve(output, id + '.html'), html, 'utf8')
  }
  writeFileSync(resolve(output, 'index.html'), viewer, 'utf8')
  console.log('Open email-previews/admin-outbound/index.html')
}

main().catch((error: unknown) => {
  console.error(error)
  process.exitCode = 1
})
