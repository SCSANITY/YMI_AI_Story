export type LegalTextItem = {
  label?: string
  text: string
  href?: string
}

export type LegalSection = {
  title?: string
  paragraphs?: LegalTextItem[]
  bullets?: LegalTextItem[]
}

export type FooterLegalContent = {
  privacy: LegalSection[]
  terms: LegalSection[]
  ourStory: LegalSection[]
  shipping: LegalSection[]
  refund: LegalSection[]
  safety: LegalSection[]
  impact: LegalSection[]
}


const privacyEn: LegalSection[] = [
  {
    paragraphs: [
      {
        text: 'At YMI, we treat your family data, uploaded media, and generated content with care. This policy explains how we collect, use, store, and protect the information required to personalize and deliver your books.',
      },
    ],
  },
  {
    title: '1. Data We Collect',
    paragraphs: [
      {
        text: 'To create and deliver personalized books, we may collect the following categories of information:',
      },
    ],
    bullets: [
      { label: 'Voice Data:', text: 'Short child or adult audio samples provided for Signature Voice, the synthetic voice representations created from them, and the generated narration used in the personalized physical book.' },
      { label: 'Visual Data:', text: 'Uploaded child photos and profile images used for personalization and account display.' },
      { label: 'Account Information:', text: 'Name, email address, shipping details, and profile settings.' },
      {
        label: 'Technical and Usage Data:',
        text: 'Basic device, browser, approximate location derived from IP address, referral or campaign information, consent choices, and coarse interactions with YMI Story that are needed to operate, secure, measure, and improve the service. We do not send uploaded child photos or audio, personalized book titles, customer contact details, order identifiers, or session tokens to analytics or advertising providers.',
      },
    ],
  },
  {
    title: '2. AI, Biometric Data, and Use Restrictions',
    paragraphs: [
      {
        text: 'YMI uses AI workflows to personalize images, preview pages, and voice-related assets. Where applicable, uploaded photos and audio may be processed as sensitive or biometric-like information under local law.',
      },
      {
        label: 'Strict Purpose Limitation:',
        text: 'We only process uploaded photos and audio to create, fulfil, support, replace, or re-fulfil the specific personalized product you request. Signature Voice processing may create a synthetic version of the authorized child or adult voice for that book\'s narration.',
      },
      {
        label: 'No Model Training:',
        text: 'We do not use your or your child\'s uploaded materials to train AI models or to create products for other users.',
      },
    ],
  },
  {
    title: '3. Storage and Security',
    paragraphs: [
      {
        text: 'We apply reasonable technical and organizational safeguards to protect customer data and uploaded assets.',
      },
    ],
    bullets: [
      { label: 'Encryption:', text: 'Uploads are protected during transfer, and stored assets are kept in secured infrastructure.' },
      { label: 'Retention:', text: 'We keep uploaded assets and generated content only as long as needed for personalization, fulfillment, support, and reasonable operational needs.' },
      { label: 'Access Control:', text: 'Access is restricted to authorized staff, systems, and service providers that require the data to produce, fulfil, support, replace, or re-fulfil the requested product.' },
    ],
  },
  {
    title: '4. Children\'s Data',
    paragraphs: [
      {
        text: 'YMI products are intended to be ordered and managed by parents or guardians. By uploading a child\'s image or related materials, you confirm that you are authorized to provide that data for personalization and fulfillment.',
      },
      {
        label: 'Child Voice Authorization:',
        text: 'A child\'s voice may be used for a Signature Voice recording only when the person submitting it confirms that they hold all necessary rights and authorization for that use, including any parental or guardian permission required. No recording is uploaded until that confirmation is given, and it authorizes creation of the synthetic narration for that book only.',
      },
      {
        label: 'No Child Marketing:',
        text: 'We do not use children\'s uploaded materials for profiling, advertising, or unrelated marketing purposes.',
      },
      {
        label: 'Analytics and Advertising Exclusion:',
        text: 'We do not intentionally send a child\'s name, age, uploaded photo or audio, generated likeness, personalized book title, or other child profile information to Google Analytics, Google Ads, Meta Pixel, or another advertising provider.',
      },
    ],
  },
  {
    title: '5. Cookies, Analytics, and Advertising Technologies',
    paragraphs: [
      {
        text: 'YMI Story uses cookies and similar browser technologies for different purposes. Necessary storage supports functions such as authentication, cart, checkout, security, regional preferences, and remembering your privacy choices. Necessary storage cannot be disabled through Cookie Settings because the service may not function correctly without it.',
      },
      {
        text: 'Optional technologies are disabled unless and until you grant the matching choice in Cookie Settings.',
      },
    ],
    bullets: [
      {
        label: 'Analytics:',
        text: 'With Analytics consent, YMI Story may use Google Analytics to understand coarse website usage, page performance, and shopping-flow completion. Google Analytics may process browser and device information, approximate location, referral or campaign information, consented first-party identifiers, and redacted page categories. YMI Story does not send raw personalized routes, query strings, child information, uploaded media, customer contact details, or internal order and creation identifiers.',
      },
      {
        label: 'Marketing:',
        text: 'With Marketing consent, YMI Story may use Google Ads measurement and Meta Pixel to understand whether an advertisement led to a permitted website action and, where YMI separately enables it, to support advertising audiences or remarketing. These providers may use cookies, pixels, web beacons, and similar technologies for measurement and advertising services. YMI Story limits these events to approved coarse funnel facts and does not use children\'s uploaded materials for advertising profiles.',
      },
    ],
  },
  {
    paragraphs: [
      {
        text: 'Google Analytics may set first-party cookies such as _ga and property-specific _ga cookies to distinguish consented users and sessions. Google documents a default cookie duration of up to two years, subject to browser limits and YMI\'s configuration. YMI will configure user-level and event-level Google Analytics retention to two months. Google and Meta may retain data under their own terms, settings, and legal obligations. YMI periodically reviews its configuration and keeps provider access only while it is needed for the purposes described above.',
      },
      {
        text: 'You can accept, reject, or change optional choices at any time through Cookie Settings in the website footer. Withdrawing consent stops future optional collection from YMI Story after the updated choice takes effect and removes reachable YMI-domain analytics or advertising cookies where technically possible. It cannot recall information already sent to a provider. You can also clear cookies through your browser and use the privacy and advertising controls offered by Google and Meta.',
      },
      {
        text: 'You can review provider privacy information at the following official pages:',
      },
    ],
    bullets: [
      {
        label: 'Google:',
        text: 'Google Privacy Policy',
        href: 'https://policies.google.com/privacy',
      },
      {
        label: 'Meta:',
        text: 'Meta Privacy Policy',
        href: 'https://www.facebook.com/privacy/policy/',
      },
    ],
  },
  {
    title: '6. Third-Party Processors',
    paragraphs: [
      {
        text: 'We may share limited data with trusted service providers only when necessary to operate the service, such as hosting, payments, production, shipping, and technical infrastructure.',
      },
    ],
    bullets: [
      { label: 'Cloud Infrastructure:', text: 'Secure hosting and storage providers used to operate uploads, generated assets, and application services.' },
      { label: 'Payment Processors:', text: 'Providers such as Stripe or PayPal used to securely process payments.' },
      { label: 'Production and Logistics:', text: 'Manufacturing and shipping partners involved in producing and delivering your physical order.' },
      {
        label: 'Analytics and Advertising Providers:',
        text: 'With the relevant optional consent, providers such as Google and Meta may process limited technical and coarse event data for analytics, campaign measurement, and any separately enabled advertising features described in this policy.',
      },
    ],
  },
  {
    title: '7. Voice Data Retention',
    paragraphs: [
      {
        text: 'Signature Voice uses a short authorized child or adult voice sample to create a synthetic voice and generated narration only for the personalized physical book covered by your consent. The same retention schedule applies whether the narrator is the child in the book or an adult. Processing may be performed manually and with authorized service providers, with access limited to authorized personnel. The following operational retention periods apply unless a legal hold, active dispute, fraud review, or other binding obligation requires a limited extension.',
      },
      {
        text: 'Eligible deletion requests remove platform copies when legal and operational holds no longer apply. Deleting YMI Story\'s platform copies cannot remotely erase narration already loaded onto and delivered inside a physical book.',
      },
    ],
    bullets: [
      { label: 'Uploaded but unbound source sample:', text: 'Deleted after 30 days without a Creation binding.' },
      { label: 'Bound source while an order is open:', text: 'Retained until the Order is delivered, cancelled or refunded and closed, or the related dispute is resolved. We do not expire an unfulfilled paid Order\'s only source sample.' },
      { label: 'Bound source after delivery:', text: 'Deleted at the later of 180 days after delivery or 30 days after the last related support or dispute case closes.' },
      { label: 'Replaced source sample:', text: 'Removed from production immediately, retained for 30 days as rollback evidence, then deleted through the durable cleanup process.' },
      { label: 'Generated narration tracks:', text: 'Retained for 24 months after delivery for support and re-fulfilment, then deleted unless an active support or replacement case requires a bounded extension.' },
      { label: 'Cancelled or refunded after production but never delivered:', text: 'Generated tracks are deleted at the later of 30 days after cancellation or refund closure or 30 days after the last related dispute or support case closes.' },
      { label: 'Temporary operator workstation files:', text: 'Deleted within 7 days after the platform archive is verified, and immediately where practical.' },
      { label: 'Audit metadata:', text: 'Non-audio actor, timestamp, reason, consent version, hash, and lifecycle records follow the ordinary Order and audit retention policy.' },
    ],
  },
  {
    title: '8. Your Rights',
    paragraphs: [
      { text: 'Depending on your jurisdiction, you may have the right to access, correct, or request deletion of your personal data.' },
    ],
    bullets: [
      { label: 'Access:', text: 'You may ask what account or order data we hold about you.' },
      { label: 'Correction:', text: 'You may request updates to inaccurate profile or order information.' },
      { label: 'Erasure:', text: 'You may request deletion of eligible account data, subject to legal, operational, and fulfillment requirements.' },
      {
        label: 'Withdraw Optional Consent:',
        text: 'You may change Analytics and Marketing choices at any time through Cookie Settings. Withdrawal applies to future collection after the updated choice takes effect and does not make earlier lawful processing reversible.',
      },
    ],
  },
  {
    title: '9. International Transfers',
    paragraphs: [
      {
        text: 'Because YMI operates online and serves multiple regions, your data may be processed in jurisdictions outside your place of residence. We use reasonable safeguards for such transfers.',
      },
      {
        text: 'Where you consent to optional analytics or advertising, Google or Meta may process limited technical and event data in countries outside your place of residence. Their processing is also governed by their privacy terms and applicable transfer safeguards.',
      },
    ],
  },
  {
    title: '10. Policy Updates',
    paragraphs: [
      {
        text: 'We may revise this Privacy Policy from time to time. Material updates will be reflected on this page and may also be communicated through the site or your registered email address.',
      },
    ],
  },
  {
    title: '11. Contact',
    paragraphs: [
      {
        text: 'If you have privacy-related questions or requests, please contact us at admin@ymistory.com.',
      },
      {
        text: 'Address: Room 1604, Nathan Center, 580 Nathan Road, Mongkok',
      },
    ],
  },
]

