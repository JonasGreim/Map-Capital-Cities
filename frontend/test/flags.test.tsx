import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { CountryFlag } from "../src/CountryFlag";
import { flagUrl } from "../src/country-flag";
import { getCapitals, type Capital } from "../src/api";
import { useCapitalStore } from "../src/capital-store";

const input = { name: "Berlin", country: "Germany", latitude: 52.52, longitude: 13.405 };

test("only validated alpha-2 codes produce official CDN URLs and fixed decorative images", () => {
  for (const [code, expected] of [["DE", "de"], ["CZ", "cz"], ["AQ", "aq"], ["fr", "fr"]]) {
    assert.equal(flagUrl(code), `https://flags.restcountries.com/v5/svg/${expected}.svg`);
    const html = renderToStaticMarkup(<CountryFlag code={code} />);
    assert.match(html, /aria-hidden="true"/);
    assert.match(html, /alt="" width="40" height="30"/);
    assert.match(html, new RegExp(`/svg/${expected}.svg`));
  }
  for (const code of [undefined, null, {}, 12, "", " DE ", "DE\n", "DEU", "D1", "DÉ", "../de", "https://example.com/de.svg"]) {
    assert.equal(flagUrl(code), null);
    const html = renderToStaticMarkup(<CountryFlag code={code} />);
    assert.match(html, /<svg/);
    assert.doesNotMatch(html, /<img/);
  }
});

test("optional response metadata is normalized safely without rejecting otherwise valid capitals", async (t) => {
  const codes = [undefined, null, "DE", "cz", "../de", 12, {}, "DEU"];
  t.mock.method(globalThis, "fetch", async () => Response.json(codes.map(flagCode => ({ ...input, id: 1, flagCode }))));
  const capitals = await getCapitals();
  assert.deepEqual(capitals.map(capital => capital.flagCode), [undefined, null, "DE", "CZ", null, null, null, null]);
});

test("successful creates and country edits update shared flag metadata and send only the four input fields", async (t) => {
  useCapitalStore.setState({ capitals: [], loading: false, error: null, mutating: false });
  t.after(() => useCapitalStore.setState({ capitals: [], mutating: false }));
  const mock = t.mock.method(globalThis, "fetch", async (_url: unknown, options?: RequestInit) => {
    const body = JSON.parse(options!.body as string);
    assert.deepEqual(Object.keys(body).sort(), ["country", "latitude", "longitude", "name"]);
    return Response.json({ ...body, id: 1, flagCode: body.country === "Germany" ? "DE" : "CZ" });
  });
  const response: Capital = { ...input, id: 1, flagCode: "DE" };
  await useCapitalStore.getState().saveCapital(response);
  assert.equal(useCapitalStore.getState().capitals[0].flagCode, "DE");
  await useCapitalStore.getState().saveCapital({ ...response, country: "Czechia" }, 1);
  assert.equal(useCapitalStore.getState().capitals[0].flagCode, "CZ");
  assert.equal(mock.mock.callCount(), 2);
});
