import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  onSnapshot,
  serverTimestamp,
  setDoc,
} from "firebase/firestore";
import { db } from "./firebase";

export function normalizeText(value) {
  return String(value ?? "").toLowerCase().trim();
}

function uniqueTerms(values) {
  return Array.from(new Set(values.filter(Boolean)));
}

function flattenLocalizedNames(value) {
  return Object.values(value ?? {}).flatMap((items) => (Array.isArray(items) ? items : []));
}

function getLocalizedText(value, language) {
  return value?.[language] ?? "";
}

export function localizePlant(plant, language) {
  const treatments = (plant.treatments ?? [])
    .map((entry) => ({
      condition: getLocalizedText(entry.condition, language),
      remedy: getLocalizedText(entry.remedy, language),
    }))
    .filter((entry) => entry.condition || entry.remedy);

  const constituentsMap = plant.chemical_constituents?.[language] ?? {};
  const constituents = Object.entries(constituentsMap).map(([part, description]) => ({
    part,
    description,
  }));

  return {
    slug: plant.id,
    icon: plant.icon ?? "🌿",
    image: {
      src: plant.image?.src ?? "",
      alt:
        plant.image?.alt?.[language] ??
        getLocalizedText(plant.common_name, language) ??
        plant.scientific_name,
    },
    name: getLocalizedText(plant.common_name, language) || plant.scientific_name,
    scientific: plant.scientific_name ?? "",
    family: getLocalizedText(plant.family, language),
    aliases: flattenLocalizedNames(plant.other_names?.[language]),
    teaser: getLocalizedText(plant.overview, language),
    summary:
      getLocalizedText(plant.overview, language) ||
      getLocalizedText(plant.medicinal_properties, language) ||
      getLocalizedText(plant.plant_characteristics, language),
    overview: getLocalizedText(plant.overview, language),
    characteristics: getLocalizedText(plant.plant_characteristics, language),
    habitat: getLocalizedText(plant.habitat, language),
    properties: getLocalizedText(plant.medicinal_properties, language),
    parts: constituents.map((entry) => entry.part),
    uses: plant.medicinal_uses?.[language] ?? [],
    symptoms: uniqueTerms(treatments.map((entry) => entry.condition)),
    diseases: plant.medicinal_uses?.[language] ?? [],
    remedies: treatments.map((entry) => entry.remedy).filter(Boolean),
    treatments,
    constituents,
  };
}

function findHits(values, query) {
  if (!query) {
    return [];
  }

  return values.filter((value) => normalizeText(value).includes(query));
}

export function getSearchResult(plant, query) {
  const hits = {
    names: [],
    conditions: [],
    uses: [],
    remedies: [],
    context: [],
  };

  let score = 1;

  if (query) {
    hits.names = findHits([plant.name, plant.scientific, plant.family, ...plant.aliases], query);
    hits.conditions = findHits(plant.symptoms, query);
    hits.uses = findHits(plant.uses, query);
    hits.remedies = findHits(plant.remedies, query);
    hits.context = findHits(
      [
        plant.teaser,
        plant.summary,
        plant.overview,
        plant.characteristics,
        plant.habitat,
        plant.properties,
        ...plant.constituents.flatMap((entry) => [entry.part, entry.description]),
      ],
      query,
    );

    const weightedScores = {
      names: 60,
      conditions: 44,
      uses: 40,
      remedies: 24,
      context: 14,
    };

    score = Object.keys(weightedScores).reduce((total, bucket) => {
      const bucketHits = hits[bucket];
      if (!bucketHits.length) {
        return total;
      }

      return total + weightedScores[bucket] + bucketHits.length;
    }, 0);

    if (score === 0) {
      return null;
    }
  }

  const previewChips = uniqueTerms([
    ...hits.conditions,
    ...hits.uses,
    ...(hits.names.length ? hits.names : []),
    ...plant.symptoms.slice(0, 3),
    ...plant.uses.slice(0, 2),
  ]).slice(0, 5);

  return { plant, score, hits, previewChips };
}

export function getTopTerms(plants, field, limit = 6) {
  const counts = new Map();

  plants.forEach((plant) => {
    plant[field].forEach((term) => {
      const value = String(term ?? "").trim();
      if (!value) {
        return;
      }

      counts.set(value, (counts.get(value) ?? 0) + 1);
    });
  });

  return Array.from(counts.entries())
    .sort((left, right) => {
      if (right[1] !== left[1]) {
        return right[1] - left[1];
      }

      return left[0].localeCompare(right[0]);
    })
    .slice(0, limit)
    .map(([term]) => term);
}

export async function fetchPlantsFromFirestore() {
  const snapshot = await getDocs(collection(db, "plants"));
  return snapshot.docs
    .map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }))
    .sort((left, right) => {
      const leftName = left.common_name?.en ?? left.scientific_name ?? left.id;
      const rightName = right.common_name?.en ?? right.scientific_name ?? right.id;
      return leftName.localeCompare(rightName);
    });
}

export function watchFavoritePlantIds(userId, onChange, onError) {
  return onSnapshot(
    collection(db, "users", userId, "favorites"),
    (snapshot) => {
      onChange(snapshot.docs.map((entry) => entry.id));
    },
    onError,
  );
}

export async function saveFavoritePlant(userId, plantId) {
  await setDoc(doc(db, "users", userId, "favorites", plantId), {
    plantId,
    savedAt: serverTimestamp(),
  });
}

export async function removeFavoritePlant(userId, plantId) {
  await deleteDoc(doc(db, "users", userId, "favorites", plantId));
}

export async function savePlantRecord(record) {
  await setDoc(doc(db, "plants", record.id), record);
}
