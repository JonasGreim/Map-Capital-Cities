CREATE TABLE IF NOT EXISTS capitals (
    id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name text NOT NULL CHECK (name !~ '^[[:space:]]*$'),
    latitude double precision NOT NULL CHECK (latitude BETWEEN -90 AND 90),
    longitude double precision NOT NULL CHECK (longitude BETWEEN -180 AND 180),
    country text NOT NULL UNIQUE CHECK (country !~ '^[[:space:]]*$')
);

CREATE UNIQUE INDEX IF NOT EXISTS capitals_name_unique ON capitals (lower(name));

CREATE TABLE IF NOT EXISTS country_metadata (
    country_key text PRIMARY KEY CHECK (country_key <> '' AND country_key = lower(btrim(country_key))),
    flag_code text CHECK (flag_code ~ '^[A-Z]{2}$'),
    continents jsonb CHECK (jsonb_typeof(continents) = 'array'),
    population bigint CHECK (population BETWEEN 0 AND 9007199254740991),
    currencies jsonb CHECK (jsonb_typeof(currencies) = 'array')
);

CREATE TABLE IF NOT EXISTS import_state (
    source text PRIMARY KEY,
    completed_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);
