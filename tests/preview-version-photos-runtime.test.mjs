import assert from 'node:assert/strict'
import test from 'node:test'
import {loadUi} from './helpers/preview-uiux-harness.mjs'

for(const kind of ['customer','anon'])test(`photo restoration signs only ${kind}-owned face assets from the owned group`,async()=>{
 const column=kind==='customer'?'customer_id':'anon_session_id',ownerValue='owner',signed=[],queries=[]
 const owned={owner_type:kind,[column]:ownerValue}
 const creations=[
  {...owned,creation_id:'one',customize_snapshot:{storagePath:'user-assets/own.jpg',private:'never returned'}},
  {...owned,creation_id:'two',customize_snapshot:{storagePath:'user-assets/foreign.jpg'}},
  {...owned,creation_id:'wrong-bucket',customize_snapshot:{storagePath:'jobs/private.png'}},
  {...owned,creation_id:'outside-group',customize_snapshot:{storagePath:'user-assets/outside.jpg'}},
  {...owned,[column]:'other',creation_id:'cross-owner',customize_snapshot:{storagePath:'user-assets/cross.jpg'}},
 ]
 const assets=[
  {...owned,asset_type:'face_image',asset_id:'asset-one',storage_path:'user-assets/own.jpg'},
  {...owned,[column]:'other',asset_type:'face_image',asset_id:'asset-foreign',storage_path:'user-assets/foreign.jpg'},
  {...owned,asset_type:'voice',asset_id:'not-face',storage_path:'user-assets/foreign.jpg'},
  {...owned,asset_type:'face_image',asset_id:'outside',storage_path:'user-assets/outside.jpg'},
 ]
 const client={from(table){let rows=table==='creations'?creations:assets;const query={table,filters:[]};queries.push(query);return{
  select(value){query.select=value;return this},
  in(key,values){query.filters.push([key,values]);rows=rows.filter(row=>values.includes(row[key]));return this},
  eq(key,value){query.filters.push([key,value]);rows=rows.filter(row=>row[key]===value);return this},
  then(resolve){resolve({data:rows,error:null})},
 }},storage:{from(bucket){assert.equal(bucket,'raw-private');return{async createSignedUrl(path,ttl){signed.push([path,ttl]);return{data:{signedUrl:'https://signed.test/photo'}}}}}}}
 const fn=loadUi('src/lib/preview-version-photos-server.ts',{
  './supabaseAdmin':{supabaseAdmin:client},'./userAssetsStorage':{USER_ASSET_SIGN_TTL_SECONDS:600},
  './checkout-owner':{ownerFilter:()=>({owner_type:kind,column,value:ownerValue})},
 }).readPreviewVersionPhotos
 const result=await fn({},['one','two','wrong-bucket','cross-owner'])
 assert.deepEqual(JSON.parse(JSON.stringify([...result])),[['one',{photoUrl:'https://signed.test/photo',faceAssetId:'asset-one'}]])
 assert.deepEqual(signed,[['user-assets/own.jpg',600]])
 for(const q of queries){assert.ok(q.filters.some(([key,value])=>key===column&&value===ownerValue));assert.ok(q.filters.some(([key,value])=>key==='owner_type'&&value===kind))}
 assert.equal(JSON.stringify([...result]).includes('storagePath'),false)
 assert.equal(JSON.stringify([...result]).includes('customize_snapshot'),false)
})
