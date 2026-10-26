'use client'
import {useState} from 'react'
import type {MaterialItem} from '@/lib/order-materials'
const button='rounded-full bg-amber-800 px-5 py-3 text-sm font-bold text-white disabled:opacity-50'
export function MaterialMessageEditor({item,save,busy}:{item:MaterialItem;save:(item:MaterialItem,body:string)=>Promise<void>;busy:boolean}) {
  const [body,setBody]=useState(item.dedication.body ?? '')
  if(!item.can_edit_dedication)return <section className="mt-4 space-y-3">
    <h3 className="text-sm font-semibold">Your message for <bdi>{item.child_name||'this book'}</bdi></h3>
    {item.dedication.body?.trim()?<p className="whitespace-pre-wrap break-words text-sm">{item.dedication.body}</p>
      :<p className="text-sm">No message for <bdi>{item.child_name||'this book'}</bdi>.</p>}
  </section>
  return <form onSubmit={event=>{event.preventDefault();void save(item,body)}} className="mt-4 space-y-3">
    <label className="block text-sm font-semibold" htmlFor={`dedication-${item.cart_item_id}`}>Your message for <bdi>{item.child_name||'this book'}</bdi> (optional)</label>
    <textarea id={`dedication-${item.cart_item_id}`} rows={5} maxLength={300} value={body} onChange={event=>setBody(event.target.value)}
      disabled={busy || !item.can_edit_dedication} className="w-full rounded-xl border border-stone-300 p-3" />
    <p className="text-xs text-slate-600">Leave empty for no message. Maximum 300 characters and 8 line breaks.</p>
    <button type="submit" className={button} disabled={busy}>Update message</button>
  </form>
}
