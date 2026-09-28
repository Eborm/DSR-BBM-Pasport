# BBM-paspoort — specificatie voor de Proof of Concept

Dit document beschrijft wat er gebouwd moet worden, hoe het eruit hoort te zien en
waaraan het getoetst wordt. Het is bedoeld als volledige opdrachtbeschrijving:
lees het in zijn geheel voordat je begint.

---

## 1. Context

Het BBM-paspoort (blockchain-based materialenpaspoort) is een register dat per
materiaalbatch een onvervalsbare, groeiende historie bijhoudt van wie wat wanneer
over dat materiaal heeft vastgesteld. Doel is dat je over dertig jaar nog kunt
bewijzen waar een bouwelement vandaan komt en wat het waard is, zodat hergebruik
mogelijk wordt in plaats van sloop.

Dit is een Proof of Concept binnen een studieproject (Design Science Research,
Zuyd Hogeschool, project CEL4LIFE). De PoC hoeft niet productierijp te zijn. Hij
moet wel aantoonbaar voldoen aan acht requirements van de opdrachtgever, want
"waarde" is in dit project gedefinieerd als de mate waarin de oplossing aan die
requirements voldoet.

### De acht requirements

1. **Unieke identificatie en traceerbaarheid** — elk materiaal krijgt een eigen ID;
   eigenaarschap, locatie en levenscyclusgebeurtenissen zijn volgbaar. Nodig om
   materialen na jaren terug te vinden en hergebruik aantoonbaar te maken.
2. **Gestandaardiseerde materiaal- en productdata** — samenstelling, hoeveelheid,
   herkomst, producent, technische eigenschappen, levensduur en demontage-informatie.
   Zonder die data kan een toekomstige gebruiker niet bepalen of iets herbruikbaar is.
3. **Circulariteits- en milieu-informatie** — herbruikbaarheid, recyclebaarheid,
   reparatie, restwaarde, CO₂-impact, mogelijke volgende toepassingen. Het paspoort
   moet niet alleen vertellen wat iets is, maar wat je ermee kunt.
4. **Interoperabiliteit en open standaarden** — uitwisseling via open standaarden
   en API's. De EU stelt interoperabiliteit en machineleesbaarheid als uitgangspunt.
5. **Betrouwbaarheid, herkomst en integriteit** — vastleggen wie welke informatie
   wanneer heeft toegevoegd, inclusief bewijs. Partijen moeten informatie van
   andere partijen kunnen vertrouwen, zeker bij tweedehands materiaal.
6. **Datagovernance en toegangsrechten** — wie mag lezen, toevoegen en wijzigen.
   Bedrijfsgevoelige data hoeft niet publiek te zijn. Producenten doen alleen mee
   als hun intellectueel eigendom beschermd blijft.
7. **Levenscyclus en actualiseerbaarheid** — het paspoort groeit mee: productie →
   levering → toepassing → onderhoud → demontage → hergebruik → recycling. Dit
   maakt het meer dan een statisch productcertificaat.
8. **Praktische toepasbaarheid** — lage administratieve last, eenvoudige invoer,
   aansluiting op bestaande werkprocessen. Technisch perfecte oplossingen hebben
   weinig waarde als aannemers, slopers en fabrikanten ze niet gebruiken.

Alle acht wegen even zwaar. Een functie die geen enkele requirement bedient, wordt
niet gebouwd.

---

## 2. Scope

### Wel bouwen

- Smart contracts op een lokale EVM-keten (Hardhat)
- Een webapplicatie waarmee alle rollen hun handelingen kunnen uitvoeren
- Documentopslag buiten de keten met hashverankering
- Een testsuite die per requirement aantoont wat werkt
- Een exportfunctie naar JSON-LD

### Niet bouwen

- Beveiliging: geen authenticatie buiten de wallet, geen rate limiting, geen
  productiehardening. Uit de architectuur moet wel blijken dát de oplossing te
  beveiligen is; zie hoofdstuk 12.
