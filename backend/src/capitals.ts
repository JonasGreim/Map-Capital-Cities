export type CapitalInput = { name: string; latitude: number; longitude: number; country: string };
export type Capital = CapitalInput & { id: number };
export type CapitalResponse = Capital & { flagCode: string | null };
type CapitalQueries = {
  query(sql: string, values?: unknown[]): Promise<{ rows: Capital[] }>;
};
export type CapitalDatabase = CapitalQueries & {
  connect?: () => Promise<CapitalQueries & { release(error?: boolean): void }>;
};

const fields = "id, name, latitude, longitude, country";

export function capitalStore(database: CapitalDatabase) {
  return {
    async list() {
      return (await database.query(`SELECT ${fields} FROM capitals ORDER BY lower(name), id`)).rows;
    },
    async findByName(name: string) {
      return (await database.query(`SELECT ${fields} FROM capitals WHERE lower(name) = lower($1)`, [name])).rows[0];
    },
    async create(capital: CapitalInput) {
      return (await database.query(
        `INSERT INTO capitals (name, latitude, longitude, country) VALUES ($1, $2, $3, $4) RETURNING ${fields}`,
        [capital.name.trim(), capital.latitude, capital.longitude, capital.country.trim()],
      )).rows[0];
    },
    async update(id: number, capital: CapitalInput) {
      return (await database.query(
        `UPDATE capitals SET name = $1, latitude = $2, longitude = $3, country = $4 WHERE id = $5 RETURNING ${fields}`,
        [capital.name.trim(), capital.latitude, capital.longitude, capital.country.trim(), id],
      )).rows[0];
    },
    async delete(id: number) {
      return (await database.query(`DELETE FROM capitals WHERE id = $1 RETURNING ${fields}`, [id])).rows[0];
    },
  };
}
