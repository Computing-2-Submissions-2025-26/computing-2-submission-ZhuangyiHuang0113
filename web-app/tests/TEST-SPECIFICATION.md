# Unit Test Specification

This file lists the rule checks planned for `TempleTreasure.js`. The browser
buttons and animations are not tested here. The aim is to check the game-rule
functions directly, using small pieces of game state as input and comparing the
returned state with the expected result.

## Round setup

- A new round charges each explorer one deposit, resets carried loot and puts
  everyone back into the cave.
  - Input: one explorer already has carried loot and is marked inactive.
  - Expected result: wallet goes from 4 to 3, carried loot becomes 0, and the
    explorer is active again.
- A normal round deck has 15 treasure cards, 15 danger cards and one relic with
  the correct value.
  - Input: a full danger pool and relic number 4.
  - Expected result: the deck has 31 cards in total, including 15 treasure cards
    and a relic worth 40 points.
- A player who quit the whole match should not be brought back by a later round.
  - Input: one explorer has `dropped` set to true.
  - Expected result: that explorer stays inactive and does not pay another
    deposit.

## Treasure distribution

- Treasure value 15 is added to the public route pool instead of being given to
  explorers immediately.
  - Input: four active explorers and a treasure card worth 15.
  - Expected result: each explorer still has 0 round loot, the card leftover is
    15, and the card is not marked collected.
- Revisiting a treasure card can add that card's value to the route pool again.
  - Input: a treasure card worth 7 is resolved twice.
  - Expected result: the card leftover becomes 14.
- Treasure already on a route card keeps accumulating.
  - Input: a treasure card worth 11 already has 4 leftover.
  - Expected result: the card leftover becomes 15.

## Returning to camp

- A returning explorer secures carried loot, route leftovers and deposit.
  - Input: one explorer returns while carrying 8 loot, with 3 leftover treasure
    on the route.
  - Expected result: the explorer's tent gains 12 points: 8 loot, 3 leftover
    treasure and 1 returned deposit.
- Multiple returning explorers split all route leftovers evenly, with any
  indivisible remainder staying on the route.
  - Input: two explorers return while treasure cards have 4 and 7 leftover.
  - Expected result: both explorers gain 5 route treasure, and 1 point remains
    visible on the route.
- Exactly one returning explorer can claim a relic, using the printed number
  multiplied by 10.
  - Input: one explorer returns while relic number 3 is open.
  - Expected result: that explorer gains 30 relic points and the relic is stored
    in the explorer's artifact list.
- A group returning together does not claim relics.
  - Input: two explorers return while the same relic is open.
  - Expected result: no relic is added to either artifact list.

## Duplicate danger

- A second matching danger removes carried loot from explorers still inside the
  cave.
  - Input: an active explorer is carrying 12 loot when FIRE causes the round to
    fail.
  - Expected result: the explorer's carried loot becomes 0 and the explorer is
    no longer active.
- That whole danger type is removed for later rounds.
  - Input: the FIRE danger pool starts at 3.
  - Expected result: the FIRE danger pool becomes 0 after the failed round.

## Final ranking

- Final ranking uses score first.
  - Input: explorers with different tent and wallet totals.
  - Expected result: the higher total score appears earlier in the ranking.
- Relic count can break a tie.
  - Input: two explorers have the same score, but only one has a relic.
  - Expected result: the explorer with the relic is ranked first.
