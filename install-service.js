const Service = require('node-windows').Service;

const svc = new Service({
  name: 'Monitor_ControlId',
  description: 'Serviço que gerencia os faciais da Control ID.',
  script: 'D:\\Desenvolvimento\\Monitor_autostart\\index.js',
  startType: 'auto',
  nodeOptions: [
    '--harmony',
    '--max_old_space_size=4096'
  ],
  env: [
    {
      name: "NODE_ENV",
      value: "production"
    }
  ]
});

svc.on('install', () => {
  console.log('Serviço instalado com sucesso!');
  svc.start();
});

svc.on('alreadyinstalled', () => {
  console.log('Serviço já está instalado.');
});

svc.install();
