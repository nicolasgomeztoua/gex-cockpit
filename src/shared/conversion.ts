import type { FeedSnapshot, FuturesConversion, StrikeRow } from "./types";

/** Official GexBot formula: future = multiplier * source + additive. */
export const convertPrice = (price: number, conversion: FuturesConversion): number =>
  price === 0 ? 0 : conversion.multiplier * price + conversion.additive;

/** Convert price fields only; exposure magnitudes and priors stay unchanged. */
export function convertSnapshot(
  snapshot: FeedSnapshot,
  conversion: FuturesConversion,
): FeedSnapshot {
  const price = (value: number) => convertPrice(value, conversion);
  return {
    ...snapshot,
    spot: price(snapshot.spot),
    majors: {
      posVol: price(snapshot.majors.posVol),
      negVol: price(snapshot.majors.negVol),
      posOI: price(snapshot.majors.posOI),
      negOI: price(snapshot.majors.negOI),
      zeroGamma: snapshot.majors.zeroGamma
        ? price(snapshot.majors.zeroGamma)
        : snapshot.majors.zeroGamma,
    },
    strikes: snapshot.strikes.map(
      ([strike, vol, oi, priors]) => [price(strike), vol, oi, priors] as StrikeRow,
    ),
  };
}

export const convertSeries = (
  series: [number, number][],
  conversion: FuturesConversion,
): [number, number][] => series.map(([time, value]) => [time, convertPrice(value, conversion)]);
