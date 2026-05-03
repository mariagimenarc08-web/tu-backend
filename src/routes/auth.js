const express = require('express');
const router = express.Router();
const { body, param, validationResult } = require('express-validator');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const User = require('../models/User');
const { verificarToken } = require('../middleware/auth');
const upload = require('../middleware/upload');

// Helpers de validacion
const escapeHtml = (str) => {
  if (typeof str !== 'string') return str;
  return str.replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#x27;' })[m]);
};

const validatePassword = (password) => {
  if (password.length < 8) return 'Minimo 8 caracteres';
  if (!/[a-z]/.test(password)) return 'Debe incluir una letra minuscula';
  if (!/[A-Z]/.test(password)) return 'Debe incluir una letra mayuscula';
  if (!/[0-9]/.test(password)) return 'Debe incluir un numero';
  return null;
};

// Registro
router.post('/registro', [
  body('nombre')
    .trim()
    .notEmpty().withMessage('El nombre es obligatorio')
    .isLength({ max: 100 }).withMessage('Nombre demasiado largo')
    .matches(/^[a-zA-Z0-9\sáéíóúÁÉÍÓÚñÑüÜ]+$/).withMessage('El nombre solo puede contener letras, numeros y espacios'),
  body('email')
    .isEmail().withMessage('Correo invalido')
    .normalizeEmail()
    .isLength({ max: 255 }).withMessage('Email demasiado largo'),
  body('password')
    .isLength({ min: 8 }).withMessage('Minimo 8 caracteres')
    .isLength({ max: 128 }).withMessage('Contraseña demasiado larga'),
  body('rol').isIn(['cliente', 'docente']).withMessage('Rol invalido'),
  body('telefono')
    .optional({ nullable: true, checkFalsy: true })
    .isLength({ max: 20 }).withMessage('Telefono demasiado largo')
    .matches(/^[\+]?[\d\s\-\(\)]*$/).withMessage('Formato de telefono invalido')
], async (req, res) => {
  try {
    const errores = validationResult(req);
    if (!errores.isEmpty()) {
      return res.status(400).json({ errores: errores.array().map(e => e.msg) });
    }

    const { nombre, email, password, rol, telefono } = req.body;
    const emailLower = email.toLowerCase().trim();
    const nombreLimpio = escapeHtml(nombre.trim());

    // Validar fortaleza de contraseña
    const pwError = validatePassword(password);
    if (pwError) return res.status(400).json({ error: pwError });

    // Verificar no es email de desecho (disposable email check simple)
    const dominio = emailLower.split('@')[1];
    const dominiosBloqueados = ['tempmail.com', 'throwaway.email', 'guerrillamail.com', 'mailinator.com'];
    if (dominiosBloqueados.includes(dominio)) {
      return res.status(400).json({ error: 'Usa un correo electronico valido' });
    }

    const existe = await User.findOne({ email: emailLower });
    if (existe) {
      return res.status(400).json({ error: 'Este correo ya esta registrado' });
    }

    const telefonoLimpio = telefono ? escapeHtml(telefono.trim()) : undefined;

    const usuario = new User({ nombre: nombreLimpio, email: emailLower, password, rol, telefono: telefonoLimpio });
    await usuario.save();

    const token = jwt.sign(
      { id: usuario._id, email: usuario.email, rol: usuario.rol },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.status(201).json({
      mensaje: 'Registro exitoso',
      token,
      usuario: { id: usuario._id, nombre: nombreLimpio, email: emailLower, rol, telefono: telefonoLimpio, fotoPerfil: usuario.fotoPerfil, fechaCreacion: usuario.fechaCreacion }
    });
  } catch (error) {
    console.error('Error registro:', error);
    res.status(500).json({ error: 'Error al registrar usuario' });
  }
});

// Login
router.post('/login', [
  body('email').isEmail().withMessage('Correo invalido').normalizeEmail(),
  body('password').notEmpty().withMessage('La contrasena es obligatoria').isLength({ max: 128 }).withMessage('Contraseña demasiado larga')
], async (req, res) => {
  try {
    const errores = validationResult(req);
    if (!errores.isEmpty()) {
      return res.status(400).json({ errores: errores.array().map(e => e.msg) });
    }

    const { email, password } = req.body;
    const emailLower = email.toLowerCase().trim();
    const usuario = await User.findOne({ email: emailLower });

    if (!usuario) {
      return res.status(401).json({ error: 'Credenciales invalidas' });
    }

    if (usuario.bloqueado) {
      return res.status(403).json({ error: 'Tu cuenta ha sido bloqueada. Contacta al administrador.' });
    }

    // Proteccion contra fuerza bruta: max 5 intentos fallidos
    if (usuario.intentosLogin >= 5) {
      const tiempoBloqueo = 15 * 60 * 1000; // 15 minutos
      const tiempoTranscurrido = Date.now() - new Date(usuario.ultimoIntentoLogin).getTime();
      if (tiempoTranscurrido < tiempoBloqueo) {
        const minutosRestantes = Math.ceil((tiempoBloqueo - tiempoTranscurrido) / 60000);
        return res.status(429).json({ error: `Demasiados intentos. Intenta en ${minutosRestantes} minutos` });
      } else {
        // Resetear intentos despues del tiempo de bloqueo
        usuario.intentosLogin = 0;
        await usuario.save();
      }
    }

    const valida = await usuario.compararPassword(password);
    if (!valida) {
      usuario.intentosLogin = (usuario.intentosLogin || 0) + 1;
      usuario.ultimoIntentoLogin = new Date();
      await usuario.save();
      return res.status(401).json({ error: 'Credenciales invalidas' });
    }

    // Resetear intentos al login exitoso
    usuario.intentosLogin = 0;
    usuario.ultimoIntentoLogin = null;
    await usuario.save();

    const token = jwt.sign(
      { id: usuario._id, email: usuario.email, rol: usuario.rol },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      mensaje: 'Inicio de sesion exitoso',
      token,
      usuario: {
        id: usuario._id,
        nombre: usuario.nombre,
        email: usuario.email,
        rol: usuario.rol,
        telefono: usuario.telefono,
        fotoPerfil: usuario.fotoPerfil,
        fechaCreacion: usuario.fechaCreacion
      }
    });
  } catch (error) {
    console.error('Error login:', error);
    res.status(500).json({ error: 'Error al iniciar sesion' });
  }
});

