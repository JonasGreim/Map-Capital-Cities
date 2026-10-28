import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { CountryFlag } from "../src/CountryFlag";
import { flagUrl, updateFlagVisibility } from "../src/country-flag";

test("only validated alpha-2 codes produce official CDN URLs and fixed decorative images", () => {
  for (const [code, expected] of [["DE", "de"], ["CZ", "cz"], ["AQ", "aq"], ["fr", "fr"]]) {
    assert.equal(flagUrl(code), `https://flags.restcountries.com/v5/svg/${expected}.svg`);
    const html = renderToStaticMarkup(<CountryFlag code={code} />);
    assert.match(html, /aria-hidden="true"/);
    assert.match(html, /alt="" width="40" height="30"/);
    assert.match(html, /hidden=""/);
    assert.match(html, new RegExp(`/svg/${expected}.svg`));
  }
  for (const code of [undefined, null, {}, 12, "", " DE ", "DE\n", "DEU", "D1", "DÉ", "../de", "https://example.com/de.svg"]) {
    assert.equal(flagUrl(code), null);
    const html = renderToStaticMarkup(<CountryFlag code={code} />);
    assert.match(html, /<svg/);
    assert.doesNotMatch(html, /<img/);
  }
});

test("flag visibility keeps the globe during loading/errors and reveals completed cached images", () => {
  const image = { hidden: true, complete: false, naturalWidth: 0 };
  const update = () => updateFlagVisibility(image as HTMLImageElement);
  update();
  assert.equal(image.hidden, true);
  image.complete = true;
  update();
  assert.equal(image.hidden, true); // A completed broken image has no decoded width.
  image.naturalWidth = 40;
  update();
  assert.equal(image.hidden, false); // Cache hit, without relying on another load event.
  image.complete = false;
  image.naturalWidth = 0;
  update();
  assert.equal(image.hidden, true);
  updateFlagVisibility(null);
});
