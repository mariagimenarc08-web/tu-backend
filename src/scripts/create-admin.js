const mongoose = require('mongoose');
const User = require('../models/User');

async function createAdmin() {
  await mongoose.connect('mongodb://localhost:27017/clase_domicilio');

  const exists = await User.findOne({ email: 'admin@missgimena.com' });
  if (exists) {
    console.log('Admin ya existe:', exists.email);
    process.exit(0);
  }

  const admin = new User({
    nombre: 'Administrador',
    email: 'admin@missgimena.com',
    password: 'admin123',
    rol: 'admin',
    telefono: ''
  });

  await admin.save();
  console.log('Admin creado exitosamente');
  console.log('Email: admin@missgimena.com');
  console.log('Password: admin123');
  process.exit(0);
}

createAdmin().catch(err => {
  console.error(err);
  process.exit(1);
});
