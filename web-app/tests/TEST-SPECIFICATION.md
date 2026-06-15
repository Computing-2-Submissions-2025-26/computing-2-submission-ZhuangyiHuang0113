# Unit Test Specification

These tests check the rules moved into `IncaTreasure.js`. They do not test
button clicks; they test the game decisions that should work even without the
webpage.

## Round setup

- A new round charges each explorer one deposit, resets carried loot and puts
  everyone back into the cave.
- A normal round deck has 15 treasure cards, 15 danger cards and one relic with
  the correct value.

## Treasure distribution

- Treasure value 15 splits between four active explorers as 3 each, with 3 left
  on the card.
- An explorer already back at camp does not receive new cave loot.

## Returning to camp

- A returning explorer secures their carried loot, route leftovers and deposit.
- Exactly one returning explorer can claim a relic, using the printed number
  multiplied by 10.
- A group returning together does not claim relics.

## Duplicate danger

- A second matching danger removes carried loot from explorers still inside the
  cave.
- One copy of that danger is removed for later rounds.

## Final ranking

- Final ranking uses score first.
- Relic count can break a tie.
