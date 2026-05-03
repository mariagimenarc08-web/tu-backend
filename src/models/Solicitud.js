const mongoose = require('mongoose');

const solicitudSchema = new mongoose.Schema({
  cliente: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  materia: {
    type: String,
    required: [true, 'La materia es obligatoria'],
    trim: true
  },
  // Fecha solicitada para la clase
  fecha: {
    type: Date,
    required: true
  },
  // Horarios disponibles (puede seleccionar múltiples)
  horarios: [{
    horaInicio: { type: String, required: true },
    horaFin: { type: String, required: true }
  }],
  ubicacion: {
    type: String,
    required: [true, 'La ubicación es obligatoria'],
    trim: true
  },
  observaciones: {
    type: String,
    trim: true,
    default: ''
  },
  estado: {
    type: String,
    enum: ['pendiente', 'aceptado', 'rechazado'],
    default: 'pendiente'
  },
  docente: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  fechaCreacion: {
    type: Date,
    default: Date.now
  },
  fechaRespuesta: {
    type: Date
  }
});

module.exports = mongoose.model('Solicitud', solicitudSchema);
