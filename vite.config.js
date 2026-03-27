export default {
  server: {
    allowedHosts: ['cf-provider-agnostic-fe-components-pres.ngrok.app'],
    proxy: {
      '/api': 'http://localhost:3001',
    },
  },
};