- Schaalbaarheid, monitoring, deployment
- Een AI-assistent (aparte tool binnen CEL4LIFE)
- Koppeling met echte BIM-software

---

## 3. Domeinmodel

Het model kent een harde scheiding tussen wat op de keten staat en wat daarbuiten.
Die scheiding is niet optioneel: zij is de kern van het ontwerp.

### 3.1 Op de keten

**Batch** — de huidige stand van een materiaalbatch.

| Veld | Type | Toelichting |
|---|---|---|
| `id` | `uint256` | Uniek, oplopend vanaf 1 |
| `materialType` | `string` | Vrije tekst, bijvoorbeeld "staal S355, HEA 200" |
| `quantity` | `uint256` | Aantal eenheden |
| `unit` | `string` | "stuks", "kg", "m3" |
| `level` | `Level` | Aggregatieniveau, zie enum |
| `origin` | `string` | Producent of donorgebouw |
| `productionDate` | `uint64` | Unix-tijd van productie of demontage |
| `registrant` | `address` | Wie de batch aanmaakte |
| `owner` | `address` | Huidige eigenaar |
| `metadataURI` | `string` | Verwijzing naar het JSON-LD paspoortdocument |
| `parentId` | `uint256` | 0 bij een oorspronkelijke batch, anders de batch waaruit gesplitst is |
| `exists` | `bool` | Onderscheidt een lege van een echte batch |

Let op wat er **niet** in staat: geen `ownershipHistory` als array. Historie is
afleidbaar uit de events en hoort niet in een overschrijfbaar veld. Ook geen
gebruikersobject met wachtwoord: identiteit is een adres met een private sleutel.

**Event** — één regel op de tijdlijn. Wordt uitgezonden als Solidity-event, niet
opgeslagen in een array. Events zijn append-only: ze kunnen na uitzending niet
worden gewijzigd of verwijderd, en dat is precies waarom de historie hier leeft.
Ze zijn bovendien aanzienlijk goedkoper dan storage, wat telt bij een element dat
decennia meegaat.

| Veld | Type | Toelichting |
|---|---|---|
| `batchId` | `uint256` indexed | Waar de gebeurtenis bij hoort |
| `kind` | `bytes32` indexed | `keccak256` van de soortnaam |
| `actor` | `address` indexed | Wie de handeling uitvoerde |
| `timestamp` | `uint64` | Tijdstip |
| `documentURI` | `string` | Waar het onderliggende document staat |
| `documentHash` | `bytes32` | Hash van de inhoud van dat document |
| `description` | `string` | Korte omschrijving voor de tijdlijn |

Alle handelingen gebruiken dit ene event. Een registratie, een keuring, een
plaatsing en een overdracht verschillen alleen in `kind`. Zo blijft er één tijdlijn
in plaats van vier losse logboeken.

**Enums**

```
Level:      RawMaterial | Product | Component | BuildingElement
EventKind:  registration | inspection | placement | transfer | split | demolition | reuse
```

`materialType` is bewust een string en geen enum. Materialen zijn open: morgen komt
er isolatie of kalkzandsteen bij, en dan moet het contract niet opnieuw uitgerold
hoeven worden.

### 3.2 Buiten de keten

**PassportDocument** — een JSON-LD bestand met de elf datacategorieën:
identificatie, fysieke eigenschappen, samenstelling, herkomst en productie,
technische prestaties, milieu-impact, circulariteit, losmaakbaarheid,
onderhoudshistorie, eigendom en certificering.

**File** — het onderliggende bestand: keuringsrapport (PDF), foto, EPD, BIM-model.

### 3.3 De koppeling

De `documentURI` zegt **waar** een document te vinden is. De `documentHash` zegt
**wat erin hoort te staan**. De hash wordt berekend over de *inhoud* van het
bestand, nooit over de URI: anders zou iemand een ander bestand op hetzelfde adres
kunnen zetten zonder dat de controle faalt.

