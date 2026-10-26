import assert from 'node:assert/strict'
import test from 'node:test'
import {readFileSync} from 'node:fs'
import {loadUi,uiNodes,uiText} from './helpers/preview-uiux-harness.mjs'

const globals={process:{env:{}}}
const packages=[{package_type:'basic',list_price_usd:49,sale_price_usd:39,row_version:1},{package_type:'supreme',list_price_usd:149,sale_price_usd:89,row_version:1}]
const row=()=>({template_id:'DB_only_story',name:'Live catalog name',description:'Live catalog description',cover_image_path:'https://example.test/cover.webp',package_prices:packages})

test('every existing Admin Catalog mutation invalidates one complete path family only after a successful write',async()=>{
 const paths=[['/'],['/books'],['/collaboration'],['/personalize/[bookID]','page'],['/api/templates','layout'],['/sitemap.xml']]
 for(const [file,body] of [
  ['pricing',{templateId:'DB_only_story',packageType:'supreme',expectedVersion:1,listPriceUsd:160,salePriceUsd:120}],
  ['settings',{templateId:'DB_only_story',catalogDisplayPackageType:'supreme'}],
  ['settings',{applyToAll:true,catalogDisplayPackageType:'basic'}],
  ['home-placements',{sectionKey:'brand_new',expectedVersion:1,templateIds:['DB_only_story']}],
 ])for(const mode of ['success','forbidden','invalid','write_error','conflict']){
  const invalidations=[],writes=[]
  const chain={update(data){writes.push(data);return chain},eq(){return chain},select(){return chain},maybeSingle(){return chain},then(resolve){return Promise.resolve({data:mode==='conflict'?null:file==='pricing'?{...packages[1],row_version:2}:[{template_id:'DB_only_story'}],error:mode==='write_error'?{message:'synthetic write failure'}:null}).then(resolve)}}
  const route=loadUi(`app/api/admin/catalog/${file}/route.ts`,{
   'next/server':{NextResponse:{json:Response.json}},
   'next/cache':{revalidatePath:(...args)=>invalidations.push(args)},
   '@/lib/adminAuth':{requireAdminCustomer:async()=>mode==='forbidden'?null:{customer_id:'admin'}},
   '@/lib/supabaseAdmin':{supabaseAdmin:{from:()=>chain,rpc:async()=>({data:2,error:['write_error','conflict'].includes(mode)?{message:'changed in another session'}:null})}},
  },globals)
  const response=await route.PATCH(new Request('https://example.test',{method:'PATCH',body:JSON.stringify(mode==='invalid'?{}:body)}))
  if(mode==='success'){assert.equal(response.status,200);assert.deepEqual(invalidations,paths)}
  else if(mode==='conflict'&&file==='settings'){
   assert.equal(response.status,404);assert.equal(invalidations.length,0)
  }else{assert.ok(response.status>=400);assert.equal(invalidations.length,0)}
 }
})

test('Personalize metadata,content and static params share DB authority;missing/inactive fail404 and loader failure is loud',async()=>{
 let book={bookID:'DB_only_story',title:'Live catalog name',description:'Live catalog description',coverUrl:'https://example.test/new.webp'},failure=false
 const reads=[],notFound=()=>{throw Error('NEXT_404')}
 const Page=loadUi('app/personalize/[bookID]/page.tsx',{
  react:{Suspense:'suspense'},'next/navigation':{notFound},
  '@/components/PersonalizePage':{default:'personalize-page',__esModule:true},'@/components/CustomizeAccessGate':{CustomizeAccessGate:'access-gate'},
  '@/lib/homepage-banners':{getPublishedHomepageBanners:async()=>({})},
  '@/lib/template-catalog-server':{loadActiveTemplateDetail:async id=>{reads.push(id);if(failure)throw Error('DB unavailable');return book},loadActiveTemplateCatalog:async options=>{assert.equal(options.strict,true);if(failure)throw Error('DB unavailable');return book?[book]:[]}},
 },globals)
 const params={params:Promise.resolve({bookID:'DB_only_story'})}
 const metadata=await Page.generateMetadata(params)
 assert.equal(metadata.title,'Live catalog name - Storybook')
 assert.equal(metadata.description,'Live catalog description')
 assert.equal(metadata.openGraph.images[0].url,'https://example.test/new.webp')
 const tree=await Page.default(params)
 assert.equal(uiNodes(tree).find(node=>node.type==='personalize-page').props.initialBook,book)
 assert.deepEqual(Array.from(await Page.generateStaticParams(),x=>x.bookID),['DB_only_story'])
 assert.equal(Page.dynamic,'force-static');assert.equal(Page.dynamicParams,true);assert.equal(Page.revalidate,300)
 book=null
 await assert.rejects(Page.default(params),/NEXT_404/);await assert.rejects(Page.generateMetadata(params),/NEXT_404/)
 failure=true
 await assert.rejects(Page.generateStaticParams(),/DB unavailable/)
 await assert.rejects(Page.generateMetadata(params),/DB unavailable/)
 assert.ok(reads.every(id=>id==='DB_only_story'))
})