const termsEn: LegalSection[] = [
  {
    paragraphs: [
      {
        text: 'Welcome to YMI. By placing an order, uploading materials, or using our personalization tools, you confirm that you have read and accepted these Terms and Conditions.',
      },
    ],
  },
  {
    title: '1. Service Nature',
    paragraphs: [
      {
        label: '1.1 Customized Product:',
        text: 'YMI provides personalized print, audio, and preview services that are made specifically for each order.',
      },
      {
        label: '1.2 Final Sale Principle:',
        text: 'Because products are customized, changes, cancellations, and refunds are generally unavailable once an order enters production unless a verified defect exists.',
      },
    ],
  },
  {
    title: '2. User Materials and Rights',
    paragraphs: [
      {
        label: '2.1 Authorization:',
        text: 'You confirm that you have the right to upload all submitted photos, audio, and related materials.',
      },
      {
        label: '2.2 Responsibility:',
        text: 'If uploaded materials infringe third-party rights, you remain responsible for resulting claims, losses, and costs.',
      },
      {
        label: '2.3 Limited License:',
        text: 'You grant YMI a limited license to process submitted materials only for personalization, production, and support for your order.',
      },
      {
        label: '2.4 Voice and Biometric Processing:',
        text: 'Where applicable, uploaded voice or facial materials may be processed as part of AI personalization for your order only, and not for unrelated commercial use.',
      },
    ],
  },
  {
    title: '3. Content Safety',
    paragraphs: [
      {
        label: '3.1 Prohibited Content:',
        text: 'You may not upload unlawful, abusive, hateful, explicit, infringing, or privacy-violating content.',
      },
      {
        label: '3.2 Service Refusal:',
        text: 'YMI may reject, suspend, or terminate service for uploads or conduct that violate safety or legal requirements.',
      },
    ],
  },
  {
    title: '4. AI and Quality Limits',
    paragraphs: [
      {
        label: '4.1 Voice and Image Variance:',
        text: 'AI-generated results may differ slightly from the original person, tone, or likeness and are not guaranteed to be exact replicas.',
      },
      {
        label: '4.2 Source Material Quality:',
        text: 'Poor photo quality, background noise, or incomplete inputs can reduce the quality of the final result. This is not automatically treated as a product defect.',
      },
      {
        label: '4.3 Model Evolution:',
        text: 'Results may vary across production runs as AI tools and workflows evolve over time.',
      },
    ],
  },
  {
    title: '5. Payment and Fraud',
    paragraphs: [
      {
        label: '5.1 Payment Gateways:',
        text: 'Payments must be completed through approved payment processors used by the site.',
      },
      {
        label: '5.2 Fraud and Chargebacks:',
        text: 'YMI may suspend production, shipping, or account access in cases of suspected fraud, malicious disputes, or unauthorized transactions.',
      },
    ],
  },
  {
    title: '6. Shipping and Risk',
    paragraphs: [
      {
        label: '6.1 Delivery Risk:',
        text: 'Risk of loss may transfer when the order is handed to the shipping carrier, subject to applicable law.',
      },
      {
        label: '6.2 Shipping Damage:',
        text: 'If a parcel arrives damaged, please notify the carrier promptly and contact YMI with supporting photos and order details.',
      },
      {
        label: '6.3 Address Accuracy:',
        text: 'Customers are responsible for losses or added costs caused by incorrect shipping details.',
      },
      {
        label: '6.4 Force Majeure:',
        text: 'YMI is not responsible for delays caused by customs, strikes, disasters, epidemics, or other events beyond reasonable control.',
      },
    ],
  },
  {
    title: '7. Duties and Taxes',
    paragraphs: [
      {
        label: '7.1 Import Charges:',
        text: 'Product prices and shipping fees do not automatically include VAT, customs duties, or destination-country import charges.',
      },
      {
        label: '7.2 Customer Responsibility:',
        text: 'The recipient is responsible for any taxes, duties, or customs fees required by the destination country.',
      },
    ],
  },
  {
    title: '8. Warranty and Acceptance',
    paragraphs: [
      {
        label: '8.1 Covered Issues:',
        text: 'Warranty-style support is limited to major print defects, functional faults, or verified shipping damage.',
      },
      {
        label: '8.2 Review Window:',
        text: 'Please report defects promptly after delivery so we can review the issue and determine the next step.',
      },
      {
        label: '8.3 Exclusions:',
        text: 'Coverage does not include accidental damage, misuse, unauthorized disassembly, or subjective dissatisfaction with AI art style.',
      },
    ],
  },
  {
    title: '9. Permitted Use',
    paragraphs: [
      {
        label: '9.1 Personal Use:',
        text: 'YMI products and generated audio are intended for personal, non-commercial use unless otherwise agreed in writing.',
      },
      {
        label: '9.2 Commercial Restriction:',
        text: 'You may not resell or commercially exploit YMI-generated assets without explicit permission.',
      },
    ],
  },
  {
    title: '10. Liability',
    paragraphs: [
      {
        label: '10.1 Maximum Liability:',
        text: 'To the extent allowed by law, YMI\'s aggregate liability for a specific order will generally not exceed the amount paid for that order, except where liability cannot legally be excluded.',
      },
      {
        label: '10.2 Indirect Losses:',
        text: 'YMI is not responsible for indirect, incidental, or consequential losses except where required by applicable law.',
      },
    ],
  },
  {
    title: '11. Data and Device Security',
    paragraphs: [
      {
        label: '11.1 Offline Components:',
        text: 'Where products use offline storage or embedded electronics, YMI is not responsible for leaks caused by loss, theft, or misuse of the physical product.',
      },
    ],
  },
  {
    title: '12. Governing Law and Disputes',
    paragraphs: [
      {
        label: '12.1 Governing Law:',
        text: 'These Terms are governed by the law of the jurisdiction in which the company is registered, unless mandatory local law requires otherwise.',
      },
      {
        label: '12.2 Dispute Resolution:',
        text: 'Disputes that cannot be resolved by discussion may be submitted to the appropriate courts or forums of the company\'s registered location, subject to applicable law.',
      },
    ],
  },
  {
    title: '13. Technology Protection',
    paragraphs: [
      {
        label: '13.1 No Reverse Engineering:',
        text: 'Users may not reverse engineer, decompile, or disassemble YMI hardware, firmware, or proprietary service logic except where such restrictions are prohibited by law.',
      },
    ],
  },
  {
    title: '14. Product Safety',
    paragraphs: [
      {
        label: '14.1 Safe Handling:',
        text: 'Keep electronic components away from fire, liquid, and extreme temperatures, and follow any included safety guidance.',
      },
      {
        label: '14.2 Supervision:',
        text: 'Young children should use electronic components only with appropriate adult supervision.',
      },
    ],
  },
  {
    title: '15. Data Retention Limits',
    paragraphs: [
      {
        label: '15.1 No Long-Term Backup Guarantee:',
        text: 'YMI does not guarantee indefinite retention or recovery of raw uploaded materials after reasonable operational retention periods have ended.',
      },
    ],
  },
  {
    title: '16. Compliance',
    paragraphs: [
      {
        label: '16.1 Local Compliance:',
        text: 'Customers are responsible for ensuring that imports, batteries, audio products, and related content are permitted in their jurisdiction.',
      },
      {
        label: '16.2 Export and Resale:',
        text: 'Any resale, re-export, or cross-border transfer remains the user\'s responsibility where local restrictions apply.',
      },
    ],
  },
  {
    title: '17. Miscellaneous',
    paragraphs: [
      {
        label: '17.1 Severability:',
        text: 'If any part of these Terms is found unenforceable, the remaining provisions remain in effect.',
      },
      {
        label: '17.2 Updates:',
        text: 'YMI may update these Terms from time to time. Continued use of the service after updates means you accept the revised terms.',
      },
    ],
  },
]

