# Raport de teste: validarea la scanare (AV1–AV5) + acoperirea codului vechi

Data: 2026-11-16 · branch `frontend-final` (conține tot `main`, inclusiv validarea V1–V8 din backend).

## Rezumat

| Zonă | Rulate | Trecute | Picate | Note |
|---|---:|---:|---:|---|
| Backend (Django, `manage.py test bills`) | 66 | 65 | 1 | testul picat e vechi și pică la fel pe `main` curat |
| Aplicație (Jest, `npm test`) | 111 | 111 | 0 | 9 fișiere, fără avertismente |
| Typecheck aplicație (`tsc --noEmit`) | – | ✅ | – | |
| Lint aplicație (`expo lint`) | – | ✅ | – | 0 erori, 0 avertismente |
| Contract front ↔ back | – | ✅ | – | câmpurile din `shared/fixtures` = câmpurile răspunsurilor reale |

**Rulare:**

```bash
cd backend && .venv/bin/python manage.py test bills
```

```bash
cd mobile && npm test
```

## Ce s-a implementat în aplicație (taskurile din `docs/TASKS.md`)

| Task | Ce face | Unde | Testat de |
|---|---|---|---|
| AV1 | Tipuri pentru `validation`, `validation_status`, codurile noi de eroare; erorile API păstrează `code` și `existing_bill_id` | `src/api/types.ts`, `client.ts` (`parseApiError`, `confirmBill`, `billStatuses`) | `client-test.ts`, `contract-test.ts` |
| AV2 | După scanare, notificarea „Am pus factura în septembrie 2026” când factura e din altă lună | `src/validation.ts` (`monthNotice`), `Toast`, `ScanScreen` → `BillScreen` | `validation-test.ts`, `components-test.tsx` |
| AV3 | Pe factură: avertismentele într-un card cu „E corect” → `POST /confirm/`; notele `info` ca rânduri mici | `ValidationCard` | `components-test.tsx` |
| AV4 | `409 duplicate_bill` deschide factura existentă, cu mesajul „Ai scanat deja factura asta”; `429` și erorile de fișier arată textul din backend | `scanFailure` în `src/validation.ts` | `validation-test.ts`, `client-test.ts` |
| AV5 | Marcajul „De verificat” pe Acasă și în istoricul furnizorului, pentru facturile `needs_review` | `ReviewMark`, `api.billStatuses()` (din `/bills/?all=1`) | `components-test.tsx`, `client-test.ts` |

În plus:

- **Infrastructura de teste:** Jest (`jest-expo`, Jest 30, React Native Testing Library 14), conform documentației Expo SDK 58.
- **Calcule mutate într-un modul testabil:** cele din ecranul Acasă, în `src/overviewMath.ts`.
- **Reparație găsită la testare:** după „E corect”, marcajul „De verificat” putea rămâne până la 30 s (cache). Acum confirmarea golește cache-ul.

## Teste pe fișiere

### Aplicație (111)

| Fișier | Teste | Ce acoperă | Nou / vechi |
|---|---:|---|---|
| `validation-test.ts` | 18 | împărțirea verificărilor, `needs_review`, notificarea de lună, mesajele de eroare (timeout, rețea), 409 / 429 / fișier periculos | nou (AV2, AV4) |
| `client-test.ts` | 11 | `parseApiError` (v2, v1, HTML, gol, ID invalid), `confirmBill`, cache-ul de statusuri și resetarea lui la confirmare, scanarea trimite toate paginile ca `files`, dashboard live, PDF lipsă | nou (AV1) + vechi |
| `components-test.tsx` | 14 | `ValidationCard` (gol, avertismente + note, confirmare, eroare la confirmare, după confirmare, doar note), `ReviewMark`, `Toast` (apare, dispare la atingere sau singur), `SeverityBadge`, `Button` dezactivat, `ConfirmDialog` (ordinea butoanelor) | nou (AV3, AV5) + vechi |
| `derive-test.ts` | 22 | calculul de rezervă pentru Acasă și Furnizori pe datele demo: totaluri, comparații, ferestre de 12 luni, discrepanțe PPC / Engie / Apă, lună lipsă, furnizor necunoscut | vechi, netestat până acum |
| `helpers-test.ts` | 18 | formatarea lei și a lunilor, procentele, culorile, întrebările pe fiecare factură, unirea lunilor (bug-ul cu istoricul), bugetul sugerat, culorile roții, consistența celor 3 moduri | vechi, netestat până acum |
| `storage-test.tsx` | 5 | furnizori în așteptare (AsyncStorage), bugetul pe lună (salvare, reîncărcare, ștergere) | vechi, netestat până acum |
| `providers-test.ts` | 14 | lista de furnizori din România (nume unice, aceleași nume ca în backend), căutarea fără diacritice și după alias, filtrul pe categorie, furnizorii adăugați manual (o singură dată, nume gol, date corupte), colorarea rândurilor din istoric | nou |
| `addProvider-test.tsx` | 4 | formularul „Adaugă furnizor”: listă cu „Adăugat”, căutare, adăugare → „Adaugă factură” deschide Scanează, furnizor scris de mână | nou |
| `contract-test.ts` | 5 | datele exportate de backend au toate câmpurile citite de aplicație, inclusiv `validation` | nou (sincronizare front ↔ back) |

