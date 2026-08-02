import { onAuthStateChanged } from "firebase/auth";
import { useDeferredValue, useEffect, useState } from "react";
import { auth, signInWithGoogle, signOutUser } from "./lib/firebase";
import {
  fetchPlantsFromFirestore,
  getSearchResult,
  getTopTerms,
  localizePlant,
  normalizeText,
  removeFavoritePlant,
  savePlantRecord,
  saveFavoritePlant,
  watchFavoritePlantIds,
} from "./lib/plants";

const MOBILE_APP_BREAKPOINT = 720;
const ADMIN_EMAIL = "ajyghosh@gmail.com";

const content = {
  ml: {
    brandTitle: "Nattuvaidyam",
    brandSubheading: "Healing Through Nature",
    nav: [
      { key: "home", label: "ഹോം" },
      { key: "plants", label: "തിരയൽ" },
      { key: "saved", label: "സേവ്" },
      { key: "me", label: "ഞാൻ" },
    ],
    languageOptions: {
      ml: "മ",
      en: "EN",
    },
    hero: {
      eyebrow: "ഔഷധസസ്യങ്ങളെ കണ്ടെത്താം",
      title: "കേരളത്തിന്റെ ഔഷധ സസ്യങ്ങളെ ഒരിടത്ത് കണ്ടെത്തൂ",
      description:
        "രോഗം, ലക്ഷണം, അല്ലെങ്കിൽ സസ്യത്തിന്റെ പേര് ഉപയോഗിച്ച് കേരളത്തിലെ ഔഷധസസ്യങ്ങളെ തിരയൂ. പരമ്പരാഗത അറിവുകൾ ക്രമബദ്ധമായും എളുപ്പത്തിൽ പരിശോധിക്കാവുന്ന രീതിയിലും ഇവിടെ കണ്ടെത്താം.",
      placeholder: "ഉദാ: ചുമ, പ്രമേഹം, ദഹനപ്രശ്നങ്ങൾ",
      mobileSearchLabel: "സസ്യങ്ങൾ, ലക്ഷണങ്ങൾ, രോഗങ്ങൾ തിരയുക",
      buttonLabel: "തിരയുക",
      quickTags: ["ചുമ", "പനി", "ത്വക്ക് പ്രശ്നങ്ങൾ", "പ്രമേഹം"],
    },
    featured: {
      kicker: "ഹോം ഹൈലൈറ്റുകൾ",
      title: "ഏറ്റവും ജനപ്രിയ സസ്യം",
      description:
        "പിന്നീട് വീണ്ടും കാണാനായി പലരും save ചെയ്യുന്ന ഒരു പ്രധാന സസ്യം.",
      popularLabel: "ഏറ്റവും ജനപ്രിയം",
      exploreLabel: "തുറക്കുക",
      savedRailLabel: "കൂടുതൽ save ചെയ്ത സസ്യങ്ങൾ",
      noPlantsLabel: "സസ്യങ്ങൾ ഉടൻ വരുന്നു",
    },
    browse: {
      eyebrow: "വിഭാഗങ്ങൾ പരിശോധിക്കാം",
      title: "പരിശോധിക്കുക",
      items: [
        {
          icon: "🌿",
          title: "ഔഷധസസ്യങ്ങൾ",
          description:
            "മലയാള പേരുകളോടും പരമ്പരാഗത ഉപയോഗങ്ങളോടും കൂടിയ സസ്യങ്ങളെ ഒരിടത്ത് പരിശോധിക്കാം.",
        },
        {
          icon: "🩺",
          title: "രോഗങ്ങൾ",
          description:
            "സാധാരണ ആരോഗ്യപ്രശ്നങ്ങളുമായി ബന്ധപ്പെട്ട് ഉപയോഗിച്ചിരുന്ന സസ്യങ്ങളെ കണ്ടെത്താം.",
        },
        {
          icon: "💊",
          title: "ലക്ഷണങ്ങൾ",
          description:
            "ചുമ, പനി, തലവേദന പോലുള്ള ലക്ഷണങ്ങൾ അടിസ്ഥാനമാക്കി തിരയാം.",
        },
        {
          icon: "🍵",
          title: "ഗൃഹചികിത്സകൾ",
          description:
            "പരമ്പരാഗത തയ്യാറാക്കൽ രീതികളും ഉപയോഗശ്രദ്ധകളും പരിശോധിക്കാം.",
        },
      ],
    },
    plants: {
      eyebrow: "ജനപ്രിയ ഔഷധസസ്യങ്ങൾ",
      title: "ജനപ്രിയ സസ്യങ്ങൾ",
    },
    saved: {
      title: "സേവ് ചെയ്ത സസ്യങ്ങൾ",
      searchPlaceholder: "സേവ് ചെയ്ത സസ്യങ്ങൾ തിരയൂ",
      clearSearch: "നീക്കുക",
      signedOutTitle: "സേവ് ചെയ്യാൻ സൈൻ ഇൻ ചെയ്യൂ",
      signedOutDescription:
        "ഇഷ്ടമായ സസ്യങ്ങൾ പിന്നീട് എളുപ്പത്തിൽ കാണാൻ Google ഉപയോഗിച്ച് സൈൻ ഇൻ ചെയ്യൂ.",
      emptyTitle: "ഇനിയും സേവ് ചെയ്ത സസ്യങ്ങൾ ഇല്ല",
      emptyDescription: "ഒരു സസ്യം തുറന്ന് save ചെയ്താൽ ഇവിടെ കാണാം.",
      noMatchTitle: "തിരച്ചിലിനൊത്ത സസ്യങ്ങൾ ഇല്ല",
      noMatchDescription: "മറ്റൊരു പേര്, രോഗം, അല്ലെങ്കിൽ scientific name ഉപയോഗിച്ച് ശ്രമിക്കൂ.",
      countLabel: "saved plants",
    },
    me: {
      title: "എന്റെ അക്കൗണ്ട്",
      signedOutTitle: "Google ഉപയോഗിച്ച് സൈൻ ഇൻ ചെയ്യൂ",
      signedOutDescription:
        "സേവ് ചെയ്ത സസ്യങ്ങൾ, പിന്നീട് കാണേണ്ട പട്ടിക, personal access എന്നിവയ്ക്കായി സൈൻ ഇൻ ചെയ്യൂ.",
      signedInTitle: "നിങ്ങൾ സൈൻ ഇൻ ചെയ്തിരിക്കുന്നു",
      signedInDescription: "സേവ് ചെയ്ത സസ്യങ്ങൾ നിങ്ങളുടെ അക്കൗണ്ടിൽ നിലനിർത്താം.",
      signIn: "Google ഉപയോഗിച്ച് സൈൻ ഇൻ",
      signOut: "സൈൻ ഔട്ട്",
      favoritesLabel: "സേവ് ചെയ്ത സസ്യങ്ങൾ",
      note: "നിങ്ങൾ save ചെയ്യുന്ന സസ്യങ്ങൾ പിന്നീട് എളുപ്പത്തിൽ വീണ്ടും കാണാനായി നിങ്ങളുടെ അക്കൗണ്ടിൽ സൂക്ഷിക്കും.",
    },
    stats: {
      eyebrow: "വളരുന്ന അറിവുകളുടെ ശേഖരം",
      title: "അറിവുകളുടെ ശേഖരം",
      items: [
        { key: "plants", label: "സസ്യങ്ങൾ" },
        { key: "diseases", label: "രോഗങ്ങൾ" },
        { key: "remedies", label: "ഗൃഹചികിത്സകൾ" },
        { key: "languages", label: "ഭാഷകൾ" },
      ],
    },
    library: {
      searchPlaceholder: "സസ്യനാമം, രോഗം, ലക്ഷണം, remedy, scientific name...",
      mobileSearchLabel: "സസ്യം, ലക്ഷണം, രോഗം എന്നിവ തിരയുക",
      filterTitle: "വേഗത്തിലുള്ള ഫിൽട്ടറുകൾ",
      filterButtonLabel: "ഫിൽട്ടറുകൾ",
      filterButtonCompact: "ഫിൽട്ടർ",
      quickSymptomsTitle: "വേഗത്തിലുള്ള ലക്ഷണങ്ങൾ",
      quickDiseasesTitle: "വേഗത്തിലുള്ള രോഗങ്ങൾ",
      clearAll: "എല്ലാം നീക്കുക",
      listTitle: "തിരച്ചിൽ ഫലങ്ങൾ",
      detailTitle: "തിരഞ്ഞെടുത്ത സസ്യം",
      closeDetail: "അടയ്ക്കുക",
      openLabel: "വിശദാംശങ്ങൾ",
      shareLabel: "ഷെയർ",
      sharedLabel: "ഷെയർ ചെയ്തു",
      copiedLabel: "കോപ്പിയായി",
      saveLabel: "സേവ്",
      savedLabel: "സേവ് ചെയ്തു",
      signInToSave: "സേവ് ചെയ്യാൻ സൈൻ ഇൻ",
      allResultsLabel: "ഫലങ്ങൾ",
      filtersCountLabel: "ഫിൽട്ടറുകൾ",
      activeFilterLabel: "ഫിൽട്ടർ സജീവമാണ്",
      activeFiltersLabel: "ഫിൽട്ടറുകൾ സജീവമാണ്",
      emptyTitle: "ഫലങ്ങൾ ലഭിച്ചില്ല",
      emptyDescription:
        "മറ്റൊരു spelling ശ്രമിക്കുകയോ filters clear ചെയ്യുകയോ ചെയ്യൂ. വലിയ dataset-ലും തിരച്ചിൽ സഹായിക്കാൻ ഈ പേജ് query-based filtering ഉപയോഗിക്കുന്നു.",
      loadingTitle: "സസ്യങ്ങൾ ലോഡ് ചെയ്യുന്നു",
      loadingDescription: "Firestore-ൽ നിന്ന് ഔഷധസസ്യങ്ങൾ കൊണ്ടുവരുന്നു.",
      errorTitle: "ഡാറ്റ ലഭ്യമാക്കാനായില്ല",
      errorDescription: "Firestore connection വീണ്ടും പരിശോധിച്ച് കുറച്ച് നേരം കഴിഞ്ഞ് ശ്രമിക്കൂ.",
      noCatalogTitle: "ഇനിയും സസ്യങ്ങൾ ചേർത്തിട്ടില്ല",
      noCatalogDescription: "Firestore-യിലെ plants collection-ലേക്ക് data ചേർത്താൽ ഇവിടെ ഫലങ്ങൾ കാണിക്കും.",
      labels: {
        scientific: "ശാസ്ത്രീയ നാമം",
        family: "കുടുംബം",
        imageFallback: "ചിത്രം ചേർക്കാനുള്ള സ്ഥലം",
        aliases: "മറ്റു പേരുകൾ",
        parts: "ഉപയോഗിക്കുന്ന ഭാഗങ്ങൾ",
        uses: "ഔഷധ ഉപയോഗങ്ങൾ",
        symptoms: "ലക്ഷണങ്ങൾ",
        diseases: "രോഗങ്ങൾ",
        remedies: "ചികിത്സാവിധികൾ",
        overview: "അവലോകനം",
        characteristics: "സസ്യ സ്വഭാവം",
        habitat: "വളരുന്ന സ്ഥലം",
        properties: "ഔഷധഗുണങ്ങൾ",
        constituents: "രാസഘടകങ്ങൾ",
        treatments: "പരമ്പരാഗത ചികിത്സകൾ",
      },
    },
    footerLabel: "അറിയിപ്പ്",
    footer:
      "ഈ വെബ്സൈറ്റ് വിദ്യാഭ്യാസ ആവശ്യങ്ങൾക്കായാണ്. ചികിത്സയ്ക്കായി ഔഷധസസ്യങ്ങൾ ഉപയോഗിക്കുന്നതിന് മുമ്പ് യോഗ്യനായ ആരോഗ്യവിദഗ്ധന്റെ ഉപദേശം തേടുക.",
  },
  en: {
    brandTitle: "Nattuvaidyam",
    brandSubheading: "Healing Through Nature",
    nav: [
      { key: "home", label: "Home" },
      { key: "plants", label: "Search" },
      { key: "saved", label: "Saved" },
      { key: "me", label: "Me" },
    ],
    languageOptions: {
      ml: "മ",
      en: "EN",
    },
    hero: {
      eyebrow: "Medicinal plant discovery",
      title: "Discover Kerala's medicinal plants in one place",
      description:
        "Search Kerala's medicinal plants using a disease, symptom, or plant name. Explore traditional knowledge in a clean and easy-to-browse format.",
      placeholder: "Search by cough, diabetes, digestion, skin care",
      mobileSearchLabel: "Search plants, symptoms, diseases",
      buttonLabel: "Search",
      quickTags: ["Cough", "Fever", "Skin care", "Diabetes"],
    },
    featured: {
      kicker: "Home highlights",
      title: "Most popular plant",
      description:
        "Frequently saved for its traditional uses.",
      popularLabel: "Most popular",
      exploreLabel: "Open plant",
      savedRailLabel: "More saved plants",
      noPlantsLabel: "Plants coming soon",
    },
    browse: {
      eyebrow: "Explore the directory",
      title: "Browse",
      items: [
        {
          icon: "🌿",
          title: "Medicinal Plants",
          description:
            "Browse plants with Malayalam names, traditional uses, and essential preparation notes.",
        },
        {
          icon: "🩺",
          title: "Diseases",
          description:
            "Find plants traditionally associated with recurring health concerns and conditions.",
        },
        {
          icon: "💊",
          title: "Symptoms",
          description:
            "Search by symptoms such as cough, fever, headache, or fatigue for faster discovery.",
        },
        {
          icon: "🍵",
          title: "Home Remedies",
          description:
            "Explore simple preparation methods, remedy formats, and important usage precautions.",
        },
      ],
    },
    plants: {
      eyebrow: "Popular herbs",
      title: "Popular Plants",
    },
    saved: {
      title: "Saved plants",
      searchPlaceholder: "Search saved plants",
      clearSearch: "Clear",
      signedOutTitle: "Sign in to save plants",
      signedOutDescription:
        "Use Google sign-in to keep favorite plants and come back to them later.",
      emptyTitle: "No saved plants yet",
      emptyDescription: "Open any plant and save it to build your personal list.",
      noMatchTitle: "No saved plants match this search",
      noMatchDescription: "Try another plant name, disease, or scientific name.",
      countLabel: "saved plants",
    },
    me: {
      title: "My account",
      signedOutTitle: "Sign in with Google",
      signedOutDescription:
        "Sign in to save favorite plants and keep a personal medicinal plant list.",
      signedInTitle: "You are signed in",
      signedInDescription: "Your saved plants stay linked to this Google account.",
      signIn: "Continue with Google",
      signOut: "Sign out",
      favoritesLabel: "Saved plants",
      note: "Plants you save stay available in your account so you can come back to them later.",
    },
    stats: {
      eyebrow: "Growing knowledge base",
      title: "Knowledge Base",
      items: [
        { key: "plants", label: "Plants" },
        { key: "diseases", label: "Diseases" },
        { key: "remedies", label: "Home Remedies" },
        { key: "languages", label: "Languages" },
      ],
    },
    library: {
      searchPlaceholder:
        "Search by plant name, disease, symptom, remedy, or scientific name...",
      mobileSearchLabel: "Search plants, symptoms, diseases",
      filterTitle: "Quick filters",
      filterButtonLabel: "Filters",
      filterButtonCompact: "Filter",
      quickSymptomsTitle: "Quick symptoms",
      quickDiseasesTitle: "Quick diseases",
      clearAll: "Clear all",
      listTitle: "Search results",
      detailTitle: "Selected plant",
      closeDetail: "Close",
      openLabel: "View details",
      shareLabel: "Share",
      sharedLabel: "Shared",
      copiedLabel: "Copied",
      saveLabel: "Save",
      savedLabel: "Saved",
      signInToSave: "Sign in to save",
      allResultsLabel: "results",
      filtersCountLabel: "filters",
      activeFilterLabel: "active filter",
      activeFiltersLabel: "active filters",
      emptyTitle: "No matching plants found",
      emptyDescription:
        "Try another spelling or clear your filters. The catalog search is designed to support larger datasets with layered filtering.",
      loadingTitle: "Loading plants",
      loadingDescription: "Fetching medicinal plant records from Firestore.",
      errorTitle: "Could not load the catalog",
      errorDescription: "Check the Firestore connection and try again.",
      noCatalogTitle: "No plants added yet",
      noCatalogDescription: "Add records to the Firestore plants collection and they will appear here.",
      labels: {
        scientific: "Scientific name",
        family: "Family",
        imageFallback: "Plant image placeholder",
        aliases: "Other names",
        parts: "Parts referenced",
        uses: "Medicinal uses",
        symptoms: "Conditions",
        diseases: "Uses",
        remedies: "Remedies",
        overview: "Overview",
        characteristics: "Plant characteristics",
        habitat: "Habitat",
        properties: "Medicinal properties",
        constituents: "Chemical constituents",
        treatments: "Traditional treatments",
      },
    },
    footerLabel: "Disclaimer",
    footer:
      "This website is intended for educational purposes. Always consult a qualified healthcare professional before using medicinal plants for treatment.",
  },
};

