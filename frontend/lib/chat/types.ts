export type Part = {
  id: string;
  name: string;
  brand: string;
  price: number;
  stock: string;
  install: string;
  fit: string;
  img: string | null;
};

export type Message =
  | { role: 'user'; text: string }
  | { role: 'assistant'; kind: 'welcome' }
  | { role: 'assistant'; kind: 'chips'; chips: string[] }
  | { role: 'assistant'; kind: 'text'; text: string }
  | { role: 'assistant'; kind: 'product'; part: Part }
  | { role: 'assistant'; kind: 'order' }
  | { role: 'assistant'; kind: 'diagnostic' }
  | { role: 'assistant'; kind: 'handoff' }
  | { role: 'assistant'; kind: 'outofscope' };
