(() => {
  'use strict';
  
  module.exports = function setup(options, imports, register) {

    const _ = require('lodash');
    const EventEmitter = require('events');
    const WebSocketServer = require('websocket').server;
    
    class Client extends EventEmitter {
      constructor (connection, sessionId) {
        super();

        this._connection = connection;
        this._sessionId = sessionId;

        connection.on('message', (message) => {
          this._onConnectionMessage(connection, message);
        });

        connection.on('close', (reasonCode, description) => {
          this._onConnectionClose(connection, reasonCode, description);
        });
      }
      
      getSessionId() {
        return this._sessionId;
      }
      
      getConnection() {
        return this._connection;
      }

      sendMessage (data) {
        this._sendMessage(this.getConnection(), JSON.stringify(data));
      }

      sendBinary (data) {
        this._sendBinary(this.getConnection(), data);
      }

      _sendMessage (connection, message) {
        connection.sendUTF(message);
      }

      _sendBinary (connection, binaryData) {
        connection.sendBytes(binaryData);
      }

      _onConnectionMessage (connection, message) {
        switch (message.type) {
          case 'utf8':
            try {
              this.emit("message", {
                sessionId: this.sessionId,
                message: JSON.parse(message.utf8Data),
                connection: connection
              });
            } catch (e) {
              // TODO: LOG
            }
          break;
        }
      }

      _onConnectionClose (connection, reasonCode, description) {
        this.emit("close", {
          sessionId: this.sessionId,
          connection: connection,
          reasonCode: reasonCode,
          description: description
        });
      }
    }

    class WebSockets extends EventEmitter {

      constructor (httpServer, acceptMethod) {
        super();
        
        this.acceptMethod = acceptMethod;
        
        this._clients = {};

        this._server = new WebSocketServer({
          httpServer: httpServer
        });

        this._server.on("connection", this._onServerConnection.bind(this));
        this._server.on("request", this._onServerRequest.bind(this));
      }
      
      getClients() {
        return _.map(this._clients, (client) => {
          return client;
        });
      }
      
      sendMessageToAllClients (data) {
        _.forEach(this._clients, (client, sessionId) => {
          client.sendMessage(data);
        });
      }
      
      getAccepted(sessionId, callback) {
        if (!this.acceptMethod) {
          callback(true);
        } else {
          this.acceptMethod(sessionId, callback);
        }
      }

      _onServerConnection (webSocket) {
        const url = webSocket.upgradeReq.url;
      }

      _onServerRequest (request) {
        const urlParts = request.resourceURL.path.split('/');
        const sessionId = _.last(urlParts);
        
        this.getAccepted(sessionId, (accept) => {
          if (!accept) {
            request.reject();
          } else {
            const connection = request.accept();
            const client = new Client(connection, sessionId);
            this._clients[sessionId] = client;

            client.on("message", (data) => {
              this.emit("message", {
                client: client,
                data: data
              });
            });

            client.on("close", (sessionId, connection, reasonCode, description) => {
              delete this._clients[sessionId];
              this.emit("close", {
                client: client,
                sessionId: sessionId,
                connection: connection,
                reasonCode: reasonCode,
                description: description
              });
            });
          }
        });
      }

    };
  
    register(null, {
      'shady-websockets': WebSockets
    });

  };
})();