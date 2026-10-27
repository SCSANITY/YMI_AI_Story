function emphasis(text: string) {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, index) => (
    part.startsWith('**') && part.endsWith('**')
      ? <strong key={index} className="font-semibold text-slate-800">{part.slice(2, -2)}</strong>
      : part
  ))
}

// Only the FAQ's paragraphs, bullet lists and **emphasis** are supported.
// All copy stays React text; this does not interpret HTML or embed content.
export function ProductFaqAnswer({ id, text }: { id: string; text: string }) {
  return (
    <div id={id} className="space-y-3 break-words pb-4 text-sm leading-6 text-slate-600">
      {text.split(/\n\s*\n/).map((block, index) => {
        const lines = block.split('\n')
        if (lines.every((line) => line.startsWith('- '))) {
          return (
            <ul key={index} className="list-disc space-y-1 pl-5">
              {lines.map((line, lineIndex) => <li key={lineIndex}>{emphasis(line.slice(2))}</li>)}
            </ul>
          )
        }
        return <p key={index}>{emphasis(block)}</p>
      })}
    </div>
  )
}