const shippingPolicyEn: LegalSection[] = [
  {
    paragraphs: [
      { text: 'We ship worldwide.' },
      {
        text: 'Because each YMI story book is personalized, your order goes through a careful creation process before shipping.',
      },
    ],
  },
  {
    title: 'Processing Time (Production)',
    paragraphs: [
      {
        text: 'Orders are typically processed within 5-10 business days. This includes creating your personalized story, illustrations, and production.',
      },
    ],
  },
  {
    title: 'Shipping Time (After Dispatch)',
    paragraphs: [{ text: 'Estimated delivery times after shipment:' }],
    bullets: [
      { text: 'Hong Kong / Mainland China: 3-5 business days' },
      { text: 'USA / Canada: 5-10 business days' },
      { text: 'Australia / Singapore: 4-8 business days' },
      { text: 'Europe: 5-12 business days' },
      { text: 'Other Asian countries: 5-12 business days' },
    ],
  },
  {
    title: 'Total Delivery Time',
    paragraphs: [
      { text: 'Total delivery time = Processing time + Shipping time.' },
      {
        text: 'Please note that all delivery times are estimates and may vary depending on your location, customs clearance, and local courier services.',
      },
    ],
  },
  {
    title: 'Shipping & Tracking',
    paragraphs: [
      {
        text: 'Once your order is shipped, you will receive a confirmation email with tracking information.',
      },
    ],
  },
  {
    title: 'Delays',
    paragraphs: [
      {
        text: 'Delays may occur due to customs clearance, carrier issues, weather conditions, or other factors beyond our control. These delays are not eligible for refunds.',
      },
    ],
  },
  {
    title: 'Duties & Taxes',
    paragraphs: [
      {
        text: 'Import duties, taxes, and customs fees may apply depending on your country. These charges are the responsibility of the recipient.',
      },
    ],
  },
  {
    title: 'Address Accuracy',
    paragraphs: [
      {
        text: 'Please ensure your shipping details are correct at checkout. We are not responsible for delays or losses caused by incorrect or incomplete addresses.',
      },
      {
        text: 'If you have any questions about your order, please contact us at admin@ymistory.com.',
      },
    ],
  },
]

