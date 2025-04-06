// Une caméra "factice" pour comprendre la structure
module.exports = [
    {
      id: "cam1",
      name: "Caméra Entrée",
      location: { lat: 48.8566, lng: 2.3522 }, // Paris
      status: { online: true, lastPing: new Date() },
      streamUrl: "rtsp://simulated.stream/cam1"
    }
  ];