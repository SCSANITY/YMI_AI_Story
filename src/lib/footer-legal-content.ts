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
      { text: "YMI (“YMI”, “we”, “us”, or “our”) respects your privacy and is committed to handling personal information responsibly." },
      { text: "This Privacy Policy explains what information we collect, how we use it, how we protect it, and the choices available to you when you use our website and personalised products." },
      { text: "YMI is operated by a company incorporated in Hong Kong. Depending on the services used to provide your order, certain information may be stored or processed in Singapore and other countries where YMI or our service providers operate." },
    ],
  },
  {
    title: "1. Information We Collect",
    paragraphs: [
      { text: "Depending on how you use YMI, we may collect the following information:" },
    ],
  },
  {
    title: "Information You Provide",
    bullets: [
      { text: "Your name and contact details" },
      { text: "Billing and shipping information" },
      { text: "Child's name, age, and other personalisation details" },
      { text: "Photos or other images you upload" },
      { text: "Voice recordings for Voice Edition products" },
      { text: "Personal messages, blessings, or other content you choose to include in your book" },
      { text: "Information you provide when contacting customer support" },
    ],
  },
  {
    title: "Information Collected Automatically",
    paragraphs: [
      { text: "When you use our website, we may automatically collect limited technical and usage information, such as your IP address, browser type, device information, pages visited, interactions with our website, and information collected through cookies or similar technologies." },
    ],
  },
  {
    title: "2. How We Use Your Information",
    paragraphs: [
      { text: "We use personal information only for purposes reasonably necessary to operate YMI and provide the products and services you request." },
      { text: "This may include:" },
    ],
    bullets: [
      { text: "Creating and personalising your book" },
      { text: "Generating and displaying personalised previews" },
      { text: "Creating personalised illustrations and visual content" },
      { text: "Creating personalised voice narration for Voice Edition products" },
      { text: "Processing orders, payments, shipping, and delivery" },
      { text: "Providing customer support and responding to enquiries" },
      { text: "Maintaining, improving, and securing our website and services" },
      { text: "Preventing fraud, misuse, or unauthorised activity" },
      { text: "Complying with applicable legal obligations" },
      { text: "Protecting our rights, property, services, and users" },
    ],
  },
  {
    paragraphs: [
      { text: "Depending on where you live and the circumstances, we may process your information because it is necessary to provide the product or service you request, to comply with legal obligations, to protect our legitimate business interests, or where you have given us permission to do so." },
      { text: "We do not sell your child's photos or voice recordings for advertising purposes, and we do not use them to create behavioural advertising profiles." },
    ],
  },
  {
    title: "3. Photos, Voice & Personalised Content",
    paragraphs: [
      { text: "Photos, voice recordings, names, messages, and other content you provide may be used to create the personalised product you request." },
      { text: "For example:" },
    ],
    bullets: [
      { text: "Photos may be processed to create personalised illustrations and previews." },
      { text: "Voice recordings may be processed to create personalised narration for Voice Edition products." },
      { text: "Names, ages, and other personalisation details may be used to generate the content of your book." },
      { text: "Personal messages may be included on personalised pages of your book." },
    ],
  },
  {
    paragraphs: [
      { text: "We use this content only as reasonably necessary to create, fulfil, support, update, replace, or re-fulfil the personalised product or service you request." },
      { text: "We do not use children's photos or voice recordings for facial recognition, voice identification, behavioural advertising, or unrelated profiling." },
    ],
  },
  {
    title: "4. Personalisation Technology",
    paragraphs: [
      { text: "YMI uses modern personalisation technology, including artificial intelligence and other automated tools, to help bring your personalised book to life." },
      { text: "These technologies may be used to personalise images, create illustrations and previews, and produce personalised voice narration for Voice Edition products." },
      { text: "We use these technologies only as part of the production and delivery of the personalised product you request." },
      { text: "Your photos, voice recordings, and other personalised materials are not used by YMI to create products for other customers or for unrelated purposes." },
      { text: "We work with selected technology providers to perform certain processing functions on our behalf. These providers receive only the information reasonably necessary for the relevant service and are expected to maintain appropriate privacy and security protections." },
    ],
  },
  {
    title: "5. How We Protect Your Personalised Content",
    paragraphs: [
      { text: "We treat uploaded photos, voice recordings, and personalised book materials as private customer content." },
      { text: "We do not use your personalised materials to build advertising profiles or to create personalised products for unrelated customers." },
      { text: "Access to personalised content is limited to YMI personnel and service providers who reasonably need access to perform authorised business functions." },
      { text: "If you provide a photo, voice recording, message, or other content relating to another person, you should have the permission or authority required by applicable law to provide and use that content for the requested product." },
    ],
  },
  {
    title: "6. Children's Information",
    paragraphs: [
      { text: "YMI creates personalised products that may feature children." },
      { text: "Information about a child may be provided by a person using our service to create or purchase a product. We do not encourage children to provide personal information for advertising, profiling, or unrelated purposes." },
      { text: "Where applicable law requires parental or guardian consent for the collection, use, or disclosure of a child's personal information, YMI will take appropriate steps to comply with those requirements." },
      { text: "We do not use children's photos, recordings, or personalised information for behavioural advertising or unrelated profiling." },
      { text: "If you believe that a child has provided personal information to YMI in circumstances where this was not authorised or where applicable consent was required, please contact us so that we can review the situation and take appropriate action." },
    ],
  },
  {
    title: "7. Service Providers",
    paragraphs: [
      { text: "We may use selected third-party service providers to help us operate YMI and provide the products and services you request." },
      { text: "These providers may support functions such as:" },
    ],
    bullets: [
      { text: "Image and visual content processing" },
      { text: "Voice generation and audio processing" },
      { text: "Website hosting and data storage" },
      { text: "Payment processing" },
      { text: "Order fulfilment and delivery" },
      { text: "Customer support" },
      { text: "Security and fraud prevention" },
      { text: "Website analytics and technical services" },
    ],
  },
  {
    paragraphs: [
      { text: "We provide service providers with only the information reasonably necessary for their services and require appropriate privacy and security protections through our agreements or other applicable arrangements." },
      { text: "Some service providers may process information in accordance with their own legal, technical, and operational requirements, including applicable retention periods. YMI does not control the independent internal retention practices of third-party providers." },
    ],
  },
  {
    title: "8. International Data Processing",
    paragraphs: [
      { text: "YMI is operated by a Hong Kong-based company." },
      { text: "To provide our products and services, personal information may be stored, accessed, or processed in Singapore and other countries where YMI or our service providers operate." },
      { text: "Privacy and data protection laws may differ between countries. Where required by applicable law, we take appropriate steps to protect personal information when it is transferred internationally." },
    ],
  },
  {
    title: '9. How Long We Keep Information',
    paragraphs: [
      {
        text: 'We retain personal information only for as long as reasonably necessary for the purposes described in this Privacy Policy.',
      },
      {
        text: 'We keep uploaded assets and generated content only as long as needed for personalization, fulfillment, support, and reasonable operational needs.',
      },
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
    title: "10. Data Security",
    paragraphs: [
      { text: "We use reasonable technical, organisational, and administrative measures designed to protect personal information against unauthorised access, loss, misuse, alteration, or disclosure." },
      { text: "Access to personal information is limited to people and service providers who reasonably need it for authorised purposes." },
      { text: "However, no method of transmission or storage over the internet can be guaranteed to be completely secure. While we take reasonable precautions, we cannot guarantee absolute security." },
    ],
  },
  {
    title: "11. Cookies, Analytics & Marketing",
    paragraphs: [
      { text: "We use cookies and similar technologies to help operate, understand, and improve our website and marketing." },
      { text: "These technologies may be provided by YMI or selected third-party service providers and may include analytics and advertising tools such as Google Analytics and Meta Pixel." },
      { text: "They may collect information such as:" },
    ],
    bullets: [
      { text: "Browser and device information" },
      { text: "IP address or similar technical information" },
      { text: "Pages viewed and interactions with our website" },
      { text: "Referral or campaign information" },
      { text: "Purchase or conversion events" },
      { text: "Cookie or advertising identifiers, where permitted" },
    ],
  },
  {
    paragraphs: [
      { text: "We may use this information to:" },
    ],
    bullets: [
      { text: "Understand how visitors use our website" },
      { text: "Improve website performance and user experience" },
      { text: "Measure the effectiveness of our advertising" },
      { text: "Understand which marketing campaigns bring visitors to YMI" },
      { text: "Build or measure advertising audiences and remarketing campaigns, where permitted by applicable law" },
    ],
  },
  {
    paragraphs: [
      { text: "We do not use your child's uploaded photos, voice recordings, or personalised book content for behavioural advertising or unrelated advertising profiles." },
      { text: "Where applicable law requires consent before analytics or advertising cookies are placed or accessed, we will provide an appropriate consent mechanism and respect your choices." },
      { text: "You may be able to manage or withdraw certain cookie and advertising preferences through our cookie settings, your browser settings, or the relevant advertising platform's privacy controls." },
    ],
  },
  {
    title: "12. Your Privacy Rights",
    paragraphs: [
      { text: "Depending on where you live and subject to applicable law, you may have rights to:" },
    ],
    bullets: [
      { text: "Request access to personal information we hold about you" },
      { text: "Request correction of inaccurate information" },
      { text: "Request deletion of personal information" },
      { text: "Request restriction of certain processing" },
      { text: "Object to certain uses of your information" },
      { text: "Request a copy of certain information in a portable format" },
      { text: "Withdraw consent where processing is based on consent" },
      { text: "Ask questions about how your information is handled" },
    ],
  },
  {
    paragraphs: [
      { text: "We may need to verify your identity before completing certain requests in order to protect your information from unauthorised access." },
      { text: "Some information may need to be retained where required or permitted by law." },
    ],
  },
  {
    title: "13. Changes to This Privacy Policy",
    paragraphs: [
      { text: "We may update this Privacy Policy from time to time to reflect changes to our services, technology, legal requirements, or privacy practices." },
      { text: "When we make material changes, we will take reasonable steps to notify users where required by applicable law." },
    ],
  },
  {
    title: "14. Contact Us",
    paragraphs: [
      { text: "If you have questions about this Privacy Policy, our privacy practices, or would like to exercise a privacy right, please contact us:" },
      { text: "YMI" },
      { text: "Legal Company Name: Talent Connect" },
      { text: "Business Address: Room 1604, Nathan Center, 580 Nathan Road, Mongkok" },
      { text: "Privacy Contact Email: admin@ymistory.com" },
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
    title: 'Where Love Is Heard, Growth Begins.',
    paragraphs: [
      {
        text: 'Some voices stay with us long after the moment has passed. A story told with love. Words that bring comfort. A familiar voice that reminds us we are never alone.',
      },
      {
        text: "At YMI Story, we believe these moments can become a child's most treasured memories — shaping not only the stories they remember, but also the person they become.",
      },
      {
        text: "We create personalised children's books that bring together beautifully crafted physical storybooks, custom storybook illustrations featuring your child as the hero, and interactive audio features. More than an ordinary book or audiobook, each YMI Story is a keepsake of connection — made to be held, heard, and cherished as childhood unfolds.",
      },
      { text: 'But our purpose reaches beyond the pages.' },
      {
        text: "Through stories inspired by truth, goodness, and beauty, we hope to nurture a child's heart and spirit, planting the seeds of faith, hope, and love. We believe meaningful storytelling can encourage kindness, courage, wisdom, and compassion — values that children carry with them as they grow.",
      },
      {
        text: 'Because a better world begins with hearts that learn to care, hands that choose kindness, and a generation that understands the value of love and peace.',
      },
      {
        text: 'And through our charitable initiatives, we aspire to extend this spirit beyond every book, bringing care and hope to more lives.',
      },
    ],
  },
  {
    title: 'Your Voice. My Love. Inner Growth.',
    paragraphs: [
      { text: 'A story to treasure. Values to carry. Love to share with the world.' },
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
