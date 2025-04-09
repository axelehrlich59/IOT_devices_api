import { useEffect, useState } from 'react';
import { Container, Grid, Card, CardContent, Typography, CardHeader, Divider, Box } from '@mui/material';

function App() {
  const [cameras, setCameras] = useState([]);
  const [socket, setSocket] = useState(null); // WebSocket state

  useEffect(() => {
    // 1. Récupérer les caméras depuis l'API
    fetch('http://localhost:3000/cameras') // adapte le port si besoin
      .then(res => res.json())
      .then(data => setCameras(data));

    // 2. Initialiser la connexion WebSocket pour les événements en temps réel
    const ws = new WebSocket('ws://localhost:3000/events'); // Assurez-vous que cette route WebSocket est bien configurée dans le backend

    ws.onopen = () => {
      console.log('WebSocket connecté');
    };

    ws.onmessage = (event) => {
      const newEvent = JSON.parse(event.data);
      // Mettre à jour les caméras avec le nouvel événement
      setCameras(prevCameras => prevCameras.map(cam => 
        cam.id === newEvent.camera_id
          ? { ...cam, last_event: { ...newEvent } }
          : cam
      ));
    };

    setSocket(ws);

    return () => {
      ws.close(); // Fermer la connexion WebSocket à la déconnexion du composant
    };
  }, []);

  return (
    <Container maxWidth="lg" sx={{ paddingTop: 4 }}>
      <Typography variant="h4" gutterBottom>
        Surveillance des caméras
      </Typography>
      <Grid container spacing={4}>
        {cameras.map(cam => (
          <Grid item xs={12} md={6} key={cam.id}>
            <Card>
              <CardHeader title={cam.name} subheader={`Status: ${cam.status}`} />
              <Divider />
              <CardContent>
                {cam.last_event ? (
                  <Box sx={{ backgroundColor: '#f5f5f5', padding: 2, borderRadius: 1 }}>
                    <Typography variant="body1"><strong>Événement :</strong> {cam.last_event.type}</Typography>
                    <Typography variant="body1"><strong>Confiance :</strong> {Math.round(cam.last_event.confidence * 100)}%</Typography>
                    <Typography variant="body1"><strong>Résumé :</strong> {cam.last_event.summary}</Typography>
                  </Box>
                ) : (
                  <Typography variant="body2" color="textSecondary" sx={{ marginTop: 2 }}>
                    Aucun événement
                  </Typography>
                )}
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>
    </Container>
  );
}

export default App;
