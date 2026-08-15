import { onAuthStateChanged } from "firebase/auth";
import { useDeferredValue, useEffect, useRef, useState } from "react";
import { auth, signInWithGoogle, signOutUser } from "./lib/firebase";
import {
  disablePlantUpdates,
  enablePlantUpdates,
  getPlantUpdatesCapability,
  syncPlantUpdatesLanguage,
  watchPlantUpdatesPreference,
} from "./lib/plantUpdates";
import {
  deletePlantRecord,
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
const SEARCH_RESULTS_BATCH_SIZE = 24;
const LANGUAGE_STORAGE_KEY = "nattuvaidyam-language";
const INSTALL_PROMPT_STORAGE_KEY = "nattuvaidyam-install-prompt-dismissed-until-v3";
const INSTALL_PROMPT_FOREVER_STORAGE_KEY = "nattuvaidyam-install-prompt-dismissed-forever-v3";
const INSTALL_PROMPT_DISMISS_MS = 15 * 24 * 60 * 60 * 1000;
const SITE_URL = "https://nattuvaidyam.in";
const DEFAULT_SEO_DESCRIPTION =
  "Search Kerala medicinal plants by name, symptom, disease, and traditional remedy.";
const DEFAULT_OG_IMAGE = `${SITE_URL}/medlogo.png?v=20260802a`;

function getInstallPromptCooldownUntil() {
  if (typeof window === "undefined") {
    return 0;
  }

  const storedValue = Number(window.localStorage.getItem(INSTALL_PROMPT_STORAGE_KEY));

  if (!Number.isFinite(storedValue) || storedValue <= Date.now()) {
    window.localStorage.removeItem(INSTALL_PROMPT_STORAGE_KEY);
    return 0;
  }

  return storedValue;
}

function getInstallPromptDismissedForever() {
  if (typeof window === "undefined") {
    return false;
  }

  return window.localStorage.getItem(INSTALL_PROMPT_FOREVER_STORAGE_KEY) === "true";
}

function detectInstallPlatform() {
  if (typeof window === "undefined") {
    return null;
  }

  const userAgent = window.navigator.userAgent || "";
  const isTouchMac =
    window.navigator.platform === "MacIntel" && window.navigator.maxTouchPoints > 1;

  if (/android/i.test(userAgent)) {
    return "android";
  }

  if (/(iphone|ipad|ipod)/i.test(userAgent) || isTouchMac) {
    return "ios";
  }

  return null;
}

function isStandaloneApp() {
  if (typeof window === "undefined") {
    return false;
  }

  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    window.navigator.standalone === true
  );
}

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
      quickTags: ["ചുമ", "പനി", "ത്വക്ക്", "പ്രമേഹം"],
    },
    featured: {
      kicker: "ഹോം ഹൈലൈറ്റുകൾ",
      title: "ഏറ്റവും ജനപ്രിയ സസ്യം",
      description:
        "പിന്നീട് വീണ്ടും കാണാനായി പലരും save ചെയ്യുന്ന ഒരു പ്രധാന സസ്യം.",
      popularLabel: "ഏറ്റവും ജനപ്രിയം",
      exploreLabel: "തുറക്കുക",
      savedRailLabel: "കൂടുതൽ save ചെയ്ത സസ്യങ്ങൾ",
      loadingLabel: "പ്രധാന സസ്യത്തിന്റെ വിവരങ്ങൾ കൊണ്ടുവരുന്നു",
      noPlantsLabel: "പ്രധാന സസ്യം ഉടൻ കാണിക്കും",
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
      searchPlaceholder: "സസ്യം, രോഗം, ലക്ഷണം എന്നിവ തിരയൂ",
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
      languageLabel: "ഇഷ്ടഭാഷ",
      languageNote: "ഇവിടെ തിരഞ്ഞെടുക്കുന്ന ഭാഷ പിന്നീട് default ആയി തുടരാം.",
      installLabel: "ആപ്പ് ഇൻസ്റ്റാൾ",
      installNote: "ഓട്ടോമാറ്റിക് popup അടച്ചാലും ഇവിടെ നിന്ന് install guide വീണ്ടും തുറക്കാം.",
      installAction: "Install guide",
      plantUpdatesLabel: "സസ്യ അപ്ഡേറ്റുകൾ",
      plantUpdatesNote: "മൂന്ന് ദിവസത്തിൽ ഒരിക്കൽ ഒരു ഔഷധസസ്യത്തെ കുറിച്ചുള്ള അറിയിപ്പ് ലഭിക്കും.",
      plantUpdatesEnabled: "അപ്ഡേറ്റുകൾ ഓണാണ്",
      plantUpdatesDisabled: "അപ്ഡേറ്റുകൾ ഓഫ് ആണ്",
      plantUpdatesEveryThreeDays: "ഓരോ 3 ദിവസത്തിലും",
      plantUpdatesInstallFirst: "ഈ അറിയിപ്പുകൾ ലഭിക്കാൻ ആദ്യം ആപ്പ് ഇൻസ്റ്റാൾ ചെയ്യൂ.",
      plantUpdatesUnsupported: "ഈ ഉപകരണത്തിൽ web push notifications ലഭ്യമല്ല.",
      plantUpdatesDenied:
        "Notifications block ചെയ്തിരിക്കുന്നു. browser settings-ൽ notifications allow ചെയ്താൽ വീണ്ടും ഓൺ ചെയ്യാം.",
      plantUpdatesNotConfigured: "Push notifications ഇനിയും ക്രമീകരിച്ചിട്ടില്ല.",
      plantUpdatesOnLabel: "ഓൺ",
      plantUpdatesOffLabel: "ഓഫ്",
      malayalamComingSoonTitle: "Malayalam is coming soon",
      malayalamComingSoonMessage:
        "We are still refining the Malayalam translation. For now, this is available only in English.",
      malayalamComingSoonAction: "OK",
      languageChoices: {
        en: "English",
        ml: "Malayalam",
      },
      note: "നിങ്ങൾ save ചെയ്യുന്ന സസ്യങ്ങൾ പിന്നീട് എളുപ്പത്തിൽ വീണ്ടും കാണാനായി നിങ്ങളുടെ അക്കൗണ്ടിൽ സൂക്ഷിക്കും.",
    },
    installPrompt: {
      eyebrow: "ആപ്പ് ഇൻസ്റ്റാൾ",
      title: "Nattuvaidyam ഹോം സ്ക്രീനിൽ വെക്കൂ",
      description:
        "സസ്യങ്ങൾ വേഗത്തിൽ തുറക്കാനും mobile app പോലെ ഒരു tap-ൽ ഉപയോഗിക്കാനും ഹോം സ്ക്രീനിലേക്ക് ചേർക്കൂ.",
      iosHint: "iPhone-ൽ Safari ഉപയോഗിക്കുമ്പോൾ താഴെയുള്ള steps പിന്തുടരൂ.",
      iosSteps: [
        "Safari-യിലെ Share button തട്ടൂ",
        "\"Add to Home Screen\" തിരഞ്ഞെടുക്കൂ",
        "\"Add\" തട്ടി പൂർത്തിയാക്കൂ",
      ],
      androidHint: "ഒരു tap മതി. app നിങ്ങളുടെ ഫോണിൽ install prompt തുറക്കും.",
      androidManualHint:
        "Install prompt കാണുന്നില്ലെങ്കിൽ browser menu തുറന്ന് \"Add to Home screen\" അല്ലെങ്കിൽ \"Install app\" തിരഞ്ഞെടുക്കൂ.",
      later: "പിന്നീട്",
      iosAction: "ശരി",
      androidAction: "Install",
      androidManualAction: "ശരി",
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
      loadMoreLabel: "കൂടുതൽ കാണിക്കുക",
      filtersCountLabel: "ഫിൽട്ടറുകൾ",
      activeFilterLabel: "ഫിൽട്ടർ സജീവമാണ്",
      activeFiltersLabel: "ഫിൽട്ടറുകൾ സജീവമാണ്",
      backToResultsLabel: "മടങ്ങുക",
      backToSavedLabel: "മടങ്ങുക",
      browsePlantsLabel: "സസ്യങ്ങൾ കാണുക",
      nextPlantLabel: "അടുത്തത്",
      emptyTitle: "ഫലങ്ങൾ ലഭിച്ചില്ല",
      emptyDescription:
        "മറ്റൊരു spelling ശ്രമിക്കുകയോ filters clear ചെയ്യുകയോ ചെയ്യൂ. വലിയ dataset-ലും തിരച്ചിൽ സഹായിക്കാൻ ഈ പേജ് query-based filtering ഉപയോഗിക്കുന്നു.",
      loadingTitle: "സസ്യങ്ങൾ ലോഡ് ചെയ്യുന്നു",
      loadingDescription: "ഔഷധസസ്യങ്ങളുടെ വിവരങ്ങൾ കൊണ്ടുവരുന്നു.",
      missingPlantTitle: "ഈ ഷെയർ ചെയ്ത സസ്യം ലഭ്യമല്ല",
      missingPlantDescription:
        "ഈ link പഴയതായിരിക്കാം അല്ലെങ്കിൽ സസ്യവിവരം ഇപ്പോൾ ലഭ്യമല്ല. താഴെയുള്ള button ഉപയോഗിച്ച് മറ്റ് സസ്യങ്ങൾ പരിശോധിക്കാം.",
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
      "ഈ വിവരങ്ങൾ പരമ്പരാഗത അറിവിനെ അടിസ്ഥാനമാക്കിയതാണ്. ഏതെങ്കിലും സസ്യം അല്ലെങ്കിൽ ചികിത്സാമാർഗം ഉപയോഗിക്കുന്നതിന് മുമ്പ് യോഗ്യനായ മെഡിക്കൽ പ്രാക്ടീഷണറെ സമീപിക്കുക.",
    confirm: {
      cancel: "റദ്ദാക്കുക",
      signOutTitle: "സൈൻ ഔട്ട് ചെയ്യണോ?",
      signOutDescription: "ഈ ഉപകരണത്തിൽ നിന്ന് നിങ്ങളുടെ അക്കൗണ്ട് സൈൻ ഔട്ട് ചെയ്യും.",
      signOutAction: "സൈൻ ഔട്ട്",
      deleteTitle: "ഈ രേഖ നീക്കണോ?",
      deleteDescription: "ഇത് Firestore-ൽ നിന്ന് സ്ഥിരമായി നീക്കം ചെയ്യും.",
      deleteAction: "ഡിലീറ്റ് ചെയ്യുക",
    },
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
      placeholder: "Search by plant, cough, diabetes, skin care",
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
      loadingLabel: "Loading featured plant details",
      noPlantsLabel: "Featured plant will appear here soon",
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
      searchPlaceholder: "Search plants, diseases, symptoms",
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
      languageLabel: "Preferred language",
      languageNote: "Your selection here will be saved as the default language.",
      installLabel: "Install app",
      installNote: "Open the install guide here any time, even after closing the auto popup.",
      installAction: "Open install guide",
      plantUpdatesLabel: "Plant updates",
      plantUpdatesNote: "Receive one medicinal plant update every 3 days.",
      plantUpdatesEnabled: "Plant updates are on",
      plantUpdatesDisabled: "Plant updates are off",
      plantUpdatesEveryThreeDays: "Every 3 days",
      plantUpdatesInstallFirst: "Install the app first to receive these updates.",
      plantUpdatesUnsupported: "Web push notifications are not supported on this device.",
      plantUpdatesDenied:
        "Notifications are blocked. Allow them in browser settings and then try again.",
      plantUpdatesNotConfigured: "Push notifications are not configured yet.",
      plantUpdatesOnLabel: "On",
      plantUpdatesOffLabel: "Off",
      malayalamComingSoonTitle: "Malayalam is coming soon",
      malayalamComingSoonMessage:
        "We are still refining the Malayalam translation. For now, this is available only in English.",
      malayalamComingSoonAction: "OK",
      languageChoices: {
        en: "English",
        ml: "Malayalam",
      },
      note: "Plants you save stay available in your account so you can come back to them later.",
    },
    installPrompt: {
      eyebrow: "Install app",
      title: "Keep Nattuvaidyam on your home screen",
      description:
        "Open plants faster, keep the app one tap away, and use the mobile experience like an installed app.",
      iosHint: "On iPhone, follow these Safari steps to add the app.",
      iosSteps: [
        "Tap the Share button in Safari",
        "Choose Add to Home Screen",
        "Tap Add",
      ],
      androidHint: "One tap opens the install prompt on your phone.",
      androidManualHint:
        "If the install prompt does not appear yet, open the browser menu and choose Add to Home screen or Install app.",
      later: "Later",
      iosAction: "Got it",
      androidAction: "Install",
      androidManualAction: "Got it",
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
      loadMoreLabel: "Load more",
      filtersCountLabel: "filters",
      activeFilterLabel: "active filter",
      activeFiltersLabel: "active filters",
      backToResultsLabel: "Back",
      backToSavedLabel: "Back",
      browsePlantsLabel: "Browse plants",
      nextPlantLabel: "Next",
      emptyTitle: "No matching plants found",
      emptyDescription:
        "Try another spelling or clear your filters. The catalog search is designed to support larger datasets with layered filtering.",
      loadingTitle: "Loading plants",
      loadingDescription: "Fetching medicinal plant details.",
      missingPlantTitle: "This shared plant link is no longer available",
      missingPlantDescription:
        "The link may be outdated or the plant record is unavailable right now. You can still browse the plant catalog below.",
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
      "This information is based on traditional knowledge. Consult a qualified medical practitioner before using any plant or remedy.",
    confirm: {
      cancel: "Cancel",
      signOutTitle: "Sign out?",
      signOutDescription: "This will sign your account out on this device.",
      signOutAction: "Sign out",
      deleteTitle: "Delete this record?",
      deleteDescription: "This will permanently remove the plant from Firestore.",
      deleteAction: "Delete",
    },
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
    "This information is based on traditional knowledge. Consult a qualified medical practitioner before using any plant or remedy.",
};

