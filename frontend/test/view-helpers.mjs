/* global document */
// Existing regressions also run on mobile. Navigate explicitly before interacting
// with a pane; state assertions may still inspect its preserved, hidden DOM.
export async function showView(page, name) {
  // setViewportSize resolves before React's matchMedia subscription commits.
  const mobile = page.viewportSize().width <= 700;
  await page.waitForFunction(mobile => document.getElementById("world-map")?.getAttribute("role") === (mobile ? "tabpanel" : null), mobile);
  if (!mobile) return;
  const tab = page.getByRole("tab", { name, exact: true });
  if (await tab.getAttribute("aria-selected") !== "true") await tab.click();
}

export function viewButton(page, name) {
  if (name === "Add capital") return page.locator("#add-capital");
  if (page.viewportSize().width <= 700 && ["Collapse sidebar", "Expand sidebar"].includes(name)) {
    return page.getByRole("tab", { name: name === "Collapse sidebar" ? "Map" : "Capitals", exact: true });
  }
  return page.getByRole("button", { name, exact: true, includeHidden: !["Cancel", "Pick on map", "Create capital", "Save changes"].includes(name) });
}
