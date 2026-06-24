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

- Treasure value 15 splits between four active explorers as 3 each, with 3 left
  on the card.
  - Input: four active explorers and a treasure card worth 15.
  - Expected result: each explorer gains 3 round loot, and card leftover is 3.
- An explorer already back at camp does not receive new cave loot.
  - Input: one explorer is inactive before an 11-point treasure is resolved.
  - Expected result: only the three active explorers gain loot, and the inactive
    explorer stays at 0.

## Returning to camp

- A returning explorer secures carried loot, route leftovers and deposit.
  - Input: one explorer returns while carrying 8 loot, with 3 leftover treasure
    on the route.
  - Expected result: the explorer's tent gains 12 points: 8 loot, 3 leftover
    treasure and 1 returned deposit.
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