Verificatie werkt zo: haal het document op via de URI, bereken opnieuw
`keccak256` over de bytes, vergelijk met de hash op de keten. Gelijk betekent
onveranderd sinds indiening.

De keten bewaart dus geen gegevens maar een bewijs over gegevens.

---

## 4. Rollen en rechten

Vijf rollen. Let op: **lezen vereist geen rol.** Iedereen mag de tijdlijn en de
batchgegevens opvragen; dat maakt het zoeken naar herbruikbaar materiaal mogelijk.
Alleen schrijven is beperkt.

| Rol | Mag | Mag niet |
|---|---|---|
| `MANUFACTURER` | Batches aanmaken, eigen batches overdragen | Claims van anderen wijzigen |
| `INSPECTOR` | Claims (keuringen) toevoegen aan elke batch | Eigenaar zijn of worden |
| `OWNER` | Locatie en status claimen op eigen batches, overdragen, splitsen | Batches aanmaken |
| `DEMOLISHER` | Conditie claimen, status op beschikbaar zetten | Historie verwijderen |
| *(geen rol)* | Alles lezen en zoeken | Alles wat schrijft |

Implementeer met OpenZeppelin `AccessControl`. Eigendomsoverdracht controleert
daarnaast dat `msg.sender` de huidige eigenaar is.

Meerdere claims van hetzelfde soort op één batch zijn toegestaan, ook wanneer ze
elkaar tegenspreken. Twee keuringen met verschillende uitkomsten blijven beide
zichtbaar met hun afzender en datum; de gebruiker beslist wie hij vertrouwt. Dit
is bewust: een centrale database zou de oude waarde overschrijven.

---

## 5. Contractfuncties

```solidity
// Aanmaken. Invoer als struct: met losse parameters loopt de stack over
// ("Stack too deep" bij zeven of meer parameters).
function registerBatch(BatchInput calldata input)
    external onlyRole(MANUFACTURER) returns (uint256 batchId);

// Claim met bewijs. Zendt zowel een ClaimAdded- als een TimelineEvent uit.
function addClaim(
    uint256 batchId,
    bytes32 kind,
    bytes32 documentHash,
    string calldata documentURI,
    string calldata description
) external;

// Overdracht. Werkt `owner` bij en zet een regel op de tijdlijn.
function transferOwnership(uint256 batchId, address to, uint256 amount) external;

// Splitsen: deel van een batch wordt een nieuwe batch met verwijzing naar de parent.
function splitBatch(uint256 batchId, uint256 amount, address to)
    external returns (uint256 newBatchId);

// Lezen, open voor iedereen.
function getBatch(uint256 batchId) external view returns (Batch memory);
function batchCount() external view returns (uint256);
```

Gebruik custom errors (`UnknownBatch`, `NotOwner`, `EmptyHash`, `ZeroQuantity`,
`EmptyMaterialType`), geen `require`-strings.

### Splitsen

Wanneer vijftig van tweehonderd liggers naar een ander project gaan, ontstaat een
nieuwe batch die via `parentId` verwijst naar de oorspronkelijke. De gedeelde
historie vóór de splitsing blijft geldig voor beide takken. Zet een `split`-event
op beide tijdlijnen, zodat de vertakking in de app zichtbaar is.

---

## 6. De applicatie

### 6.1 Algemene opzet

Eén pagina-applicatie in React. De rol wordt afgeleid uit het verbonden
wallet-adres; er is geen inlogscherm en geen wachtwoord. Bovenaan staat altijd
zichtbaar welk adres verbonden is en welke rol dat adres heeft.

Handelingen waarvoor het verbonden adres geen rol heeft, worden **getoond maar
uitgeschakeld**, met een korte uitleg waarom. Verbergen is verleidelijk maar maakt
requirement 6 onzichtbaar; juist de zichtbare weigering is het bewijs.

