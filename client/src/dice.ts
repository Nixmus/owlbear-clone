export interface DiceResult {
  formula: string;
  rolls: number[];
  modifier: number;
  total: number;
  breakdown: string;
}

/**
 * Parse and roll a dice expression such as "2d6+3", "d20", "4d6kh3+2".
 * Supports = / - modifiers and the `kh` (keep highest) operator is not
 * implemented — kept intentionally simple for clarity.
 */
export function rollDice(input: string): DiceResult | null {
  const expr = input.trim().toLowerCase().replace(/\s+/g, '');
  const match = expr.match(/^(\d*)d(\d+)([+-]\d+)?$/);
  if (!match) return null;

  const count = match[1] ? parseInt(match[1], 10) : 1;
  const sides = parseInt(match[2], 10);
  const modifier = match[3] ? parseInt(match[3], 10) : 0;

  if (count < 1 || count > 100 || sides < 2 || sides > 1000) return null;

  const rolls: number[] = [];
  for (let i = 0; i < count; i++) {
    rolls.push(1 + Math.floor(Math.random() * sides));
  }
  const total = rolls.reduce((a, b) => a + b, 0) + modifier;
  const breakdown =
    `[${rolls.join(', ')}]` + (modifier ? (modifier > 0 ? ` + ${modifier}` : ` - ${-modifier}`) : '');

  return {
    formula: `${count}d${sides}${modifier ? (modifier > 0 ? `+${modifier}` : modifier) : ''}`,
    rolls,
    modifier,
    total,
    breakdown,
  };
}
