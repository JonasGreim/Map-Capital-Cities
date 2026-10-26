// Exercise the visible custom control, including its actual option click path.
export async function chooseContinent(page, value) {
  await page.getByRole("combobox", { name: "Continent", exact: true }).click();
  await page.getByRole("option", { name: value || "All continents", exact: true }).click();
}

export async function continentValue(page) {
  const text = await page.locator("#continent-filter > span").textContent();
  return text === "All continents" ? "" : text;
}