### 6.2 Schermen

**A. Overzicht (startscherm)**

Doel: alle batches kunnen vinden. Dit scherm bedient requirement 1 en 8.

- Zoekbalk op materiaalsoort en herkomst
- Filters op status (in gebouw, beschikbaar, gesloopt), op niveau en op eigenaar
- Resultaten als lijst met per regel: ID, materiaalsoort, hoeveelheid met eenheid,
  niveau, herkomst en status
- Klik op een regel opent het detailscherm
- Lege staat: "Nog geen batches geregistreerd" met een knop naar registratie
- Knop "Nieuwe batch registreren", uitgeschakeld zonder `MANUFACTURER`

**B. Batchdetail**

Het belangrijkste scherm. Drie blokken onder elkaar.

*Kop:* materiaalsoort groot, daaronder ID, hoeveelheid, niveau, herkomst,
productiedatum, huidige eigenaar. Is `parentId` gevuld, toon dan een link naar de
oorspronkelijke batch. Rechts een QR-code van het batch-ID met een knop om die te
downloaden of te printen.

*Tijdlijn:* verticale lijst, chronologisch, nieuwste onderaan. Per regel: datum,
soort gebeurtenis, het adres van de actor met zijn rol, en de omschrijving. Hangt
er een document aan, dan staat er een bestandsregel bij met:

- de naam of het type document
- een verificatie-indicator: groen vinkje bij een kloppende hash, rode melding bij
  afwijking, grijs "niet gecontroleerd" als het document niet bereikbaar is
- een link om het document te openen

De verificatie draait automatisch bij het openen van het scherm. Toon nooit een
vinkje zonder de hash daadwerkelijk opnieuw te hebben berekend.

*Acties:* knoppen voor claim toevoegen, eigendom overdragen en splitsen, elk
uitgeschakeld wanneer de rol het niet toestaat.

**C. Batch registreren**

Formulier met alle velden uit het domeinmodel. Validatie vóór verzending:
materiaalsoort niet leeg, hoeveelheid groter dan nul, eenheid gekozen, niveau
gekozen.

Optioneel een paspoortdocument uploaden. Gebeurt dat, dan wordt het bestand eerst
opgeslagen, de hash berekend, en pas daarna de transactie verstuurd.

Na verzending: toon het toegekende ID en de QR-code, met een duidelijke instructie
dat die op het materiaal moet worden aangebracht. Die fysieke stap is geen detail;
zonder markering is de digitale registratie niet terug te vinden.

**D. Claim toevoegen**

Formulier met: soort gebeurtenis (uit `EventKind`), omschrijving, en een
bestandsupload.

De volgorde is hier belangrijk en moet in de interface zichtbaar zijn:

1. bestand uploaden → opslag geeft een URI terug
2. hash berekenen over de bytes van het bestand
3. transactie versturen met URI en hash

Toon tijdens stap 2 de berekende hash op het scherm. Klein detail, maar het maakt
het mechanisme begrijpelijk voor wie meekijkt tijdens een demo.

**E. Overdragen en splitsen**

Eén scherm met twee modi. Bij overdragen: ontvangeradres en bevestiging. Bij
splitsen: aantal dat meegaat, ontvangeradres, en een waarschuwing dat er een
nieuwe batch ontstaat die naar deze verwijst.

**F. Scannen**

Camera of handmatige invoer van een batch-ID. Leidt direct naar het detailscherm.

**G. Verificatie (los scherm)**

Upload een bestand en een batch-ID. De app berekent de hash en zoekt of die
voorkomt in de tijdlijn van die batch. Uitkomst: gevonden met datum en indiener,
of niet gevonden.

Dit scherm bestaat om requirement 5 los te kunnen demonstreren. Het is het
overtuigendste onderdeel van de hele demo: wijzig één byte in een PDF en de uitkomst
slaat om.

