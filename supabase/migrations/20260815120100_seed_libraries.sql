-- GENERATED FILE — do not edit by hand.
-- Source: src/lib/library.ts   Regenerate: npm run db:gen-seed
--
-- Curated libraries ship as a migration rather than a seed file so that self-hosted
-- instances get them from `supabase db push` too. These rows have user_id IS NULL,
-- are readable by every authenticated user, and are not writable through the API.
--
-- The ids are UUIDv5 values derived from the slug (see src/lib/uuid.ts), which is what
-- lets a meal tagged offline point at the same row once it syncs to the server.

insert into public.symptom_types
  (id, user_id, slug, name, description, category, scale, is_red_flag, sort_order)
values
  ('48d5c28c-fbfa-50cc-99bc-14dca14e0565'::uuid, null, 'foul-gas', 'Foul-smelling gas', 'Sulfurous, rotten-egg smell', 'gas', 'severity', false, 10),
  ('49119fa6-2a0c-5c3a-8b79-7f03f7610947'::uuid, null, 'excess-gas', 'Frequent gas', 'Volume and frequency rather than smell', 'gas', 'severity', false, 20),
  ('6166e637-cae1-50ac-904d-37720a6dcd02'::uuid, null, 'belching', 'Belching', 'Burping, upper-gut wind', 'gas', 'severity', false, 30),
  ('255edfb8-7ca7-570c-8494-aa17f7482a04'::uuid, null, 'bloating', 'Bloating', 'Distension, tight or swollen belly', 'pain', 'severity', false, 40),
  ('144d9283-3feb-5cc3-9f74-8d87c751d79e'::uuid, null, 'cramping', 'Cramping', 'Gripping abdominal pain', 'pain', 'severity', false, 50),
  ('81099330-760f-540b-87ab-89ebd77ae54c'::uuid, null, 'stomach-pain', 'Upper stomach pain', 'Pain above the navel', 'pain', 'severity', false, 60),
  ('fd25b4ef-4bf9-5055-8175-e3079083e999'::uuid, null, 'reflux', 'Reflux / heartburn', 'Burning behind the breastbone, acid taste', 'pain', 'severity', false, 70),
  ('f497412d-1856-5ea5-8c9c-36b5ba69df93'::uuid, null, 'nausea', 'Nausea', 'Queasiness, loss of appetite', 'pain', 'severity', false, 80),
  ('abdaaadd-55f7-5364-a645-03925fd24191'::uuid, null, 'constipation', 'Constipation', 'Hard, infrequent or straining stools', 'stool', 'severity', false, 90),
  ('5b0b539a-d1a9-59a5-8097-01b9702dec6c'::uuid, null, 'loose-stool', 'Loose stool', 'Watery or unformed stools', 'stool', 'severity', false, 100),
  ('8dc24459-21d6-53f7-9ed1-5a098d8fc073'::uuid, null, 'urgency', 'Urgency', 'Sudden need to go', 'stool', 'severity', false, 110),
  ('b448033e-1585-5c14-94a6-aa4f1fd5ec74'::uuid, null, 'incomplete', 'Incomplete evacuation', 'Feeling of not being finished', 'stool', 'severity', false, 120),
  ('9037ab1f-029b-5164-9eb2-0a21fd7958ec'::uuid, null, 'mucus', 'Mucus in stool', null, 'stool', 'severity', false, 130),
  ('299abdc3-2e18-5f25-b502-03010ba120d1'::uuid, null, 'greasy-stool', 'Greasy / floating stool', 'Pale, oily or hard to flush', 'stool', 'severity', true, 140),
  ('5b10bcd8-637a-5bf3-bed3-35dc83f4ce9b'::uuid, null, 'blood-stool', 'Blood in stool', 'Any visible blood, fresh or dark', 'stool', 'binary', true, 150),
  ('43c87d29-4cb1-54a9-b5ba-a2a7439cf04c'::uuid, null, 'weight-loss', 'Unintended weight loss', 'Losing weight without trying', 'systemic', 'binary', true, 160),
  ('489f9e94-f92c-5b6f-a123-70fcfe9437a6'::uuid, null, 'fatigue', 'Fatigue', 'Unusual tiredness or heaviness', 'systemic', 'severity', false, 170),
  ('ac755c8a-08a1-5c0b-9b45-18228d388a5c'::uuid, null, 'brain-fog', 'Brain fog', 'Cloudy thinking, poor focus', 'systemic', 'severity', false, 180),
  ('f9fa7d70-dd1f-5e08-b792-21d20de8e08c'::uuid, null, 'headache', 'Headache', null, 'systemic', 'severity', false, 190),
  ('88d97789-79d4-5ded-bb36-31e9d17ff542'::uuid, null, 'joint-pain', 'Joint pain', 'Aching or stiff joints', 'systemic', 'severity', false, 200),
  ('4c8ad54f-a712-538d-a70e-ecbf754cd5b1'::uuid, null, 'low-mood', 'Low mood / irritability', null, 'systemic', 'severity', false, 210),
  ('1a06d56d-d482-51f6-9ecc-fa72a0465994'::uuid, null, 'poor-sleep', 'Poor sleep', 'Trouble falling or staying asleep', 'systemic', 'severity', false, 220),
  ('d5fb626d-9813-5301-9eb5-df432aeadec2'::uuid, null, 'skin-flare', 'Skin flare', 'Acne, eczema or rash worsening', 'skin', 'severity', false, 230),
  ('a62e74b9-c11e-5340-bd70-0c36e9dc87a6'::uuid, null, 'itching', 'Itching / hives', null, 'skin', 'severity', false, 240)
