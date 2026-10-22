// Synthetic local UI fixture only: no network,mail,Storage or real credentials.
// Upload service is stubbed by the fixture builder; production component is unchanged.
import React from 'react';import{createRoot}from'react-dom/client';import{OrderMaterialsClient}from'../../components/orders/OrderMaterialsClient';
 const order='00000000-0000-4000-8000-000000000010';let body='With love, always.';let revision=1;
 window.fetch=async(url,init={})=>{if(!String(url).startsWith('/api/orders/'))throw new Error('Fixture external request blocked');if(String(url).endsWith('/recovery'))return Response.json({challengeId:'fixture-challenge',accessPath:'/orders/'+order+'/materials#token='+('a'.repeat(43))},{status:202});
 if(new URLSearchParams(location.search).has('invalid')&&!init.method&&init.headers?.Authorization!=='Bearer '+('a'.repeat(43)))return Response.json({error:'material_access_denied'},{status:403});
 if(init.method==='POST'){const value=JSON.parse(init.body);body=value.body;revision++;return Response.json({saved:true})}
 return Response.json({order_id:order,dedication_deadline:'2026-10-23T12:00:00Z',items:[{cart_item_id:'00000000-0000-4000-8000-000000000020',creation_id:'00000000-0000-4000-8000-000000000030',template_id:'Birthdayboy_story',package_type:'supreme',book:{title:"Alston's Birthday Adventure",cover_url:'/fixture-cover.svg',cover_status:'ready'},dedication:{decision:'confirmed',body,revision},can_edit_dedication:true,voice_ready:false,can_submit_voice:true}]})};
 // Static navigation stand-in only; real routes inherit Navbar from AppShell.
 createRoot(document.getElementById('root')).render(<><header className="h-16 border-b border-stone-200 bg-white px-5 flex items-center"><span className="font-serif text-xl font-bold">YMI Story</span></header><OrderMaterialsClient orderId={order}/></>);
