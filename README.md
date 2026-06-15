# Inca Treasure

**CID:** Add your CID here before submitting.

This is a browser version of an Incan Gold / Diamant style treasure game. The
player explores a cave over five rounds, collects gems, decides whether to keep
going or return to camp, and tries not to get caught by a repeated danger card.

The game logic is separated from the page code. The rules are in
`web-app/IncaTreasure.js`, while `web-app/main.js` draws the screen, handles
buttons and runs the small animations.

This structure makes the rules easier to test. If the design changes later, the
scoring and card rules stay in the same place.

## Files to check

- `web-app/index.html` - the page structure.
- `web-app/default.css` - the layout, board and visual style.
- `web-app/main.js` - browser code and UI state.
- `web-app/IncaTreasure.js` - reusable game module with JSDoc comments.
- `web-app/tests/IncaTreasure.test.js` - Mocha tests for the rules.
- `web-app/tests/TEST-SPECIFICATION.md` - short test plan.

The image assets are in `web-app/assets/`, including the tutorial
screenshots used on the How To Play page.

## Coursework checklist

- [x] API module included in `web-app/IncaTreasure.js`.
- [x] `jsdoc.json` points to the API module.
- [x] JSDoc generated in `docs/`.
- [x] Game module implemented and usable without the page.
- [x] Unit test specification included in `web-app/tests/`.
- [x] Mocha unit tests implemented.
- [x] Web app implemented in `web-app/index.html`, `default.css` and `main.js`.
- [x] `node_modules/` ignored by `.gitignore`.

## How to run it

Install the packages once:

```properties
npm install
```

Then run the checks:

```properties
npm test
npm run docs
npm run lint
```

To play the game, open `web-app/index.html` in the browser. If the browser blocks
local files, use a small local server from the project folder.

## Rules module

The public functions intended for marking are:

- `createPlayers(options)`
- `createRoundDeck(options)`
- `preparePlayersForRound(players)`
- `distributeTreasure(players, card)`
- `settleReturningPlayers(players, revealed, leavingIds)`
- `failRound(players, dangerPool, dangerName)`
- `chooseBotAction(player, context)`
- `scorePlayer(player)`
- `rankPlayers(players)`

These functions are kept away from the DOM so they can be tested without opening
the game page. The generated JSDoc pages are written to `docs/` after running
`npm run docs`.

Relics use this version's rule: the printed relic number is multiplied by 10, so
relic 5 is worth 50 points.
