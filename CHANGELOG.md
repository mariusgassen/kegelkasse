# Changelog

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