const desktopContent = {
  brandTitle: "Nattuvaidyam",
  brandSubheading: "Healing Through Nature",
  cta: "Open on mobile",
  hero: {
    eyebrow: "",
    title: "Explore Nattuvaidyam, Kerala's medicinal plant website",
    description:
      "The full plant search, symptom discovery, and remedy browsing experience is available only on mobile. Use your phone browser to explore the complete catalog.",
    searchPlaceholder: "Search by plant name, symptom, disease, or remedy",
    searchButton: "Search",
    quickTags: ["Cough", "Skin care", "Digestion", "Fever"],
  },
  info: [
    {
      title: "Built for mobile use",
      description:
        "The interface is optimized for quick searches, plant cards, and readable remedy details on smaller screens.",
    },
    {
      title: "Better field access",
      description:
        "Open the site on your phone while travelling, visiting nurseries, or checking remedies at home.",
    },
    {
      title: "Full search only on phone",
      description:
        "Search across plant names, symptoms, diseases, and remedy formats from the mobile experience.",
    },
  ],
  featured: {
    kicker: "What you get on mobile",
    title: "Fast search, clean plant cards, and full remedy detail",
    points: [
      "Search by plant name, symptom, disease, or remedy format",
      "Browse plant cards with images and essential information",
      "Open structured details for preparation, caution, and parts used",
    ],
  },
  prompt: {
    title: "Open Nattuvaidyam on your mobile browser",
    description:
      "The searchable medicinal plant catalog is now available only on mobile. Please open this site on your phone for the full experience.",
    notes: [
      "Use Chrome, Safari, or any modern mobile browser",
      "You will get the complete plant search and detail flow",
      "Desktop and tablet browsing now show only this information page",
    ],
    button: "Close",
  },
  footerLabel: "Disclaimer",
  footer:
    "This website is intended for educational purposes. Always consult a qualified healthcare professional before using medicinal plants for treatment.",
};

const navIcons = {
  home: "⌂",
  plants: "🌿",
  saved: "★",
  me: "◎",
};

function getInitialAppState() {
  if (typeof window === "undefined") {
    return {
      language: "en",
      page: "home",
      catalogSeed: { query: "", openDetail: false },
      selectedPlantSlug: null,
    };
  }

  const pathname = window.location.pathname.replace(/\/+$/, "") || "/";
  if (pathname === "/admin") {
    return {
      language: "en",
      page: "admin",
      catalogSeed: { query: "", openDetail: false },
      selectedPlantSlug: null,
    };
  }

  const params = new URLSearchParams(window.location.search);
  const language = params.get("lang") === "ml" ? "ml" : "en";
  const requestedPage = params.get("page");
  const query = params.get("q")?.trim() ?? "";
  const selectedPlantSlug = params.get("plant")?.trim() || null;
  const page = ["home", "plants", "saved", "me"].includes(requestedPage)
    ? requestedPage
    : selectedPlantSlug || query
      ? "plants"
      : "home";

  return {
    language,
    page,
    catalogSeed: {
      query,
      openDetail: Boolean(selectedPlantSlug),
    },
    selectedPlantSlug,
  };
}

function buildAppUrl({ language, page, query = "", plantSlug = null }) {
  if (typeof window === "undefined") {
    return "";
  }

  const url = new URL(window.location.href);
  const pathname = page === "admin" ? "/admin" : "/";

  url.searchParams.delete("lang");
  url.searchParams.delete("page");
  url.searchParams.delete("q");
  url.searchParams.delete("plant");

  if (language === "ml") {
    url.searchParams.set("lang", language);
  }

  if (page && page !== "home") {
    url.searchParams.set("page", page);
  }

  if (page === "plants") {
    if (query.trim()) {
      url.searchParams.set("q", query.trim());
    }

    if (plantSlug) {
      url.searchParams.set("plant", plantSlug);
    }
  }

  url.pathname = pathname;
  url.hash = "";
  return `${url.origin}${url.pathname}${url.search}`;
}

function createEmptyAliasRow() {
  return {
    category: "sanskrit",
    en: "",
    ml: "",
  };
}

function createEmptyConstituentRow() {
  return {
    partEn: "",
    descriptionEn: "",
    partMl: "",
    descriptionMl: "",
  };
}

function createEmptyTreatmentRow() {
  return {
    conditionEn: "",
    conditionMl: "",
    remedyEn: "",
    remedyMl: "",
  };
}

function createEmptyAdminForm() {
  return {
    id: "",
    scientificName: "",
    icon: "🌿",
    commonNameEn: "",
    commonNameMl: "",
    familyEn: "",
    familyMl: "",
    overviewEn: "",
    overviewMl: "",
    medicinalUsesEn: "",
    medicinalUsesMl: "",
    characteristicsEn: "",
    characteristicsMl: "",
    habitatEn: "",
    habitatMl: "",
    medicinalPropertiesEn: "",
    medicinalPropertiesMl: "",
    imageUrl: "",
    imageAltEn: "",
    imageAltMl: "",
    imageFileDataUrl: "",
    aliases: [createEmptyAliasRow()],
    constituents: [createEmptyConstituentRow()],
    treatments: [createEmptyTreatmentRow()],
  };
}

function slugifyPlantId(value) {
  return String(value ?? "")
    .toLowerCase()
    .trim()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function parseListText(value) {
  return String(value ?? "")
    .split(/\n|,/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(new Error("Could not read the image file."));
    reader.readAsDataURL(file);
  });
}

