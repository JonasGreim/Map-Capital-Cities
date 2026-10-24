CREATE TABLE IF NOT EXISTS capitals (
    id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name text NOT NULL CHECK (name !~ '^[[:space:]]*$'),
    latitude double precision NOT NULL CHECK (latitude BETWEEN -90 AND 90),
    longitude double precision NOT NULL CHECK (longitude BETWEEN -180 AND 180),
    country text NOT NULL UNIQUE CHECK (country !~ '^[[:space:]]*$')
);

CREATE UNIQUE INDEX IF NOT EXISTS capitals_name_unique ON capitals (lower(name));