### 6.3 Statussen die elk scherm moet afhandelen

- **Laden** — skeletons, geen spinner over het hele scherm
- **Leeg** — vriendelijke tekst plus de logische vervolgactie
- **Geen wallet verbonden** — alles leesbaar, alle schrijfacties uitgeschakeld
- **Transactie in behandeling** — knop uitgeschakeld met voortgangsindicatie
- **Transactie geweigerd** — toon de custom error in gewone taal, niet de ruwe
  foutmelding van de keten
- **Document onbereikbaar** — tijdlijn blijft zichtbaar, alleen de
  verificatie-indicator wordt grijs

---

## 7. Visuele richtlijnen

Het is een werktuig voor aannemers, slopers en gemeenteambtenaren, geen
consumentenapp. Nuchter, hoge informatiedichtheid, goed leesbaar op een tablet op
een bouwplaats.

- **Kleur:** neutrale basis (wit of licht grijsgroen), één accentkleur voor
  interactie. Groen, rood en grijs uitsluitend voor verificatiestatus, nergens
  anders, zodat die betekenis eenduidig blijft.
- **Typografie:** één schreefloze familie. Adressen en hashes in een
  monospace-variant, altijd afgekort als `0xf39F…2266` met de volledige waarde in
  een tooltip en een kopieerknop.
- **Ruimte:** compacte lijsten, ruime formulieren.
- **Tijdlijn:** duidelijk verticaal verloop met een doorlopende lijn en per
  gebeurtenis een punt. Het is de kern van het product en moet er ook zo uitzien.
- **Toegankelijkheid:** verificatiestatus nooit alleen met kleur; altijd ook een
  icoon en tekst. Contrastverhouding minimaal 4,5:1. Alles bedienbaar met het
  toetsenbord.

---

## 8. Techniek

```
contracts/        Solidity 0.8.24, OpenZeppelin, EVM-doel cancun
test/             Hardhat-tests, geordend per requirement
scripts/          deploy en demo met vaste voorbeelddata
app/              React, ethers.js of viem, Vite
storage/          documentopslag buiten de keten
```

- Solidity `0.8.24` met `evmVersion: "cancun"`. OpenZeppelin 5 gebruikt de
  instructie `mcopy`, die pas vanaf die EVM-versie bestaat; zonder deze instelling
  compileert het niet.
- ERC-1155 als basis, niet ERC-721: een batch bestaat uit meerdere eenheden en moet
  gesplitst kunnen worden.
- Documentopslag: lokale map of IPFS, achter één interface zodat de keuze later te
  wijzigen is.
- Hashing met `keccak256` over de ruwe bytes van het bestand.

---

## 9. Toetsing

Schrijf per requirement minimaal één test die slaagt of faalt. Orden de testsuite
per requirement, zodat in de uitvoer zichtbaar is wat is aangetoond.

| Requirement | Test |
|---|---|
| 1 Identificatie | Elke batch krijgt een uniek oplopend ID; opvragen van een onbekend ID geeft `UnknownBatch` |
| 2 Data | Alle kernvelden komen terug zoals ingevoerd; lege materiaalsoort en hoeveelheid nul worden geweigerd |
| 3 Circulariteit | Uit het paspoortdocument is een circulariteitsindicatie af te leiden en te tonen |
| 4 Interoperabiliteit | De JSON-LD export valideert tegen het schema |
| 5 Integriteit | Een gewijzigd document laat de hashcontrole falen |
| 6 Toegangsrechten | Per rol: toegestane actie slaagt, verboden actie wordt geweigerd |
| 7 Levenscyclus | Een batch doorloopt registratie, keuring, plaatsing, splitsing, demontage en hergebruik; alle regels blijven zichtbaar |
| 8 Toepasbaarheid | Registreren kost niet meer dan een vastgesteld aantal handelingen; meet en rapporteer dat |

