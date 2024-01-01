#!/usr/bin/env node
var WebSocketServer = require('websocket').server;
var http = require('http');
const {isUsernameUnique, originIsAllowed} = require('./utils');

var server = http.createServer(function(request, response) {
  console.log((new Date()) + ' Received request for ' + request.url);
  response.writeHead(404);
  response.end();
});
server.listen(6503, function() {
  console.log((new Date()) + ' Server is listening on port 6503');
});

wsServer = new WebSocketServer({
  httpServer: server,
  // You should not use autoAcceptConnections for production
  // applications, as it defeats all standard cross-origin protection
  // facilities built into the protocol and the browser.  You should
  // *always* verify the connection's origin and decide whether or not
  // to accept it.
  autoAcceptConnections: false
});

let connectionArray = [];
let nextID = 1;
let appendToMakeUnique = 1;

// Scan the list of connections and return the one for the specified
// clientID. Each login gets an ID that doesn't change during the session,
// so it can be tracked across username changes.
function getConnectionForID(id) {
  return connectionArray.find(connection => connection.clientID === id)
}

// Sends a message (which is already stringified JSON) to a single
// user, given their username. We use this for the WebRTC signaling,
// and we could use it for private text messaging.
function sendToOneUser(target, msgString) {
  const connection = connectionArray.find(connection => connection.username === target);
  if (connection) {
    connection.sendUTF(msgString);
  }
}

// Builds a message object of type "userlist" which contains the names of
// all connected users. Used to ramp up newly logged-in users and,
// inefficiently, to handle name change notifications.
function makeUserListMessage() {
  return {
    type: "userlist",
    users: connectionArray.map(connection => connection.username)
  };
}

// Sends a "userlist" message to all chat members. This is a cheesy way
// to ensure that every join/drop is reflected everywhere. It would be more
// efficient to send simple join/drop messages to each user, but this is
// good enough for this simple example.
function sendUserListToAll() {
  const userListMsg = makeUserListMessage();
  const userListMsgStr = JSON.stringify(userListMsg);

  connectionArray.forEach(connection => connection.sendUTF(userListMsgStr))
}

wsServer.on('request', function(request) {
  if (!originIsAllowed(request.origin)) {
    // Make sure we only accept requests from an allowed origin
    request.reject();
    console.log((new Date()) + ' Connection from origin ' + request.origin + ' rejected.');
    return;
  }

  const connection = request.accept('json', request.origin);
  console.log((new Date()) + ' Connection accepted.');

  connectionArray.push(connection);
  connection.clientID = nextID;
  nextID++;

  const msg = {
    type: "id",
    id: connection.clientID
  };
  console.log(msg);
  connection.sendUTF(JSON.stringify(msg));

  connection.on('message', function(message) {
    if (message.type === 'utf8') {
      console.log("Received Message: " + message.utf8Data);

      // Process incoming data.

      let sendToClients = true;
      const msg = JSON.parse(message.utf8Data);
      const connection = getConnectionForID(msg.id);

      // Take a look at the incoming object and act on it based
      // on its type. Unknown message types are passed through,
      // since they may be used to implement client-side features.
      // Messages with a "target" property are sent only to a user
      // by that name.

      switch(msg.type) {
        // Public, textual message
        case "message":
          msg.name = connection.username;
          msg.text = msg.text.replace(/(<([^>]+)>)/ig, "");
          break;

        // Username change
        case "username":
          let isNameChanged = false;
          const origName = msg.name;

          // Ensure the name is unique by appending a number to it
          // if it's not; keep trying that until it works.
          while (!isUsernameUnique(msg.name, connectionArray)) {
            msg.name = origName + appendToMakeUnique;
            appendToMakeUnique++;
            isNameChanged = true;
          }

          // If the name had to be changed, we send a "rejectusername"
          // message back to the user so they know their name has been
          // altered by the server.
          if (isNameChanged) {
            const changeMsg = {
              id: msg.id,
              type: "rejectusername",
              name: msg.name
            };
            connection.sendUTF(JSON.stringify(changeMsg));
          }

          // Set this connection's final username and send out the
          // updated user list to all users. Yeah, we're sending a full
          // list instead of just updating. It's horribly inefficient
          // but this is a demo. Don't do this in a real app.
          connection.username = msg.name;
          sendUserListToAll();
          sendToClients = false;  // We already sent the proper responses
          break;
      }

      // Convert the revised message back to JSON and send it out
      // to the specified client or all clients, as appropriate. We
      // pass through any messages not specifically handled
      // in the select block above. This allows the clients to
      // exchange signaling and other control objects unimpeded.

      if (sendToClients) {
        const msgString = JSON.stringify(msg);

        // If the message specifies a target username, only send the
        // message to them. Otherwise, send it to every user.
        if (msg.target && msg.target.length !== 0) {
          sendToOneUser(msg.target, msgString);
        } else {
          connectionArray.forEach(connection => connection.sendUTF(msgString));
        }
      }
    }
  });

  connection.on('close', function(reason, description) {
    connectionArray = connectionArray.filter(function(el, idx, ar) {
      return el.connected;
    });

    // Now send the updated user list. Again, please don't do this in a
    // real application. Your users won't like you very much.
    sendUserListToAll();

    // Build and output log output for close information.

    var logMessage = "Connection closed: " + connection.remoteAddress + " (" +
      reason;
    if (description !== null && description.length !== 0) {
      logMessage += ": " + description;
    }

    console.log((new Date()) + logMessage);
  });
});
