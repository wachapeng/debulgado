// The starting menu, taken from the printed menu board. Shared by the server and every device,
// so they all begin with the same item IDs. Prices are in centavos (7000 = ₱70.00).
export const SEED_TIME = '2026-01-01T00:00:00.000Z';

const slug = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

const BOARD = [
  ['Iced Coffee', 7000, ['Spanish Latte', 'Caramel Macchiato', 'Salted Caramel', 'Vanilla Latte', 'Cold Brew', 'Vietnamese Style',
    'Crème Brûlée', 'Tiramisu Latte', 'Iced Latte', ['Barista Drink', 9500], ['Irish Coffee', 9500]]],
  ['Non-Coffee', null, [['Matcha', 9900], ['Choco Lava', 8000]]],
  ['Fruit Soda', 6000, ['Green Apple', 'Lychee', 'Strawberry', 'Blueberry', 'Peach Mango', 'Passion Fruit', 'Lemon', 'Mango']],
  ['French Toast', 6500, ['Nutella', 'Biscoff', 'Tiramisu', 'Pistachio']],
];

export function defaultMenu() {
  const categories = [], products = [];
  BOARD.forEach(([name, price, items], ci) => {
    const category_id = 'c-' + slug(name);
    categories.push({ id: category_id, name, sort: ci, active: 1, updated_at: SEED_TIME });
    items.forEach((item, i) => {
      const [base, p] = Array.isArray(item) ? item : [item, price];
      const label = name === 'French Toast' ? `${base} Toast` : base;
      products.push({ id: 'p-' + slug(label), category_id, name: label, price: p, active: 1, sort: i, updated_at: SEED_TIME });
    });
  });
  const drinks = ['c-iced-coffee', 'c-non-coffee'];
  const addons = [
    { id: 'a-extra-shot', name: 'Extra Shot', price: 3000, active: 1, category_ids: drinks, updated_at: SEED_TIME },
    { id: 'a-oat-milk', name: 'Oat Milk', price: 3500, active: 1, category_ids: drinks, updated_at: SEED_TIME },
  ];
  return { categories, products, addons };
}

export const DEFAULT_SHOP = {
  shop_name: "Debulgado's Coffee Shop", shop_address: '', receipt_footer: 'Thank you. Come again.',
  senior_pwd_rate: 20, manager_pin: '',
};
