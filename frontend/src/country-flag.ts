export function flagUrl(code: unknown): string | null {
  return typeof code === "string" && code.length === 2 && /^[A-Z]{2}$/i.test(code)
    ? `https://flags.restcountries.com/v5/svg/${code.toLowerCase()}.svg` : null;
}

// Static decorative globe shared by React list rows and Mapbox's native DOM.
export const globeSvg = '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false"><circle cx="12" cy="12" r="9"/><ellipse cx="12" cy="12" rx="4" ry="9"/><path d="M3 12h18M5 6h14M5 18h14"/></svg>';

// Also handles a cached image that completed before the ref/load handler ran.
export function updateFlagVisibility(image: HTMLImageElement | null) {
  if (image) image.hidden = !image.complete || image.naturalWidth === 0;
}

export function updateCountryFlag(element: HTMLElement, code: unknown) {
  element.className = "country-flag";
  element.setAttribute("aria-hidden", "true");
  element.innerHTML = globeSvg;
  const url = flagUrl(code);
  if (!url) return;
  const image = document.createElement("img");
  image.alt = "";
  image.width = 40;
  image.height = 30;
  image.hidden = true;
  image.onload = () => updateFlagVisibility(image);
  image.onerror = () => { image.hidden = true; };
  image.src = url;
  element.append(image);
  updateFlagVisibility(image);
}
