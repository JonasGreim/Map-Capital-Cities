import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { continentNames, type Continent, type ContinentFilter } from "./continent-filter";

// Small, deliberately simplified silhouettes; visible labels identify each choice.
const silhouettes: Record<Continent, string> = {
  Africa: "M7 3 13 2 18 6 17 10 20 12 16 14 13 22 10 21 9 15 5 12 3 8Z M20 16 21 19 19 22 18 20Z",
  Antarctica: "M2 16 5 13 8 14 10 11 13 13 16 12 18 15 21 14 23 18 19 20 15 19 12 21 8 19 4 20Z",
  Asia: "M2 5 7 3 11 4 15 2 22 5 20 9 23 11 19 14 16 12 14 17 11 13 9 16 7 11 3 10Z M17 16 20 18 22 21 18 20Z M22 10 23 13 22 15 21 12Z",
  Europe: "M11 2 14 3 12 7 15 8 18 6 21 9 18 12 20 15 16 15 15 20 13 18 12 14 9 13 7 16 3 14 4 11 8 10 7 7Z M3 7 5 8 4 11 2 10Z",
  "North America": "M2 5 7 2 12 4 16 3 18 6 14 10 11 11 10 15 13 18 16 20 15 22 11 19 8 16 6 11 3 10Z M17 2 22 3 20 7 17 8 16 5Z",
  Oceania: "M3 13 7 11 10 12 13 9 17 13 16 18 12 20 8 18 4 19 2 16Z M15 4 18 5 20 8 16 7Z M20 17 22 16 21 20 19 22 18 21Z",
  "South America": "M4 2 9 3 12 6 18 8 19 11 16 14 14 15 12 19 10 22 8 20 8 15 6 12 5 8 2 5Z",
};

function ContinentIcon({ continent }: { continent: ContinentFilter }) {
  return <svg className="continent-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    {continent ? <path d={silhouettes[continent]} fill="currentColor" /> : <g fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="12" cy="12" r="9" /><ellipse cx="12" cy="12" rx="4" ry="9" /><path d="M3 12h18M5 7h14M5 17h14" /></g>}
  </svg>;
}

// Static-markup tests render the closed control without a browser DOM.
const usePopupLayoutEffect = typeof document === "undefined" ? useEffect : useLayoutEffect;

const choices: readonly ContinentFilter[] = ["", ...continentNames];
const label = (value: ContinentFilter) => value || "All continents";

export function ContinentSelect({ value, onChange }: {
  value: ContinentFilter;
  onChange: (value: ContinentFilter) => void;
}) {
  const trigger = useRef<HTMLButtonElement>(null);
  const popup = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [position, setPosition] = useState({ left: 0, top: 0, width: 0, maxHeight: 0 });
  const typed = useRef({ text: "", time: 0 });

  usePopupLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const bounds = trigger.current!.getBoundingClientRect();
      const margin = 8, gap = 4;
      const below = window.innerHeight - bounds.bottom - margin - gap;
      const above = bounds.top - margin - gap;
      const maxHeight = Math.max(0, Math.min(360, below >= 180 || below >= above ? below : above));
      // Measure with the final width so wrapped labels also anchor correctly above.
      popup.current!.style.width = `${bounds.width}px`;
      popup.current!.style.maxHeight = `${maxHeight}px`;
      const height = popup.current!.getBoundingClientRect().height;
      setPosition({ left: bounds.left, top: below >= 180 || below >= above ? bounds.bottom + gap : bounds.top - gap - height, width: bounds.width, maxHeight });
    };
    place();
    window.addEventListener("resize", place);
    // The sidebar can itself scroll at short heights or with enlarged text.
    window.addEventListener("scroll", place, true);
    const outside = (event: PointerEvent) => {
      if (event.target instanceof Node && !trigger.current?.contains(event.target) && !popup.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener("pointerdown", outside);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
      document.removeEventListener("pointerdown", outside);
    };
  }, [open]);

  useEffect(() => {
    if (open) popup.current?.querySelectorAll('[role="option"]')[active]?.scrollIntoView({ block: "nearest" });
  }, [active, open]);

  function show(index = choices.indexOf(value)) {
    typed.current = { text: "", time: 0 };
    setActive(index);
    setOpen(true);
  }
  function choose(index: number) {
    onChange(choices[index]);
    setOpen(false);
    trigger.current?.focus({ preventScroll: true });
  }
  function keyDown(event: KeyboardEvent<HTMLButtonElement>) {
    switch (event.key) {
      case "ArrowDown": case "ArrowUp":
        event.preventDefault();
        if (!open) show();
        else setActive(index => (index + (event.key === "ArrowDown" ? 1 : -1) + choices.length) % choices.length);
        return;
      case "Home": case "End":
        event.preventDefault();
        show(event.key === "Home" ? 0 : choices.length - 1);
        return;
      case "Enter": case " ":
        event.preventDefault();
        if (open) choose(active); else show();
        return;
      case "Escape":
        if (open) { event.preventDefault(); event.stopPropagation(); setOpen(false); }
        return;
      case "Tab": setOpen(false); return;
    }
    if (event.key.length !== 1 || event.ctrlKey || event.metaKey || event.altKey) return;
    event.preventDefault();
    const now = Date.now();
    const text = (open && now - typed.current.time < 700 ? typed.current.text : "") + event.key.toLowerCase();
    typed.current = { text, time: now };
    const prefix = [...text].every(char => char === text[0]) ? text[0] : text;
    const start = open ? active : choices.indexOf(value);
    const match = choices.map((_, index) => (start + index + (prefix.length === 1 ? 1 : 0)) % choices.length)
      .find(index => label(choices[index]).toLowerCase().startsWith(prefix));
    if (match !== undefined) { setActive(match); setOpen(true); }
  }

  return <div className="list-continent">
    <label id="continent-label" htmlFor="continent-filter">Continent</label>
    <button ref={trigger} id="continent-filter" className="continent-select" type="button" role="combobox"
      aria-labelledby="continent-label" aria-describedby="search-results-count" aria-haspopup="listbox"
      aria-expanded={open} aria-controls={open ? "continent-options" : undefined}
      aria-activedescendant={open ? `continent-option-${active}` : undefined}
      onClick={() => { if (open) setOpen(false); else show(); }} onKeyDown={keyDown} onBlur={() => setOpen(false)}>
      <ContinentIcon continent={value} /><span>{label(value)}</span>
      <svg className="continent-chevron" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
    </button>
    {open && createPortal(<div ref={popup} id="continent-options" className="continent-options" role="listbox" aria-labelledby="continent-label" style={position}>
      {choices.map((choice, index) => <div key={choice} id={`continent-option-${index}`} role="option" aria-selected={choice === value}
        className={active === index ? "continent-option active" : "continent-option"} onPointerMove={() => setActive(index)}
        onMouseDown={event => event.preventDefault()} onClick={() => choose(index)}>
        <ContinentIcon continent={choice} /><span>{label(choice)}</span><span className="continent-check" aria-hidden="true">{choice === value ? "✓" : ""}</span>
      </div>)}
    </div>, document.body)}
  </div>;
}
