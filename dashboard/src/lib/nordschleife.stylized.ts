// Stylised Nürburgring 24h-Layout outline. Not geographically accurate — the
// goal is "winding closed loop, recognisably a racetrack, with a small detour
// at one end for the GP section". Every point a car sits at is computed via
// SVGPathElement.getPointAtLength(), so swapping this string for a properly
// traced path is a drop-in change.
//
// Coordinate system: viewBox 0 0 800 500. The start/finish marker is placed at
// the path's starting coordinate (M command).

export const NURBURGRING_VIEWBOX = { width: 800, height: 500 } as const;

export const NURBURGRING_PATH = [
  "M 180 410",
  // Short straight + GP detour (Mercedes Arena loop)
  "L 240 410",
  "C 290 410 320 395 320 365",
  "C 320 335 290 320 260 330",
  "C 240 337 240 360 255 370",
  "L 220 385",
  // back onto the main flow, heading east into the Nordschleife transition
  "C 270 395 320 380 360 360",
  "C 410 335 460 320 510 320",
  // North-east bulge (Hatzenbach → Hocheichen → Flugplatz)
  "C 565 320 615 340 645 380",
  "C 675 420 680 465 650 490",
  // East side coming back south (Pflanzgarten → Schwalbenschwanz)
  "C 615 510 575 505 540 485",
  "C 505 465 480 435 470 400",
  // Interior weave (Karussell area / Brünnchen — keeps the dot density from
  // bunching too much in the centre)
  "C 460 365 430 350 400 360",
  "C 370 370 350 395 345 425",
  "C 340 450 360 470 390 470",
  "C 420 470 445 455 450 430",
  // back outward toward the south-west return leg
  "C 455 405 440 385 415 380",
  "C 385 375 355 390 330 410",
  // Long return (Döttinger Höhe-ish) back to S/F
  "C 295 430 250 435 215 425",
  "C 195 420 185 415 180 410",
  "Z",
].join(" ");

// Origin of the start/finish marker (matches the path's M command).
export const NURBURGRING_START = { x: 180, y: 410 } as const;