const navIcons = {
  home: "⌂",
  plants: "🌿",
  saved: "★",
  me: "◎",
};

function getInitialAppStateForUrl(urlString = null) {
  if (typeof window === "undefined" && !urlString) {
    return {
      language: "en",
      page: "home",
      adminSection: "home",
      catalogSeed: { query: "", openDetail: false },
      selectedPlantSlug: null,
      plantDetailOpen: false,
    };
  }

  const url = new URL(
    urlString || (typeof window !== "undefined" ? window.location.href : "https://nattuvaidyam.in/"),
  );
  const pathname = url.pathname.replace(/\/+$/, "") || "/";
  const segments = pathname
    .split("/")
    .filter(Boolean)
    .map((segment) => decodeURIComponent(segment));
  const params = url.searchParams;
  const storedLanguage =
    typeof window !== "undefined" && window.localStorage.getItem(LANGUAGE_STORAGE_KEY) === "ml"
      ? "ml"
      : "en";
  const language = params.has("lang")
    ? params.get("lang") === "ml"
      ? "ml"
      : "en"
    : storedLanguage;

  if (pathname === "/admin" || pathname === "/admin/new" || pathname === "/admin/edit") {
    return {
      language,
      page: "admin",
      adminSection:
        pathname === "/admin/new"
          ? "new"
          : pathname === "/admin/edit"
            ? "edit"
            : "home",
      catalogSeed: { query: "", openDetail: false },
      selectedPlantSlug: null,
      plantDetailOpen: false,
    };
  }

  let page = "home";
  let query = params.get("q")?.trim() ?? "";
  let selectedPlantSlug = null;
  let plantDetailOpen = false;
  const reservedTopLevelRoutes = new Set(["admin", "saved", "me", "search", "plants"]);

  if (segments[0] === "saved") {
    page = "saved";
  } else if (segments[0] === "me") {
    page = "me";
  } else if (segments[0] === "search") {
    page = "plants";
  } else if (segments[0] === "plants" && segments[1]) {
    page = "plants";
    selectedPlantSlug = segments.slice(1).join("/");
    plantDetailOpen = true;
  } else if (segments.length === 1 && !reservedTopLevelRoutes.has(segments[0])) {
    page = "plants";
    selectedPlantSlug = segments[0];
    plantDetailOpen = true;
  } else {
    const requestedPage = params.get("page");
    const legacySelectedPlantSlug = params.get("plant")?.trim() || null;
    page = ["home", "plants", "saved", "me"].includes(requestedPage)
      ? requestedPage
      : legacySelectedPlantSlug || query
        ? "plants"
        : "home";
    selectedPlantSlug = legacySelectedPlantSlug;
    plantDetailOpen = Boolean(legacySelectedPlantSlug);
  }

  return {
    language,
    page,
    adminSection: "home",
    catalogSeed: {
      query,
      openDetail: plantDetailOpen,
    },
    selectedPlantSlug,
    plantDetailOpen,
  };
}

function getInitialAppState() {
  return getInitialAppStateForUrl();
}

function buildAppUrl({
  language,
  page,
  query = "",
  plantSlug = null,
  adminSection = "home",
  detailOpen = false,
}) {
  if (typeof window === "undefined") {
    return "";
  }

  const url = new URL(window.location.href);

  url.searchParams.delete("lang");
  url.searchParams.delete("page");
  url.searchParams.delete("q");
  url.searchParams.delete("plant");

  if (page === "admin") {
    url.pathname =
      adminSection === "new"
        ? "/admin/new"
        : adminSection === "edit"
          ? "/admin/edit"
          : "/admin";
    url.hash = "";
    return `${url.origin}${url.pathname}${url.search}`;
  }

  if (language === "ml") {
    url.searchParams.set("lang", language);
  }

  if (page === "saved") {
    url.pathname = "/saved";
  } else if (page === "me") {
    url.pathname = "/me";
  } else if (page === "plants") {
    url.pathname =
      detailOpen && plantSlug ? `/plants/${encodeURIComponent(plantSlug)}` : "/search";
    if (query.trim()) {
      url.searchParams.set("q", query.trim());
    }
  } else {
    url.pathname = "/";
  }

  url.hash = "";
  return `${url.origin}${url.pathname}${url.search}`;
}

function buildCanonicalUrl({ language, page, plantSlug = null, adminSection = "home", detailOpen = false }) {
  const url = new URL(SITE_URL);

  if (page === "admin") {
    url.pathname =
      adminSection === "new"
        ? "/admin/new"
        : adminSection === "edit"
          ? "/admin/edit"
          : "/admin";
  } else if (page === "saved") {
    url.pathname = "/saved";
  } else if (page === "me") {
    url.pathname = "/me";
  } else if (page === "plants") {
    url.pathname =
      detailOpen && plantSlug ? `/plants/${encodeURIComponent(plantSlug)}` : "/search";
  } else {
    url.pathname = "/";
  }

  if (language === "ml") {
    url.searchParams.set("lang", "ml");
  }

  return `${url.origin}${url.pathname}${url.search}`;
}

function truncateText(text, maxLength = 160) {
  const normalizedText = (text ?? "").trim().replace(/\s+/g, " ");

  if (!normalizedText || normalizedText.length <= maxLength) {
    return normalizedText;
  }

  return `${normalizedText.slice(0, maxLength - 1).trimEnd()}…`;
}

function toAbsoluteUrl(url) {
  if (!url) {
    return DEFAULT_OG_IMAGE;
  }

  try {
    return new URL(url, SITE_URL).toString();
  } catch {
    return DEFAULT_OG_IMAGE;
  }
}

function setMetaTag(selector, value, attribute = "content") {
  if (typeof document === "undefined") {
    return;
  }

  const element = document.querySelector(selector);
  if (!element) {
    return;
  }

  element.setAttribute(attribute, value);
}

function buildStructuredData({ title, description, canonicalUrl, localizedPlant }) {
  const webPage = {
    "@type": "WebPage",
    "@id": `${canonicalUrl}#webpage`,
    url: canonicalUrl,
    name: title,
    description,
    isPartOf: {
      "@id": `${SITE_URL}/#website`,
    },
  };

  if (!localizedPlant) {
    return {
      "@context": "https://schema.org",
      "@graph": [webPage],
    };
  }

  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        ...webPage,
        about: {
          "@id": `${canonicalUrl}#plant`,
        },
        breadcrumb: {
          "@id": `${canonicalUrl}#breadcrumb`,
        },
      },
      {
        "@type": "BreadcrumbList",
        "@id": `${canonicalUrl}#breadcrumb`,
        itemListElement: [
          {
            "@type": "ListItem",
            position: 1,
            name: "Home",
            item: SITE_URL,
          },
          {
            "@type": "ListItem",
            position: 2,
            name: "Medicinal plants",
            item: `${SITE_URL}/search`,
          },
          {
            "@type": "ListItem",
            position: 3,
            name: localizedPlant.name,
            item: canonicalUrl,
          },
        ],
      },
      {
        "@type": "Thing",
        "@id": `${canonicalUrl}#plant`,
        name: localizedPlant.name,
        description,
        url: canonicalUrl,
        image: toAbsoluteUrl(localizedPlant.image?.src),
        alternateName: localizedPlant.aliases?.slice(0, 8) ?? [],
        additionalProperty: localizedPlant.family
          ? [
              {
                "@type": "PropertyValue",
                name: "Family",
                value: localizedPlant.family,
              },
              {
                "@type": "PropertyValue",
                name: "Scientific name",
                value: localizedPlant.scientific,
              },
            ]
          : [
              {
                "@type": "PropertyValue",
                name: "Scientific name",
                value: localizedPlant.scientific,
              },
            ],
      },
    ],
  };
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

