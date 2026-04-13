import * as OpenCC from 'opencc-js'
import type { Language } from '@/types'

export type LegalTextItem = {
  label?: string
  text: string
}

export type LegalSection = {
  title?: string
  paragraphs?: LegalTextItem[]
  bullets?: LegalTextItem[]
}

export type FooterLegalContent = {
  privacy: LegalSection[]
  terms: LegalSection[]
}

const cnToTraditional = OpenCC.Converter({ from: 'cn', to: 'hk' })

function convertTextItem(item: LegalTextItem): LegalTextItem {
  return {
    label: item.label ? cnToTraditional(item.label) : undefined,
    text: cnToTraditional(item.text),
  }
}

function convertSection(section: LegalSection): LegalSection {
  return {
    title: section.title ? cnToTraditional(section.title) : undefined,
    paragraphs: section.paragraphs?.map(convertTextItem),
    bullets: section.bullets?.map(convertTextItem),
  }
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
      { label: 'Voice Data:', text: 'Audio samples you provide for AI voice generation and related processing.' },
      { label: 'Visual Data:', text: 'Uploaded child photos and profile images used for personalization and account display.' },
      { label: 'Account Information:', text: 'Name, email address, shipping details, and profile settings.' },
      { label: 'Technical Data:', text: 'Basic device, browser, IP, and upload session information needed to operate the service securely.' },
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
        text: 'We only process your uploaded photos and audio to create the specific personalized content you request.',
      },
      {
        label: 'No Model Training:',
        text: 'We do not use your or your child\'s uploaded materials to train public AI models or to create products for other users.',
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
      { label: 'Access Control:', text: 'Access is restricted to authorized systems and service functions that require the data to operate.' },
    ],
  },
  {
    title: '4. Children\'s Data',
    paragraphs: [
      {
        text: 'YMI products are intended to be ordered and managed by parents or guardians. By uploading a child\'s image or related materials, you confirm that you are authorized to provide that data for personalization and fulfillment.',
      },
      {
        label: 'No Child Marketing:',
        text: 'We do not use children\'s uploaded materials for profiling, advertising, or unrelated marketing purposes.',
      },
    ],
  },
  {
    title: '5. Third-Party Processors',
    paragraphs: [
      {
        text: 'We may share limited data with trusted service providers only when necessary to operate the service, such as hosting, payments, production, shipping, and technical infrastructure.',
      },
    ],
    bullets: [
      { label: 'Cloud Infrastructure:', text: 'Secure hosting and storage providers used to operate uploads, generated assets, and application services.' },
      { label: 'Payment Processors:', text: 'Providers such as Stripe or PayPal used to securely process payments.' },
      { label: 'Production and Logistics:', text: 'Manufacturing and shipping partners involved in producing and delivering your physical order.' },
    ],
  },
  {
    title: '6. Your Rights',
    paragraphs: [
      { text: 'Depending on your jurisdiction, you may have the right to access, correct, or request deletion of your personal data.' },
    ],
    bullets: [
      { label: 'Access:', text: 'You may ask what account or order data we hold about you.' },
      { label: 'Correction:', text: 'You may request updates to inaccurate profile or order information.' },
      { label: 'Erasure:', text: 'You may request deletion of eligible account data, subject to legal, operational, and fulfillment requirements.' },
    ],
  },
  {
    title: '7. International Transfers',
    paragraphs: [
      {
        text: 'Because YMI operates online and serves multiple regions, your data may be processed in jurisdictions outside your place of residence. We use reasonable safeguards for such transfers.',
      },
    ],
  },
  {
    title: '8. Policy Updates',
    paragraphs: [
      {
        text: 'We may revise this Privacy Policy from time to time. Material updates will be reflected on this page and may also be communicated through the site or your registered email address.',
      },
    ],
  },
  {
    title: '9. Contact',
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

const privacyCnS: LegalSection[] = [
  {
    paragraphs: [
      {
        text: '在 YMI，我们会认真对待你的家庭资料、上传素材以及生成内容。本政策说明我们如何收集、使用、存储并保护为个性化书本制作与交付所需的信息。',
      },
    ],
  },
  {
    title: '1. 我们收集哪些数据',
    paragraphs: [
      {
        text: '为了完成个性化书本制作与交付，我们可能会收集以下类别的信息：',
      },
    ],
    bullets: [
      { label: '声音资料：', text: '你为 AI 配音或声音相关处理所上传的录音样本。' },
      { label: '图像资料：', text: '用于角色个性化和账户头像展示的孩子照片与头像图片。' },
      { label: '账户资料：', text: '姓名、电邮、收货地址以及账户设置资料。' },
      { label: '技术资料：', text: '为确保系统安全运行所需的基础设备、浏览器、IP 和上传会话信息。' },
    ],
  },
  {
    title: '2. AI、类生物识别资料与使用限制',
    paragraphs: [
      {
        text: 'YMI 会使用 AI 工作流来处理图像个性化、预览页生成以及声音相关素材。在适用法律下，上传的照片和录音可能被视为敏感资料或类生物识别资料。',
      },
      {
        label: '严格用途限制：',
        text: '你的照片和录音仅会被用于生成你当前订单所需的个性化内容。',
      },
      {
        label: '不用于训练公开模型：',
        text: '我们不会将你或孩子上传的素材用于训练公开 AI 模型，也不会用于其他用户的产品生成。',
      },
    ],
  },
  {
    title: '3. 存储与安全',
    paragraphs: [
      {
        text: '我们会采取合理的技术和组织措施来保护客户数据与上传资源。',
      },
    ],
    bullets: [
      { label: '加密：', text: '上传过程会受到传输保护，存储资源也保存在受保护的基础设施中。' },
      { label: '保留期限：', text: '上传素材与生成内容只会在个性化、履约、支持及合理运营所需期间内保留。' },
      { label: '访问控制：', text: '只有经过授权且确有业务需要的系统和服务功能才可访问相关数据。' },
    ],
  },
  {
    title: '4. 儿童资料',
    paragraphs: [
      {
        text: 'YMI 产品应由家长或监护人下单与管理。上传儿童照片或相关素材即表示你已获得合法授权，可为个性化与履约目的提供这些资料。',
      },
      {
        label: '不用于儿童营销：',
        text: '我们不会将儿童上传素材用于画像、广告投放或与订单无关的营销用途。',
      },
    ],
  },
  {
    title: '5. 第三方处理方',
    paragraphs: [
      {
        text: '我们仅在运营服务确有必要时，才会与受信任的服务商共享有限数据，例如云服务、支付、生产、物流及技术基础设施提供方。',
      },
    ],
    bullets: [
      { label: '云基础设施：', text: '用于承载上传、生成资源与站点服务的安全存储和托管服务。' },
      { label: '支付处理方：', text: '例如 Stripe 或 PayPal，用于安全处理付款。' },
      { label: '生产与物流：', text: '参与制作与配送实体订单的生产和运输合作方。' },
    ],
  },
  {
    title: '6. 你的权利',
    paragraphs: [
      { text: '根据你所在地区的法律，你可能拥有访问、更正或要求删除个人资料的权利。' },
    ],
    bullets: [
      { label: '访问权：', text: '你可以询问我们当前持有哪些账户或订单资料。' },
      { label: '更正权：', text: '你可以要求修正不准确的账户或订单信息。' },
      { label: '删除权：', text: '在符合法律、履约和合理运营要求的前提下，你可以要求删除可删除的账户资料。' },
    ],
  },
  {
    title: '7. 国际传输',
    paragraphs: [
      {
        text: '由于 YMI 面向多个地区提供在线服务，你的数据可能会在你居住地之外的司法辖区被处理。对于此类跨境处理，我们会采用合理保障措施。',
      },
    ],
  },
  {
    title: '8. 政策更新',
    paragraphs: [
      {
        text: '我们可能会不时更新本隐私政策。重大更新会反映在本页面，也可能通过网站或你的注册邮箱进行通知。',
      },
    ],
  },
  {
    title: '9. 联系我们',
    paragraphs: [
      {
        text: '如你对隐私相关事项有任何问题或请求，请通过 admin@ymistory.com 联系我们。',
      },
      {
        text: '地址：旺角弥敦道 580 号弥敦中心 1604 室',
      },
    ],
  },
]

const termsCnS: LegalSection[] = [
  {
    paragraphs: [
      {
        text: '欢迎使用 YMI。只要你下单、上传素材或使用个性化功能，即表示你已阅读并接受本条款与细则。',
      },
    ],
  },
  {
    title: '1. 服务性质',
    paragraphs: [
      {
        label: '1.1 定制商品：',
        text: 'YMI 提供的是针对每个订单单独生成的个性化印刷、音频和预览服务。',
      },
      {
        label: '1.2 一般最终销售：',
        text: '由于产品具有高度定制属性，一旦订单进入生产阶段，除非存在已确认的缺陷，否则通常不接受更改、取消或退款。',
      },
    ],
  },
  {
    title: '2. 用户素材与权利',
    paragraphs: [
      {
        label: '2.1 上传授权：',
        text: '你确认自己有权上传所有照片、录音及相关素材。',
      },
      {
        label: '2.2 责任承担：',
        text: '如上传素材侵犯第三方权利，相关申索、损失和费用由上传者自行承担。',
      },
      {
        label: '2.3 有限许可：',
        text: '你授予 YMI 在制作、履约和支持你的订单时，对所提交素材进行有限处理的许可。',
      },
      {
        label: '2.4 声音与类生物识别处理：',
        text: '在适用情况下，上传的声音与面部素材仅会用于当前订单所需的 AI 个性化处理，不会被用于无关商业用途。',
      },
    ],
  },
  {
    title: '3. 内容安全',
    paragraphs: [
      {
        label: '3.1 禁止内容：',
        text: '不得上传违法、辱骂、仇恨、色情、侵权或侵犯他人隐私的内容。',
      },
      {
        label: '3.2 拒绝服务：',
        text: '如上传内容或使用行为违反安全或法律要求，YMI 可拒绝、暂停或终止服务。',
      },
    ],
  },
  {
    title: '4. AI 与质量限制',
    paragraphs: [
      {
        label: '4.1 声音与图像差异：',
        text: 'AI 生成结果可能与原始人物、声音或相似度存在轻微差异，不保证为完全一致的复制品。',
      },
      {
        label: '4.2 素材质量影响：',
        text: '照片清晰度不足、录音噪音过大或输入资料不完整，都可能影响最终效果，这并不当然构成产品缺陷。',
      },
      {
        label: '4.3 模型演进：',
        text: '随着 AI 工具和工作流更新，不同批次之间的生成结果可能会出现差异。',
      },
    ],
  },
  {
    title: '5. 付款与反欺诈',
    paragraphs: [
      {
        label: '5.1 支付渠道：',
        text: '所有付款必须通过站点指定的合规支付处理方完成。',
      },
      {
        label: '5.2 欺诈与拒付：',
        text: '如出现疑似欺诈、恶意争议或未授权交易，YMI 有权暂停生产、发货或账户权限。',
      },
    ],
  },
  {
    title: '6. 运输与风险',
    paragraphs: [
      {
        label: '6.1 配送风险：',
        text: '在适用法律允许范围内，订单交付给承运商后，遗失风险可能转移给收件方。',
      },
      {
        label: '6.2 运输损坏：',
        text: '若包裹在运输中受损，请尽快向承运商申报，并向 YMI 提供照片和订单详情。',
      },
      {
        label: '6.3 地址准确性：',
        text: '因客户填写错误地址而产生的损失或额外费用由客户自行承担。',
      },
      {
        label: '6.4 不可抗力：',
        text: '对于海关、罢工、自然灾害、疫情等超出合理控制范围的延误，YMI 不承担责任。',
      },
    ],
  },
  {
    title: '7. 税费与关税',
    paragraphs: [
      {
        label: '7.1 进口费用：',
        text: '商品价格与运费通常不包含目的地国家或地区的增值税、关税或清关费用。',
      },
      {
        label: '7.2 用户责任：',
        text: '目的地国家要求的税费、关税与其他清关费用由收件人负责承担。',
      },
    ],
  },
  {
    title: '8. 质量保证与验收',
    paragraphs: [
      {
        label: '8.1 可支持范围：',
        text: '支持范围主要限于重大印刷缺陷、功能故障或已确认的运输损坏。',
      },
      {
        label: '8.2 检查时限：',
        text: '请在收货后尽快反馈质量问题，以便我们判断并安排后续处理。',
      },
      {
        label: '8.3 不包含事项：',
        text: '不包括意外损坏、错误使用、私自拆解，或对 AI 艺术风格的主观不满意。',
      },
    ],
  },
  {
    title: '9. 使用限制',
    paragraphs: [
      {
        label: '9.1 个人使用：',
        text: 'YMI 产品和生成音频默认仅供个人、非商业使用，除非另有书面许可。',
      },
      {
        label: '9.2 商业限制：',
        text: '未经明确许可，不得转售或将 YMI 生成素材用于商业用途。',
      },
    ],
  },
  {
    title: '10. 责任限制',
    paragraphs: [
      {
        label: '10.1 最高责任范围：',
        text: '在法律允许范围内，YMI 对某一具体订单承担的总责任通常不超过该订单实际支付金额，但法律明确不得排除的责任除外。',
      },
      {
        label: '10.2 间接损失：',
        text: '除适用法律另有要求外，YMI 不对间接、附带或后果性损失负责。',
      },
    ],
  },
  {
    title: '11. 数据与设备安全',
    paragraphs: [
      {
        label: '11.1 离线组件：',
        text: '如产品含有离线存储或嵌入式电子组件，因实体产品遗失、被盗或误用所导致的信息泄露，不由 YMI 承担责任。',
      },
    ],
  },
  {
    title: '12. 适用法律与争议',
    paragraphs: [
      {
        label: '12.1 适用法律：',
        text: '本条款受公司注册地法律管辖，但适用法律强制规定另有要求的除外。',
      },
      {
        label: '12.2 争议解决：',
        text: '无法协商解决的争议，可提交公司注册地有管辖权的法院或法定争议解决机构处理。',
      },
    ],
  },
  {
    title: '13. 技术保护',
    paragraphs: [
      {
        label: '13.1 禁止逆向工程：',
        text: '除法律明确允许外，用户不得对 YMI 硬件、固件或专有服务逻辑进行逆向工程、反编译或拆解。',
      },
    ],
  },
  {
    title: '14. 产品安全',
    paragraphs: [
      {
        label: '14.1 安全使用：',
        text: '电子组件应远离火源、液体和极端温度，并遵守随附安全说明。',
      },
      {
        label: '14.2 监护使用：',
        text: '年幼儿童使用带电子部件的产品时，应在适当成人监护下进行。',
      },
    ],
  },
  {
    title: '15. 数据保留限制',
    paragraphs: [
      {
        label: '15.1 不保证长期备份：',
        text: '在合理运营保留期结束后，YMI 不保证无限期保留或恢复原始上传素材。',
      },
    ],
  },
  {
    title: '16. 合规要求',
    paragraphs: [
      {
        label: '16.1 当地合规：',
        text: '客户需自行确认 AI 音频、带电池设备及相关商品可合法进口至当地地区。',
      },
      {
        label: '16.2 转运与转售：',
        text: '如涉及再出口、转运或转售，相关法律风险由用户自行承担。',
      },
    ],
  },
  {
    title: '17. 其他条款',
    paragraphs: [
      {
        label: '17.1 可分割性：',
        text: '若本条款任何部分被认定不可执行，其余条款仍继续有效。',
      },
      {
        label: '17.2 更新权：',
        text: 'YMI 可不时更新本条款，更新后继续使用服务即表示你接受修订后的内容。',
      },
    ],
  },
]

export function getFooterLegalContent(language: Language): FooterLegalContent {
  if (language === 'cn_s') {
    return { privacy: privacyCnS, terms: termsCnS }
  }

  if (language === 'cn_t') {
    return {
      privacy: privacyCnS.map(convertSection),
      terms: termsCnS.map(convertSection),
    }
  }

  return {
    privacy: privacyEn,
    terms: termsEn,
  }
}
