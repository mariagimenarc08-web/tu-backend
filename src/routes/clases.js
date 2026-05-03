const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const Clase = require('../models/Clase');
const Solicitud = require('../models/Solicitud');
const { verificarToken } = require('../middleware/auth');

// Mis clases
router.get('/mis-clases', verificarToken, async (req, res) => {
  try {
    const query = req.usuario.rol === 'cliente'
      ? { cliente: req.usuario.id }
      : { docente: req.usuario.id };

    const clases = await Clase.find(query)
      .populate(req.usuario.rol === 'cliente' ? 'docente' : 'cliente', req.usuario.rol === 'cliente' ? 'nombre email' : 'nombre email telefono')
      .sort({ fecha: 1 });

    res.json(clases);
  } catch (error) {
    console.error('Error al obtener clases:', error);
    res.status(500).json({ error: 'Error al obtener clases' });
  }
});

// Detalle de clase
router.get('/:id', verificarToken, async (req, res) => {
  try {
    const clase = await Clase.findById(req.params.id)
      .populate('cliente', 'nombre email telefono')
      .populate('docente', req.usuario.rol === 'cliente' ? 'nombre email' : 'nombre email telefono');

    if (!clase) return res.status(404).json({ error: 'Clase no encontrada' });

    res.json(clase);
  } catch (error) {
    console.error('Error al obtener clase:', error);
    res.status(500).json({ error: 'Error al obtener clase' });
  }
});

// Cancelar clase
router.patch('/:id/cancelar', verificarToken, async (req, res) => {
  try {
    const clase = await Clase.findById(req.params.id);
    if (!clase) return res.status(404).json({ error: 'Clase no encontrada' });

    const esParticipante =
      clase.cliente.toString() === req.usuario.id ||
      clase.docente.toString() === req.usuario.id;

    if (!esParticipante) {
      return res.status(403).json({ error: 'Sin permisos' });
    }

    clase.estado = 'cancelada';
    await clase.save();
    await Solicitud.findByIdAndUpdate(clase.solicitud, { estado: 'rechazado' });

    res.json({ mensaje: 'Clase cancelada', clase });
  } catch (error) {
    console.error('Error al cancelar:', error);
    res.status(500).json({ error: 'Error al cancelar clase' });
  }
});

// Completar clase
router.patch('/:id/completar', verificarToken, async (req, res) => {
  try {
    const clase = await Clase.findById(req.params.id);
    if (!clase) return res.status(404).json({ error: 'Clase no encontrada' });

    if (clase.docente.toString() !== req.usuario.id) {
      return res.status(403).json({ error: 'Solo el docente puede completar' });
    }

    clase.estado = 'completada';
    await clase.save();

    res.json({ mensaje: 'Clase completada', clase });
  } catch (error) {
    console.error('Error al completar:', error);
    res.status(500).json({ error: 'Error al completar clase' });
  }
});

module.exports = router;
