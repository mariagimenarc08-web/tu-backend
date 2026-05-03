const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const Clase = require('../models/Clase');
const Solicitud = require('../models/Solicitud');
const { verificarToken, verificarRol } = require('../middleware/auth');

const horarioBloqueadoSchema = new mongoose.Schema({
  docente: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  fecha: { type: Date, required: true },
  horaInicio: { type: String, required: true },
  horaFin: { type: String, required: true },
  motivo: { type: String, default: 'No disponible' }
});
const HorarioBloqueado = mongoose.models.HorarioBloqueado || mongoose.model('HorarioBloqueado', horarioBloqueadoSchema);

// Eventos del calendario
router.get('/eventos', verificarToken, async (req, res) => {
  try {
    const { inicio, fin } = req.query;

    const queryClases = req.usuario.rol === 'docente'
      ? { docente: req.usuario.id, estado: 'confirmada' }
      : { $or: [{ docente: req.usuario.id }, { cliente: req.usuario.id }], estado: 'confirmada' };

    const clases = await Clase.find({
      ...queryClases,
      fecha: { $gte: new Date(inicio), $lte: new Date(fin) }
    }).populate('cliente', 'nombre email telefono').populate('docente', 'nombre email');

    const querySolicitudes = req.usuario.rol === 'docente'
      ? { estado: 'pendiente' }
      : { cliente: req.usuario.id, estado: 'pendiente' };

    const solicitudes = await Solicitud.find({
      ...querySolicitudes,
      fecha: { $gte: new Date(inicio), $lte: new Date(fin) }
    }).populate('cliente', 'nombre');

    const bloqueados = await HorarioBloqueado.find({
      docente: req.usuario.id,
      fecha: { $gte: new Date(inicio), $lte: new Date(fin) }
    });

    const eventos = [
      ...clases.map(c => ({
        id: `clase_${c._id}`,
        title: `Clase: ${c.materia}`,
        start: `${c.fecha.toISOString().split('T')[0]}T${c.horaInicio}`,
        end: `${c.fecha.toISOString().split('T')[0]}T${c.horaFin}`,
        tipo: 'ocupado',
        claseId: c._id,
        ubicacion: c.ubicacion,
        extendProps: {
          cliente: c.cliente?.nombre || 'Cliente',
          clienteTelefono: c.cliente?.telefono || '',
          materia: c.materia,
          observaciones: c.observaciones
        }
      })),
      ...solicitudes.flatMap(s => s.horarios.map((h, i) => ({
        id: `sol_${s._id}_${i}`,
        title: `Pendiente: ${s.materia}`,
        start: `${s.fecha.toISOString().split('T')[0]}T${h.horaInicio}`,
        end: `${s.fecha.toISOString().split('T')[0]}T${h.horaFin}`,
        tipo: 'pendiente',
        solicitudId: s._id,
        ubicacion: s.ubicacion,
        extendProps: {
          cliente: s.cliente?.nombre || 'Cliente',
          materia: s.materia,
          observaciones: s.observaciones,
          solicitudId: s._id.toString()
        }
      }))),
      ...bloqueados.map(b => ({
        id: `block_${b._id}`,
        title: 'No disponible',
        start: `${b.fecha.toISOString().split('T')[0]}T${b.horaInicio}`,
        end: `${b.fecha.toISOString().split('T')[0]}T${b.horaFin}`,
        tipo: 'bloqueado',
        bloqueadoId: b._id,
        display: 'background'
      }))
    ];

    res.json(eventos);
  } catch (error) {
    console.error('Error eventos:', error);
    res.status(500).json({ error: 'Error al obtener eventos' });
  }
});

// Bloquear horario
router.post('/bloquear', verificarToken, verificarRol('docente'), async (req, res) => {
  try {
    const { fecha, horaInicio, horaFin, motivo } = req.body;
    if (!fecha || !horaInicio || !horaFin) {
      return res.status(400).json({ error: 'Fecha, hora inicio y hora fin obligatorios' });
    }

    const conflicto = await Clase.findOne({
      docente: req.usuario.id,
      fecha: new Date(fecha),
      horaInicio
    });

    if (conflicto) {
      return res.status(409).json({ error: 'No puedes bloquear un horario con clase confirmada' });
    }

    const bloqueado = new HorarioBloqueado({
      docente: req.usuario.id,
      fecha: new Date(fecha),
      horaInicio,
      horaFin,
      motivo: motivo || 'No disponible'
    });
    await bloqueado.save();
    res.status(201).json({ mensaje: 'Horario bloqueado', bloqueado });
  } catch (error) {
    console.error('Error bloquear:', error);
    res.status(500).json({ error: 'Error al bloquear horario' });
  }
});

// Desbloquear
router.delete('/bloquear/:id', verificarToken, verificarRol('docente'), async (req, res) => {
  try {
    const resultado = await HorarioBloqueado.findOneAndDelete({
      _id: req.params.id,
      docente: req.usuario.id
    });
    if (!resultado) return res.status(404).json({ error: 'No encontrado' });
    res.json({ mensaje: 'Horario desbloqueado' });
  } catch (error) {
    console.error('Error desbloquear:', error);
    res.status(500).json({ error: 'Error al desbloquear' });
  }
});

module.exports = router;