function createEmptyJsonImportMedia() {
  return {
    imageAltEn: "",
    imageAltMl: "",
    imageFileDataUrl: "",
    imageFileName: "",
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

function applyImportedImage(record, jsonImportMedia) {
  const imageSrc = jsonImportMedia.imageFileDataUrl;

  if (!imageSrc) {
    return record;
  }

  return {
    ...record,
    image: {
      src: imageSrc,
      alt: {
        en:
          jsonImportMedia.imageAltEn.trim() ||
          record.image?.alt?.en ||
          record.common_name?.en ||
          record.scientific_name ||
          "",
        ml:
          jsonImportMedia.imageAltMl.trim() ||
          record.image?.alt?.ml ||
          record.common_name?.ml ||
          record.scientific_name ||
          "",
      },
    },
  };
}

function joinListForForm(value) {
  return Array.isArray(value) ? value.join(", ") : "";
}

function mapPlantRecordToForm(record) {
  const aliasCategories = Array.from(
    new Set([
      ...Object.keys(record.other_names?.en ?? {}),
      ...Object.keys(record.other_names?.ml ?? {}),
    ]),
  );

  const aliases = aliasCategories.length
    ? aliasCategories.map((category) => ({
        category,
        en: joinListForForm(record.other_names?.en?.[category]),
        ml: joinListForForm(record.other_names?.ml?.[category]),
      }))
    : [createEmptyAliasRow()];

  const constituentParts = Array.from(
    new Set([
      ...Object.keys(record.chemical_constituents?.en ?? {}),
      ...Object.keys(record.chemical_constituents?.ml ?? {}),
    ]),
  );

  const constituents = constituentParts.length
    ? constituentParts.map((partEnOrMl) => ({
        partEn:
          Object.keys(record.chemical_constituents?.en ?? {}).find(
            (key) => key === partEnOrMl,
          ) ?? "",
        descriptionEn: record.chemical_constituents?.en?.[partEnOrMl] ?? "",
        partMl:
          Object.keys(record.chemical_constituents?.ml ?? {}).find(
            (key) => key === partEnOrMl,
          ) ?? "",
        descriptionMl: record.chemical_constituents?.ml?.[partEnOrMl] ?? "",
      }))
    : [createEmptyConstituentRow()];

  const treatments = Array.isArray(record.treatments) && record.treatments.length
    ? record.treatments.map((entry) => ({
        conditionEn: entry.condition?.en ?? "",
        conditionMl: entry.condition?.ml ?? "",
        remedyEn: entry.remedy?.en ?? "",
        remedyMl: entry.remedy?.ml ?? "",
      }))
    : [createEmptyTreatmentRow()];

  return {
    id: record.id ?? "",
    scientificName: record.scientific_name ?? "",
    commonNameEn: record.common_name?.en ?? "",
    commonNameMl: record.common_name?.ml ?? "",
    familyEn: record.family?.en ?? "",
    familyMl: record.family?.ml ?? "",
    overviewEn: record.overview?.en ?? "",
    overviewMl: record.overview?.ml ?? "",
    medicinalUsesEn: joinListForForm(record.medicinal_uses?.en),
    medicinalUsesMl: joinListForForm(record.medicinal_uses?.ml),
    characteristicsEn: record.plant_characteristics?.en ?? "",
    characteristicsMl: record.plant_characteristics?.ml ?? "",
    habitatEn: record.habitat?.en ?? "",
    habitatMl: record.habitat?.ml ?? "",
    medicinalPropertiesEn: record.medicinal_properties?.en ?? "",
    medicinalPropertiesMl: record.medicinal_properties?.ml ?? "",
    imageUrl: record.image?.src ?? "",
    imageAltEn: record.image?.alt?.en ?? "",
    imageAltMl: record.image?.alt?.ml ?? "",
    imageFileDataUrl: "",
    aliases,
    constituents,
    treatments,
  };
}

function createEmptyAdminImageForm() {
  return {
    plantId: "",
    imageFileDataUrl: "",
    imageFileName: "",
    imageDescriptionEn: "",
    imageDescriptionMl: "",
    currentImageSrc: "",
  };
}

function mapPlantRecordToImageForm(record) {
  return {
    plantId: record.id ?? "",
    imageFileDataUrl: "",
    imageFileName: "",
    imageDescriptionEn: record.image?.alt?.en ?? "",
    imageDescriptionMl: record.image?.alt?.ml ?? "",
    currentImageSrc: record.image?.src ?? "",
  };
}

function getPlantDisplayName(record) {
  return record.common_name?.en || record.scientific_name || record.id;
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

function Header({ copy, page, onNavigate, isScrolled }) {
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

function ConfirmDialog({
  isOpen,
  title,
  description,
  confirmLabel,
  cancelLabel,
  onConfirm,
  onCancel,
  isDestructive = false,
}) {
  if (!isOpen) {
    return null;
  }

  return (
    <div className="confirm-dialog-backdrop" onClick={onCancel}>
      <section
        className="confirm-dialog"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="confirm-dialog-copy">
          <h3>{title}</h3>
          {description ? <p>{description}</p> : null}
        </div>
        <div className="confirm-dialog-actions">
          <button type="button" className="ghost-button" onClick={onCancel}>
            {cancelLabel}
          </button>
          <button
            type="button"
            className={isDestructive ? "confirm-dialog-button is-danger" : "confirm-dialog-button"}
            onClick={() => void onConfirm()}
          >
            {confirmLabel}
          </button>
        </div>
      </section>
    </div>
  );
}

function NoticeDialog({ isOpen, title, description, actionLabel, onClose }) {
  if (!isOpen) {
    return null;
  }

  return (
    <div className="confirm-dialog-backdrop" onClick={onClose}>
      <section
        className="confirm-dialog"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="confirm-dialog-copy">
          <h3>{title}</h3>
          {description ? <p>{description}</p> : null}
        </div>
        <div className="confirm-dialog-actions is-single">
          <button type="button" className="confirm-dialog-button" onClick={onClose}>
            {actionLabel}
          </button>
        </div>
      </section>
    </div>
  );
}

function AdminPlantForm({
  title,
  description,
  form,
  onFieldChange,
  onArrayRowChange,
  onAddArrayRow,
  onRemoveArrayRow,
  onImageUpload,
  onSave,
  onReset,
  saveLabel,
  resetLabel,
  isSaving,
  lockId = false,
}) {
  return (
    <div className="admin-panel-grid">
      <section className="admin-panel">
        <div className="admin-section-head">
          <div>
            <h3>{title}</h3>
            {description ? <p className="admin-section-copy">{description}</p> : null}
          </div>
        </div>
        <div className="admin-form-grid">
          <label className="admin-field">
            <span>Plant ID</span>
            <input
              type="text"
              value={form.id}
              onChange={(event) => onFieldChange("id", event.target.value)}
              placeholder="sesbania-grandiflora"
              disabled={lockId}
            />
          </label>
          <label className="admin-field">
            <span>Scientific name</span>
            <input
              type="text"
              value={form.scientificName}
              onChange={(event) => onFieldChange("scientificName", event.target.value)}
              placeholder="Sesbania grandiflora"
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
              onChange={(event) => onFieldChange("commonNameEn", event.target.value)}
            />
          </label>
          <label className="admin-field">
            <span>Common name (Malayalam)</span>
            <input
              type="text"
              value={form.commonNameMl}
              onChange={(event) => onFieldChange("commonNameMl", event.target.value)}
            />
          </label>
          <label className="admin-field">
            <span>Family (English)</span>
            <input
              type="text"
              value={form.familyEn}
              onChange={(event) => onFieldChange("familyEn", event.target.value)}
            />
          </label>
          <label className="admin-field">
            <span>Family (Malayalam)</span>
            <input
              type="text"
              value={form.familyMl}
              onChange={(event) => onFieldChange("familyMl", event.target.value)}
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
              onChange={(event) => onFieldChange("overviewEn", event.target.value)}
            />
          </label>
          <label className="admin-field">
            <span>Overview (Malayalam)</span>
            <textarea
              rows="5"
              value={form.overviewMl}
              onChange={(event) => onFieldChange("overviewMl", event.target.value)}
            />
          </label>
          <label className="admin-field">
            <span>Medicinal uses (English)</span>
            <textarea
              rows="5"
              value={form.medicinalUsesEn}
              onChange={(event) => onFieldChange("medicinalUsesEn", event.target.value)}
              placeholder="One per line or comma separated"
            />
          </label>
          <label className="admin-field">
            <span>Medicinal uses (Malayalam)</span>
            <textarea
              rows="5"
              value={form.medicinalUsesMl}
              onChange={(event) => onFieldChange("medicinalUsesMl", event.target.value)}
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
              onChange={(event) => onFieldChange("characteristicsEn", event.target.value)}
            />
          </label>
          <label className="admin-field">
            <span>Plant characteristics (Malayalam)</span>
            <textarea
              rows="5"
              value={form.characteristicsMl}
              onChange={(event) => onFieldChange("characteristicsMl", event.target.value)}
            />
          </label>
          <label className="admin-field">
            <span>Habitat (English)</span>
            <textarea
              rows="4"
              value={form.habitatEn}
              onChange={(event) => onFieldChange("habitatEn", event.target.value)}
            />
          </label>
          <label className="admin-field">
            <span>Habitat (Malayalam)</span>
            <textarea
              rows="4"
              value={form.habitatMl}
              onChange={(event) => onFieldChange("habitatMl", event.target.value)}
            />
          </label>
          <label className="admin-field">
            <span>Medicinal properties (English)</span>
            <textarea
              rows="5"
              value={form.medicinalPropertiesEn}
              onChange={(event) => onFieldChange("medicinalPropertiesEn", event.target.value)}
            />
          </label>
          <label className="admin-field">
            <span>Medicinal properties (Malayalam)</span>
            <textarea
              rows="5"
              value={form.medicinalPropertiesMl}
              onChange={(event) => onFieldChange("medicinalPropertiesMl", event.target.value)}
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
            <span>Upload image</span>
            <input type="file" accept="image/*" onChange={onImageUpload} />
          </label>
          <label className="admin-field">
            <span>Image description (English)</span>
            <input
              type="text"
              value={form.imageAltEn}
              onChange={(event) => onFieldChange("imageAltEn", event.target.value)}
            />
          </label>
          <label className="admin-field">
            <span>Image description (Malayalam)</span>
            <input
              type="text"
              value={form.imageAltMl}
              onChange={(event) => onFieldChange("imageAltMl", event.target.value)}
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
            onClick={() => onAddArrayRow("aliases", createEmptyAliasRow)}
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
                      onArrayRowChange("aliases", index, "category", event.target.value)
                    }
                  />
                </label>
                <label className="admin-field">
                  <span>English names</span>
                  <input
                    type="text"
                    value={row.en}
                    onChange={(event) => onArrayRowChange("aliases", index, "en", event.target.value)}
                    placeholder="Comma separated"
                  />
                </label>
                <label className="admin-field">
                  <span>Malayalam names</span>
                  <input
                    type="text"
                    value={row.ml}
                    onChange={(event) => onArrayRowChange("aliases", index, "ml", event.target.value)}
                    placeholder="Comma separated"
                  />
                </label>
              </div>
              <button
                type="button"
                className="ghost-button admin-remove-button"
                onClick={() => onRemoveArrayRow("aliases", index)}
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
            onClick={() => onAddArrayRow("constituents", createEmptyConstituentRow)}
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
                      onArrayRowChange("constituents", index, "partEn", event.target.value)
                    }
                  />
                </label>
                <label className="admin-field">
                  <span>Description (English)</span>
                  <textarea
                    rows="3"
                    value={row.descriptionEn}
                    onChange={(event) =>
                      onArrayRowChange("constituents", index, "descriptionEn", event.target.value)
                    }
                  />
                </label>
                <label className="admin-field">
                  <span>Part (Malayalam)</span>
                  <input
                    type="text"
                    value={row.partMl}
                    onChange={(event) =>
                      onArrayRowChange("constituents", index, "partMl", event.target.value)
                    }
                  />
                </label>
                <label className="admin-field">
                  <span>Description (Malayalam)</span>
                  <textarea
                    rows="3"
                    value={row.descriptionMl}
                    onChange={(event) =>
                      onArrayRowChange("constituents", index, "descriptionMl", event.target.value)
                    }
                  />
                </label>
              </div>
              <button
                type="button"
                className="ghost-button admin-remove-button"
                onClick={() => onRemoveArrayRow("constituents", index)}
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
            onClick={() => onAddArrayRow("treatments", createEmptyTreatmentRow)}
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
                      onArrayRowChange("treatments", index, "conditionEn", event.target.value)
                    }
                  />
                </label>
                <label className="admin-field">
                  <span>Condition (Malayalam)</span>
                  <input
                    type="text"
                    value={row.conditionMl}
                    onChange={(event) =>
                      onArrayRowChange("treatments", index, "conditionMl", event.target.value)
                    }
                  />
                </label>
                <label className="admin-field">
                  <span>Remedy (English)</span>
                  <textarea
                    rows="3"
                    value={row.remedyEn}
                    onChange={(event) =>
                      onArrayRowChange("treatments", index, "remedyEn", event.target.value)
                    }
                  />
                </label>
                <label className="admin-field">
                  <span>Remedy (Malayalam)</span>
                  <textarea
                    rows="3"
                    value={row.remedyMl}
                    onChange={(event) =>
                      onArrayRowChange("treatments", index, "remedyMl", event.target.value)
                    }
                  />
                </label>
              </div>
              <button
                type="button"
                className="ghost-button admin-remove-button"
                onClick={() => onRemoveArrayRow("treatments", index)}
              >
                Remove
              </button>
            </div>
          ))}
        </div>
      </section>

      <div className="admin-submit-row">
        <button type="button" className="admin-primary-button" onClick={() => void onSave()} disabled={isSaving}>
          {isSaving ? "Saving..." : saveLabel}
        </button>
        {onReset ? (
          <button type="button" className="ghost-button" onClick={onReset} disabled={isSaving}>
            {resetLabel}
          </button>
        ) : null}
      </div>
    </div>
  );
}

