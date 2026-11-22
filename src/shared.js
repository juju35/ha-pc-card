// ── Card picker: light previews ──────────────────────────────────────────────
// Home Assistant's card picker builds a live preview of every card registered with `preview: true`, all at once and
// with no lazy loading. A preview here is drawn only once it scrolls into view: the picker calls getStubConfig() right
// before it creates the preview, which marks the next instance of that card; once connected under <hui-card-picker>,
// that instance holds Home Assistant's state (no render, no history, no animation) until it is visible. Anywhere else
// (a dashboard, the card editor) the card behaves as before. Editors and other elements are defined unchanged.
function pickerDefine(tag, Card, options) {
  const isCard = !tag.endsWith("-editor") && (typeof Card.getStubConfig === "function" || typeof Card.getConfigElement === "function");
  if (!isCard || typeof IntersectionObserver !== "function") return customElements.define(tag, Card, options);
  let marks = [];
  const lazy = class extends Card {
    static getStubConfig(...args) {
      marks.push(Date.now());
      return Card.getStubConfig ? Card.getStubConfig(...args) : {};
    }

    constructor() {
      super();
      const now = Date.now();
      marks = marks.filter((t) => now - t < 5000);
      if (marks.length) {
        marks.shift();
        this._plHold = true;
      }
    }

    set hass(hass) {
      if (this._plHold) this._plHass = hass;
      else super.hass = hass;
    }

    get hass() {
      return this._plHold ? this._plHass : super.hass;
    }

    connectedCallback() {
      if (!this._plHold) return super.connectedCallback?.();
      if (this.getRootNode()?.host?.localName !== "hui-card-picker") return this._plRelease();
      if (this._plIo) return;
      // A custom element is inline until its styles arrive: a block of a card's height keeps the cells apart, so
      // that only the previews actually on screen intersect.
      this.style.display = "block";
      this.style.minHeight = "120px";
      this._plIo = new IntersectionObserver((entries) => entries.some((e) => e.isIntersecting) && this._plRelease(), {
        rootMargin: "200px",
      });
      this._plIo.observe(this);
    }

    disconnectedCallback() {
      if (this._plHold) return;
      super.disconnectedCallback?.();
    }

    _plRelease() {
      this._plIo?.disconnect();
      this._plIo = null;
      this._plHold = false;
      this.style.display = "";
      this.style.minHeight = "";
      if (this._plHass !== undefined) super.hass = this._plHass;
      this._plHass = undefined;
      if (this.isConnected) super.connectedCallback?.();
    }
  };
  return customElements.define(tag, lazy, options);
}

/**
 * Shared by the PC cards (its names are used by the other src/ files): the computer's entities and history, i18n helpers,
 * the base card (header, tiles, tap / hold), the mini card, the visual editor and the common styles. Same base as ha-room-card.
 * https://github.com/juju35/ha-pc-card
 */
const RC_VERSION = "__VERSION__";

const RC_HOLD_MS = 500;
const RC_MOVE_PX = 8;
// A held arrow key repeats some 30 times a second: one brightness step every RC_REPEAT_MS at most.
const RC_REPEAT_MS = 150;

// ── Overviews ────────────────────────────────────────────────────────────────
// Shared by room-overview-card and room-environment-overview-card.

// The zoom / detail button: the same icons on the overviews and the mini cards.
const rcZoomIcon = (card) => (card._zoomed ? "mdi:arrow-collapse" : "mdi:arrow-expand");

// Back to the compact view (mini card, or overview showing the rooms needing a look), when zoomed in.
const rcUnzoom = (card) => {
  if (!card._zoomed) return;
  card._zoomed = false;
  card._sig = null;
  card._render();
};

// True for a click outside `card` that is not in a dialog opened from it (more-info, say): it folds the card back.
const rcOutside = (card, ev) => !ev.composedPath().includes(card) && !rcInDialog(ev);

// "A click elsewhere" is caught on the pointer, not only on the click event: on iOS (Safari and the companion app)
// a tap on something that is not clickable (the background, an empty spot, a card with no action) sends no click to
// the page. The handler runs when the press and the release are both outside the card (a slider dragged out of the
// card does not count), and a scroll does not count (the browser cancels the pointer); keyboard clicks still go
// through the click event. The handler keeps its own checks (outside of the card, not in a dialog).
const watchOutside = (card, handler) => {
  let downOutside = false;
  const onDown = (ev) => {
    downOutside = !ev.composedPath().includes(card);
  };
  const onUp = (ev) => {
    if (downOutside) handler(ev);
    downOutside = false;
  };
  const onClick = (ev) => {
    if (ev.detail === 0) handler(ev);
  };
  return {
    on() {
      document.addEventListener("pointerdown", onDown, true);
      document.addEventListener("pointerup", onUp, true);
      document.addEventListener("click", onClick, true);
    },
    off() {
      document.removeEventListener("pointerdown", onDown, true);
      document.removeEventListener("pointerup", onUp, true);
      document.removeEventListener("click", onClick, true);
    },
    // A tap (press and release at the same spot), for the tests.
    tap(ev) {
      onDown(ev);
      onUp(ev);
    },
  };
};

// A click on the detail button: every room, or back to the rooms needing a look. True when handled.
const rcZoomClick = (card, ev) => {
  if (!ev.target.closest?.(".zoom")) return false;
  ev.stopPropagation();
  card._zoomed = !card._zoomed;
  card._sig = null;
  card._render();
  if (ev.detail === 0) card.shadowRoot.querySelector(".zoom")?.focus({ preventScroll: true });
  return true;
};

// ── i18n ─────────────────────────────────────────────────────────────────────
// Strings shared by the cards; a card's own dictionary wins over these.
const RC_I18N = {
  en: {
    unavailable: "Unavailable",
    turn_all_off: "Turn everything off",
    ed_title: "Title",
    ed_show_title: "Show title",
    ed_advanced: "Advanced",
    ed_language: "Language",
    ed_language_helper: "Empty: the Home Assistant language",
    ed_language_auto: "Automatic",
    ed_navigation_path: "Navigation path",
    err_config: "Set `area` or `entities`",
    zoom_in: "Show the full card",
    zoom_out: "Back to the compact view",
    ed_zoom: "Zoom button",
    ed_zoom_helper: "Switches the mini card to the full card and back",
  },
  fr: {
    unavailable: "Indisponible",
    turn_all_off: "Tout éteindre",
    ed_title: "Titre",
    ed_show_title: "Afficher le titre",
    ed_advanced: "Avancé",
    ed_language: "Langue",
    ed_language_helper: "Vide : la langue de Home Assistant",
    ed_language_auto: "Automatique",
    ed_navigation_path: "Chemin de navigation",
    err_config: "Définis `area` ou `entities`",
    zoom_in: "Afficher la carte complète",
    zoom_out: "Revenir à la vue compacte",
    ed_zoom: "Bouton zoom",
    ed_zoom_helper: "Bascule la mini-carte en carte complète, et inversement",
  },
  de: {
    unavailable: "Nicht verfügbar",
    turn_all_off: "Alles ausschalten",
    ed_title: "Titel",
    ed_show_title: "Titel anzeigen",
    ed_advanced: "Erweitert",
    ed_language: "Sprache",
    ed_language_helper: "Leer: die Sprache von Home Assistant",
    ed_language_auto: "Automatisch",
    ed_navigation_path: "Navigationspfad",
    err_config: "Lege `area` oder `entities` fest",
    zoom_in: "Vollständige Karte anzeigen",
    zoom_out: "Zurück zur kompakten Ansicht",
    ed_zoom: "Zoom-Schaltfläche",
    ed_zoom_helper: "Wechselt von der Mini-Karte zur vollständigen Karte und zurück",
  },
  es: {
    unavailable: "No disponible",
    turn_all_off: "Apagar todo",
    ed_title: "Título",
    ed_show_title: "Mostrar el título",
    ed_advanced: "Avanzado",
    ed_language: "Idioma",
    ed_language_helper: "Vacío: el idioma de Home Assistant",
    ed_language_auto: "Automático",
    ed_navigation_path: "Ruta de navegación",
    err_config: "Define `area` o `entities`",
    zoom_in: "Mostrar la tarjeta completa",
    zoom_out: "Volver a la vista compacta",
    ed_zoom: "Botón de zoom",
    ed_zoom_helper: "Cambia de la minitarjeta a la tarjeta completa y viceversa",
  },
  sr: {
    unavailable: "Недоступно",
    turn_all_off: "Искључи све",
    ed_title: "Наслов",
    ed_show_title: "Прикажи наслов",
    ed_advanced: "Напредно",
    ed_language: "Језик",
    ed_language_helper: "Празно: језик Home Assistant-а",
    ed_language_auto: "Аутоматски",
    ed_navigation_path: "Путања за навигацију",
    err_config: "Подесите `area` или `entities`",
    zoom_in: "Прикажи целу картицу",
    zoom_out: "Назад на компактни приказ",
    ed_zoom: "Дугме за увећање",
    ed_zoom_helper: "Пребацује мини картицу на пун приказ и назад",
  },
  "sr-Latn": {
    unavailable: "Nedostupno",
    turn_all_off: "Isključi sve",
    ed_title: "Naslov",
    ed_show_title: "Prikaži naslov",
    ed_advanced: "Napredno",
    ed_language: "Jezik",
    ed_language_helper: "Prazno: jezik Home Assistant-a",
    ed_language_auto: "Automatski",
    ed_navigation_path: "Putanja za navigaciju",
    err_config: "Podesite `area` ili `entities`",
    zoom_in: "Prikaži celu karticu",
    zoom_out: "Nazad na kompaktni prikaz",
    ed_zoom: "Dugme za uvećanje",
    ed_zoom_helper: "Prebacuje mini karticu na pun prikaz i nazad",
  },
  it: {
    unavailable: "Non disponibile",
    turn_all_off: "Spegni tutto",
    ed_title: "Titolo",
    ed_show_title: "Mostra il titolo",
    ed_advanced: "Avanzate",
    ed_language: "Lingua",
    ed_language_helper: "Vuoto: la lingua di Home Assistant",
    ed_language_auto: "Automatica",
    ed_navigation_path: "Percorso di navigazione",
    err_config: "Imposta `area` o `entities`",
    zoom_in: "Mostra la scheda completa",
    zoom_out: "Torna alla vista compatta",
    ed_zoom: "Pulsante zoom",
    ed_zoom_helper: "Passa dalla mini scheda alla scheda completa e viceversa",
  },
  nl: {
    unavailable: "Niet beschikbaar",
    turn_all_off: "Alles uitschakelen",
    ed_title: "Titel",
    ed_show_title: "Titel tonen",
    ed_advanced: "Geavanceerd",
    ed_language: "Taal",
    ed_language_helper: "Leeg: de taal van Home Assistant",
    ed_language_auto: "Automatisch",
    ed_navigation_path: "Navigatiepad",
    err_config: "Stel `area` of `entities` in",
    zoom_in: "Volledige kaart tonen",
    zoom_out: "Terug naar de compacte weergave",
    ed_zoom: "Zoomknop",
    ed_zoom_helper: "Schakelt de minikaart naar de volledige kaart en terug",
  },
  pt: {
    unavailable: "Indisponível",
    turn_all_off: "Desligar tudo",
    ed_title: "Título",
    ed_show_title: "Mostrar o título",
    ed_advanced: "Avançado",
    ed_language: "Idioma",
    ed_language_helper: "Vazio: o idioma do Home Assistant",
    ed_language_auto: "Automático",
    ed_navigation_path: "Caminho de navegação",
    err_config: "Defina `area` ou `entities`",
    zoom_in: "Mostrar o cartão completo",
    zoom_out: "Voltar à vista compacta",
    ed_zoom: "Botão de zoom",
    ed_zoom_helper: "Alterna entre o minicartão e o cartão completo",
  },
  pl: {
    unavailable: "Niedostępne",
    turn_all_off: "Wyłącz wszystko",
    ed_title: "Tytuł",
    ed_show_title: "Pokaż tytuł",
    ed_advanced: "Zaawansowane",
    ed_language: "Język",
    ed_language_helper: "Puste: język Home Assistanta",
    ed_language_auto: "Automatyczny",
    ed_navigation_path: "Ścieżka nawigacji",
    err_config: "Ustaw `area` lub `entities`",
    zoom_in: "Pokaż pełną kartę",
    zoom_out: "Wróć do widoku kompaktowego",
    ed_zoom: "Przycisk powiększenia",
    ed_zoom_helper: "Przełącza minikartę na pełną kartę i z powrotem",
  },
  ro: {
    unavailable: "Indisponibil",
    turn_all_off: "Oprește tot",
    ed_title: "Titlu",
    ed_show_title: "Afișează titlul",
    ed_advanced: "Avansat",
    ed_language: "Limbă",
    ed_language_helper: "Gol: limba Home Assistant",
    ed_language_auto: "Automată",
    ed_navigation_path: "Cale de navigare",
    err_config: "Setează `area` sau `entities`",
    zoom_in: "Afișează cardul complet",
    zoom_out: "Înapoi la vizualizarea compactă",
    ed_zoom: "Buton de zoom",
    ed_zoom_helper: "Comută între mini-card și cardul complet",
  },
  da: {
    unavailable: "Utilgængelig",
    turn_all_off: "Sluk alt",
    ed_title: "Titel",
    ed_show_title: "Vis titel",
    ed_advanced: "Avanceret",
    ed_language: "Sprog",
    ed_language_helper: "Tomt: Home Assistants sprog",
    ed_language_auto: "Automatisk",
    ed_navigation_path: "Navigationssti",
    err_config: "Angiv `area` eller `entities`",
    zoom_in: "Vis hele kortet",
    zoom_out: "Tilbage til den kompakte visning",
    ed_zoom: "Zoomknap",
    ed_zoom_helper: "Skifter fra minikortet til hele kortet og tilbage",
  },
  sv: {
    unavailable: "Ej tillgänglig",
    turn_all_off: "Stäng av allt",
    ed_title: "Titel",
    ed_show_title: "Visa rubrik",
    ed_advanced: "Avancerat",
    ed_language: "Språk",
    ed_language_helper: "Tomt: Home Assistants språk",
    ed_language_auto: "Automatiskt",
    ed_navigation_path: "Navigeringssökväg",
    err_config: "Ange `area` eller `entities`",
    zoom_in: "Visa hela kortet",
    zoom_out: "Tillbaka till kompakt vy",
    ed_zoom: "Zoomknapp",
    ed_zoom_helper: "Växlar mellan minikortet och hela kortet",
  },
  bg: {
    unavailable: "Недостъпно",
    turn_all_off: "Изключи всичко",
    ed_title: "Заглавие",
    ed_show_title: "Показване на заглавието",
    ed_advanced: "Разширени",
    ed_language: "Език",
    ed_language_helper: "Празно: езикът на Home Assistant",
    ed_language_auto: "Автоматично",
    ed_navigation_path: "Път за навигация",
    err_config: "Задайте `area` или `entities`",
    zoom_in: "Покажи пълната карта",
    zoom_out: "Обратно към компактния изглед",
    ed_zoom: "Бутон за увеличение",
    ed_zoom_helper: "Превключва от мини картата към пълната карта и обратно",
  },
  ru: {
    unavailable: "Недоступно",
    turn_all_off: "Выключить всё",
    ed_title: "Заголовок",
    ed_show_title: "Показывать заголовок",
    ed_advanced: "Дополнительно",
    ed_language: "Язык",
    ed_language_helper: "Пусто: язык Home Assistant",
    ed_language_auto: "Автоматически",
    ed_navigation_path: "Путь навигации",
    err_config: "Укажите `area` или `entities`",
    zoom_in: "Показать полную карточку",
    zoom_out: "Вернуться к компактному виду",
    ed_zoom: "Кнопка масштаба",
    ed_zoom_helper: "Переключает мини-карточку на полную карточку и обратно",
  },
  uk: {
    unavailable: "Недоступно",
    turn_all_off: "Вимкнути все",
    ed_title: "Заголовок",
    ed_show_title: "Показувати заголовок",
    ed_advanced: "Додатково",
    ed_language: "Мова",
    ed_language_helper: "Порожньо: мова Home Assistant",
    ed_language_auto: "Автоматично",
    ed_navigation_path: "Шлях навігації",
    err_config: "Вкажіть `area` або `entities`",
    zoom_in: "Показати повну картку",
    zoom_out: "Повернутися до компактного вигляду",
    ed_zoom: "Кнопка масштабу",
    ed_zoom_helper: "Перемикає міні-картку на повну картку й назад",
  },
  hu: {
    unavailable: "Nem elérhető",
    turn_all_off: "Minden kikapcsolása",
    ed_title: "Cím",
    ed_show_title: "Cím megjelenítése",
    ed_advanced: "Speciális",
    ed_language: "Nyelv",
    ed_language_helper: "Üres: a Home Assistant nyelve",
    ed_language_auto: "Automatikus",
    ed_navigation_path: "Navigációs útvonal",
    err_config: "Állítsd be az `area` vagy az `entities` értékét",
    zoom_in: "A teljes kártya megjelenítése",
    zoom_out: "Vissza a kompakt nézethez",
    ed_zoom: "Nagyítás gomb",
    ed_zoom_helper: "Vált a mini kártya és a teljes kártya között",
  },
  sk: {
    unavailable: "Nedostupné",
    turn_all_off: "Vypnúť všetko",
    ed_title: "Názov",
    ed_show_title: "Zobraziť názov",
    ed_advanced: "Rozšírené",
    ed_language: "Jazyk",
    ed_language_helper: "Prázdne: jazyk Home Assistanta",
    ed_language_auto: "Automaticky",
    ed_navigation_path: "Navigačná cesta",
    err_config: "Nastavte `area` alebo `entities`",
    zoom_in: "Zobraziť celú kartu",
    zoom_out: "Späť na kompaktné zobrazenie",
    ed_zoom: "Tlačidlo priblíženia",
    ed_zoom_helper: "Prepína minikartu na celú kartu a späť",
  },
  cs: {
    unavailable: "Nedostupné",
    turn_all_off: "Vypnout vše",
    ed_title: "Název",
    ed_show_title: "Zobrazit název",
    ed_advanced: "Pokročilé",
    ed_language: "Jazyk",
    ed_language_helper: "Prázdné: jazyk Home Assistanta",
    ed_language_auto: "Automaticky",
    ed_navigation_path: "Navigační cesta",
    err_config: "Nastavte `area` nebo `entities`",
    zoom_in: "Zobrazit celou kartu",
    zoom_out: "Zpět na kompaktní zobrazení",
    ed_zoom: "Tlačítko přiblížení",
    ed_zoom_helper: "Přepíná minikartu na celou kartu a zpět",
  },
  sl: {
    unavailable: "Ni na voljo",
    turn_all_off: "Izklopi vse",
    ed_title: "Naslov",
    ed_show_title: "Prikaži naslov",
    ed_advanced: "Napredno",
    ed_language: "Jezik",
    ed_language_helper: "Prazno: jezik Home Assistanta",
    ed_language_auto: "Samodejno",
    ed_navigation_path: "Navigacijska pot",
    err_config: "Nastavite `area` ali `entities`",
    zoom_in: "Prikaži celotno kartico",
    zoom_out: "Nazaj na strnjen pogled",
    ed_zoom: "Gumb za povečavo",
    ed_zoom_helper: "Preklopi mini kartico v celotno kartico in nazaj",
  },
  lv: {
    unavailable: "Nav pieejams",
    turn_all_off: "Izslēgt visu",
    ed_title: "Virsraksts",
    ed_show_title: "Rādīt virsrakstu",
    ed_advanced: "Papildu",
    ed_language: "Valoda",
    ed_language_helper: "Tukšs: Home Assistant valoda",
    ed_language_auto: "Automātiski",
    ed_navigation_path: "Navigācijas ceļš",
    err_config: "Iestatiet `area` vai `entities`",
    zoom_in: "Rādīt pilno karti",
    zoom_out: "Atpakaļ uz kompakto skatu",
    ed_zoom: "Tālummaiņas poga",
    ed_zoom_helper: "Pārslēdz mini karti uz pilno karti un atpakaļ",
  },
  el: {
    unavailable: "Μη διαθέσιμο",
    turn_all_off: "Απενεργοποίηση όλων",
    ed_title: "Τίτλος",
    ed_show_title: "Εμφάνιση τίτλου",
    ed_advanced: "Για προχωρημένους",
    ed_language: "Γλώσσα",
    ed_language_helper: "Κενό: η γλώσσα του Home Assistant",
    ed_language_auto: "Αυτόματα",
    ed_navigation_path: "Διαδρομή πλοήγησης",
    err_config: "Ορίστε `area` ή `entities`",
    zoom_in: "Εμφάνιση της πλήρους κάρτας",
    zoom_out: "Επιστροφή στη συμπαγή προβολή",
    ed_zoom: "Κουμπί ζουμ",
    ed_zoom_helper: "Εναλλάσσει τη μίνι κάρτα με την πλήρη κάρτα",
  },
};

