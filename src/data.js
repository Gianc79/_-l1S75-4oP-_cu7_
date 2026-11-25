// Costanti statiche, unità di misura, palette colori, icone SVG e contenuti informativi

export const CART_CELEBRATION_DATA_URI = "./CarrelloSpesa.webp";
export const APP_NAME = "SpesaSuMisura";
export const APP_VERSION = "1.82";
export const MAX_SAVED_LISTS = 10;
export const DB_NAME = "spesaSuMisuraDB";
export const DB_VERSION = 3;
export const infoBtn = '<button type="button" class="info-btn" aria-label="Informazioni su questa schermata" title="Informazioni">i</button>';
export const SVG_TIP_BULB = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.8 10.6c.7.6 1.3 1.5 1.5 2.4h4.6c.2-.9.8-1.8 1.5-2.4A6 6 0 0 0 12 3Z" fill="#ffd43b" stroke="#854d0e" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/></svg>';
export const SVG_FILTER_CLEAR = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 4h14l-5.5 7v6l-3 2v-8z" fill="#cfd8e3" stroke="#5b6b7d" stroke-width="1.3" stroke-linejoin="round"/><path d="M15 14l6 6M21 14l-6 6" stroke="#d92d20" stroke-width="2.4" stroke-linecap="round"/></svg>';
export const SVG_CHK = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"/></svg>', SVG_X = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5v5h5" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/><path d="M5.2 14a7 7 0 1 0 1.8-7.3L4 10" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>';
export const SVG_CIRCLE_X = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9.5" fill="none" stroke="currentColor" stroke-width="2.2"/><path d="M8.5 8.5l7 7M15.5 8.5l-7 7" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>';
export const SVG_CIRCLED_PLUS = '<svg class="btn-plus-ico" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9.5" fill="rgba(255,255,255,.15)" stroke="currentColor" stroke-width="2"/><path d="M12 7.8v8.4M7.8 12h8.4" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>';
export const SWIPE_TRASH_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>';
export const TRASH_OFFICE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4.5 6.8h15"/><path d="M9.3 6.8V5.1A1.6 1.6 0 0 1 10.9 3.5h2.2a1.6 1.6 0 0 1 1.6 1.6v1.7"/><path d="M6.4 6.8l.9 12.1a1.8 1.8 0 0 0 1.8 1.6h5.8a1.8 1.8 0 0 0 1.8-1.6l.9-12.1"/><path d="M10 10.6v6.2M14 10.6v6.2"/></svg>';
export const stores = ["categories", "products", "stores", "storeCategoryRoutes", "productStores", "productPrices", "shoppingLists", "shoppingListItems", "settings", "tombstones", "meta", "savedLists", "archivedReceipts"];
export const PENCIL_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20l1-4L16 5l3 3L8 19z" fill="#f5a623" stroke="#8a4b00" stroke-width="1.2" stroke-linejoin="round"/></svg>';
export const PROD_NAME_MAX = 24;
export const PROD_BRAND_MAX = 20;
export const PROD_WEIGHT_UNITS = ["kg", "g"];
export const PROD_VOLUME_UNITS = ["lt", "cl", "ml"];
export const PROD_LENGTH_UNITS = ["m", "cm"];
export const PROD_CONFEZIONE_UNITS = ["kg", "g", "lt", "cl", "ml", "m", "cm", "pz"];
export const PROD_SFUSO_UNITS = ["kg", "lt", "m", "pz"];
export const DEFAULT_SETTINGS = { id: "main", defaultStoreId: null, currency: "EUR" };

