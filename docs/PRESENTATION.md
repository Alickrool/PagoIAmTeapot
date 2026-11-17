# AI Pago – presentation script (Romanian, 10:45 talk + questions, 15 min max)

Spoken text is in Romanian (*italic blocks = what you say*). Production notes are in English.
**M1** = frontend member, **M2** = backend member. Clips are short screen recordings from the phone, one per feature
(how to record them: section "Clips" at the end). Every number below was checked on the seeded demo data
(17 Nov 2026); if you change the demo data, re-check them.

| # | Part | Time | Who | On screen |
|---|---|---|---|---|
| 0 | Deschidere | 0:00–0:40 | M2 | title: **AI Pago – auditorul facturilor tale** |
| 1 | Problema | 0:40–1:40 | M2 | 3 pictures: index estimat · preț crescut · opțiune uitată |
| 2 | Ideea și scopul MVP | 1:40–2:40 | M2 | flow: poză → date → audit → acțiune; "AI citește, regulile decid" |
| 3 | Demo: funcțiile principale | 2:40–7:40 | M1 + M2 | clips 1–6 |
| 4 | Funcții secundare | 7:40–8:30 | M1 | clip 7 |
| 5 | De ce poți avea încredere | 8:30–9:20 | M2 | 4 bullets |
| 6 | Valoare pentru Pago + pașii următori | 9:20–10:00 | M2 | 3 bullets |
| 7 | Echipa: cine ce a făcut | 10:00–10:45 | M1 + M2 | 2 columns |
| 8 | Întrebări | 10:45–15:00 | both | backup clips / screenshots |

**If you only get 10 minutes:** part 4 becomes one sentence ("În plus: arhivă, PDF-ul facturii, buget, duplicate…"),
part 5 keeps only its first 3 bullets. That saves ~1:10.

---

## 0. Deschidere (0:00–0:40) – M2

*Bună ziua! Suntem echipa „I'm a teapot” și vă prezentăm AI Pago.*

*O familie plătește, de obicei, patru–cinci facturi pe lună: curent, gaz, apă, internet. Le plătim din Pago în
câteva secunde, dar aproape nimeni nu le citește. Vedem suma, apăsăm „Plătește” și mergem mai departe.*

*Noi am adăugat un pas înainte de plată: un auditor care citește factura în locul tău, ți-o explică pe înțeles și
îți spune când ceva nu e în regulă.*

## 1. Problema (0:40–1:40) – M2

*Facturile de utilități au greșeli și surprize care costă bani reali. Trei exemple pe care le vedeți și în demo:*

*Unu: **indexul estimat**. Furnizorul nu ți-a citit contorul și te facturează după o estimare. Plătești consum pe
care nu l-ai avut, iar diferența o vezi abia la regularizare.*

*Doi: **prețul crește discret**. Oferta cu preț fix expiră, factura crește cu 40%, iar tu crezi că ai consumat mai
mult.*

*Trei: **opțiuni plătite uitate**. Un pachet TV cu antivirus de 15 lei pe lună, activat acum șase luni și uitat.*

*Și peste toate, factura e greu de înțeles: certificate verzi, cogenerare, CfD, acciză, TVA. Nimeni nu are timp să le
verifice lună de lună.*

## 2. Ideea și scopul MVP (1:40–2:40) – M2

*Ideea: faci o poză facturii sau încarci PDF-ul, fără să scrii nimic. AI-ul o transformă în date, iar aplicația face
automat un audit și îți propune o acțiune concretă, la un singur tap.*

*Cu MVP-ul am vrut să demonstrăm trei lucruri:*
*– că orice factură poate fi citită fără să tastezi nimic;*
*– că regulile prind probleme reale, cu cifre exacte;*
*– că utilizatorul primește o acțiune: trimite indexul real, contestă factura, schimbă furnizorul sau pune o limită
la plata automată.*

*Principiul cel mai important: **AI-ul citește, regulile decid.** Gemini doar citește factura. Verificările sunt
reguli scrise în cod, așa că fiecare cifră e exactă și explicabilă, nu inventată de un model.*

## 3. Demo: funcțiile principale (2:40–7:40)