// ── Computer ─────────────────────────────────────────────────────────────────
// A computer is a device of System Bridge, HASS.Agent, LNXlink (MQTT) or the Home Assistant app on a Mac. Its
// entities are found on that device by what they are (domain, device class, unit) and their name: the loads, the
// temperatures and clocks, the memory, the disks, the signed-in user, the uptime, whether it is on or asleep, and the
// buttons that lock it, put it to sleep, shut it down, restart or wake it. `entities` overrides any role.
const PC_PLATFORMS = ["system_bridge", "hass_agent", "mqtt", "mobile_app"];
const PC_ROLES = ["cpu", "cpu_temp", "cpu_speed", "gpu", "gpu_temp", "gpu_speed", "ram", "ram_used", "user", "uptime", "online", "state", "lock", "sleep", "shutdown", "restart", "wake"];

const pcNorm = (s) =>
  String(s ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9:]+/g, "_");
const pcNum = (st) => {
  if (!st || ["unavailable", "unknown", ""].includes(st.state)) return null;
  const v = Number(st.state);
  return Number.isFinite(v) ? v : null;
};

// A size in bytes, from a data size sensor's unit (decimal and binary units).
const PC_UNITS = { b: 1, kb: 1e3, mb: 1e6, gb: 1e9, tb: 1e12, kib: 1024, mib: 1024 ** 2, gib: 1024 ** 3, tib: 1024 ** 4 };
const pcBytes = (st) => {
  const v = pcNum(st);
  const k = PC_UNITS[String(st?.attributes?.unit_of_measurement || "").toLowerCase()];
  return v == null || !k ? null : v * k;
};
// A size in base 1024 (KiB, MiB, GiB, TiB), with 2 decimals under 10, 1 under 100, none above.
const pcSize = (bytes, fmt) => {
  if (bytes == null) return "";
  const units = ["B", "KiB", "MiB", "GiB", "TiB"];
  let i = 0;
  let v = bytes;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${fmt(v, i === 0 || v >= 100 ? 0 : v >= 10 ? 1 : 2)} ${units[i]}`;
};
// A clock in GHz, from MHz or GHz.
const pcGhz = (st) => {
  const v = pcNum(st);
  if (v == null) return null;
  return /^mhz$/i.test(st.attributes?.unit_of_measurement || "") ? v / 1000 : v;
};

// The role of an entity of the computer, from its domain, device class, unit and name.
const pcRole = (hass, id) => {
  const st = hass.states[id];
  const a = st?.attributes || {};
  const dom = id.split(".")[0];
  const n = pcNorm(`${hass.entities?.[id]?.translation_key || ""} ${id} ${a.friendly_name || ""}`);
  const u = String(a.unit_of_measurement || "").toLowerCase();
  const dc = a.device_class;
  const not = (re) => !re.test(n);
  if (dom === "button" || dom === "script" || dom === "switch") {
    if (/wake|wol|magic_packet/.test(n)) return "wake";
    if (/lock/.test(n) && not(/unlock/)) return "lock";
    if (/sleep|suspend|hibernat|standby/.test(n)) return "sleep";
    if (/restart|reboot/.test(n)) return "restart";
    if (/shut_?down|power_?off|poweroff/.test(n)) return "shutdown";
    return null;
  }
  if (dom === "binary_sensor") return ["connectivity", "power", "running", "plug"].includes(dc) || /online|status|power_?state|is_on/.test(n) ? "online" : null;
  if (dom !== "sensor") return null;
  if (dc === "temperature") return /gpu|graphics/.test(n) ? "gpu_temp" : /cpu|processor|package|core/.test(n) ? "cpu_temp" : null;
  if (u === "mhz" || u === "ghz") return /gpu|graphics/.test(n) ? "gpu_speed" : /cpu|processor|clock|speed|frequency/.test(n) ? "cpu_speed" : null;
  if (u === "%") {
    if (/gpu|graphics/.test(n) && not(/memory|ram|fan|temp|clock|vram/)) return "gpu";
    if (/memory|ram/.test(n) && not(/gpu|swap|virtual|vram|disk/)) return "ram";
    if (/cpu|processor|load/.test(n) && not(/temp|clock|speed|fan|power|gpu|memory|ram|disk|battery/)) return "cpu";
    return null;
  }
  if (PC_UNITS[u] && /memory|ram/.test(n) && /used|in_use/.test(n) && not(/gpu|swap|virtual|vram/)) return "ram_used";
  if (dc === "timestamp" && /boot|uptime|start/.test(n)) return "uptime";
  if (/power_?state|session_?state|system_?state|session/.test(n) && !u) return "state";
  if (/logged|signed|current_?user|active_?user|user/.test(n) && !u && not(/count|users/)) return "user";
  return null;
};

// The disks of the computer: a usage sensor in % per disk, and its free space when the device has one, matched by the
// disk's letter or name.
const PC_DISK = /disk|drive|storage|volume|partition|filesystem|mount|space/;
const pcDiskKey = (n) => (n.match(/(?:^|_)([a-z]):?(?:_|$)/)?.[1] || n.replace(/(disk|drive|storage|volume|partition|filesystem|mount|usage|used|use|free|space|available|percent|sensor|_+)/g, "_")).replace(/^_+|_+$/g, "");
const pcDisks = (hass, ids) => {
  const label = (id) => pcNorm(`${id.split(".")[1]} ${hass.states[id]?.attributes.friendly_name || ""}`);
  const pct = ids.filter((id) => id.startsWith("sensor.") && hass.states[id]?.attributes.unit_of_measurement === "%" && PC_DISK.test(label(id)) && !/memory|ram|gpu/.test(label(id)));
  const free = ids.filter((id) => id.startsWith("sensor.") && PC_UNITS[String(hass.states[id]?.attributes.unit_of_measurement || "").toLowerCase()] && /free|avail/.test(label(id)));
  return pct.map((id) => {
    const key = pcDiskKey(pcNorm(id.split(".")[1]));
    return { id, key, free: free.find((f) => pcDiskKey(pcNorm(f.split(".")[1])) === key) };
  });
};

// The computers of the home: the devices of those integrations with a load or a power button, most complete first.
const pcDevices = (hass) => {
  const reg = hass.entities || {};
  const score = {};
  for (const [id, e] of Object.entries(reg)) {
    if (!e.device_id || !PC_PLATFORMS.includes(e.platform)) continue;
    const r = pcRole(hass, id);
    if (r) score[e.device_id] = (score[e.device_id] || 0) + (r === "cpu" || r === "shutdown" ? 3 : 1);
  }
  return Object.keys(score)
    .filter((d) => score[d] >= 3)
    .sort((a, b) => score[b] - score[a]);
};

// The entity of each role on the computer's device (`entity`'s, else `device`, else the first computer of the home).
const pcFind = (hass, entity, device, overrides = {}) => {
  const reg = hass.entities || {};
  const dev = device || (entity && reg[entity]?.device_id) || pcDevices(hass)[0];
  const ids = Object.keys(reg).filter((id) => dev && reg[id].device_id === dev && !reg[id].hidden);
  const out = { device: dev || null };
  for (const id of ids) {
    const r = pcRole(hass, id);
    if (r && !out[r]) out[r] = id;
  }
  out.disks = Array.isArray(overrides.disks) ? overrides.disks.map((d) => (typeof d === "string" ? { id: d, key: pcDiskKey(pcNorm(d.split(".")[1])) } : d)) : pcDisks(hass, ids);
  for (const [k, v] of Object.entries(overrides)) if (v && k !== "disks" && PC_ROLES.includes(k)) out[k] = v;
  return out;
};

// `n` points over [start, end] from a history ([{ t, v }], oldest first): the average in each slot, the last value
// carried over an empty slot, null before the first value.
const pcSeries = (rows, start, end, n) => {
  const out = [];
  const step = (end - start) / n;
  let last = null;
  let i = 0;
  for (let k = 0; k < n; k++) {
    const to = start + (k + 1) * step;
    let sum = 0;
    let cnt = 0;
    while (i < rows.length && rows[i].t < to) {
      if (rows[i].v != null) {
        if (rows[i].t >= start + k * step) {
          sum += rows[i].v;
          cnt++;
        }
        last = rows[i].v;
      }
      i++;
    }
    out.push(cnt ? sum / cnt : last);
  }
  return out;
};

// The Intl formats, made once per language and options (a render formats many numbers).
const pcIntlCache = new Map();
const pcIntl = (Kind, lang, opts) => {
  const key = `${Kind.name}|${lang}|${JSON.stringify(opts)}`;
  if (!pcIntlCache.has(key)) pcIntlCache.set(key, new Kind(lang, opts));
  return pcIntlCache.get(key);
};

// Strings of the PC cards; the shared ones above (editor basics) complete them.
const PC_I18N = {
  en: {
    title: "Computer",
    st_on: "On",
    st_sleep: "Asleep",
    st_off: "Off",
    st_locked: "Locked",
    st_offline: "Unavailable",
    signed_in: "signed in",
    locked: "locked",
    up: "up {t}",
    off_since: "off since {t}",
    asleep_since: "asleep since {t}",
    dur_dh: "{d} d {h} h",
    dur_hm: "{h} h {m} min",
    dur_m: "{m} min",
    load: "Load",
    load_24h: "Load · last 24 h",
    temp_cpu: "{t} CPU",
    temp_gpu: "{t} GPU",
    cpu: "CPU",
    gpu: "GPU",
    ram: "RAM",
    disks: "Disks",
    free: "{v} free",
    lock: "Lock",
    sleep: "Sleep",
    shutdown: "Shut down",
    restart: "Restart",
    wake: "Wake",
    confirm_shutdown: "Shut down {name}? Unsaved work may be lost.",
    confirm_restart: "Restart {name}? Unsaved work may be lost.",
    confirm_sleep: "Put {name} to sleep?",
    cancel: "Cancel",
    no_pc: "No computer found",
    chip_cpu: "CPU {v}",
    chip_ram: "RAM {v}",
    ed_entity: "Computer",
    ed_entity_helper: "Any entity of the computer's device (System Bridge, HASS.Agent, LNXlink, Mobile App); its other entities are found with it",
    ed_mac: "MAC address",
    ed_mac_helper: "To wake the computer with Wake on LAN when it has no wake button",
    ed_broadcast_address: "Broadcast address",
    ed_broadcast_address_helper: "Optional, for Wake on LAN",
    ed_show_history: "Last 24 hours",
    ed_show_disks: "Disks",
    ed_show_controls: "Controls",
    ed_confirm: "Confirm before shutting down, restarting or sleeping",
    ed_show_subtitle: "Show subtitle",
    ed_illustration: "Illustrated header",
    ed_illustration_theme: "Header theme",
    ed_theme_auto: "Automatic (follows the theme)",
    ed_theme_day: "Day",
    ed_theme_night: "Night",
    ed_animations: "Animations",
    ed_entities: "Entities (YAML)",
    ed_entities_helper:
      "Overrides of the found entities, by role: cpu, cpu_temp, cpu_speed, gpu, gpu_temp, gpu_speed, ram, ram_used, user, uptime, online, state, lock, sleep, shutdown, restart, wake; disks: a list of usage sensors",
    ed_title_helper: "Empty: the computer's name",
  },
  fr: {
    title: "Ordinateur",
    st_on: "Allumé",
    st_sleep: "En veille",
    st_off: "Éteint",
    st_locked: "Verrouillé",
    st_offline: "Indisponible",
    signed_in: "connecté",
    locked: "verrouillé",
    up: "allumé depuis {t}",
    off_since: "éteint depuis {t}",
    asleep_since: "en veille depuis {t}",
    dur_dh: "{d} j {h} h",
    dur_hm: "{h} h {m} min",
    dur_m: "{m} min",
    load: "Charge",
    load_24h: "Charge · dernières 24 h",
    temp_cpu: "{t} CPU",
    temp_gpu: "{t} GPU",
    cpu: "CPU",
    gpu: "GPU",
    ram: "RAM",
    disks: "Disques",
    free: "{v} libres",
    lock: "Verrouiller",
    sleep: "Mettre en veille",
    shutdown: "Éteindre",
    restart: "Redémarrer",
    wake: "Réveiller",
    confirm_shutdown: "Éteindre {name} ? Le travail non enregistré peut être perdu.",
    confirm_restart: "Redémarrer {name} ? Le travail non enregistré peut être perdu.",
    confirm_sleep: "Mettre {name} en veille ?",
    cancel: "Annuler",
    no_pc: "Aucun ordinateur trouvé",
    chip_cpu: "CPU {v}",
    chip_ram: "RAM {v}",
    ed_entity: "Ordinateur",
    ed_entity_helper: "N'importe quelle entité de l'appareil de l'ordinateur (System Bridge, HASS.Agent, LNXlink, Mobile App) ; ses autres entités sont trouvées avec",
    ed_mac: "Adresse MAC",
    ed_mac_helper: "Pour réveiller l'ordinateur par Wake on LAN quand il n'a pas de bouton de réveil",
    ed_broadcast_address: "Adresse de diffusion",
    ed_broadcast_address_helper: "Facultative, pour le Wake on LAN",
    ed_show_history: "Dernières 24 heures",
    ed_show_disks: "Disques",
    ed_show_controls: "Commandes",
    ed_confirm: "Confirmer avant d'éteindre, de redémarrer ou de mettre en veille",
    ed_show_subtitle: "Afficher le sous-titre",
    ed_illustration: "En-tête illustré",
    ed_illustration_theme: "Thème de l'en-tête",
    ed_theme_auto: "Automatique (suit le thème)",
    ed_theme_day: "Jour",
    ed_theme_night: "Nuit",
    ed_animations: "Animations",
    ed_entities: "Entités (YAML)",
    ed_entities_helper:
      "Remplace les entités trouvées, par rôle : cpu, cpu_temp, cpu_speed, gpu, gpu_temp, gpu_speed, ram, ram_used, user, uptime, online, state, lock, sleep, shutdown, restart, wake ; disks : une liste de capteurs d'occupation",
    ed_title_helper: "Vide : le nom de l'ordinateur",
  },
  de: {
    title: "Computer",
    st_on: "An",
    st_sleep: "Im Ruhezustand",
    st_off: "Aus",
    st_locked: "Gesperrt",
    st_offline: "Nicht verfügbar",
    signed_in: "angemeldet",
    locked: "gesperrt",
    up: "an seit {t}",
    off_since: "aus seit {t}",
    asleep_since: "im Ruhezustand seit {t}",
    dur_dh: "{d} T {h} h",
    dur_hm: "{h} h {m} min",
    dur_m: "{m} min",
    load: "Auslastung",
    load_24h: "Auslastung · letzte 24 h",
    temp_cpu: "{t} CPU",
    temp_gpu: "{t} GPU",
    cpu: "CPU",
    gpu: "GPU",
    ram: "RAM",
    disks: "Laufwerke",
    free: "{v} frei",
    lock: "Sperren",
    sleep: "Ruhezustand",
    shutdown: "Herunterfahren",
    restart: "Neu starten",
    wake: "Aufwecken",
    confirm_shutdown: "{name} herunterfahren? Nicht gespeicherte Arbeit kann verloren gehen.",
    confirm_restart: "{name} neu starten? Nicht gespeicherte Arbeit kann verloren gehen.",
    confirm_sleep: "{name} in den Ruhezustand versetzen?",
    cancel: "Abbrechen",
    no_pc: "Kein Computer gefunden",
    chip_cpu: "CPU {v}",
    chip_ram: "RAM {v}",
    ed_entity: "Computer",
    ed_entity_helper: "Eine beliebige Entität des Computer-Geräts (System Bridge, HASS.Agent, LNXlink, Mobile App); seine anderen Entitäten werden mitgefunden",
    ed_mac: "MAC-Adresse",
    ed_mac_helper: "Um den Computer per Wake on LAN zu wecken, wenn er keine Aufwecktaste hat",
    ed_broadcast_address: "Broadcast-Adresse",
    ed_broadcast_address_helper: "Optional, für Wake on LAN",
    ed_show_history: "Letzte 24 Stunden",
    ed_show_disks: "Laufwerke",
    ed_show_controls: "Steuerung",
    ed_confirm: "Vor dem Herunterfahren, Neustarten oder Ruhezustand bestätigen",
    ed_show_subtitle: "Untertitel anzeigen",
    ed_illustration: "Illustrierte Kopfzeile",
    ed_illustration_theme: "Design der Kopfzeile",
    ed_theme_auto: "Automatisch (folgt dem Design)",
    ed_theme_day: "Tag",
    ed_theme_night: "Nacht",
    ed_animations: "Animationen",
    ed_entities: "Entitäten (YAML)",
    ed_entities_helper: "Ersetzt die gefundenen Entitäten, nach Rolle: cpu, cpu_temp, cpu_speed, gpu, gpu_temp, gpu_speed, ram, ram_used, user, uptime, online, state, lock, sleep, shutdown, restart, wake; disks: eine Liste von Belegungssensoren",
    ed_title_helper: "Leer: der Name des Computers",
  },
  es: {
    title: "Ordenador",
    st_on: "Encendido",
    st_sleep: "En reposo",
    st_off: "Apagado",
    st_locked: "Bloqueado",
    st_offline: "No disponible",
    signed_in: "sesión iniciada",
    locked: "bloqueado",
    up: "encendido desde hace {t}",
    off_since: "apagado desde hace {t}",
    asleep_since: "en reposo desde hace {t}",
    dur_dh: "{d} d {h} h",
    dur_hm: "{h} h {m} min",
    dur_m: "{m} min",
    load: "Carga",
    load_24h: "Carga · últimas 24 h",
    temp_cpu: "{t} CPU",
    temp_gpu: "{t} GPU",
    cpu: "CPU",
    gpu: "GPU",
    ram: "RAM",
    disks: "Discos",
    free: "{v} libres",
    lock: "Bloquear",
    sleep: "Suspender",
    shutdown: "Apagar",
    restart: "Reiniciar",
    wake: "Activar",
    confirm_shutdown: "¿Apagar {name}? Se puede perder el trabajo no guardado.",
    confirm_restart: "¿Reiniciar {name}? Se puede perder el trabajo no guardado.",
    confirm_sleep: "¿Suspender {name}?",
    cancel: "Cancelar",
    no_pc: "No se encontró ningún ordenador",
    chip_cpu: "CPU {v}",
    chip_ram: "RAM {v}",
    ed_entity: "Ordenador",
    ed_entity_helper: "Cualquier entidad del dispositivo del ordenador (System Bridge, HASS.Agent, LNXlink, Mobile App); sus otras entidades se encuentran con ella",
    ed_mac: "Dirección MAC",
    ed_mac_helper: "Para activar el ordenador con Wake on LAN cuando no tiene botón de activación",
    ed_broadcast_address: "Dirección de difusión",
    ed_broadcast_address_helper: "Opcional, para Wake on LAN",
    ed_show_history: "Últimas 24 horas",
    ed_show_disks: "Discos",
    ed_show_controls: "Controles",
    ed_confirm: "Confirmar antes de apagar, reiniciar o suspender",
    ed_show_subtitle: "Mostrar subtítulo",
    ed_illustration: "Encabezado ilustrado",
    ed_illustration_theme: "Tema del encabezado",
    ed_theme_auto: "Automático (sigue el tema)",
    ed_theme_day: "Día",
    ed_theme_night: "Noche",
    ed_animations: "Animaciones",
    ed_entities: "Entidades (YAML)",
    ed_entities_helper: "Sustituye las entidades encontradas, por rol: cpu, cpu_temp, cpu_speed, gpu, gpu_temp, gpu_speed, ram, ram_used, user, uptime, online, state, lock, sleep, shutdown, restart, wake; disks: una lista de sensores de ocupación",
    ed_title_helper: "Vacío: el nombre del ordenador",
  },
  sr: {
    title: "Рачунар",
    st_on: "Укључен",
    st_sleep: "У стању спавања",
    st_off: "Искључен",
    st_locked: "Закључан",
    st_offline: "Недоступно",
    signed_in: "пријављен",
    locked: "закључан",
    up: "укључен {t}",
    off_since: "искључен {t}",
    asleep_since: "у стању спавања {t}",
    dur_dh: "{d} д {h} ч",
    dur_hm: "{h} ч {m} мин",
    dur_m: "{m} мин",
    load: "Оптерећење",
    load_24h: "Оптерећење · последња 24 ч",
    temp_cpu: "{t} CPU",
    temp_gpu: "{t} GPU",
    cpu: "CPU",
    gpu: "GPU",
    ram: "RAM",
    disks: "Дискови",
    free: "{v} слободно",
    lock: "Закључај",
    sleep: "Успавај",
    shutdown: "Искључи",
    restart: "Поново покрени",
    wake: "Пробуди",
    confirm_shutdown: "Искључити {name}? Несачуван рад може бити изгубљен.",
    confirm_restart: "Поново покренути {name}? Несачуван рад може бити изгубљен.",
    confirm_sleep: "Успавати {name}?",
    cancel: "Откажи",
    no_pc: "Није пронађен рачунар",
    chip_cpu: "CPU {v}",
    chip_ram: "RAM {v}",
    ed_entity: "Рачунар",
    ed_entity_helper: "Било који ентитет уређаја рачунара (System Bridge, HASS.Agent, LNXlink, Mobile App); његови остали ентитети се проналазе са њим",
    ed_mac: "MAC адреса",
    ed_mac_helper: "За буђење рачунара преко Wake on LAN када нема дугме за буђење",
    ed_broadcast_address: "Broadcast адреса",
    ed_broadcast_address_helper: "Опционо, за Wake on LAN",
    ed_show_history: "Последња 24 сата",
    ed_show_disks: "Дискови",
    ed_show_controls: "Команде",
    ed_confirm: "Потврди пре искључивања, поновног покретања или спавања",
    ed_show_subtitle: "Прикажи поднаслов",
    ed_illustration: "Илустровано заглавље",
    ed_illustration_theme: "Тема заглавља",
    ed_theme_auto: "Аутоматски (прати тему)",
    ed_theme_day: "Дан",
    ed_theme_night: "Ноћ",
    ed_animations: "Анимације",
    ed_entities: "Ентитети (YAML)",
    ed_entities_helper: "Замењује пронађене ентитете, по улози: cpu, cpu_temp, cpu_speed, gpu, gpu_temp, gpu_speed, ram, ram_used, user, uptime, online, state, lock, sleep, shutdown, restart, wake; disks: листа сензора заузетости",
    ed_title_helper: "Празно: име рачунара",
  },
  "sr-Latn": {
    title: "Računar",
    st_on: "Uključen",
    st_sleep: "U stanju spavanja",
    st_off: "Isključen",
    st_locked: "Zaključan",
    st_offline: "Nedostupno",
    signed_in: "prijavljen",
    locked: "zaključan",
    up: "uključen {t}",
    off_since: "isključen {t}",
    asleep_since: "u stanju spavanja {t}",
    dur_dh: "{d} d {h} č",
    dur_hm: "{h} č {m} min",
    dur_m: "{m} min",
    load: "Opterećenje",
    load_24h: "Opterećenje · poslednja 24 č",
    temp_cpu: "{t} CPU",
    temp_gpu: "{t} GPU",
    cpu: "CPU",
    gpu: "GPU",
    ram: "RAM",
    disks: "Diskovi",
    free: "{v} slobodno",
    lock: "Zaključaj",
    sleep: "Uspavaj",
    shutdown: "Isključi",
    restart: "Ponovo pokreni",
    wake: "Probudi",
    confirm_shutdown: "Isključiti {name}? Nesačuvan rad može biti izgubljen.",
    confirm_restart: "Ponovo pokrenuti {name}? Nesačuvan rad može biti izgubljen.",
    confirm_sleep: "Uspavati {name}?",
    cancel: "Otkaži",
    no_pc: "Nije pronađen računar",
    chip_cpu: "CPU {v}",
    chip_ram: "RAM {v}",
    ed_entity: "Računar",
    ed_entity_helper: "Bilo koji entitet uređaja računara (System Bridge, HASS.Agent, LNXlink, Mobile App); njegovi ostali entiteti se pronalaze sa njim",
    ed_mac: "MAC adresa",
    ed_mac_helper: "Za buđenje računara preko Wake on LAN kada nema dugme za buđenje",
    ed_broadcast_address: "Broadcast adresa",
    ed_broadcast_address_helper: "Opciono, za Wake on LAN",
    ed_show_history: "Poslednja 24 sata",
    ed_show_disks: "Diskovi",
    ed_show_controls: "Komande",
    ed_confirm: "Potvrdi pre isključivanja, ponovnog pokretanja ili spavanja",
    ed_show_subtitle: "Prikaži podnaslov",
    ed_illustration: "Ilustrovano zaglavlje",
    ed_illustration_theme: "Tema zaglavlja",
    ed_theme_auto: "Automatski (prati temu)",
    ed_theme_day: "Dan",
    ed_theme_night: "Noć",
    ed_animations: "Animacije",
    ed_entities: "Entiteti (YAML)",
    ed_entities_helper: "Zamenjuje pronađene entitete, po ulozi: cpu, cpu_temp, cpu_speed, gpu, gpu_temp, gpu_speed, ram, ram_used, user, uptime, online, state, lock, sleep, shutdown, restart, wake; disks: lista senzora zauzetosti",
    ed_title_helper: "Prazno: ime računara",
  },
  it: {
    title: "Computer",
    st_on: "Acceso",
    st_sleep: "In sospensione",
    st_off: "Spento",
    st_locked: "Bloccato",
    st_offline: "Non disponibile",
    signed_in: "connesso",
    locked: "bloccato",
    up: "acceso da {t}",
    off_since: "spento da {t}",
    asleep_since: "in sospensione da {t}",
    dur_dh: "{d} g {h} h",
    dur_hm: "{h} h {m} min",
    dur_m: "{m} min",
    load: "Carico",
    load_24h: "Carico · ultime 24 h",
    temp_cpu: "{t} CPU",
    temp_gpu: "{t} GPU",
    cpu: "CPU",
    gpu: "GPU",
    ram: "RAM",
    disks: "Dischi",
    free: "{v} liberi",
    lock: "Blocca",
    sleep: "Sospendi",
    shutdown: "Spegni",
    restart: "Riavvia",
    wake: "Riattiva",
    confirm_shutdown: "Spegnere {name}? Il lavoro non salvato potrebbe andare perso.",
    confirm_restart: "Riavviare {name}? Il lavoro non salvato potrebbe andare perso.",
    confirm_sleep: "Sospendere {name}?",
    cancel: "Annulla",
    no_pc: "Nessun computer trovato",
    chip_cpu: "CPU {v}",
    chip_ram: "RAM {v}",
    ed_entity: "Computer",
    ed_entity_helper: "Qualsiasi entità del dispositivo del computer (System Bridge, HASS.Agent, LNXlink, Mobile App); le sue altre entità vengono trovate con essa",
    ed_mac: "Indirizzo MAC",
    ed_mac_helper: "Per riattivare il computer con Wake on LAN quando non ha un pulsante di riattivazione",
    ed_broadcast_address: "Indirizzo di broadcast",
    ed_broadcast_address_helper: "Facoltativo, per Wake on LAN",
    ed_show_history: "Ultime 24 ore",
    ed_show_disks: "Dischi",
    ed_show_controls: "Comandi",
    ed_confirm: "Conferma prima di spegnere, riavviare o sospendere",
    ed_show_subtitle: "Mostra sottotitolo",
    ed_illustration: "Intestazione illustrata",
    ed_illustration_theme: "Tema dell'intestazione",
    ed_theme_auto: "Automatico (segue il tema)",
    ed_theme_day: "Giorno",
    ed_theme_night: "Notte",
    ed_animations: "Animazioni",
    ed_entities: "Entità (YAML)",
    ed_entities_helper: "Sostituisce le entità trovate, per ruolo: cpu, cpu_temp, cpu_speed, gpu, gpu_temp, gpu_speed, ram, ram_used, user, uptime, online, state, lock, sleep, shutdown, restart, wake; disks: un elenco di sensori di occupazione",
    ed_title_helper: "Vuoto: il nome del computer",
  },
  nl: {
    title: "Computer",
    st_on: "Aan",
    st_sleep: "In slaapstand",
    st_off: "Uit",
    st_locked: "Vergrendeld",
    st_offline: "Niet beschikbaar",
    signed_in: "aangemeld",
    locked: "vergrendeld",
    up: "aan sinds {t}",
    off_since: "uit sinds {t}",
    asleep_since: "in slaapstand sinds {t}",
    dur_dh: "{d} d {h} u",
    dur_hm: "{h} u {m} min",
    dur_m: "{m} min",
    load: "Belasting",
    load_24h: "Belasting · laatste 24 u",
    temp_cpu: "{t} CPU",
    temp_gpu: "{t} GPU",
    cpu: "CPU",
    gpu: "GPU",
    ram: "RAM",
    disks: "Schijven",
    free: "{v} vrij",
    lock: "Vergrendelen",
    sleep: "Slaapstand",
    shutdown: "Afsluiten",
    restart: "Herstarten",
    wake: "Wekken",
    confirm_shutdown: "{name} afsluiten? Niet-opgeslagen werk kan verloren gaan.",
    confirm_restart: "{name} herstarten? Niet-opgeslagen werk kan verloren gaan.",
    confirm_sleep: "{name} in slaapstand zetten?",
    cancel: "Annuleren",
    no_pc: "Geen computer gevonden",
    chip_cpu: "CPU {v}",
    chip_ram: "RAM {v}",
    ed_entity: "Computer",
    ed_entity_helper: "Een willekeurige entiteit van het apparaat van de computer (System Bridge, HASS.Agent, LNXlink, Mobile App); de andere entiteiten worden ermee gevonden",
    ed_mac: "MAC-adres",
    ed_mac_helper: "Om de computer met Wake on LAN te wekken als hij geen wekknop heeft",
    ed_broadcast_address: "Broadcastadres",
    ed_broadcast_address_helper: "Optioneel, voor Wake on LAN",
    ed_show_history: "Laatste 24 uur",
    ed_show_disks: "Schijven",
    ed_show_controls: "Bediening",
    ed_confirm: "Bevestigen voor afsluiten, herstarten of slaapstand",
    ed_show_subtitle: "Ondertitel tonen",
    ed_illustration: "Geïllustreerde koptekst",
    ed_illustration_theme: "Thema van de koptekst",
    ed_theme_auto: "Automatisch (volgt het thema)",
    ed_theme_day: "Dag",
    ed_theme_night: "Nacht",
    ed_animations: "Animaties",
    ed_entities: "Entiteiten (YAML)",
    ed_entities_helper: "Vervangt de gevonden entiteiten, per rol: cpu, cpu_temp, cpu_speed, gpu, gpu_temp, gpu_speed, ram, ram_used, user, uptime, online, state, lock, sleep, shutdown, restart, wake; disks: een lijst van bezettingssensoren",
    ed_title_helper: "Leeg: de naam van de computer",
  },
  pt: {
    title: "Computador",
    st_on: "Ligado",
    st_sleep: "Em suspensão",
    st_off: "Desligado",
    st_locked: "Bloqueado",
    st_offline: "Indisponível",
    signed_in: "sessão iniciada",
    locked: "bloqueado",
    up: "ligado há {t}",
    off_since: "desligado há {t}",
    asleep_since: "em suspensão há {t}",
    dur_dh: "{d} d {h} h",
    dur_hm: "{h} h {m} min",
    dur_m: "{m} min",
    load: "Carga",
    load_24h: "Carga · últimas 24 h",
    temp_cpu: "{t} CPU",
    temp_gpu: "{t} GPU",
    cpu: "CPU",
    gpu: "GPU",
    ram: "RAM",
    disks: "Discos",
    free: "{v} livres",
    lock: "Bloquear",
    sleep: "Suspender",
    shutdown: "Encerrar",
    restart: "Reiniciar",
    wake: "Ativar",
    confirm_shutdown: "Encerrar {name}? O trabalho não guardado pode perder-se.",
    confirm_restart: "Reiniciar {name}? O trabalho não guardado pode perder-se.",
    confirm_sleep: "Suspender {name}?",
    cancel: "Cancelar",
    no_pc: "Nenhum computador encontrado",
    chip_cpu: "CPU {v}",
    chip_ram: "RAM {v}",
    ed_entity: "Computador",
    ed_entity_helper: "Qualquer entidade do dispositivo do computador (System Bridge, HASS.Agent, LNXlink, Mobile App); as suas outras entidades são encontradas com ela",
    ed_mac: "Endereço MAC",
    ed_mac_helper: "Para ativar o computador por Wake on LAN quando não tem botão de ativação",
    ed_broadcast_address: "Endereço de difusão",
    ed_broadcast_address_helper: "Opcional, para Wake on LAN",
    ed_show_history: "Últimas 24 horas",
    ed_show_disks: "Discos",
    ed_show_controls: "Controlos",
    ed_confirm: "Confirmar antes de encerrar, reiniciar ou suspender",
    ed_show_subtitle: "Mostrar subtítulo",
    ed_illustration: "Cabeçalho ilustrado",
    ed_illustration_theme: "Tema do cabeçalho",
    ed_theme_auto: "Automático (segue o tema)",
    ed_theme_day: "Dia",
    ed_theme_night: "Noite",
    ed_animations: "Animações",
    ed_entities: "Entidades (YAML)",
    ed_entities_helper: "Substitui as entidades encontradas, por função: cpu, cpu_temp, cpu_speed, gpu, gpu_temp, gpu_speed, ram, ram_used, user, uptime, online, state, lock, sleep, shutdown, restart, wake; disks: uma lista de sensores de ocupação",
    ed_title_helper: "Vazio: o nome do computador",
  },
  pl: {
    title: "Komputer",
    st_on: "Włączony",
    st_sleep: "Uśpiony",
    st_off: "Wyłączony",
    st_locked: "Zablokowany",
    st_offline: "Niedostępny",
    signed_in: "zalogowany",
    locked: "zablokowany",
    up: "włączony od {t}",
    off_since: "wyłączony od {t}",
    asleep_since: "uśpiony od {t}",
    dur_dh: "{d} d {h} h",
    dur_hm: "{h} h {m} min",
    dur_m: "{m} min",
    load: "Obciążenie",
    load_24h: "Obciążenie · ostatnie 24 h",
    temp_cpu: "{t} CPU",
    temp_gpu: "{t} GPU",
    cpu: "CPU",
    gpu: "GPU",
    ram: "RAM",
    disks: "Dyski",
    free: "{v} wolne",
    lock: "Zablokuj",
    sleep: "Uśpij",
    shutdown: "Wyłącz",
    restart: "Uruchom ponownie",
    wake: "Wybudź",
    confirm_shutdown: "Wyłączyć {name}? Niezapisana praca może zostać utracona.",
    confirm_restart: "Uruchomić ponownie {name}? Niezapisana praca może zostać utracona.",
    confirm_sleep: "Uśpić {name}?",
    cancel: "Anuluj",
    no_pc: "Nie znaleziono komputera",
    chip_cpu: "CPU {v}",
    chip_ram: "RAM {v}",
    ed_entity: "Komputer",
    ed_entity_helper: "Dowolna encja urządzenia komputera (System Bridge, HASS.Agent, LNXlink, Mobile App); jego pozostałe encje zostaną znalezione razem z nią",
    ed_mac: "Adres MAC",
    ed_mac_helper: "Aby wybudzić komputer przez Wake on LAN, gdy nie ma przycisku wybudzania",
    ed_broadcast_address: "Adres rozgłoszeniowy",
    ed_broadcast_address_helper: "Opcjonalny, dla Wake on LAN",
    ed_show_history: "Ostatnie 24 godziny",
    ed_show_disks: "Dyski",
    ed_show_controls: "Sterowanie",
    ed_confirm: "Potwierdzaj przed wyłączeniem, ponownym uruchomieniem lub uśpieniem",
    ed_show_subtitle: "Pokaż podtytuł",
    ed_illustration: "Ilustrowany nagłówek",
    ed_illustration_theme: "Motyw nagłówka",
    ed_theme_auto: "Automatycznie (zgodnie z motywem)",
    ed_theme_day: "Dzień",
    ed_theme_night: "Noc",
    ed_animations: "Animacje",
    ed_entities: "Encje (YAML)",
    ed_entities_helper: "Zastępuje znalezione encje, według roli: cpu, cpu_temp, cpu_speed, gpu, gpu_temp, gpu_speed, ram, ram_used, user, uptime, online, state, lock, sleep, shutdown, restart, wake; disks: lista czujników zajętości",
    ed_title_helper: "Puste: nazwa komputera",
  },
  ro: {
    title: "Calculator",
    st_on: "Pornit",
    st_sleep: "În repaus",
    st_off: "Oprit",
    st_locked: "Blocat",
    st_offline: "Indisponibil",
    signed_in: "conectat",
    locked: "blocat",
    up: "pornit de {t}",
    off_since: "oprit de {t}",
    asleep_since: "în repaus de {t}",
    dur_dh: "{d} z {h} h",
    dur_hm: "{h} h {m} min",
    dur_m: "{m} min",
    load: "Încărcare",
    load_24h: "Încărcare · ultimele 24 h",
    temp_cpu: "{t} CPU",
    temp_gpu: "{t} GPU",
    cpu: "CPU",
    gpu: "GPU",
    ram: "RAM",
    disks: "Discuri",
    free: "{v} libere",
    lock: "Blochează",
    sleep: "Repaus",
    shutdown: "Oprește",
    restart: "Repornește",
    wake: "Trezește",
    confirm_shutdown: "Oprești {name}? Munca nesalvată se poate pierde.",
    confirm_restart: "Repornești {name}? Munca nesalvată se poate pierde.",
    confirm_sleep: "Pui {name} în repaus?",
    cancel: "Anulează",
    no_pc: "Nu s-a găsit niciun calculator",
    chip_cpu: "CPU {v}",
    chip_ram: "RAM {v}",
    ed_entity: "Calculator",
    ed_entity_helper: "Orice entitate a dispozitivului calculatorului (System Bridge, HASS.Agent, LNXlink, Mobile App); celelalte entități ale sale sunt găsite odată cu ea",
    ed_mac: "Adresă MAC",
    ed_mac_helper: "Pentru a trezi calculatorul prin Wake on LAN când nu are buton de trezire",
    ed_broadcast_address: "Adresă de difuzare",
    ed_broadcast_address_helper: "Opțională, pentru Wake on LAN",
    ed_show_history: "Ultimele 24 de ore",
    ed_show_disks: "Discuri",
    ed_show_controls: "Comenzi",
    ed_confirm: "Confirmă înainte de oprire, repornire sau repaus",
    ed_show_subtitle: "Afișează subtitlul",
    ed_illustration: "Antet ilustrat",
    ed_illustration_theme: "Tema antetului",
    ed_theme_auto: "Automat (urmează tema)",
    ed_theme_day: "Zi",
    ed_theme_night: "Noapte",
    ed_animations: "Animații",
    ed_entities: "Entități (YAML)",
    ed_entities_helper: "Înlocuiește entitățile găsite, după rol: cpu, cpu_temp, cpu_speed, gpu, gpu_temp, gpu_speed, ram, ram_used, user, uptime, online, state, lock, sleep, shutdown, restart, wake; disks: o listă de senzori de ocupare",
    ed_title_helper: "Gol: numele calculatorului",
  },
  da: {
    title: "Computer",
    st_on: "Tændt",
    st_sleep: "I dvale",
    st_off: "Slukket",
    st_locked: "Låst",
    st_offline: "Utilgængelig",
    signed_in: "logget ind",
    locked: "låst",
    up: "tændt i {t}",
    off_since: "slukket i {t}",
    asleep_since: "i dvale i {t}",
    dur_dh: "{d} d {h} t",
    dur_hm: "{h} t {m} min",
    dur_m: "{m} min",
    load: "Belastning",
    load_24h: "Belastning · sidste 24 t",
    temp_cpu: "{t} CPU",
    temp_gpu: "{t} GPU",
    cpu: "CPU",
    gpu: "GPU",
    ram: "RAM",
    disks: "Diske",
    free: "{v} ledig",
    lock: "Lås",
    sleep: "Dvale",
    shutdown: "Luk ned",
    restart: "Genstart",
    wake: "Væk",
    confirm_shutdown: "Luk {name} ned? Ikke-gemt arbejde kan gå tabt.",
    confirm_restart: "Genstart {name}? Ikke-gemt arbejde kan gå tabt.",
    confirm_sleep: "Sæt {name} i dvale?",
    cancel: "Annuller",
    no_pc: "Ingen computer fundet",
    chip_cpu: "CPU {v}",
    chip_ram: "RAM {v}",
    ed_entity: "Computer",
    ed_entity_helper: "En vilkårlig enhed på computerens apparat (System Bridge, HASS.Agent, LNXlink, Mobile App); dens andre enheder findes sammen med den",
    ed_mac: "MAC-adresse",
    ed_mac_helper: "For at vække computeren med Wake on LAN, når den ikke har en vækkeknap",
    ed_broadcast_address: "Broadcast-adresse",
    ed_broadcast_address_helper: "Valgfri, til Wake on LAN",
    ed_show_history: "Sidste 24 timer",
    ed_show_disks: "Diske",
    ed_show_controls: "Betjening",
    ed_confirm: "Bekræft før nedlukning, genstart eller dvale",
    ed_show_subtitle: "Vis undertitel",
    ed_illustration: "Illustreret overskrift",
    ed_illustration_theme: "Overskriftens tema",
    ed_theme_auto: "Automatisk (følger temaet)",
    ed_theme_day: "Dag",
    ed_theme_night: "Nat",
    ed_animations: "Animationer",
    ed_entities: "Enheder (YAML)",
    ed_entities_helper: "Erstatter de fundne enheder, efter rolle: cpu, cpu_temp, cpu_speed, gpu, gpu_temp, gpu_speed, ram, ram_used, user, uptime, online, state, lock, sleep, shutdown, restart, wake; disks: en liste af belægningssensorer",
    ed_title_helper: "Tom: computerens navn",
  },
  sv: {
    title: "Dator",
    st_on: "På",
    st_sleep: "I viloläge",
    st_off: "Av",
    st_locked: "Låst",
    st_offline: "Otillgänglig",
    signed_in: "inloggad",
    locked: "låst",
    up: "på i {t}",
    off_since: "av i {t}",
    asleep_since: "i viloläge i {t}",
    dur_dh: "{d} d {h} h",
    dur_hm: "{h} h {m} min",
    dur_m: "{m} min",
    load: "Belastning",
    load_24h: "Belastning · senaste 24 h",
    temp_cpu: "{t} CPU",
    temp_gpu: "{t} GPU",
    cpu: "CPU",
    gpu: "GPU",
    ram: "RAM",
    disks: "Diskar",
    free: "{v} ledigt",
    lock: "Lås",
    sleep: "Viloläge",
    shutdown: "Stäng av",
    restart: "Starta om",
    wake: "Väck",
    confirm_shutdown: "Stänga av {name}? Osparat arbete kan gå förlorat.",
    confirm_restart: "Starta om {name}? Osparat arbete kan gå förlorat.",
    confirm_sleep: "Försätta {name} i viloläge?",
    cancel: "Avbryt",
    no_pc: "Ingen dator hittades",
    chip_cpu: "CPU {v}",
    chip_ram: "RAM {v}",
    ed_entity: "Dator",
    ed_entity_helper: "Valfri entitet på datorns enhet (System Bridge, HASS.Agent, LNXlink, Mobile App); dess andra entiteter hittas tillsammans med den",
    ed_mac: "MAC-adress",
    ed_mac_helper: "För att väcka datorn med Wake on LAN när den saknar väckningsknapp",
    ed_broadcast_address: "Broadcast-adress",
    ed_broadcast_address_helper: "Valfri, för Wake on LAN",
    ed_show_history: "Senaste 24 timmarna",
    ed_show_disks: "Diskar",
    ed_show_controls: "Kontroller",
    ed_confirm: "Bekräfta innan avstängning, omstart eller viloläge",
    ed_show_subtitle: "Visa underrubrik",
    ed_illustration: "Illustrerad rubrik",
    ed_illustration_theme: "Rubrikens tema",
    ed_theme_auto: "Automatiskt (följer temat)",
    ed_theme_day: "Dag",
    ed_theme_night: "Natt",
    ed_animations: "Animationer",
    ed_entities: "Entiteter (YAML)",
    ed_entities_helper: "Ersätter de hittade entiteterna, per roll: cpu, cpu_temp, cpu_speed, gpu, gpu_temp, gpu_speed, ram, ram_used, user, uptime, online, state, lock, sleep, shutdown, restart, wake; disks: en lista med beläggningssensorer",
    ed_title_helper: "Tom: datorns namn",
  },
  bg: {
    title: "Компютър",
    st_on: "Включен",
    st_sleep: "В режим на заспиване",
    st_off: "Изключен",
    st_locked: "Заключен",
    st_offline: "Недостъпно",
    signed_in: "влязъл",
    locked: "заключен",
    up: "включен от {t}",
    off_since: "изключен от {t}",
    asleep_since: "заспал от {t}",
    dur_dh: "{d} д {h} ч",
    dur_hm: "{h} ч {m} мин",
    dur_m: "{m} мин",
    load: "Натоварване",
    load_24h: "Натоварване · последните 24 ч",
    temp_cpu: "{t} CPU",
    temp_gpu: "{t} GPU",
    cpu: "CPU",
    gpu: "GPU",
    ram: "RAM",
    disks: "Дискове",
    free: "{v} свободни",
    lock: "Заключи",
    sleep: "Приспи",
    shutdown: "Изключи",
    restart: "Рестартирай",
    wake: "Събуди",
    confirm_shutdown: "Да се изключи ли {name}? Незапазената работа може да се загуби.",
    confirm_restart: "Да се рестартира ли {name}? Незапазената работа може да се загуби.",
    confirm_sleep: "Да се приспи ли {name}?",
    cancel: "Отказ",
    no_pc: "Не е намерен компютър",
    chip_cpu: "CPU {v}",
    chip_ram: "RAM {v}",
    ed_entity: "Компютър",
    ed_entity_helper: "Произволен обект на устройството на компютъра (System Bridge, HASS.Agent, LNXlink, Mobile App); другите му обекти се намират заедно с него",
    ed_mac: "MAC адрес",
    ed_mac_helper: "За събуждане на компютъра с Wake on LAN, когато няма бутон за събуждане",
    ed_broadcast_address: "Broadcast адрес",
    ed_broadcast_address_helper: "По избор, за Wake on LAN",
    ed_show_history: "Последните 24 часа",
    ed_show_disks: "Дискове",
    ed_show_controls: "Управление",
    ed_confirm: "Потвърждаване преди изключване, рестартиране или приспиване",
    ed_show_subtitle: "Показване на подзаглавие",
    ed_illustration: "Илюстрирано заглавие",
    ed_illustration_theme: "Тема на заглавието",
    ed_theme_auto: "Автоматично (следва темата)",
    ed_theme_day: "Ден",
    ed_theme_night: "Нощ",
    ed_animations: "Анимации",
    ed_entities: "Обекти (YAML)",
    ed_entities_helper: "Замества намерените обекти, по роля: cpu, cpu_temp, cpu_speed, gpu, gpu_temp, gpu_speed, ram, ram_used, user, uptime, online, state, lock, sleep, shutdown, restart, wake; disks: списък от сензори за заетост",
    ed_title_helper: "Празно: името на компютъра",
  },
  ru: {
    title: "Компьютер",
    st_on: "Включён",
    st_sleep: "В спящем режиме",
    st_off: "Выключен",
    st_locked: "Заблокирован",
    st_offline: "Недоступно",
    signed_in: "вход выполнен",
    locked: "заблокирован",
    up: "включён {t}",
    off_since: "выключен {t}",
    asleep_since: "спит {t}",
    dur_dh: "{d} д {h} ч",
    dur_hm: "{h} ч {m} мин",
    dur_m: "{m} мин",
    load: "Нагрузка",
    load_24h: "Нагрузка · последние 24 ч",
    temp_cpu: "{t} CPU",
    temp_gpu: "{t} GPU",
    cpu: "CPU",
    gpu: "GPU",
    ram: "RAM",
    disks: "Диски",
    free: "свободно {v}",
    lock: "Заблокировать",
    sleep: "Спящий режим",
    shutdown: "Выключить",
    restart: "Перезагрузить",
    wake: "Разбудить",
    confirm_shutdown: "Выключить {name}? Несохранённая работа может быть потеряна.",
    confirm_restart: "Перезагрузить {name}? Несохранённая работа может быть потеряна.",
    confirm_sleep: "Перевести {name} в спящий режим?",
    cancel: "Отмена",
    no_pc: "Компьютер не найден",
    chip_cpu: "CPU {v}",
    chip_ram: "RAM {v}",
    ed_entity: "Компьютер",
    ed_entity_helper: "Любой объект устройства компьютера (System Bridge, HASS.Agent, LNXlink, Mobile App); остальные его объекты находятся вместе с ним",
    ed_mac: "MAC-адрес",
    ed_mac_helper: "Чтобы разбудить компьютер через Wake on LAN, если у него нет кнопки пробуждения",
    ed_broadcast_address: "Широковещательный адрес",
    ed_broadcast_address_helper: "Необязательно, для Wake on LAN",
    ed_show_history: "Последние 24 часа",
    ed_show_disks: "Диски",
    ed_show_controls: "Управление",
    ed_confirm: "Подтверждать выключение, перезагрузку и спящий режим",
    ed_show_subtitle: "Показывать подзаголовок",
    ed_illustration: "Иллюстрированный заголовок",
    ed_illustration_theme: "Тема заголовка",
    ed_theme_auto: "Автоматически (по теме)",
    ed_theme_day: "День",
    ed_theme_night: "Ночь",
    ed_animations: "Анимации",
    ed_entities: "Объекты (YAML)",
    ed_entities_helper: "Заменяет найденные объекты, по роли: cpu, cpu_temp, cpu_speed, gpu, gpu_temp, gpu_speed, ram, ram_used, user, uptime, online, state, lock, sleep, shutdown, restart, wake; disks: список датчиков занятости",
    ed_title_helper: "Пусто: имя компьютера",
  },
  uk: {
    title: "Комп'ютер",
    st_on: "Увімкнено",
    st_sleep: "У режимі сну",
    st_off: "Вимкнено",
    st_locked: "Заблоковано",
    st_offline: "Недоступно",
    signed_in: "вхід виконано",
    locked: "заблоковано",
    up: "увімкнено {t}",
    off_since: "вимкнено {t}",
    asleep_since: "спить {t}",
    dur_dh: "{d} д {h} год",
    dur_hm: "{h} год {m} хв",
    dur_m: "{m} хв",
    load: "Навантаження",
    load_24h: "Навантаження · останні 24 год",
    temp_cpu: "{t} CPU",
    temp_gpu: "{t} GPU",
    cpu: "CPU",
    gpu: "GPU",
    ram: "RAM",
    disks: "Диски",
    free: "вільно {v}",
    lock: "Заблокувати",
    sleep: "Сон",
    shutdown: "Вимкнути",
    restart: "Перезапустити",
    wake: "Розбудити",
    confirm_shutdown: "Вимкнути {name}? Незбережену роботу може бути втрачено.",
    confirm_restart: "Перезапустити {name}? Незбережену роботу може бути втрачено.",
    confirm_sleep: "Перевести {name} у режим сну?",
    cancel: "Скасувати",
    no_pc: "Комп'ютер не знайдено",
    chip_cpu: "CPU {v}",
    chip_ram: "RAM {v}",
    ed_entity: "Комп'ютер",
    ed_entity_helper: "Будь-який об'єкт пристрою комп'ютера (System Bridge, HASS.Agent, LNXlink, Mobile App); інші його об'єкти знаходяться разом з ним",
    ed_mac: "MAC-адреса",
    ed_mac_helper: "Щоб розбудити комп'ютер через Wake on LAN, якщо він не має кнопки пробудження",
    ed_broadcast_address: "Широкомовна адреса",
    ed_broadcast_address_helper: "Необов'язково, для Wake on LAN",
    ed_show_history: "Останні 24 години",
    ed_show_disks: "Диски",
    ed_show_controls: "Керування",
    ed_confirm: "Підтверджувати вимкнення, перезапуск і сон",
    ed_show_subtitle: "Показувати підзаголовок",
    ed_illustration: "Ілюстрований заголовок",
    ed_illustration_theme: "Тема заголовка",
    ed_theme_auto: "Автоматично (за темою)",
    ed_theme_day: "День",
    ed_theme_night: "Ніч",
    ed_animations: "Анімації",
    ed_entities: "Об'єкти (YAML)",
    ed_entities_helper: "Замінює знайдені об'єкти, за роллю: cpu, cpu_temp, cpu_speed, gpu, gpu_temp, gpu_speed, ram, ram_used, user, uptime, online, state, lock, sleep, shutdown, restart, wake; disks: список датчиків зайнятості",
    ed_title_helper: "Порожньо: назва комп'ютера",
  },
  hu: {
    title: "Számítógép",
    st_on: "Bekapcsolva",
    st_sleep: "Alvó módban",
    st_off: "Kikapcsolva",
    st_locked: "Zárolva",
    st_offline: "Nem elérhető",
    signed_in: "bejelentkezve",
    locked: "zárolva",
    up: "bekapcsolva {t} óta",
    off_since: "kikapcsolva {t} óta",
    asleep_since: "alvó módban {t} óta",
    dur_dh: "{d} n {h} ó",
    dur_hm: "{h} ó {m} p",
    dur_m: "{m} p",
    load: "Terhelés",
    load_24h: "Terhelés · utolsó 24 óra",
    temp_cpu: "{t} CPU",
    temp_gpu: "{t} GPU",
    cpu: "CPU",
    gpu: "GPU",
    ram: "RAM",
    disks: "Lemezek",
    free: "{v} szabad",
    lock: "Zárolás",
    sleep: "Alvó mód",
    shutdown: "Leállítás",
    restart: "Újraindítás",
    wake: "Felébresztés",
    confirm_shutdown: "Leállítod: {name}? A nem mentett munka elveszhet.",
    confirm_restart: "Újraindítod: {name}? A nem mentett munka elveszhet.",
    confirm_sleep: "Alvó módba teszed: {name}?",
    cancel: "Mégse",
    no_pc: "Nem található számítógép",
    chip_cpu: "CPU {v}",
    chip_ram: "RAM {v}",
    ed_entity: "Számítógép",
    ed_entity_helper: "A számítógép eszközének bármely entitása (System Bridge, HASS.Agent, LNXlink, Mobile App); a többi entitása vele együtt megtalálható",
    ed_mac: "MAC-cím",
    ed_mac_helper: "A számítógép Wake on LAN-nal történő felébresztéséhez, ha nincs ébresztőgombja",
    ed_broadcast_address: "Szórási cím",
    ed_broadcast_address_helper: "Nem kötelező, a Wake on LAN-hoz",
    ed_show_history: "Utolsó 24 óra",
    ed_show_disks: "Lemezek",
    ed_show_controls: "Vezérlők",
    ed_confirm: "Megerősítés leállítás, újraindítás vagy alvó mód előtt",
    ed_show_subtitle: "Alcím megjelenítése",
    ed_illustration: "Illusztrált fejléc",
    ed_illustration_theme: "Fejléc témája",
    ed_theme_auto: "Automatikus (követi a témát)",
    ed_theme_day: "Nappal",
    ed_theme_night: "Éjszaka",
    ed_animations: "Animációk",
    ed_entities: "Entitások (YAML)",
    ed_entities_helper: "Felülírja a talált entitásokat, szerepkör szerint: cpu, cpu_temp, cpu_speed, gpu, gpu_temp, gpu_speed, ram, ram_used, user, uptime, online, state, lock, sleep, shutdown, restart, wake; disks: foglaltsági érzékelők listája",
    ed_title_helper: "Üres: a számítógép neve",
  },
  sk: {
    title: "Počítač",
    st_on: "Zapnutý",
    st_sleep: "V režime spánku",
    st_off: "Vypnutý",
    st_locked: "Zamknutý",
    st_offline: "Nedostupné",
    signed_in: "prihlásený",
    locked: "zamknutý",
    up: "zapnutý {t}",
    off_since: "vypnutý {t}",
    asleep_since: "v spánku {t}",
    dur_dh: "{d} d {h} h",
    dur_hm: "{h} h {m} min",
    dur_m: "{m} min",
    load: "Záťaž",
    load_24h: "Záťaž · posledných 24 h",
    temp_cpu: "{t} CPU",
    temp_gpu: "{t} GPU",
    cpu: "CPU",
    gpu: "GPU",
    ram: "RAM",
    disks: "Disky",
    free: "{v} voľných",
    lock: "Zamknúť",
    sleep: "Uspať",
    shutdown: "Vypnúť",
    restart: "Reštartovať",
    wake: "Zobudiť",
    confirm_shutdown: "Vypnúť {name}? Neuložená práca sa môže stratiť.",
    confirm_restart: "Reštartovať {name}? Neuložená práca sa môže stratiť.",
    confirm_sleep: "Uspať {name}?",
    cancel: "Zrušiť",
    no_pc: "Nenašiel sa žiadny počítač",
    chip_cpu: "CPU {v}",
    chip_ram: "RAM {v}",
    ed_entity: "Počítač",
    ed_entity_helper: "Ľubovoľná entita zariadenia počítača (System Bridge, HASS.Agent, LNXlink, Mobile App); jeho ďalšie entity sa nájdu spolu s ňou",
    ed_mac: "MAC adresa",
    ed_mac_helper: "Na prebudenie počítača cez Wake on LAN, keď nemá tlačidlo prebudenia",
    ed_broadcast_address: "Broadcast adresa",
    ed_broadcast_address_helper: "Voliteľné, pre Wake on LAN",
    ed_show_history: "Posledných 24 hodín",
    ed_show_disks: "Disky",
    ed_show_controls: "Ovládanie",
    ed_confirm: "Potvrdiť pred vypnutím, reštartom alebo uspaním",
    ed_show_subtitle: "Zobraziť podnadpis",
    ed_illustration: "Ilustrovaná hlavička",
    ed_illustration_theme: "Téma hlavičky",
    ed_theme_auto: "Automaticky (podľa témy)",
    ed_theme_day: "Deň",
    ed_theme_night: "Noc",
    ed_animations: "Animácie",
    ed_entities: "Entity (YAML)",
    ed_entities_helper: "Nahrádza nájdené entity, podľa roly: cpu, cpu_temp, cpu_speed, gpu, gpu_temp, gpu_speed, ram, ram_used, user, uptime, online, state, lock, sleep, shutdown, restart, wake; disks: zoznam senzorov obsadenosti",
    ed_title_helper: "Prázdne: názov počítača",
  },
  cs: {
    title: "Počítač",
    st_on: "Zapnuto",
    st_sleep: "V režimu spánku",
    st_off: "Vypnuto",
    st_locked: "Zamčeno",
    st_offline: "Nedostupné",
    signed_in: "přihlášen",
    locked: "zamčeno",
    up: "zapnuto {t}",
    off_since: "vypnuto {t}",
    asleep_since: "ve spánku {t}",
    dur_dh: "{d} d {h} h",
    dur_hm: "{h} h {m} min",
    dur_m: "{m} min",
    load: "Zátěž",
    load_24h: "Zátěž · posledních 24 h",
    temp_cpu: "{t} CPU",
    temp_gpu: "{t} GPU",
    cpu: "CPU",
    gpu: "GPU",
    ram: "RAM",
    disks: "Disky",
    free: "{v} volno",
    lock: "Zamknout",
    sleep: "Uspat",
    shutdown: "Vypnout",
    restart: "Restartovat",
    wake: "Probudit",
    confirm_shutdown: "Vypnout {name}? Neuložená práce může být ztracena.",
    confirm_restart: "Restartovat {name}? Neuložená práce může být ztracena.",
    confirm_sleep: "Uspat {name}?",
    cancel: "Zrušit",
    no_pc: "Nebyl nalezen žádný počítač",
    chip_cpu: "CPU {v}",
    chip_ram: "RAM {v}",
    ed_entity: "Počítač",
    ed_entity_helper: "Libovolná entita zařízení počítače (System Bridge, HASS.Agent, LNXlink, Mobile App); jeho další entity se najdou spolu s ní",
    ed_mac: "MAC adresa",
    ed_mac_helper: "Pro probuzení počítače přes Wake on LAN, když nemá tlačítko probuzení",
    ed_broadcast_address: "Broadcast adresa",
    ed_broadcast_address_helper: "Volitelné, pro Wake on LAN",
    ed_show_history: "Posledních 24 hodin",
    ed_show_disks: "Disky",
    ed_show_controls: "Ovládání",
    ed_confirm: "Potvrdit před vypnutím, restartem nebo uspáním",
    ed_show_subtitle: "Zobrazit podtitul",
    ed_illustration: "Ilustrovaná hlavička",
    ed_illustration_theme: "Motiv hlavičky",
    ed_theme_auto: "Automaticky (podle motivu)",
    ed_theme_day: "Den",
    ed_theme_night: "Noc",
    ed_animations: "Animace",
    ed_entities: "Entity (YAML)",
    ed_entities_helper: "Nahrazuje nalezené entity, podle role: cpu, cpu_temp, cpu_speed, gpu, gpu_temp, gpu_speed, ram, ram_used, user, uptime, online, state, lock, sleep, shutdown, restart, wake; disks: seznam senzorů obsazenosti",
    ed_title_helper: "Prázdné: název počítače",
  },
  sl: {
    title: "Računalnik",
    st_on: "Vklopljen",
    st_sleep: "V stanju spanja",
    st_off: "Izklopljen",
    st_locked: "Zaklenjen",
    st_offline: "Ni na voljo",
    signed_in: "prijavljen",
    locked: "zaklenjen",
    up: "vklopljen {t}",
    off_since: "izklopljen {t}",
    asleep_since: "v spanju {t}",
    dur_dh: "{d} d {h} h",
    dur_hm: "{h} h {m} min",
    dur_m: "{m} min",
    load: "Obremenitev",
    load_24h: "Obremenitev · zadnjih 24 h",
    temp_cpu: "{t} CPU",
    temp_gpu: "{t} GPU",
    cpu: "CPU",
    gpu: "GPU",
    ram: "RAM",
    disks: "Diski",
    free: "{v} prosto",
    lock: "Zakleni",
    sleep: "Zaspi",
    shutdown: "Izklopi",
    restart: "Znova zaženi",
    wake: "Zbudi",
    confirm_shutdown: "Izklopim {name}? Neshranjeno delo se lahko izgubi.",
    confirm_restart: "Znova zaženem {name}? Neshranjeno delo se lahko izgubi.",
    confirm_sleep: "Preklopim {name} v spanje?",
    cancel: "Prekliči",
    no_pc: "Računalnik ni bil najden",
    chip_cpu: "CPU {v}",
    chip_ram: "RAM {v}",
    ed_entity: "Računalnik",
    ed_entity_helper: "Katerakoli entiteta naprave računalnika (System Bridge, HASS.Agent, LNXlink, Mobile App); njene druge entitete so najdene skupaj z njo",
    ed_mac: "Naslov MAC",
    ed_mac_helper: "Za zbujanje računalnika z Wake on LAN, ko nima gumba za zbujanje",
    ed_broadcast_address: "Naslov za oddajanje",
    ed_broadcast_address_helper: "Neobvezno, za Wake on LAN",
    ed_show_history: "Zadnjih 24 ur",
    ed_show_disks: "Diski",
    ed_show_controls: "Upravljanje",
    ed_confirm: "Potrdi pred izklopom, ponovnim zagonom ali spanjem",
    ed_show_subtitle: "Prikaži podnaslov",
    ed_illustration: "Ilustrirana glava",
    ed_illustration_theme: "Tema glave",
    ed_theme_auto: "Samodejno (sledi temi)",
    ed_theme_day: "Dan",
    ed_theme_night: "Noč",
    ed_animations: "Animacije",
    ed_entities: "Entitete (YAML)",
    ed_entities_helper: "Nadomesti najdene entitete, po vlogi: cpu, cpu_temp, cpu_speed, gpu, gpu_temp, gpu_speed, ram, ram_used, user, uptime, online, state, lock, sleep, shutdown, restart, wake; disks: seznam senzorjev zasedenosti",
    ed_title_helper: "Prazno: ime računalnika",
  },
  lv: {
    title: "Dators",
    st_on: "Ieslēgts",
    st_sleep: "Miega režīmā",
    st_off: "Izslēgts",
    st_locked: "Bloķēts",
    st_offline: "Nav pieejams",
    signed_in: "pieteicies",
    locked: "bloķēts",
    up: "ieslēgts {t}",
    off_since: "izslēgts {t}",
    asleep_since: "miega režīmā {t}",
    dur_dh: "{d} d {h} h",
    dur_hm: "{h} h {m} min",
    dur_m: "{m} min",
    load: "Noslodze",
    load_24h: "Noslodze · pēdējās 24 h",
    temp_cpu: "{t} CPU",
    temp_gpu: "{t} GPU",
    cpu: "CPU",
    gpu: "GPU",
    ram: "RAM",
    disks: "Diski",
    free: "{v} brīvs",
    lock: "Bloķēt",
    sleep: "Miegs",
    shutdown: "Izslēgt",
    restart: "Restartēt",
    wake: "Pamodināt",
    confirm_shutdown: "Izslēgt {name}? Nesaglabātais darbs var tikt zaudēts.",
    confirm_restart: "Restartēt {name}? Nesaglabātais darbs var tikt zaudēts.",
    confirm_sleep: "Iemidzināt {name}?",
    cancel: "Atcelt",
    no_pc: "Dators nav atrasts",
    chip_cpu: "CPU {v}",
    chip_ram: "RAM {v}",
    ed_entity: "Dators",
    ed_entity_helper: "Jebkura datora ierīces entītija (System Bridge, HASS.Agent, LNXlink, Mobile App); tās pārējās entītijas tiek atrastas kopā ar to",
    ed_mac: "MAC adrese",
    ed_mac_helper: "Lai pamodinātu datoru ar Wake on LAN, ja tam nav pamodināšanas pogas",
    ed_broadcast_address: "Apraides adrese",
    ed_broadcast_address_helper: "Neobligāti, Wake on LAN",
    ed_show_history: "Pēdējās 24 stundas",
    ed_show_disks: "Diski",
    ed_show_controls: "Vadība",
    ed_confirm: "Apstiprināt pirms izslēgšanas, restartēšanas vai iemidzināšanas",
    ed_show_subtitle: "Rādīt apakšvirsrakstu",
    ed_illustration: "Ilustrēta galvene",
    ed_illustration_theme: "Galvenes motīvs",
    ed_theme_auto: "Automātiski (pēc motīva)",
    ed_theme_day: "Diena",
    ed_theme_night: "Nakts",
    ed_animations: "Animācijas",
    ed_entities: "Entītijas (YAML)",
    ed_entities_helper: "Aizstāj atrastās entītijas, pēc lomas: cpu, cpu_temp, cpu_speed, gpu, gpu_temp, gpu_speed, ram, ram_used, user, uptime, online, state, lock, sleep, shutdown, restart, wake; disks: aizņemtības sensoru saraksts",
    ed_title_helper: "Tukšs: datora nosaukums",
  },
  el: {
    title: "Υπολογιστής",
    st_on: "Ενεργός",
    st_sleep: "Σε αναστολή",
    st_off: "Απενεργοποιημένος",
    st_locked: "Κλειδωμένος",
    st_offline: "Μη διαθέσιμο",
    signed_in: "συνδεδεμένος",
    locked: "κλειδωμένος",
    up: "ενεργός εδώ και {t}",
    off_since: "απενεργοποιημένος εδώ και {t}",
    asleep_since: "σε αναστολή εδώ και {t}",
    dur_dh: "{d} η {h} ώ",
    dur_hm: "{h} ώ {m} λ",
    dur_m: "{m} λ",
    load: "Φόρτος",
    load_24h: "Φόρτος · τελευταίες 24 ώ",
    temp_cpu: "{t} CPU",
    temp_gpu: "{t} GPU",
    cpu: "CPU",
    gpu: "GPU",
    ram: "RAM",
    disks: "Δίσκοι",
    free: "{v} ελεύθερα",
    lock: "Κλείδωμα",
    sleep: "Αναστολή",
    shutdown: "Τερματισμός",
    restart: "Επανεκκίνηση",
    wake: "Αφύπνιση",
    confirm_shutdown: "Τερματισμός του {name}; Η μη αποθηκευμένη εργασία μπορεί να χαθεί.",
    confirm_restart: "Επανεκκίνηση του {name}; Η μη αποθηκευμένη εργασία μπορεί να χαθεί.",
    confirm_sleep: "Αναστολή του {name};",
    cancel: "Ακύρωση",
    no_pc: "Δεν βρέθηκε υπολογιστής",
    chip_cpu: "CPU {v}",
    chip_ram: "RAM {v}",
    ed_entity: "Υπολογιστής",
    ed_entity_helper: "Οποιαδήποτε οντότητα της συσκευής του υπολογιστή (System Bridge, HASS.Agent, LNXlink, Mobile App); οι άλλες οντότητές του βρίσκονται μαζί της",
    ed_mac: "Διεύθυνση MAC",
    ed_mac_helper: "Για αφύπνιση του υπολογιστή με Wake on LAN όταν δεν έχει κουμπί αφύπνισης",
    ed_broadcast_address: "Διεύθυνση εκπομπής",
    ed_broadcast_address_helper: "Προαιρετική, για Wake on LAN",
    ed_show_history: "Τελευταίες 24 ώρες",
    ed_show_disks: "Δίσκοι",
    ed_show_controls: "Χειριστήρια",
    ed_confirm: "Επιβεβαίωση πριν από τερματισμό, επανεκκίνηση ή αναστολή",
    ed_show_subtitle: "Εμφάνιση υπότιτλου",
    ed_illustration: "Εικονογραφημένη κεφαλίδα",
    ed_illustration_theme: "Θέμα κεφαλίδας",
    ed_theme_auto: "Αυτόματο (ακολουθεί το θέμα)",
    ed_theme_day: "Ημέρα",
    ed_theme_night: "Νύχτα",
    ed_animations: "Κινούμενα σχέδια",
    ed_entities: "Οντότητες (YAML)",
    ed_entities_helper: "Αντικαθιστά τις οντότητες που βρέθηκαν, ανά ρόλο: cpu, cpu_temp, cpu_speed, gpu, gpu_temp, gpu_speed, ram, ram_used, user, uptime, online, state, lock, sleep, shutdown, restart, wake; disks: λίστα αισθητήρων πληρότητας",
    ed_title_helper: "Κενό: το όνομα του υπολογιστή",
  },
};

// ── Helpers ──────────────────────────────────────────────────────────────────
const rcLang = (i18n, hass, config) => {
  // The full tag when the card has it (sr-Latn), else its base language (fr-FR → fr, pt-BR → pt), else English.
  const l = config?.language || hass?.locale?.language || hass?.language || "en";
  const base = l.split("-")[0];
  return i18n[l] ? l : i18n[base] ? base : "en";
};

const rcT = (i18n, lang, key, vars = {}) => {
  const s = i18n[lang]?.[key] ?? RC_I18N[lang]?.[key] ?? i18n.en[key] ?? RC_I18N.en[key] ?? key;
  return s.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? "");
};

const rcEsc = (s) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c],
  );

const rcMoreInfo = (node, entityId) => {
  const ev = new Event("hass-more-info", { bubbles: true, composed: true });
  ev.detail = { entityId };
  node.dispatchEvent(ev);
};

const rcNavigate = (path) => {
  history.pushState(null, "", path);
  window.dispatchEvent(new CustomEvent("location-changed", { detail: { replace: false } }));
};

// Wires a card header to its `navigation_path`: click, and Enter on the header itself.
const rcBindNav = (head, path) => {
  head.addEventListener("click", () => rcNavigate(path));
  head.addEventListener("keydown", (ev) => {
    if (ev.key === "Enter" && ev.target === head) rcNavigate(path);
  });
};

// HA's callService already shows a toast when the call fails, then rejects: the rejection is only swallowed here
// so that it does not end up as "Uncaught (in promise)".
const rcCall = (hass, domain, service, data) => Promise.resolve(hass.callService(domain, service, data)).catch(() => {});

// A click inside a dialog (more-info opened from the card, say) is not a click outside the card.
const rcInDialog = (ev) => ev.composedPath().some((n) => ["ha-more-info-dialog", "ha-dialog", "dialog"].includes(n.localName));

// `fn()`, computed again only when one of `deps` is no longer the same object (or value) as last time.
const rcMemo = (store, key, deps, fn) => {
  const hit = store[key];
  if (hit && hit.deps.length === deps.length && hit.deps.every((d, i) => d === deps[i])) return hit.value;
  const value = fn();
  store[key] = { deps, value };
  return value;
};

// ── Base card ────────────────────────────────────────────────────────────────
class RcCard extends HTMLElement {
  static getStubConfig(hass) {
    const areas = Object.keys(hass?.areas ?? {});
    return { area: areas[0] ?? "" };
  }

  // Subclasses set: static i18n, static defaults, static tag, static styles.
  static getConfigElement() {
    // biome-ignore lint/complexity/noThisInStatic: each subclass opens its own editor.
    return document.createElement(`${this.tag}-editor`);
  }

  setConfig(config) {
    if (this.constructor.needsArea && !config.area && !config.entities?.length && !config.include?.length) {
      throw new Error(rcT(this.constructor.i18n, rcLang(this.constructor.i18n, this._hass, config), "err_config"));
    }
    this._config = { ...this.constructor.defaults, ...config };
    // show_title: the header's title, hidden by the stylesheet
    this.toggleAttribute?.("hide-title", config.show_title === false);
    if (!this.shadowRoot) this._attach();
    this._sig = null;
    this._render();
  }

  // The shadow root, and no rewrite of the card between a press anywhere in it and the end of the click: Home
  // Assistant updates the card several times a second, and a rewrite under the pointer replaces the element pressed,
  // so that the click lands on the card itself and does nothing (the tiles already hold it, see _bindPress; this
  // covers the rest: header button, detail button, rows, popup). The pending update is rendered once released.
  _attach() {
    const root = this.attachShadow({ mode: "open" });
    this._onPressEnd = () => {
      window.removeEventListener("pointerup", this._onPressEnd, true);
      window.removeEventListener("pointercancel", this._onPressEnd, true);
      // After the click, which comes in the same task as the release.
      setTimeout(() => {
        if (this._pressing) this._released();
      }, 0);
    };
    root.addEventListener("pointerdown", (ev) => {
      this._byPointer = true;
      if (ev.button !== 0) return;
      this._pressing = true;
      window.addEventListener("pointerup", this._onPressEnd, true);
      window.addEventListener("pointercancel", this._onPressEnd, true);
    });
    // The focus is kept across rewrites for the keyboard only (no focus ring after a mouse click or a tap).
    root.addEventListener("keydown", () => {
      this._byPointer = false;
    });
  }

  disconnectedCallback() {
    super.disconnectedCallback?.();
    window.removeEventListener("pointerup", this._onPressEnd, true);
    window.removeEventListener("pointercancel", this._onPressEnd, true);
    // A press cut short by the detach never gets its release: rendered now, and the next updates too.
    if (this._pressing) this._released();
  }

  set hass(hass) {
    this._hass = hass;
    // No re-render during a drag or a press: it would replace the tile under the finger.
    if (this._dragging || this._pressing) this._deferred = true;
    else this._render();
  }

  // The tiles actually shown (`only_on` / `only_alerts` applied), nothing when the card is hidden.
  getCardSize() {
    if (this.style.display === "none") return 0;
    const n = this._shown ?? this._items?.length ?? 0;
    if (!n || !this._config) return 1;
    // A row of large tiles (`layout: tiles`) is about one and a half rows of compact ones.
    const rows = Math.ceil(n / this._cols());
    return 1 + (this._tiles() ? Math.ceil(rows * 1.5) : rows);
  }

  getGridOptions() {
    return { columns: 12, min_columns: 6, rows: "auto" };
  }

  _lang() {
    return rcLang(this.constructor.i18n, this._hass, this._config);
  }

  _t(key, vars) {
    return rcT(this.constructor.i18n, this._lang(), key, vars);
  }

  _areaName() {
    const c = this._config;
    return c.area ? (this._hass.areas?.[c.area]?.name ?? c.area) : "";
  }

  // Re-render only when something visible changed.
  _changed(parts) {
    const sig = JSON.stringify([this._config, this._lang(), parts]);
    if (sig === this._sig) return false;
    this._sig = sig;
    return true;
  }

  // Subclasses implement `_collect()` (the tiles) and `_draw(items)`.
  _render() {
    if (!this._config || !this._hass || !this.shadowRoot) return;
    this._items = this._collect();
    this._draw(this._items);
  }

  _cols() {
    return Math.min(4, Math.max(1, Number(this._config.columns) || 2));
  }

  // `layout: tiles`: one large tile per entity, the size of Home Assistant's Tile card (easier to tap on a phone).
  _tiles() {
    return this._config?.layout === "tiles";
  }

  _paint(level, head, tiles, extraClass = "") {
    // The tile or control with the keyboard focus keeps it through the redraw (a toggle, a step or a two-tap
    // confirmation from the keyboard): tiles by their data-id, controls by their data-k.
    const active = this._byPointer ? null : this.shadowRoot.activeElement;
    const focused = active?.dataset?.id;
    const focusKey = active?.dataset?.k;
    this.shadowRoot.innerHTML = `
      <style>${RC_BASE_STYLES}${this.constructor.styles}</style>
      <ha-card class="lvl-${level}${extraClass}${this._tiles() ? " layout-tiles" : ""}">
        ${head}
        ${tiles ? `<div class="grid" style="--cols:${this._cols()}">${tiles}</div>` : ""}
        ${this._afterGrid()}
      </ha-card>`;
    const root = this.shadowRoot;
    root.querySelector(".pill.action")?.addEventListener("click", (ev) => this._allOff(ev));
    if (this._config.navigation_path) rcBindNav(root.querySelector(".head"), this._config.navigation_path);
    for (const el of root.querySelectorAll(".tile")) {
      this._bindTile(el, (this._items || []).find((i) => i.id === el.dataset.id));
      if (focused && el.dataset.id === focused) el.focus({ preventScroll: true });
    }
    this._bindAfter(root);
    if (focusKey) root.querySelector(`[data-k="${focusKey}"]`)?.focus({ preventScroll: true });
  }

  // What a card adds under its tiles (the Lights card's scenes), and its event wiring.
  _afterGrid() {
    return "";
  }

  _bindAfter() {}

  // The "turn everything off" button of the header (full card) or of the status (mini card).
  _allOff(ev) {
    ev.stopPropagation();
    const ids = (this._items || []).filter((i) => i.on).map((i) => i.id);
    if (!ids.length) return;
    // A host card may ask first (the Overview confirms before turning plugs off); otherwise off at once.
    if (this._confirmOff) this._confirmOff(ids);
    else rcCall(this._hass, "homeassistant", "turn_off", { entity_id: ids });
  }

  // Tap, hold for more-info, and an optional horizontal drag ({ move(x), end(x), step(delta), flush() }). From the
  // keyboard: Enter / Space tap, Shift+Enter or the context-menu key open the details, ←/→ step the drag by ∓/±10
  // (a held key at most every RC_REPEAT_MS), and releasing the arrow calls `flush`.
  _bindPress(el, { onTap, onHold, drag }) {
    let start = null;
    let mode = null; // null | "hold" | "drag"
    let timer = null;
    let lastStep = 0;
    el.addEventListener("pointerdown", (ev) => {
      if (ev.button !== 0) return;
      start = { x: ev.clientX, y: ev.clientY };
      mode = null;
      this._pressing = true;
      clearTimeout(timer);
      timer = setTimeout(() => {
        // The card may have been detached mid-press (nothing else clears this timer): no hold on a dead node.
        if (mode || !this.isConnected) return;
        mode = "hold";
        // The press is settled (no tap): the details may open over the tile, so its pointerup may never come.
        this._released();
        onHold();
      }, RC_HOLD_MS);
    });
    el.addEventListener("pointermove", (ev) => {
      if (!start || mode === "hold") return;
      const dx = ev.clientX - start.x;
      const dy = ev.clientY - start.y;
      if (!mode && drag && Math.abs(dx) > RC_MOVE_PX && Math.abs(dx) > Math.abs(dy)) {
        mode = "drag";
        clearTimeout(timer);
        this._dragging = true;
        el.setPointerCapture(ev.pointerId);
        el.classList.add("dragging");
      } else if (!mode && (Math.abs(dx) > RC_MOVE_PX || Math.abs(dy) > RC_MOVE_PX)) {
        clearTimeout(timer); // scrolling, or dragging what cannot be dragged: not a tap
        start = null;
        this._released();
      }
      if (mode === "drag") drag.move(ev.clientX);
    });
    const end = (ev, cancelled) => {
      clearTimeout(timer);
      if (!start) return;
      const wasDrag = mode === "drag";
      if (wasDrag) {
        this._dragging = false;
        el.classList.remove("dragging");
        if (!cancelled) drag.end(ev.clientX);
        this._sig = null;
      } else if (!mode && !cancelled) {
        onTap();
      }
      start = null;
      mode = null;
      // After a drag, the next update redraws (the bar keeps the new level until the light reports it).
      this._released(!wasDrag);
    };
    // The mouse leaving the tile mid-press (no capture outside a drag) cancels it: neither a tap nor a hold.
    el.addEventListener("pointerleave", () => {
      if (!start || mode) return;
      clearTimeout(timer);
      start = null;
      this._released();
    });
    el.addEventListener("pointerup", (ev) => end(ev, false));
    el.addEventListener("pointercancel", (ev) => end(ev, true));
    el.addEventListener("contextmenu", (ev) => ev.preventDefault());
    el.addEventListener("keydown", (ev) => {
      if ((ev.key === "Enter" && ev.shiftKey) || ev.key === "ContextMenu") {
        ev.preventDefault();
        if (!ev.repeat) onHold();
      } else if (ev.key === "Enter" || ev.key === " ") {
        ev.preventDefault();
        if (!ev.repeat) onTap();
      } else if (drag?.step && (ev.key === "ArrowLeft" || ev.key === "ArrowRight")) {
        ev.preventDefault();
        if (ev.repeat && ev.timeStamp - lastStep < RC_REPEAT_MS) return;
        lastStep = ev.timeStamp;
        drag.step(ev.key === "ArrowRight" ? 10 : -10);
      }
    });
    // The arrow released: the stepped level goes out now rather than after the pause.
    el.addEventListener("keyup", (ev) => {
      if (ev.key === "ArrowLeft" || ev.key === "ArrowRight") drag?.flush?.();
    });
  }

  // End of a press: renders now what an update brought during it.
  _released(flush = true) {
    this._pressing = false;
    if (!this._deferred || this._dragging) return;
    this._deferred = false;
    if (flush) this._render();
  }

  // Default tile: tap toggles, hold opens the details.
  _bindTile(el, item) {
    this._bindPress(el, {
      onTap: () => !item?.unavailable && rcCall(this._hass, "homeassistant", "toggle", { entity_id: el.dataset.id }),
      onHold: () => rcMoreInfo(this, el.dataset.id),
    });
  }
}

// ── Mini cards ───────────────────────────────────────────────────────────────
// A mini card shows what its full card (`Base`) shows on two lines: the room badge, title and status, then one chip
// per entity. Its zoom button (top right, `zoom: false` removes it) switches it to the full card and back; a click
// anywhere else brings it back too.
// The subclass implements `_drawMini(items)`, which builds the chips and calls `_paintMini`.
// Zoomed in, everything is shown (`only_alerts` and `hide_when_clear` only apply to the compact view). With
// `alertsOnly`, the compact view always shows only what needs a look (no `only_alerts` option then): quiet entities
// show once zoomed in.
const rcMini = (Base, tag, styles, { alertsOnly = false } = {}) =>
  class extends Base {
    static tag = tag;
    static defaults = (({ only_alerts, ...rest }) => ({ ...rest, ...(alertsOnly ? {} : { only_alerts }), zoom: true }))(
      Base.defaults,
    );
    static styles = `${Base.styles}${RC_MINI_STYLES}${styles}`;

    constructor() {
      super();
      // A click anywhere else brings the card back to its compact view.
      this._onUnzoom = (ev) => {
        if (rcOutside(this, ev)) rcUnzoom(this);
      };
    }

    connectedCallback() {
      super.connectedCallback?.();
      this._unzoom ??= watchOutside(this, this._onUnzoom);
      this._unzoom.on();
    }

    disconnectedCallback() {
      super.disconnectedCallback?.();
      this._unzoom?.off();
      // Left (another dashboard view, a conditional card hidden): back to the compact view.
      rcUnzoom(this);
    }

    getCardSize() {
      if (this._zoomed) return super.getCardSize();
      return this.style.display === "none" ? 0 : 1;
    }

    getGridOptions() {
      return { columns: 12, min_columns: 6, rows: "auto" };
    }

    _draw(items) {
      const config = this._config;
      // The base card's own filter does the work: off zoomed in, always on in an `alertsOnly` compact view.
      if (this._zoomed) this._config = { ...config, only_alerts: false, hide_when_clear: false };
      else if (alertsOnly) this._config = { ...config, only_alerts: true };
      try {
        if (this._zoomed) super._draw(items);
        else this._drawMini(items);
      } finally {
        this._config = config;
      }
      this._addZoom();
    }

    _paintMini({ level, icon, status, chips, cls = "", allOff = false }) {
      const c = this._config;
      const nav = c.navigation_path;
      // With `allOff` the status is the "turn everything off" button, like the full card's pill.
      const st = allOff
        ? `<button class="st action" title="${rcEsc(this._t("turn_all_off"))}"><ha-icon icon="mdi:power"></ha-icon><span class="pt">${rcEsc(status)}</span></button>`
        : `<span class="st" title="${rcEsc(status)}"><span class="pt">${rcEsc(status)}</span></span>`;
      this.shadowRoot.innerHTML = `
        <style>${RC_BASE_STYLES}${this.constructor.styles}</style>
        <ha-card class="lvl-${level}${cls}">
          <div class="mini">
            <div class="badge" title="${rcEsc(status)}"><ha-icon icon="${rcEsc(icon)}"></ha-icon></div>
            <div class="body">
              <div class="head${nav ? " nav" : ""}"${nav ? ' role="link" tabindex="0"' : ""}>
                <div class="title">${rcEsc(c.title || this._areaName() || this._t("title"))}</div>
                ${st}
              </div>
              <div class="rs">${chips}</div>
            </div>
          </div>
        </ha-card>`;
      const root = this.shadowRoot;
      if (nav) rcBindNav(root.querySelector(".head"), nav);
      root.querySelector(".st.action")?.addEventListener("click", (ev) => this._allOff(ev));
      for (const el of root.querySelectorAll(".r")) el.addEventListener("click", () => rcMoreInfo(this, el.dataset.id));
    }

    // Zoom button at the end of the header, top right in both views, added once per render.
    // Its click is the overviews' (rcZoomClick): stop the tap on the title (navigation_path), toggle, keep the
    // keyboard focus (Enter / Space: no click count) on the button that replaced this one.
    _addZoom() {
      const head = this._config.zoom && this.shadowRoot.querySelector(".head");
      if (!head || head.querySelector(".zoom")) return;
      const button = document.createElement("button");
      button.className = "zoom";
      button.title = this._t(this._zoomed ? "zoom_out" : "zoom_in");
      button.innerHTML = `<ha-icon icon="${rcZoomIcon(this)}"></ha-icon>`;
      button.addEventListener("click", (ev) => rcZoomClick(this, ev));
      head.appendChild(button);
    }
  };

const rcBooleans = (...names) => names.map((name) => ({ name, selector: { boolean: {} } }));

const rcAdvanced = (i18n, lang, ...names) => [
  {
    name: "advanced",
    type: "expandable",
    flatten: true,
    schema: names.map((name) =>
      name === "language"
        ? {
            name,
            selector: {
              select: {
                mode: "dropdown",
                options: [
                  { value: "", label: rcT(i18n, lang, "ed_language_auto") },
                  { value: "en", label: "English" },
                  { value: "fr", label: "Français" },
                  { value: "de", label: "Deutsch" },
                  { value: "es", label: "Español" },
                  { value: "sr", label: "Српски" },
                  { value: "sr-Latn", label: "Srpski (latinica)" },
                  { value: "it", label: "Italiano" },
                  { value: "nl", label: "Nederlands" },
                  { value: "pt", label: "Português (Portugal)" },
                  { value: "pl", label: "Polski" },
                  { value: "ro", label: "Română" },
                  { value: "da", label: "Dansk" },
                  { value: "sv", label: "Svenska" },
                  { value: "bg", label: "Български" },
                  { value: "ru", label: "Русский" },
                  { value: "uk", label: "Українська" },
                  { value: "hu", label: "Magyar" },
                  { value: "sk", label: "Slovenčina" },
                  { value: "cs", label: "Čeština" },
                  { value: "sl", label: "Slovenščina" },
                  { value: "lv", label: "Latviešu" },
                  { value: "el", label: "Ελληνικά" },
                ],
              },
            },
          }
        : { name, selector: { object: {} } },
    ),
  },
];
// `schema(lang, hass, config)` lists the fields; options left at the card's default are not written to the YAML
// (list defaults such as `exclude: []` are not shown in the form: an empty list is never written anyway).
// `autos` maps an option to its default worked out from the config (`(hass, config) => value`): shown in the form
// while unset, and kept out of the YAML when left at it.
// Entity lists the form edits with an entity picker (ids only): an item written `{ entity, name, icon }` in YAML shows as its entity,
// and gets its name and icon back when the form changes the list (ha-room-card#77).
const RC_ENTITY_LISTS = ["include"];
const rcListIds = (list) => (Array.isArray(list) ? list.map((e) => (typeof e === "string" ? e : e?.entity)).filter(Boolean) : list);
const rcListKeep = (ids, before) =>
  Array.isArray(ids) ? ids.map((id) => (Array.isArray(before) ? before.find((e) => typeof e === "object" && e?.entity === id) : undefined) ?? id) : ids;

const rcEditor = ({ card, helpers, schema, autos = {} }) => {
  const i18n = card.i18n;
  const defaults = { show_title: true, ...Object.fromEntries(Object.entries(card.defaults).filter(([, v]) => !Array.isArray(v))) };
  return class extends HTMLElement {
    setConfig(config) {
      this._config = config;
      this._update();
    }

    set hass(hass) {
      this._hass = hass;
      this._update();
    }

    _update() {
      if (!this._hass || !this._config) return;
      const lang = rcLang(i18n, this._hass, this._config);
      // Read by the label and helper callbacks, set once on the form: a language change must reach them too.
      this._lang = lang;
      if (!this._form) {
        this._form = document.createElement("ha-form");
        this._form.computeLabel = (s) => rcT(i18n, this._lang, `ed_${s.name}`);
        this._form.computeHelper = (s) =>
          helpers.includes(s.name) ? rcT(i18n, this._lang, `ed_${s.name}_helper`) : undefined;
        this._form.addEventListener("value-changed", (ev) => {
          const config = { ...ev.detail.value };
          for (const k of RC_ENTITY_LISTS) if (k in config) config[k] = rcListKeep(config[k], this._config[k]);
          for (const k of Object.keys(config)) {
            const v = config[k];
            if (v === "" || v == null || (Array.isArray(v) && !v.length) || defaults[k] === v) delete config[k];
          }
          for (const [k, auto] of Object.entries(autos)) {
            const untouched = this._config[k] === undefined && config[k] === auto(this._hass, this._config);
            if (untouched || config[k] === auto(this._hass, config)) delete config[k];
          }
          this.dispatchEvent(new CustomEvent("config-changed", { detail: { config }, bubbles: true, composed: true }));
        });
        this.appendChild(this._form);
      }
      this._form.hass = this._hass;
      // A new data or schema object re-renders the whole form, and the schema runs the card's discovery:
      // both only change with the config, the language or the registries.
      const memo = (this._memo ||= {});
      const h = this._hass;
      this._form.data = rcMemo(memo, "data", [this._config, h.areas], () => {
        const data = { ...defaults, ...this._config };
        for (const k of RC_ENTITY_LISTS) if (k in data) data[k] = rcListIds(data[k]);
        for (const [k, auto] of Object.entries(autos)) data[k] ??= auto(h, this._config);
        return data;
      });
      this._form.schema = rcMemo(memo, "schema", [lang, this._config, h.entities, h.devices, h.areas], () =>
        schema(lang, h, this._config),
      );
    }
  };
};

const rcRegister = (card, editor, name, description) => {
  if (customElements.get(card.tag)) return;
  pickerDefine(card.tag, card);
  pickerDefine(`${card.tag}-editor`, editor);
  window.customCards = window.customCards || [];
  window.customCards.push({
    type: card.tag,
    name,
    description,
    preview: true,
    documentationURL: "https://github.com/juju35/ha-pc-card",
  });
};

if (!customElements.get("pc-card")) {
  console.info(`%c HA-PC-CARD %c v${RC_VERSION} `, "background:#4263eb;color:#fff;font-weight:700", "");
}

// ── Common styles ────────────────────────────────────────────────────────────
const RC_BASE_STYLES = `
  :host {
    --rc-ok: var(--success-color, #43a047);
    --rc-warn: var(--warning-color, #ffa600);
    --rc-alert: var(--error-color, #db4437);
    --rc-info: var(--info-color, #039be5);
    --rc-light: var(--state-light-active-color, #ffb300);
    --rc-plug: var(--state-switch-on-color, var(--primary-color, #03a9f4));
    --rc-idle: var(--secondary-text-color, #9e9e9e);
    --rc-na: var(--disabled-color, #9e9e9e);
    display: block;
    min-width: 0;
  }
  /* The card answers its own width (container queries). That containment drops its content from its natural width: in
     a wrapper sized by its content (inline-block, a grid's auto column, a flex row: layout-card, button-card…) it would
     shrink to its padding. The empty grid below (no height) gives the host a natural width of 344 px there, as a
     preferred width only: its column is minmax(0, …), so the card still shrinks to its column in a grid card, a
     horizontal stack or a 1fr column, even wrapped in a <div> (hui-card in layout-card). contain-intrinsic-inline-size
     or a min-width in px would be a minimum there, and the card would overflow. */
  :host::before { content: ""; display: grid; grid-template-columns: minmax(0, 344px); height: 0; }
  ha-card { padding: 12px; overflow: hidden; container-type: inline-size; }
  ha-card.lvl-alert { box-shadow: 0 0 0 1px color-mix(in srgb, var(--rc-alert) 45%, transparent), var(--ha-card-box-shadow, none); }

  .head { display: flex; align-items: center; gap: 10px; }
  .head.nav { cursor: pointer; }
  .head.nav:focus-visible { outline: 2px solid var(--primary-color); outline-offset: 2px; border-radius: 4px; }
  .badge { flex: none; width: 40px; height: 40px; border-radius: 50%; display: grid; place-items: center;
           background: color-mix(in srgb, var(--c) 16%, transparent); color: var(--c); }
  .badge ha-icon { --mdc-icon-size: 24px; }
  .lvl-alert .badge { animation: rc-pulse 1.6s ease-in-out infinite; }
  /* Narrow header: the title keeps a few letters (never 0 px), the status pill shrinks and ellipsises, the icon buttons
     (zoom, power) never shrink; under 200 px the pill is only its coloured dot, its text kept for screen readers. */
  .title { flex: 1 1 0; min-width: 5ch; font-size: 16px; font-weight: 500; color: var(--primary-text-color);
           white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
           /* show_title: false keeps the title's room (the pill and buttons stay in place) */
  :host([hide-title]) .head > .title { visibility: hidden; }
  .pill { all: unset; flex: 0 1 auto; min-width: 0; box-sizing: border-box; position: relative;
          display: inline-flex; align-items: center; gap: 3px; font-size: 11px; font-weight: 500;
          padding: 1px 8px; border-radius: 999px; background: color-mix(in srgb, var(--c) 14%, transparent);
          /* Coloured text is half the accent, half the text colour: 4.5:1 on its tint in light and dark themes, where
             the bare accent (amber above all) is not. */
          color: color-mix(in srgb, var(--c) 50%, var(--primary-text-color, #212121)); }
  .pt { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .pill ha-icon { flex: none; }
  /* A card this narrow (6 columns of the Sections view on a phone): the title is at its few letters already, so the
     status pill goes to a line of its own under it, where its whole label fits, rather than end with "…". */
  @container (max-width: 260px) {
    .head { flex-wrap: wrap; row-gap: 4px; }
    .head::after { content: ""; order: 1; flex: 1 0 100%; }
    .head > .pill { order: 2; margin-left: 50px; max-width: calc(100% - 50px); }
  }
  @container (max-width: 200px) {
    /* Under 200 px the pill is only its dot again: back on the title's line. */
    .head { flex-wrap: nowrap; }
    .head::after { content: none; }
    .head > .pill { order: 0; margin-left: 0; max-width: none; }
    .head > .pill .pt, .st .pt { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); }
    .head > .pill:not(.action), .st { flex: none; padding: 0; width: 18px; height: 18px; justify-content: center; background: none; }
    .head > .pill:not(.action)::before, .st::before { content: ""; width: 8px; height: 8px; border-radius: 50%; background: var(--c); }
    .head > .pill.action { padding: 1px 4px; }
    /* A full card this narrow (6 columns of the Sections view on a phone): a smaller badge, no side chip in the header. */
    .head { gap: 6px; }
    .head > .badge { width: 32px; height: 32px; }
    .head > .badge ha-icon { --mdc-icon-size: 20px; }
    .head > .chip { display: none; }
  }
  .pill.action { cursor: pointer; }
  .pill.action:hover { background: color-mix(in srgb, var(--c) 24%, transparent); }
  .pill.action:focus-visible { outline: 2px solid var(--primary-color); outline-offset: 2px; }
  .pill ha-icon { --mdc-icon-size: 12px; margin-left: -2px; }

  .grid { display: grid; grid-template-columns: repeat(var(--cols), minmax(0, 1fr)); gap: 6px; margin-top: 8px; }
  .tile { all: unset; position: relative; overflow: hidden; box-sizing: border-box; cursor: pointer; min-width: 0;
          display: flex; align-items: center; gap: 8px; padding: 5px 8px 5px 5px; border-radius: 10px;
          touch-action: pan-y; user-select: none; -webkit-user-select: none; -webkit-touch-callout: none;
          background: color-mix(in srgb, var(--t) 9%, var(--secondary-background-color, transparent));
          border: 1px solid color-mix(in srgb, var(--t) 22%, transparent); transition: background .2s, border-color .2s; }
  .tile.off, .tile.na { background: var(--secondary-background-color, transparent); border-color: transparent; }
  .tile.na { --t: var(--rc-na); opacity: .7; }
  .tile:hover { background: color-mix(in srgb, var(--t) 15%, var(--secondary-background-color, transparent)); }
  .tile:focus-visible { outline: 2px solid var(--primary-color); outline-offset: 2px; }
  .ic, .txt { position: relative; }
  .ic { flex: none; width: 28px; height: 28px; border-radius: 50%; display: grid; place-items: center;
        color: var(--t); background: color-mix(in srgb, var(--t) 20%, transparent); }
  .ic ha-icon { --mdc-icon-size: 16px; }
  .txt { display: flex; flex-direction: column; min-width: 0; }
  .name { font-size: 13px; font-weight: 500; line-height: 1.2; color: var(--primary-text-color);
          white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  /* A reading is never cut: on a narrow tile it goes on to a second line (the name, a label, keeps its ellipsis). */
  .state { font-size: 11px; line-height: 1.2; color: var(--secondary-text-color); overflow-wrap: break-word; }
  /* A card this narrow (a phone, 6 columns of the Sections view): one tile per row, whatever the columns option. */
  @container (max-width: 260px) { .grid { grid-template-columns: minmax(0, 1fr); } }
  /* layout: tiles — the size of Home Assistant's Tile card — 56 px high, a 40 px icon, the name over the state. */
  .layout-tiles .grid { gap: 8px; }
  .layout-tiles .tile { min-height: 56px; gap: 10px; padding: 8px 10px 8px 8px; border-radius: 12px; }
  .layout-tiles .ic { width: 40px; height: 40px; }
  .layout-tiles .ic ha-icon { --mdc-icon-size: 24px; }
  .layout-tiles .txt { gap: 2px; }
  .layout-tiles .name { font-size: 14px; line-height: 1.25; }
  .layout-tiles .state { font-size: 12px; line-height: 1.25; }

  @keyframes rc-blink { 0%, 100% { opacity: 1 } 50% { opacity: .35 } }
  @keyframes rc-pulse { 0%, 100% { box-shadow: 0 0 0 0 color-mix(in srgb, var(--c) 45%, transparent) }
                        50% { box-shadow: 0 0 0 7px transparent } }
  @media (prefers-reduced-motion: reduce) { .tile, .lvl-alert .badge { animation: none; transition: none; } }
`;

// Mini cards: layout, chips and zoom button. A chip is plain (icon and text) until it needs a look: then a tinted pill.
// The zoom / detail button of the mini cards and the overviews.
const RC_ZOOM_STYLES = `
  /* 40 px to tap, laid out as the 24 px it looks (the negative margins). */
  .zoom { all: unset; flex: none; cursor: pointer; width: 40px; height: 40px; margin: -12px -12px -12px -8px; border-radius: 50%;
          display: grid; place-items: center; color: var(--secondary-text-color); }
  .zoom ha-icon { --mdc-icon-size: 16px; }
  .zoom:hover { background: color-mix(in srgb, var(--rc-idle) 16%, transparent); color: var(--primary-text-color); }
  .zoom:focus-visible { outline: 2px solid var(--primary-color); outline-offset: 1px; }
`;

const RC_MINI_STYLES = `${RC_ZOOM_STYLES}
  /* The badge sits 12px from the card's top-left corner, like the other ha-* cards, beside the title and the readings. */
  ha-card:has(.mini) { padding: 12px; }
  .mini { display: flex; align-items: flex-start; gap: 10px; }
  /* The badge keeps the full card's size (40 px, icon 24 px): the body is at least as tall, a lone title line centred
     beside it. */
  .body { flex: 1; min-width: 0; min-height: 40px; display: flex; flex-direction: column; justify-content: center; gap: 4px; }
  .mini .head { gap: 8px; }
  .mini .title { line-height: 1.25; }
  .st { flex: 0 1 auto; min-width: 0; position: relative; display: inline-flex; align-items: center;
        margin-left: auto; font-size: 11px; font-weight: 500; color: var(--c); }
  .rs { display: flex; flex-wrap: wrap; gap: 2px 4px; margin-left: -4px; }
  .rs:empty { display: none; }
  /* A chip never runs past the card: a long name ends with an ellipsis. */
  .r { all: unset; cursor: pointer; display: inline-flex; align-items: baseline; gap: 1px; padding: 0 5px 0 4px;
       box-sizing: border-box; min-width: 0; max-width: 100%; overflow: hidden;
       border-radius: 999px; font-size: 12px; font-weight: 500; line-height: 24px; white-space: nowrap; --t: var(--rc-ok);
       color: var(--primary-text-color); }
  .r ha-icon { --mdc-icon-size: 13px; flex: none; color: var(--t); align-self: center; margin-right: 2px; }
  .r > span { min-width: 0; overflow: hidden; text-overflow: ellipsis; }
  .r.pill { color: color-mix(in srgb, var(--t) 50%, var(--primary-text-color, #212121)); background: color-mix(in srgb, var(--t) 14%, transparent); }
  .r:hover { background: color-mix(in srgb, var(--t) 20%, var(--secondary-background-color, transparent)); }
  .r:focus-visible { outline: 2px solid var(--primary-color); outline-offset: 2px; }
`;