const refundPolicyEn: LegalSection[] = [
  {
    paragraphs: [
      {
        text: 'Due to the personalized nature of our products, all orders are considered final once they have entered production. Production typically begins shortly after order confirmation.',
      },
      {
        text: 'We offer a 30-day replacement guarantee under the following conditions:',
      },
    ],
    bullets: [
      { text: 'Defective product' },
      { text: 'Incorrect personalization caused by our error' },
      { text: 'Damage during shipping' },
    ],
  },
  {
    title: 'Please note',
    bullets: [
      {
        text: 'We are not responsible for errors resulting from incorrect or low-quality materials provided by the customer.',
      },
      {
        text: 'Variations in AI-generated content, including likeness, tone, or artistic interpretation, are not considered defects.',
      },
      {
        text: 'Delays caused by shipping carriers or customs are not eligible for refunds.',
      },
    ],
  },
  {
    title: 'Claims',
    paragraphs: [
      {
        text: 'Claims must be submitted within 7 days of delivery and include supporting evidence, such as photos of the issue.',
      },
      {
        text: 'Where applicable, we will first offer a replacement. Refunds may be issued at our discretion if a replacement is not feasible.',
      },
      {
        text: 'For assistance, please contact us at admin@ymistory.com.',
      },
    ],
  },
]

