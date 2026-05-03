const mongoose = require('mongoose');

const claseSchema = new mongoose.Schema({
  solicitud: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Solicitud',
    required: true
  },
  cliente: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  docente: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  materia: {
    type: String,
    required: true,
    trim: true
  },
  fecha: {
    type: Date,
    required: true
  },
  horaInicio: {
    type: String,
    required: true
  },
  horaFin: {
    type: String,
    required: true
  },
  ubicacion: {
    type: String,
    required: true,
    trim: true
  },
  observaciones: {
    type: String,
    trim: true,
    default: ''
  },
  estado: {
    type: String,
    enum: ['confirmada', 'cancelada', 'completada'],
    default: 'confirmada'
  },
  // Sistema de pagos
  pago: {
    comprobanteUrl: String,
    metodoPago: {
      type: String,
      enum: ['yape', 'plin', 'efectivo', 'transferencia'],
      default: 'efectivo'
    },
    monto: Number,
    estado: {
      type: String,
      enum: ['pendiente', 'aprobado', 'rechazado'],
      default: 'pendiente'
    },
    fechaPago: Date,
    fechaRevision: Date,
    notaRevision: String
  },
  fechaCreacion: {
    type: Date,
    default: Date.now
  }
});

claseSchema.index({ docente: 1, fecha: 1, horaInicio: 1 });
claseSchema.index({ cliente: 1, fecha: 1 });
claseSchema.index({ 'pago.estado': 1 });

module.exports = mongoose.model('Clase', claseSchema);
