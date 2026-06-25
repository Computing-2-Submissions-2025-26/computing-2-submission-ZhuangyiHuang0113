# Unit Test Specification

This file lists the rule checks for `GreedyLittleExplorers.js`. The browser
buttons, artwork, audio and animations are not tested here. The tests focus on
the plain JavaScript rule API, using small game states as input and checking the
returned game state.

The test suite follows the same style as the teacher's `Connect4` example: it
uses helper functions that throw when a game state becomes invalid, then calls
those helpers after rule functions run.

## Shared state invariants

The tests define reusable validators for the main data types.

- `throwIfInvalidPlayers(players)` checks that:
  - the value is an array of explorer objects;
  - every explorer has a unique stable `id`;
  - `name` and `color` are non-empty strings;
  - `tent`, `wallet` and `roundLoot` are non-negative integers;
  - `artifacts` is an array of valid relic records;
  - `active`, `dropped` and `isBot` are booleans;
  - `choice` is either `"continue"`, `"leave"` or `null`;
  - a dropped explorer is not active.
- `throwIfInvalidCard(card)` checks that:
  - every card has one of the valid types: treasure, danger or artifact;
  - treasure cards use one of the printed treasure values and have valid
    `leftover` and `collected` fields;
  - danger cards use one of the known danger names;
  - artifact cards use a valid artifact number, have the matching point value,
    and have a boolean `claimed` field.
- `throwIfInvalidRoute(route)` checks every revealed card or generated deck.
- `throwIfInvalidDangerPool(pool)` checks that every danger count is an integer
  between 0 and 3.

## Player setup and utility API

- A newly-created bot game is a valid player state.
  - Input: `createPlayers()`.
  - Expected result: four valid explorers, with only the three non-human players
    marked as bots.
- Local multiplayer creates valid named players.
  - Input: local mode with three players and two supplied names.
  - Expected result: the third name falls back to `PLAYER 3`, and no local player
    is a bot.
- Shuffle returns a new ordered copy and does not mutate the original array.
  - Input: `[1, 2, 3, 4]` with fixed randomness.
  - Expected result: the source remains unchanged and the returned order is
    deterministic.

## Round setup

- Starting a round charges every active explorer one deposit and resets round
  state.
  - Input: a player carrying loot, inactive and with a pending choice.
  - Expected result: every explorer has one fewer tent point and wallet gem,
    carried loot becomes 0, everyone is active, and choice is reset to `null`.
- Dropped explorers stay out of future rounds.
  - Input: one explorer already has `dropped` set to true.
  - Expected result: that explorer stays inactive, does not pay another deposit,
    and carried loot is cleared.
- Final-round explorers who cannot pay are dropped.
  - Input: round 5 and an explorer with `tent` equal to 0.
  - Expected result: that explorer is inactive and dropped, without losing more
    tent score.
- A full round deck is valid and has the expected counts.
  - Input: full danger pool and artifact number 4.
  - Expected result: 31 valid cards: 15 treasures, 15 dangers and one relic worth
    40 points.
- Removed danger types and omitted relics are respected.
  - Input: a reduced danger pool and `artifactNumber: null`.
  - Expected result: only remaining dangers are included and no relic card is
    present.

## Treasure distribution

- Treasure is added to the public route pool, not directly to explorers.
  - Input: four explorers and a treasure card worth 15.
  - Expected result: every explorer still has 0 carried loot, the card has 15
    leftover, and the input card is not mutated.
- Existing route treasure keeps accumulating.
  - Input: an 11-value treasure card already showing 4 leftover.
  - Expected result: the card's leftover becomes 15.
- Revisiting a treasure card adds the printed value again.
  - Input: a 7-value treasure card resolved twice.
  - Expected result: leftover becomes 14.
- Non-treasure cards are ignored by the treasure distribution function.
  - Input: a danger card and a player carrying loot.
  - Expected result: the card and carried loot are unchanged.

## Returning to camp

- If nobody returns, route treasure and relics stay in place.
  - Input: an empty `leavingIds` list.
  - Expected result: cloned valid players and route cards with the same values,
    and no claimed relics.
- A returning explorer secures carried loot, route leftovers and the returned
  deposit.
  - Input: one explorer carrying 8 loot with 3 treasure left on the route.
  - Expected result: tent score increases by 12 total and the route treasure is
    removed.
- Exactly one returning explorer can claim unclaimed relics.
  - Input: one explorer returns while relic number 3 is open.
  - Expected result: the explorer gains 30 relic points, the relic is stored in
    the explorer's artifact list, and the route relic becomes claimed.
- A group returning together cannot claim relics.
  - Input: two explorers return while the same relic is open.
  - Expected result: no relic is added to either artifact list.
- Multiple returning explorers split the whole route pool and leave only the
  global remainder.
  - Input: two explorers return while treasure cards have 4 and 7 leftover.
  - Expected result: both gain 5 route treasure, and 1 point remains visible.
- Every one-player and two-player exit group from a sample state produces a
  valid state.
  - Input: three explorers with different carried loot values and a route with
    two treasure cards plus one relic.
  - Expected result: each generated settlement has valid players, valid route
    cards, correct treasure remainder, correct returned deposits and correct
    solo relic behaviour.
- Already claimed relics cannot be claimed again.
  - Input: one explorer returns while a claimed relic is on the route.
  - Expected result: no relic points or artifact record are added.

## Duplicate danger

- Duplicate danger removes carried loot only from explorers still inside the
  cave.
  - Input: one inactive explorer and one active explorer with carried loot.
  - Expected result: the inactive explorer keeps their previous carried value,
    while active explorers lose carried loot and become inactive.
- The first failure for each danger type removes that type from the pool.
  - Input: each danger name is failed once in a separate test iteration.
  - Expected result: that danger count becomes 0 and the removed list records the
    failed type.
- The danger removal cap is enforced.
  - Input: two danger types already removed, then a third danger fails.
  - Expected result: the third danger still ends the round, but its pool count is
    not removed.
- A danger type already in the removed list is not duplicated.
  - Input: FIRE already removed, then FIRE fails again.
  - Expected result: the removed list remains `['FIRE']`.

## Bot choices

- A bot leaves when the deterministic risk score is above the random value.
  - Input: high carried loot, visible danger pressure, a relic on the board,
    final round and fixed random value 0.
  - Expected result: the returned choice is `"leave"`.
- A bot continues when risk is low and the random value is high.
  - Input: no danger pressure, no relic, early round and fixed random value 0.99.
  - Expected result: the returned choice is `"continue"`.

## Final scoring and ranking

- Final score uses tent points and ignores wallet gems.
  - Input: two explorers where one has more wallet but fewer tent points.
  - Expected result: the explorer with the higher tent score ranks first.
- Relic count breaks a score tie.
  - Input: two explorers with equal tent scores and only one artifact record.
  - Expected result: the explorer with the relic ranks first.
- Ranking sorts a copy and does not mutate the original player order.
  - Input: two explorers passed to `rankPlayers`.
  - Expected result: returned ranking is sorted, but the original array order is
    unchanged.