// Obtener perfil
router.get('/perfil', verificarToken, async (req, res) => {
  try {
    const usuario = await User.findById(req.usuario.id).select('-password');
    if (!usuario) return res.status(404).json({ error: 'Usuario no encontrado' });
    res.json(usuario);
  } catch (error) {
    console.error('Error perfil:', error);
    res.status(500).json({ error: 'Error al obtener perfil' });
  }
});

// Actualizar perfil
router.put('/perfil', verificarToken, async (req, res) => {
  try {
    const { nombre, telefono } = req.body;
    const usuario = await User.findById(req.usuario.id);
    if (!usuario) return res.status(404).json({ error: 'Usuario no encontrado' });

    if (nombre) usuario.nombre = nombre;
    if (telefono !== undefined) usuario.telefono = telefono;
    await usuario.save();

    const data = usuario.toObject();
    delete data.password;
    res.json({ mensaje: 'Perfil actualizado', usuario: data });
  } catch (error) {
    console.error('Error actualizar perfil:', error);
    res.status(500).json({ error: 'Error al actualizar perfil' });
  }
});

// Subir foto de perfil
router.post('/perfil/foto', verificarToken, upload.single('foto'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Debe subir una imagen' });
    const usuario = await User.findById(req.usuario.id);
    if (!usuario) return res.status(404).json({ error: 'Usuario no encontrado' });
    usuario.fotoPerfil = `/uploads/${req.file.filename}`;
    await usuario.save();
    res.json({ mensaje: 'Foto actualizada', fotoPerfil: usuario.fotoPerfil });
  } catch (error) {
    console.error('Error subir foto:', error);
    res.status(500).json({ error: 'Error al subir foto' });
  }
});

