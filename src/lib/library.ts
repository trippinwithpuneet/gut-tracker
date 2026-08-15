/**
 * The curated symptom and food-tag libraries — the single source of truth.
 *
 * `supabase/migrations/*_seed_libraries.sql` is GENERATED from this file by
 * `npm run db:gen-seed`. Edit here, regenerate, commit both. Do not hand-edit the SQL.
 *
 * Adding to the library after launch: append the new entry here, run the generator,
 * and commit the resulting *new* migration file. Never rewrite a migration that has
 * already been applied to a live database.
 *
 * Slugs are permanent identity — ids are derived from them (see lib/uuid.ts). Renaming
 * a slug orphans every entry tagged with it. Labels and descriptions are safe to change.
 */
import type { FoodTag, SymptomCategory, SymptomScale, SymptomType, TagCategory } from './types';
import { libraryId } from './uuid';

interface SymptomSeed {
  slug: string;
  name: string;
  description?: string;
  category: SymptomCategory;
  scale?: SymptomScale;
  isRedFlag?: boolean;
}

interface TagSeed {
  slug: string;
  name: string;
  description?: string;
  category: TagCategory;
  aliases?: string[];
}

const SYMPTOM_SEEDS: SymptomSeed[] = [
  { slug: 'foul-gas', name: 'Foul-smelling gas', description: 'Sulfurous, rotten-egg smell', category: 'gas' },
  { slug: 'excess-gas', name: 'Frequent gas', description: 'Volume and frequency rather than smell', category: 'gas' },
  { slug: 'belching', name: 'Belching', description: 'Burping, upper-gut wind', category: 'gas' },
  { slug: 'bloating', name: 'Bloating', description: 'Distension, tight or swollen belly', category: 'pain' },
  { slug: 'cramping', name: 'Cramping', description: 'Gripping abdominal pain', category: 'pain' },
  { slug: 'stomach-pain', name: 'Upper stomach pain', description: 'Pain above the navel', category: 'pain' },
  { slug: 'reflux', name: 'Reflux / heartburn', description: 'Burning behind the breastbone, acid taste', category: 'pain' },
  { slug: 'nausea', name: 'Nausea', description: 'Queasiness, loss of appetite', category: 'pain' },
  { slug: 'constipation', name: 'Constipation', description: 'Hard, infrequent or straining stools', category: 'stool' },
  { slug: 'loose-stool', name: 'Loose stool', description: 'Watery or unformed stools', category: 'stool' },
  { slug: 'urgency', name: 'Urgency', description: 'Sudden need to go', category: 'stool' },
  { slug: 'incomplete', name: 'Incomplete evacuation', description: 'Feeling of not being finished', category: 'stool' },
  { slug: 'mucus', name: 'Mucus in stool', category: 'stool' },
  { slug: 'greasy-stool', name: 'Greasy / floating stool', description: 'Pale, oily or hard to flush', category: 'stool', isRedFlag: true },
  { slug: 'blood-stool', name: 'Blood in stool', description: 'Any visible blood, fresh or dark', category: 'stool', scale: 'binary', isRedFlag: true },
  { slug: 'weight-loss', name: 'Unintended weight loss', description: 'Losing weight without trying', category: 'systemic', scale: 'binary', isRedFlag: true },
  { slug: 'fatigue', name: 'Fatigue', description: 'Unusual tiredness or heaviness', category: 'systemic' },
  { slug: 'brain-fog', name: 'Brain fog', description: 'Cloudy thinking, poor focus', category: 'systemic' },
  { slug: 'headache', name: 'Headache', category: 'systemic' },
  { slug: 'joint-pain', name: 'Joint pain', description: 'Aching or stiff joints', category: 'systemic' },
  { slug: 'low-mood', name: 'Low mood / irritability', category: 'systemic' },
  { slug: 'poor-sleep', name: 'Poor sleep', description: 'Trouble falling or staying asleep', category: 'systemic' },
  { slug: 'skin-flare', name: 'Skin flare', description: 'Acne, eczema or rash worsening', category: 'skin' },
  { slug: 'itching', name: 'Itching / hives', category: 'skin' },
];

