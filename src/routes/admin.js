const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const User = require('../models/User');
const Solicitud = require('../models/Solicitud');
const Clase = require('../models/Clase');
const { verificarToken, verificarRol } = require('../middleware/auth');

// Todas las rutas requieren admin
router.use(verificarToken, verificarRol('admin'));

// ============ DASHBOARD STATS ============
router.get('/stats', async (req, res) => {
  try {
    const totalUsuarios = await User.countDocuments();
    const clientes = await User.countDocuments({ rol: 'cliente' });
    const docentes = await User.countDocuments({ rol: 'docente' });
    const admins = await User.countDocuments({ rol: 'admin' });
    const totalSolicitudes = await Solicitud.countDocuments();
    const solPendientes = await Solicitud.countDocuments({ estado: 'pendiente' });
    const solAceptadas = await Solicitud.countDocuments({ estado: 'aceptado' });
    const solRechazadas = await Solicitud.countDocuments({ estado: 'rechazado' });
    const totalClases = await Clase.countDocuments();
    const clasesConfirmadas = await Clase.countDocuments({ estado: 'confirmada' });
    const clasesCompletadas = await Clase.countDocuments({ estado: 'completada' });
    const clasesCanceladas = await Clase.countDocuments({ estado: 'cancelada' });

    const pagosPendientes = await Clase.countDocuments({ 'pago.estado': 'pendiente', 'pago.comprobanteUrl': { $exists: true } });
    const pagosAprobados = await Clase.countDocuments({ 'pago.estado': 'aprobado' });
    const pagosRechazados = await Clase.countDocuments({ 'pago.estado': 'rechazado' });

    const montoTotal = await Clase.aggregate([
      { $match: { 'pago.estado': 'aprobado', 'pago.monto': { $exists: true } } },
      { $group: { _id: null, total: { $sum: '$pago.monto' } } }
    ]);

    // Solicitudes por materia
    const porMateria = await Solicitud.aggregate([
      { $group: { _id: '$materia', count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]);

    // Solicitudes por cliente (top 10)
    const porCliente = await Solicitud.aggregate([
      { $group: { _id: '$cliente', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 10 },
      { $lookup: { from: 'users', localField: '_id', foreignField: '_id', as: 'usuario' } },
      { $project: { cliente: { $arrayElemAt: ['$usuario.nombre', 0] }, email: { $arrayElemAt: ['$usuario.email', 0] }, count: 1 } }
    ]);

    // Usuarios activos hoy (logueados en las ultimas 24h - basado en ultima actualizacion de token)
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);
    const usuariosHoy = await User.countDocuments({ fechaCreacion: { $gte: hoy } });

    res.json({
      usuarios: { total: totalUsuarios, clientes, docentes, admins, nuevosHoy: usuariosHoy },
      solicitudes: { total: totalSolicitudes, pendientes: solPendientes, aceptadas: solAceptadas, rechazadas: solRechazadas },
      clases: { total: totalClases, confirmadas: clasesConfirmadas, completadas: clasesCompletadas, canceladas: clasesCanceladas },
      pagos: { pendientes: pagosPendientes, aprobados: pagosAprobados, rechazados: pagosRechazados, montoTotal: montoTotal[0]?.total || 0 },
      porMateria,
      porCliente
    });
  } catch (error) {
    console.error('Error admin stats:', error);
    res.status(500).json({ error: 'Error al obtener estadisticas' });
  }
});

// ============ USUARIOS ============
router.get('/usuarios', async (req, res) => {
  try {
    const { rol, search } = req.query;
    const query = {};
    if (rol && rol !== 'todos') query.rol = rol;
    if (search) {
      query.$or = [
        { nombre: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } }
      ];
    }
    const usuarios = await User.find(query).select('-password').sort({ fechaCreacion: -1 });
    res.json(usuarios);
  } catch (error) {
    console.error('Error listar usuarios:', error);
    res.status(500).json({ error: 'Error al listar usuarios' });
  }
});

router.get('/usuarios/:id', async (req, res) => {
  try {
    const usuario = await User.findById(req.params.id).select('-password');
    if (!usuario) return res.status(404).json({ error: 'Usuario no encontrado' });

    const solicitudesCount = await Solicitud.countDocuments({ cliente: usuario._id });
    const clasesCount = await Clase.countDocuments({ $or: [{ cliente: usuario._id }, { docente: usuario._id }] });

    res.json({ ...usuario.toObject(), solicitudesCount, clasesCount });
  } catch (error) {
    res.status(500).json({ error: 'Error al obtener usuario' });
  }
});

router.put('/usuarios/:id', async (req, res) => {
  try {
    const { nombre, email, telefono, rol } = req.body;
    const usuario = await User.findById(req.params.id);
    if (!usuario) return res.status(404).json({ error: 'Usuario no encontrado' });

    if (nombre) usuario.nombre = nombre;
    if (email) {
      const existente = await User.findOne({ email: email.toLowerCase().trim(), _id: { $ne: usuario._id } });
      if (existente) return res.status(400).json({ error: 'Email ya en uso' });
      usuario.email = email.toLowerCase().trim();
    }
    if (telefono !== undefined) usuario.telefono = telefono;
    if (rol) usuario.rol = rol;

    await usuario.save();
    res.json({ mensaje: 'Usuario actualizado', usuario: { id: usuario._id, nombre: usuario.nombre, email: usuario.email, rol: usuario.rol, telefono: usuario.telefono } });
  } catch (error) {
    res.status(500).json({ error: 'Error al actualizar usuario' });
  }
});

router.patch('/usuarios/:id/bloquear', async (req, res) => {
  try {
    const { bloqueado } = req.body;
    const usuario = await User.findById(req.params.id);
    if (!usuario) return res.status(404).json({ error: 'Usuario no encontrado' });
    if (usuario.rol === 'admin') return res.status(400).json({ error: 'No se puede bloquear un admin' });

    usuario.bloqueado = bloqueado;
    await usuario.save();
    res.json({ mensaje: bloqueado ? 'Usuario bloqueado' : 'Usuario desbloqueado' });
  } catch (error) {
    res.status(500).json({ error: 'Error al actualizar usuario' });
  }
});

router.patch('/usuarios/:id/reset-password', async (req, res) => {
  try {
    const { nuevaPassword } = req.body;
    if (!nuevaPassword || nuevaPassword.length < 6) {
      return res.status(400).json({ error: 'Minimo 6 caracteres' });
    }
    const usuario = await User.findById(req.params.id);
    if (!usuario) return res.status(404).json({ error: 'Usuario no encontrado' });
    if (usuario.rol === 'admin') return res.status(400).json({ error: 'No se puede cambiar contraseña de un admin' });

    usuario.password = nuevaPassword;
    await usuario.save();
    res.json({ mensaje: 'Contraseña actualizada' });
  } catch (error) {
    res.status(500).json({ error: 'Error al cambiar contraseña' });
  }
});

router.delete('/usuarios/:id', async (req, res) => {
  try {
    const usuario = await User.findById(req.params.id);
    if (!usuario) return res.status(404).json({ error: 'Usuario no encontrado' });
    if (usuario.rol === 'admin') return res.status(400).json({ error: 'No se puede eliminar un admin' });

    await Solicitud.deleteMany({ cliente: usuario._id });
    await Clase.deleteMany({ $or: [{ cliente: usuario._id }, { docente: usuario._id }] });
    await usuario.deleteOne();
    res.json({ mensaje: 'Usuario eliminado' });
  } catch (error) {
    res.status(500).json({ error: 'Error al eliminar usuario' });
  }
});

// ============ SOLICITUDES ============
router.get('/solicitudes', async (req, res) => {
  try {
    const { estado } = req.query;
    const query = {};
    if (estado && estado !== 'todas') query.estado = estado;

    const solicitudes = await Solicitud.find(query)
      .populate('cliente', 'nombre email telefono')
      .populate('docente', 'nombre email')
      .sort({ fechaCreacion: -1 });
    res.json(solicitudes);
  } catch (error) {
    res.status(500).json({ error: 'Error al obtener solicitudes' });
  }
});

router.put('/solicitudes/:id', async (req, res) => {
  try {
    const { estado } = req.body;
    if (!['pendiente', 'aceptado', 'rechazado'].includes(estado)) {
      return res.status(400).json({ error: 'Estado invalido' });
    }
    const solicitud = await Solicitud.findById(req.params.id);
    if (!solicitud) return res.status(404).json({ error: 'Solicitud no encontrada' });
    solicitud.estado = estado;
    solicitud.fechaRespuesta = new Date();
    await solicitud.save();
    res.json({ mensaje: 'Solicitud actualizada', solicitud });
  } catch (error) {
    res.status(500).json({ error: 'Error al actualizar solicitud' });
  }
});

router.delete('/solicitudes/:id', async (req, res) => {
  try {
    const solicitud = await Solicitud.findByIdAndDelete(req.params.id);
    if (!solicitud) return res.status(404).json({ error: 'Solicitud no encontrada' });
    res.json({ mensaje: 'Solicitud eliminada' });
  } catch (error) {
    res.status(500).json({ error: 'Error al eliminar solicitud' });
  }
});

// ============ CLASES ============
router.get('/clases', async (req, res) => {
  try {
    const { estado } = req.query;
    const query = {};
    if (estado && estado !== 'todas') query.estado = estado;

    const clases = await Clase.find(query)
      .populate('cliente', 'nombre email telefono')
      .populate('docente', 'nombre email')
      .sort({ fecha: -1 });
    res.json(clases);
  } catch (error) {
    res.status(500).json({ error: 'Error al obtener clases' });
  }
});

router.put('/clases/:id', async (req, res) => {
  try {
    const { estado } = req.body;
    if (!['confirmada', 'cancelada', 'completada'].includes(estado)) {
      return res.status(400).json({ error: 'Estado invalido' });
    }
    const clase = await Clase.findById(req.params.id);
    if (!clase) return res.status(404).json({ error: 'Clase no encontrada' });
    clase.estado = estado;
    await clase.save();
    res.json({ mensaje: 'Clase actualizada', clase });
  } catch (error) {
    res.status(500).json({ error: 'Error al actualizar clase' });
  }
});

router.delete('/clases/:id', async (req, res) => {
  try {
    const clase = await Clase.findByIdAndDelete(req.params.id);
    if (!clase) return res.status(404).json({ error: 'Clase no encontrada' });
    res.json({ mensaje: 'Clase eliminada' });
  } catch (error) {
    res.status(500).json({ error: 'Error al eliminar clase' });
  }
});

// ============ PAGOS ============
router.get('/pagos', async (req, res) => {
  try {
    const { estado } = req.query;
    const query = { 'pago.comprobanteUrl': { $exists: true } };
    if (estado && estado !== 'todos') query['pago.estado'] = estado;

    const pagos = await Clase.find(query)
      .populate('cliente', 'nombre email')
      .populate('docente', 'nombre email')
      .sort({ 'pago.fechaPago': -1 });
    res.json(pagos);
  } catch (error) {
    res.status(500).json({ error: 'Error al obtener pagos' });
  }
});

// ============ ARCHIVOS ============
router.get('/archivos', async (req, res) => {
  try {
    const uploadsDir = path.join(__dirname, '../../uploads');
    if (!fs.existsSync(uploadsDir)) {
      return res.json({ archivos: [], total: 0, size: 0 });
    }

    const files = fs.readdirSync(uploadsDir).map(file => {
      const stat = fs.statSync(path.join(uploadsDir, file));
      const tipo = file.startsWith('pago_') ? 'comprobante' : file.startsWith('perfil_') ? 'perfil' : file.startsWith('qr_') ? 'qr' : 'otro';
      return {
        nombre: file,
        url: `/uploads/${file}`,
        tamano: stat.size,
        tipo,
        fecha: stat.mtime
      };
    }).sort((a, b) => b.fecha - a.fecha);

    const totalSize = files.reduce((sum, f) => sum + f.tamano, 0);

    res.json({
      archivos: files,
      total: files.length,
      sizeTotal: totalSize
    });
  } catch (error) {
    res.status(500).json({ error: 'Error al listar archivos' });
  }
});

router.delete('/archivos/:nombre', async (req, res) => {
  try {
    const filePath = path.join(__dirname, '../../uploads', req.params.nombre);
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Archivo no encontrado' });
    fs.unlinkSync(filePath);
    res.json({ mensaje: 'Archivo eliminado' });
  } catch (error) {
    res.status(500).json({ error: 'Error al eliminar archivo' });
  }
});

// ============ ACTIVIDAD RECIENTE ============
router.get('/actividad', async (req, res) => {
  try {
    const [solicitudesRecientes, clasesRecientes, pagosRecientes, usuariosRecientes] = await Promise.all([
      Solicitud.find().populate('cliente', 'nombre').sort({ fechaCreacion: -1 }).limit(5).select('estado materia fechaCreacion'),
      Clase.find().populate('cliente', 'nombre').populate('docente', 'nombre').sort({ fechaCreacion: -1 }).limit(5).select('estado materia fechaCreacion'),
      Clase.find({ 'pago.comprobanteUrl': { $exists: true } }).populate('cliente', 'nombre').sort({ 'pago.fechaPago': -1 }).limit(5).select('pago.estado pago.monto pago.fechaPago'),
      User.find().sort({ fechaCreacion: -1 }).limit(5).select('nombre email rol fechaCreacion')
    ]);

    const actividades = [
      ...solicitudesRecientes.map(s => ({
        tipo: 'solicitud',
        accion: `Solicitud de ${s.materia}`,
        usuario: s.cliente?.nombre || 'Desconocido',
        estado: s.estado,
        fecha: s.fechaCreacion
      })),
      ...clasesRecientes.map(c => ({
        tipo: 'clase',
        accion: `Clase de ${c.materia}`,
        usuario: `${c.cliente?.nombre || '?'} → ${c.docente?.nombre || '?'}`,
        estado: c.estado,
        fecha: c.fechaCreacion
      })),
      ...pagosRecientes.map(p => ({
        tipo: 'pago',
        accion: `Pago de S/ ${p.pago?.monto || 0}`,
        usuario: p.cliente?.nombre || 'Desconocido',
        estado: p.pago?.estado || 'pendiente',
        fecha: p.pago?.fechaPago
      })),
      ...usuariosRecientes.map(u => ({
        tipo: 'usuario',
        accion: `${u.rol === 'cliente' ? 'Cliente' : 'Docente'} registrado`,
        usuario: u.nombre,
        estado: u.rol,
        fecha: u.fechaCreacion
      }))
    ].sort((a, b) => new Date(b.fecha) - new Date(a.fecha)).slice(0, 15);

    res.json(actividades);
  } catch (error) {
    res.status(500).json({ error: 'Error al obtener actividad' });
  }
});

module.exports = router;
