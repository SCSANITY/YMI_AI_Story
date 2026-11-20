// The fragment stays in the browser. Storage remains the authority for the original grant.
(() => {
  const { now, expires, origins } = document.body.dataset
  const details = new URLSearchParams(location.hash.slice(1))
  if (document.body.dataset.ready !== 'true') {
    const email = details.get('email')
    const row = document.querySelector('#email-row')
    if (!row || !email || email.length > 254 || !/^[^@\s<>]+@[^@\s<>]+\.[^@\s<>]+$/.test(email)) return
    const value = document.querySelector('#email')
    const at = email.lastIndexOf('@')
    value.append(email.slice(0, at), document.createElement('wbr'), email.slice(at))
    row.hidden = false
    document.querySelector('#google').hidden = !/@(?:gmail|googlemail)\.com$/i.test(email)
    document.querySelector('#copy').addEventListener('click', async () => {
      const feedback = document.querySelector('#feedback')
      try {
        await navigator.clipboard.writeText(email)
        feedback.textContent = 'Email copied.'
      } catch {
        const range = document.createRange()
        range.selectNodeContents(value)
        const selection = window.getSelection()
        selection.removeAllRanges()
        selection.addRange(range)
        feedback.textContent = 'Email selected. Use your device’s Copy command.'
      }
    })
    return
  }
  const download = document.querySelector('#download')
  let pdf
  try {
    pdf = new URL(details.get('pdf'))
    if (!JSON.parse(decodeURIComponent(origins)).includes(pdf.origin) ||
        pdf.protocol !== 'https:' || pdf.username || pdf.password ||
        !pdf.pathname.startsWith('/storage/v1/object/sign/raw-private/') ||
        !pdf.searchParams.get('token')) throw new Error('Invalid preview link')
  } catch {
    document.querySelector('#title').textContent = 'Preview link unavailable'
    document.querySelector('#message').textContent = 'Open your order to view your book details.'
    return
  }

  // Use the server clock and elapsed page time, including time spent on a restored tab.
  const remaining = Number(expires) * 1000 - Number(now)
  function stillValid() {
    return performance.now() < remaining
  }
  function refreshIfExpired(event) {
    if (stillValid()) return
    event?.preventDefault()
    location.reload()
  }
  if (!stillValid()) {
    location.reload()
    return
  }
  download.href = pdf.href
  download.hidden = false
  download.addEventListener('click', refreshIfExpired)
  window.addEventListener('pageshow', event => { if (event.persisted) location.reload() })
  window.addEventListener('load', () => {
    if (stillValid()) location.replace(pdf.href)
    else location.reload()
  }, { once: true })
})()