const TAG_SEEDS: TagSeed[] = [
  // Usual suspects — shown first during onboarding.
  { slug: 'dairy', name: 'Dairy', description: 'Milk, cheese, curd, paneer, butter, cream', category: 'suspect', aliases: ['milk', 'cheese', 'curd', 'yogurt', 'paneer', 'butter', 'cream', 'ghee'] },
  { slug: 'eggs', name: 'Eggs', category: 'suspect', aliases: ['egg', 'omelette', 'omelet'] },
  { slug: 'alliums', name: 'Onion & garlic', description: 'Also leek, shallot, spring onion', category: 'suspect', aliases: ['onion', 'garlic', 'leek', 'shallot'] },
  { slug: 'gluten', name: 'Wheat & gluten', description: 'Bread, roti, pasta, most baked goods', category: 'suspect', aliases: ['wheat', 'bread', 'roti', 'chapati', 'pasta', 'maida'] },
  { slug: 'legumes', name: 'Beans, lentils & dal', description: 'Also chickpeas, rajma, peas', category: 'suspect', aliases: ['dal', 'lentil', 'beans', 'rajma', 'chana', 'chickpea', 'peas'] },
  { slug: 'cruciferous', name: 'Cruciferous veg', description: 'Broccoli, cabbage, cauliflower, sprouts', category: 'suspect', aliases: ['broccoli', 'cabbage', 'cauliflower', 'gobi', 'sprouts', 'kale'] },
  { slug: 'high-fodmap-fruit', name: 'High-FODMAP fruit', description: 'Apple, pear, mango, watermelon, cherries', category: 'suspect', aliases: ['apple', 'pear', 'mango', 'watermelon'] },
  { slug: 'sugar-alcohols', name: 'Sugar alcohols', description: 'Sorbitol, xylitol, maltitol — sugar-free gum', category: 'suspect', aliases: ['sorbitol', 'xylitol', 'maltitol', 'sugar free'] },
  { slug: 'sweeteners', name: 'Artificial sweeteners', description: 'Sucralose, aspartame, stevia blends', category: 'suspect', aliases: ['sucralose', 'aspartame', 'stevia', 'diet'] },
  { slug: 'fried', name: 'Fried & oily food', description: 'Deep-fried, heavy or reused oil', category: 'suspect', aliases: ['fried', 'deep-fried', 'oily', 'pakora', 'samosa'] },
  { slug: 'spicy', name: 'Spicy food', description: 'Chilli heat', category: 'suspect', aliases: ['chilli', 'chili', 'spicy', 'mirchi'] },
  { slug: 'fermented', name: 'Fermented food', description: 'Idli, dosa batter, kimchi, kombucha, vinegar', category: 'suspect', aliases: ['idli', 'dosa', 'kimchi', 'kombucha', 'sauerkraut', 'vinegar'] },
  { slug: 'nightshades', name: 'Nightshades', description: 'Tomato, potato, aubergine, peppers', category: 'suspect', aliases: ['tomato', 'potato', 'brinjal', 'aubergine', 'eggplant', 'capsicum'] },
  { slug: 'high-fibre', name: 'High-fibre food', description: 'Bran, whole grains, big salads, psyllium', category: 'suspect', aliases: ['bran', 'fibre', 'fiber', 'psyllium', 'salad'] },

  { slug: 'chicken', name: 'Chicken', category: 'protein', aliases: ['chicken', 'murgh'] },
  { slug: 'red-meat', name: 'Red meat', description: 'Beef, lamb, mutton, goat', category: 'protein', aliases: ['beef', 'lamb', 'mutton', 'goat'] },
  { slug: 'pork', name: 'Pork', category: 'protein', aliases: ['pork'] },
  { slug: 'processed-meat', name: 'Processed meat', description: 'Sausage, salami, bacon, deli meat', category: 'protein', aliases: ['sausage', 'salami', 'bacon', 'ham', 'deli'] },
  { slug: 'seafood', name: 'Seafood & shellfish', category: 'protein', aliases: ['fish', 'prawn', 'shrimp', 'crab', 'seafood'] },
  { slug: 'soy', name: 'Soy', description: 'Tofu, soy milk, soy sauce, edamame', category: 'protein', aliases: ['soy', 'tofu', 'edamame', 'soy sauce'] },
  { slug: 'nuts', name: 'Nuts & seeds', category: 'protein', aliases: ['nuts', 'almond', 'cashew', 'peanut', 'seeds'] },
  { slug: 'protein-powder', name: 'Protein powder', description: 'Whey, casein or plant shakes', category: 'protein', aliases: ['whey', 'casein', 'protein shake'] },

  { slug: 'rice', name: 'Rice', category: 'carb', aliases: ['rice', 'chawal', 'biryani'] },
  { slug: 'oats', name: 'Oats', category: 'carb', aliases: ['oats', 'oatmeal', 'porridge'] },
  { slug: 'corn', name: 'Corn', description: 'Sweetcorn, cornflour, popcorn', category: 'carb', aliases: ['corn', 'maize', 'popcorn'] },
  { slug: 'refined-sugar', name: 'Refined sugar', description: 'Desserts, sweets, sugary drinks', category: 'carb', aliases: ['sugar', 'dessert', 'sweet', 'mithai', 'cake'] },

  { slug: 'citrus', name: 'Citrus', description: 'Orange, lemon, lime, grapefruit', category: 'produce', aliases: ['orange', 'lemon', 'lime', 'citrus'] },
  { slug: 'mushrooms', name: 'Mushrooms', category: 'produce', aliases: ['mushroom'] },
  { slug: 'coconut', name: 'Coconut', description: 'Including coconut milk and oil', category: 'produce', aliases: ['coconut', 'nariyal'] },
  { slug: 'chocolate', name: 'Chocolate', category: 'produce', aliases: ['chocolate', 'cocoa'] },
  { slug: 'honey', name: 'Honey', category: 'produce', aliases: ['honey', 'shahad'] },

  { slug: 'caffeine', name: 'Caffeine', description: 'Coffee, tea, energy drinks', category: 'drink', aliases: ['coffee', 'tea', 'chai', 'espresso', 'energy drink'] },
  { slug: 'alcohol', name: 'Alcohol', category: 'drink', aliases: ['beer', 'wine', 'whisky', 'alcohol', 'vodka'] },
  { slug: 'carbonated', name: 'Fizzy drinks', description: 'Soda, sparkling water, cola', category: 'drink', aliases: ['soda', 'cola', 'sparkling', 'fizzy'] },

  // Patterns rather than ingredients. Cheap to log and often the real answer.
  { slug: 'large-portion', name: 'Large portion', description: 'Ate more than usual, felt overfull', category: 'pattern', aliases: ['overate', 'big meal'] },
  { slug: 'late-meal', name: 'Late-night meal', description: 'Ate within ~3 hours of bed', category: 'pattern', aliases: ['late', 'late dinner'] },
  { slug: 'rushed', name: 'Ate in a rush', description: 'Eating fast, standing, or while working', category: 'pattern', aliases: ['rushed', 'fast'] },
];

