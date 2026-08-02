import { execFileSync } from "node:child_process";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectId = process.env.FIREBASE_PROJECT_ID ?? "nattuvaidyamin";
const databaseId = process.env.FIRESTORE_DATABASE_ID ?? "(default)";
const seedDirectory = path.join(__dirname, "data", "plants");

function normalizeText(value) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9\u0d00-\u0d7f]+/g, " ")
    .trim();
}

function tokenize(values) {
  return Array.from(
    new Set(
      values
        .flatMap((value) => normalizeText(value).split(/\s+/))
        .map((term) => term.trim())
        .filter(Boolean),
    ),
  );
}

function flattenNames(group) {
  return Object.values(group ?? {}).flatMap((items) => (Array.isArray(items) ? items : []));
}

function buildSearchTerms(plant) {
  return tokenize([
    plant.id,
    plant.scientific_name,
    plant.common_name?.en,
    plant.common_name?.ml,
    ...flattenNames(plant.other_names?.en),
    ...flattenNames(plant.other_names?.ml),
    plant.family?.en,
    plant.family?.ml,
    plant.overview?.en,
    plant.overview?.ml,
    plant.plant_characteristics?.en,
    plant.plant_characteristics?.ml,
    plant.habitat?.en,
    plant.habitat?.ml,
    plant.medicinal_properties?.en,
    plant.medicinal_properties?.ml,
    ...(plant.medicinal_uses?.en ?? []),
    ...(plant.medicinal_uses?.ml ?? []),
    ...(plant.treatments ?? []).flatMap((item) => [
      item.condition?.en,
      item.condition?.ml,
      item.remedy?.en,
      item.remedy?.ml,
    ]),
  ]);
}

function enrichPlantDocument(plant) {
  return {
    ...plant,
    image: {
      src: "",
      alt: {
        en: `${plant.common_name?.en ?? plant.scientific_name} plant`,
        ml: `${plant.common_name?.ml ?? plant.scientific_name} സസ്യം`,
      },
    },
    icon: "🌿",
    published: true,
    search_index: {
      terms: buildSearchTerms(plant),
    },
    updated_at: new Date().toISOString(),
  };
}

function toFirestoreValue(value) {
  if (value === null) {
    return { nullValue: null };
  }

  if (Array.isArray(value)) {
    return {
      arrayValue: {
        values: value.map((item) => toFirestoreValue(item)),
      },
    };
  }

  switch (typeof value) {
    case "string":
      return { stringValue: value };
    case "boolean":
      return { booleanValue: value };
    case "number":
      if (Number.isInteger(value)) {
        return { integerValue: String(value) };
      }
      return { doubleValue: value };
    case "object":
      return {
        mapValue: {
          fields: Object.fromEntries(
            Object.entries(value).map(([key, entry]) => [key, toFirestoreValue(entry)]),
          ),
        },
      };
    default:
      return { stringValue: String(value) };
  }
}

function getAccessToken() {
  const raw = execFileSync("npx", ["firebase-tools", "login:list", "--json"], {
    cwd: path.dirname(__dirname),
    encoding: "utf8",
  });
  const payload = JSON.parse(raw);
  const token = payload?.result?.[0]?.tokens?.access_token;

  if (!token) {
    throw new Error("No Firebase access token available from firebase-tools login:list.");
  }

  return token;
}

async function upsertPlantDocument(token, plant) {
  const endpoint = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/${databaseId}/documents/plants/${plant.id}`;
  const response = await fetch(endpoint, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      fields: Object.fromEntries(
        Object.entries(enrichPlantDocument(plant)).map(([key, value]) => [key, toFirestoreValue(value)]),
      ),
    }),
  });

  if (!response.ok) {
    const details = await response.text();
    throw new Error(`Failed to upsert ${plant.id}: ${response.status} ${details}`);
  }
}

async function run() {
  const token = getAccessToken();
  const entries = await readdir(seedDirectory);
  const files = entries.filter((entry) => entry.endsWith(".json"));

  for (const file of files) {
    const source = await readFile(path.join(seedDirectory, file), "utf8");
    const plant = JSON.parse(source);
    await upsertPlantDocument(token, plant);
    console.log(`Seeded plants/${plant.id}`);
  }
}

run().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
