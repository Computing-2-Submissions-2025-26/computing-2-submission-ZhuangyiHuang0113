import assert from "node:assert/strict";
import {
    createPlayers,
    createRoundDeck,
    distributeTreasure,
    failRound,
    preparePlayersForRound,
    rankPlayers,
    settleReturningPlayers
} from "../IncaTreasure.js";

describe("Inca Treasure game module", function () {
    describe("round setup", function () {
        it("charges every explorer one gem and resets round state", function () {
            const players = createPlayers();
            players[0].roundLoot = 9;
            players[0].active = false;
            const result = preparePlayersForRound(players);
            assert.equal(result[0].wallet, 4);
            assert.equal(result[0].roundLoot, 0);
            assert.equal(result[0].active, true);
            assert.equal(players[0].wallet, 5);
        });

        it("builds 15 treasure, 15 danger and one numbered relic", function () {
            const deck = createRoundDeck({
                dangerPool: {
                    FIRE: 3,
                    LANDSLIDE: 3,
                    SNAKES: 3,
                    SPIDERS: 3,
                    MUMMY: 3
                },
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
        it("splits treasure among active explorers and leaves the remainder", function () {
            const players = createPlayers();
            const result = distributeTreasure(
                players,
                {type: "treasure", value: 15, leftover: 0}
            );
            assert.deepEqual(
                result.players.map(function (player) {
                    return player.roundLoot;
                }),
                [3, 3, 3, 3]
            );
            assert.equal(result.card.leftover, 3);
            assert.equal(result.share, 3);
        });

        it("does not give treasure to explorers already at camp", function () {
            const players = createPlayers();
            players[3].active = false;
            const result = distributeTreasure(
                players,
                {type: "treasure", value: 11, leftover: 0}
            );
            assert.deepEqual(
                result.players.map(function (player) {
                    return player.roundLoot;
                }),
                [3, 3, 3, 0]
            );
            assert.equal(result.card.leftover, 2);
        });
    });

    describe("returning to camp", function () {
        it("secures loot, route leftovers and the returned deposit", function () {
            const players = createPlayers();
            players[0].roundLoot = 8;
            const result = settleReturningPlayers(
                players,
                [{type: "treasure", value: 7, leftover: 3}],
                ["you"]
            );
            assert.equal(result.players[0].tent, 12);
            assert.equal(result.players[0].active, false);
            assert.equal(result.revealed[0].leftover, 0);
        });

        it("awards numbered relic points only to a single returning explorer", function () {
            const players = createPlayers();
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
            assert.equal(single.players[0].tent, 31);
            assert.deepEqual(single.players[0].artifacts, [
                {number: 3, points: 30}
            ]);
            assert.equal(group.players[0].tent, 1);
            assert.equal(group.players[0].artifacts.length, 0);
        });
    });

    describe("danger and ranking", function () {
        it("removes carried loot and one duplicated danger card", function () {
            const players = createPlayers();
            players[0].roundLoot = 12;
            const result = failRound(
                players,
                {FIRE: 3},
                "FIRE"
            );
            assert.equal(result.players[0].roundLoot, 0);
            assert.equal(result.players[0].active, false);
            assert.equal(result.dangerPool.FIRE, 2);
        });

        it("ranks by final score and then by relic count", function () {
            const players = createPlayers();
            players[0].tent = 20;
            players[1].tent = 20;
            players[1].artifacts = [{number: 1, points: 10}];
            const ranking = rankPlayers(players.slice(0, 2));
            assert.equal(ranking[0].id, "atu");
        });
    });
});

