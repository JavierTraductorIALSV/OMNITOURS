export function register() {
  if (process.env.NODE_ENV === 'production' && 'serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      const swUrl = `${process.env.PUBLIC_URL}/service-worker.js`;
      navigator.serviceWorker.register(swUrl).then(registration => {
        console.log('Service Worker registrado', registration);
      }).catch(error => {
        console.log('Error al registrar SW:', error);
      });
    });
  }
}