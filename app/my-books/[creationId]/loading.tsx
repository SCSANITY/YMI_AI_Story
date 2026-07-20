export default function MyBookReaderLoading() {
  return (
    <div className="page-surface min-h-screen px-4 pb-16 pt-24">
      <div className="mx-auto max-w-6xl animate-pulse">
        <div className="h-5 w-36 rounded-full bg-amber-100" />
        <div className="mx-auto mt-12 h-7 w-64 rounded-full bg-gray-200" />
        <div className="mx-auto mt-8 aspect-[2/1] w-full max-w-3xl rounded-lg bg-white/70 shadow-sm" />
        <div className="mx-auto mt-8 h-11 w-40 rounded-full bg-gray-200" />
      </div>
    </div>
  )
}