const safetyNoticeEn: LegalSection[] = [
  {
    title: 'Safety Notice',
    bullets: [
      { text: 'This product is designed for children aged 3 and above.' },
      { text: 'Adult supervision is recommended during use.' },
      { text: 'Do not expose to water or fire.' },
      { text: 'Use only the provided charging method.' },
    ],
  },
]

const impactProgramEn: LegalSection[] = [
  {
    title: 'Our Children\'s Impact Program',
    paragraphs: [
      { text: 'Every Story Can Carry Love Further' },
      {
        text: 'At YMI Story, every book is created with love — and we believe that love should extend beyond our own homes.',
      },
      {
        text: 'That is why we dedicate 1% of revenue from every book to support initiatives that help children grow through care, education, emotional wellbeing, and meaningful opportunities.',
      },
      {
        text: 'As a brand rooted in storytelling, inner growth, and childhood development, we hope each story can become part of something greater: a wider cycle of kindness, connection, and support for children who need it most.',
      },
    ],
  },
  {
    title: 'How The Program Works',
    paragraphs: [
      {
        text: 'For every paid YMI Story book order, we set aside 1% of the book revenue toward child-focused charitable initiatives.',
      },
      { text: 'Over time, these contributions may support programs related to:' },
    ],
    bullets: [
      { text: 'Education and learning opportunities' },
      { text: 'Emotional wellbeing and child development' },
      { text: 'Family and community support' },
      { text: 'Access to care and meaningful resources for children' },
    ],
  },
  {
    paragraphs: [
      {
        text: 'As our community grows, we also hope to share more updates about the organisations, projects, and impact this program supports.',
      },
    ],
  },
  {
    title: 'Our Principle',
    paragraphs: [
      {
        text: 'This giving commitment is built into every YMI Story creation and does not change the price of your book.',
      },
      {
        text: 'It is simply part of who we are — a small way for every story to become part of something larger than itself.',
      },
      { text: 'Because we believe every child deserves to feel heard, valued, and loved.' },
      { text: 'And when love is heard, growth begins.' },
    ],
  },
]