function AdminPage({
  user,
  plants,
  adminSection,
  confirmCopy,
  onAdminNavigate,
  onSignIn,
  onSignOut,
  onPlantsChanged,
}) {
  const isAdmin = user?.email?.toLowerCase() === ADMIN_EMAIL;
  const [newEntryMode, setNewEntryMode] = useState("form");
  const [newForm, setNewForm] = useState(() => createEmptyAdminForm());
  const [editForm, setEditForm] = useState(() => createEmptyAdminForm());
  const [jsonText, setJsonText] = useState("");
  const [jsonFileName, setJsonFileName] = useState("");
  const [jsonImportMedia, setJsonImportMedia] = useState(() => createEmptyJsonImportMedia());
  const [editingPlantId, setEditingPlantId] = useState("");
  const [adminSearchQuery, setAdminSearchQuery] = useState("");
  const [pendingDeleteRecord, setPendingDeleteRecord] = useState(null);
  const [feedback, setFeedback] = useState({ tone: "", message: "" });
  const [isSaving, setIsSaving] = useState(false);
  const deferredAdminSearchQuery = useDeferredValue(adminSearchQuery.trim());

  useEffect(() => {
    if (!feedback.message) {
      return undefined;
    }

    const timeoutId = window.setTimeout(() => {
      setFeedback({ tone: "", message: "" });
    }, 3000);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [feedback]);

  function updateFormField(setter, key, value) {
    setter((current) => ({
      ...current,
      [key]: value,
    }));
  }

  function updateArrayRow(setter, key, index, field, value) {
    setter((current) => ({
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

  function addArrayRow(setter, key, createRow) {
    setter((current) => ({
      ...current,
      [key]: [...current[key], createRow()],
    }));
  }

  function removeArrayRow(setter, key, index) {
    setter((current) => ({
      ...current,
      [key]:
        current[key].length === 1
          ? current[key]
          : current[key].filter((_, rowIndex) => rowIndex !== index),
    }));
  }

  async function handleImageUpload(setter, event) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    try {
      const imageFileDataUrl = await readFileAsDataUrl(file);
      setter((current) => ({
        ...current,
        imageUrl: "",
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

  function resetNewForm() {
    setNewForm(createEmptyAdminForm());
  }

  function resetEditForm() {
    setEditForm(createEmptyAdminForm());
    setEditingPlantId("");
  }

  function handleSelectPlantForEdit(record) {
    setEditingPlantId(record.id);
    setEditForm(mapPlantRecordToForm(record));
    setFeedback({ tone: "", message: "" });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function confirmDeleteExistingPlant() {
    if (!pendingDeleteRecord) {
      return;
    }

    try {
      setIsSaving(true);
      await deletePlantRecord(pendingDeleteRecord.id);
      await onPlantsChanged();

      if (editingPlantId === pendingDeleteRecord.id) {
        resetEditForm();
      }

      setFeedback({
        tone: "success",
        message: `Deleted ${pendingDeleteRecord.id} from Firestore.`,
      });
    } catch (error) {
      setFeedback({
        tone: "error",
        message: error instanceof Error ? error.message : "Could not delete this plant.",
      });
    } finally {
      setPendingDeleteRecord(null);
      setIsSaving(false);
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

  async function handleJsonImageUpload(event) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    try {
      const imageFileDataUrl = await readFileAsDataUrl(file);
      setJsonImportMedia((current) => ({
        ...current,
        imageFileDataUrl,
        imageFileName: file.name,
      }));
      setFeedback({ tone: "", message: "" });
    } catch (error) {
      setFeedback({
        tone: "error",
        message: error instanceof Error ? error.message : "Could not process the image.",
      });
    }
  }

  function resetJsonImport() {
    setJsonText("");
    setJsonFileName("");
    setJsonImportMedia(createEmptyJsonImportMedia());
  }

  async function handleNewSave() {
    const record = buildPlantRecordFromForm(newForm);
    const errors = validatePlantRecord(record);

    if (errors.length) {
      setFeedback({ tone: "error", message: errors[0] });
      return;
    }

    try {
      setIsSaving(true);
      await savePlantRecord(record);
      await onPlantsChanged();
      resetNewForm();
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

  async function handleEditSave() {
    const record = buildPlantRecordFromForm(editForm);
    const errors = validatePlantRecord(record);

    if (errors.length) {
      setFeedback({ tone: "error", message: errors[0] });
      return;
    }

    try {
      setIsSaving(true);
      await savePlantRecord(record);
      await onPlantsChanged();
      setEditingPlantId(record.id);
      setEditForm((current) => ({
        ...current,
        imageUrl: current.imageFileDataUrl || current.imageUrl,
        imageFileDataUrl: "",
      }));
      setFeedback({ tone: "success", message: `Updated ${record.id} in Firestore.` });
    } catch (error) {
      setFeedback({
        tone: "error",
        message: error instanceof Error ? error.message : "Could not update this plant.",
      });
    } finally {
      setIsSaving(false);
    }
  }

  async function handleJsonSave() {
    try {
      setIsSaving(true);
      const parsed = JSON.parse(jsonText);
      const normalizedRecords = (Array.isArray(parsed) ? parsed : [parsed]).map(
        normalizeImportedPlantRecord,
      );

      if (jsonImportMedia.imageFileDataUrl && normalizedRecords.length !== 1) {
        setFeedback({
          tone: "error",
          message: "JSON image upload works only for a single plant record.",
        });
        return;
      }

      const records = jsonImportMedia.imageFileDataUrl
        ? normalizedRecords.map((record) => applyImportedImage(record, jsonImportMedia))
        : normalizedRecords;
      const firstError = records
        .map((record) => validatePlantRecord(record))
        .find((errors) => errors.length);

      if (firstError?.length) {
        setFeedback({ tone: "error", message: firstError[0] });
        return;
      }

      await Promise.all(records.map((record) => savePlantRecord(record)));
      await onPlantsChanged();
      resetJsonImport();
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

  const filteredAdminPlants = plants.filter((plant) => {
    if (!deferredAdminSearchQuery) {
      return true;
    }

    const haystack = [
      plant.id,
      plant.scientific_name,
      plant.common_name?.en,
      plant.common_name?.ml,
      plant.family?.en,
      plant.family?.ml,
      ...(plant.medicinal_uses?.en ?? []),
      ...(plant.medicinal_uses?.ml ?? []),
    ]
      .map((value) => normalizeText(value))
      .join(" ");

    return haystack.includes(normalizeText(deferredAdminSearchQuery));
  });

  return (
    <main className="admin-main">
      <section className="content-section admin-page-shell">
        <div className="admin-page-head">
          <div>
            <p className="eyebrow">Admin</p>
            <h2>Admin console</h2>
            <p className="admin-supporting-copy">
              New plant creation and existing plant editing now live in separate admin sections.
            </p>
          </div>
          <div className="admin-head-actions">
            <div className="admin-account-chip">{user.email}</div>
            <button type="button" className="ghost-button" onClick={onSignOut}>
              Sign out
            </button>
          </div>
        </div>

        <nav className="admin-page-nav" aria-label="Admin sections">
          <button
            type="button"
            className={adminSection === "home" ? "toggle-chip is-active" : "toggle-chip"}
            onClick={() => onAdminNavigate("home")}
          >
            Overview
          </button>
          <button
            type="button"
            className={adminSection === "new" ? "toggle-chip is-active" : "toggle-chip"}
            onClick={() => onAdminNavigate("new")}
          >
            Add new plant
          </button>
          <button
            type="button"
            className={adminSection === "edit" ? "toggle-chip is-active" : "toggle-chip"}
            onClick={() => onAdminNavigate("edit")}
          >
            Edit existing
          </button>
        </nav>

        {feedback.message ? (
          <div
            className={
              feedback.tone === "error" ? "admin-feedback is-error" : "admin-feedback is-success"
            }
          >
            {feedback.message}
          </div>
        ) : null}

        {adminSection === "home" ? (
          <div className="admin-hub-grid">
            <button
              type="button"
              className="admin-entry-card"
              onClick={() => onAdminNavigate("new")}
            >
              <span className="admin-entry-kicker">Create</span>
              <strong>Add new plant</strong>
              <p>Create a new record manually or import new plant records from JSON.</p>
              <span className="admin-entry-meta">Images stay inside each plant record form</span>
            </button>
            <button
              type="button"
              className="admin-entry-card"
              onClick={() => onAdminNavigate("edit")}
            >
              <span className="admin-entry-kicker">Manage</span>
              <strong>Edit existing plant</strong>
              <p>Search Firestore records, open one record, update it, or delete it.</p>
              <span className="admin-entry-meta">{plants.length} plants in Firestore</span>
            </button>
          </div>
        ) : null}

        {adminSection === "new" ? (
          <>
            <div className="admin-mode-switch">
              <button
                type="button"
                className={newEntryMode === "json" ? "toggle-chip is-active" : "toggle-chip"}
                onClick={() => setNewEntryMode("json")}
              >
                JSON upload
              </button>
              <button
                type="button"
                className={newEntryMode === "form" ? "toggle-chip is-active" : "toggle-chip"}
                onClick={() => setNewEntryMode("form")}
              >
                Manual form
              </button>
            </div>

            {newEntryMode === "form" ? (
              <AdminPlantForm
                title="Add new plant"
                description="Create a brand new plant record. Image upload belongs to this record form."
                form={newForm}
                onFieldChange={(key, value) => updateFormField(setNewForm, key, value)}
                onArrayRowChange={(key, index, field, value) =>
                  updateArrayRow(setNewForm, key, index, field, value)
                }
                onAddArrayRow={(key, createRow) => addArrayRow(setNewForm, key, createRow)}
                onRemoveArrayRow={(key, index) => removeArrayRow(setNewForm, key, index)}
                onImageUpload={(event) => void handleImageUpload(setNewForm, event)}
                onSave={handleNewSave}
                onReset={resetNewForm}
                saveLabel="Save plant"
                resetLabel="Clear form"
                isSaving={isSaving}
              />
            ) : (
              <section className="admin-panel">
                <div className="admin-section-head">
                  <div>
                    <h3>Upload JSON</h3>
                    <p className="admin-section-copy">
                      Import one plant record or a JSON array that matches the Firestore schema.
                    </p>
                  </div>
                </div>
                <div className="admin-json-import-grid">
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

                  <section className="admin-json-media-card">
                    <div className="admin-json-media-head">
                      <div>
                        <strong>Optional image for JSON import</strong>
                        <p className="admin-section-copy">
                          Use this only when importing a single plant record.
                        </p>
                      </div>
                    </div>
                    <div className="admin-form-grid two-column">
                      <label className="admin-field">
                        <span>Plant image</span>
                        <input
                          type="file"
                          accept="image/*"
                          onChange={(event) => void handleJsonImageUpload(event)}
                        />
                      </label>
                      <div className="admin-json-media-meta">
                        {jsonImportMedia.imageFileName ? (
                          <p className="admin-file-caption">
                            Image loaded: {jsonImportMedia.imageFileName}
                          </p>
                        ) : (
                          <p className="admin-file-caption">
                            No image selected yet.
                          </p>
                        )}
                      </div>
                      <label className="admin-field">
                        <span>Image alt (English)</span>
                        <input
                          type="text"
                          value={jsonImportMedia.imageAltEn}
                          onChange={(event) =>
                            setJsonImportMedia((current) => ({
                              ...current,
                              imageAltEn: event.target.value,
                            }))
                          }
                          placeholder="Plant image description in English"
                        />
                      </label>
                      <label className="admin-field">
                        <span>Image alt (Malayalam)</span>
                        <input
                          type="text"
                          value={jsonImportMedia.imageAltMl}
                          onChange={(event) =>
                            setJsonImportMedia((current) => ({
                              ...current,
                              imageAltMl: event.target.value,
                            }))
                          }
                          placeholder="ചിത്രത്തിന്റെ വിവരണം മലയാളത്തിൽ"
                        />
                      </label>
                    </div>
                    {jsonImportMedia.imageFileDataUrl ? (
                      <div className="admin-image-preview">
                        <img src={jsonImportMedia.imageFileDataUrl} alt="JSON import preview" />
                      </div>
                    ) : null}
                  </section>
                </div>
                <div className="admin-submit-row admin-json-submit-row">
                  <button
                    type="button"
                    className="admin-primary-button"
                    onClick={() => void handleJsonSave()}
                    disabled={isSaving || !jsonText.trim()}
                  >
                    {isSaving ? "Importing..." : "Import JSON"}
                  </button>
                  <button
                    type="button"
                    className="ghost-button"
                    onClick={resetJsonImport}
                    disabled={isSaving}
                  >
                    Clear import
                  </button>
                </div>
              </section>
            )}
          </>
        ) : null}

        {adminSection === "edit" ? (
          <>
            <section className="admin-panel">
              <div className="admin-section-head">
                <div>
                  <h3>Existing plants</h3>
                  <p className="admin-section-copy">
                    Search records, select one to edit, or delete it.
                  </p>
                </div>
              </div>
              <div className="admin-existing-toolbar">
                <label className="admin-field">
                  <span>Search plants</span>
                  <input
                    type="search"
                    value={adminSearchQuery}
                    onChange={(event) => setAdminSearchQuery(event.target.value)}
                    placeholder="Search by plant name, scientific name, family, or use"
                  />
                </label>
                <div className="admin-toolbar-actions">
                  <div className="admin-results-count">
                    {filteredAdminPlants.length} plant{filteredAdminPlants.length === 1 ? "" : "s"}
                  </div>
                  <button
                    type="button"
                    className="ghost-button"
                    onClick={resetEditForm}
                    disabled={isSaving}
                  >
                    Clear selection
                  </button>
                </div>
              </div>
              <div className="admin-table-wrap">
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>Plant</th>
                      <th>Scientific name</th>
                      <th>Family</th>
                      <th>Image</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredAdminPlants.map((plant) => (
                      <tr key={plant.id} className={editingPlantId === plant.id ? "is-active" : ""}>
                        <td data-label="Plant">
                          <div className="admin-table-plant">
                            {plant.image?.src ? (
                              <img src={plant.image.src} alt={plant.image?.alt?.en || getPlantDisplayName(plant)} />
                            ) : (
                              <span className="admin-table-placeholder">+</span>
                            )}
                            <div>
                              <strong>{getPlantDisplayName(plant)}</strong>
                              <span>{plant.common_name?.ml || plant.id}</span>
                            </div>
                          </div>
                        </td>
                        <td data-label="Scientific name">
                          <span className="admin-table-value">{plant.scientific_name}</span>
                        </td>
                        <td data-label="Family">
                          <span className="admin-table-value">{plant.family?.en || "-"}</span>
                        </td>
                        <td data-label="Image">
                          <span className={plant.image?.src ? "admin-status-chip is-ready" : "admin-status-chip"}>
                            {plant.image?.src ? "Added" : "Missing"}
                          </span>
                        </td>
                        <td data-label="Actions">
                          <div className="admin-plant-actions">
                            <button
                              type="button"
                              className="ghost-button"
                              onClick={() => handleSelectPlantForEdit(plant)}
                              disabled={isSaving}
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              className="ghost-button admin-danger-button"
                              onClick={() => setPendingDeleteRecord(plant)}
                              disabled={isSaving}
                            >
                              Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {!filteredAdminPlants.length ? (
                  <div className="admin-empty-results">No plants match this search.</div>
                ) : null}
              </div>
            </section>

            {editingPlantId ? (
              <div className="admin-modal-backdrop" onClick={resetEditForm}>
                <div
                  className="admin-modal"
                  role="dialog"
                  aria-modal="true"
                  aria-label="Edit existing plant"
                  onClick={(event) => event.stopPropagation()}
                >
                  <div className="admin-modal-head">
                    <div>
                      <h3>Edit existing plant</h3>
                      <p className="admin-section-copy">Editing Firestore record: {editingPlantId}</p>
                    </div>
                    <button type="button" className="ghost-button" onClick={resetEditForm}>
                      Close
                    </button>
                  </div>
                  <AdminPlantForm
                    title="Plant record"
                    description=""
                    form={editForm}
                    onFieldChange={(key, value) => updateFormField(setEditForm, key, value)}
                    onArrayRowChange={(key, index, field, value) =>
                      updateArrayRow(setEditForm, key, index, field, value)
                    }
                    onAddArrayRow={(key, createRow) => addArrayRow(setEditForm, key, createRow)}
                    onRemoveArrayRow={(key, index) => removeArrayRow(setEditForm, key, index)}
                    onImageUpload={(event) => void handleImageUpload(setEditForm, event)}
                    onSave={handleEditSave}
                    onReset={resetEditForm}
                    saveLabel="Update plant"
                    resetLabel="Cancel edit"
                    isSaving={isSaving}
                    lockId
                  />
                </div>
              </div>
            ) : null}
          </>
        ) : null}
      </section>
      <ConfirmDialog
        isOpen={Boolean(pendingDeleteRecord)}
        title={confirmCopy.deleteTitle}
        description={
          pendingDeleteRecord
            ? `${confirmCopy.deleteDescription} ${getPlantDisplayName(pendingDeleteRecord)}`
            : ""
        }
        confirmLabel={confirmCopy.deleteAction}
        cancelLabel={confirmCopy.cancel}
        onConfirm={confirmDeleteExistingPlant}
        onCancel={() => setPendingDeleteRecord(null)}
        isDestructive
      />
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
      ...plant.remedies,
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
                    const previewChips = Array.from(
                      new Set([...localizedPlant.symptoms, ...localizedPlant.uses]),
                    ).slice(0, 3);

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
                              <span className="result-placeholder" aria-hidden="true" />
                            )}
                          </span>
                          <div className="result-title-block">
                            <strong>{localizedPlant.name}</strong>
                            <small>{localizedPlant.scientific}</small>
                          </div>
                          <span className="result-cta">{copy.library.openLabel}</span>
                        </div>

                        <p className="result-teaser">{localizedPlant.teaser}</p>
                        {previewChips.length ? (
                          <div className="result-chip-row">
                            {previewChips.map((chip) => (
                              <span className="result-chip" key={chip}>
                                {chip}
                              </span>
                            ))}
                          </div>
                        ) : null}
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

function PlantUpdatesPreferenceCard({
  copy,
  capability,
  preference,
  isBusy,
  errorMessage,
  onToggle,
  onOpenInstallPrompt,
}) {
  const isEnabled = Boolean(preference?.enabled);
  const permission = preference?.permission ?? capability.permission;
  const canToggle = capability.state !== "unsupported";
  let helperText = copy.me.plantUpdatesNote;
  let statusLabel = isEnabled
    ? copy.me.plantUpdatesEnabled
    : copy.me.plantUpdatesDisabled;
  let statusClassName = isEnabled
    ? "account-status-pill is-success"
    : "account-status-pill";

  if (capability.state === "install-required") {
    helperText = copy.me.plantUpdatesInstallFirst;
    statusLabel = copy.me.installLabel;
    statusClassName = "account-status-pill is-warm";
  } else if (capability.state === "unsupported") {
    helperText = copy.me.plantUpdatesUnsupported;
  } else if (capability.state === "not-configured") {
    helperText = copy.me.plantUpdatesNotConfigured;
    statusClassName = "account-status-pill is-warm";
  } else if (permission === "denied" && !isEnabled) {
    helperText = copy.me.plantUpdatesDenied;
    statusClassName = "account-status-pill is-warm";
  }

  return (
    <div className="account-preference-card account-notification-card">
      <div className="account-preference-copy">
        <strong>{copy.me.plantUpdatesLabel}</strong>
        <p>{helperText}</p>
      </div>
      <div className="account-notification-actions">
        {canToggle ? (
          <button
            type="button"
            className={isEnabled ? "account-toggle-switch is-on" : "account-toggle-switch"}
            role="switch"
            aria-checked={isEnabled}
            aria-label={`${copy.me.plantUpdatesLabel}: ${
              isEnabled ? copy.me.plantUpdatesOnLabel : copy.me.plantUpdatesOffLabel
            }`}
            onClick={onToggle}
            disabled={isBusy}
          >
            <span className="account-toggle-option" aria-hidden="true">
              {copy.me.plantUpdatesOffLabel}
            </span>
            <span className="account-toggle-option" aria-hidden="true">
              {copy.me.plantUpdatesOnLabel}
            </span>
            <span className="account-toggle-thumb" aria-hidden="true">
              {isEnabled ? copy.me.plantUpdatesOnLabel : copy.me.plantUpdatesOffLabel}
            </span>
          </button>
        ) : null}
        <div className="account-status-row">
          <span className={statusClassName}>{statusLabel}</span>
          {isEnabled ? (
            <span className="account-status-note">{copy.me.plantUpdatesEveryThreeDays}</span>
          ) : null}
        </div>
        {errorMessage ? <p className="account-inline-error">{errorMessage}</p> : null}
      </div>
    </div>
  );
}

function MePage({
  copy,
  user,
  favoriteCount,
  language,
  canShowInstallEntry,
  plantUpdatesCapability,
  plantUpdatesPreference,
  plantUpdatesPending,
  plantUpdatesError,
  onOpenInstallPrompt,
  onTogglePlantUpdates,
  onLanguageChange,
  onRequestMalayalam,
  onSignIn,
  onSignOut,
}) {
  const isMalayalam = language === "ml";
  const nextLanguage = isMalayalam ? "en" : "ml";

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
              </div>
              <div className="account-preference-card">
                <div className="account-preference-copy">
                  <strong>{copy.me.languageLabel}</strong>
                  <p>{copy.me.languageNote}</p>
                </div>
                <button
                  type="button"
                  className={isMalayalam ? "account-language-switch is-ml" : "account-language-switch is-en"}
                  role="switch"
                  aria-checked={isMalayalam}
                  aria-label={`${copy.me.languageLabel}: ${copy.me.languageChoices[language]}`}
                  onClick={() =>
                    nextLanguage === "ml" ? onRequestMalayalam() : onLanguageChange(nextLanguage)
                  }
                >
                  <span
                    className={!isMalayalam ? "account-language-option is-selected" : "account-language-option"}
                    aria-hidden="true"
                  >
                    E
                  </span>
                  <span
                    className={isMalayalam ? "account-language-option is-selected" : "account-language-option"}
                    aria-hidden="true"
                  >
                    മ
                  </span>
                  <span className="account-language-thumb" aria-hidden="true">
                    {isMalayalam ? "മ" : "E"}
                  </span>
                </button>
              </div>
              <div className="account-note-card">
                <p className="account-note">{copy.me.note}</p>
              </div>
              {canShowInstallEntry ? (
                <div className="account-preference-card">
                  <div className="account-preference-copy">
                    <strong>{copy.me.installLabel}</strong>
                    <p>{copy.me.installNote}</p>
                  </div>
                  <button
                    type="button"
                    className="ghost-button account-install-button"
                    onClick={onOpenInstallPrompt}
                  >
                    {copy.me.installAction}
                  </button>
                </div>
              ) : null}
              {plantUpdatesCapability ? (
                <PlantUpdatesPreferenceCard
                  copy={copy}
                  capability={plantUpdatesCapability}
                  preference={plantUpdatesPreference}
                  isBusy={plantUpdatesPending}
                  errorMessage={plantUpdatesError}
                  onToggle={onTogglePlantUpdates}
                  onOpenInstallPrompt={onOpenInstallPrompt}
                />
              ) : null}
              <button
                type="button"
                className="ghost-button auth-action-button account-signout-button is-destructive"
                onClick={onSignOut}
              >
                {copy.me.signOut}
              </button>
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

function BuyMeACoffeeButton() {
  return (
    <section className="detail-support-card" aria-label="Support Nattuvaidyam">
      <a
        className="detail-support-link"
        href="https://buymeacoffee.com/nattuvaidyam"
        target="_blank"
        rel="noreferrer"
      >
        <span className="detail-support-link-emoji" aria-hidden="true">
          ☕
        </span>
        <span>Buy me a coffee</span>
      </a>
    </section>
  );
}

function InstallPromptPopup({
  copy,
  platform,
  canTriggerNativeInstall,
  onLater,
  onPrimaryAction,
}) {
  const isIos = platform === "ios";
  const androidHint = canTriggerNativeInstall
    ? copy.installPrompt.androidHint
    : copy.installPrompt.androidManualHint;
  const actionLabel = isIos
    ? copy.installPrompt.iosAction
    : canTriggerNativeInstall
      ? copy.installPrompt.androidAction
      : copy.installPrompt.androidManualAction;

  return (
    <section
      className="install-prompt-popup"
      role="dialog"
      aria-modal="false"
      aria-labelledby="install-prompt-title"
    >
      <div className="install-prompt-topbar">
        <div className="install-prompt-badge">{copy.installPrompt.eyebrow}</div>
        <button
          type="button"
          className="install-prompt-close"
          aria-label={copy.confirm.cancel}
          onClick={onLater}
        >
          ×
        </button>
      </div>
      <div className="install-prompt-head">
        <div className="install-prompt-icon" aria-hidden="true">
          {isIos ? "📲" : "⬇"}
        </div>
        <div className="install-prompt-copy">
          <strong id="install-prompt-title">{copy.installPrompt.title}</strong>
          <p>{copy.installPrompt.description}</p>
        </div>
      </div>

      {isIos ? (
        <div className="install-prompt-steps-wrap">
          <p className="install-prompt-hint">{copy.installPrompt.iosHint}</p>
          <ol className="install-prompt-steps">
            {copy.installPrompt.iosSteps.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
        </div>
      ) : (
        <p className="install-prompt-hint">{androidHint}</p>
      )}

      <div className="install-prompt-actions">
        <button
          type="button"
          className="install-prompt-secondary"
          onClick={onLater}
        >
          {copy.installPrompt.later}
        </button>
        <button
          type="button"
          className="install-prompt-primary"
          onClick={onPrimaryAction}
        >
          {actionLabel}
        </button>
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

function Hero({ copy, language, plants, isLoading, onSearchSubmit, onPlantOpen }) {
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
              <strong className="hero-highlight-title">{mostPopularPlant.name}</strong>
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
                      <span className="hero-saved-pill-text">{plant.name}</span>
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
          </>
        ) : (
          <div className="hero-highlight-empty">
            {isLoading ? copy.featured.loadingLabel : copy.featured.noPlantsLabel}
          </div>
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

function HomePage({ copy, language, plants, isLoading, onSearchSubmit, onBrowseOpen, onPlantOpen }) {
  return (
    <>
        <Hero
          copy={copy}
          language={language}
          plants={plants}
          isLoading={isLoading}
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
  detailEntrySource,
  onReturnToSource,
  onDetailStateChange,
  onRequestMalayalam,
}) {
  const DETAIL_SWIPE_THRESHOLD = 88;
  const localizedPlants = plants.map((plant) => localizePlant(plant, language));
  const [searchQuery, setSearchQuery] = useState(searchSeed.query);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [isMobileSearchOpen, setIsMobileSearchOpen] = useState(false);
  const [isImageViewerOpen, setIsImageViewerOpen] = useState(false);
  const [imageZoomLevel, setImageZoomLevel] = useState(1);
  const [shareState, setShareState] = useState("idle");
  const [visibleResultCount, setVisibleResultCount] = useState(SEARCH_RESULTS_BATCH_SIZE);
  const [detailSwipeOffset, setDetailSwipeOffset] = useState(0);
  const [detailLanguageOverride, setDetailLanguageOverride] = useState(null);
  const [shouldAutoOpenDetail, setShouldAutoOpenDetail] = useState(
    Boolean(searchSeed.openDetail && selectedPlantSlug),
  );
  const detailCardRef = useRef(null);
  const detailSwipeStateRef = useRef({
    startX: 0,
    startY: 0,
    active: false,
    tracking: false,
  });
  const trimmedSearchQuery = searchQuery.trim();
  const deferredQuery = useDeferredValue(trimmedSearchQuery);
  const quickSymptoms = getTopTerms(localizedPlants, "symptoms", 5);
  const quickDiseases = getTopTerms(localizedPlants, "uses", 5);
  const selectedPlantRecord = plants.find((plant) => plant.id === selectedPlantSlug) ?? null;

  useEffect(() => {
    setSearchQuery(searchSeed.query);
    setShouldAutoOpenDetail(Boolean(searchSeed.openDetail && selectedPlantSlug));
    setIsDetailOpen(Boolean(searchSeed.openDetail && selectedPlantSlug));
    setIsMobileSearchOpen(false);
    setIsImageViewerOpen(false);
    setImageZoomLevel(1);
    setShareState("idle");
  }, [searchSeed]);

  useEffect(() => {
    document.body.classList.toggle(
      "detail-open",
      isDetailOpen || isMobileSearchOpen || isImageViewerOpen,
    );

    return () => {
      document.body.classList.remove("detail-open");
    };
  }, [isDetailOpen, isImageViewerOpen, isMobileSearchOpen]);

  useEffect(() => {
    if (typeof window === "undefined" || !isImageViewerOpen) {
      return undefined;
    }

    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        setIsImageViewerOpen(false);
        setImageZoomLevel(1);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isImageViewerOpen]);

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

  useEffect(() => {
    if (!isDetailOpen && detailSwipeOffset !== 0) {
      setDetailSwipeOffset(0);
    }
  }, [detailSwipeOffset, isDetailOpen]);

  useEffect(() => {
    if (!isDetailOpen && detailLanguageOverride !== null) {
      setDetailLanguageOverride(null);
    }
  }, [detailLanguageOverride, isDetailOpen]);

  useEffect(() => {
    if (typeof window === "undefined" || !isDetailOpen || !selectedPlantSlug) {
      return undefined;
    }

    const frameId = window.requestAnimationFrame(() => {
      detailCardRef.current?.scrollTo?.({ top: 0, left: 0, behavior: "auto" });
      window.scrollTo({ top: 0, behavior: "auto" });
    });

    return () => {
      window.cancelAnimationFrame(frameId);
    };
  }, [isDetailOpen, selectedPlantSlug]);

  useEffect(() => {
    setVisibleResultCount(SEARCH_RESULTS_BATCH_SIZE);
  }, [deferredQuery]);

  const searchResults = localizedPlants
    .map((plant) => getSearchResult(plant, normalizeText(deferredQuery)))
    .filter(Boolean)
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score;
      }

      return left.plant.name.localeCompare(right.plant.name);
    });
  const visibleSearchResults = searchResults.slice(0, visibleResultCount);
  const hasMoreSearchResults = searchResults.length > visibleResultCount;

  useEffect(() => {
    if (!searchResults.length) {
      if (isLoading) {
        return;
      }

      if (selectedPlantRecord) {
        setIsDetailOpen(true);
        onDetailStateChange(true);
        setShouldAutoOpenDetail(false);
        return;
      }

      if (!shouldAutoOpenDetail) {
        setIsDetailOpen(false);
      }
      onDetailStateChange(false);
      onSelectPlant(null);
      return;
    }

    const hasSelectedPlant = selectedPlantSlug
      ? searchResults.some(
          (result) => result.plant.slug === selectedPlantSlug,
        )
      : false;
    const hasSelectedPlantRecord = Boolean(selectedPlantRecord);

    if (shouldAutoOpenDetail) {
      if (!hasSelectedPlant && !hasSelectedPlantRecord) {
        onSelectPlant(searchResults[0].plant.slug);
      }

      setIsDetailOpen(true);
      onDetailStateChange(true);
      setShouldAutoOpenDetail(false);
      return;
    }

    if (!trimmedSearchQuery) {
      if (!hasSelectedPlant && !hasSelectedPlantRecord) {
        onSelectPlant(searchResults[0].plant.slug);
      }
      return;
    }

    if (!hasSelectedPlant && selectedPlantSlug && !hasSelectedPlantRecord) {
      onSelectPlant(null);
      setIsDetailOpen(false);
      onDetailStateChange(false);
    }
  }, [
    isLoading,
    onDetailStateChange,
    onSelectPlant,
    plants,
    searchResults,
    selectedPlantRecord,
    selectedPlantSlug,
    shouldAutoOpenDetail,
    trimmedSearchQuery,
  ]);

  const selectedResult =
    searchResults.find((result) => result.plant.slug === selectedPlantSlug) ?? null;
  const selectedResultIndex = selectedResult
    ? searchResults.findIndex((result) => result.plant.slug === selectedResult.plant.slug)
    : -1;
  const activeFilterCount = trimmedSearchQuery ? 1 : 0;
  const hasCatalog = localizedPlants.length > 0;
  const isSelectedSaved = selectedResult
    ? favoritePlantIds.includes(selectedResult.plant.slug)
    : false;
  const detailLanguage = detailLanguageOverride ?? language;
  const detailCopy = content[detailLanguage];
  const detailLibraryCopy = detailCopy.library;
  const selectedDetailPlant = selectedPlantRecord
    ? localizePlant(selectedPlantRecord, detailLanguage)
    : null;
  const isDetailPlantLoading = isLoading && Boolean(selectedPlantSlug);
  const isMissingSelectedPlant =
    Boolean(selectedPlantSlug) && !selectedDetailPlant && !isDetailPlantLoading;
  const isMalayalam = detailLanguage === "ml";
  const nextLanguage = isMalayalam ? "en" : "ml";
  const nextLanguageLabel = detailCopy.languageOptions[nextLanguage];
  const hasNextPlant = selectedResultIndex >= 0 && selectedResultIndex < searchResults.length - 1;
  const detailBackLabel =
    detailEntrySource === "saved"
      ? content.en.library.backToSavedLabel
      : content.en.library.backToResultsLabel;
  const imageViewerLabels =
    detailLanguage === "ml"
      ? {
          close: "അടയ്ക്കുക",
          zoomIn: "വലുതാക്കുക",
          zoomOut: "ചെറുതാക്കുക",
          open: "ചിത്രം തുറക്കുക",
        }
      : {
          close: "Close",
          zoomIn: "Zoom in",
          zoomOut: "Zoom out",
          open: "Open image",
        };
  function clearFilters() {
    setSearchQuery("");
    setIsDetailOpen(false);
    onDetailStateChange(false);
    setIsMobileSearchOpen(false);
    setIsImageViewerOpen(false);
    setImageZoomLevel(1);
    setShouldAutoOpenDetail(false);
  }

  function handleSelectResult(slug) {
    onSelectPlant(slug);
    setIsDetailOpen(true);
    onDetailStateChange(true);
    setShouldAutoOpenDetail(false);
  }

  function handleCloseDetail() {
    setDetailSwipeOffset(0);
    setIsDetailOpen(false);
    onDetailStateChange(false);

    if (detailEntrySource === "saved") {
      onReturnToSource();
    }
  }

  function closeMobileSearch() {
    setIsMobileSearchOpen(false);
  }

  function openImageViewer() {
    setIsImageViewerOpen(true);
    setImageZoomLevel(1);
  }

  function closeImageViewer() {
    setIsImageViewerOpen(false);
    setImageZoomLevel(1);
  }

  function handleZoomIn() {
    setImageZoomLevel((current) => Math.min(current + 0.5, 3));
  }

  function handleZoomOut() {
    setImageZoomLevel((current) => Math.max(current - 0.5, 1));
  }

  function handleQuickFilter(term) {
    setSearchQuery(term);
    setIsDetailOpen(false);
    onDetailStateChange(false);
    setShouldAutoOpenDetail(false);
    closeMobileSearch();
  }

  async function handleSharePlant(plant) {
    const shareUrl = buildAppUrl({
      language,
      page: "plants",
      query: "",
      plantSlug: plant.slug,
      detailOpen: true,
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

  function handleSelectAdjacentResult(direction) {
    if (!searchResults.length || selectedResultIndex < 0) {
      return;
    }

    const nextIndex = selectedResultIndex + direction;

    if (nextIndex < 0) {
      handleCloseDetail();
      return;
    }

    const nextResult = searchResults[nextIndex];
    if (!nextResult) {
      setDetailSwipeOffset(0);
      return;
    }

    onSelectPlant(nextResult.plant.slug);
    setIsDetailOpen(true);
    onDetailStateChange(true);
    setShouldAutoOpenDetail(false);
    setDetailSwipeOffset(0);
  }

  function handleDetailTouchStart(event) {
    if (!isDetailOpen || isImageViewerOpen || isMobileSearchOpen) {
      return;
    }

    const touch = event.touches?.[0];
    if (!touch) {
      return;
    }

    detailSwipeStateRef.current = {
      startX: touch.clientX,
      startY: touch.clientY,
      active: true,
      tracking: true,
    };
  }

  function handleDetailTouchMove(event) {
    const touch = event.touches?.[0];
    const swipeState = detailSwipeStateRef.current;

    if (!touch || !swipeState.active || !swipeState.tracking) {
      return;
    }

    const deltaX = touch.clientX - swipeState.startX;
    const deltaY = touch.clientY - swipeState.startY;

    if (Math.abs(deltaY) > Math.abs(deltaX) && Math.abs(deltaY) > 10) {
      swipeState.tracking = false;
      setDetailSwipeOffset(0);
      return;
    }

    setDetailSwipeOffset(Math.max(Math.min(deltaX, 160), -160));
  }

  function handleDetailTouchEnd() {
    const swipeState = detailSwipeStateRef.current;
    const shouldGoPrevious =
      swipeState.active && detailSwipeOffset >= DETAIL_SWIPE_THRESHOLD;
    const shouldGoNext =
      swipeState.active && detailSwipeOffset <= -DETAIL_SWIPE_THRESHOLD;

    detailSwipeStateRef.current = {
      startX: 0,
      startY: 0,
      active: false,
      tracking: false,
    };

    if (shouldGoPrevious) {
      handleSelectAdjacentResult(-1);
      return;
    }

    if (shouldGoNext) {
      handleSelectAdjacentResult(1);
      return;
    }

    setDetailSwipeOffset(0);
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
              <>
                <div className="results-stack catalog-results-stack">
                {visibleSearchResults.map((result) => (
                  <button
                    type="button"
                    key={result.plant.slug}
                    className={
                      result.plant.slug === selectedPlantSlug
                        ? "result-card catalog-result-card is-active"
                        : "result-card catalog-result-card"
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
                          <span className="result-placeholder" aria-hidden="true" />
                        )}
                      </span>
                      <div className="result-title-block">
                        <strong>{result.plant.name}</strong>
                        <small>{result.plant.scientific}</small>
                      </div>
                      <span className="result-cta" aria-hidden="true">
                        <svg
                          className="result-cta-icon"
                          viewBox="0 0 12 20"
                          fill="none"
                          xmlns="http://www.w3.org/2000/svg"
                        >
                          <path
                            d="M2 2.5L9 10L2 17.5"
                            stroke="currentColor"
                            strokeWidth="2.2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      </span>
                    </div>
                    <div className="result-chip-row catalog-result-chip-row">
                      {result.previewChips.slice(0, 2).map((chip) => (
                        <span className="result-chip" key={chip}>
                          {chip}
                        </span>
                      ))}
                    </div>
                  </button>
                ))}
                </div>
                {hasMoreSearchResults ? (
                  <div className="catalog-load-more-row">
                    <button
                      type="button"
                      className="ghost-button"
                      onClick={() =>
                        setVisibleResultCount((current) => current + SEARCH_RESULTS_BATCH_SIZE)
                      }
                    >
                      {copy.library.loadMoreLabel}
                    </button>
                  </div>
                ) : null}
              </>
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
            onClick={handleCloseDetail}
          />

          <aside
            ref={detailCardRef}
            className={isDetailOpen ? "plant-detail-card is-open" : "plant-detail-card"}
            onTouchStart={handleDetailTouchStart}
            onTouchMove={handleDetailTouchMove}
            onTouchEnd={handleDetailTouchEnd}
            onTouchCancel={handleDetailTouchEnd}
            style={
              isDetailOpen && detailSwipeOffset > 0
                ? { transform: `translateX(${detailSwipeOffset}px)` }
                : undefined
            }
          >
            {selectedDetailPlant ? (
              <>
                <div className="detail-header-row">
                  <h3>{selectedDetailPlant.name}</h3>
                  <div className="detail-header-actions">
                    <button
                      type="button"
                      className="detail-language-button"
                      aria-label={`${detailCopy.me.languageLabel}: ${detailCopy.me.languageChoices[nextLanguage]}`}
                      title={detailCopy.me.languageChoices[nextLanguage]}
                      onClick={() =>
                        nextLanguage === "ml"
                          ? onRequestMalayalam()
                          : setDetailLanguageOverride(nextLanguage)
                      }
                    >
                      {nextLanguageLabel}
                    </button>
                    <button
                      type="button"
                      className="detail-close-icon-button"
                      aria-label={detailLibraryCopy.closeDetail}
                      title={detailLibraryCopy.closeDetail}
                      onClick={handleCloseDetail}
                    >
                      <svg
                        className="detail-icon-svg"
                        viewBox="0 0 24 24"
                        aria-hidden="true"
                      >
                        <path
                          d="M6 6 18 18M18 6 6 18"
                          fill="none"
                          stroke="currentColor"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth="2"
                        />
                      </svg>
                    </button>
                  </div>
                </div>
                {selectedDetailPlant.image.src ? (
                  <button
                    type="button"
                    className="plant-image-frame plant-image-trigger"
                    onClick={openImageViewer}
                    aria-label={imageViewerLabels.open}
                  >
                    <img
                      className="plant-image"
                      src={selectedDetailPlant.image.src}
                      alt={selectedDetailPlant.image.alt}
                    />
                  </button>
                ) : (
                  <div className="plant-image-frame">
                    <div className="plant-image-placeholder" aria-hidden="true">
                      <span className="plant-image-copy">
                        {detailLibraryCopy.labels.imageFallback}
                      </span>
                    </div>
                  </div>
                )}
                <div className="plant-meta-grid">
                  <div className="plant-meta-card is-primary">
                    <div className="plant-meta-top-row">
                      <div className="plant-meta-copy">
                        <span className="plant-meta-label">
                          {detailLibraryCopy.labels.scientific}
                        </span>
                        <strong className="plant-meta-value">
                          {selectedDetailPlant.scientific}
                        </strong>
                      </div>
                      <div className="plant-meta-utility-actions">
                        <button
                          type="button"
                          className="detail-icon-button"
                          aria-label={
                            shareState === "shared"
                              ? detailLibraryCopy.sharedLabel
                              : shareState === "copied"
                                ? detailLibraryCopy.copiedLabel
                                : detailLibraryCopy.shareLabel
                          }
                          title={
                            shareState === "shared"
                              ? detailLibraryCopy.sharedLabel
                              : shareState === "copied"
                                ? detailLibraryCopy.copiedLabel
                                : detailLibraryCopy.shareLabel
                          }
                          onClick={() => handleSharePlant(selectedDetailPlant)}
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
                                ? detailLibraryCopy.savedLabel
                                : detailLibraryCopy.saveLabel
                              : detailLibraryCopy.signInToSave
                          }
                          title={
                            user
                              ? isSelectedSaved
                                ? detailLibraryCopy.savedLabel
                                : detailLibraryCopy.saveLabel
                              : detailLibraryCopy.signInToSave
                          }
                          onClick={() => {
                            if (!user) {
                              onSignIn();
                              return;
                            }

                            void onToggleFavorite(selectedDetailPlant.slug, isSelectedSaved);
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
                  {selectedDetailPlant.family ? (
                    <div className="plant-meta-card">
                      <span className="plant-meta-label">{detailLibraryCopy.labels.family}</span>
                      <strong className="plant-meta-value">
                        {selectedDetailPlant.family}
                      </strong>
                    </div>
                  ) : null}
                </div>
                <p className="plant-summary">{selectedDetailPlant.summary}</p>

                {!!selectedDetailPlant.aliases.length && (
                  <section className="detail-block">
                    <h4>{detailLibraryCopy.labels.aliases}</h4>
                    <div className="detail-pill-row">
                      {selectedDetailPlant.aliases.map((item) => (
                        <span className="detail-pill" key={item}>
                          {item}
                        </span>
                      ))}
                    </div>
                  </section>
                )}

                <div className="detail-grid">
                  <section className="detail-block">
                    <h4>{detailLibraryCopy.labels.uses}</h4>
                    <div className="detail-pill-row">
                      {selectedDetailPlant.uses.map((item) => (
                        <span className="detail-pill" key={item}>
                          {item}
                        </span>
                      ))}
                    </div>
                  </section>

                  <section className="detail-block">
                    <h4>{detailLibraryCopy.labels.parts}</h4>
                    <div className="detail-pill-row">
                      {selectedDetailPlant.parts.map((item) => (
                        <span className="detail-pill" key={item}>
                          {item}
                        </span>
                      ))}
                    </div>
                  </section>
                </div>

                {selectedDetailPlant.overview ? (
                  <section className="detail-block">
                    <h4>{detailLibraryCopy.labels.overview}</h4>
                    <p>{selectedDetailPlant.overview}</p>
                  </section>
                ) : null}

                {selectedDetailPlant.characteristics ? (
                  <section className="detail-block">
                    <h4>{detailLibraryCopy.labels.characteristics}</h4>
                    <p>{selectedDetailPlant.characteristics}</p>
                  </section>
                ) : null}

                {selectedDetailPlant.habitat ? (
                  <section className="detail-block">
                    <h4>{detailLibraryCopy.labels.habitat}</h4>
                    <p>{selectedDetailPlant.habitat}</p>
                  </section>
                ) : null}

                {selectedDetailPlant.properties ? (
                  <section className="detail-block">
                    <h4>{detailLibraryCopy.labels.properties}</h4>
                    <p>{selectedDetailPlant.properties}</p>
                  </section>
                ) : null}

                {!!selectedDetailPlant.constituents.length && (
                  <section className="detail-block">
                    <h4>{detailLibraryCopy.labels.constituents}</h4>
                    <ul className="detail-list">
                      {selectedDetailPlant.constituents.map((item) => (
                        <li key={item.part}>
                          <strong>{item.part}</strong>: {item.description}
                        </li>
                      ))}
                    </ul>
                  </section>
                )}

                {!!selectedDetailPlant.treatments.length && (
                  <section className="detail-block">
                    <h4>{detailLibraryCopy.labels.treatments}</h4>
                    <div className="detail-treatment-list">
                      {selectedDetailPlant.treatments.map((item) => (
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

                <section className="detail-block detail-disclaimer">
                  <h4>{detailCopy.footerLabel}</h4>
                  <p>{detailCopy.footer}</p>
                </section>

                <div className="detail-bottom-actions">
                  <button
                    type="button"
                    className="ghost-button detail-bottom-action"
                    onClick={handleCloseDetail}
                  >
                    {detailBackLabel}
                  </button>
                  <button
                    type="button"
                    className="ghost-button detail-bottom-action detail-bottom-action-primary"
                    onClick={() => handleSelectAdjacentResult(1)}
                    disabled={!hasNextPlant}
                  >
                    {copy.library.nextPlantLabel}
                  </button>
                </div>

                <BuyMeACoffeeButton />
              </>
            ) : isDetailPlantLoading ? (
              <div className="empty-state-card is-detail">
                <h3>{detailLibraryCopy.loadingTitle}</h3>
                <p>{detailLibraryCopy.loadingDescription}</p>
              </div>
            ) : isMissingSelectedPlant ? (
              <div className="empty-state-card is-detail">
                <h3>{detailLibraryCopy.missingPlantTitle}</h3>
                <p>{detailLibraryCopy.missingPlantDescription}</p>
                <button type="button" className="ghost-button" onClick={handleCloseDetail}>
                  {detailLibraryCopy.browsePlantsLabel}
                </button>
              </div>
            ) : (
              <div className="empty-state-card is-detail">
                <h3>{detailLibraryCopy.emptyTitle}</h3>
                <p>{detailLibraryCopy.emptyDescription}</p>
              </div>
            )}
          </aside>

          {selectedDetailPlant?.image.src ? (
            <div
              className={
                isImageViewerOpen ? "image-viewer-backdrop is-open" : "image-viewer-backdrop"
              }
              aria-hidden={!isImageViewerOpen}
            >
              <button
                type="button"
                className="image-viewer-dismiss"
                aria-label={imageViewerLabels.close}
                onClick={closeImageViewer}
              />
              <section
                className={
                  isImageViewerOpen ? "image-viewer-modal is-open" : "image-viewer-modal"
                }
                role="dialog"
                aria-modal="true"
                aria-label={selectedDetailPlant.name}
              >
                <div className="image-viewer-head">
                  <strong>{selectedDetailPlant.name}</strong>
                </div>
                <div className="image-viewer-canvas">
                  <img
                    className="image-viewer-image"
                    src={selectedDetailPlant.image.src}
                    alt={selectedDetailPlant.image.alt}
                    style={{ transform: `scale(${imageZoomLevel})` }}
                  />
                </div>
                <div className="image-viewer-actions">
                  <button
                    type="button"
                    className="ghost-button image-viewer-action"
                    onClick={handleZoomOut}
                    disabled={imageZoomLevel <= 1}
                  >
                    {imageViewerLabels.zoomOut}
                  </button>
                  <button
                    type="button"
                    className="ghost-button image-viewer-action"
                    onClick={handleZoomIn}
                    disabled={imageZoomLevel >= 3}
                  >
                    {imageViewerLabels.zoomIn}
                  </button>
                  <button
                    type="button"
                    className="ghost-button image-viewer-action"
                    onClick={closeImageViewer}
                  >
                    {imageViewerLabels.close}
                  </button>
                </div>
              </section>
            </div>
          ) : null}
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
  const [adminSection, setAdminSection] = useState(initialAppState.adminSection);
  const [plants, setPlants] = useState([]);
  const [plantsStatus, setPlantsStatus] = useState("loading");
  const [plantsError, setPlantsError] = useState("");
  const [user, setUser] = useState(null);
  const [favoritePlantIds, setFavoritePlantIds] = useState([]);
  const [selectedPlantSlug, setSelectedPlantSlug] = useState(initialAppState.selectedPlantSlug);
  const [pendingSection, setPendingSection] = useState(null);
  const [catalogSeed, setCatalogSeed] = useState(initialAppState.catalogSeed);
  const [plantsDetailSource, setPlantsDetailSource] = useState("plants");
  const [isPlantsDetailRouteOpen, setIsPlantsDetailRouteOpen] = useState(
    initialAppState.plantDetailOpen,
  );
  const [isSignOutConfirmOpen, setIsSignOutConfirmOpen] = useState(false);
  const [isDesktopPromptOpen, setIsDesktopPromptOpen] = useState(false);
  const [hasScrolled, setHasScrolled] = useState(false);
  const [deferredInstallPrompt, setDeferredInstallPrompt] = useState(null);
  const [installPromptCooldownUntil, setInstallPromptCooldownUntil] = useState(() =>
    getInstallPromptCooldownUntil(),
  );
  const [isInstallPromptDismissedForever, setIsInstallPromptDismissedForever] = useState(() =>
    getInstallPromptDismissedForever(),
  );
  const [isInstallPromptManuallyOpen, setIsInstallPromptManuallyOpen] = useState(false);
  const [plantUpdatesPreference, setPlantUpdatesPreference] = useState(null);
  const [plantUpdatesPending, setPlantUpdatesPending] = useState(false);
  const [plantUpdatesError, setPlantUpdatesError] = useState("");
  const [isMalayalamNoticeOpen, setIsMalayalamNoticeOpen] = useState(false);
  const [isStandaloneMode, setIsStandaloneMode] = useState(() => isStandaloneApp());
  const [isMobileViewport, setIsMobileViewport] = useState(() => {
    if (typeof window === "undefined") {
      return true;
    }

    return window.innerWidth <= MOBILE_APP_BREAKPOINT;
  });
  const copy = content[language];
  const selectedPlantRecord = plants.find((plant) => plant.id === selectedPlantSlug) ?? null;
  const localizedSelectedPlant = selectedPlantRecord
    ? localizePlant(selectedPlantRecord, language)
    : null;
  const installPlatform = isMobileViewport ? detectInstallPlatform() : null;
  const plantUpdatesCapability = user
    ? getPlantUpdatesCapability({
        isStandaloneMode,
        installPlatform,
      })
    : null;
  const canTriggerNativeInstall = installPlatform === "android" && Boolean(deferredInstallPrompt);
  const shouldAutoShowInstallPrompt =
    Boolean(user) &&
    page === "home" &&
    isMobileViewport &&
    !isStandaloneMode &&
    !isInstallPromptDismissedForever &&
    Date.now() >= installPromptCooldownUntil &&
    (installPlatform === "ios" || installPlatform === "android");
  const shouldShowInstallPrompt =
    Boolean(user) &&
    isMobileViewport &&
    !isStandaloneMode &&
    Boolean(installPlatform) &&
    (isInstallPromptManuallyOpen || shouldAutoShowInstallPrompt);

  const applyAppState = (nextState) => {
    setLanguage(nextState.language);
    setPage(nextState.page);
    setAdminSection(nextState.adminSection);
    setCatalogSeed(nextState.catalogSeed);
    setSelectedPlantSlug(nextState.selectedPlantSlug);
    setPlantsDetailSource("plants");
    setIsPlantsDetailRouteOpen(nextState.plantDetailOpen);
  };

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, language);
  }, [language]);

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
    if (!user) {
      setPlantUpdatesPreference(null);
      setPlantUpdatesError("");
      setPlantUpdatesPending(false);
      return undefined;
    }

    return watchPlantUpdatesPreference(
      user.uid,
      (nextPreference) => {
        setPlantUpdatesPreference(nextPreference);
        setPlantUpdatesPending(false);
      },
      () => {
        setPlantUpdatesError("Could not load plant updates right now.");
        setPlantUpdatesPending(false);
      },
    );
  }, [user]);

  useEffect(() => {
    if (!user || !plantUpdatesPreference?.enabled) {
      return;
    }

    void syncPlantUpdatesLanguage(user.uid, language);
  }, [language, plantUpdatesPreference?.enabled, user]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return undefined;
    }

    const handleBeforeInstallPrompt = (event) => {
      event.preventDefault();
      setDeferredInstallPrompt(event);
    };

    const handleAppInstalled = () => {
      setDeferredInstallPrompt(null);
      setIsStandaloneMode(true);
      setIsInstallPromptManuallyOpen(false);
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    window.addEventListener("appinstalled", handleAppInstalled);

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
      window.removeEventListener("appinstalled", handleAppInstalled);
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    setIsStandaloneMode(isStandaloneApp());
  }, [page]);

  useEffect(() => {
    if (typeof window === "undefined" || installPromptCooldownUntil <= Date.now()) {
      return undefined;
    }

    const timeoutId = window.setTimeout(() => {
      setInstallPromptCooldownUntil(0);
      window.localStorage.removeItem(INSTALL_PROMPT_STORAGE_KEY);
    }, installPromptCooldownUntil - Date.now());

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [installPromptCooldownUntil]);

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
    if (typeof window === "undefined") {
      return;
    }

    const nextUrl = buildAppUrl({
      language,
      page,
      query: catalogSeed.query,
      plantSlug: page === "plants" ? selectedPlantSlug : null,
      adminSection,
      detailOpen: page === "plants" ? isPlantsDetailRouteOpen : false,
    });

    window.history.replaceState({}, "", nextUrl);
  }, [adminSection, catalogSeed.query, isPlantsDetailRouteOpen, language, page, selectedPlantSlug]);

  useEffect(() => {
    if (typeof document === "undefined") {
      return;
    }

    const canonicalUrl = buildCanonicalUrl({
      language,
      page,
      plantSlug: page === "plants" ? selectedPlantSlug : null,
      adminSection,
      detailOpen: page === "plants" ? isPlantsDetailRouteOpen : false,
    });
    const trimmedQuery = catalogSeed.query.trim();
    const isPlantDetailPage =
      page === "plants" && Boolean(isPlantsDetailRouteOpen && localizedSelectedPlant);
    const pageTitleBase = "Nattuvaidyam";
    let title = `${pageTitleBase} | Medicinal Plants`;
    let description = DEFAULT_SEO_DESCRIPTION;
    let robots = "index,follow";

    if (page === "home") {
      title = "Nattuvaidyam | Kerala Medicinal Plants";
      description = DEFAULT_SEO_DESCRIPTION;
    } else if (page === "plants" && isPlantDetailPage) {
      title = `${localizedSelectedPlant.name} | ${pageTitleBase}`;
      description = truncateText(
        localizedSelectedPlant.summary ||
          localizedSelectedPlant.overview ||
          `${localizedSelectedPlant.name} medicinal plant details, traditional uses, and remedies.`,
      );
    } else if (page === "plants" && trimmedQuery) {
      title = `${trimmedQuery} | Plant Search | ${pageTitleBase}`;
      description = truncateText(
        `Search medicinal plants related to ${trimmedQuery} on Nattuvaidyam.`,
      );
      robots = "noindex,follow";
    } else if (page === "plants") {
      title = `Search Medicinal Plants | ${pageTitleBase}`;
      description = "Browse and search Kerala medicinal plants by name, symptom, disease, and remedy.";
    } else if (page === "saved") {
      title = `Saved Plants | ${pageTitleBase}`;
      description = "Your saved medicinal plants on Nattuvaidyam.";
      robots = "noindex,follow";
    } else if (page === "me") {
      title = `My Account | ${pageTitleBase}`;
      description = "Manage your Nattuvaidyam account, language, and install settings.";
      robots = "noindex,follow";
    } else if (page === "admin") {
      title = `Admin | ${pageTitleBase}`;
      description = "Plant management for Nattuvaidyam.";
      robots = "noindex,nofollow";
    }

    document.title = title;
    document.documentElement.lang = language === "ml" ? "ml" : "en";
    setMetaTag('meta[name="description"]', description);
    setMetaTag('meta[name="robots"]', robots);
    setMetaTag('meta[property="og:title"]', title);
    setMetaTag('meta[property="og:description"]', description);
    setMetaTag('meta[property="og:url"]', canonicalUrl);
    setMetaTag('meta[property="og:type"]', isPlantDetailPage ? "article" : "website");
    setMetaTag('meta[property="og:image"]', toAbsoluteUrl(localizedSelectedPlant?.image?.src));
    setMetaTag(
      'meta[property="og:image:secure_url"]',
      toAbsoluteUrl(localizedSelectedPlant?.image?.src),
    );
    setMetaTag(
      'meta[property="og:image:alt"]',
      localizedSelectedPlant?.image?.alt ||
        "Nattuvaidyam logo with mortar, pestle, and medicinal leaves",
    );
    setMetaTag('meta[name="twitter:title"]', title);
    setMetaTag('meta[name="twitter:description"]', description);
    setMetaTag('meta[name="twitter:image"]', toAbsoluteUrl(localizedSelectedPlant?.image?.src));
    setMetaTag(
      'meta[name="twitter:image:alt"]',
      localizedSelectedPlant?.image?.alt ||
        "Nattuvaidyam logo with mortar, pestle, and medicinal leaves",
    );
    setMetaTag('link[rel="canonical"]', canonicalUrl, "href");

    const structuredDataElement = document.getElementById("dynamic-structured-data");
    if (structuredDataElement) {
      structuredDataElement.textContent = JSON.stringify(
        buildStructuredData({
          title,
          description,
          canonicalUrl,
          localizedPlant: isPlantDetailPage ? localizedSelectedPlant : null,
        }),
      );
    }
  }, [
    adminSection,
    catalogSeed.query,
    isPlantsDetailRouteOpen,
    language,
    localizedSelectedPlant,
    page,
    selectedPlantSlug,
  ]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return undefined;
    }

    const handlePopState = () => {
      applyAppState(getInitialAppState());
    };

    window.addEventListener("popstate", handlePopState);
    return () => {
      window.removeEventListener("popstate", handlePopState);
    };
  }, []);

  useEffect(() => {
    if (typeof navigator === "undefined" || !navigator.serviceWorker) {
      return undefined;
    }

    const handleServiceWorkerMessage = (event) => {
      const data = event.data;

      if (!data || data.type !== "notification-open" || !data.url) {
        return;
      }

      const nextState = getInitialAppStateForUrl(data.url);
      window.history.replaceState({}, "", data.url);
      applyAppState(nextState);
    };

    navigator.serviceWorker.addEventListener("message", handleServiceWorkerMessage);
    return () => {
      navigator.serviceWorker.removeEventListener("message", handleServiceWorkerMessage);
    };
  }, []);

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
      setPlantsDetailSource("plants");
      setIsPlantsDetailRouteOpen(false);
      setPage(target);
      return;
    }

    if (target === "saved" || target === "me") {
      setIsPlantsDetailRouteOpen(false);
      setPage(target);
      return;
    }

    setIsPlantsDetailRouteOpen(false);
    setPage("home");
    setPendingSection(target);
  }

  function handleAdminNavigate(section) {
    setPage("admin");
    setAdminSection(section);
  }

  function handleCatalogSearch(term, slug = null) {
    setCatalogSeed({ query: term, openDetail: Boolean(slug) });
    setSelectedPlantSlug(slug);
    setPlantsDetailSource("plants");
    setIsPlantsDetailRouteOpen(Boolean(slug));
    setPage("plants");
  }

  function handleBrowseOpen() {
    setCatalogSeed({ query: "", openDetail: false });
    setPlantsDetailSource("plants");
    setIsPlantsDetailRouteOpen(false);
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

  function handleOpenSavedPlant(slug) {
    setCatalogSeed({ query: "", openDetail: true });
    setSelectedPlantSlug(slug);
    setPlantsDetailSource("saved");
    setIsPlantsDetailRouteOpen(true);
    setPage("plants");
  }

  function handleReturnFromPlantDetail() {
    setPlantsDetailSource("plants");
    setIsPlantsDetailRouteOpen(false);
    setPage("saved");
  }

  async function handleSignIn() {
    await signInWithGoogle();
  }

  function requestSignOut() {
    setIsSignOutConfirmOpen(true);
  }

  async function handleSignOut() {
    await signOutUser();
    setIsSignOutConfirmOpen(false);
    setPage("home");
    setAdminSection("home");
    if (typeof window !== "undefined" && window.location.pathname.startsWith("/admin")) {
      window.history.replaceState({}, "", "/");
    }
  }

  function dismissInstallPrompt() {
    if (typeof window === "undefined") {
      return;
    }

    const nextDismissUntil = Date.now() + INSTALL_PROMPT_DISMISS_MS;
    window.localStorage.setItem(
      INSTALL_PROMPT_STORAGE_KEY,
      String(nextDismissUntil),
    );
    setInstallPromptCooldownUntil(nextDismissUntil);
    setIsInstallPromptManuallyOpen(false);
  }

  function dismissInstallPromptForever() {
    if (typeof window === "undefined") {
      return;
    }

    window.localStorage.setItem(INSTALL_PROMPT_FOREVER_STORAGE_KEY, "true");
    window.localStorage.removeItem(INSTALL_PROMPT_STORAGE_KEY);
    setInstallPromptCooldownUntil(0);
    setIsInstallPromptDismissedForever(true);
    setIsInstallPromptManuallyOpen(false);
  }

  async function handleInstallPromptPrimaryAction() {
    if (installPlatform === "android" && deferredInstallPrompt) {
      const promptEvent = deferredInstallPrompt;
      setDeferredInstallPrompt(null);

      try {
        await promptEvent.prompt();
        await promptEvent.userChoice;
      } catch {
        // Ignore browser prompt failures and keep the app usable.
      }

      dismissInstallPromptForever();
      return;
    }

    dismissInstallPromptForever();
  }

  function openInstallPromptManually() {
    setIsInstallPromptManuallyOpen(true);
  }

  function openMalayalamNotice() {
    setIsMalayalamNoticeOpen(true);
  }

  async function handleTogglePlantUpdates() {
    if (!user || !plantUpdatesCapability) {
      return;
    }

    if (plantUpdatesPreference?.enabled) {
      setPlantUpdatesPending(true);
      setPlantUpdatesError("");

      try {
        await disablePlantUpdates(user.uid);
      } catch (error) {
        setPlantUpdatesError(
          error instanceof Error && error.message
            ? error.message
            : "Could not update plant notifications right now.",
        );
      } finally {
        setPlantUpdatesPending(false);
      }

      return;
    }

    if (plantUpdatesCapability.state === "install-required") {
      openInstallPromptManually();
      return;
    }

    if (plantUpdatesCapability.state !== "ready") {
      setPlantUpdatesError(
        plantUpdatesCapability.state === "unsupported"
          ? copy.me.plantUpdatesUnsupported
          : copy.me.plantUpdatesNotConfigured,
      );
      return;
    }

    setPlantUpdatesPending(true);
    setPlantUpdatesError("");

    try {
      const result = await enablePlantUpdates({
        userId: user.uid,
        language,
      });

      if (result.permission !== "granted") {
        setPlantUpdatesError(copy.me.plantUpdatesDenied);
      }
    } catch (error) {
      setPlantUpdatesError(
        error instanceof Error && error.message
          ? error.message
          : "Could not update plant notifications right now.",
      );
    } finally {
      setPlantUpdatesPending(false);
    }
  }

  if (page === "admin") {
    return (
      <div className="app-shell admin-shell">
        <div className="page-glow page-glow-left" />
        <div className="page-glow page-glow-right" />
        <AdminPage
          user={user}
          plants={plants}
          adminSection={adminSection}
          confirmCopy={copy.confirm}
          onAdminNavigate={handleAdminNavigate}
          onSignIn={handleSignIn}
          onSignOut={requestSignOut}
          onPlantsChanged={loadPlants}
        />
        <ConfirmDialog
          isOpen={isSignOutConfirmOpen}
          title={copy.confirm.signOutTitle}
          description={copy.confirm.signOutDescription}
          confirmLabel={copy.confirm.signOutAction}
          cancelLabel={copy.confirm.cancel}
          onConfirm={handleSignOut}
          onCancel={() => setIsSignOutConfirmOpen(false)}
          isDestructive
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
    <>
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
              isLoading={plantsStatus === "loading"}
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
              language={language}
              canShowInstallEntry={Boolean(installPlatform) && !isStandaloneMode}
              plantUpdatesCapability={plantUpdatesCapability}
              plantUpdatesPreference={plantUpdatesPreference}
              plantUpdatesPending={plantUpdatesPending}
              plantUpdatesError={plantUpdatesError}
              onOpenInstallPrompt={openInstallPromptManually}
              onTogglePlantUpdates={handleTogglePlantUpdates}
              onLanguageChange={setLanguage}
              onRequestMalayalam={openMalayalamNotice}
              onSignIn={handleSignIn}
              onSignOut={requestSignOut}
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
              detailEntrySource={plantsDetailSource}
              onReturnToSource={handleReturnFromPlantDetail}
              onDetailStateChange={setIsPlantsDetailRouteOpen}
              onRequestMalayalam={openMalayalamNotice}
            />
          )}
        </main>
        {shouldShowInstallPrompt ? (
          <InstallPromptPopup
            copy={copy}
            platform={installPlatform}
            canTriggerNativeInstall={canTriggerNativeInstall}
            onLater={dismissInstallPrompt}
            onPrimaryAction={handleInstallPromptPrimaryAction}
          />
        ) : null}
        <ConfirmDialog
          isOpen={isSignOutConfirmOpen}
          title={copy.confirm.signOutTitle}
          description={copy.confirm.signOutDescription}
          confirmLabel={copy.confirm.signOutAction}
          cancelLabel={copy.confirm.cancel}
          onConfirm={handleSignOut}
          onCancel={() => setIsSignOutConfirmOpen(false)}
          isDestructive
        />
        <NoticeDialog
          isOpen={isMalayalamNoticeOpen}
          title={copy.me.malayalamComingSoonTitle}
          description={copy.me.malayalamComingSoonMessage}
          actionLabel={copy.me.malayalamComingSoonAction}
          onClose={() => setIsMalayalamNoticeOpen(false)}
        />
      </div>
      <MobileNav copy={copy} page={page} onNavigate={handleNavigate} />
    </>
  );
}
