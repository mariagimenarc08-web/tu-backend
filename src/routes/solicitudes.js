const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const Solicitud = require('../models/Solicitud');
const Clase = require('../models/Clase');
const User = require('../models/User');
const { verificarToken, verificarRol } = require('../middleware/auth');

// Crear solicitud (solo cliente)
router.post('/', verificarToken, verificarRol('cliente'), [
  body('materia').trim().notEmpty().withMessage('La materia es obligatoria'),
  body('fecha').notEmpty().withMessage('La fecha es obligatoria'),
  body('horarios').isArray({ min: 1 }).withMessage('Selecciona al menos un horario'),
  body('ubicacion').trim().notEmpty().withMessage('La ubicacion es obligatoria')
], async (req, res) => {
  try {
    const errores = validationResult(req);
    if (!errores.isEmpty()) {
      return res.status(400).json({ errores: errores.array().map(e => e.msg) });
    }

    const { materia, fecha, horarios, ubicacion, observaciones } = req.body;

    const [year, month, day] = fecha.split('-').map(Number);
    const fechaLocal = new Date(year, month - 1, day);

    const solicitud = new Solicitud({
      cliente: req.usuario.id,
      materia,
      fecha: fechaLocal,
      horarios,
      ubicacion,
      observaciones: observaciones || ''
    });

    await solicitud.save();
    res.status(201).json({ mensaje: 'Solicitud creada exitosamente', solicitud });
  } catch (error) {
    console.error('Error al crear solicitud:', error);
    res.status(500).json({ error: 'Error al crear solicitud' });
  }
});

// Mis solicitudes (cliente)
router.get('/mis-solicitudes', verificarToken, verificarRol('cliente'), async (req, res) => {
  try {
    const solicitudes = await Solicitud.find({ cliente: req.usuario.id })
      .populate('docente', 'nombre email')
      .sort({ fechaCreacion: -1 });
    res.json(solicitudes);
  } catch (error) {
    console.error('Error al obtener solicitudes:', error);
    res.status(500).json({ error: 'Error al obtener solicitudes' });
  }
});

// Todas las solicitudes (docente)
router.get('/', verificarToken, verificarRol('docente'), async (req, res) => {
  try {
    const solicitudes = await Solicitud.find()
      .populate('cliente', 'nombre email telefono')
      .sort({ fechaCreacion: -1 });
    res.json(solicitudes);
  } catch (error) {
    console.error('Error al obtener solicitudes:', error);
    res.status(500).json({ error: 'Error al obtener solicitudes' });
  }
});

// Aceptar solicitud (docente)
router.post('/:id/aceptar', verificarToken, verificarRol('docente'), async (req, res) => {
  try {
    const { id } = req.params;
    const { horarioSeleccionado } = req.body;

    const solicitud = await Solicitud.findById(id);
    if (!solicitud) {
      return res.status(404).json({ error: 'Solicitud no encontrada' });
    }

    if (solicitud.estado !== 'pendiente') {
      return res.status(400).json({ error: 'La solicitud ya fue respondida' });
    }

    const horario = horarioSeleccionado || solicitud.horarios[0];
    if (!horario || !horario.horaInicio || !horario.horaFin) {
      return res.status(400).json({ error: 'No se pudo determinar el horario' });
    }

    // Verificar doble reserva
    const fechaClase = new Date(solicitud.fecha);
    fechaClase.setHours(0, 0, 0, 0);

    const conflicto = await Clase.findOne({
      docente: req.usuario.id,
      fecha: fechaClase,
      horaInicio: horario.horaInicio
    });

    if (conflicto) {
      return res.status(409).json({ error: 'Conflicto de horario: ya tienes una clase en ese horario' });
    }

    // Actualizar solicitud
    solicitud.estado = 'aceptado';
    solicitud.docente = req.usuario.id;
    solicitud.fechaRespuesta = new Date();
    await solicitud.save();

    // Crear clase automaticamente
    const clase = new Clase({
      solicitud: solicitud._id,
      cliente: solicitud.cliente,
      docente: req.usuario.id,
      materia: solicitud.materia,
      fecha: fechaClase,
      horaInicio: horario.horaInicio,
      horaFin: horario.horaFin,
      ubicacion: solicitud.ubicacion,
      observaciones: solicitud.observaciones
    });
    await clase.save();

    res.json({
      mensaje: 'Solicitud aceptada y clase creada',
      solicitud,
      clase
    });
  } catch (error) {
    console.error('Error al aceptar solicitud:', error);
    res.status(500).json({ error: 'Error al aceptar solicitud' });
  }
});

// Rechazar solicitud (docente)
router.post('/:id/rechazar', verificarToken, verificarRol('docente'), async (req, res) => {
  try {
    const { id } = req.params;
    const solicitud = await Solicitud.findById(id);
    if (!solicitud) {
      return res.status(404).json({ error: 'Solicitud no encontrada' });
    }

    if (solicitud.estado !== 'pendiente') {
      return res.status(400).json({ error: 'La solicitud ya fue respondida' });
    }

    solicitud.estado = 'rechazado';
    solicitud.fechaRespuesta = new Date();
    await solicitud.save();

    res.json({ mensaje: 'Solicitud rechazada', solicitud });
  } catch (error) {
    console.error('Error al rechazar:', error);
    res.status(500).json({ error: 'Error al rechazar solicitud' });
  }
});

// Verificar horarios disponibles para una fecha (al menos un docente libre)
router.post('/horarios-disponibles', verificarToken, async (req, res) => {
  try {
    const { fecha } = req.body;
    if (!fecha) return res.status(400).json({ error: 'Fecha es obligatoria' });

    const docentes = await User.find({ rol: 'docente' }).select('_id');
    const totalDocentes = docentes.length;

    if (totalDocentes === 0) {
      return res.json({ horarios: [], totalDocentes: 0 });
    }

    const [year, month, day] = fecha.split('-').map(Number);
    const fechaLocal = new Date(year, month - 1, day);

    const HORARIOS = [
      { horaInicio: '08:00', horaFin: '09:00' },
      { horaInicio: '09:00', horaFin: '10:00' },
      { horaInicio: '10:00', horaFin: '11:00' },
      { horaInicio: '11:00', horaFin: '12:00' },
      { horaInicio: '14:00', horaFin: '15:00' },
      { horaInicio: '15:00', horaFin: '16:00' },
      { horaInicio: '16:00', horaFin: '17:00' },
      { horaInicio: '17:00', horaFin: '18:00' },
      { horaInicio: '18:00', horaFin: '19:00' },
      { horaInicio: '19:00', horaFin: '20:00' }
    ];

    const clasesEseDia = await Clase.find({
      fecha: fechaLocal,
      estado: { $in: ['confirmada'] },
      docente: { $in: docentes.map(d => d._id) }
    });

    const horariosDisponibles = HORARIOS.map(h => {
      const docentesOcupados = clasesEseDia.filter(c =>
        c.horaInicio === h.horaInicio && c.estado === 'confirmada'
      ).length;
      const disponibles = totalDocentes - docentesOcupados;
      return {
        ...h,
        disponible: disponibles > 0,
        docentesOcupados,
        docentesDisponibles: disponibles,
        totalDocentes
      };
    });

    res.json({ horarios: horariosDisponibles, totalDocentes });
  } catch (error) {
    console.error('Error horarios disponibles:', error);
    res.status(500).json({ error: 'Error al verificar horarios' });
  }
});

module.exports = router;
