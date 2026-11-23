import * as React from 'react'
import { emailButtons, emailTheme, emailAsset } from './EmailLayout'
import type { GeneralMailDocument, GeneralMailInline } from '@/lib/general-mail-content'
import { actionBase, type ReleaseAction, type ReleaseLinks } from '@/lib/release-mail-body'

export function EditedReleaseBody({ document, links, cover, seal, pdf }: {
  document: GeneralMailDocument; links: ReleaseLinks; cover?: string; seal?: string; pdf?: boolean
}) {
  function inline(parts: GeneralMailInline[], standalone = false) {
    return parts.map((part,i) => {
      let node: React.ReactNode = part.text
      for (const mark of part.marks ?? []) {
        node = mark === 'bold' ? <strong>{node}</strong> : mark === 'italic' ? <em>{node}</em> : <u>{node}</u>
      }
      const action = part.href?.slice(actionBase.length) as ReleaseAction | undefined
      const url = action && links[action]
      return url ? <a key={i} href={url} style={standalone ? emailButtons.primary : {color:'#93500b'}}>{node}</a>
        : <React.Fragment key={i}>{node}</React.Fragment>
    })
  }
  return <div style={{color:emailTheme.inkDark,fontFamily:emailTheme.serif,fontSize:16,lineHeight:1.55,whiteSpace:'pre-wrap'}}>
    {document.blocks.map((b,i) => {
      if ('items' in b) {
        const List = b.type === 'orderedList' ? 'ol' : 'ul'
        return <List key={i}>{b.items.map((row,n) => <li key={n}>{inline(row)}</li>)}</List>
      }
      const Tag = b.type === 'heading' ? 'h2' : b.type === 'quote' ? 'blockquote' : 'p'
      const action = b.content.length === 1 && !!b.content[0].href
      return <React.Fragment key={i}>
        {pdf && b.content.some(part=>part.href === actionBase+'pdf') && <img alt="Your book cover" src={cover || emailAsset('cover-placeholder.png')} width={150} style={{display:'block',margin:'16px auto'}} />}
        <Tag style={{margin:'0 0 14px',textAlign:action?'center':undefined}}>{inline(b.content,action)}</Tag>
      </React.Fragment>
    })}
    <img alt="" src={seal || emailAsset('seal.png')} width={92} style={{display:'block',marginLeft:'auto'}} />
  </div>
}
