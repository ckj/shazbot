const fs = require("fs");
var Discord = require("discord.io");
var logger = require("winston");
var query = require("./query");
var Raven = require("raven");
var _ = require("underscore");

var token = process.env.token;

// Configure Sentry for error tracking

if (process.env.sentryDSN) {
  Raven.config(
    process.env.sentryDSN
  ).install();  
}

// Configure logger settings

logger.remove(logger.transports.Console);
logger.add(logger.transports.Console, {
  colorize: true
});
logger.level = "debug";

// Initialize Discord Bot

var bot = new Discord.Client({
  token: token,
  autorun: true
});

// Load in player data

let SMURF_TO_PLAYER;

// Todo: replace players.json with mongodb or something

fs.readFile("players.json", (err, data) => {
  if (err) throw err;
  SMURF_TO_PLAYER = JSON.parse(data);
});

// Query server

var server = query.server();

bot.on("ready", function(evt) {
  logger.info("Connected");
  logger.info("Logged in as: ");
  logger.info(bot.username + " - (" + bot.id + ")");
});

bot.on("message", function(user, userID, channelID, message, evt) {
  // Our bot needs to know if it will execute a command
  // It will listen for messages that will start with `!`
  if (message.substring(0, 1) == "!") {
    var args = message.substring(1).split(" ");
    var cmd = args[0];

    args = args.splice(1);
    switch (cmd) {
      // !ping
      case "ping":
        bot.sendMessage({
          to: channelID,
          message: "Pong!"
        });
        break;
      case "whois":
        let p = args.join(" ");
        if (SMURF_TO_PLAYER[p]) {
          bot.sendMessage({
            to: channelID,
            message: p + " is " + SMURF_TO_PLAYER[p] + "."
          });
        } else {
          bot.sendMessage({
            to: channelID,
            message: "Idk."
          });
        }
        break;
      case "baselt":
        if (server.players) {
          var plural = server.players.length == 1 ? "player" : "players";
          var count = server.players.length > 0 ? server.players.length : "No";

          var msg =
            count +
            " " +
            plural +
            " playing " +
            server.map +
            " on " +
            server.name;
          if (server.players.length) {
            msg += ": ";
            server.players.map((player, i) => {
              if (server.players.length === i + 1) {
                msg += player.name;
              } else {
                msg += player.name + ", ";
              }
            });
          } else {
            msg += ".";
          }

          bot.sendMessage({
            to: channelID,
            message: msg
          });
        } else {
          bot.sendMessage({
            to: channelID,
            message: "Server info not available at this time."
          });
        }
        break;
      case "dox":
        var doxArgs = message.substring(5).split(" as ");

        var serverID = bot.channels[channelID].guild_id;
        var roles = bot.servers[serverID].members[userID].roles;

        roles.map((role, i) => {
          if (
            // Make sure user is a shazbot admin
            bot.servers[bot.channels[channelID].guild_id].roles[role].name ==
            "shazbot-admin"
          ) {
            // Todo: doxArgs needs to be case-insensitive
            if (!SMURF_TO_PLAYER[doxArgs[0]]) {
              SMURF_TO_PLAYER[doxArgs[0]] = doxArgs[1];

              let data = JSON.stringify(SMURF_TO_PLAYER, null, 2);

              fs.writeFile("players.json", data, err => {
                if (err) throw err;
                bot.sendMessage({
                  to: channelID,
                  message:
                    "Okay, I'll remember that " +
                    doxArgs[1] +
                    " smurfs as " +
                    doxArgs[0] +
                    "."
                });
              });
            }
          }
        });
        break;
    }
  }
});

// Periodically check server to see if anyone is playing

const INTERVAL = 30 * 1000; // 30 seconds
const MSG_BUFFER = 30 * 60 * 1000; // 30 minutes
const PLAYER_THRESHOLD = 5;
var lastMessage = new Date("March 15, 1985 3:15:00");

setInterval(function() {
  server = query.server();

  if (server.players.length > PLAYER_THRESHOLD) {
    if (new Date() - lastMessage > MSG_BUFFER) {
      var activeVets = [];

      server.players.map((player, i) => {
        let p = SMURF_TO_PLAYER[player.name];

        if (p) {
          activeVets.push(p);
        }
      });

      var msg =
        "There are " + server.players.length + " players in " + server.name;

      activeVets.length
        ? (msg +=
            ", including these vets: **" +
            activeVets.join(", ") +
            "**. Join up!")
        : (msg += ". Join up!");

      bot.sendMessage({
        to: process.env.channelId,
        message: msg
      });
      lastMessage = new Date();
    } else {
    }
  }
}, INTERVAL);
