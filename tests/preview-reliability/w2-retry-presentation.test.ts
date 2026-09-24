import assert from 'node:assert/strict'
import test from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { PreviewGeneratingCover } from '@/components/personalize/PreviewGeneratingCover'
import { PreviewIntroHeader } from '@/components/personalize/PreviewIntroHeader'

const headerProps = {
  title: 'Preview for David',
  subtitle: 'Turn the pages to review the story.',
  statusMessage: 'Your cover is saved. Retry the remaining pages without starting a new book.',
  statusActionLabel: 'Retry remaining pages',
  statusActionPendingLabel: 'Retrying remaining pages...',
  statusActionPending: false,
  onStatusAction: () => {},
  changePhotoLabel: 'Change Photo',
  busyLabel: 'Preparing new photo...',
  showChangePhoto: false,
  changePhotoDisabled: false,
  changePhotoBusy: false,
  changePhotoError: null,
  capacityWaiting: false,
  capacityTitle: 'Your place is saved',
  capacityBody: 'Please wait.',
  onPhotoUpload: () => {},
}

test('partial-cover Retry is a keyboard button beside a polite status, not inside the live text', () => {
  const html = renderToStaticMarkup(createElement(PreviewIntroHeader, headerProps))

  assert.match(html, /data-preview-partial-failure="true"/)
  assert.match(html, /<p role="status" aria-live="polite">/)
  assert.match(html, /<button type="button"/)
  assert.match(html, /min-h-11/)
  assert.match(html, /Retry remaining pages/)
  assert.ok(html.indexOf('</p>') < html.indexOf('<button'))
})

test('pending Retry disables double activation and announces in-progress copy', () => {
  const header = renderToStaticMarkup(createElement(PreviewIntroHeader, {
    ...headerProps,
    statusActionPending: true,
  }))
  const cover = renderToStaticMarkup(createElement(PreviewGeneratingCover, {
    startedAt: null,
    title: 'Creating your cover',
    body: 'Your cover will appear when ready.',
    estimateLabel: 'Estimated time remaining',
    stillWorking: 'Still creating',
    capacityWaiting: false,
    capacityTitle: 'Your place is saved',
    capacityBody: 'Please wait.',
    error: 'This Preview could not finish.',
    actionLabel: 'Retry remaining pages',
    actionPendingLabel: 'Retrying remaining pages...',
    actionPending: true,
    onReturnToDetails: () => {},
  }))

  for (const html of [header, cover]) {
    assert.match(html, /disabled=""/)
    assert.match(html, /aria-busy="true"/)
    assert.match(html, /Retrying remaining pages\.\.\./)
  }
})
