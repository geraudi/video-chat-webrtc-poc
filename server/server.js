#!/usr/bin/env node
const {v4: uuidv4} = require('uuid');
const WebSocketServer = require('websocket').server;
const http = require('http');
const {originIsAllowed} = require('./utils');

const idToTargetIdMap = new Map();
const targetIdToIdMap = new Map();

const server = http.createServer(function (request, response) {
  console.log((new Date()) + ' Received request for ' + request.url);
  response.writeHead(404);
  response.end();
});
server.listen(6503, function () {
  console.log((new Date()) + ' Server is listening on port 6503');
});

wsServer = new WebSocketServer({
  httpServer: server,
  autoAcceptConnections: false
});

let connectionArray = [];

function sendToOneUser (msg) {
  const msgString = JSON.stringify(msg);
  const connection = connectionArray.find(connection => connection.clientID === msg.targetId);
  if (connection) {
    connection.sendUTF(msgString);
    console.log(' --> SEND TO USER ' + msg.targetId + ' TYPE:' + msg.type);
  }
}

// Builds a message object of type "userlist" which contains the names of
// all connected users. Used to ramp up newly logged-in users and,
// inefficiently, to handle name change notifications.
function makeUserListMessage () {
  return {
    type: 'userlist',
    users: connectionArray.map(connection => connection.clientID)
  };
}

// Sends a "userlist" message to all chat members. This is a cheesy way
// to ensure that every join/drop is reflected everywhere. It would be more
// efficient to send simple join/drop messages to each user, but this is
// good enough for this simple example.
function sendUserListToAll () {
  const userListMsg = makeUserListMessage();
  const userListMsgStr = JSON.stringify(userListMsg);

  connectionArray.forEach(connection => connection.sendUTF(userListMsgStr));
}

wsServer.on('request', function (request) {
  if (!originIsAllowed(request.origin)) {
    // Make sure we only accept requests from an allowed origin
    request.reject();
    console.log((new Date()) + ' Connection from origin ' + request.origin + ' rejected.');
    return;
  }

  const connection = request.accept('json', request.origin);
  console.log((new Date()) + ' Connection accepted.');

  connectionArray.push(connection);
  connection.clientID = uuidv4();
  connection.isAvailable = true;

  const sendIdMessage = {
    type: 'id',
    id: connection.clientID
  };
  connection.sendUTF(JSON.stringify(sendIdMessage));

  connection.on('message', function (message) {
    if (message.type === 'utf8') {
      console.log('Received Message: ' + message.utf8Data.substring(0, 100));

      // Process incoming data.

      let sendToClients = true;
      const msg = JSON.parse(message.utf8Data);

      switch (msg.type) {
        // Public, textual message
        case 'message':
          msg.text = msg.text.replace(/(<([^>]+)>)/ig, '');
          break;

        case 'video-offer': {
          const availableConnections = connectionArray.filter(connection => connection.isAvailable && connection.clientID !== msg.id);
          const randomConnection = availableConnections[Math.floor(Math.random() * availableConnections.length)];

          if (randomConnection) {
            idToTargetIdMap.set(msg.id, randomConnection.clientID);
            targetIdToIdMap.set(randomConnection.clientID, msg.id);

            connection.isAvailable = false;
            randomConnection.isAvailable = false;
            console.log('--> video-offer - ' + msg.id + '  => ' + randomConnection.clientID);
            msg.targetId = randomConnection.clientID;
          } else {
            // no connection available. TODO Send message to sender of offer
            console.error('NO CONNECTION AVAILABLE');
          }
          break;
        }

        case 'hang-up': {
          connectionArray.forEach(c => console.log(c.clientID + ' : ' + c.isAvailable));

          const mainConnection = connectionArray.find(connection => connection.clientID === msg.id);
          if (mainConnection) {
            mainConnection.isAvailable = true;
            console.log('HANG UP MAIN CONNECTION NOW AVAILABLE');
          } else {
            console.error('HANG UP MAIN CONNECTION NOT FOUND');
          }

          const targetId = idToTargetIdMap.get(msg.id) ?? targetIdToIdMap.get(msg.id);
          console.log('HANG UP TARGET ID = ' + targetId);

          const targetConnection = connectionArray.find(connection => connection.clientID === targetId);
          if (targetConnection) {
            targetConnection.isAvailable = true;
            console.log('HANG UP TARGET CONNECTION NOW AVAILABLE');
          } else {
            console.error('HANG UP TARGET CONNECTION NOT FOUND');
          }

          idToTargetIdMap.delete(msg.id);
          targetIdToIdMap.delete(msg.id);
        }
      }

      // Convert the revised message back to JSON and send it out
      // to the specified client or all clients, as appropriate. We
      // pass through any messages not specifically handled
      // in the select block above. This allows the clients to
      // exchange signaling and other control objects unimpeded.

      if (sendToClients) {

        // If the message specifies a target username, only send the
        // message to them. Otherwise, send it to every user.
        if (msg.targetId && msg.targetId !== '') {
          sendToOneUser(msg);
        } else {
          const msgString = JSON.stringify(msg);
          connectionArray.forEach(connection => connection.sendUTF(msgString));
        }
      }
    }
  });

  connection.on('close', function (reason, description) {
    connectionArray = connectionArray.filter(function (el, idx, ar) {
      return el.connected;
    });

    // Now send the updated user list. Again, please don't do this in a
    // real application. Your users won't like you very much.
    sendUserListToAll();

    // Build and output log output for close information.

    var logMessage = 'Connection closed: ' + connection.remoteAddress + ' (' +
      reason;
    if (description !== null && description.length !== 0) {
      logMessage += ': ' + description;
    }

    console.log((new Date()) + logMessage);
  });
});
