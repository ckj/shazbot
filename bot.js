const fs = require("fs");
var request = require("request");
var Discord = require("discord.io");
var logger = require("winston");
var Raven = require("raven");
var _ = require("underscore");

var token = process.env.token;

// Configure Sentry for error tracking

if (process.env.sentryDSN) {
  Raven.config(process.env.sentryDSN).install();
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

// Initial server vars

var ltserver = {};
var puserver = {};
var baseserver = {};
var duelserver = {};

bot.on("ready", function(evt) {
  bot.setPresence({ game: { name: "Tribes", type: 0 } });
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
        serverInfo(ltserver, channelID);
        break;
      case "pu":
        serverInfo(puserver, channelID);
        break;
      case "base":
        serverInfo(baseserver, channelID);
        break;
      case "duel":
        serverInfo(duelserver, channelID);
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

function serverInfo(server, channelID) {
  var message;

  if (server.status) {
    var plural = server.status.players.length == 1 ? "player" : "players";
    var count =
      server.status.players.length > 0 ? server.status.players.length : "No";

    message =
      count +
      " " +
      plural +
      " playing " +
      server.status.map +
      " on " +
      server.status.name;
    if (server.status.players.length) {
      message += ": ";
      server.status.players.map((player, i) => {
        if (server.status.players.length === i + 1) {
          message += player.name;
        } else {
          message += player.name + ", ";
        }
      });
    } else {
      message += ".";
    }
    bot.sendMessage({
      to: channelID,
      message: message
    });
  } else {
    bot.sendMessage({
      to: channelID,
      message: "Server info not available right now."
    });
  }
}

function queryServer(ip) {
  var server;
  var options = {
    url:
      "https://us-central1-tribesquery.cloudfunctions.net/query/server?server=" +
      ip,
    headers: {
      "User-Agent": "request"
    }
  };

  return new Promise(function(resolve, reject) {
    request(options, function(error, response, body) {
      server = JSON.parse(body);
      resolve(server);
    });
  });
}

function loop() {
  const INTERVAL = 30 * 1000; // 30 seconds

  setInterval(async function() {
    // Update servers
    ltserver.status = await queryServer("208.100.45.13:28002");
    puserver.status = await queryServer("208.100.45.12:28002");
    baseserver.status = await queryServer("208.100.45.13:28003");
    duelserver.status = await queryServer("208.100.45.13:28001");

    checkForActivity(ltserver, 5, process.env.ltChannel);
    checkForActivity(baseserver, 5, process.env.ltChannel);
    checkForActivity(duelserver, 2, process.env.duelChannel);
  }, INTERVAL);
}

function checkForActivity(server, threshold, channel) {
  const MSG_BUFFER = 30 * 60 * 1000; // 30 minutes

  server.lastMessage = server.lastMessage || new Date("March 15, 1985 3:15:00");

  if (server.status.players && server.status.players.length > threshold) {
    if (new Date() - server.lastMessage > MSG_BUFFER) {
      var activeVets = [];

      server.status.players.map((player, i) => {
        let p = SMURF_TO_PLAYER[player.name];

        if (p) {
          activeVets.push(p);
        }
      });

      var msg =
        "There are " +
        server.status.players.length +
        " players in " +
        server.status.name;

      activeVets.length
        ? (msg +=
            ", including these vets: **" +
            activeVets.join(", ") +
            "**. Join up!")
        : (msg += ". Join up!");

      bot.sendMessage({
        to: channel,
        message: msg
      });
      server.lastMessage = new Date();
    } else {
    }
  }
}

loop();