// Eliminar foto de perfil
router.delete('/perfil/foto', verificarToken, async (req, res) => {
  try {
    const usuario = await User.findById(req.usuario.id);
    if (!usuario) return res.status(404).json({ error: 'Usuario no encontrado' });
    usuario.fotoPerfil = undefined;
    await usuario.save();
    res.json({ mensaje: 'Foto eliminada' });
  } catch (error) {
    console.error('Error eliminar foto:', error);
    res.status(500).json({ error: 'Error al eliminar foto' });
  }
});

// Cambiar password
router.put('/cambiar-password', verificarToken, [
  body('passwordActual').notEmpty().withMessage('La contrasena actual es obligatoria'),
  body('passwordNueva').isLength({ min: 6 }).withMessage('Minimo 6 caracteres')
], async (req, res) => {
  try {
    const errores = validationResult(req);
    if (!errores.isEmpty()) {
      return res.status(400).json({ errores: errores.array().map(e => e.msg) });
    }

    const { passwordActual, passwordNueva } = req.body;
    const usuario = await User.findById(req.usuario.id);
    if (!usuario) return res.status(404).json({ error: 'Usuario no encontrado' });

    const valida = await usuario.compararPassword(passwordActual);
    if (!valida) return res.status(401).json({ error: 'Contrasena actual incorrecta' });

    usuario.password = passwordNueva;
    await usuario.save();

    res.json({ mensaje: 'Contrasena actualizada' });
  } catch (error) {
    console.error('Error cambiar password:', error);
    res.status(500).json({ error: 'Error al cambiar contrasena' });
  }
});

// Obtener metodos de pago del docente (autenticado)
router.get('/docente/metodos-pago', verificarToken, async (req, res) => {
  try {
    const usuario = await User.findById(req.usuario.id).select('metodosPago');
    if (!usuario) return res.status(404).json({ error: 'Usuario no encontrado' });
    res.json(usuario.metodosPago || []);
  } catch (error) {
    console.error('Error obtener metodos pago:', error);
    res.status(500).json({ error: 'Error al obtener metodos de pago' });
  }
});

// Guardar metodos de pago del docente
router.put('/docente/metodos-pago', verificarToken, async (req, res) => {
  try {
    const { metodosPago } = req.body;
    const usuario = await User.findById(req.usuario.id);
    if (!usuario) return res.status(404).json({ error: 'Usuario no encontrado' });
    const validos = ['yape', 'plin', 'transferencia'];
    const filtrados = (metodosPago || []).filter(m => validos.includes(m.tipo));
    // Merge: actualizar existentes, agregar nuevos, NO eliminar los que no se tocaron
    filtrados.forEach(nuevo => {
      const existente = usuario.metodosPago.find(m => m.tipo === nuevo.tipo);
      if (existente) {
        existente.info = nuevo.info !== undefined ? nuevo.info : existente.info;
        if (nuevo.qrUrl !== undefined) existente.qrUrl = nuevo.qrUrl;
      } else {
        usuario.metodosPago.push({ tipo: nuevo.tipo, info: nuevo.info || '', qrUrl: nuevo.qrUrl || '' });
      }
    });
    await usuario.save();
    res.json({ mensaje: 'Metodos de pago actualizados', metodosPago: usuario.metodosPago });
  } catch (error) {
    console.error('Error actualizar metodos pago:', error);
    res.status(500).json({ error: 'Error al actualizar metodos de pago' });
  }
});

