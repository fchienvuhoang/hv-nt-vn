// CSS screen dimensions and pixel ratios used by iOS launch-image media queries.
export const pwaScreens = [
  [375,667,2],[414,736,3],[375,812,3],[390,844,3],[393,852,3],
  [402,874,3],[414,896,2],[414,896,3],[420,912,3],[428,926,3],
  [430,932,3],[440,956,3],[768,1024,2],[820,1180,2],[1024,1366,2],
] as const;
export const pwaStartupImages=pwaScreens.flatMap(([width,height,ratio])=>
  (["portrait","landscape"] as const).map(orientation=>({
    url:`/pwa/splash/${width}-${height}-${ratio}-${orientation}.png`,
    media:`(device-width: ${width}px) and (device-height: ${height}px) and (-webkit-device-pixel-ratio: ${ratio}) and (orientation: ${orientation})`,
  })),
);
