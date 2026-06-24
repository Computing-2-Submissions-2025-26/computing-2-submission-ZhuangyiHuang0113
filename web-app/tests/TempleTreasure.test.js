import assert from "node:assert/strict";
import {
    createPlayers,
    createRoundDeck,
    distributeTreasure,
    failRound,
    preparePlayersForRound,
    rankPlayers,
    settleReturningPlayers,
    shuffle
} from "../TempleTreasure.js";

const fullDangerPool = function () {
    return {
        FIRE: 3,
        LANDSLIDE: 3,
        SNAKES: 3,
        SPIDERS: 3,
        MUMMY: 3
    };
};

describe("Temple Treasure game module", function () {
    describe("utility API", function () {
        it("shuffles a copy without changing the original list", function () {
            const source = [1, 2, 3, 4];
            // Fixed randomness keeps this test about API behaviour, not luck.
            const shuffled = shuffle(source, function () {
                return 0;
            });
            assert.deepEqual(source, [1, 2, 3, 4]);
            assert.deepEqual(shuffled, [2, 3, 4, 1]);
        });
    });

    describe("round setup", function () {
        it("charges every explorer one deposit and resets round state", function () {
            const players = createPlayers();
            players[0].roundLoot = 9;
            players[0].active = false;
            const result = preparePlayersForRound(players);
            assert.equal(result[0].tent, 3);
            assert.equal(result[0].wallet, 3);
            assert.equal(result[0].roundLoot, 0);
            assert.equal(result[0].active, true);
            assert.equal(players[0].wallet, 4);
        });

        it("keeps dropped explorers out of later rounds", function () {
            const players = createPlayers();
            players[1].dropped = true;
            players[1].active = false;
            const result = preparePlayersForRound(players);
            assert.equal(result[1].active, false);
            assert.equal(result[1].wallet, 4);
            assert.equal(result[1].dropped, true);
        });

        it("drops final-round explorers who cannot pay the deposit", function () {
            const players = createPlayers();
            players[0].tent = 0;
            const result = preparePlayersForRound(players, {round: 5});
            assert.equal(result[0].active, false);
            assert.equal(result[0].dropped, true);
            assert.equal(result[0].tent, 0);
        });

        it("builds 15 treasure, 15 danger and one numbered relic", function () {
            const deck = createRoundDeck({
                dangerPool: fullDangerPool(),
                artifactNumber: 4,
                random: function () {
                    return 0;
                }
            });
            assert.equal(deck.length, 31);
            assert.equal(deck.filter(function (card) {
                return card.type === "treasure";
            }).length, 15);
            assert.equal(deck.find(function (card) {
                return card.type === "artifact";
            }).value, 40);
        });
    });

    describe("treasure distribution", function () {
        it("adds treasure to the route pool instead of giving it immediately", function () {
            const players = createPlayers();
            const result = distributeTreasure(
                players,
                {type: "treasure", value: 15, leftover: 0}
            );
            assert.deepEqual(
                result.players.map(function (player) {
                    return player.roundLoot;
                }),
                [0, 0, 0, 0]
            );
            assert.equal(result.card.leftover, 15);
            assert.equal(result.card.collected, false);
            assert.equal(result.share, 0);
        });

        it("keeps accumulating treasure on an already-valued route card", function () {
            const players = createPlayers();
            const result = distributeTreasure(
                players,
                {type: "treasure", value: 11, leftover: 4}
            );
            assert.equal(result.card.leftover, 15);
        });

        it("adds a revisited treasure value to the route pool again", function () {
            const players = createPlayers();
            const first = distributeTreasure(
                players,
                {type: "treasure", value: 7, leftover: 0}
            );
            const second = distributeTreasure(players, first.card);
            assert.equal(second.card.leftover, 14);
        });
    });

    describe("returning to camp", function () {
        it("secures loot and route leftovers without scoring the returned deposit", function () {
            const players = createPlayers();
            players[0] = {...players[0], tent: 3, wallet: 3};
            players[0].roundLoot = 8;
            // Safe return refunds the entry deposit; it is not extra treasure.
            const result = settleReturningPlayers(
                players,
                [{type: "treasure", value: 7, leftover: 3}],
                ["you"]
            );
            assert.equal(result.players[0].tent, 15);
            assert.equal(result.players[0].wallet, 4);
            assert.equal(result.players[0].active, false);
            assert.equal(result.revealed[0].leftover, 0);
        });

        it("awards numbered relic points only to a single returning explorer", function () {
            const players = createPlayers();
            players[0] = {...players[0], tent: 3, wallet: 3};
            players[1] = {...players[1], tent: 3, wallet: 3};
            const route = [{
                type: "artifact",
                number: 3,
                value: 30,
                claimed: false
            }];
            const single = settleReturningPlayers(players, route, ["you"]);
            const group = settleReturningPlayers(
                players,
                route,
                ["you", "atu"]
            );
            assert.equal(single.players[0].tent, 34);
            assert.deepEqual(single.players[0].artifacts, [
                {number: 3, points: 30}
            ]);
            assert.equal(group.players[0].tent, 4);
            assert.equal(group.players[0].artifacts.length, 0);
        });

        it("splits the whole route pool and leaves only the global remainder", function () {
            const players = createPlayers();
            players[0] = {...players[0], tent: 3, wallet: 3};
            players[1] = {...players[1], tent: 3, wallet: 3};
            // Two players sharing 11 leaves the visible one-gem remainder.
            const result = settleReturningPlayers(
                players,
                [
                    {type: "treasure", value: 4, leftover: 4},
                    {type: "treasure", value: 7, leftover: 7}
                ],
                ["you", "atu"]
            );
            assert.equal(result.players[0].tent, 9);
            assert.equal(result.players[1].tent, 9);
            assert.deepEqual(result.revealed.map(function (card) {
                return card.leftover;
            }), [0, 1]);
            assert.deepEqual(result.revealed.map(function (card) {
                return card.collected;
            }), [true, true]);
        });
    });

    describe("danger and ranking", function () {
        it("removes carried loot, loses the deposit and removes only the first two danger types", function () {
            const players = createPlayers();
            players[0].tent = 3;
            players[0].roundLoot = 12;
            // Only the first two duplicate danger failures retire card types.
            const result = failRound(
                players,
                {FIRE: 3},
                "FIRE"
            );
            assert.equal(result.players[0].tent, 3);
            assert.equal(result.players[0].roundLoot, 0);
            assert.equal(result.players[0].active, false);
            assert.equal(result.dangerPool.FIRE, 0);
            assert.deepEqual(result.removedDangerTypes, ["FIRE"]);

            const laterResult = failRound(
                players,
                {FIRE: 0, SNAKES: 3, MUMMY: 3},
                "MUMMY",
                {removedDangerTypes: ["FIRE", "SNAKES"]}
            );
            assert.equal(laterResult.dangerPool.MUMMY, 3);
            assert.deepEqual(laterResult.removedDangerTypes, ["FIRE", "SNAKES"]);
        });

        it("ranks by final score and then by relic count", function () {
            const players = createPlayers();
            players[0].tent = 20;
            players[1].tent = 20;
            players[1].artifacts = [{number: 1, points: 10}];
            const ranking = rankPlayers(players.slice(0, 2));
            assert.equal(ranking[0].id, "atu");
        });

        it("does not count wallet gems in the final score", function () {
            const players = createPlayers();
            players[0].tent = 5;
            players[0].wallet = 4;
            players[1].tent = 6;
            players[1].wallet = 0;
            const ranking = rankPlayers(players.slice(0, 2));
            assert.equal(ranking[0].id, "atu");
        });
    });
});
