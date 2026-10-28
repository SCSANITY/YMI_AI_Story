// Offline copy/layout fixture: actual Grid + Tailwind, synthetic data, no fetch.
// node tests/my-books-checkout-copy-fixture.mjs; open tmp/my-books-s2-copy/index.html
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const require = createRequire(path.join(root, 'package.json'))
const out = path.join(root, 'tmp/my-books-s2-copy')
fs.mkdirSync(out, { recursive: true })
const entry = `
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {MyBooksGrid} from '../../app/my-books/MyBooksGrid';
import {getUiMessage as t} from '../../src/lib/i18n-messages';
const noop=()=>{};
const items=[{creation_id:'demo',template_id:'Demo_story',templates:{name:'A Story for Alston',story_type:'Adventure'}}];
const grid=React.createElement(MyBooksGrid,{items,gridClass:'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 md:gap-10',
 displayCurrency:'USD',pendingAction:null,pendingCustomizeHref:null,dedicationChoices:{demo:{creationId:'demo',decision:'undecided',body:null,revision:null,previouslyPurchased:false}},t,
 resolveCover:()=>null,resolveTemplatePrice:()=>39,resolveTemplateCompareAtPrice:()=>49,resolveTemplateDiscountPercent:()=>20,
 buildPreviewHref:()=>'/fixture-only',onPreview:noop,onFinishDedication:noop,onPrefetchPreview:noop,onDelete:noop,onAddToCart:noop,onBuyNow:noop});
export const markup=renderToStaticMarkup(React.createElement('main',{className:'mx-auto max-w-7xl px-4 py-8 md:px-8'},
 React.createElement('h1',{className:'mb-8 text-2xl font-semibold'},'Saved Previews — local copy fixture'),grid));
`
fs.writeFileSync(path.join(out, 'entry.tsx'), entry)
await require('esbuild').build({ entryPoints: [path.join(out, 'entry.tsx')], outfile: path.join(out, 'render.cjs'),
  bundle: true, platform: 'node', format: 'cjs', jsx: 'automatic', tsconfig: path.join(root, 'tsconfig.json'),
  plugins: [{ name: 'offline-native-image', setup(build) {
    build.onResolve({ filter: /^next\/image$/ }, () => ({ path: 'image', namespace: 'shim' }))
    build.onLoad({ filter: /.*/, namespace: 'shim' }, () => ({ contents: "export default 'img'", loader: 'js' }))
  }}], logLevel: 'error' })
const { markup } = require(path.join(out, 'render.cjs'))
const css = await require('postcss')([require('@tailwindcss/postcss')({ base: root })])
  .process(fs.readFileSync(path.join(root, 'app/globals.css'), 'utf8'), { from: path.join(root, 'app/globals.css') })
fs.writeFileSync(path.join(out, 'styles.css'), css.css)
fs.writeFileSync(path.join(out, 'index.html'), `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="styles.css"><style>body{margin:0;font-family:Arial,sans-serif;background:#fffaf5}</style></head><body>${markup}<script>
const hints=[...document.querySelectorAll('p')].filter(n=>n.textContent.startsWith("We'll use your saved edition"));
const rect=n=>{const r=n.getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,height:r.height}};
document.body.dataset.geometry=JSON.stringify({viewport:innerWidth,scrollWidth:document.documentElement.scrollWidth,hints:hints.map(rect),buttons:[...document.querySelectorAll('button')].filter(n=>/Buy Now|Finish in Preview/.test(n.textContent)).map(n=>({text:n.textContent,...rect(n)}))});
</script></body></html>`)
console.log(path.join(out, 'index.html'))