// Subir QR de pago
router.post('/docente/metodos-pago/qr/:tipo', verificarToken, upload.single('qr'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Debe subir una imagen (JPG, PNG o WebP)' });
    const usuario = await User.findById(req.usuario.id);
    if (!usuario) return res.status(404).json({ error: 'Usuario no encontrado' });
    const tipo = req.params.tipo;
    const validos = ['yape', 'plin', 'transferencia'];
    if (!validos.includes(tipo)) return res.status(400).json({ error: 'Tipo invalido. Use: yape, plin o transferencia' });
    let metodo = usuario.metodosPago.find(m => m.tipo === tipo);
    if (!metodo) {
      usuario.metodosPago.push({ tipo, info: '' });
      metodo = usuario.metodosPago.find(m => m.tipo === tipo);
    }
    metodo.qrUrl = `/uploads/${req.file.filename}`;
    await usuario.save();
    res.json({ mensaje: 'QR actualizado', qrUrl: metodo.qrUrl });
  } catch (error) {
    console.error('Error subir QR:', error);
    res.status(500).json({ error: 'Error al subir QR' });
  }
});

// Obtener metodos de pago de un docente (publico, para clientes)
router.get('/docente/:docenteId/metodos-pago', async (req, res) => {
  try {
    const usuario = await User.findById(req.params.docenteId).select('metodosPago');
    if (!usuario) return res.status(404).json({ error: 'Docente no encontrado' });
    const validos = ['yape', 'plin', 'transferencia'];
    const filtrados = (usuario.metodosPago || []).filter(m => validos.includes(m.tipo));
    res.json(filtrados);
  } catch (error) {
    console.error('Error obtener metodos pago publico:', error);
    res.status(500).json({ error: 'Error al obtener metodos de pago' });
  }
});

// Recuperar contrasena (enviar email con token)
router.post('/recuperar-password', [
  body('email').isEmail().withMessage('Correo invalido')
], async (req, res) => {
  try {
    const errores = validationResult(req);
    if (!errores.isEmpty()) {
      return res.status(400).json({ errores: errores.array().map(e => e.msg) });
    }

    const { email } = req.body;
    const usuario = await User.findOne({ email: email.toLowerCase().trim() });

    // Siempre respondemos 200 para no revelar si el email existe
    if (!usuario) {
      return res.json({ mensaje: 'Si el correo esta registrado, recibiras las instrucciones' });
    }

    const token = crypto.randomBytes(32).toString('hex');
    usuario.resetToken = token;
    usuario.resetTokenExpira = new Date(Date.now() + 3600000); // 1 hora
    await usuario.save();

    const link = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/reset-password/${token}`;

    // TODO: integrar servicio de email (SendGrid, Nodemailer, etc.)
    // Por ahora devolvemos el link para testing
    res.json({
      mensaje: 'Si el correo esta registrado, recibiras las instrucciones',
      link // Eliminar en produccion
    });
  } catch (error) {
    console.error('Error recuperar password:', error);
    res.status(500).json({ error: 'Error al procesar la solicitud' });
  }
});

// Resetear contrasena con token
router.post('/reset-password/:token', [
  body('password').isLength({ min: 6 }).withMessage('Minimo 6 caracteres')
], async (req, res) => {
  try {
    const errores = validationResult(req);
    if (!errores.isEmpty()) {
      return res.status(400).json({ errores: errores.array().map(e => e.msg) });
    }

    const { token } = req.params;
    const { password } = req.body;

    const usuario = await User.findOne({
      resetToken: token,
      resetTokenExpira: { $gt: Date.now() }
    });

    if (!usuario) {
      return res.status(400).json({ error: 'Token invalido o expirado' });
    }

    usuario.password = password;
    usuario.resetToken = undefined;
    usuario.resetTokenExpira = undefined;
    await usuario.save();

    res.json({ mensaje: 'Contrasena actualizada correctamente' });
  } catch (error) {
    console.error('Error resetear password:', error);
    res.status(500).json({ error: 'Error al resetear contrasena' });
  }
});

module.exports = router;
