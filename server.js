const fastify = require('fastify')({
    logger: true,
    ignoreTrailingSlash: true
  });
  
  // Plugins HTTP
  fastify.register(require('@fastify/cors'), {
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE']
  });
  
  fastify.register(require('@fastify/swagger'), {
    swagger: {
      info: {
        title: 'API Surveillance IoT Parkki',
        version: '1.0.0'
      }
    }
  });
  
  fastify.register(require('@fastify/swagger-ui'), {
    routePrefix: '/documentation',
    uiConfig: {
      docExpansion: 'list',
      deepLinking: false
    },
    staticCSP: true
  });
  
  // Plugin personnalisé SQLite
  fastify.register(require('./plugins/sqlite'));
  
  // --- Gestion manuelle des WebSocket via la librairie ws ---
  const WebSocket = require('ws');
  // Créer un serveur WebSocket manuellement sur le même serveur HTTP
  const wss = new WebSocket.Server({
    noServer: true,
    perMessageDeflate: false  // Désactive la compression pour éviter l'erreur RSV1
  });
  
  // Stockage des connexions via wss.clients (géré automatiquement par ws)
  
  // Gestion des connexions WebSocket
  wss.on('connection', (ws) => {
    console.log('✅ Client WebSocket connecté');
  
    // Envoyer un message de bienvenue dès la connexion
    ws.send(JSON.stringify({ message: '✅ Connexion WebSocket établie' }));
  
    // Écouter les messages envoyés par le client
    ws.on('message', (message) => {
      console.log('📩 Message reçu:', message.toString());
      ws.send(JSON.stringify({ message: `🗣️ Reçu: ${message.toString()}` }));
    });
  
    ws.on('close', () => {
      console.log('❌ Client WebSocket déconnecté');
    });
  
    ws.on('error', (error) => {
      console.error('❌ Erreur sur le WebSocket:', error);
    });
  });
  
  // Rendre le serveur WebSocket accessible depuis le reste de l'application
  fastify.decorate('websocketServer', wss);
  
  // Gestion de l'upgrade HTTP vers WebSocket
  fastify.server.on('upgrade', (request, socket, head) => {
    if (request.url === '/ws') {
      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit('connection', ws, request);
      });
    } else {
      socket.destroy();
    }
  });
  
  // --- Routes REST ---
  // Route d'accueil
  fastify.get('/', async () => ({
    message: "API IoT Parkki - v1.0",
    documentation: "/documentation"
  }));
  
  // Route pour lister les caméras
  fastify.get('/cameras', async () => {
    return fastify.parkkiDB.allAsync('SELECT * FROM cameras ORDER BY created_at DESC');
  });
  
  // Route pour enregistrer un événement d'une caméra
  fastify.post('/cameras/:id/event', {
    schema: {
      params: {
        type: 'object',
        properties: {
          id: { type: 'string' }
        }
      },
      body: {
        type: 'object',
        required: ['type'],
        properties: {
          type: { type: 'string' },
          timestamp: { type: 'string', format: 'date-time' },
          confidence: { type: 'number', minimum: 0, maximum: 1 }
        }
      }
    }
  }, async (request, reply) => {
    const { id } = request.params;
    const event = {
      ...request.body,
      received_at: new Date().toISOString()
    };
  
    const db = fastify.parkkiDB;
  
    try {
      db.prepare('BEGIN TRANSACTION').run();
  
      // Upsert pour la caméra avec événement
      db.prepare(`
        INSERT INTO cameras (id, name, status, last_event)
        VALUES (?, ?, COALESCE((SELECT status FROM cameras WHERE id = ?), 'online'), ?)
        ON CONFLICT(id) DO UPDATE SET
          last_event = excluded.last_event,
          status = excluded.status
      `).run(id, `Camera-${id}`, id, JSON.stringify(event));
  
      // Envoi de la notification WebSocket à tous les clients connectés
      if (fastify.websocketServer) {
        const payload = JSON.stringify({
          camera_id: id,
          event_type: event.type,
          timestamp: event.timestamp,
          confidence: event.confidence
        });
  
        fastify.websocketServer.clients.forEach((client) => {
          if (client.readyState === WebSocket.OPEN) {
            client.send(payload);
          }
        });
      }
  
      db.prepare('COMMIT').run();
      return {
        status: 'success',
        message: 'Événement traité',
        event_id: `${id}-${Date.now()}`
      };
    } catch (error) {
      db.prepare('ROLLBACK').run();
      reply.code(500).send({
        error: 'Database Error',
        message: error.message
      });
    }
  });
  
  // Hook pour initialiser la base de données
  fastify.addHook('onReady', async () => {
    await fastify.parkkiDB.runAsync(`
      CREATE TABLE IF NOT EXISTS cameras (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        status TEXT DEFAULT 'offline',
        last_event TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);
  });
  
  // --- Lancement du serveur ---
  const start = async () => {
    try {
      await fastify.listen({ port: 3000, host: '0.0.0.0' });
      console.log('🚀 Serveur IoT Parkki démarré sur http://localhost:3000');
    } catch (err) {
      fastify.log.error(err);
      process.exit(1);
    }
  };
  
  start();
  