export const HEX_CHROMATIC_ROWS = [
  ["#003366", "#336699", "#3366CC", "#003399", "#000099", "#0000CC", "#000066"],
  ["#006666", "#006699", "#0099CC", "#0066CC", "#0033CC", "#0000FF", "#3333FF", "#333399"],
  ["#669999", "#009999", "#33CCCC", "#00CCFF", "#0099FF", "#0066FF", "#3366FF", "#3333CC", "#666699"],
  ["#339966", "#00CC99", "#00FFCC", "#00FFFF", "#33CCFF", "#3399FF", "#6699FF", "#6666FF", "#6600FF", "#6600CC"],
  ["#339933", "#00CC66", "#00FF99", "#66FFCC", "#66FFFF", "#66CCFF", "#99CCFF", "#9999FF", "#9966FF", "#9933FF", "#9900FF"],
  ["#006600", "#00CC00", "#00FF00", "#66FF99", "#99FFCC", "#CCFFFF", "#CCCCFF", "#CC99FF", "#CC66FF", "#CC33FF", "#CC00FF", "#9900CC"],
  ["#003300", "#009933", "#33CC33", "#66FF66", "#99FF99", "#CCFFCC", "#FFFFFF", "#FFCCFF", "#FF99FF", "#FF66FF", "#FF00FF", "#CC00CC", "#660066"],
  ["#336600", "#009900", "#66FF33", "#99FF66", "#CCFF99", "#FFFFCC", "#FFCCCC", "#FF99CC", "#FF66CC", "#FF33CC", "#CC0099", "#993399"],
  ["#333300", "#669900", "#99FF33", "#CCFF66", "#FFFF99", "#FFCC99", "#FF9999", "#FF6699", "#FF3399", "#CC3399", "#990099"],
  ["#666633", "#99CC00", "#CCFF33", "#FFFF66", "#FFCC66", "#FF9966", "#FF6666", "#FF0066", "#CC6699", "#993366"],
  ["#999966", "#CCCC00", "#FFFF00", "#FFCC00", "#FF9933", "#FF6600", "#FF5050", "#CC0066", "#660033"],
  ["#996633", "#CC9900", "#FF9900", "#CC6600", "#FF3300", "#FF0000", "#CC0000", "#990033"],
  ["#663300", "#996600", "#CC3300", "#993300", "#990000", "#800000", "#660000"]
];
export const HEX_GRAY_ROWS = [
  ["#EFEFEF", "#CFCFCF", "#AFAFAF", "#8F8F8F", "#707070", "#505050", "#303030", "#101010"],
  ["#FFFFFF", "#DFDFDF", "#BFBFBF", "#9F9F9F", "#808080", "#606060", "#404040", "#202020", "#000000"]
];

