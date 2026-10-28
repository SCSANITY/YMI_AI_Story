import type { CSSProperties } from 'react'

// Static physical material, shared by Preview and the public B demo.
export const BOOK_MATERIAL = Object.freeze({ rim: 14, head: 6 })
const stack = (direction: number) => Array.from({ length: 7 }, (_, index) => {
  const depth = index + 1
  const paper = depth === 7 ? '--book-block-edge' : depth % 2 ? '--book-paper-line' : '--book-paper'
  return `${direction * depth}px ${depth}px 0 var(${paper})`
}).join(',')

export const BOOK_MATERIAL_STYLE = Object.freeze({
  '--book-rim': `${BOOK_MATERIAL.rim}px`,
  '--book-head': `${BOOK_MATERIAL.head}px`,
  '--book-paper': '#f6ecd9',
  '--book-paper-line': '#cdb894',
  '--book-block-edge': '#a88f68',
  '--book-stack-left': stack(-1),
  '--book-stack-right': stack(1),
}) as CSSProperties
