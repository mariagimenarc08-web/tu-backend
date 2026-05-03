const express = require('express');
const router = express.Router();
const { body } = require('express-validator');
const Clase = require('../models/Clase');
const { verificarToken, verificarRol } = require('../middleware/auth');
const upload = require('../middleware/upload');

// Subir comprobante de pago (solo cliente)
router.post('/subir/:claseId', verificarToken, verificarRol('cliente'), upload.single('comprobante'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Debe subir una imagen del comprobante' });
    }

    const clase = await Clase.findById(req.params.claseId);
    if (!clase) {
      return res.status(404).json({ error: 'Clase no encontrada' });
    }

    // Verificar que el usuario sea el cliente de la clase
    if (clase.cliente.toString() !== req.usuario.id) {
      return res.status(403).json({ error: 'No tienes permisos para esta clase' });
    }

    const { metodoPago, monto } = req.body;

    if (!metodoPago || !monto) {
      return res.status(400).json({ error: 'Metodo de pago y monto son obligatorios' });
    }

    const urlComprobante = `/uploads/${req.file.filename}`;

    clase.pago = {
      comprobanteUrl: urlComprobante,
      metodoPago,
      monto: parseFloat(monto),
      estado: 'pendiente',
      fechaPago: new Date()
    };

    await clase.save();
    res.json({ mensaje: 'Comprobante subido correctamente', clase });
  } catch (error) {
    console.error('Error al subir comprobante:', error);
    res.status(500).json({ error: 'Error al subir comprobante' });
  }
});

// Revisar pago (solo docente)
router.post('/revisar/:claseId', verificarToken, verificarRol('docente'), [
  body('estado').isIn(['aprobado', 'rechazado']).withMessage('Estado debe ser aprobado o rechazado')
], async (req, res) => {
  try {
    const { estado, notaRevision } = req.body;

    const clase = await Clase.findById(req.params.claseId);
    if (!clase) {
      return res.status(404).json({ error: 'Clase no encontrada' });
    }

    // Verificar que el usuario sea el docente de la clase
    if (clase.docente.toString() !== req.usuario.id) {
      return res.status(403).json({ error: 'No tienes permisos para revisar este pago' });
    }

    if (!clase.pago || clase.pago.estado !== 'pendiente') {
      return res.status(400).json({ error: 'El pago no esta pendiente de revision' });
    }

    clase.pago.estado = estado;
    clase.pago.fechaRevision = new Date();
    clase.pago.notaRevision = notaRevision || '';
    await clase.save();

    const mensaje = estado === 'aprobado' ? 'Pago aprobado correctamente' : 'Pago rechazado';
    res.json({ mensaje, clase });
  } catch (error) {
    console.error('Error al revisar pago:', error);
    res.status(500).json({ error: 'Error al revisar pago' });
  }
});

// Ver pagos pendientes (solo docente)
router.get('/pendientes', verificarToken, verificarRol('docente'), async (req, res) => {
  try {
    const pagos = await Clase.find({
      docente: req.usuario.id,
      'pago.estado': 'pendiente',
      'pago.comprobanteUrl': { $exists: true }
    })
      .populate('cliente', 'nombre email telefono')
      .sort({ 'pago.fechaPago': -1 });

    res.json(pagos);
  } catch (error) {
    console.error('Error al obtener pagos pendientes:', error);
    res.status(500).json({ error: 'Error al obtener pagos pendientes' });
  }
});

// Ver historial de pagos del usuario
router.get('/historial', verificarToken, async (req, res) => {
  try {
    const query = req.usuario.rol === 'cliente'
      ? { cliente: req.usuario.id, 'pago.comprobanteUrl': { $exists: true } }
      : { docente: req.usuario.id, 'pago.comprobanteUrl': { $exists: true } };

    const pagos = await Clase.find(query)
      .populate(req.usuario.rol === 'cliente' ? 'docente' : 'cliente', req.usuario.rol === 'cliente' ? 'nombre email' : 'nombre email telefono')
      .sort({ 'pago.fechaPago': -1 });

    res.json(pagos);
  } catch (error) {
    console.error('Error al obtener historial de pagos:', error);
    res.status(500).json({ error: 'Error al obtener historial' });
  }
});

module.exports = router;
