import { useEffect, useRef, useState, type FormEvent } from "react";
import type { Capital, CapitalInput } from "./api";
import { CapitalDialog } from "./CapitalDialog";
import type { PickRequest } from "./CapitalActions";

export type CapitalFields = Record<keyof CapitalInput, string>;
type FieldErrors = Partial<CapitalFields>;

export function validateCapital(fields: CapitalFields): { errors: FieldErrors; input: CapitalInput } {
  const errors: FieldErrors = {};
  for (const field of ["name", "country"] as const) {
    if (!fields[field].trim()) errors[field] = `${field === "name" ? "Capital name" : "Country name"} is required.`;
    else if (fields[field].includes("\0")) errors[field] = "Remove invalid characters.";
  }
  for (const [field, bound] of [["latitude", 90], ["longitude", 180]] as const) {
    if (!fields[field].trim()) errors[field] = `${field === "latitude" ? "Latitude" : "Longitude"} is required.`;
    else if (!Number.isFinite(Number(fields[field])) || Math.abs(Number(fields[field])) > bound) {
      errors[field] = `Enter a number between -${bound} and ${bound}.`;
    }
  }
  return { errors, input: { name: fields.name.trim(), country: fields.country.trim(), latitude: Number(fields.latitude), longitude: Number(fields.longitude) } };
}

export function CapitalForm({ capital, onSave, onCancel, picker }: {
  capital?: Capital;
  onSave: (input: CapitalInput, id?: number) => Promise<void>;
  onCancel: () => void;
  picker?: { available: boolean; active: boolean; disabled?: boolean; start: (request: PickRequest) => void; clearPreview: () => void };
}) {
  const [fields, setFields] = useState<CapitalFields>({ name: capital?.name ?? "", country: capital?.country ?? "",
    latitude: capital ? String(capital.latitude) : "", longitude: capital ? String(capital.longitude) : "" });
  const [errors, setErrors] = useState<FieldErrors>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [resumeFocus, setResumeFocus] = useState<string>();
  const pending = useRef(false);
  const form = useRef<HTMLFormElement>(null);
  const apiError = useRef<HTMLParagraphElement>(null);
  useEffect(() => { if (error && !busy) apiError.current?.focus(); }, [error, busy]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (pending.current) return;
    const { errors: nextErrors, input } = validateCapital(fields);
    setErrors(nextErrors);
    setError(null);
    const invalid = Object.keys(nextErrors)[0];
    if (invalid) { form.current?.querySelector<HTMLInputElement>(`[name="${invalid}"]`)?.focus(); return; }
    pending.current = true;
    setBusy(true);
    try {
      await onSave(input, capital?.id);
      onCancel();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Unable to save the capital. Please try again.");
    } finally { pending.current = false; setBusy(false); }
  }

  return (
    <CapitalDialog title={capital ? "Edit capital" : "Add capital"} busy={busy} onClose={onCancel}
      suspended={picker?.active} resumeFocus={resumeFocus}>
      <form ref={form} onSubmit={(event) => { void submit(event); }} noValidate>
        <fieldset disabled={busy}>
          {([ ["name", "Capital name"], ["country", "Country name"], ["latitude", "Latitude"], ["longitude", "Longitude"] ] as const).map(([field, label]) => (
            <div className="form-field" key={field}>
              <label htmlFor={`capital-${field}`}>{label}</label>
              <input id={`capital-${field}`} name={field} required type={field === "latitude" || field === "longitude" ? "number" : "text"}
                step={field === "latitude" || field === "longitude" ? "any" : undefined}
                min={field === "latitude" ? -90 : field === "longitude" ? -180 : undefined}
                max={field === "latitude" ? 90 : field === "longitude" ? 180 : undefined}
                value={fields[field]} onChange={(event) => {
                  setFields({ ...fields, [field]: event.target.value });
                  if (field === "latitude" || field === "longitude") picker?.clearPreview();
                }}
                aria-invalid={!!errors[field]} aria-describedby={errors[field] ? `${field}-error` : undefined} />
              {errors[field] && <p className="field-error" id={`${field}-error`}>{errors[field]}</p>}
            </div>
          ))}
          {picker && <div className="coordinate-picker-control">
            <button id="pick-on-map" type="button" className="secondary pick-on-map" disabled={!picker.available || busy || picker.disabled}
              aria-describedby={!picker.available ? "pick-unavailable" : undefined}
              onClick={() => picker.start({
                onPick: coordinates => {
                  setFields(current => ({ ...current, ...coordinates }));
                  setErrors(current => ({ ...current, latitude: undefined, longitude: undefined }));
                  setResumeFocus('[name="latitude"]');
                },
                onCancel: () => setResumeFocus("#pick-on-map"),
              })}>
              <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M19 10c0 5-7 11-7 11S5 15 5 10a7 7 0 1 1 14 0Z"/><circle cx="12" cy="10" r="2.5"/></svg>
              Pick on map
            </button>
            {!picker.available && <p id="pick-unavailable" className="coordinate-help">Map picking is unavailable. Enter coordinates manually.</p>}
          </div>}
        </fieldset>
        {error && <p ref={apiError} className="field-error" role="alert" tabIndex={-1}>{error}</p>}
        <div className="dialog-actions">
          <button type="button" className="secondary" disabled={busy} onClick={onCancel}>Cancel</button>
          <button type="submit" disabled={busy}>{busy ? "Saving…" : capital ? "Save changes" : "Create capital"}</button>
        </div>
        {busy && <p role="status">Saving capital…</p>}
      </form>
    </CapitalDialog>
  );
}
