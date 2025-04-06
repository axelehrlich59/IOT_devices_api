const fastify = require('fastify')({ logger: true });

// Plugins (extensions de Fastify)
fastify.register(require('@fastify/cors'), { origin: '*' }); // Autorise les requêtes cross-origin
fastify.register(require('@fastify/swagger'), { exposeRoute: true }); // Documentation API

// Route de test
fastify.get('/', async () => ({ message: "API IoT Parkki OK !" }));


// Démarrer le serveur
const start = async () => {
  try {
    await fastify.listen({ port: 3000 });
    console.log(`API en écoute sur http://localhost:3000`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};
start();

const cameras = require('./models/camera');
// Route GET /cameras
fastify.get('/cameras', async () => {
    return cameras;
  });


// Route POST /cameras/:id/event
fastify.post('/cameras/:id/event', async (request, reply) => {
    const { id } = request.params;
    const event = request.body; // Ex: { type: "motion", timestamp: "2024-01-01T12:00:00Z" }
  
    // Trouve la caméra et met à jour son dernier événement
    const camera = cameras.find(cam => cam.id === id);
    if (!camera) {
      return reply.code(404).send({ error: "Caméra non trouvée" });
    }
  
    camera.lastEvent = event;
    return { status: "Événement reçu", event };
  });