function buildPlantRecordFromForm(form) {
  const id =
    slugifyPlantId(form.id) ||
    slugifyPlantId(form.commonNameEn) ||
    slugifyPlantId(form.scientificName);
  const imageSrc = form.imageFileDataUrl || form.imageUrl.trim();

  const otherNamesEn = {};
  const otherNamesMl = {};

  form.aliases.forEach((row) => {
    const category = row.category.trim();
    const enValues = parseListText(row.en);
    const mlValues = parseListText(row.ml);

    if (!category || (!enValues.length && !mlValues.length)) {
      return;
    }

    if (enValues.length) {
      otherNamesEn[category] = enValues;
    }

    if (mlValues.length) {
      otherNamesMl[category] = mlValues;
    }
  });

  const constituentsEn = {};
  const constituentsMl = {};

  form.constituents.forEach((row) => {
    const partEn = row.partEn.trim();
    const descriptionEn = row.descriptionEn.trim();
    const partMl = row.partMl.trim();
    const descriptionMl = row.descriptionMl.trim();

    if (partEn && descriptionEn) {
      constituentsEn[partEn] = descriptionEn;
    }

    if (partMl && descriptionMl) {
      constituentsMl[partMl] = descriptionMl;
    }
  });

  const treatments = form.treatments
    .map((row) => ({
      condition: {
        en: row.conditionEn.trim(),
        ml: row.conditionMl.trim(),
      },
      remedy: {
        en: row.remedyEn.trim(),
        ml: row.remedyMl.trim(),
      },
    }))
    .filter(
      (row) =>
        row.condition.en || row.condition.ml || row.remedy.en || row.remedy.ml,
    );

  return {
    id,
    scientific_name: form.scientificName.trim(),
    family: {
      en: form.familyEn.trim(),
      ml: form.familyMl.trim(),
    },
    common_name: {
      en: form.commonNameEn.trim(),
      ml: form.commonNameMl.trim(),
    },
    other_names: {
      en: otherNamesEn,
      ml: otherNamesMl,
    },
    overview: {
      en: form.overviewEn.trim(),
      ml: form.overviewMl.trim(),
    },
    medicinal_uses: {
      en: parseListText(form.medicinalUsesEn),
      ml: parseListText(form.medicinalUsesMl),
    },
    plant_characteristics: {
      en: form.characteristicsEn.trim(),
      ml: form.characteristicsMl.trim(),
    },
    habitat: {
      en: form.habitatEn.trim(),
      ml: form.habitatMl.trim(),
    },
    medicinal_properties: {
      en: form.medicinalPropertiesEn.trim(),
      ml: form.medicinalPropertiesMl.trim(),
    },
    chemical_constituents: {
      en: constituentsEn,
      ml: constituentsMl,
    },
    treatments,
    ...(form.icon.trim() ? { icon: form.icon.trim() } : {}),
    ...(imageSrc
      ? {
          image: {
            src: imageSrc,
            alt: {
              en: form.imageAltEn.trim() || form.commonNameEn.trim(),
              ml: form.imageAltMl.trim() || form.commonNameMl.trim(),
            },
          },
        }
      : {}),
  };
}

function validatePlantRecord(record) {
  const errors = [];

  if (!record.id) {
    errors.push("Plant ID is required.");
  }

  if (!record.scientific_name) {
    errors.push("Scientific name is required.");
  }

  if (!record.common_name?.en || !record.common_name?.ml) {
    errors.push("Common name is required in both English and Malayalam.");
  }

  if (!record.overview?.en || !record.overview?.ml) {
    errors.push("Overview is required in both English and Malayalam.");
  }

  if (!record.family?.en || !record.family?.ml) {
    errors.push("Family is required in both English and Malayalam.");
  }

  return errors;
}

function normalizeImportedPlantRecord(record) {
  const id =
    record.id ||
    slugifyPlantId(record.common_name?.en) ||
    slugifyPlantId(record.scientific_name);

  return {
    ...record,
    id,
  };
}

function getSavedCountValue(plant) {
  const candidates = [
    plant.saved_count,
    plant.savedCount,
    plant.favorite_count,
    plant.favoriteCount,
    plant.metrics?.saved_count,
    plant.metrics?.favorite_count,
    plant.stats?.saved_count,
    plant.stats?.favorite_count,
  ];

  const value = candidates.find((entry) => Number.isFinite(entry));
  return typeof value === "number" ? value : 0;
}

function getLocalizedKeys(value) {
  return Object.entries(value ?? {})
    .filter(([, entry]) => typeof entry === "string" || Array.isArray(entry) || entry)
    .map(([key]) => key);
}

function getKnowledgeStats(plants) {
  const diseaseTerms = new Set();
  const languageKeys = new Set();
  let remedies = 0;

  plants.forEach((plant) => {
    [
      plant.common_name,
      plant.family,
      plant.overview,
      plant.plant_characteristics,
      plant.habitat,
      plant.medicinal_properties,
      plant.medicinal_uses,
      plant.chemical_constituents,
    ].forEach((field) => {
      getLocalizedKeys(field).forEach((key) => languageKeys.add(key));
    });

    Object.values(plant.medicinal_uses ?? {}).forEach((items) => {
      (Array.isArray(items) ? items : []).forEach((item) => {
        const value = String(item ?? "").trim();
        if (value) {
          diseaseTerms.add(value);
        }
      });
    });

    remedies += Array.isArray(plant.treatments) ? plant.treatments.length : 0;
  });

  return {
    plants: plants.length,
    diseases: diseaseTerms.size,
    remedies,
    languages: languageKeys.size,
  };
}

