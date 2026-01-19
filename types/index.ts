export interface User {
  id: string;
  name: string;
  email: string;
  avatar: string;
}

export interface Book {
  bookID: string;
  title: string;
  author: string;
  price: number;
  coverUrl: string;
  description: string;
  category: 'Adventure' | 'Fantasy' | 'Bedtime' | 'Learning' | 'Animals';
  ageRange: '0-2' | '3-5' | '6-8' | '9-12';
  gender: 'Boy' | 'Girl' | 'Neutral';
}

export interface PersonalizationData {
  childName: string;
  childAge: string;
  language: 'English' | 'Chinese' | 'Spanish' | 'French';
  dedication: string;
  photo?: File | null;
  photoUrl?: string; // For preview display
  bookType?: 'digital' | 'basic' | 'premium' | 'supreme';
}

export interface CartItem {
  id: string; // Unique ID for cart item
  bookID: string;
  quantity: number;
  book: Book;
  personalization?: PersonalizationData;
  priceAtPurchase?: number; // Store the price (base + type modifier)
  savedStep?: number; // To resume progress
}

export interface Order {
  id: string;
  date: string;
  items: CartItem[];
  total: number;
  status: 'Processing' | 'Shipped' | 'Delivered' | 'Refund Requested' | 'Refunded';
  shippingAddress: {
    firstName: string;
    lastName: string;
    address: string;
    city: string;
    zip: string;
  };
}

export type Language = 'en' | 'cn_s' | 'cn_t';

export interface ToggleFavoriteResult {
  success: boolean;
  error?: 'login_required' | string;
}

export type ViewState = 'home' | 'personalize' | 'cart' | 'checkout' | 'success' | 'favorites' | 'support' | 'orders';

export interface GlobalContextType {
  user: User | null;
  language: Language;
  cart: CartItem[];
  favorites: Book[];
  orders: Order[];
  isLoginModalOpen: boolean;

  // Checkout State
  checkoutItems: CartItem[];

  // Router State
  resumeData: CartItem | null; // Data to populate wizard when resuming
  resumePersonalization: (item: CartItem | null) => void;

  login: () => void;
  logout: () => void;
  addToCart: (book: Book,personalization?: PersonalizationData,step?: number,finalPrice?: number) => void;
  removeFromCart: (itemId: string) => void;
  prepareCheckout: (items: CartItem[]) => void;
  removeFromCheckout: (itemId: string) => void;
  clearCheckout: () => void;
  removeOrderedItems: (itemIds: string[]) => void;
  addOrder: (order: Order) => void;
  updateOrderStatus: (orderId: string, status: Order['status']) => void;
  toggleFavorite: (book: Book) => ToggleFavoriteResult;
  setLanguage: (lang: Language) => void;
  openLoginModal: () => void;
  closeLoginModal: () => void;
  clearCart: () => void;
}