test('strict prerender catalog never silently produces a partial set on invalid pricing or invalid template identity',async()=>{
 for(const rows of [[row(),{...row(),template_id:'Bad',package_prices:[]}],[row(),{...row(),template_id:''}]]){
  const chain={select(){return chain},eq(){return chain},then(resolve){return Promise.resolve({data:rows,error:null}).then(resolve)}}
  const loader=loadUi('src/lib/template-catalog-server.ts',{'server-only':{},react:{cache:fn=>fn},'@/lib/supabaseAdmin':{supabaseAdmin:{from:()=>chain}}},globals)
  await assert.rejects(loader.loadActiveTemplateCatalog({strict:true}),e=>e.status===503)
 }
})

test('public ISR handlers throw transient load errors instead of returning cacheable error entries;missing keeps JSON404',async()=>{
 const failure=Object.assign(new Error('transient fixture DB failure'),{status:503})
 for(const file of ['app/api/templates/route.ts','app/api/templates/[templateId]/route.ts']){
  const api=loadUi(file,{'next/server':{NextResponse:{json:Response.json}},'@/lib/template-catalog-server':{loadActiveTemplateCatalog:async()=>{throw failure},loadActiveTemplateDetail:async()=>{throw failure}}})
  assert.equal(api.dynamic,'force-static');assert.equal(api.revalidate,60)
  await assert.rejects(api.GET(new Request('https://example.test'),{params:Promise.resolve({templateId:'DB_only_story'})}),e=>e===failure)
 }
 const api=loadUi('app/api/templates/[templateId]/route.ts',{'next/server':{NextResponse:{json:Response.json}},'@/lib/template-catalog-server':{loadActiveTemplateDetail:async()=>null}})
 const missing=await api.GET(new Request('https://example.test'),{params:Promise.resolve({templateId:'Inactive'})})
 assert.equal(missing.status,404);assert.equal((await missing.json()).error,'Template not found')
})

function cartHarness({invalid=false}={}){
 const queries=[]
 const item={cart_item_id:'cart-a',creation_id:'creation-a',owner_type:'customer',customer_id:'owner-a',package_type:'supreme',quantity:2,status:'cart',order_id:null,price_at_purchase:70,creations:{template_id:'DB_only_story',templates:{...row(),package_prices:invalid?[]:packages}}}
 const owner={ownerType:'customer',customerId:'owner-a'}
 const api=loadUi('app/api/cart/route.ts',{
  'next/server':{NextResponse:{json:Response.json}},
  '@/lib/checkout-owner':{resolveCheckoutOwner:async()=>owner,ownerFilter:()=>({owner_type:'customer',column:'customer_id',value:'owner-a'})},
  '@/lib/order-covers':{createGeneratedPreviewCoverMap:async()=>new Map(),getGeneratedPreviewCover:()=>({url:null,status:'pending'})},
  '@/lib/package-pricing-store':{},
  '@/lib/supabaseAdmin':{supabaseAdmin:{from(table){const q={table,filters:[]};queries.push(q);const chain={select(){return chain},eq(k,v){q.filters.push([k,v]);return chain},in(){return chain},order(){return chain},then(resolve){return Promise.resolve({data:[item],error:null}).then(resolve)}};return chain}}},
 },{URL})
 return {api,item,queries}
}