const ourStoryEn: LegalSection[] = [
  {
    title: 'YMI Story',
    paragraphs: [
      { text: 'Where Love Is Heard, Growth Begins' },
      {
        text: "As children grow, they quietly begin asking one of life's most important questions:",
      },
      { text: '"Why am I?"' },
      {
        text: 'At YMI Story, this question became the inspiration behind our name — and the heart of everything we create.',
      },
    ],
  },
  {
    paragraphs: [
      { text: 'We believe stories can shape a child far beyond imagination alone.' },
      {
        text: 'They can nurture truth, beauty, and inner growth — helping children grow with kindness, confidence, wonder, and a strong sense of self.',
      },
    ],
  },
  {
    title: 'What We Create',
    paragraphs: [
      {
        text: 'In a world filled with screens and fast-moving digital experiences, we wanted to create something more personal and lasting.',
      },
      { text: 'Not just another online audio story.' },
      {
        text: "But a physical storybook children can hold close, revisit, and grow up with — paired with the warmth of a loved one's voice.",
      },
      { text: 'Because some memories deserve to be felt, not simply played.' },
    ],
  },
  {
    paragraphs: [
      {
        text: 'Every YMI Story is designed to preserve connection, comfort, and meaningful moments through storytelling that feels timeless and deeply personal.',
      },
    ],
    bullets: [
      { text: 'A bedtime voice.' },
      { text: 'A familiar story.' },
      { text: 'A reminder that says: "You are loved. You are heard. You matter."' },
    ],
  },
  {
    paragraphs: [
      {
        text: 'And perhaps, through stories, children will slowly begin to discover the answer to that quiet question within themselves…',
      },
    ],
  },
]

export function getFooterLegalContent(): FooterLegalContent {
  return {
    privacy: privacyEn,
    terms: termsEn,
    ourStory: ourStoryEn,
    shipping: shippingPolicyEn,
    refund: refundPolicyEn,
    safety: safetyNoticeEn,
    impact: impactProgramEn,
  }
}