Onderscheid in de rapportage drie niveaus, want niet elk criterium is even hard:

- **Aangetoond** — binair te testen (1, 2, 5, 6)
- **Gedemonstreerd** — zichtbaar gemaakt maar niet bewezen over de volle levensduur
  (3, 4, 7)
- **Deels buiten bereik** — requirement 8 is niet volledig te bewijzen zonder echte
  gebruikers. Meet wat meetbaar is (aantal velden, aantal klikken, tijd per invoer)
  en benoem de rest als beperking.

---

## 10. Demodata

Gebruik één doorlopende casus, zodat de demo een verhaal vertelt in plaats van
losse records.

**Casus:** stalen liggers uit een donorgebouw in Heerlen.

1. Fabrikant registreert 200 stalen liggers HEA 200, staal S355, in 2018
2. Aannemer claimt plaatsing in een kantoorgebouw, met bouwtekening
3. 2044: sloper claimt demontage met een conditierapport en foto's
4. Keuringsinstantie voegt een herkeuring toe met 85% restcapaciteit
5. Batch wordt gesplitst: 50 liggers gaan naar een ander project
6. Architect zoekt beschikbaar staal en vindt deze batch

Stap 5 en 6 demonstreren requirement 1 en 7. Voeg een script toe dat één document
bewust corrumpeert, zodat de rode verificatiemelding ook in de demo te zien is.

---

## 11. Bouwvolgorde

1. Contract met registratie en tijdlijn, plus tests **(gereed)**
2. Rollen en claims met documenthash, plus tests per rol
3. Documentopslag en hashverificatie
4. Frontend: overzicht, detail, registratie
5. Frontend: claims, overdracht, splitsen, scannen
6. Verificatiescherm en JSON-LD export
7. Demoscript en meting voor requirement 8

Werk in deze volgorde. Contracten en tests eerst; schermen bouwen voor een
datamodel dat nog schuift, is dubbel werk. Stap 2 levert bovendien de twee
requirements op die het hardst aantoonbaar zijn, dus ook bij tijdgebrek staat er
dan iets dat iets bewijst.

---

## 12. Beveiligbaarheid

De PoC is niet beveiligd, maar de architectuur moet aantoonbaar te beveiligen zijn.
Documenteer daarom in de README per laag wat er in productie bij komt.

**Contractlaag** — dit is nu al te doen en hoort in de code: rolcontroles vóór elke
schrijfactie, invoervalidatie, geen herintreding mogelijk,
`Checks-Effects-Interactions`.

**Netwerklaag** — eigenschap van het platform, niet van deze code. Beschrijf welke
permissioning het gekozen platform biedt en hoe deelnemers worden toegelaten.

**Documentlaag** — de zwakste plek. Toegangscontrole op de documentopslag zit *niet*
in het smart contract. In de PoC is elk document bereikbaar voor iedereen die de URI
kent. Benoem dit expliciet als beperking en beschrijf hoe het in productie zou
worden opgelost.

De lokale keten van de PoC en een besloten productieketen draaien dezelfde bytecode.
Het pad van PoC naar productie vervangt dus één component, niet het ontwerp. Maak
dat expliciet in de documentatie: dat is het antwoord op de vraag of deze
oplossingsrichting toekomstvast is.

---

## 13. Uitgangspunten die niet ter discussie staan

- Blockchain is gegeven. De vraag of een andere techniek beter zou passen, is door
  de opdrachtgever beantwoord en valt buiten scope.
- Gegevens worden nooit overschreven, alleen toegevoegd. Een correctie is een nieuwe
  regel op de tijdlijn, geen aanpassing van een bestaande.
- Documenten staan buiten de keten. Op de keten komt alleen een hash en een
  verwijzing.
- Lezen is voor iedereen, schrijven is per rol.
- De acht requirements zijn het toetsingskader, en ze wegen even zwaar.