test('active cart projects the selected edition current price without writing stored snapshots;non-active read keeps its amount',async()=>{
 const h=cartHarness(),snapshot=JSON.stringify(h.item)
 const response=await h.api.GET(new Request('https://example.test/api/cart'))
 assert.equal(response.status,200)
 const line=(await response.json()).items[0]
 assert.equal(line.unit_price_usd,89);assert.equal(line.price_at_purchase,70)
 assert.equal(JSON.stringify(h.item),snapshot)
 assert.deepEqual(h.queries[0].filters,[['owner_type','customer'],['customer_id','owner-a']])
 const history=await h.api.GET(new Request('https://example.test/api/cart?orderId=history&status=ordered'))
 assert.equal((await history.json()).items[0].unit_price_usd,70)
 const invalid=await cartHarness({invalid:true}).api.GET(new Request('https://example.test/api/cart'))
 assert.equal(invalid.status,503);assert.match(invalid.headers.get('cache-control'),/private, no-store/)
})

test('cart prices never fall back to the public display package,including mini cart;invalid selected-edition amounts fail closed',()=>{
 const price=loadUi('src/lib/cart-price.ts')
 const item={id:'one',bookID:'DB_only_story',book:{price:39,title:'Fixture'},priceAtPurchase:89,quantity:2}
 assert.equal(price.cartItemUnitPrice(item)*item.quantity,178)
 for(const value of [undefined,null,0,-1,NaN,Infinity,'89'])assert.throws(()=>price.cartItemUnitPrice({...item,priceAtPurchase:value}),/current book prices/)
 for(const file of ['app/cart/page.tsx','app/cart/CartItemsList.tsx','app/checkout/page.tsx','app/checkout/CheckoutItemsSection.tsx','components/cart/MiniCart.tsx']){
  const source=readFileSync(new URL('../'+file,import.meta.url),'utf8')
  assert.doesNotMatch(source,/priceAtPurchase\s*\?\?\s*item\.book\.price/)
  assert.match(source,/cartItemUnitPrice/)
 }
})

test('changed Catalog prices render consistently in card,C,Preview,dialog,cart,checkout and mini cart in both currencies',()=>{
 const react={memo:fn=>fn,useEffect(){},useLayoutEffect(){},useCallback:fn=>fn,useMemo:fn=>fn(),useRef:()=>({current:null}),useState:v=>[typeof v==='function'?v():v,()=>{}],useId:()=> 'fixture'}
 const t=loadUi('src/lib/i18n-messages.ts').getUiMessage
 for(const currency of ['USD','JPY'])for(const edition of ['basic','supreme']){
  const stubs={react,'react-dom':{createPortal:node=>node},'@/components/Button':{Button:'button'},'@/components/BookCardCover':{BookCardCover:'cover'},'@/components/OrderCoverImage':{default:'cover',__esModule:true},'@/lib/useI18n':{useI18n:()=>({t})},'@/contexts/GlobalContext':{useGlobalContext:()=>({displayCurrency:currency})},'framer-motion':{AnimatePresence:'animation',motion:new Proxy({},{get:()=> 'motion'})}}
  const load=file=>loadUi(file,stubs,{...globals,document:{body:{}}})
  const book=load('src/lib/book-catalog.ts').templateRowToBook({...row(),catalog_display_package_type:edition,package_prices:[{...packages[0],list_price_usd:65,sale_price_usd:51},{...packages[1],list_price_usd:155,sale_price_usd:123}]})
  const model=book.packagePricing[edition],unit=model.effectivePriceUsd,item={id:'line',bookID:book.bookID,quantity:2,priceAtPurchase:unit,book:{...book,price:1},personalization:{bookType:edition}}
  const noop=()=>{}
  const views=[
   load('components/BookCard.tsx').BookCard({book,isFavorite:false,coverSrc:'',title:book.title,onClick:noop,onFavoriteClick:noop}),
   load('components/personalize/product/EditionCards.tsx').default({pricing:book.packagePricing,currency}),
   load('components/personalize/PreviewYourBookPanel.tsx').PreviewYourBookPanel({value:edition,pricing:book.packagePricing,currency,childName:'Mia',voiceReady:false,actions:null,onChange:noop,onDetails:noop,onVoice:noop,onMessage:noop}),
   load('components/personalize/EditionDetailsDialog.tsx').EditionDetailsDialog({edition,selected:edition,price:model,currency,onChoose:noop,onClose:noop}),
  ]
  const format=load('src/lib/locale-pricing.ts').formatDisplayCurrency
  for(const view of views)assert.ok(uiText(view).includes(format(unit,currency)))
  const list=load('app/cart/CartItemsList.tsx').CartItemsList({items:[item],selectedIds:['line'],dedicationChoices:{},t,displayCurrency:currency})
  const checkout=load('app/checkout/CheckoutItemsSection.tsx').CheckoutItemsSection({items:[item],remainingCartItems:[],selectedCurrency:currency,t,resolveCoverUrl:()=>null,resolveCoverStatus:()=> 'pending'})
  const Mini=load('components/cart/MiniCart.tsx').MiniCart
  const miniProps={open:true,anchorRef:{current:null},items:[item],displayCurrency:currency,isHydrated:true}
  const mini=Mini(miniProps)
  for(const view of [list,checkout,mini])assert.ok(uiText(view).includes(format(unit*2,currency)))
  const error=Mini({...miniProps,items:[{...item,priceAtPurchase:undefined}]})
  assert.ok(uiNodes(error).some(node=>node.props?.role==='alert'))
  assert.doesNotMatch(uiText(error),/\$2\.00/)
 }
})