### Backend (66)

| Clasă | Teste | Rezultat | Nou / vechi |
|---|---:|---|---|
| `tests.DemoScenarioTests` | 36 | 35 ✅, 1 ❌ | scris de coleg |
| `tests.ScanValidationTests` | 16 | 16 ✅ | scris de coleg (V1–V8) |
| `tests_gaps.ApiGapTests` | 10 | 10 ✅ | **nou**: lista `?all=1`, 404, oferte, scrisoarea de contestație, plata manuală, mod de plată invalid, plata automată fără regulă / trecută / peste limită, confirmare pe o factură deja acceptată |
| `tests_gaps.RevalidateCommandTests` | 4 | 4 ✅ | **nou**: `manage.py revalidate` (dry-run, sumă greșită → `needs_review`, factura confirmată rămâne acceptată, facturile demo nu se ating) |

## Actualizare: roata, istoricul furnizorului, „Adaugă furnizor”

- **Roata lunii:** schimbarea lunii nu mai reîncarcă pagina.
  - Fiecare lună se cere o singură dată și se păstrează în memorie.
  - Lunile vecine se încarcă dinainte.
  - Spinner-ul de reîmprospătare apare doar la tragerea paginii în jos.
  - Verificat în browser: înapoi pe septembrie și din nou pe octombrie → **nicio cerere nouă**, doar o cerere în fundal pentru august.
- **Istoricul furnizorului:** fiecare factură e o cutie colorată în întregime, roșie pentru anomalie și galbenă pentru atenție (`rowTone`).
- **„Adaugă furnizor”:** formular separat, cu lista furnizorilor din România.
  - Are căutare și filtre pe categorie, plus posibilitatea de a scrie un furnizor de mână.
  - După adăugare, dacă furnizorul nu are facturi, apare „Adaugă factură”, care deschide Scanează.
  - În tabul Furnizori, acești furnizori apar cu „nicio factură încă” și butonul „Adaugă factură”.
  - O factură scanată ulterior pentru un furnizor adăugat manual nu mai e pusă „în așteptare”.

## Picate

| Test | Eroare | Cauză probabilă | Ce facem |
|---|---|---|---|
| `DemoScenarioTests.test_pdf_scan_fills_bboxes` | `6 not greater than or equal to 8`: doar 6 din 8 rânduri ale PDF-ului demo primesc o casetă pentru evidențiere | **Vechi.** Pică identic pe `main` fără nicio modificare de-a noastră. PDF-ul de test e generat pe loc cu fontul local (`make_sample_pdfs.register_font`); pe acest Mac textul e extras ușor diferit (diacritice), iar două etichete nu se mai potrivesc. Colegul raportează că la el trece. | De verificat de coleg: fontul folosit pe acest Mac sau normalizarea diacriticelor din `pdf_text.find_line_bboxes`. Nu afectează aplicația: fără casetă, rândul doar nu e evidențiat pe PDF. |

## Cazuri limită acoperite (toate trec)