/** Symptoms offered during onboarding, in display order. */
export const CURATED_SYMPTOM_TYPES: SymptomType[] = SYMPTOM_SEEDS.map((seed, index) => ({
  id: libraryId('symptom', seed.slug),
  userId: null,
  slug: seed.slug,
  name: seed.name,
  description: seed.description ?? null,
  category: seed.category,
  scale: seed.scale ?? 'severity',
  isRedFlag: seed.isRedFlag ?? false,
  sortOrder: (index + 1) * 10,
}));

/** Food groups offered during onboarding and in the meal logger, in display order. */
export const CURATED_FOOD_TAGS: FoodTag[] = TAG_SEEDS.map((seed, index) => ({
  id: libraryId('tag', seed.slug),
  userId: null,
  slug: seed.slug,
  name: seed.name,
  description: seed.description ?? null,
  category: seed.category,
  aliases: seed.aliases ?? [],
  sortOrder: (index + 1) * 10,
}));

/** Preselected in onboarding: the groups implicated most often across gut conditions. */
export const DEFAULT_TAG_SLUGS = [
  'dairy',
  'eggs',
  'alliums',
  'gluten',
  'legumes',
  'cruciferous',
  'fried',
  'spicy',
  'caffeine',
  'alcohol',
  'refined-sugar',
  'large-portion',
];

const symptomBySlug = new Map(CURATED_SYMPTOM_TYPES.map((s) => [s.slug, s]));
const tagBySlug = new Map(CURATED_FOOD_TAGS.map((t) => [t.slug, t]));

export const curatedSymptom = (slug: string) => symptomBySlug.get(slug);
export const curatedTag = (slug: string) => tagBySlug.get(slug);

export const CURATED_SYMPTOM_IDS = new Set(CURATED_SYMPTOM_TYPES.map((s) => s.id));
export const CURATED_TAG_IDS = new Set(CURATED_FOOD_TAGS.map((t) => t.id));

export const TAG_CATEGORY_LABELS: Record<TagCategory, string> = {
  suspect: 'Usual suspects',
  protein: 'Proteins',
  carb: 'Grains & starches',
  produce: 'Produce & extras',
  drink: 'Drinks',
  pattern: 'How you ate',
  custom: 'Your own',
};

export const SYMPTOM_CATEGORY_LABELS: Record<SymptomCategory, string> = {
  gas: 'Gas',
  stool: 'Bowels',
  pain: 'Pain & discomfort',
  systemic: 'Whole body',
  skin: 'Skin',
  other: 'Other',
};
