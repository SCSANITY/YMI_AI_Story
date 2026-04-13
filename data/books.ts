import { Book } from '@/types';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const templateCover = (templateId: string, fileName: string) =>
  `${SUPABASE_URL}/storage/v1/object/public/app-templates/${templateId}/${fileName}`;
const defaultShowcaseImages = (templateId: string) => [
  templateCover(templateId, 'Display.png'),
  templateCover(templateId, '01.png'),
  templateCover(templateId, '02.png'),
  templateCover(templateId, '03.png'),
  templateCover(templateId, '04.png'),
  templateCover(templateId, '05.png'),
  templateCover(templateId, '06.png'),
  templateCover(templateId, '07.png'),
  templateCover(templateId, '08.png'),
];

export const BOOKS: Book[] = [
  {
    bookID: 'Explorer_story',
    title: 'Kid With The World',
    author: 'YMI',
    price: 24.99,
    coverUrl: templateCover('Explorer_story', 'Display.png'),
    showcaseImages: defaultShowcaseImages('Explorer_story'),
    description: 'A personalized journey of curiosity, confidence, and discovery across the world.',
    category: 'Adventure',
    ageRange: '3-5',
    gender: 'Neutral',
    coverZoom: 1.25
  },
  {
    bookID: 'Seed_story',
    title: 'Miracle Seeds',
    author: 'YMI',
    price: 29.99,
    coverUrl: templateCover('Seed_story', 'Display.png'),
    showcaseImages: defaultShowcaseImages('Seed_story'),
    description: 'A heartfelt personalized story about growth, wonder, and the small miracles that shape childhood.',
    category: 'Adventure',
    ageRange: '3-5',
    gender: 'Neutral',
    coverZoom: 1.25
  },
  {
    bookID: 'Noah_story',
    title: "Kid And The Noah's Ark Adventure",
    author: 'YMI',
    price: 27.99,
    coverUrl: templateCover('Noah_story', 'Display.png'),
    showcaseImages: defaultShowcaseImages('Noah_story'),
    description: 'A personalized adventure filled with courage, heart, and timeless lessons from a classic journey.',
    category: 'Adventure',
    ageRange: '3-5',
    gender: 'Neutral',
    coverZoom: 1.25
  },
  {
    bookID: 'Planet_story',
    title: 'Kid And The Fight Planets',
    author: 'YMI',
    price: 22.99,
    coverUrl: templateCover('Planet_story', 'Display.png'),
    showcaseImages: defaultShowcaseImages('Planet_story'),
    description: 'A personalized mission through the stars where courage and imagination lead the way.',
    category: 'Adventure',
    ageRange: '3-5',
    gender: 'Neutral',
    coverZoom: 1.25
  },
  {
    bookID: 'Sister_story',
    title: "Kid's Whisper",
    author: 'YMI',
    price: 25.99,
    coverUrl: templateCover('Sister_story', 'Display.png'),
    showcaseImages: defaultShowcaseImages('Sister_story'),
    description: 'A gentle personalized story centered on emotion, connection, and the quiet magic of family bonds.',
    category: 'Adventure',
    ageRange: '3-5',
    gender: 'Neutral',
    coverZoom: 1.25
  },
  {
    bookID: 'Scientist_story',
    title: 'Little Scientist Johnathan',
    author: 'YMI',
    price: 24.99,
    coverUrl: templateCover('Scientist_story', 'Display.png'),
    showcaseImages: defaultShowcaseImages('Scientist_story'),
    description: 'A personalized story that celebrates curiosity, experimentation, and the joy of discovery.',
    category: 'Adventure',
    ageRange: '3-5',
    gender: 'Neutral',
    coverZoom: 1.25
  },
  {
    bookID: 'Space_story',
    title: "Kid's Space Mission",
    author: 'YMI',
    price: 26.99,
    coverUrl: templateCover('Space_story', 'Display.png'),
    showcaseImages: defaultShowcaseImages('Space_story'),
    description: 'A personalized outer-space adventure full of wonder, bravery, and problem-solving.',
    category: 'Adventure',
    ageRange: '3-5',
    gender: 'Neutral',
    coverZoom: 1.25
  },
  {
    bookID: 'Music_story',
    title: 'Musical Instrument Experience Day',
    author: 'YMI',
    price: 19.99,
    coverUrl: templateCover('Music_story', 'Display.png'),
    showcaseImages: defaultShowcaseImages('Music_story'),
    description: 'A playful personalized story that introduces music, rhythm, and joyful self-expression.',
    category: 'Adventure',
    ageRange: '3-5',
    gender: 'Neutral',
    coverZoom: 1.25
  },
  {
    bookID: 'Birthday_story',
    title: "Kid's Birthday Celebration",
    author: 'YMI',
    price: 24.99,
    coverUrl: templateCover('Birthday_story', 'Display.png'),
    showcaseImages: defaultShowcaseImages('Birthday_story'),
    description: 'A personalized celebration story made to capture the joy, love, and sparkle of a birthday.',
    category: 'Adventure',
    ageRange: '3-5',
    gender: 'Neutral',
    coverZoom: 1.25
  },
  {
    bookID: 'Adventure_story',
    title: "Girl's World Adventure",
    author: 'YMI',
    price: 24.99,
    coverUrl: templateCover('Adventure_story', 'Display.png'),
    showcaseImages: defaultShowcaseImages('Adventure_story'),
    description: 'A personalized adventure story full of courage, imagination, and big discoveries.',
    category: 'Adventure',
    ageRange: '3-5',
    gender: 'Neutral',
    coverZoom: 1.25
  }
];
