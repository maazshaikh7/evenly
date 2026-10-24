export const CATEGORIES = [
  { id: 'food', label: 'Food & drink', emoji: '🍽️' },
  { id: 'groceries', label: 'Groceries', emoji: '🛒' },
  { id: 'transport', label: 'Transport', emoji: '🚕' },
  { id: 'travel', label: 'Flights & trains', emoji: '✈️' },
  { id: 'stay', label: 'Accommodation', emoji: '🏨' },
  { id: 'rent', label: 'Rent', emoji: '🏠' },
  { id: 'bills', label: 'Bills', emoji: '💡' },
  { id: 'fun', label: 'Entertainment', emoji: '🎟️' },
  { id: 'shopping', label: 'Shopping', emoji: '🛍️' },
  { id: 'health', label: 'Health', emoji: '💊' },
  { id: 'gifts', label: 'Gifts', emoji: '🎁' },
  { id: 'other', label: 'Other', emoji: '📦' },
];

export const PAYMENT_CATEGORY = { id: 'payment', label: 'Payment', emoji: '🤝' };

export const categoryOf = (id) =>
  id === 'payment' ? PAYMENT_CATEGORY : CATEGORIES.find((c) => c.id === id) || CATEGORIES.at(-1);
