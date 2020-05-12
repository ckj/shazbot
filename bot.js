const fs = require("fs");
const axios = require("axios");
var Discord = require("discord.io");
var logger = require("winston");
const Sentry = require("@sentry/node");
var _ = require("underscore");

// Configure Sentry for error tracking

if (process.env.sentryDSN) {
  Sentry.init({ dsn: process.env.sentryDSN });
}

// Configure logger settings

logger.remove(logger.transports.Console);
logger.add(logger.transports.Console, {
  colorize: true
});
logger.level = "debug";

// Initialize Discord Bot

var bot = new Discord.Client({
  token: process.env.token,
  autorun: true
});

// Load in player data

let SMURF_TO_PLAYER;

// Todo: replace players.json with mongodb or something

fs.readFile("players.json", (err, data) => {
  if (err) throw err;
  SMURF_TO_PLAYER = JSON.parse(data);
});

// Servers

let servers = [
  {
    name: "lt",
    ip: "208.100.45.11:28001",
    playerThreshold: 5,
    channelId: "330270998718971905"
  },
  { name: "pu", ip: "208.100.45.12:28002" },
  {
    name: "duel",
    ip: "208.100.45.13:28001",
    playerThreshold: 2,
    channelId: "235605312382566410"
  },
  {
    name: "anni",
    ip: "208.100.45.12:28001",
    playerThreshold: 5,
    channelId: "504312512641105920"
  }
];

bot.on("ready", evt => {
  bot.setPresence({ game: { name: "Tribes", type: 0 } });
  logger.info("Connected");
  logger.info("Logged in as: ");
  logger.info(bot.username + " - (" + bot.id + ")");
  logger.info("Node Env: " + process.env.NODE_ENV);
});

bot.on("message", (user, userID, channelID, message, evt) => {
  if (message.substring(0, 1) == "!") {
    let args = message.substring(1).split(" ");
    let cmd = args[0].toLowerCase();
    args = args.splice(1);

    let isServer = servers.filter(server => server.name === cmd);

    if (isServer.length) {
      serverInfo(isServer[0], channelID);
    } else {
      switch (cmd) {
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
  }
});

function serverInfo(server, channelID) {
  var message;

  if (server.status) {
    var count =
      server.status.players.length > 0 ? server.status.players.length : "No";
    var plural = server.status.players.length == 1 ? "player" : "players";

    message = `**${count} ${plural}** playing **${server.status.map}** on **${
      server.status.name
    }**`;

    if (server.status.players.length) {
      message += ": ";
      server.status.players.map((player, i) => {
        message += `${"`" + player.name + "`"}${
          player.team ? "" : " _(obs)_"
        } ${server.status.players.length === i + 1 ? "" : ","} `;
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

async function queryServer(server) {
  server.status = await doRequest(server);
  checkForActivity(server);
}

const doRequest = async server => {
  var options = {
    url:
      "https://us-central1-tribesquery.cloudfunctions.net/query/server?server=" +
      server.ip,
    headers: {
      "User-Agent": "request"
    },
    timeout: 5000
  };

  try {
    const response = await axios(options);
    const data = response.data;
    return data;
  } catch (error) {
    console.log(error);
  }
};

function loop() {
  const INTERVAL = 30 * 1000; // 30 seconds

  servers.map(server => {
    queryServer(server);
  });

  setTimeout(loop, INTERVAL);
}

function checkForActivity(server) {
  const MSG_BUFFER = 30 * 60 * 1000; // 30 minutes

  server.lastMessage = server.lastMessage || new Date("March 15, 1985 3:15:00");

  if (
    server.channelId &&
    server.playerThreshold &&
    server.status.players &&
    server.status.players.length > server.playerThreshold
  ) {
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

      let channel =
        process.env.NODE_ENV == "production"
          ? server.channelId
          : process.env.devChannelId;

      console.log(channel, msg);
      bot.sendMessage({
        to: channel,
        message: msg
      });
      server.lastMessage = new Date();
    }
  }
}

loop();
