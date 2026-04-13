export interface User {
  id: string;
  name: string;
  email: string;
  avatar: string;
  customerId?: string;
  avatarAssetId?: string;
  avatarStoragePath?: string;
}

export interface Book {
  bookID: string;
  title: string;
  author: string;
  price: number;
  coverUrl: string;
  showcaseImages: string[];
  description: string;
  category: 'Adventure' | 'Fantasy' | 'Bedtime' | 'Learning' | 'Animals';
  ageRange: '0-2' | '3-5' | '6-8' | '9-12';
  gender: 'Boy' | 'Girl' | 'Neutral';
  coverZoom?: number;
}

export type StoryLanguage = 'English' | 'Traditional Chinese' | 'Spanish';

export interface PersonalizationData {
  childName: string;
  childAge: string;
  language: StoryLanguage;
  dedication: string;
  photo?: File | null;
  photoUrl?: string; // For preview display
  assetId?: string;
  storagePath?: string;
  faceImageUrl?: string;
  voiceAssetId?: string;
  voiceStoragePath?: string;
  previewJobId?: string;
  creationId?: string;
  textOverrides?: Record<string, unknown>;
  params?: Record<string, unknown>;
  bookType?: 'digital' | 'basic' | 'premium' | 'supreme';
}

export interface CartItem {
  id: string; // Unique ID for cart item
  creationId?: string;
  bookID: string;
  quantity: number;
  book: Book;
  personalization?: PersonalizationData;
  priceAtPurchase?: number; // Store the price (base + type modifier)
  savedStep?: number; // To resume progress
}

export interface ShippingAddress {
  firstName: string;
  lastName: string;
  address: string;
  city: string;
  zip: string;
  country?: string;
  phone?: string;
}

export interface AddressBookEntry {
  assetId: string;
  metadata: ShippingAddress;
  createdAt: string;
}

export interface Order {
  id: string;
  displayId?: string;
  date: string;
  items?: CartItem[];
  total: number;
  status: 'unpaid' | 'paid' | 'processing' | 'shipped' | 'cancelled' | 'refunded';
  shippingAddress?: {
    firstName?: string;
    lastName?: string;
    address?: string;
    city?: string;
    zip?: string;
  };
}

export type Language = 'en' | 'cn_s' | 'cn_t' | 'ja' | 'es' | 'ko';

export type CollaborationLeadGender =
  | 'female'
  | 'male'
  | 'non_binary'
  | 'prefer_not_to_say';

export interface CollaborationLeadForm {
  nickname: string;
  gender: CollaborationLeadGender | '';
  email: string;
  phone: string;
  whatsapp_or_wechat: string;
  instagram: string;
  tiktok: string;
  youtube: string;
  xiaohongshu: string;
  notes: string;
}

export type CollaborationLeadCreatePayload = CollaborationLeadForm

export interface ToggleFavoriteResult {
  success: boolean;
  error?: 'login_required' | string;
}

export type ViewState = 'home' | 'personalize' | 'cart' | 'checkout' | 'success' | 'favorites' | 'support' | 'orders' | 'my-books';

export interface GlobalContextType {
  user: User | null;
  language: Language;
  cart: CartItem[];
  favorites: Book[];
  isLoginModalOpen: boolean;
  loginModalMode: 'login' | 'signup';
  loginModalEmail: string;
  checkoutEmail: string;
  isHydrated: boolean;

  // Checkout State
  checkoutItems: CartItem[];

  // Router State
  resumeData: CartItem | null; // Data to populate wizard when resuming
  resumePersonalization: (item: CartItem | null) => void;

  login: (email: string, password: string, mode?: 'login' | 'signup') => Promise<{ error?: string; otpRequired?: boolean } | void>;
  verifySignupOtp: (email: string, code: string, password: string) => Promise<{ error?: string } | void>;
  logout: () => void;
  addToCart: (book: Book,personalization?: PersonalizationData,step?: number,finalPrice?: number,previewCoverUrl?: string) => Promise<CartItem | null>;
  removeFromCart: (itemId: string) => void;
  updateCartQuantity: (itemId: string, quantity: number) => void;
  updateCheckoutQuantity: (itemId: string, quantity: number) => void;
  prepareCheckout: (items: CartItem[]) => void;
  hydrateCheckoutItems: (items: any[]) => void;
  restoreCheckout: (items: CartItem[]) => void;
  removeFromCheckout: (itemId: string) => void;
  clearCheckout: () => void;
  removeOrderedItems: (itemIds: string[]) => void;
  refreshCart: () => Promise<void>;
  refreshUserProfile: () => Promise<void>;
  toggleFavorite: (book: Book) => ToggleFavoriteResult;
  setLanguage: (lang: Language) => void;
  setCheckoutEmail: (email: string) => void;
  openLoginModal: (mode?: 'login' | 'signup', email?: string) => void;
  closeLoginModal: () => void;
  clearCart: () => void;
}
