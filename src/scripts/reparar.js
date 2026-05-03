// Script para reparar emails existentes (convertir a minúsculas)
require('dotenv').config();
const mongoose = require('mongoose');
const User = require('./models/User');

const conectarYReparar = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Conectado a MongoDB');

    // Encontrar usuarios con emails que no están en minúsculas
    const usuarios = await User.find({});
    let reparados = 0;

    for (const usuario of usuarios) {
      const emailLower = usuario.email.toLowerCase();
      if (usuario.email !== emailLower) {
        usuario.email = emailLower;
        await usuario.save();
        reparados++;
        console.log(`Reparado: ${usuario.nombre} - ${emailLower}`);
      }
    }

    // Eliminar índice unique antiguo de clases si existe
    const Clase = require('./models/Clase');
    try {
      await Clase.collection.dropIndex('docente_1_fecha_1_horaInicio_1');
      console.log('Índice unique antiguo eliminado');
    } catch (e) {
      console.log('No se encontró índice unique antiguo');
    }
    await Clase.createIndex({ docente: 1, fecha: 1, horaInicio: 1 });
    console.log('Nuevo índice creado (sin unique)');

    console.log(`\n✅ ${reparados} usuario(s) reparados`);
    process.exit(0);
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
};

conectarYReparar();
