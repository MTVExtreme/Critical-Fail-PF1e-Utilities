/**
 * Caster guns store pristine damage as Nd6. The loaded crystal replaces the die.
 * Shard attacks keep their own formula.
 */
export function scaledMananiteFormula(formula, { dice, sides, scale }) {
  if (scale === false) return formula;
  const count = Number(dice);
  const faces = Number(sides);
  if (!Number.isFinite(count) || count <= 0 || !Number.isFinite(faces) || faces <= 0) return formula;
  return `${count}d${faces}`;
}
