import {
  COOKIE_CONSENT_STORAGE_KEY,
  COOKIE_CONSENT_VERSION,
} from '@/lib/cookie-consent'

const COOKIE_CONSENT_DATA_ATTRIBUTE = 'data-ymi-cookie-consent'

const bootstrapScript = `
(function () {
  try {
    var raw = window.localStorage.getItem(${JSON.stringify(COOKIE_CONSENT_STORAGE_KEY)});
    var consent = raw ? JSON.parse(raw) : null;
    var isCurrent = Boolean(
      consent &&
      consent.necessary === true &&
      typeof consent.analytics === 'boolean' &&
      typeof consent.marketing === 'boolean' &&
      consent.version === ${JSON.stringify(COOKIE_CONSENT_VERSION)}
    );
    if (isCurrent) {
      document.documentElement.setAttribute(${JSON.stringify(COOKIE_CONSENT_DATA_ATTRIBUTE)}, 'stored');
    } else {
      document.documentElement.removeAttribute(${JSON.stringify(COOKIE_CONSENT_DATA_ATTRIBUTE)});
    }
  } catch (_) {
    document.documentElement.removeAttribute(${JSON.stringify(COOKIE_CONSENT_DATA_ATTRIBUTE)});
  }
})();`

export function CookieConsentBootstrap() {
  return <script dangerouslySetInnerHTML={{ __html: bootstrapScript }} />
}
