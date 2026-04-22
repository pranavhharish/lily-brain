import type { Message, Part } from './types';
import { PARTS } from '../tokens';

export function initialMessages(): Message[] {
  return [
    { role: 'assistant', kind: 'welcome' },
    {
      role: 'assistant',
      kind: 'chips',
      chips: ['Find a part by model', 'My fridge is leaking', 'Track my order', 'Check part fit'],
    },
  ];
}

// Scope guard runs first — must stay at the top of this function.
export function respond(text: string): Message[] {
  const t = text.toLowerCase();

  // "washer" uses \b word boundary so "dishwasher" doesn't false-positive
  if (/(oven|microwave|\bwasher\b|dryer|stove|range|cooktop|hvac|furnace|\btv\b|phone|weather|politics|recipe|joke)/.test(t)) {
    return [{ role: 'assistant', kind: 'outofscope' }];
  }
  if (/(human|agent|representative|person|call)/.test(t)) {
    return [{ role: 'assistant', kind: 'handoff' }];
  }
  if (/(order|track|shipping|shipped|delivery|#)/.test(t)) {
    return [{ role: 'assistant', kind: 'order' }];
  }
  if (/(leak|ice|cool|cold|drain|smell|noise|broken|won't|not working|troubleshoot|diagnose|symptom)/.test(t)) {
    return [
      { role: 'assistant', kind: 'diagnostic' },
      { role: 'assistant', kind: 'text', text: "Want me to pull the part for the most likely cause?" },
      { role: 'assistant', kind: 'chips', chips: ['Yes, show the part', 'Walk me through fixing it', 'Talk to a human'] },
    ];
  }
  if (/(filter|part|bin|pump|valve|shelf|gasket|drawer|replace)/.test(t)) {
    const part: Part = /dishwasher|pump|drain/.test(t)
      ? PARTS.dwPump
      : /bin|shelf|drawer/.test(t)
      ? PARTS.doorBin
      : PARTS.waterFilter;
    return [{ role: 'assistant', kind: 'product', part }];
  }
  if (/(fit|compatible|work with|compatibility)/.test(t)) {
    return [
      { role: 'assistant', kind: 'text', text: "Sure — share the part # you're checking and your model, or paste either one and I'll confirm." },
      { role: 'assistant', kind: 'chips', chips: ['W10413645A', 'WP2187172', 'Use my saved model'] },
    ];
  }
  if (/(find|search|model)/.test(t)) {
    return [
      { role: 'assistant', kind: 'text', text: "Happy to help. Paste your model number (usually inside the door frame) or describe the symptom." },
      { role: 'assistant', kind: 'chips', chips: ['WRS325SDHZ', "I don't know my model", 'Ice maker issue', 'Dishwasher not draining'] },
    ];
  }
  return [
    { role: 'assistant', kind: 'text', text: "I can help find parts, check compatibility, troubleshoot, or look up an order. What do you need?" },
    { role: 'assistant', kind: 'chips', chips: ['Find a part', 'Troubleshoot', 'Track order', 'Talk to human'] },
  ];
}