function Header({ copy, page, language, onNavigate, onLanguageChange, isScrolled }) {
  return (
    <header className={isScrolled ? "site-header is-scrolled" : "site-header"}>
      <div className="brand">
        <img
          className="brand-logo-image"
          src="/medlogo.png"
          alt={copy.brandTitle}
        />
        <div className="brand-copy">
          <h1 className="brand-title">{copy.brandTitle}</h1>
          <p className="brand-kicker">{copy.brandSubheading}</p>
        </div>
      </div>

      <div className="header-actions">
        <nav className="site-nav" aria-label="Primary">
          {copy.nav.map((item) => (
            <button
              key={item.key}
              type="button"
              className={item.key === page ? "nav-button is-active" : "nav-button"}
              onClick={() => onNavigate(item.key)}
            >
              {item.label}
            </button>
          ))}
        </nav>

        <div className="language-switcher">
          <div className="language-toggle" role="tablist" aria-label="Language switcher">
            {Object.entries(copy.languageOptions).map(([value, label]) => (
              <button
                key={value}
                type="button"
                className={value === language ? "toggle-chip is-active" : "toggle-chip"}
                onClick={() => onLanguageChange(value)}
                aria-pressed={value === language}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </header>
  );
}

function MobileNav({ copy, page, onNavigate }) {
  return (
    <nav className="mobile-nav" aria-label="Mobile primary">
      {copy.nav.map((item) => (
        <button
          key={item.key}
          type="button"
          className={item.key === page ? "mobile-nav-button is-active" : "mobile-nav-button"}
          onClick={() => onNavigate(item.key)}
        >
          <span className="mobile-nav-icon" aria-hidden="true">
            {navIcons[item.key]}
          </span>
          <span className="mobile-nav-label">{item.label}</span>
        </button>
      ))}
    </nav>
  );
}

function AuthPrompt({ title, description, actionLabel, onAction }) {
  return (
    <div className="empty-state-card auth-card">
      <h3>{title}</h3>
      <p>{description}</p>
      <button type="button" className="ghost-button auth-action-button" onClick={onAction}>
        {actionLabel}
      </button>
    </div>
  );
}

function AdminPage({ user, onSignIn, onSignOut, onPlantsChanged }) {
  const isAdmin = user?.email?.toLowerCase() === ADMIN_EMAIL;
  const [entryMode, setEntryMode] = useState("form");
  const [form, setForm] = useState(() => createEmptyAdminForm());
  const [jsonText, setJsonText] = useState("");
  const [jsonFileName, setJsonFileName] = useState("");
  const [feedback, setFeedback] = useState({ tone: "", message: "" });
  const [isSaving, setIsSaving] = useState(false);

  function updateFormField(key, value) {
    setForm((current) => ({
      ...current,
      [key]: value,
    }));
  }

  function updateArrayRow(key, index, field, value) {
    setForm((current) => ({
      ...current,
      [key]: current[key].map((row, rowIndex) =>
        rowIndex === index
          ? {
              ...row,
              [field]: value,
            }
          : row,
      ),
    }));
  }

  function addArrayRow(key, createRow) {
    setForm((current) => ({
      ...current,
      [key]: [...current[key], createRow()],
    }));
  }

  function removeArrayRow(key, index) {
    setForm((current) => ({
      ...current,
      [key]: current[key].length === 1 ? current[key] : current[key].filter((_, rowIndex) => rowIndex !== index),
    }));
  }

  async function handleImageUpload(event) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    try {
      const imageFileDataUrl = await readFileAsDataUrl(file);
      setForm((current) => ({
        ...current,
        imageFileDataUrl,
      }));
      setFeedback({ tone: "", message: "" });
    } catch (error) {
      setFeedback({
        tone: "error",
        message: error instanceof Error ? error.message : "Could not process the image.",
      });
    }
  }

  async function handleJsonFileUpload(event) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    try {
      const text = await file.text();
      setJsonText(text);
      setJsonFileName(file.name);
      setFeedback({ tone: "", message: "" });
    } catch {
      setFeedback({ tone: "error", message: "Could not read the JSON file." });
    }
  }

  async function handleManualSave() {
    const record = buildPlantRecordFromForm(form);
    const errors = validatePlantRecord(record);

    if (errors.length) {
      setFeedback({ tone: "error", message: errors[0] });
      return;
    }

    try {
      setIsSaving(true);
      await savePlantRecord(record);
      await onPlantsChanged();
      setForm(createEmptyAdminForm());
      setFeedback({ tone: "success", message: `Saved ${record.id} to Firestore.` });
    } catch (error) {
      setFeedback({
        tone: "error",
        message: error instanceof Error ? error.message : "Could not save this plant.",
      });
    } finally {
      setIsSaving(false);
    }
  }

  async function handleJsonSave() {
    try {
      setIsSaving(true);
      const parsed = JSON.parse(jsonText);
      const records = (Array.isArray(parsed) ? parsed : [parsed]).map(normalizeImportedPlantRecord);
      const firstError = records
        .map((record) => validatePlantRecord(record))
        .find((errors) => errors.length);

      if (firstError?.length) {
        setFeedback({ tone: "error", message: firstError[0] });
        return;
      }

      await Promise.all(records.map((record) => savePlantRecord(record)));
      await onPlantsChanged();
      setFeedback({
        tone: "success",
        message: `Saved ${records.length} plant record${records.length === 1 ? "" : "s"} from JSON.`,
      });
    } catch (error) {
      setFeedback({
        tone: "error",
        message: error instanceof Error ? error.message : "Could not import the JSON data.",
      });
    } finally {
      setIsSaving(false);
    }
  }

  if (!user) {
    return (
      <main className="admin-main">
        <section className="content-section admin-page-shell">
          <div className="admin-page-head">
            <div>
              <p className="eyebrow">Admin</p>
              <h2>Plant data manager</h2>
            </div>
          </div>
          <AuthPrompt
            title="Sign in to access admin"
            description="Only the authorized Google account can open this plant management page."
            actionLabel="Continue with Google"
            onAction={onSignIn}
          />
        </section>
      </main>
    );
  }

  if (!isAdmin) {
    return (
      <main className="admin-main">
        <section className="content-section admin-page-shell">
          <div className="admin-page-head">
            <div>
              <p className="eyebrow">Admin</p>
              <h2>Plant data manager</h2>
            </div>
            <button type="button" className="ghost-button" onClick={onSignOut}>
              Sign out
            </button>
          </div>
          <div className="empty-state-card admin-empty-card">
            <h3>Access denied</h3>
            <p>This page is restricted to {ADMIN_EMAIL}.</p>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="admin-main">
      <section className="content-section admin-page-shell">
        <div className="admin-page-head">
          <div>
            <p className="eyebrow">Admin</p>
            <h2>Plant data manager</h2>
            <p className="admin-supporting-copy">
              Add plants manually in English and Malayalam, upload an image, or import JSON that matches your Firestore schema.
            </p>
          </div>
          <div className="admin-head-actions">
            <div className="admin-account-chip">{user.email}</div>
            <button type="button" className="ghost-button" onClick={onSignOut}>
              Sign out
            </button>
          </div>
        </div>

        <div className="admin-mode-switch">
          <button
            type="button"
            className={entryMode === "form" ? "toggle-chip is-active" : "toggle-chip"}
            onClick={() => setEntryMode("form")}
          >
            Manual form
          </button>
          <button
            type="button"
            className={entryMode === "json" ? "toggle-chip is-active" : "toggle-chip"}
            onClick={() => setEntryMode("json")}
          >
            JSON upload
          </button>
        </div>

        {feedback.message ? (
          <div
            className={
              feedback.tone === "error" ? "admin-feedback is-error" : "admin-feedback is-success"
            }
          >
            {feedback.message}
          </div>
        ) : null}

        {entryMode === "form" ? (
          <div className="admin-panel-grid">
            <section className="admin-panel">
              <div className="admin-section-head">
                <h3>Core identity</h3>
              </div>
              <div className="admin-form-grid">
                <label className="admin-field">
                  <span>Plant ID</span>
                  <input
                    type="text"
                    value={form.id}
                    onChange={(event) => updateFormField("id", event.target.value)}
                    placeholder="sesbania-grandiflora"
                  />
                </label>
                <label className="admin-field">
                  <span>Scientific name</span>
                  <input
                    type="text"
                    value={form.scientificName}
                    onChange={(event) => updateFormField("scientificName", event.target.value)}
                    placeholder="Sesbania grandiflora"
                  />
                </label>
                <label className="admin-field">
                  <span>Icon</span>
                  <input
                    type="text"
                    value={form.icon}
                    onChange={(event) => updateFormField("icon", event.target.value)}
                    placeholder="🌿"
                  />
                </label>
              </div>
            </section>

            <section className="admin-panel">
              <div className="admin-section-head">
                <h3>Bilingual names</h3>
              </div>
              <div className="admin-form-grid two-column">
                <label className="admin-field">
                  <span>Common name (English)</span>
                  <input
                    type="text"
                    value={form.commonNameEn}
                    onChange={(event) => updateFormField("commonNameEn", event.target.value)}
                  />
                </label>
                <label className="admin-field">
                  <span>Common name (Malayalam)</span>
                  <input
                    type="text"
                    value={form.commonNameMl}
                    onChange={(event) => updateFormField("commonNameMl", event.target.value)}
                  />
                </label>
                <label className="admin-field">
                  <span>Family (English)</span>
                  <input
                    type="text"
                    value={form.familyEn}
                    onChange={(event) => updateFormField("familyEn", event.target.value)}
                  />
                </label>
                <label className="admin-field">
                  <span>Family (Malayalam)</span>
                  <input
                    type="text"
                    value={form.familyMl}
                    onChange={(event) => updateFormField("familyMl", event.target.value)}
                  />
                </label>
              </div>
            </section>

            <section className="admin-panel">
              <div className="admin-section-head">
                <h3>Overview and uses</h3>
              </div>
              <div className="admin-form-grid two-column">
                <label className="admin-field">
                  <span>Overview (English)</span>
                  <textarea
                    rows="5"
                    value={form.overviewEn}
                    onChange={(event) => updateFormField("overviewEn", event.target.value)}
                  />
                </label>
                <label className="admin-field">
                  <span>Overview (Malayalam)</span>
                  <textarea
                    rows="5"
                    value={form.overviewMl}
                    onChange={(event) => updateFormField("overviewMl", event.target.value)}
                  />
                </label>
                <label className="admin-field">
                  <span>Medicinal uses (English)</span>
                  <textarea
                    rows="5"
                    value={form.medicinalUsesEn}
                    onChange={(event) => updateFormField("medicinalUsesEn", event.target.value)}
                    placeholder="One per line or comma separated"
                  />
                </label>
                <label className="admin-field">
                  <span>Medicinal uses (Malayalam)</span>
                  <textarea
                    rows="5"
                    value={form.medicinalUsesMl}
                    onChange={(event) => updateFormField("medicinalUsesMl", event.target.value)}
                    placeholder="One per line or comma separated"
                  />
                </label>
              </div>
            </section>

            <section className="admin-panel">
              <div className="admin-section-head">
                <h3>Plant details</h3>
              </div>
              <div className="admin-form-grid two-column">
                <label className="admin-field">
                  <span>Plant characteristics (English)</span>
                  <textarea
                    rows="5"
                    value={form.characteristicsEn}
                    onChange={(event) => updateFormField("characteristicsEn", event.target.value)}
                  />
                </label>
                <label className="admin-field">
                  <span>Plant characteristics (Malayalam)</span>
                  <textarea
                    rows="5"
                    value={form.characteristicsMl}
                    onChange={(event) => updateFormField("characteristicsMl", event.target.value)}
                  />
                </label>
                <label className="admin-field">
                  <span>Habitat (English)</span>
                  <textarea
                    rows="4"
                    value={form.habitatEn}
                    onChange={(event) => updateFormField("habitatEn", event.target.value)}
                  />
                </label>
                <label className="admin-field">
                  <span>Habitat (Malayalam)</span>
                  <textarea
                    rows="4"
                    value={form.habitatMl}
                    onChange={(event) => updateFormField("habitatMl", event.target.value)}
                  />
                </label>
                <label className="admin-field">
                  <span>Medicinal properties (English)</span>
                  <textarea
                    rows="5"
                    value={form.medicinalPropertiesEn}
                    onChange={(event) => updateFormField("medicinalPropertiesEn", event.target.value)}
                  />
                </label>
                <label className="admin-field">
                  <span>Medicinal properties (Malayalam)</span>
                  <textarea
                    rows="5"
                    value={form.medicinalPropertiesMl}
                    onChange={(event) => updateFormField("medicinalPropertiesMl", event.target.value)}
                  />
                </label>
              </div>
            </section>

            <section className="admin-panel">
              <div className="admin-section-head">
                <h3>Image</h3>
              </div>
              <div className="admin-form-grid">
                <label className="admin-field">
                  <span>Image URL</span>
                  <input
                    type="url"
                    value={form.imageUrl}
                    onChange={(event) => updateFormField("imageUrl", event.target.value)}
                    placeholder="https://..."
                  />
                </label>
                <label className="admin-field">
                  <span>Upload image</span>
                  <input type="file" accept="image/*" onChange={handleImageUpload} />
                </label>
                <label className="admin-field">
                  <span>Image alt (English)</span>
                  <input
                    type="text"
                    value={form.imageAltEn}
                    onChange={(event) => updateFormField("imageAltEn", event.target.value)}
                  />
                </label>
                <label className="admin-field">
                  <span>Image alt (Malayalam)</span>
                  <input
                    type="text"
                    value={form.imageAltMl}
                    onChange={(event) => updateFormField("imageAltMl", event.target.value)}
                  />
                </label>
              </div>
              {form.imageFileDataUrl || form.imageUrl ? (
                <div className="admin-image-preview">
                  <img
                    src={form.imageFileDataUrl || form.imageUrl}
                    alt={form.imageAltEn || form.commonNameEn || "Plant preview"}
                  />
                </div>
              ) : null}
            </section>

            <section className="admin-panel">
              <div className="admin-section-head">
                <h3>Other names</h3>
                <button
                  type="button"
                  className="ghost-button"
                  onClick={() => addArrayRow("aliases", createEmptyAliasRow)}
                >
                  Add row
                </button>
              </div>
              <div className="admin-repeat-grid">
                {form.aliases.map((row, index) => (
                  <div className="admin-repeat-card" key={`alias-${index}`}>
                    <div className="admin-form-grid three-column">
                      <label className="admin-field">
                        <span>Category</span>
                        <input
                          type="text"
                          value={row.category}
                          onChange={(event) =>
                            updateArrayRow("aliases", index, "category", event.target.value)
                          }
                        />
                      </label>
                      <label className="admin-field">
                        <span>English names</span>
                        <input
                          type="text"
                          value={row.en}
                          onChange={(event) =>
                            updateArrayRow("aliases", index, "en", event.target.value)
                          }
                          placeholder="Comma separated"
                        />
                      </label>
                      <label className="admin-field">
                        <span>Malayalam names</span>
                        <input
                          type="text"
                          value={row.ml}
                          onChange={(event) =>
                            updateArrayRow("aliases", index, "ml", event.target.value)
                          }
                          placeholder="Comma separated"
                        />
                      </label>
                    </div>
                    <button
                      type="button"
                      className="ghost-button admin-remove-button"
                      onClick={() => removeArrayRow("aliases", index)}
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            </section>

            <section className="admin-panel">
              <div className="admin-section-head">
                <h3>Chemical constituents</h3>
                <button
                  type="button"
                  className="ghost-button"
                  onClick={() => addArrayRow("constituents", createEmptyConstituentRow)}
                >
                  Add row
                </button>
              </div>
              <div className="admin-repeat-grid">
                {form.constituents.map((row, index) => (
                  <div className="admin-repeat-card" key={`constituent-${index}`}>
                    <div className="admin-form-grid two-column">
                      <label className="admin-field">
                        <span>Part (English)</span>
                        <input
                          type="text"
                          value={row.partEn}
                          onChange={(event) =>
                            updateArrayRow("constituents", index, "partEn", event.target.value)
                          }
                        />
                      </label>
                      <label className="admin-field">
                        <span>Description (English)</span>
                        <textarea
                          rows="3"
                          value={row.descriptionEn}
                          onChange={(event) =>
                            updateArrayRow(
                              "constituents",
                              index,
                              "descriptionEn",
                              event.target.value,
                            )
                          }
                        />
                      </label>
                      <label className="admin-field">
                        <span>Part (Malayalam)</span>
                        <input
                          type="text"
                          value={row.partMl}
                          onChange={(event) =>
                            updateArrayRow("constituents", index, "partMl", event.target.value)
                          }
                        />
                      </label>
                      <label className="admin-field">
                        <span>Description (Malayalam)</span>
                        <textarea
                          rows="3"
                          value={row.descriptionMl}
                          onChange={(event) =>
                            updateArrayRow(
                              "constituents",
                              index,
                              "descriptionMl",
                              event.target.value,
                            )
                          }
                        />
                      </label>
                    </div>
                    <button
                      type="button"
                      className="ghost-button admin-remove-button"
                      onClick={() => removeArrayRow("constituents", index)}
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            </section>

            <section className="admin-panel">
              <div className="admin-section-head">
                <h3>Treatments</h3>
                <button
                  type="button"
                  className="ghost-button"
                  onClick={() => addArrayRow("treatments", createEmptyTreatmentRow)}
                >
                  Add row
                </button>
              </div>
              <div className="admin-repeat-grid">
                {form.treatments.map((row, index) => (
                  <div className="admin-repeat-card" key={`treatment-${index}`}>
                    <div className="admin-form-grid two-column">
                      <label className="admin-field">
                        <span>Condition (English)</span>
                        <input
                          type="text"
                          value={row.conditionEn}
                          onChange={(event) =>
                            updateArrayRow("treatments", index, "conditionEn", event.target.value)
                          }
                        />
                      </label>
                      <label className="admin-field">
                        <span>Condition (Malayalam)</span>
                        <input
                          type="text"
                          value={row.conditionMl}
                          onChange={(event) =>
                            updateArrayRow("treatments", index, "conditionMl", event.target.value)
                          }
                        />
                      </label>
                      <label className="admin-field">
                        <span>Remedy (English)</span>
                        <textarea
                          rows="3"
                          value={row.remedyEn}
                          onChange={(event) =>
                            updateArrayRow("treatments", index, "remedyEn", event.target.value)
                          }
                        />
                      </label>
                      <label className="admin-field">
                        <span>Remedy (Malayalam)</span>
                        <textarea
                          rows="3"
                          value={row.remedyMl}
                          onChange={(event) =>
                            updateArrayRow("treatments", index, "remedyMl", event.target.value)
                          }
                        />
                      </label>
                    </div>
                    <button
                      type="button"
                      className="ghost-button admin-remove-button"
                      onClick={() => removeArrayRow("treatments", index)}
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            </section>

            <div className="admin-submit-row">
              <button
                type="button"
                className="admin-primary-button"
                onClick={() => void handleManualSave()}
                disabled={isSaving}
              >
                {isSaving ? "Saving..." : "Save plant"}
              </button>
            </div>
          </div>
        ) : (
          <section className="admin-panel">
            <div className="admin-section-head">
              <h3>Upload JSON</h3>
            </div>
            <div className="admin-form-grid">
              <label className="admin-field">
                <span>JSON file</span>
                <input type="file" accept=".json,application/json" onChange={handleJsonFileUpload} />
              </label>
              {jsonFileName ? <p className="admin-file-caption">Loaded: {jsonFileName}</p> : null}
              <label className="admin-field">
                <span>JSON content</span>
                <textarea
                  rows="18"
                  value={jsonText}
                  onChange={(event) => setJsonText(event.target.value)}
                  placeholder='Paste one plant object or an array of plant objects that match your Firestore schema.'
                />
              </label>
            </div>
            <div className="admin-submit-row">
              <button
                type="button"
                className="admin-primary-button"
                onClick={() => void handleJsonSave()}
                disabled={isSaving || !jsonText.trim()}
              >
                {isSaving ? "Importing..." : "Import JSON"}
              </button>
            </div>
          </section>
        )}
      </section>
    </main>
  );
}

function SavedPage({ copy, language, plants, favoritePlantIds, user, onOpenPlant, onSignIn }) {
  const [savedSearchQuery, setSavedSearchQuery] = useState("");
  const deferredSavedSearchQuery = useDeferredValue(savedSearchQuery.trim());

  if (!user) {
    return (
      <section className="plants-page">
        <div className="content-section">
          <AuthPrompt
            title={copy.saved.signedOutTitle}
            description={copy.saved.signedOutDescription}
            actionLabel={copy.me.signIn}
            onAction={onSignIn}
          />
        </div>
      </section>
    );
  }

  const savedPlants = plants
    .filter((plant) => favoritePlantIds.includes(plant.id))
    .map((plant) => localizePlant(plant, language));

  const filteredSavedPlants = savedPlants.filter((plant) => {
    const query = normalizeText(deferredSavedSearchQuery);
    if (!query) {
      return true;
    }

    return [
      plant.name,
      plant.scientific,
      plant.family,
      plant.teaser,
      plant.summary,
      ...plant.aliases,
      ...plant.uses,
      ...plant.symptoms,
    ].some((value) => normalizeText(value).includes(query));
  });

  return (
    <section className="plants-page">
      <div className="content-section">
        <section className="results-panel saved-page-panel">
          <div className="results-panel-header">
            <h3>{copy.saved.title}</h3>
            <p className="results-panel-meta is-visible">
              {`${filteredSavedPlants.length} ${copy.saved.countLabel}`}
            </p>
          </div>

          {savedPlants.length ? (
            <>
              <div className="saved-search-shell">
                <span className="saved-search-icon" aria-hidden="true">
                  ⌕
                </span>
                <input
                  type="text"
                  className="saved-search-input"
                  value={savedSearchQuery}
                  onChange={(event) => setSavedSearchQuery(event.target.value)}
                  placeholder={copy.saved.searchPlaceholder}
                  aria-label={copy.saved.searchPlaceholder}
                />
                {savedSearchQuery.trim() ? (
                  <button
                    type="button"
                    className="saved-search-clear"
                    onClick={() => setSavedSearchQuery("")}
                  >
                    {copy.saved.clearSearch}
                  </button>
                ) : null}
              </div>

              {filteredSavedPlants.length ? (
                <div className="results-stack">
                  {filteredSavedPlants.map((localizedPlant) => {
                    return (
                      <button
                        type="button"
                        key={localizedPlant.slug}
                        className="result-card"
                        onClick={() => onOpenPlant(localizedPlant.slug, localizedPlant.name)}
                      >
                        <div className="result-card-head">
                          <span className="result-visual">
                            {localizedPlant.image.src ? (
                              <img
                                className="result-image"
                                src={localizedPlant.image.src}
                                alt={localizedPlant.image.alt}
                              />
                            ) : (
                              <span className="result-icon">{localizedPlant.icon}</span>
                            )}
                          </span>
                          <div className="result-title-block">
                            <strong>{localizedPlant.name}</strong>
                            <small>{localizedPlant.scientific}</small>
                          </div>
                          <span className="result-cta">{copy.library.openLabel}</span>
                        </div>

                        <p className="result-teaser">{localizedPlant.teaser}</p>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className="empty-state-card">
                  <h3>{copy.saved.noMatchTitle}</h3>
                  <p>{copy.saved.noMatchDescription}</p>
                </div>
              )}
            </>
          ) : (
            <div className="empty-state-card">
              <h3>{copy.saved.emptyTitle}</h3>
              <p>{copy.saved.emptyDescription}</p>
            </div>
          )}
        </section>
      </div>
    </section>
  );
}

function MePage({ copy, user, favoriteCount, onSignIn, onSignOut }) {
  return (
    <section className="plants-page">
      <div className="content-section">
        <section className="results-panel me-page-panel">
          <div className="results-panel-header">
            <h3>{copy.me.title}</h3>
          </div>

          {user ? (
            <div className="account-card">
              <div className="account-hero">
                <div className="account-avatar" aria-hidden="true">
                  {user.displayName?.[0] ?? user.email?.[0] ?? "U"}
                </div>
                <div className="account-meta">
                  <strong>{user.displayName ?? "User"}</strong>
                  <span>{copy.me.signedInTitle}</span>
                </div>
              </div>
              <div className="account-email-chip">{user.email}</div>
              <p className="account-description">{copy.me.signedInDescription}</p>
              <div className="account-stats">
                <div>
                  <span>{copy.me.favoritesLabel}</span>
                  <strong>{favoriteCount}</strong>
                </div>
                <button
                  type="button"
                  className="ghost-button auth-action-button account-signout-button"
                  onClick={onSignOut}
                >
                  {copy.me.signOut}
                </button>
              </div>
              <div className="account-note-card">
                <p className="account-note">{copy.me.note}</p>
              </div>
            </div>
          ) : (
            <AuthPrompt
              title={copy.me.signedOutTitle}
              description={copy.me.signedOutDescription}
              actionLabel={copy.me.signIn}
              onAction={onSignIn}
            />
          )}
        </section>
      </div>
    </section>
  );
}

function DesktopHeader({ onOpenPrompt, isScrolled }) {
  return (
    <header className={isScrolled ? "desktop-header is-scrolled" : "desktop-header"}>
      <div className="brand">
        <img
          className="brand-logo-image"
          src="/medlogo.png"
          alt={desktopContent.brandTitle}
        />
        <div className="brand-copy">
          <h1 className="brand-title">{desktopContent.brandTitle}</h1>
          <p className="brand-kicker">{desktopContent.brandSubheading}</p>
        </div>
      </div>

      <button type="button" className="desktop-cta-button" onClick={onOpenPrompt}>
        {desktopContent.cta}
      </button>
    </header>
  );
}

function DesktopSearchBar({ onOpenPrompt }) {
  return (
    <button
      type="button"
      className="desktop-search-bar"
      onClick={onOpenPrompt}
      aria-label={desktopContent.hero.searchButton}
    >
      <span className="desktop-search-copy">
        <span className="desktop-search-icon" aria-hidden="true">
          ⌕
        </span>
        <span className="desktop-search-placeholder">
          {desktopContent.hero.searchPlaceholder}
        </span>
      </span>
      <span className="desktop-search-action">{desktopContent.hero.searchButton}</span>
    </button>
  );
}

function DesktopPrompt({ isOpen, onClose }) {
  return (
    <>
      <button
        type="button"
        className={isOpen ? "desktop-prompt-backdrop is-open" : "desktop-prompt-backdrop"}
        aria-label={desktopContent.prompt.button}
        onClick={onClose}
      />

      <section
        className={isOpen ? "desktop-prompt is-open" : "desktop-prompt"}
        aria-hidden={!isOpen}
        role="dialog"
        aria-modal="true"
        aria-labelledby="desktop-mobile-prompt-title"
      >
        <p
          className={desktopContent.hero.eyebrow ? "eyebrow" : "eyebrow eyebrow-spacer"}
          aria-hidden={!desktopContent.hero.eyebrow}
        >
          {desktopContent.hero.eyebrow || "\u00A0"}
        </p>
        <h2 id="desktop-mobile-prompt-title">{desktopContent.prompt.title}</h2>
        <p className="desktop-prompt-text">{desktopContent.prompt.description}</p>
        <ul className="desktop-prompt-list">
          {desktopContent.prompt.notes.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
        <button type="button" className="desktop-cta-button" onClick={onClose}>
          {desktopContent.prompt.button}
        </button>
      </section>
    </>
  );
}

function DesktopLanding({ isPromptOpen, onOpenPrompt, onClosePrompt, isScrolled }) {
  return (
    <>
      <DesktopHeader onOpenPrompt={onOpenPrompt} isScrolled={isScrolled} />

      <main className="desktop-main">
        <section className="desktop-hero">
          <div className="desktop-hero-copy">
            <p
              className={desktopContent.hero.eyebrow ? "eyebrow" : "eyebrow eyebrow-spacer"}
              aria-hidden={!desktopContent.hero.eyebrow}
            >
              {desktopContent.hero.eyebrow || "\u00A0"}
            </p>
            <h2>{desktopContent.hero.title}</h2>
            <p className="desktop-hero-text">{desktopContent.hero.description}</p>
            <DesktopSearchBar onOpenPrompt={onOpenPrompt} />

            <div className="tag-row" aria-label="Popular mobile searches">
              {desktopContent.hero.quickTags.map((tag) => (
                <button className="tag-pill" type="button" key={tag} onClick={onOpenPrompt}>
                  {tag}
                </button>
              ))}
            </div>
          </div>

          <aside className="desktop-hero-card">
            <p className="card-kicker">{desktopContent.featured.kicker}</p>
            <h3>{desktopContent.featured.title}</h3>
            <ul className="feature-list">
              {desktopContent.featured.points.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </aside>
        </section>

        <section className="content-section desktop-info-section">
          <div className="section-heading">
            <p className="eyebrow">Why mobile only</p>
            <h2>One focused experience</h2>
          </div>

          <div className="card-grid">
            {desktopContent.info.map((item) => (
              <article className="info-card" key={item.title}>
                <div className="card-icon">📱</div>
                <h3>{item.title}</h3>
                <p>{item.description}</p>
              </article>
            ))}
          </div>
        </section>
      </main>

      <footer className="site-footer desktop-site-footer" id="about">
        <p>
          <strong>{desktopContent.footerLabel}:</strong> {desktopContent.footer}
        </p>
      </footer>

      <DesktopPrompt isOpen={isPromptOpen} onClose={onClosePrompt} />
    </>
  );
}

function Hero({ copy, language, plants, onSearchSubmit, onPlantOpen }) {
  const [query, setQuery] = useState("");
  const localizedPlants = plants.map((plant) => ({
    localized: localizePlant(plant, language),
    savedCount: getSavedCountValue(plant),
  }));
  const mostPopularEntry = [...localizedPlants]
    .sort((left, right) => {
      if (right.savedCount !== left.savedCount) {
        return right.savedCount - left.savedCount;
      }

      return left.localized.name.localeCompare(right.localized.name);
    })[0] ?? null;
  const mostPopularPlant = mostPopularEntry?.localized ?? localizedPlants[0]?.localized ?? null;
  const topSavedPlants = [...localizedPlants]
    .sort((left, right) => {
      if (right.savedCount !== left.savedCount) {
        return right.savedCount - left.savedCount;
      }

      return left.localized.name.localeCompare(right.localized.name);
    })
    .slice(0, 6)
    .map((entry) => entry.localized);

  function handleSubmit(event) {
    event.preventDefault();
    onSearchSubmit(query.trim());
  }

  return (
    <section className="hero" id="home">
      <div className="hero-copy">
        <p className="eyebrow">{copy.hero.eyebrow}</p>
        <h2>{copy.hero.title}</h2>
        <p className="hero-text">{copy.hero.description}</p>

        <form className="search-panel" onSubmit={handleSubmit}>
          <input
            type="text"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={copy.hero.placeholder}
            aria-label="Search medicinal plants"
          />
          <button type="submit">{copy.hero.buttonLabel}</button>
        </form>

        <div className="tag-row" aria-label="Popular searches">
          {copy.hero.quickTags.map((tag) => (
            <button className="tag-pill" type="button" key={tag} onClick={() => onSearchSubmit(tag)}>
              {tag}
            </button>
          ))}
        </div>
      </div>

      <aside className="hero-card" aria-label="Featured plant">
        <p className="card-kicker">{copy.featured.popularLabel}</p>
        <p className="hero-card-text hero-card-text-compact">{copy.featured.description}</p>
        {mostPopularPlant ? (
          <>
            <button
              type="button"
              className="hero-highlight-card"
              onClick={() =>
                onPlantOpen({ query: mostPopularPlant.name, slug: mostPopularPlant.slug })
              }
            >
              <strong className="hero-highlight-title">
                {mostPopularPlant.icon} {mostPopularPlant.name}
              </strong>
              <span className="hero-highlight-subtitle">{mostPopularPlant.scientific}</span>
              <p className="hero-highlight-description">
                {mostPopularPlant.summary || mostPopularPlant.teaser || copy.featured.description}
              </p>
              <span className="hero-highlight-cta">{copy.featured.exploreLabel}</span>
            </button>

            {topSavedPlants.length > 1 ? (
              <div className="hero-saved-strip-wrap">
                <p className="hero-saved-strip-label">{copy.featured.savedRailLabel}</p>
                <div className="hero-saved-strip" aria-label={copy.featured.savedRailLabel}>
                  {topSavedPlants.map((plant) => (
                    <button
                      type="button"
                      key={plant.slug}
                      className="hero-saved-pill"
                      onClick={() => onPlantOpen({ query: plant.name, slug: plant.slug })}
                    >
                      <span className="hero-saved-pill-icon" aria-hidden="true">
                        {plant.icon}
                      </span>
                      <span className="hero-saved-pill-text">{plant.name}</span>
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
          </>
        ) : (
          <div className="hero-highlight-empty">{copy.featured.noPlantsLabel}</div>
        )}
      </aside>
    </section>
  );
}

function CardGridSection({ id, eyebrow, title, items, plantMode = false, onItemClick }) {
  return (
    <section className="content-section" id={id}>
      <div className="section-heading">
        <p className="eyebrow">{eyebrow}</p>
        <h2>{title}</h2>
      </div>

      <div className="card-grid">
        {items.map((item) => {
          const label = item.title ?? item.name;

          if (onItemClick) {
            return (
              <button
                type="button"
                className="info-card interactive-card"
                key={label}
                onClick={() => onItemClick(item)}
              >
                <div className="card-icon">{plantMode ? "🌱" : item.icon}</div>
                <h3>{label}</h3>
                <p>{item.description ?? item.blurb}</p>
              </button>
            );
          }

          return (
            <article className="info-card" key={label}>
              <div className="card-icon">{plantMode ? "🌱" : item.icon}</div>
              <h3>{label}</h3>
              <p>{item.description ?? item.blurb}</p>
            </article>
          );
        })}
      </div>
    </section>
  );
}

function StatsSection({ copy, plants }) {
  const stats = getKnowledgeStats(plants);

  return (
    <section className="content-section" id="knowledge">
      <div className="section-heading">
        <p className="eyebrow">{copy.stats.eyebrow}</p>
        <h2>{copy.stats.title}</h2>
      </div>

      <div className="stats-grid">
        {copy.stats.items.map((stat) => (
          <article className="stat-card" key={stat.label}>
            <strong>{stats[stat.key] ?? 0}</strong>
            <span>{stat.label}</span>
          </article>
        ))}
      </div>
    </section>
  );
}

function HomePage({ copy, language, plants, onSearchSubmit, onBrowseOpen, onPlantOpen }) {
  return (
    <>
      <Hero
        copy={copy}
        language={language}
        plants={plants}
        onSearchSubmit={onSearchSubmit}
        onPlantOpen={onPlantOpen}
      />
      <CardGridSection
        id="browse"
        eyebrow={copy.browse.eyebrow}
        title={copy.browse.title}
        items={copy.browse.items}
        onItemClick={onBrowseOpen}
      />
      <StatsSection copy={copy} plants={plants} />
    </>
  );
}

function PlantsPage({
  copy,
  language,
  plants,
  isLoading,
  loadError,
  user,
  favoritePlantIds,
  onToggleFavorite,
  onSignIn,
  selectedPlantSlug,
  searchSeed,
  onSelectPlant,
}) {
  const localizedPlants = plants.map((plant) => localizePlant(plant, language));
  const [searchQuery, setSearchQuery] = useState(searchSeed.query);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [isMobileSearchOpen, setIsMobileSearchOpen] = useState(false);
  const [shareState, setShareState] = useState("idle");
  const [shouldAutoOpenDetail, setShouldAutoOpenDetail] = useState(
    Boolean(searchSeed.openDetail && selectedPlantSlug),
  );
  const trimmedSearchQuery = searchQuery.trim();
  const deferredQuery = useDeferredValue(trimmedSearchQuery);
  const quickSymptoms = getTopTerms(localizedPlants, "symptoms", 5);
  const quickDiseases = getTopTerms(localizedPlants, "uses", 5);

  useEffect(() => {
    setSearchQuery(searchSeed.query);
    setShouldAutoOpenDetail(Boolean(searchSeed.openDetail && selectedPlantSlug));
    setIsDetailOpen(Boolean(searchSeed.openDetail && selectedPlantSlug));
    setIsMobileSearchOpen(false);
    setShareState("idle");
  }, [searchSeed, selectedPlantSlug]);

  useEffect(() => {
    document.body.classList.toggle("detail-open", isDetailOpen || isMobileSearchOpen);

    return () => {
      document.body.classList.remove("detail-open");
    };
  }, [isDetailOpen, isMobileSearchOpen]);

  useEffect(() => {
    if (shareState === "idle") {
      return undefined;
    }

    const timeoutId = window.setTimeout(() => {
      setShareState("idle");
    }, 2200);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [shareState]);

  const searchResults = localizedPlants
    .map((plant) => getSearchResult(plant, normalizeText(deferredQuery)))
    .filter(Boolean)
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score;
      }

      return left.plant.name.localeCompare(right.plant.name);
    });

  useEffect(() => {
    if (!searchResults.length) {
      if (!shouldAutoOpenDetail) {
        setIsDetailOpen(false);
      }
      return;
    }

    const hasSelectedPlant = searchResults.some(
      (result) => result.plant.slug === selectedPlantSlug,
    );

    if (!hasSelectedPlant) {
      onSelectPlant(searchResults[0].plant.slug);
    }

    if (shouldAutoOpenDetail) {
      setIsDetailOpen(true);
      setShouldAutoOpenDetail(false);
    }
  }, [onSelectPlant, searchResults, selectedPlantSlug, shouldAutoOpenDetail]);

  const selectedResult =
    searchResults.find((result) => result.plant.slug === selectedPlantSlug) ?? null;
  const activeFilterCount = trimmedSearchQuery ? 1 : 0;
  const hasCatalog = localizedPlants.length > 0;
  const isSelectedSaved = selectedResult
    ? favoritePlantIds.includes(selectedResult.plant.slug)
    : false;
  function clearFilters() {
    setSearchQuery("");
    setIsDetailOpen(false);
    setIsMobileSearchOpen(false);
    setShouldAutoOpenDetail(false);
  }

  function handleSelectResult(slug) {
    onSelectPlant(slug);
    setIsDetailOpen(true);
    setShouldAutoOpenDetail(false);
  }

  function closeMobileSearch() {
    setIsMobileSearchOpen(false);
  }

  function handleQuickFilter(term) {
    setSearchQuery(term);
    setIsDetailOpen(false);
    setShouldAutoOpenDetail(false);
    closeMobileSearch();
  }

  async function handleSharePlant(plant) {
    const shareUrl = buildAppUrl({
      language,
      page: "plants",
      query: trimmedSearchQuery,
      plantSlug: plant.slug,
    });

    const shareData = {
      title: `${plant.name} | Nattuvaidyam`,
      text: plant.summary || plant.scientific || plant.name,
      url: shareUrl,
    };

    try {
      if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
        await navigator.share(shareData);
        setShareState("shared");
        return;
      }
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        return;
      }
    }

    try {
      if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(shareUrl);
        setShareState("copied");
      }
    } catch {
      setShareState("idle");
    }
  }

  return (
    <section className="plants-page">
      <div className="content-section">
        <section className="catalog-search-shell">
          <section className="catalog-search-card desktop-catalog-search">
            <div className="catalog-search-input-row">
              <input
                type="text"
                className="catalog-search-input"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder={copy.library.searchPlaceholder}
                aria-label="Plant catalog search"
              />
              <button type="button" className="ghost-button" onClick={clearFilters}>
                {copy.library.clearAll}
              </button>
            </div>
          </section>

          <div className="mobile-catalog-search">
            <section className="catalog-search-card mobile-catalog-search-card">
              <div className="mobile-catalog-search-row">
                <div className="mobile-catalog-input-shell">
                  <span className="mobile-catalog-search-icon" aria-hidden="true">
                    ⌕
                  </span>
                  <input
                    type="text"
                    className="catalog-search-input mobile-catalog-search-input"
                    value={searchQuery}
                    onChange={(event) => setSearchQuery(event.target.value)}
                    placeholder={copy.library.searchPlaceholder}
                    aria-label="Plant catalog search"
                  />
                  {trimmedSearchQuery ? (
                    <button
                      type="button"
                      className="mobile-catalog-clear-button"
                      aria-label={copy.library.clearAll}
                      onClick={clearFilters}
                    >
                      Clear
                    </button>
                  ) : null}
                </div>
                <button
                  type="button"
                  className={
                    isMobileSearchOpen
                      ? "mobile-catalog-filter-button is-open"
                      : "mobile-catalog-filter-button"
                  }
                  aria-expanded={isMobileSearchOpen}
                  aria-controls="mobile-catalog-search-panel"
                  aria-label={copy.library.filterButtonLabel}
                  onClick={() => setIsMobileSearchOpen((current) => !current)}
                >
                  <span aria-hidden="true" className="mobile-catalog-filter-icon">
                    ☰
                  </span>
                </button>
              </div>

            </section>
          </div>
        </section>

        {trimmedSearchQuery && hasCatalog ? (
          <div className="catalog-results-summary">
            <p>
              <strong>{searchResults.length}</strong> {copy.library.allResultsLabel}
            </p>
            {activeFilterCount ? (
              <p>{`${activeFilterCount} ${copy.library.activeFiltersLabel}`}</p>
            ) : null}
          </div>
        ) : null}

        <div className="catalog-layout">
          <section className="results-panel">
            <div className="results-panel-header">
              <h3>{copy.library.listTitle}</h3>
              {trimmedSearchQuery && hasCatalog ? (
                <p className="results-panel-meta">
                  {`${searchResults.length} ${copy.library.allResultsLabel}${
                    activeFilterCount ? ` • ${activeFilterCount} ${copy.library.filtersCountLabel}` : ""
                  }`}
                </p>
              ) : null}
            </div>

            {isLoading ? (
              <div className="empty-state-card">
                <h3>{copy.library.loadingTitle}</h3>
                <p>{copy.library.loadingDescription}</p>
              </div>
            ) : loadError ? (
              <div className="empty-state-card">
                <h3>{copy.library.errorTitle}</h3>
                <p>{copy.library.errorDescription}</p>
              </div>
            ) : !hasCatalog ? (
              <div className="empty-state-card">
                <h3>{copy.library.noCatalogTitle}</h3>
                <p>{copy.library.noCatalogDescription}</p>
              </div>
            ) : searchResults.length ? (
                <div className="results-stack">
                {searchResults.map((result) => (
                  <button
                    type="button"
                    key={result.plant.slug}
                    className={
                      result.plant.slug === selectedPlantSlug
                        ? "result-card is-active"
                        : "result-card"
                    }
                    onClick={() => handleSelectResult(result.plant.slug)}
                  >
                    <div className="result-card-head">
                      <span className="result-visual">
                        {result.plant.image.src ? (
                          <img
                            className="result-image"
                            src={result.plant.image.src}
                            alt={result.plant.image.alt}
                          />
                        ) : (
                          <span className="result-icon">{result.plant.icon}</span>
                        )}
                      </span>
                      <div className="result-title-block">
                        <strong>{result.plant.name}</strong>
                        <small>{result.plant.scientific}</small>
                      </div>
                      <span className="result-cta">{copy.library.openLabel}</span>
                    </div>

                    <p className="result-teaser">{result.plant.teaser}</p>

                    <div className="result-chip-row">
                      {result.previewChips.map((chip) => (
                        <span className="result-chip" key={chip}>
                          {chip}
                        </span>
                      ))}
                    </div>
                  </button>
                ))}
              </div>
            ) : (
              <div className="empty-state-card">
                <h3>{copy.library.emptyTitle}</h3>
                <p>{copy.library.emptyDescription}</p>
                <button type="button" className="ghost-button" onClick={clearFilters}>
                  {copy.library.clearAll}
                </button>
              </div>
            )}
          </section>

          <button
            type="button"
            className={isDetailOpen ? "detail-backdrop is-open" : "detail-backdrop"}
            aria-label={copy.library.closeDetail}
            onClick={() => setIsDetailOpen(false)}
          />

          <aside className={isDetailOpen ? "plant-detail-card is-open" : "plant-detail-card"}>
            {selectedResult ? (
              <>
                <div className="detail-header-row">
                  <h3>
                    {selectedResult.plant.icon} {selectedResult.plant.name}
                  </h3>
                  <div className="detail-header-actions">
                    <button
                      type="button"
                      className="detail-close-button"
                      onClick={() => setIsDetailOpen(false)}
                    >
                      {copy.library.closeDetail}
                    </button>
                  </div>
                </div>
                <div className="plant-image-frame">
                  {selectedResult.plant.image.src ? (
                    <img
                      className="plant-image"
                      src={selectedResult.plant.image.src}
                      alt={selectedResult.plant.image.alt}
                    />
                  ) : (
                    <div className="plant-image-placeholder" aria-hidden="true">
                      <span className="plant-image-icon">{selectedResult.plant.icon}</span>
                      <span className="plant-image-copy">
                        {copy.library.labels.imageFallback}
                      </span>
                    </div>
                  )}
                </div>
                <div className="plant-meta-grid">
                  <div className="plant-meta-card is-primary">
                    <div className="plant-meta-top-row">
                      <div className="plant-meta-copy">
                        <span className="plant-meta-label">
                          {copy.library.labels.scientific}
                        </span>
                        <strong className="plant-meta-value">
                          {selectedResult.plant.scientific}
                        </strong>
                      </div>
                      <div className="plant-meta-utility-actions">
                        <button
                          type="button"
                          className="detail-icon-button"
                          aria-label={
                            shareState === "shared"
                              ? copy.library.sharedLabel
                              : shareState === "copied"
                                ? copy.library.copiedLabel
                                : copy.library.shareLabel
                          }
                          title={
                            shareState === "shared"
                              ? copy.library.sharedLabel
                              : shareState === "copied"
                                ? copy.library.copiedLabel
                                : copy.library.shareLabel
                          }
                          onClick={() => handleSharePlant(selectedResult.plant)}
                        >
                          <svg
                            className="detail-icon-svg"
                            viewBox="0 0 24 24"
                            aria-hidden="true"
                          >
                            <circle cx="18" cy="5" r="2.25" fill="currentColor" />
                            <circle cx="6" cy="12" r="2.25" fill="currentColor" />
                            <circle cx="18" cy="19" r="2.25" fill="currentColor" />
                            <path
                              d="M8.15 10.95 15.85 6.05M8.15 13.05l7.7 4.9"
                              fill="none"
                              stroke="currentColor"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth="1.9"
                            />
                          </svg>
                        </button>
                        <button
                          type="button"
                          className={
                            user && isSelectedSaved
                              ? "detail-icon-button is-active"
                              : "detail-icon-button"
                          }
                          aria-label={
                            user
                              ? isSelectedSaved
                                ? copy.library.savedLabel
                                : copy.library.saveLabel
                              : copy.library.signInToSave
                          }
                          title={
                            user
                              ? isSelectedSaved
                                ? copy.library.savedLabel
                                : copy.library.saveLabel
                              : copy.library.signInToSave
                          }
                          onClick={() => {
                            if (!user) {
                              onSignIn();
                              return;
                            }

                            void onToggleFavorite(selectedResult.plant.slug, isSelectedSaved);
                          }}
                        >
                          <svg
                            className="detail-icon-svg"
                            viewBox="0 0 24 24"
                            aria-hidden="true"
                          >
                            {user && isSelectedSaved ? (
                              <path
                                d="M12 21.35 10.55 20.03C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09A5.96 5.96 0 0 1 16.5 3C19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35Z"
                                fill="currentColor"
                              />
                            ) : (
                              <path
                                d="m12 21.35-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09A5.96 5.96 0 0 1 16.5 3C19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35Zm4.5-16.35c-1.54 0-3.04.99-3.57 2.36h-1.87A4.49 4.49 0 0 0 7.5 5C5.53 5 4 6.53 4 8.5c0 2.9 2.85 5.52 8 10.2 5.15-4.68 8-7.3 8-10.2C20 6.53 18.47 5 16.5 5Z"
                                fill="currentColor"
                              />
                            )}
                          </svg>
                        </button>
                      </div>
                    </div>
                  </div>
                  {selectedResult.plant.family ? (
                    <div className="plant-meta-card">
                      <span className="plant-meta-label">{copy.library.labels.family}</span>
                      <strong className="plant-meta-value">
                        {selectedResult.plant.family}
                      </strong>
                    </div>
                  ) : null}
                </div>
                <p className="plant-summary">{selectedResult.plant.summary}</p>

                {!!selectedResult.plant.aliases.length && (
                  <section className="detail-block">
                    <h4>{copy.library.labels.aliases}</h4>
                    <div className="detail-pill-row">
                      {selectedResult.plant.aliases.map((item) => (
                        <span className="detail-pill" key={item}>
                          {item}
                        </span>
                      ))}
                    </div>
                  </section>
                )}

                <div className="detail-grid">
                  <section className="detail-block">
                    <h4>{copy.library.labels.uses}</h4>
                    <div className="detail-pill-row">
                      {selectedResult.plant.uses.map((item) => (
                        <span className="detail-pill" key={item}>
                          {item}
                        </span>
                      ))}
                    </div>
                  </section>

                  <section className="detail-block">
                    <h4>{copy.library.labels.parts}</h4>
                    <div className="detail-pill-row">
                      {selectedResult.plant.parts.map((item) => (
                        <span className="detail-pill" key={item}>
                          {item}
                        </span>
                      ))}
                    </div>
                  </section>
                </div>

                {selectedResult.plant.overview ? (
                  <section className="detail-block">
                    <h4>{copy.library.labels.overview}</h4>
                    <p>{selectedResult.plant.overview}</p>
                  </section>
                ) : null}

                {selectedResult.plant.characteristics ? (
                  <section className="detail-block">
                    <h4>{copy.library.labels.characteristics}</h4>
                    <p>{selectedResult.plant.characteristics}</p>
                  </section>
                ) : null}

                {selectedResult.plant.habitat ? (
                  <section className="detail-block">
                    <h4>{copy.library.labels.habitat}</h4>
                    <p>{selectedResult.plant.habitat}</p>
                  </section>
                ) : null}

                {selectedResult.plant.properties ? (
                  <section className="detail-block">
                    <h4>{copy.library.labels.properties}</h4>
                    <p>{selectedResult.plant.properties}</p>
                  </section>
                ) : null}

                {!!selectedResult.plant.constituents.length && (
                  <section className="detail-block">
                    <h4>{copy.library.labels.constituents}</h4>
                    <ul className="detail-list">
                      {selectedResult.plant.constituents.map((item) => (
                        <li key={item.part}>
                          <strong>{item.part}</strong>: {item.description}
                        </li>
                      ))}
                    </ul>
                  </section>
                )}

                {!!selectedResult.plant.treatments.length && (
                  <section className="detail-block">
                    <h4>{copy.library.labels.treatments}</h4>
                    <div className="detail-treatment-list">
                      {selectedResult.plant.treatments.map((item) => (
                        <article
                          className="detail-treatment-item"
                          key={`${item.condition}-${item.remedy}`}
                        >
                          <strong>{item.condition}</strong>
                          <p>{item.remedy}</p>
                        </article>
                      ))}
                    </div>
                  </section>
                )}
              </>
            ) : (
              <div className="empty-state-card is-detail">
                <h3>{copy.library.emptyTitle}</h3>
                <p>{copy.library.emptyDescription}</p>
              </div>
            )}
          </aside>
        </div>

        <button
          type="button"
          className={
            isMobileSearchOpen
              ? "mobile-catalog-search-overlay is-open"
              : "mobile-catalog-search-overlay"
          }
          aria-label={copy.library.closeDetail}
          onClick={closeMobileSearch}
        />

        <section
          id="mobile-catalog-search-panel"
          className={
            isMobileSearchOpen
              ? "mobile-catalog-search-sheet is-open"
              : "mobile-catalog-search-sheet"
          }
        >
          <div className="mobile-catalog-sheet-header">
            <div className="mobile-catalog-sheet-title">
              <strong>{copy.library.filterTitle}</strong>
              {trimmedSearchQuery ? (
                <small>
                  {searchResults.length} {copy.library.allResultsLabel}
                </small>
              ) : null}
            </div>
            <div className="mobile-catalog-sheet-actions">
              {trimmedSearchQuery ? (
                <button
                  type="button"
                  className="ghost-button mobile-catalog-clear-all-button"
                  onClick={clearFilters}
                >
                  {copy.library.clearAll}
                </button>
              ) : null}
              <button
                type="button"
                className="detail-close-button"
                onClick={closeMobileSearch}
              >
                {copy.library.closeDetail}
              </button>
            </div>
          </div>

          <div className="mobile-catalog-filter-groups">
            <section className="mobile-filter-group">
              <p>{copy.library.quickSymptomsTitle}</p>
              <div className="mobile-filter-row">
                {quickSymptoms.map((term) => (
                  <button
                    type="button"
                    key={term}
                    className={
                      deferredQuery === normalizeText(term)
                        ? "mobile-filter-chip is-active"
                        : "mobile-filter-chip"
                    }
                    onClick={() => handleQuickFilter(term)}
                  >
                    {term}
                  </button>
                ))}
              </div>
            </section>

            <section className="mobile-filter-group">
              <p>{copy.library.quickDiseasesTitle}</p>
              <div className="mobile-filter-row">
                {quickDiseases.map((term) => (
                  <button
                    type="button"
                    key={term}
                    className={
                      deferredQuery === normalizeText(term)
                        ? "mobile-filter-chip is-active"
                        : "mobile-filter-chip"
                    }
                    onClick={() => handleQuickFilter(term)}
                  >
                    {term}
                  </button>
                ))}
              </div>
            </section>
          </div>
        </section>
      </div>
    </section>
  );
}

export default function App() {
  const initialAppState = getInitialAppState();
  const [language, setLanguage] = useState(initialAppState.language);
  const [page, setPage] = useState(initialAppState.page);
  const [plants, setPlants] = useState([]);
  const [plantsStatus, setPlantsStatus] = useState("loading");
  const [plantsError, setPlantsError] = useState("");
  const [user, setUser] = useState(null);
  const [favoritePlantIds, setFavoritePlantIds] = useState([]);
  const [selectedPlantSlug, setSelectedPlantSlug] = useState(initialAppState.selectedPlantSlug);
  const [pendingSection, setPendingSection] = useState(null);
  const [catalogSeed, setCatalogSeed] = useState(initialAppState.catalogSeed);
  const [isDesktopPromptOpen, setIsDesktopPromptOpen] = useState(false);
  const [hasScrolled, setHasScrolled] = useState(false);
  const [isMobileViewport, setIsMobileViewport] = useState(() => {
    if (typeof window === "undefined") {
      return true;
    }

    return window.innerWidth <= MOBILE_APP_BREAKPOINT;
  });
  const copy = content[language];

  async function loadPlants() {
    try {
      setPlantsStatus("loading");
      setPlantsError("");
      const records = await fetchPlantsFromFirestore();

      setPlants(records);
      setSelectedPlantSlug((current) => {
        if (current && records.some((plant) => plant.id === current)) {
          return current;
        }

        return records[0]?.id ?? null;
      });
      setPlantsStatus("ready");
    } catch (error) {
      setPlants([]);
      setPlantsStatus("error");
      setPlantsError(error instanceof Error ? error.message : "Unknown Firestore error");
    }
  }

  useEffect(() => {
    let isActive = true;

    void fetchPlantsFromFirestore()
      .then((records) => {
        if (!isActive) {
          return;
        }

        setPlantsStatus("ready");
        setPlantsError("");
        setPlants(records);
        setSelectedPlantSlug((current) => {
          if (current && records.some((plant) => plant.id === current)) {
            return current;
          }

          return records[0]?.id ?? null;
        });
      })
      .catch((error) => {
        if (!isActive) {
          return;
        }

        setPlants([]);
        setPlantsStatus("error");
        setPlantsError(error instanceof Error ? error.message : "Unknown Firestore error");
      });

    return () => {
      isActive = false;
    };
  }, []);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (nextUser) => {
      setUser(nextUser);
    });

    return unsubscribe;
  }, []);

  useEffect(() => {
    if (!user) {
      setFavoritePlantIds([]);
      return undefined;
    }

    return watchFavoritePlantIds(
      user.uid,
      (favoriteIds) => setFavoritePlantIds(favoriteIds),
      () => setFavoritePlantIds([]),
    );
  }, [user]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return undefined;
    }

    const mediaQuery = window.matchMedia(`(max-width: ${MOBILE_APP_BREAKPOINT}px)`);
    const handleViewportChange = (event) => setIsMobileViewport(event.matches);

    setIsMobileViewport(mediaQuery.matches);

    if (typeof mediaQuery.addEventListener === "function") {
      mediaQuery.addEventListener("change", handleViewportChange);
      return () => mediaQuery.removeEventListener("change", handleViewportChange);
    }

    mediaQuery.addListener(handleViewportChange);
    return () => mediaQuery.removeListener(handleViewportChange);
  }, []);

  useEffect(() => {
    if (isMobileViewport) {
      setIsDesktopPromptOpen(false);
      document.body.classList.remove("detail-open");
      return undefined;
    }

    document.body.classList.toggle("detail-open", isDesktopPromptOpen);
    return () => {
      document.body.classList.remove("detail-open");
    };
  }, [isDesktopPromptOpen, isMobileViewport]);

  useEffect(() => {
    if (page === "plants") {
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }

    if (!pendingSection || page !== "home") {
      return;
    }

    if (pendingSection === "home") {
      window.scrollTo({ top: 0, behavior: "smooth" });
    } else {
      document.getElementById(pendingSection)?.scrollIntoView({ behavior: "smooth" });
    }

    setPendingSection(null);
  }, [page, pendingSection]);

  useEffect(() => {
    if (page === "admin") {
      return;
    }

    if (typeof window === "undefined") {
      return;
    }

    const nextUrl = buildAppUrl({
      language,
      page,
      query: catalogSeed.query,
      plantSlug: page === "plants" ? selectedPlantSlug : null,
    });

    window.history.replaceState({}, "", nextUrl);
  }, [catalogSeed.query, language, page, selectedPlantSlug]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return undefined;
    }

    const handleScroll = () => {
      setHasScrolled(window.scrollY > 8);
    };

    handleScroll();
    window.addEventListener("scroll", handleScroll, { passive: true });

    return () => {
      window.removeEventListener("scroll", handleScroll);
    };
  }, []);

  function handleNavigate(target) {
    if (target === "plants") {
      setCatalogSeed({ query: "", openDetail: false });
      setSelectedPlantSlug(null);
      setPage(target);
      return;
    }

    if (target === "saved" || target === "me") {
      setPage(target);
      return;
    }

    setPage("home");
    setPendingSection(target);
  }

  function handleCatalogSearch(term, slug = null) {
    setCatalogSeed({ query: term, openDetail: Boolean(slug) });
    if (slug) {
      setSelectedPlantSlug(slug);
    }
    setPage("plants");
  }

  function handleBrowseOpen() {
    setCatalogSeed({ query: "", openDetail: false });
    setPage("plants");
  }

  async function handleToggleFavorite(plantId, isSaved) {
    if (!user) {
      return;
    }

    if (isSaved) {
      await removeFavoritePlant(user.uid, plantId);
      return;
    }

    await saveFavoritePlant(user.uid, plantId);
  }

  function handleOpenSavedPlant(slug, query) {
    setCatalogSeed({ query, openDetail: true });
    setSelectedPlantSlug(slug);
    setPage("plants");
  }

  async function handleSignIn() {
    await signInWithGoogle();
  }

  async function handleSignOut() {
    await signOutUser();
    setPage("home");
    if (typeof window !== "undefined" && window.location.pathname === "/admin") {
      window.history.replaceState({}, "", "/");
    }
  }

  if (page === "admin") {
    return (
      <div className="app-shell admin-shell">
        <div className="page-glow page-glow-left" />
        <div className="page-glow page-glow-right" />
        <AdminPage
          user={user}
          onSignIn={handleSignIn}
          onSignOut={handleSignOut}
          onPlantsChanged={loadPlants}
        />
      </div>
    );
  }

  if (!isMobileViewport) {
    return (
      <div className="app-shell desktop-only-shell">
        <div className="page-glow page-glow-left" />
        <div className="page-glow page-glow-right" />
        <DesktopLanding
          isPromptOpen={isDesktopPromptOpen}
          onOpenPrompt={() => setIsDesktopPromptOpen(true)}
          onClosePrompt={() => setIsDesktopPromptOpen(false)}
          isScrolled={hasScrolled}
        />
      </div>
    );
  }

  return (
    <div className="app-shell">
      <div className="page-glow page-glow-left" />
      <div className="page-glow page-glow-right" />
      <Header
        copy={copy}
        page={page}
        language={language}
        onNavigate={handleNavigate}
        onLanguageChange={setLanguage}
        isScrolled={hasScrolled}
      />
      <main>
        {page === "home" ? (
          <HomePage
            copy={copy}
            language={language}
            plants={plants}
            onSearchSubmit={handleCatalogSearch}
            onBrowseOpen={handleBrowseOpen}
            onPlantOpen={(plant) => handleCatalogSearch(plant.query, plant.slug)}
          />
        ) : page === "saved" ? (
          <SavedPage
            copy={copy}
            language={language}
            plants={plants}
            favoritePlantIds={favoritePlantIds}
            user={user}
            onOpenPlant={handleOpenSavedPlant}
            onSignIn={handleSignIn}
          />
        ) : page === "me" ? (
          <MePage
            copy={copy}
            user={user}
            favoriteCount={favoritePlantIds.length}
            onSignIn={handleSignIn}
            onSignOut={handleSignOut}
          />
        ) : (
          <PlantsPage
            copy={copy}
            language={language}
            plants={plants}
            isLoading={plantsStatus === "loading"}
            loadError={plantsError}
            user={user}
            favoritePlantIds={favoritePlantIds}
            onToggleFavorite={handleToggleFavorite}
            onSignIn={handleSignIn}
            selectedPlantSlug={selectedPlantSlug}
            searchSeed={catalogSeed}
            onSelectPlant={setSelectedPlantSlug}
          />
        )}
      </main>
      <MobileNav copy={copy} page={page} onNavigate={handleNavigate} />
    </div>
  );
}
