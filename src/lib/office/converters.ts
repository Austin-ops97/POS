export type UnitKind = "length" | "weight" | "temperature";
const factors: Record<Exclude<UnitKind, "temperature">, Record<string, number>> = {
  length: { meters: 1, kilometers: 1000, feet: 0.3048, miles: 1609.344, inches: 0.0254 },
  weight: { kilograms: 1, grams: 0.001, pounds: 0.45359237, ounces: 0.028349523125 },
};
export const unitsFor = (kind: UnitKind) => kind === "temperature" ? ["celsius", "fahrenheit", "kelvin"] : Object.keys(factors[kind]);
export function convertUnit(value: number, kind: UnitKind, from: string, to: string) {
  if (kind === "temperature") {
    const celsius = from === "fahrenheit" ? (value - 32) * 5 / 9 : from === "kelvin" ? value - 273.15 : value;
    return to === "fahrenheit" ? celsius * 9 / 5 + 32 : to === "kelvin" ? celsius + 273.15 : celsius;
  }
  return value * factors[kind][from] / factors[kind][to];
}