on conflict (id) do update set
  name = excluded.name,
  description = excluded.description,
  category = excluded.category,
  scale = excluded.scale,
  is_red_flag = excluded.is_red_flag,
  sort_order = excluded.sort_order;

insert into public.food_tags
  (id, user_id, slug, name, description, category, aliases, sort_order)
values
  ('7dc2bae9-356e-5aa2-ab78-81b336c2f4a5'::uuid, null, 'dairy', 'Dairy', 'Milk, cheese, curd, paneer, butter, cream', 'suspect', array['milk', 'cheese', 'curd', 'yogurt', 'paneer', 'butter', 'cream', 'ghee']::text[], 10),
  ('be821adb-a78b-56f8-8b77-97638cc102a4'::uuid, null, 'eggs', 'Eggs', null, 'suspect', array['egg', 'omelette', 'omelet']::text[], 20),
  ('d71e3c14-b02f-575a-9944-7ca0fb64ee10'::uuid, null, 'alliums', 'Onion & garlic', 'Also leek, shallot, spring onion', 'suspect', array['onion', 'garlic', 'leek', 'shallot']::text[], 30),
  ('b77d8433-5bb6-58ee-97be-b1e1b0291c23'::uuid, null, 'gluten', 'Wheat & gluten', 'Bread, roti, pasta, most baked goods', 'suspect', array['wheat', 'bread', 'roti', 'chapati', 'pasta', 'maida']::text[], 40),
  ('a89f81b1-432e-52b5-b823-dad7d990ae39'::uuid, null, 'legumes', 'Beans, lentils & dal', 'Also chickpeas, rajma, peas', 'suspect', array['dal', 'lentil', 'beans', 'rajma', 'chana', 'chickpea', 'peas']::text[], 50),
  ('0fd2198d-84f3-5512-91a2-1da53d79ba10'::uuid, null, 'cruciferous', 'Cruciferous veg', 'Broccoli, cabbage, cauliflower, sprouts', 'suspect', array['broccoli', 'cabbage', 'cauliflower', 'gobi', 'sprouts', 'kale']::text[], 60),
  ('b932bfa5-4899-5703-aa66-673713698eeb'::uuid, null, 'high-fodmap-fruit', 'High-FODMAP fruit', 'Apple, pear, mango, watermelon, cherries', 'suspect', array['apple', 'pear', 'mango', 'watermelon']::text[], 70),
  ('83e3dea9-fadd-567c-a095-02ab0f1af1eb'::uuid, null, 'sugar-alcohols', 'Sugar alcohols', 'Sorbitol, xylitol, maltitol — sugar-free gum', 'suspect', array['sorbitol', 'xylitol', 'maltitol', 'sugar free']::text[], 80),
  ('64d566ef-9a0b-5e72-aa88-7a02d83f1331'::uuid, null, 'sweeteners', 'Artificial sweeteners', 'Sucralose, aspartame, stevia blends', 'suspect', array['sucralose', 'aspartame', 'stevia', 'diet']::text[], 90),
  ('15e63ed5-d0af-521b-b91c-d44848f68f68'::uuid, null, 'fried', 'Fried & oily food', 'Deep-fried, heavy or reused oil', 'suspect', array['fried', 'deep-fried', 'oily', 'pakora', 'samosa']::text[], 100),
  ('5fc18ca5-5742-5e56-988a-364ae1ae6ed2'::uuid, null, 'spicy', 'Spicy food', 'Chilli heat', 'suspect', array['chilli', 'chili', 'spicy', 'mirchi']::text[], 110),
  ('baf88b4b-ee1b-577b-8b92-6778808c5633'::uuid, null, 'fermented', 'Fermented food', 'Idli, dosa batter, kimchi, kombucha, vinegar', 'suspect', array['idli', 'dosa', 'kimchi', 'kombucha', 'sauerkraut', 'vinegar']::text[], 120),
  ('806bc191-c061-58f7-be75-e1ed1e644032'::uuid, null, 'nightshades', 'Nightshades', 'Tomato, potato, aubergine, peppers', 'suspect', array['tomato', 'potato', 'brinjal', 'aubergine', 'eggplant', 'capsicum']::text[], 130),
  ('af4c8536-10b4-5668-9936-248eae506c2a'::uuid, null, 'high-fibre', 'High-fibre food', 'Bran, whole grains, big salads, psyllium', 'suspect', array['bran', 'fibre', 'fiber', 'psyllium', 'salad']::text[], 140),
  ('35d937c7-2be3-50c5-b9e9-c7b004de9352'::uuid, null, 'chicken', 'Chicken', null, 'protein', array['chicken', 'murgh']::text[], 150),
  ('4d7ddba6-af79-5c09-9611-01fe90338b49'::uuid, null, 'red-meat', 'Red meat', 'Beef, lamb, mutton, goat', 'protein', array['beef', 'lamb', 'mutton', 'goat']::text[], 160),
  ('edcc6dd4-bd27-5b54-b7e2-9a077aef7652'::uuid, null, 'pork', 'Pork', null, 'protein', array['pork']::text[], 170),
  ('ecfc7b19-1185-5383-b761-0596cff6bbdf'::uuid, null, 'processed-meat', 'Processed meat', 'Sausage, salami, bacon, deli meat', 'protein', array['sausage', 'salami', 'bacon', 'ham', 'deli']::text[], 180),
  ('504a1eb0-c0be-5906-acf8-d310b27a2aaf'::uuid, null, 'seafood', 'Seafood & shellfish', null, 'protein', array['fish', 'prawn', 'shrimp', 'crab', 'seafood']::text[], 190),
  ('8a14606d-e9c5-57c3-a4e2-ad6d7c309b0b'::uuid, null, 'soy', 'Soy', 'Tofu, soy milk, soy sauce, edamame', 'protein', array['soy', 'tofu', 'edamame', 'soy sauce']::text[], 200),
  ('d0c46740-8edb-5184-bcff-c101e8ae9ccd'::uuid, null, 'nuts', 'Nuts & seeds', null, 'protein', array['nuts', 'almond', 'cashew', 'peanut', 'seeds']::text[], 210),
  ('af343985-48e3-5f1f-9eaf-49d70d4e9b9d'::uuid, null, 'protein-powder', 'Protein powder', 'Whey, casein or plant shakes', 'protein', array['whey', 'casein', 'protein shake']::text[], 220),
  ('d0d4bdae-6b3d-5152-b998-3d3abe168f30'::uuid, null, 'rice', 'Rice', null, 'carb', array['rice', 'chawal', 'biryani']::text[], 230),
  ('3899f391-71a4-5e15-9e2e-75c99fa9b0ae'::uuid, null, 'oats', 'Oats', null, 'carb', array['oats', 'oatmeal', 'porridge']::text[], 240),
  ('50d796f6-80a9-5cf3-99ea-0601a0633093'::uuid, null, 'corn', 'Corn', 'Sweetcorn, cornflour, popcorn', 'carb', array['corn', 'maize', 'popcorn']::text[], 250),
  ('aecd5374-c653-5400-85b5-3f01d9f85f63'::uuid, null, 'refined-sugar', 'Refined sugar', 'Desserts, sweets, sugary drinks', 'carb', array['sugar', 'dessert', 'sweet', 'mithai', 'cake']::text[], 260),
  ('52daadcc-56c6-52e9-8cd5-70396003836b'::uuid, null, 'citrus', 'Citrus', 'Orange, lemon, lime, grapefruit', 'produce', array['orange', 'lemon', 'lime', 'citrus']::text[], 270),
  ('980258fb-6e26-5a25-b50b-65e1a2be36d4'::uuid, null, 'mushrooms', 'Mushrooms', null, 'produce', array['mushroom']::text[], 280),
  ('bd734546-d6f7-5d63-866d-771b8207305f'::uuid, null, 'coconut', 'Coconut', 'Including coconut milk and oil', 'produce', array['coconut', 'nariyal']::text[], 290),
  ('48ad8da9-d001-53cd-8478-afb11859c16e'::uuid, null, 'chocolate', 'Chocolate', null, 'produce', array['chocolate', 'cocoa']::text[], 300),
  ('6a589448-2d2a-514d-b424-2428bbb9ec77'::uuid, null, 'honey', 'Honey', null, 'produce', array['honey', 'shahad']::text[], 310),
  ('36a1ddac-0d7f-582d-8d3a-0ac6ecb556d4'::uuid, null, 'caffeine', 'Caffeine', 'Coffee, tea, energy drinks', 'drink', array['coffee', 'tea', 'chai', 'espresso', 'energy drink']::text[], 320),
  ('acdbf9d5-6bf6-5871-81fd-8aa1c03390c1'::uuid, null, 'alcohol', 'Alcohol', null, 'drink', array['beer', 'wine', 'whisky', 'alcohol', 'vodka']::text[], 330),
  ('de7e89b1-55e2-5c1e-b768-ab8ef4f9101a'::uuid, null, 'carbonated', 'Fizzy drinks', 'Soda, sparkling water, cola', 'drink', array['soda', 'cola', 'sparkling', 'fizzy']::text[], 340),
  ('482a128e-6ee8-510e-a923-cdbaee235d92'::uuid, null, 'large-portion', 'Large portion', 'Ate more than usual, felt overfull', 'pattern', array['overate', 'big meal']::text[], 350),
  ('6eb6ee88-b48c-5414-943f-9990d8042574'::uuid, null, 'late-meal', 'Late-night meal', 'Ate within ~3 hours of bed', 'pattern', array['late', 'late dinner']::text[], 360),
  ('06df2899-c22a-575f-a8a6-11a34871fe84'::uuid, null, 'rushed', 'Ate in a rush', 'Eating fast, standing, or while working', 'pattern', array['rushed', 'fast']::text[], 370)
on conflict (id) do update set
  name = excluded.name,
  description = excluded.description,
  category = excluded.category,
  aliases = excluded.aliases,
  sort_order = excluded.sort_order;
