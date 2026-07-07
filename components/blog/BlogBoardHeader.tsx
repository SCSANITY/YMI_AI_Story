import { Megaphone } from 'lucide-react'

export function BlogBoardHeader() {
  return (
    <div className="mb-8 rounded-[28px] border border-white/80 bg-white/72 p-6 shadow-[0_18px_60px_rgba(120,74,20,0.10)] backdrop-blur-2xl md:p-8">
      <div className="flex items-center gap-3 text-amber-600">
        <Megaphone className="h-6 w-6" />
        <span className="text-xs font-bold uppercase tracking-[0.28em]">YMI Story Board</span>
      </div>
      <h1 className="mt-4 font-title text-4xl text-gray-900 md:text-5xl">Announcements</h1>
      <p className="mt-3 max-w-2xl text-sm leading-6 text-gray-600 md:text-base">
        Product news, family storytelling notes, and important updates from the YMI Story team.
      </p>
    </div>
  )
}
