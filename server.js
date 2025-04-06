const fastify = require('fastify')({
    logger: true,
    ignoreTrailingSlash: true
  });
  
  // Plugins
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
  
  fastify.register(require('@fastify/websocket'));
  
  // Plugin personnalisé (SQLite)
  fastify.register(require('./plugins/sqlite'));
  
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
  
  // Routes
  fastify.get('/', async () => ({
    message: "API IoT Parkki - v1.0",
    documentation: "/documentation"
  }));
  
  fastify.get('/cameras', async () => {
    return fastify.parkkiDB.allAsync('SELECT * FROM cameras ORDER BY created_at DESC');
  });
  
  fastify.post('/cameras/:id/event', async (request, reply) => {
    const { id } = request.params;
    const event = {
      ...request.body,
      received_at: new Date().toISOString()
    };
  
    const db = fastify.parkkiDB;
  
    try {
      db.prepare('BEGIN TRANSACTION').run();
  
      db.prepare(`
        INSERT INTO cameras (id, name, status, last_event)
        VALUES (?, ?, COALESCE((SELECT status FROM cameras WHERE id = ?), 'online'), ?)
        ON CONFLICT(id) DO UPDATE SET
          last_event = excluded.last_event,
          status = excluded.status
      `).run(id, `Camera-${id}`, id, JSON.stringify(event));
  
      if (fastify.websocketServer) {
        const payload = JSON.stringify({
          camera_id: id,
          event_type: event.type,
          timestamp: event.timestamp
        });
  
        fastify.websocketServer.clients.forEach(client => {
          if (client.readyState === client.OPEN) {
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
  
  // Lancement du serveur
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
  