- `parseApiError`: un răspuns HTML în loc de JSON; un răspuns gol devine „HTTP 502”; un `existing_bill_id` care nu e număr e ignorat.
- `scanFailure`: un 409 **fără** `existing_bill_id` arată mesajul, fără să încerce să deschidă o factură inexistentă.
- `monthNotice`: dacă verificarea `not_current_month` lipsește, aplicația folosește propriul text.
- Erori de rețea: patru formulări diferite („Network request failed”, „Failed to fetch”, „Load failed”, „NetworkError”), toate cu același mesaj clar.
- `billStatuses`: un backend mai vechi, fără `validation_status`, nu marchează nimic.
- `derive`: o lună necunoscută revine la ultima lună; o lună lipsă dă discrepanța `missing_month`; un furnizor necunoscut dă eroare de tip 404.
- `questionsFor`: o categorie necunoscută primește întrebări generale; anomaliile duplicate nu dublează întrebările.
- Stocare: date corupte în AsyncStorage → listă goală; bugetul fără lună nu se salvează.
- Backend: plata cu `mode` invalid → 400; confirmarea unei facturi deja acceptate nu strică nimic; `revalidate` nu atinge facturile demo.

## Sub review: comportamente de discutat sau de verificat de un om

| # | Ce | De ce e sub review |
|---|---|---|
| R8 | Lista de furnizori din România (`src/providersRo.ts`) | Numele și categoriile trebuie verificate de un om (ANRE / ANCOM), la fel ca baza de cunoștințe. Pentru furnizorii pe care backend-ul îi recunoaște deja, numele sunt verificate automat de test. |
| R9 | Furnizorii adăugați manual stau doar pe telefon | Pe alt telefon nu apar. Pentru conturi reale, lista ar trebui mutată în backend. |
| R10 | Web: navigarea cu tastatura (Tab) poate deplasa orizontal conținutul tabului | Am văzut o dată o deplasare de ~130 px pe web, după click-uri automate care derulează elementul în vizor. Nu am reprodus-o cu un click normal; pe telefon nu apare. |


| # | Ce | De ce e sub review |
|---|---|---|
| R1 | `suggestBudget` dă **0 lei** când media lunilor e 0 | E un caz rar (nicio factură în trecut), dar un buget sugerat de 0 n-are sens. Propunere: dacă media e 0, folosim totalul lunii. |
| R2 | `POST /confirm/` pe o factură deja `accepted` setează `confirmed_by_user = true` | Nu strică nimic, dar marchează ca „confirmată de tine” o factură pe care utilizatorul n-a avut ce confirma. De decis cu colegul dacă endpoint-ul răspunde fără să schimbe nimic în acest caz. |
| R3 | Lună inexistentă pe dashboard-ul calculat pe telefon → ultima lună | Backend-ul real răspunde cu o eroare (testul colegului `test_dashboard_selected_month_and_errors`); calculul de rezervă de pe telefon e mai permisiv. Inofensiv, dar diferit. |
| R4 | Fluxuri complete pe ecran: Scanează (cameră, galerie, PDF) → Factură, cu notificare și card | Logica e testată pe bucăți (`scanFailure`, `monthNotice`, `ValidationCard`, `Toast`); fluxul complet cu camera și selectorul de fișiere nu e testat automat. Trebuie încercat pe telefon. |
| R5 | Test pe telefonul real | Ultimele modificări nu au fost rulate pe un telefon real, ci doar în teste și typecheck. |
| R6 | Apeluri reale la Gemini | Toate testele folosesc AI simulat, intenționat. Colegul a raportat 33/33 în testul cap-coadă cu Gemini. |
| R7 | `ReadingModal`, `BudgetModal`, ecranele Acasă și Furnizor ca întreg | Nu au teste de componentă; logica din spatele lor (bugetul, unirea lunilor, statusurile) e testată separat. |

## Fișiere noi sau schimbate

- **Aplicație, cod:** `src/validation.ts`, `src/overviewMath.ts`, `src/components/ValidationCard.tsx`, `src/components/Toast.tsx`, `src/api/types.ts`, `src/api/client.ts`, `src/navigation.ts`, `src/screens/{Scan,Bill,Overview,Provider}Screen.tsx`.
- **Aplicație, teste:** `__tests__/*-test.ts(x)`, `__tests__/setup.ts`, configurarea `jest` în `package.json`, `types` în `tsconfig.json`.
- **Backend, teste:** `bills/tests_gaps.py`.
- **Documentație:** `docs/TASKS.md` (AV1–AV5 ✅), acest raport.
