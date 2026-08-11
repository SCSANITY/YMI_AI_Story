import assert from 'node:assert/strict'
import test from 'node:test'
import {
  attachmentBytesMatchContentType,
  isSafeResendAttachmentUrl,
  MAX_INBOUND_ATTACHMENT_BYTES,
  sanitizeInboundAttachmentFilename,
  validateInboundAttachmentMetadata,
} from './inbound-email-attachment-policy'

test('inbound attachment filenames cannot control storage paths or dangerous extensions', () => {
  assert.equal(
    sanitizeInboundAttachmentFilename('../../invoice.pdf.exe', 'application/pdf'),
    'invoice-pdf.pdf'
  )
  assert.equal(
    sanitizeInboundAttachmentFilename('..\\..\\report\u0000<script>.html', 'text/plain'),
    'report_script.txt'
  )
  assert.equal(sanitizeInboundAttachmentFilename('', 'application/x-msdownload', 3), 'attachment-3.bin')
})

test('inbound attachment policy limits size and declared type', () => {
  assert.equal(
    validateInboundAttachmentMetadata({
      size: MAX_INBOUND_ATTACHMENT_BYTES + 1,
      content_type: 'application/pdf',
    }),
    'file_size_limit_exceeded'
  )
  assert.equal(
    validateInboundAttachmentMetadata({ size: 10, content_type: 'text/html' }),
    'unsupported_content_type'
  )
  assert.equal(
    validateInboundAttachmentMetadata({ size: 10, content_type: 'image/png; name=x' }),
    null
  )
})

test('attachment byte signatures must match the accepted declared type', () => {
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  assert.equal(attachmentBytesMatchContentType(png, 'image/png'), true)
  assert.equal(attachmentBytesMatchContentType(Buffer.from('<html>'), 'image/png'), false)
  assert.equal(attachmentBytesMatchContentType(Buffer.from('%PDF-1.7'), 'application/pdf'), true)
  assert.equal(attachmentBytesMatchContentType(Buffer.from('hello'), 'text/plain'), true)
  assert.equal(attachmentBytesMatchContentType(Buffer.from([0, 1, 2]), 'text/plain'), false)
})

test('attachment downloads require a remote HTTPS URL without credentials', () => {
  assert.equal(isSafeResendAttachmentUrl('https://attachments.resend.com/file?token=x'), true)
  assert.equal(isSafeResendAttachmentUrl('http://attachments.resend.com/file'), false)
  assert.equal(isSafeResendAttachmentUrl('https://127.0.0.1/file'), false)
  assert.equal(isSafeResendAttachmentUrl('https://user:pass@example.com/file'), false)
})
