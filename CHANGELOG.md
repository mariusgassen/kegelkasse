# Changelog

## [1.75.0](https://github.com/mariusgassen/kegelkasse/compare/v1.74.0...v1.75.0) (2026-11-14)


### Features

* add charts tab to the Kasse with waterfall, treemap, Sankey and donut ([#590](https://github.com/mariusgassen/kegelkasse/issues/590)) ([779c6ff](https://github.com/mariusgassen/kegelkasse/commit/779c6ffbf114c9a28621b1617907af285d4bec27))
* editable roadmap versions, completed items pin the deployed version ([#582](https://github.com/mariusgassen/kegelkasse/issues/582)) ([186b8c6](https://github.com/mariusgassen/kegelkasse/commit/186b8c6011141e04c269399187d2673ef83a489e))
* **evening:** Live-Abend zeigt Rangliste, Strafen-Kurve und Spielstand; Protokoll mit Spiel-Farben ([0215ba2](https://github.com/mariusgassen/kegelkasse/commit/0215ba2b2c02bbfde8c2aba18da149889dda2dee))
* **evening:** Schnellerfassung zeigt Zähler, Balken, Aufleuchten und Getränke-Zeitleiste ([f41841b](https://github.com/mariusgassen/kegelkasse/commit/f41841b94d4e7ba5a60999edaf039e10748de016))
* Excel-Blatt Strafen nach Abend je Abend gruppiert ([90f12ed](https://github.com/mariusgassen/kegelkasse/commit/90f12ed4db3ea0971d9b4c500ef16a5307e3ab1c))
* Kasse mit Stichtag, Monatsständen, korrektem Saldo und Vereinsausgabe beim Bearbeiten ([#596](https://github.com/mariusgassen/kegelkasse/issues/596)) ([c951c7f](https://github.com/mariusgassen/kegelkasse/commit/c951c7f9a61ab5830c31f69d5682ca2bf20cb883))
* Kasse zeigt Balken neben den Zahlen und animierte Diagramme ([139c0c1](https://github.com/mariusgassen/kegelkasse/commit/139c0c1ca7039289c35311746711c195ac56e875))
* Kassenbericht listet auch offene Strafen von Gästen ([de91838](https://github.com/mariusgassen/kegelkasse/commit/de918382cf96e533c2b39af43ab7a1e316a6c41f))
* Konten pro Monat im Kassenbericht mit Monaten als Spalten ([36bd4f8](https://github.com/mariusgassen/kegelkasse/commit/36bd4f8783aac07a7a95c8f783e7c56647726727))
* Live-Insel für den laufenden Abend ([#608](https://github.com/mariusgassen/kegelkasse/issues/608)) ([1d90780](https://github.com/mariusgassen/kegelkasse/commit/1d90780a22313613e6b7ed4a5fc2d403df909289))
* **roadmap:** add comments, tag/pin/duplicate management, and product manager role ([#573](https://github.com/mariusgassen/kegelkasse/issues/573)) ([c54c47f](https://github.com/mariusgassen/kegelkasse/commit/c54c47f0180faad3fe0e6cb403c0709bdc76d243))
* show guest nicknames and disambiguate duplicate names ([b3d848c](https://github.com/mariusgassen/kegelkasse/commit/b3d848c7ce94ecb2479b47912b68d92ebeb54e9b))
* version pills for roadmap filtering and autocomplete ([#584](https://github.com/mariusgassen/kegelkasse/issues/584)) ([4fcf5da](https://github.com/mariusgassen/kegelkasse/commit/4fcf5da4f488ead3e5c3469d620b00bce85c641f))


### Bug Fixes

* Buchungs-Aktionen in der Kasse im ⋮-Menü statt als Icon-Paar ([#598](https://github.com/mariusgassen/kegelkasse/issues/598)) ([0fec32e](https://github.com/mariusgassen/kegelkasse/commit/0fec32e1049e5a83198f12b4f7de98df5d49588f))
* club exit write-off no longer counts as a deposit in the Kasse ([#587](https://github.com/mariusgassen/kegelkasse/issues/587)) ([c4b8e6c](https://github.com/mariusgassen/kegelkasse/commit/c4b8e6c8e7ffdb5449f2bc95b26ac5dfd31e4f0b))
* **evening:** Spiel-Farben als feste Token-Liste ([0e54008](https://github.com/mariusgassen/kegelkasse/commit/0e540089b9abab07f45c410cff35303e5b03fed6))
* harden community roadmap permissions, validation and notifications ([#577](https://github.com/mariusgassen/kegelkasse/issues/577)) ([132e6e8](https://github.com/mariusgassen/kegelkasse/commit/132e6e82de9bfc9bb66fe26de9ca8a7f0c9d9193))
* Insights-Tab stürzte beim Öffnen ab ([#595](https://github.com/mariusgassen/kegelkasse/issues/595)) ([436dc14](https://github.com/mariusgassen/kegelkasse/commit/436dc1484e2ab4d8b10f49864b4ce0f4b98c441f))
* Kassenbericht nutzt das gesetzte Buchungsdatum statt des Erstelldatums ([a44eaea](https://github.com/mariusgassen/kegelkasse/commit/a44eaea6efdac5f84d7e8d5c7adfd141b804de10))
* keep bottom sheets (incl. global search) above the on-screen keyboard ([#580](https://github.com/mariusgassen/kegelkasse/issues/580)) ([88b77dc](https://github.com/mariusgassen/kegelkasse/commit/88b77dc832f867542cf8c99e1135a6f27aa4b669))
* Monatsstände zeigen auch ruhige Monate und klappen ältere Monate ein ([#602](https://github.com/mariusgassen/kegelkasse/issues/602)) ([3a85ba9](https://github.com/mariusgassen/kegelkasse/commit/3a85ba9c5e935325746bb7cd7a626752dd065f67))
* Offene Strafen im PDF-Kassenbericht markieren und separat auflisten ([01c04f9](https://github.com/mariusgassen/kegelkasse/commit/01c04f971cc1cd07b6cb86cc60c049e76c0a6abf))
* Offene Strafen im PDF-Kassenbericht markieren und separat auflisten ([#597](https://github.com/mariusgassen/kegelkasse/issues/597)) ([2c98771](https://github.com/mariusgassen/kegelkasse/commit/2c987714f1122c6f91ca12b8d73178915d90e456))
* PDF-Bericht mit korrektem Kassenstand, Gäste-Deckel erst ab Austritt, Buchungen je Monat und Strafen-Matrix ([#600](https://github.com/mariusgassen/kegelkasse/issues/600)) ([e07d9a3](https://github.com/mariusgassen/kegelkasse/commit/e07d9a3a010f33b6dc7c619b9acd1e4cc19d42d3))
* PDF-Kassenbericht übersichtlicher mit Vereinslogo, Farben und korrekten Gäste-Beträgen ([#593](https://github.com/mariusgassen/kegelkasse/issues/593)) ([2296d2f](https://github.com/mariusgassen/kegelkasse/commit/2296d2ff39d816b109ad5bae81a2b0f13322f8a7))
* Pins nicht mitgebracht ist eine Strafe pro Spieler statt pro Pin ([bbd151f](https://github.com/mariusgassen/kegelkasse/commit/bbd151f0f6bb27ae543b2d6d6683968f9fa7cd52))
* **roadmap:** add migration 073 for tags/roles and support multiple roles per user ([#574](https://github.com/mariusgassen/kegelkasse/issues/574)) ([9ae536b](https://github.com/mariusgassen/kegelkasse/commit/9ae536bef5b57fca5f015ee60e1c66f45b0de806))
* shorten the projected cash label in the Kasse ([#599](https://github.com/mariusgassen/kegelkasse/issues/599)) ([068c08a](https://github.com/mariusgassen/kegelkasse/commit/068c08a826d5dcd5445c450030413a858b598897))
* **stickers:** fit map view to screen without vertical scrolling ([#571](https://github.com/mariusgassen/kegelkasse/issues/571)) ([6e5b29a](https://github.com/mariusgassen/kegelkasse/commit/6e5b29a22bf6a942de9d1487b48524121e473579))
* **treasury:** Insights-Diagramme ohne Y-Achsen, Wasserfall ab 0 ([0c733ca](https://github.com/mariusgassen/kegelkasse/commit/0c733ca93b84bfa4ed9dbf5997c19b8b572a3a7f))
* **treasury:** Insights-Diagramme per Antippen auswählen, Kassenverlauf mit Achsen ([64c9cbb](https://github.com/mariusgassen/kegelkasse/commit/64c9cbbc89405a4bade43198c2314b96bed46ced))
* **treasury:** polish the PDF report — signs, colours, columns, logo, guest cap ([82ed8cb](https://github.com/mariusgassen/kegelkasse/commit/82ed8cb75d9d93fd11efa6f918d0442106198c68))

## [1.74.0](https://github.com/mariusgassen/kegelkasse/compare/v1.73.0...v1.74.0) (2026-11-11)


### Features

* **roadmap:** refine 2.0 roadmap into an interactive community-driven feature ([#537](https://github.com/mariusgassen/kegelkasse/issues/537)) ([852e5dc](https://github.com/mariusgassen/kegelkasse/commit/852e5dc1ddb44aa69dfc2bd7f1a227633ec67a33))
* **stickers:** allow club admin to configure map style matching club colors ([#567](https://github.com/mariusgassen/kegelkasse/issues/567)) ([c7178ac](https://github.com/mariusgassen/kegelkasse/commit/c7178ac9eae669a67162613989618c4214c3622f))


### Bug Fixes

* **club:** save map style immediately upon selection and flag extra JSON modified ([#570](https://github.com/mariusgassen/kegelkasse/issues/570)) ([77d11b9](https://github.com/mariusgassen/kegelkasse/commit/77d11b99b3ae69d2bc49551eb321a8baf299ee13))
* **search:** link stickers from AI answers and match sticker keywords in global search ([#566](https://github.com/mariusgassen/kegelkasse/issues/566)) ([bb60b46](https://github.com/mariusgassen/kegelkasse/commit/bb60b46605c90f7c1d4539c162ee20290eb4c55d))
* **ui:** prevent pull-to-refresh when dragging or scrolling on maps ([#569](https://github.com/mariusgassen/kegelkasse/issues/569)) ([781adb7](https://github.com/mariusgassen/kegelkasse/commit/781adb72b762dc5373c7633d57da45e194f44e78))

## [1.73.0](https://github.com/mariusgassen/kegelkasse/compare/v1.72.0...v1.73.0) (2026-11-11)


### Features

* ask to enable notifications on first launch ([#541](https://github.com/mariusgassen/kegelkasse/issues/541)) ([049f7a8](https://github.com/mariusgassen/kegelkasse/commit/049f7a8238360e740cfcb9381afb13e8cf6780e5))
* faster sticker photos with blurred placeholders, reorder, split posts, feed search and zoom-based map clusters ([#551](https://github.com/mariusgassen/kegelkasse/issues/551)) ([e029595](https://github.com/mariusgassen/kegelkasse/commit/e02959532f01f27ff8ed43f75d21d2efc4151f8c))
* find stickers in search and link them from AI answers ([#546](https://github.com/mariusgassen/kegelkasse/issues/546)) ([d3a5bdc](https://github.com/mariusgassen/kegelkasse/commit/d3a5bdc260338a4f9d9771fa824eec0ae51400ba))
* link the component book from profile settings and add a shared Switch ([#552](https://github.com/mariusgassen/kegelkasse/issues/552)) ([02c60d2](https://github.com/mariusgassen/kegelkasse/commit/02c60d2635271b32069793c9484a26eafbf18239))
* prefill sticker place and date from the photo, add sticker notifications and digest section ([#542](https://github.com/mariusgassen/kegelkasse/issues/542)) ([f10812a](https://github.com/mariusgassen/kegelkasse/commit/f10812a30ea467a661c0298ce3c3240465ac46b0))
* **schedule:** merge guests and display before evening start ([#561](https://github.com/mariusgassen/kegelkasse/issues/561)) ([abc5236](https://github.com/mariusgassen/kegelkasse/commit/abc5236550fa4b9b0b4459df6d0b5f6f487494be))
* several photos per sticker with a photo picker, basic editor and photo pins on the map ([#548](https://github.com/mariusgassen/kegelkasse/issues/548)) ([fc6fd5c](https://github.com/mariusgassen/kegelkasse/commit/fc6fd5c7613feebdd1ba1aacb9857e7a95831920))
* **stickers:** proxy CARTO tiles on the backend using CARTO_API_KEY ([#564](https://github.com/mariusgassen/kegelkasse/issues/564)) ([fc22b96](https://github.com/mariusgassen/kegelkasse/commit/fc22b96ace7a9f4ce551bcd27816cb2b1c670f06))
* **ui:** show skeleton placeholders instead of loading text ([#562](https://github.com/mariusgassen/kegelkasse/issues/562)) ([458f0a0](https://github.com/mariusgassen/kegelkasse/commit/458f0a0b69171bc768c18a12b6bee644f0f7d102))


### Bug Fixes

* count members without RSVP as attending for the next evening ([#553](https://github.com/mariusgassen/kegelkasse/issues/553)) ([8b7804c](https://github.com/mariusgassen/kegelkasse/commit/8b7804cbdf4e0cb06866a018dfa602d6d63db114))
* installed app now checks for new versions on its own ([#545](https://github.com/mariusgassen/kegelkasse/issues/545)) ([52e8879](https://github.com/mariusgassen/kegelkasse/commit/52e887963d9c81bee9fb9b1133cf45ba8c4c7a89))
* keep the sticker map beneath the new-sticker sheet ([#556](https://github.com/mariusgassen/kegelkasse/issues/556)) ([ef1f75f](https://github.com/mariusgassen/kegelkasse/commit/ef1f75f3f61a34531a7180d9dac137d43e203671))
* open documentation links from search in the system browser ([#547](https://github.com/mariusgassen/kegelkasse/issues/547)) ([b1d97ac](https://github.com/mariusgassen/kegelkasse/commit/b1d97acba8698057c468f31b77b5428db90641fd))
* show expired and decided guest requests only as a small collapsed line ([#543](https://github.com/mariusgassen/kegelkasse/issues/543)) ([a734fe6](https://github.com/mariusgassen/kegelkasse/commit/a734fe60094cd49514757cf07374e5c4ab7fff33))
* show settled guest requests as a plain '+ N settled' line and keep the heading ([#550](https://github.com/mariusgassen/kegelkasse/issues/550)) ([3960c31](https://github.com/mariusgassen/kegelkasse/commit/3960c313293f3949e63517430cf699a283c5be25))
* sticker photo viewer sharing, swiping and faster photo loading ([#554](https://github.com/mariusgassen/kegelkasse/issues/554)) ([40ee44e](https://github.com/mariusgassen/kegelkasse/commit/40ee44e2a0449a768c9d1a2643fbdcea72e35ae4))
* **stickers:** forward client Referer & ?key= to CARTO tile proxy and hide map footer ([#565](https://github.com/mariusgassen/kegelkasse/issues/565)) ([e3b3be7](https://github.com/mariusgassen/kegelkasse/commit/e3b3be7bf0bda227bcc60f394b89944963cb90c3))
* **stickers:** per-photo split place, deep-link scroll, &gt;5 upload, CARTO tiles and poster filter ([#563](https://github.com/mariusgassen/kegelkasse/issues/563)) ([2f16e54](https://github.com/mariusgassen/kegelkasse/commit/2f16e54d84a66938d4b66b5d18ade24a08d17ee5))


### Performance

* load sticker photos faster with paged feed, srcset, preloading and a photo cache ([#557](https://github.com/mariusgassen/kegelkasse/issues/557)) ([dc5ce30](https://github.com/mariusgassen/kegelkasse/commit/dc5ce3005b5a69e88ed2d1d54b0ae36f3fd72229))


### Dependencies

* bump the production-dependencies group in /backend with 5 updates ([#560](https://github.com/mariusgassen/kegelkasse/issues/560)) ([e674c39](https://github.com/mariusgassen/kegelkasse/commit/e674c39f2cc842ddeecdf4bb79f092f3e7664270))
* bump the production-dependencies group in /frontend with 3 updates ([#559](https://github.com/mariusgassen/kegelkasse/issues/559)) ([6b3e02f](https://github.com/mariusgassen/kegelkasse/commit/6b3e02fc8c892a0b14825ea16cab29e5b357ae2f))

## [1.72.0](https://github.com/mariusgassen/kegelkasse/compare/v1.71.0...v1.72.0) (2026-11-06)


### Features

* add Zeugwart inventory for stickers, pins, shirts and more ([#540](https://github.com/mariusgassen/kegelkasse/issues/540)) ([2b0c586](https://github.com/mariusgassen/kegelkasse/commit/2b0c586bd4d5ab4db892cbf915baefcfe1cbc1d6))
* **ai:** ask the search questions about the club and the app ([#532](https://github.com/mariusgassen/kegelkasse/issues/532)) ([625282f](https://github.com/mariusgassen/kegelkasse/commit/625282f78485a4275e1cb8fb94c2902af7e23691))
* club logo as app icon for all members ([#529](https://github.com/mariusgassen/kegelkasse/issues/529)) ([29f725a](https://github.com/mariusgassen/kegelkasse/commit/29f725ae64119812fb5bfb4d1e118efc6a798d0f))
* sticker wall with feed and world map ([#539](https://github.com/mariusgassen/kegelkasse/issues/539)) ([2d0b452](https://github.com/mariusgassen/kegelkasse/commit/2d0b452460f11311ddfdee3d09f3da36fa628cb9))
* store photos, logos and avatars in Garage (S3) ([#524](https://github.com/mariusgassen/kegelkasse/issues/524)) ([626e6f2](https://github.com/mariusgassen/kegelkasse/commit/626e6f24acf54dd979d3f0c00d2bee81896b8884))


### Bug Fixes

* do not expose Garage ports ([#528](https://github.com/mariusgassen/kegelkasse/issues/528)) ([de1c267](https://github.com/mariusgassen/kegelkasse/commit/de1c26785e473d15eee8f9442c08b918f0ade07c))
* keep real names out of AI Kegelname suggestions ([#535](https://github.com/mariusgassen/kegelkasse/issues/535)) ([a566237](https://github.com/mariusgassen/kegelkasse/commit/a566237154f98c93437f856fbf4fe924febfe6c4))
* keep search query and AI answer when reopening search after following a link ([#538](https://github.com/mariusgassen/kegelkasse/issues/538)) ([3ab794d](https://github.com/mariusgassen/kegelkasse/commit/3ab794da4dac068e503875d5518b1882ea108fec))
* media migration script runs from the container shell, Garage gets a healthcheck ([#531](https://github.com/mariusgassen/kegelkasse/issues/531)) ([d4ab5a2](https://github.com/mariusgassen/kegelkasse/commit/d4ab5a20f29d64d28e557913952a5f78c5157d70))
* open docs and API docs in the browser from the installed app ([#530](https://github.com/mariusgassen/kegelkasse/issues/530)) ([8e9ac15](https://github.com/mariusgassen/kegelkasse/commit/8e9ac15218f7da750ad5e7c22aa1a01bccf721f3))
* tuck guest requests for past evenings into a collapsed card ([#536](https://github.com/mariusgassen/kegelkasse/issues/536)) ([974d19c](https://github.com/mariusgassen/kegelkasse/commit/974d19c3d9a52ebe421037d8c3be41ea2b6dbd2c))

## [1.71.0](https://github.com/mariusgassen/kegelkasse/compare/v1.70.1...v1.71.0) (2026-11-06)


### Features

* KI-Rückblick erkennt Gäste ([#521](https://github.com/mariusgassen/kegelkasse/issues/521)) ([8dbb539](https://github.com/mariusgassen/kegelkasse/commit/8dbb53963466f8d0cbcfbcdf27b6ecc6d9a9e70f))
* **push:** optional notification when a new app version is out ([#522](https://github.com/mariusgassen/kegelkasse/issues/522)) ([9c5e130](https://github.com/mariusgassen/kegelkasse/commit/9c5e130f1c32f97a28362bc7170fd9a72199e466))

## [1.70.1](https://github.com/mariusgassen/kegelkasse/compare/v1.70.0...v1.70.1) (2026-11-06)


### Bug Fixes

* **ai:** give evening recaps teams and club history and stop invented highlights ([#520](https://github.com/mariusgassen/kegelkasse/issues/520)) ([d1d06e3](https://github.com/mariusgassen/kegelkasse/commit/d1d06e30825b3bb86f7e518e71333c2fa4867cba))
* **ai:** show AI recaps and news posts with Markdown formatting ([#519](https://github.com/mariusgassen/kegelkasse/issues/519)) ([fc72708](https://github.com/mariusgassen/kegelkasse/commit/fc72708b539e6542126ed240f343e752bca4953a))


### Dependencies

* bump python-multipart ([#516](https://github.com/mariusgassen/kegelkasse/issues/516)) ([bd227d5](https://github.com/mariusgassen/kegelkasse/commit/bd227d52c02ca72c838abe881e31f753aa6a5b97))
* bump the production-dependencies group across 1 directory with 2 updates ([#514](https://github.com/mariusgassen/kegelkasse/issues/514)) ([226de31](https://github.com/mariusgassen/kegelkasse/commit/226de3145240be904dffb69056a87a4e248ee429))

## [1.70.0](https://github.com/mariusgassen/kegelkasse/compare/v1.69.0...v1.70.0) (2026-11-05)


### Features

* announce new releases once with a banner linking to What's new ([0922fda](https://github.com/mariusgassen/kegelkasse/commit/0922fda7fa49a39df24701a83b8919035cfbccc6))
* show release notes in the app as "What's new" and enforce conventional PR titles ([5332573](https://github.com/mariusgassen/kegelkasse/commit/53325733b6be458177a6e91a221c6021f2c91b95))