### Clip 1 – Acasă și cele 3 stiluri (2:40–3:20) – M1

*Acesta e ecranul principal pentru octombrie: 1.001,83 lei, cu 55,9% mai mult decât în septembrie. Fiecare factură
are un semn: roșu la PPC, galben la Engie și Digi, verde la apă. Vezi imediat unde trebuie să te uiți.*

*Aceleași date, trei stiluri: **Innovative** pentru cei tineri, cu ton liber și mod întunecat; **Profesional**, cu
rapoarte și buget; și **Classic** pentru seniori, cu text mare și butoane mari. Aplicația vorbește limba fiecărui
client.*

### Clip 2 – PPC: index estimat (3:20–4:10) – M2

*PPC e roșu: am fost facturați pe un index estimat de 350 kWh, față de media noastră reală de 177. Aplicația spune
clar: „Nu plăti încă.”*

*Apăs „Trimite indexul real”, introduc indexul de pe contor, și factura se recalculează: de la 517,06 la 268,85
lei, adică 248 de lei în minus. Roșul dispare. Rămâne o atenționare galbenă: plătim peste prețul pieței. „Compară
ofertele” arată furnizori din Pago care ar fi cerut până la 39,53 lei mai puțin pe aceeași factură.*

### Clip 3 – Engie: de ce a crescut factura (4:10–4:55) – M1

*Engie a crescut cu 42,2%, dar consumul doar cu 8%. Explicația vine din regulile noastre, nu din presupuneri: prețul
energiei a crescut de la 0,55 la 0,88 lei pe kWh, adică 69,62 lei din creștere.*

*Pot atinge orice rând de pe factură. Ating TVA: AI-ul explică ce înseamnă, cu cifrele exacte ale facturii mele.
Ating „Contribuție CfD”: aflu ce e și de ce o plătesc. Răspunsurile se bazează pe o bază de cunoștințe verificată
despre reglementările din România, fiecare cu sursa ei.*

### Clip 4 – Digi și plata automată sigură (4:55–5:45) – M2

*La Digi a apărut acum șase luni „Opțiune Extra TV + Antivirus”: 15 lei pe lună, 90 de lei până acum. Un tap pe
„Renunță la opțiune” și primești scrisoarea gata de trimis.*

*Și plata automată devine sigură: „plătește singur doar sub 250 de lei, niciodată pe index estimat sau cu anomalii”.
Factura Engie de 352,53 lei e oprită, cu motivul scris: „Totalul de 352,53 lei depășește limita ta de 250,00 lei.”*

### Clip 5 – Scanare live și anomalii prinse (5:45–6:55) – M1 scanează, M2 comentează

*Acum scanăm o factură de hârtie: două poze. În câteva secunde avem toate rândurile, totalul și auditul.*

*Apoi o factură de apă „scumpă”: același consum, dar prețul apei a crescut de la 5,71 la 14,90 lei pe metru cub. Apa
era verde, acum e galbenă: „Factura a crescut cu 86%, dar consumul chiar a scăzut”, iar în istoric apare roșu.*

*Și o factură modificată de mână: cineva a crescut doar totalul cu 100 de lei. Rândurile adună 73,38 lei, dar totalul
e 173,38. Aplicația nu o acceptă orbește: o marchează „De verificat” și utilizatorul decide. Din nou: AI-ul citește,
regulile verifică matematica facturii.*

### Clip 6 – Căutare și voce (6:55–7:40) – M1

*Bara de căutare e deasupra tuturor ecranelor. Spun: „Arată-mi factura PPC din octombrie”, și factura se deschide
direct.*

*Merge și scris, în cuvintele tale: „neplătite”, „luna trecută”, „factura de lumină din septembrie”. Pentru
seniori, vocea e cel mai simplu mod de a găsi o factură.*

## 4. Funcții secundare (7:40–8:30) – M1, over clip 7

