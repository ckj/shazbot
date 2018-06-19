var request = require('request');

// Todo: server should be a function argument
var options = {
  url: 'https://us-central1-tribesquery.cloudfunctions.net/query/server?server=208.100.45.13:28002',
  headers: {
    'User-Agent': 'request',
  }
};

var server = {};

function callback(error, response, body) {
  if (!error && response.statusCode == 200) {
    var s = JSON.parse(body);
  
    server = s;

  } else {
    console.log("Query error");
  }
}

module.exports = {
  server: function() {
    request(options, callback);
    return server;
  }
};