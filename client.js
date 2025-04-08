const WebSocket = require('ws');

// Se connecter au serveur WebSocket sur le port 4000
const ws = new WebSocket('ws://localhost:4000/ws', {
  perMessageDeflate: false, // On désactive la compression du côté client également
});

ws.on('open', () => {
  console.log('✅ Connexion WebSocket établie avec le serveur');
  // Envoi d'un message au serveur
  const message = { message: '🔔 Déclenchement d\'alerte !' };
  ws.send(JSON.stringify(message));
});

ws.on('message', (data) => {
  try {
    const response = JSON.parse(data);
    console.log('📩 Message reçu du serveur:', response.message);
  } catch (e) {
    console.log('📩 Message reçu (non parsable) du serveur:', data);
  }
});

ws.on('close', () => {
  console.log('❌ Connexion WebSocket fermée');
});

ws.on('error', (error) => {
  console.error('❌ Erreur WebSocket:', error);
});