*Pe scurt, ce mai face aplicația:*
*– un furnizor la care nu mai ești client îl muți în **arhivă** cu un swipe; facturile vechi rămân;*
*– orice factură se deschide ca **PDF**, iar pozele originale se păstrează;*
*– **bugetul lunii** și data plății: „Plătită pe…”;*
*– **adaugi un furnizor nou** dintr-o factură scanată;*
*– dacă scanezi aceeași factură de două ori: „Ai scanat deja factura asta”;*
*– dacă un fișier are trei facturi, aplicația ți le numește și îți cere să le trimiți separat;*
*– iar o poză care nu e factură este refuzată politicos.*

## 5. De ce poți avea încredere (8:30–9:20) – M2

On screen, 4 bullets:
- Aplicație Expo · API Django · Gemini
- Fiecare scanare e verificată: fișiere sigure, perioadă, sume, TVA, duplicate, text care încearcă să păcălească AI-ul
- Gemini ocupat? Limită de timp + modele de rezervă
- 307 teste automate (83 backend, 224 aplicație)

*Pe scurt, sub capotă: aplicație mobilă în Expo, API în Django și Gemini pentru citire. Tot ce citește AI-ul trece
prin verificări: tipul real al fișierului, poze curățate de date GPS, perioada și luna, suma rândurilor și TVA-ul,
duplicatele. Textul de pe factură e tratat ca date, niciodată ca instrucțiuni: dacă cineva scrie pe factură „ignoră
regulile”, aplicația îl semnalează și păstrează cifrele tipărite.*

*Dacă Gemini e aglomerat, fiecare cerere are o limită de timp și trece pe un model de rezervă, iar auditul în sine
nu depinde deloc de AI. Totul e acoperit de 307 teste automate.*

## 6. Valoare pentru Pago și pașii următori (9:20–10:00) – M2

*Pentru Pago, asta înseamnă trei lucruri:*
*– **retenție**: oamenii deschid aplicația ca să afle ceva util, nu doar ca să plătească;*
*– **venit nou**: comparația de oferte duce la schimbarea furnizorului, adică la comisioane;*
*– **încredere**: plata automată devine sigură, pentru că se oprește singură la o factură suspectă.*

*Pașii următori: conectarea la datele reale din Pago, un registru de furnizori verificați și conturi pentru fiecare
utilizator.*

## 7. Echipa: cine ce a făcut (10:00–10:45) – M1 + M2

Fill in the names.

*M1 – [Nume]: aplicația mobilă: cele trei stiluri, scanarea cu camera, ecranele de audit, căutarea și vocea în
aplicație, arhiva, plus peste 200 de teste ale aplicației.*

*M2 – [Nume]: backend-ul: API-ul, regulile de audit, citirea facturilor cu Gemini, verificarea fiecărei scanări,
căutarea și vocea pe server, datele demo și baza de cunoștințe verificată.*

*Am lucrat cu Claude Code ca un al treilea coleg: ne-a ajutat să planificăm, să scriem codul și testele și să
verificăm faptele despre TVA și tarife. Contractul dintre aplicație și server l-am scris primul, așa că am putut
lucra în paralel. Vă mulțumim, așteptăm întrebările voastre!*

---

## 8. Întrebări – răspunsuri pregătite

**Cât de precis e AI-ul? Ce se întâmplă când greșește?**
*Gemini doar citește. Verificăm că rândurile adună totalul, cota de TVA, perioada și anul. Dacă cifrele nu se
potrivesc, recitim factura ca imagine, iar dacă tot nu se potrivesc, factura e marcată „De verificat”, nu acceptată
orbește. Pe facturile demo citirea e exactă la ban.*

**Ce faceți cu datele personale?**
*În MVP folosim date demo. Întrebările către AI nu conțin codul de client sau adresa: le scoatem înainte de trimitere.
În producție: API plătit, fără antrenare pe date, regiune UE și ștergerea originalelor după o perioadă stabilită.*

**Cât de repede e și cât costă o scanare?**
*Un PDF cu text: 2–3 secunde. Pozele: 10–30 de secunde, în funcție de încărcarea Gemini. Folosim modele „lite”,
cele mai ieftine, iar aceeași factură trimisă din nou se deschide instant, din cache.*

**Ce se întâmplă dacă Gemini nu răspunde?**
*Fiecare cerere are o limită de timp și modele de rezervă, iar utilizatorul primește un mesaj clar. Auditul,
istoricul, plata și căutarea scrisă funcționează fără AI.*

