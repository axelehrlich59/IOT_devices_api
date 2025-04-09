const { v4: uuidv4 } = require('uuid');

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
  fastify.get('/cameras', async (request, reply) => {
    const db = fastify.parkkiDB;
  
    try {
      const cameras = await db.allAsync('SELECT * FROM cameras ORDER BY created_at DESC');
      return cameras; // Renvoie toutes les caméras
    } catch (error) {
      reply.code(500).send({
        error: 'Database Error',
        message: error.message
      });
    }
  });

  fastify.get('/cameras/:id/events', async (request, reply) => {
    const { id } = request.params;
    const db = fastify.parkkiDB;
  
    try {
      const events = await db.allAsync(`
        SELECT * FROM cameras WHERE id = ?
      `, [id]);
  
      return events.map(event => JSON.parse(event.last_event)); // Récupère l'événement sous forme d'objet
    } catch (error) {
      reply.code(500).send({
        error: 'Database Error',
        message: error.message
      });
    }
  });

  fastify.post('/cameras', {
    schema: {
      body: {
        type: 'object',
        required: ['name'],
        properties: {
          custom_id: { type: 'string' }, // optionnel
          name: { type: 'string' },
          status: { 
            type: 'string', 
            enum: ['online', 'offline'],
            default: 'offline' 
          }
        }
      }
    }
  }, async (request, reply) => {
    const { custom_id, name, status } = request.body;
    const db = fastify.parkkiDB;
  
    const id = custom_id || uuidv4();
  
    try {
      db.prepare('BEGIN TRANSACTION').run();
  
      const insertStmt = db.prepare(`
        INSERT INTO cameras (id, name, status)
        VALUES (?, ?, ?)
      `);
  
      insertStmt.run(id, name, status);
      db.prepare('COMMIT').run();
  
      return { status: 'success', message: 'Caméra ajoutée avec succès', id };
    } catch (error) {
      db.prepare('ROLLBACK').run();
      reply.code(500).send({ error: 'Database Error', message: error.message });
    }
  });  
  
  
  // Route pour enregistrer un événement d'une caméra
  fastify.post('/cameras/:id/events', {
    schema: {
      params: {
        type: 'object',
        properties: {
          id: { type: 'string' }
        }
      },
      body: {
        type: 'array',
        items: {
          type: 'object',
          required: ['type', 'timestamp', 'confidence'],
          properties: {
            type: { type: 'string' },
            timestamp: { type: 'string', format: 'date-time' },
            confidence: { type: 'number', minimum: 0, maximum: 1 }
          }
        }
      }
    }
  }, async (request, reply) => {
    const { id } = request.params;
    const events = request.body;
  
    const db = fastify.parkkiDB;
  
    try {
      db.prepare('BEGIN TRANSACTION').run();
  
      // Insérer ou mettre à jour chaque événement pour la caméra donnée
      events.forEach(event => {
        db.prepare(`
          INSERT INTO cameras (id, name, status, last_event)
          VALUES (?, ?, COALESCE((SELECT status FROM cameras WHERE id = ?), 'online'), ?)
          ON CONFLICT(id) DO UPDATE SET
            last_event = excluded.last_event,
            status = excluded.status
        `).run(id, `Camera-${id}`, id, JSON.stringify(event));
      });
  
      // Envoyer une notification WebSocket pour chaque événement
      if (fastify.websocketServer) {
        events.forEach(event => {
          const payload = JSON.stringify({
            camera_id: id,
            event_type: event.type,
            timestamp: event.timestamp,
            confidence: event.confidence
          });
  
          // Envoyer à tous les clients connectés
          fastify.websocketServer.clients.forEach(client => {
            if (client.readyState === client.OPEN) {
              client.send(payload);
            }
          });
        });
      }
  
      db.prepare('COMMIT').run();
      return { 
        status: 'success',
        message: `${events.length} événements traités`,
        event_ids: events.map((event, index) => `${id}-${Date.now()}-${index}`)
      };
    } catch (error) {
      db.prepare('ROLLBACK').run();
      reply.code(500).send({
        error: 'Database Error',
        message: error.message
      });
    }
  });


  // Supprimer toutes les caméras

  fastify.delete('/cameras', async (request, reply) => {
    const db = fastify.parkkiDB;
  
    try {
      db.prepare('DELETE FROM cameras').run();
      return { status: 'success', message: 'Toutes les caméras ont été supprimées.' };
    } catch (error) {
      reply.code(500).send({
        error: 'Database Error',
        message: error.message
      });
    }
  });
  

  // Supprimer les caméras par leur id

  fastify.delete('/cameras/:id', async (request, reply) => {
    const { id } = request.params;
    const db = fastify.parkkiDB;
  
    try {
      const stmt = db.prepare('DELETE FROM cameras WHERE id = ?');
      const result = stmt.run(id);
  
      if (result.changes === 0) {
        return reply.code(404).send({ error: 'Not Found', message: 'Caméra introuvable' });
      }
  
      return { status: 'success', message: `Caméra ${id} supprimée` };
    } catch (error) {
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
    );
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
  