test('GlobalContext exposes cart and checkout load errors,clears them on a valid server price,and never uses stored/display fallback',async()=>{
 let cursor=0,context,fail=true
 const cells=[],fixture=cartHarness().item
 const react={
  createContext:()=>({Provider:props=>{context=props.value;return null}}),useContext(){},
  useState:initial=>{const i=cursor++;if(!(i in cells))cells[i]=typeof initial==='function'?initial():initial;return[cells[i],value=>{cells[i]=typeof value==='function'?value(cells[i]):value}]},
  useRef:value=>({current:value}),useMemo:fn=>fn(),useCallback:fn=>fn,useEffect(){},
 }
 const provider=loadUi('contexts/GlobalContext.tsx',{
  react:{__esModule:true,default:react,...react},'@/lib/supabase':{supabase:{}},'@/app/actions/auth':{},
 },{...globals,fetch:async()=>fail?new Response('{}',{status:503}):Response.json({items:[{...fixture,unit_price_usd:123}]})}).GlobalProvider
 const render=()=>{cursor=0;provider({children:null,suspendAuthSync:true});return context}
 await render().refreshCart();assert.match(render().cartLoadError,/current book prices/);assert.equal(context.cart.length,0)
 fail=false;await context.refreshCart();assert.equal(render().cartLoadError,null);assert.equal(context.cart[0].priceAtPurchase,123)
 context.hydrateCheckoutItems([{...fixture,unit_price_usd:undefined}]);assert.match(render().checkoutLoadError,/current book prices/);assert.equal(context.checkoutItems.length,0)
 context.hydrateCheckoutItems(null);assert.match(render().checkoutLoadError,/current book prices/)
 context.hydrateCheckoutItems([{...fixture,unit_price_usd:123}]);assert.equal(render().checkoutLoadError,null);assert.equal(context.checkoutItems[0].priceAtPurchase,123)
 context.hydrateCheckoutItems(null);render();context.restoreCheckout([]);assert.equal(render().checkoutLoadError,null)
 const checkout=readFileSync(new URL('../app/checkout/page.tsx',import.meta.url),'utf8')
 // New-order item hydration keeps its loud price error; returning orders now
 // hydrate the complete order/items together and expose a retryable restore error.
 assert.equal(checkout.match(/\.catch\(\(\) => hydrateCheckoutItems\(null\)\)/g)?.length,1)
 assert.match(checkout,/const itemsResponsePromise = fetch\(`\/api\/cart\?orderId=[\s\S]*?fetch\(`\/api\/orders\/[\s\S]*?await itemsResponsePromise/)
 assert.match(checkout,/if \(orderRestoreError\) return <div role="alert"/)
})