**De ce nu un OCR clasic?**
*Fiecare furnizor are alt format. Modelul aduce orice factură în aceeași structură, fără șabloane per furnizor, iar
regulile noastre verifică rezultatul. Pentru PDF-uri cu text citim textul direct: e mai rapid și mai exact.*

**Cum ajunge la toți furnizorii?**
*Nu avem șabloane per furnizor: orice factură e citită la fel. Pasul următor e un registru de furnizori cu CUI
verificat.*

**Cum câștigă Pago bani din asta?**
*Comisioane din schimbarea furnizorului, mai mulți utilizatori activi lunar și o funcție premium de plată automată
sigură.*

**Ce e real și ce e demo?**
*Datele de 12 luni și ofertele sunt fictive, pentru demo. Scanarea funcționează pe facturi reale, am testat-o pe
facturile noastre. Faptele despre TVA, tarife și plafonări sunt reale și au sursa notată.*

**Și facturile falsificate?**
*Dacă cineva modifică doar totalul, suma rândurilor nu mai bate și factura ajunge „De verificat”, ca în demo.*

---

## Clips (production notes)

**Before recording:** in `backend/`:
```bash
python manage.py seed_demo
python manage.py make_sample_pdfs
python manage.py prewarm_cache ../samples/*
python manage.py dev --keep
```
Then:
- record the phone screen (Expo Go) in portrait, with notifications off;
- cut each clip to its length;
- name the clips `01_acasa.mp4` … `07_extra.mp4`.

| Clip | Length | Steps |
|---|---|---|
| 1 | ~35 s | Acasă, October → donut and badges → switch the mode Innovative → Profesional → Classic |
| 2 | ~45 s | Open PPC → "Index estimat" card → "Trimite indexul real" → enter old index + 182 → new total 268,85 → "Compară ofertele" |
| 3 | ~40 s | Open Engie → anomaly card → tap the TVA line → answer → tap "Contribuție CfD" → answer |
| 4 | ~45 s | Furnizori → Digi → "Opțiune plătită" → "Renunță la opțiune" → letter; Engie → Auto-Pay rule max 250 → simulate → blocked with the reason |
| 5 | ~65 s | Scan → 2 photos `demo_ppc_part1.jpg` + `demo_ppc_part2.jpg` → result; scan `demo_apa_brasov_2026_10_scumpa.pdf` → Apă turns 🟡 + Furnizori → Apa Brasov history 🔴; scan `demo_apa_brasov_2026_09_modificata.pdf` → "De verificat" |
| 6 | ~40 s | Mic in the search bar → say "Arată-mi factura PPC din octombrie" → the bill opens; type "neplătite" → list |
| 7 | ~50 s | 5–7 s each: swipe to archive Digi (then bring it back); "Vezi factura (PDF)"; set the budget; add a provider; pay a bill → "Plătită pe…"; scan the same PDF twice → "Ai scanat deja"; a PDF with 3 bills → refused; a random photo → "Nu pare o factură" |

**Gotchas (from testing on 17 Nov):**
- Clip 2 changes the PPC bill, and clip 5 adds scans. Run `seed_demo` again before re-recording any clip.
- Scan `..._scumpa.pdf` before the original `demo_apa_brasov_2026_10.pdf`, never after it: they share a bill number,
  so the second one gets 409.
- In the voice clip say "PPC", not "lumină": Engie and PPC are both electricity, so "lumină octombrie" shows a list of
  2 instead of opening one bill.
- Clip 7's "3 bills in one PDF": merge 3 demo PDFs into one file beforehand, then prewarm it, so it's instant.
- Before recording, run `python manage.py ai_check --models`. If every model answers 429/503, wait or switch the key.
  Clip 5 is instant from the cache anyway.

**Backup:** one screenshot of each clip's final screen, in the same folder, in case a video doesn't play.

**Rehearsal:** read the script aloud with a timer at least once. The total must be ≤ 10:45 before questions. In
Romanian, about 130 words per minute is a calm pace: if a part runs long, cut sentences, not speed.
