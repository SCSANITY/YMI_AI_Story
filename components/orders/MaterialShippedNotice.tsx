import Link from 'next/link'
export function MaterialShippedNotice(){
  return <p role="status" className="mt-3 text-sm">Your book has shipped. Please <Link href="/support" className="underline">contact us</Link> if you need help.</p>
}