export const GUIDE_HTML = `<div class="guide-text">
    <div class="guide-hero">
      <div class="guide-welcome">BENVENUTO IN <strong>SpesaSuMisura</strong></div>
      <p class="guide-lead">Il Gestionale per la tua spesa quotidiana, studiato per adattarsi alle tue abitudini personali e per darti il pieno controllo sul budget.</p>
      <div class="guide-features">
        <div class="guide-feature">
          <div class="guide-feature-ico" aria-hidden="true"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2"/><rect x="9" y="3" width="6" height="4" rx="1"/><path d="M9 12h6M9 16h4"/></svg></div>
          <div class="guide-feature-body"><strong>Pianifica la spesa in anticipo:</strong> sai gi\xE0 quanto andrai a spendere mentre prepari la lista, prima ancora di uscire di casa.</div>
        </div>
        <div class="guide-feature">
          <div class="guide-feature-ico is-green" aria-hidden="true"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M15 9.2a3.6 3.6 0 0 0-5.4 2.8c0 2.1 1.6 3.5 3.6 3.5.8 0 1.4-.2 1.9-.6M8.2 11h4.6M8.2 13.4h4.2"/></svg></div>
          <div class="guide-feature-body"><strong>Monitora il budget in corsia:</strong> mentre fai la spesa vedi in tempo reale quanto hai gi\xE0 speso e come si aggiorna la proiezione del <strong>Totale</strong>.</div>
        </div>
        <div class="guide-feature">
          <div class="guide-feature-ico" aria-hidden="true"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="6" cy="18" r="2.5"/><circle cx="18" cy="6" r="2.5"/><path d="M8.5 18H13a3 3 0 0 0 0-6h-2a3 3 0 0 1 0-6h4.5"/></svg></div>
          <div class="guide-feature-body"><strong>Evita giri a vuoto:</strong> segui il tuo percorso abituale nei reparti di ogni singolo supermercato.</div>
        </div>
        <div class="guide-feature">
          <div class="guide-feature-ico is-green" aria-hidden="true"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 3h12v18l-2-1.5-2 1.5-2-1.5-2 1.5-2-1.5L6 21V3Z"/><path d="M9 9h6"/><path d="m9.5 14 1.8 1.8 3.4-3.6"/></svg></div>
          <div class="guide-feature-body"><strong>Controlla l\u2019importo a fine spesa:</strong> tenendo la lista aggiornata in tempo reale con ci\xF2 che acquisti realmente, il <strong>Totale</strong> dell\u2019app diventa un perfetto controllo incrociato per verificare l\u2019importo riportato dai terminali self-service o sullo scontrino finale.</div>
        </div>
      </div>
    </div>
    <div class="guide-section">
      <h3>REPARTI <span class="guide-h-sub">(Crea le tue categorie)</span></h3>
      <p>Dimentica le categorie standard preimpostate. Crea i reparti che usi davvero e scegli il livello di dettaglio che preferisci: puoi creare un unico reparto <strong>ORTOFRUTTA</strong> oppure diversi sottoreparti (<strong>FRUTTA</strong>, <strong>VERDURA</strong>, <strong>ORTAGGI</strong>, <strong>SPEZIE</strong>, ecc.).</p>
    </div>
    <div class="guide-section">
      <h3>SUPERMERCATI <span class="guide-h-sub">(Imposta il tuo percorso)</span></h3>
      <p>Ogni punto vendita \xE8 diverso. Configura i tuoi supermercati selezionando i reparti che ti interessano e ordinandoli nella sequenza esatta in cui li incontri mentre fai la spesa.</p>
    </div>
    <div class="guide-section">
      <h3>ARTICOLI <span class="guide-h-sub">(Confronta i prezzi)</span></h3>
      <p>Costruisci il tuo catalogo personale. Per ogni prodotto puoi inserire la descrizione e associare il prezzo di ogni supermercato, cos\xEC saprai sempre dove ti conviene acquistarlo.</p>
    </div>
    <div class="guide-section">
      <h3>LA MIA LISTA <span class="guide-h-sub">(Fai la spesa senza sorprese)</span></h3>
      <p>Aggiungi semplicemente gli articoli da acquistare: l\u2019app fa tutto il lavoro al posto tuo, raggruppandoli per punto vendita e ordinandoli secondo la sequenza dei reparti.</p>
      <p>Mentre sei tra gli scaffali puoi:</p>
      <ul class="guide-bullets">
        <li><strong>Aggiungere, modificare o rimuovere</strong> prodotti.</li>
        <li><strong>Aggiornare la quantit\xE0 reale</strong> del prodotto acquistato (es. preventivati: <em>0,750 kg di mele</em>; reali dopo la pesata: <em>0,868 kg</em>).</li>
        <li><strong>Aggiornare i prezzi unitari di listino</strong> (in caso di aumenti) o quelli relativi a <strong>promozioni/offerte in corso</strong>: l\u2019importo speso fino a quel momento e la proiezione finale del <strong>Totale</strong> si aggiorneranno in tempo reale, cos\xEC saprai sempre se stai rispettando il budget o di quanto ti stai discostando.</li>
        <li><strong>Toccare il menu <span class="guide-kbd">\u22ee</span></strong> (in alto, accanto al titolo) per salvare la lista, caricarne una precedente, iniziare una nuova sessione di spesa o svuotare tutto.</li>
      </ul>
    </div>
    <div class="guide-section">
      <h3>BACKUP DEI DATI</h3>
      <p>Usa i due pulsanti in alto a destra per <strong>esportare un backup</strong> o per <strong>ripristinarne uno precedente</strong>.</p>
    </div>
  </div>`;
