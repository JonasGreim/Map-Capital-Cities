import { flagUrl, globeSvg, updateFlagVisibility } from "./country-flag";

export function CountryFlag({ code }: { code: unknown }) {
  const url = flagUrl(code);
  return (
    <span className="country-flag" aria-hidden="true">
      <span dangerouslySetInnerHTML={{ __html: globeSvg }} />
      {url && <img key={url} src={url} alt="" width={40} height={30} hidden ref={updateFlagVisibility}
        onLoad={(event) => updateFlagVisibility(event.currentTarget)}
        onError={(event) => { event.currentTarget.hidden = true; }} />}
    </span>
  );
}
